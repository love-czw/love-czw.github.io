import { createBattleMotion } from "./duel.js?v=rooms-1";
import { initRoom, orientMatch } from "./room.js?v=rooms-live-1";

const onlineMode = new URLSearchParams(location.search).get("mode") === "pvp";
const computerName = onlineMode ? "对手" : document.getElementById("computer-title").textContent;

const cards = [
  { name: "普攻", cost: 1, art: "normal-attack.webp", tone: "ember",
    rules: "造成 4 点伤害。蓄力后造成 9 点伤害。",
    detail: (fighter) => fighter.charged ? "伤害 9" : "伤害 4" },
  { name: "格挡", cost: 2, art: "block.webp", tone: "iron",
    rules: "亮牌时生效，挡住对手本轮的全部伤害和破盾。",
    detail: () => "格挡一回合" },
  { name: "回能", cost: 0, art: "restore-mana.webp", tone: "azure",
    rules: "回复 3 点蓝。蓄力后回复 5 点蓝。",
    detail: (fighter) => fighter.charged ? "回复 5 蓝" : "回复 3 蓝" },
  { name: "盾击", cost: 2, art: "shield-strike.webp", tone: "gold",
    rules: "造成 4 点伤害。有盾时打 7 点。蓄力后额外造成 5 点伤害。",
    detail: (fighter) => "伤害 " + ((fighter.sp > 0 ? 7 : 4) + (fighter.charged ? 5 : 0)) },
  { name: "破盾", cost: 1, art: "break-shield.webp", tone: "ember",
    rules: "清除对手的全部护盾。对手格挡时可以挡住这张牌。",
    detail: () => "清除护盾" },
  { name: "架盾", cost: 2, art: "raise-shield.webp", tone: "leaf",
    rules: "增加 5 点护盾。",
    detail: () => "护盾 +5" },
  { name: "补牌", cost: 1, art: "exchange.webp", tone: "violet",
    rules: "摸 2 张牌。",
    detail: () => "摸 2 张" },
  { name: "回复", cost: 1, art: "heal.webp", tone: "leaf",
    rules: "回复 3 点生命。蓄力后回复 5 点生命。",
    detail: (fighter) => fighter.charged ? "回血 5" : "回血 3" },
  { name: "蓄力", cost: 1, art: "charge.webp", tone: "gold",
    rules: "保存一层蓄力，可跨回合保留。下一张普攻、盾击、回能或回复会获得强化。",
    detail: (fighter) => fighter.charged ? "已存一层" : "蓄力一层" }
];

const dom = {
  board: document.getElementById("board"),
  turn: document.getElementById("turn-label"),
  draw: document.getElementById("draw-count"),
  discard: document.getElementById("discard-count"),
  phaseTitle: document.getElementById("phase-title"),
  phaseDetail: document.getElementById("phase-detail"),
  computerHand: document.getElementById("computer-hand"),
  playerHand: document.getElementById("player-hand"),
  computerStats: document.getElementById("computer-stats"),
  playerStats: document.getElementById("player-stats"),
  pass: document.getElementById("pass"),
  restart: document.getElementById("restart"),
  playAgain: document.getElementById("play-again"),
  retry: document.getElementById("retry"),
  journalScroll: document.getElementById("journal-scroll"),
  journalEvents: document.getElementById("journal-events"),
  journalTitle: document.getElementById("journal-title"),
  latestPlayer: document.getElementById("latest-player"),
  latestComputer: document.getElementById("latest-computer"),
  notice: document.getElementById("notice"),
  rules: document.getElementById("rules"),
  rulesList: document.getElementById("rules-list"),
  result: document.getElementById("battle-result"),
  resultTitle: document.getElementById("result-title"),
  resultDetail: document.getElementById("result-detail"),
  resultReplay: document.getElementById("result-replay")
};

const battleMotion = createBattleMotion(document.querySelector(".duel-stage"));
const updateComputerStats = createFighterStats(dom.computerStats);
const updatePlayerStats = createFighterStats(dom.playerStats);
let state = null;
let pending = false;
let error = "";
let computerTimer = 0;
let visibleLog = "";
let match = null;
let presentedResult = false;
let roomClient = null;
let roomSnapshot = null;
let incomingRoom = null;
let processingRoom = false;
let committedRoomCard = null;

function el(tag, className, content) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (content !== undefined) {
    element.textContent = content;
  }
  return element;
}

function updateText(element, text) {
  if (element.textContent !== text) {
    element.textContent = text;
  }
}

function isValidState(next) {
  return next && ["play", "discard", "computer", "finished"].includes(next.phase) &&
    Object.hasOwn(next, "revealed") && next.player && Array.isArray(next.player.hand) &&
    next.computer && Array.isArray(next.computer.hand) && Array.isArray(next.log);
}

async function getMatch() {
  if (!match) {
    try {
      const { default: createEngine } = await import("./game-engine.js?v=blind-pick-1");
      const engine = await createEngine({
        locateFile: (file, prefix) => prefix + file + "?v=blind-pick-1"
      });
      match = new engine.PreviewMatch();
    } catch {
      throw new Error("对局引擎载入失败，请刷新页面重试。");
    }
  }
  return match;
}

async function requestState(action) {
  if (onlineMode) return requestRoomState(action);
  if (pending) {
    return;
  }
  const committed = action?.type === "play" ? dom.playerHand.children[action.index] : null;
  if (committed) committed.dataset.committed = "true";
  window.clearTimeout(computerTimer);
  pending = true;
  error = "";
  updateControls();

  try {
    const game = await getMatch();
    const next = JSON.parse(game.request(action?.type ?? "state", action?.index ?? -1));
    if (next.error) {
      throw new Error(next.error);
    }
    if (!isValidState(next)) {
      throw new Error("对局数据有误，请重新载入。");
    }
    if (action?.type === "play" || action?.type === "pass") {
      renderReveal(next.revealed);
      dom.phaseTitle.textContent = "双方已亮牌";
      dom.phaseDetail.textContent = "结算本轮行动。";
    }
    await battleMotion.resolve(action?.type, state, next);
    state = next;
  } catch (reason) {
    error = reason instanceof Error ? reason.message : "本次操作失败，请重试。";
  } finally {
    if (committed) delete committed.dataset.committed;
    pending = false;
    render();
    if (state?.phase === "computer" && !error) {
      computerTimer = window.setTimeout(() => requestState({ type: "computer" }), 48);
    }
  }
}

function bothPlayersOnline() {
  return roomClient?.isConnected() && roomSnapshot?.online.every(Boolean);
}

function roomMayChoose() {
  return bothPlayersOnline() && state?.phase === "play" && !state.ready[roomSnapshot.seat];
}

function roomMayDiscard() {
  return bothPlayersOnline() && state?.phase === "discard" && state.player.hand.length > 6;
}

function roomMayRematch() {
  return bothPlayersOnline() && state?.phase === "finished" && !roomSnapshot.rematch[roomSnapshot.seat];
}

function clearRoomCommitment() {
  if (committedRoomCard) delete committedRoomCard.dataset.committed;
  committedRoomCard = null;
}

function requestRoomState(action) {
  if (pending || !action || !roomSnapshot?.state) return;
  const { type, index } = action;
  let command;
  if ((type === "play" || type === "pass") && roomMayChoose()) command = "choose";
  if (type === "discard" && roomMayDiscard()) command = "discard";
  if (type === "restart" && roomMayRematch()) command = "rematch";
  if (!command || !roomClient.send(command, index ?? -1)) return;

  if (type === "play") {
    committedRoomCard = dom.playerHand.children[index];
    if (committedRoomCard) committedRoomCard.dataset.committed = "true";
  }
  pending = true;
  error = "";
  updateControls();
}

function localFighters(frame, seat) {
  return seat === 0 ? frame : { player: frame.computer, computer: frame.player };
}

async function playRoomFrames(room, next) {
  pending = true;
  renderReveal(next.revealed);
  dom.phaseTitle.textContent = "双方已亮牌";
  dom.phaseDetail.textContent = "按本局先后手结算。";
  updateControls();
  battleMotion.showGuards(next.revealed);
  for (const frame of next.frames) {
    const side = frame.seat === room.seat ? "player" : "computer";
    const before = localFighters(frame.before, room.seat);
    const after = localFighters(frame.after, room.seat);
    await battleMotion.play(side, before, { ...after, revealed: next.revealed });
    battleMotion.sync(after);
    updatePlayerStats(after.player);
    updateComputerStats(after.computer);
  }
  battleMotion.showGuards(null);
}

async function receiveRoom(room) {
  incomingRoom = room;
  if (processingRoom) return;
  processingRoom = true;
  try {
    while (incomingRoom) {
      const current = incomingRoom;
      incomingRoom = null;
      const previous = roomSnapshot;
      const next = orientMatch(current.state, current.seat);
      roomSnapshot = current;
      error = "";
      const revealed = next?.revealed && previous?.state && previous.game === current.game &&
        previous.state.revealed?.turn !== next.revealed.turn;
      if (!next || !previous?.state || previous.game !== current.game || next.turn !== previous.state.turn ||
          next.phase !== "play") {
        clearRoomCommitment();
      }
      if (revealed) await playRoomFrames(current, next);
      if (roomSnapshot !== current) continue;
      state = next;
      pending = false;
      render();
    }
  } finally {
    processingRoom = false;
  }
}

function statBar(label, max, kind) {
  const stat = el("div", "stat");
  const meta = el("div", "stat-label");
  const amount = el("strong");
  meta.append(el("span", "", label), amount);
  const track = el("div", "progress-track");
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-label", label);
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", max);
  const fill = el("span", "progress-fill progress-" + kind);
  track.append(fill);
  stat.append(meta, track);
  return {
    stat,
    update(value) {
      if (track.getAttribute("aria-valuenow") === String(value)) return;
      updateText(amount, value + "/" + max);
      track.setAttribute("aria-valuenow", value);
      fill.style.setProperty("--fill", Math.max(0, Math.min(1, value / max)));
    }
  };
}

function createFighterStats(container) {
  const hp = statBar("生命", 24, "health");
  const mp = statBar("蓝量", 7, "mana");
  const status = el("div", "stat-lower");
  const ward = el("span", "status");
  const charge = el("span", "status status-charge", "蓄力");
  const guard = el("span", "status status-block", "格挡");
  status.append(ward, charge, guard);
  container.append(hp.stat, mp.stat, status);
  container.hidden = true;
  return fighter => {
    hp.update(fighter.hp);
    mp.update(fighter.mp);
    updateText(ward, "护盾 " + fighter.sp);
    charge.hidden = !fighter.charged;
    guard.hidden = !fighter.blocking;
    container.hidden = false;
  };
}

function makeHandCard(id, info, player) {
  const card = el(player ? "button" : "article", "card");
  card.dataset.tone = info.tone;
  card.dataset.card = id;
  card.title = info.rules;
  if (player) {
    card.type = "button";
    card.addEventListener("click", () => {
      const index = Number(card.dataset.index);
      if (state.phase === "discard") {
        requestState({ type: "discard", index });
      } else if (state.phase === "play" && state.player.mp >= info.cost) {
        requestState({ type: "play", index });
      }
    });
  }

  const cost = el("span", "card-cost", info.cost);
  cost.setAttribute("aria-hidden", "true");

  const art = el("div", "card-art");
  const image = el("img");
  image.src = "assets/duel/cards/" + info.art;
  image.alt = "";
  image.draggable = false;
  image.addEventListener("error", () => { image.hidden = true; }, { once: true });
  art.append(image);

  const caption = el("div", "card-caption");
  caption.append(el("strong", "card-title", info.name), el("span", "card-effect"));
  card.append(cost, art, caption);
  return card;
}

function renderHand(container, fighter, player) {
  const handCount = fighter.hand.length;
  container.style.setProperty("--spread-steps", Math.max(1, Math.min(handCount, 6) - 1));
  container.dataset.crowded = String(handCount >= 5);
  const unused = new Set(container.children);
  const ordered = [];

  fighter.hand.forEach((id, index) => {
    const info = cards[id];
    if (!info) return;
    const existing = [...unused].find(node => Number(node.dataset.card) === id);
    const card = existing ?? makeHandCard(id, info, player);
    unused.delete(card);
    card.dataset.index = index;
    const detail = info.detail(fighter);
    updateText(card.querySelector(".card-effect"), detail);
    const label = [info.name, "费用 " + info.cost + " 蓝", detail, info.rules].join("，");
    if (card.getAttribute("aria-label") !== label) card.setAttribute("aria-label", label);
    ordered.push(card);
  });

  if (ordered.length === 0) {
    const empty = container.querySelector(".hand-empty") ?? el("p", "hand-empty", "手牌为空");
    unused.delete(empty);
    ordered.push(empty);
  }
  for (const node of unused) node.remove();
  ordered.forEach((node, index) => {
    const current = container.children[index];
    if (node !== current) container.insertBefore(node, current ?? null);
  });
}

function renderReveal(reveal) {
  const name = id => id === -1 ? "跳过" : cards[id].name;
  updateText(dom.journalTitle, reveal ? "第 " + reveal.turn + " 轮亮牌" : "双方亮牌");
  updateText(dom.latestPlayer, reveal ? name(reveal.player) : "待亮牌");
  updateText(dom.latestComputer, reveal ? name(reveal.computer) : "待亮牌");
}

function renderJournal(records) {
  const events = records.slice(-50);
  const key = JSON.stringify(events);
  if (key === visibleLog) {
    return;
  }
  visibleLog = key;

  const rows = document.createDocumentFragment();
  const sideNames = { player: "你", computer: computerName, system: "对局" };
  for (const event of events) {
    const row = el("li", "journal-event");
    row.dataset.side = event.side;
    row.append(el("span", "actor", sideNames[event.side] || "对局"),
               el("p", "event-text", event.text));
    rows.append(row);
  }
  dom.journalEvents.replaceChildren(rows);
  if (dom.journalScroll.closest("details").open) {
    dom.journalScroll.scrollTop = dom.journalScroll.scrollHeight;
  }
}

function updateControls() {
  dom.board.setAttribute("aria-busy", String(pending));
  const canChoose = onlineMode ? roomMayChoose() : state?.phase === "play" && !error;
  const canDiscard = onlineMode ? roomMayDiscard() : state?.phase === "discard" && !error;
  const canRestart = onlineMode ? roomMayRematch() : Boolean(state);
  dom.pass.disabled = pending || !canChoose;
  dom.restart.disabled = pending || !canRestart;
  dom.playAgain.disabled = pending || !canRestart;
  dom.resultReplay.disabled = pending || (onlineMode && !canRestart);
  dom.retry.disabled = pending;

  for (const button of dom.playerHand.querySelectorAll("button.card")) {
    const cost = cards[button.dataset.card].cost;
    const tooExpensive = state.player.mp < cost;
    button.disabled = pending || !(canDiscard || (canChoose && !tooExpensive));
    button.classList.toggle("unaffordable", state.phase === "play" && tooExpensive);
  }
}

function renderResult() {
  if (state.phase !== "finished") {
    presentedResult = false;
    if (dom.result.open) {
      dom.result.close();
      dom.pass.focus({ preventScroll: true });
    }
    return;
  }
  const won = state.winner === "player";
  const description = onlineMode ? (won ? "你赢下了这一局" : "对手赢下了这一局")
    : (won ? "你击败了" + computerName : computerName + "赢下了这局");
  if (onlineMode) {
    const replayReady = roomSnapshot.rematch[roomSnapshot.seat];
    dom.resultReplay.textContent = replayReady ? "等待好友" : "再开一局";
    const status = replayReady ? "。等待好友同意后开始下一局。" :
      !bothPlayersOnline() ? "。等待好友重新连接。" : "";
    updateText(dom.resultDetail, description + status);
  } else {
    updateText(dom.resultDetail, description);
  }
  if (presentedResult) return;

  dom.result.dataset.outcome = won ? "victory" : "defeat";
  dom.resultTitle.textContent = won ? "VICTORY" : "DEFEAT";
  if (dom.rules.open) dom.rules.close();
  dom.result.showModal();
  presentedResult = true;
}

function render() {
  dom.notice.hidden = !error;
  dom.notice.textContent = error;
  dom.retry.hidden = onlineMode || !error;
  dom.playAgain.hidden = true;
  dom.pass.hidden = true;

  if (!state) {
    dom.board.dataset.phase = error ? "offline" : "loading";
    dom.phaseTitle.textContent = error ? "载入失败" : "准备对局";
    dom.phaseDetail.textContent = error ? "请重新载入对局。" : "正在载入对局。";
    updateControls();
    return;
  }

  dom.board.dataset.phase = state.phase;
  dom.turn.textContent = "第 " + state.turn + " 回合";
  dom.draw.textContent = state.deckCount;
  dom.discard.textContent = state.discardCount;

  switch (state.phase) {
    case "play":
      if (onlineMode) {
        const mySeat = roomSnapshot.seat;
        const locked = state.ready[mySeat];
        dom.phaseTitle.textContent = !bothPlayersOnline() ? "等待连接" : locked ? "已锁定" : "选择出牌";
        dom.phaseDetail.textContent = !bothPlayersOnline() ? "好友离开时保留本轮进度。"
          : locked ? "等对手锁定后同时亮牌。"
          : state.ready[1 - mySeat] ? "对手已锁定。点一张手牌，或跳过。"
          : "选一张手牌，或跳过。";
        dom.pass.hidden = !roomMayChoose();
      } else {
        dom.phaseTitle.textContent = "你的回合";
        dom.phaseDetail.textContent = state.player.hand.length
          ? "对手已锁定行动。点一张手牌，或跳过。"
          : "手牌为空，可以跳过并摸牌。";
        dom.pass.hidden = Boolean(error);
      }
      break;
    case "discard":
      if (onlineMode && !bothPlayersOnline()) {
        dom.phaseTitle.textContent = "等待连接";
        dom.phaseDetail.textContent = "好友重新连接后继续弃牌。";
      } else if (onlineMode && state.player.hand.length <= 6) {
        dom.phaseTitle.textContent = "等待弃牌";
        dom.phaseDetail.textContent = "等对手整理手牌后进入下一轮。";
      } else {
        dom.phaseTitle.textContent = "选择弃牌";
        dom.phaseDetail.textContent = "手牌 " + state.player.hand.length + " 张，点牌弃到 6 张。";
      }
      break;
    case "computer":
      dom.phaseTitle.textContent = "双方已亮牌";
      dom.phaseDetail.textContent = computerName + "正在结算已亮出的行动。";
      break;
    case "finished":
      dom.phaseTitle.textContent = state.winner === "player" ? "你赢了" : computerName + "获胜";
      dom.phaseDetail.textContent = "本局结束。";
      dom.playAgain.hidden = Boolean(error);
      break;
  }

  updateComputerStats(state.computer);
  updatePlayerStats(state.player);
  battleMotion.sync(state);
  renderHand(dom.computerHand, state.computer, false);
  renderHand(dom.playerHand, state.player, true);
  renderReveal(state.revealed);
  renderJournal(state.log);
  updateControls();
  renderResult();
}

for (const card of cards) {
  const rule = el("div", "rule");
  rule.append(el("strong", "", card.name + " · " + card.cost + " 蓝"),
              el("span", "", card.rules));
  dom.rulesList.append(rule);
}

document.getElementById("show-rules").addEventListener("click", () => dom.rules.showModal());
dom.journalScroll.closest("details").addEventListener("toggle", () => {
  dom.journalScroll.scrollTop = dom.journalScroll.scrollHeight;
});
dom.pass.addEventListener("click", () => requestState({ type: "pass" }));
dom.restart.addEventListener("click", () => requestState({ type: "restart" }));
dom.playAgain.addEventListener("click", () => requestState({ type: "restart" }));
dom.resultReplay.addEventListener("click", () => requestState({ type: "restart" }));
dom.result.addEventListener("close", () => {
  if (state?.phase === "finished") dom.phaseTitle.focus({ preventScroll: true });
});
dom.retry.addEventListener("click", () => requestState());

if (onlineMode) {
  document.title = "双人对战 · 愚蠢的博弈游戏";
  document.getElementById("computer-title").textContent = computerName;
  document.getElementById("duel-opponent-name").textContent = computerName;
  document.getElementById("recent-opponent-name").textContent = computerName;
  dom.computerHand.setAttribute("aria-label", "对手的手牌");
  dom.restart.hidden = true;
  document.getElementById("rules-choice").textContent = "手牌公开，每轮各暗选一张牌或跳过，双方都锁定后一起亮牌。";
  document.getElementById("rules-order").textContent = "格挡先同时生效，其余牌按先手、后手结算。房主第一局先手，双方同意再战后交换先后手。生命为 0 时结束。各自在回合末回 1 蓝、摸 1 张，超过 6 张就弃至 6 张。";
  roomClient = initRoom({
    onState: receiveRoom,
    onDisconnect() {
      pending = false;
      if (state && !processingRoom) render();
    },
    onError(message, fatal) {
      pending = false;
      clearRoomCommitment();
      error = message;
      if (fatal) {
        state = null;
        roomSnapshot = null;
        if (dom.result.open) dom.result.close();
      }
      if (state) render();
    }
  });
} else {
  requestState();
}
