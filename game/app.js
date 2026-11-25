"use strict";

const computerName = document.getElementById("computer-title").textContent;

const cards = [
  { name: "普攻", cost: 1, art: "normal-attack.png", tone: "ember",
    rules: "造成 4 点伤害。蓄力后造成 9 点伤害。",
    detail: (fighter) => fighter.charged ? "伤害 9" : "伤害 4" },
  { name: "格挡", cost: 2, art: "block.png", tone: "iron",
    rules: "亮牌时生效，挡住对手本轮的全部伤害和破盾。",
    detail: () => "格挡一回合" },
  { name: "回能", cost: 0, art: "restore-mana.png", tone: "azure",
    rules: "回复 3 点蓝。蓄力后回复 5 点蓝。",
    detail: (fighter) => fighter.charged ? "回复 5 蓝" : "回复 3 蓝" },
  { name: "盾击", cost: 2, art: "shield-strike.png", tone: "gold",
    rules: "造成 4 点伤害。有盾时打 7 点。蓄力后额外造成 5 点伤害。",
    detail: (fighter) => "伤害 " + ((fighter.sp > 0 ? 7 : 4) + (fighter.charged ? 5 : 0)) },
  { name: "破盾", cost: 1, art: "break-shield.png", tone: "ember",
    rules: "清除对手的全部护盾。对手格挡时可以挡住这张牌。",
    detail: () => "清除护盾" },
  { name: "架盾", cost: 2, art: "raise-shield.png", tone: "leaf",
    rules: "增加 5 点护盾。",
    detail: () => "护盾 +5" },
  { name: "补牌", cost: 1, art: "exchange.png", tone: "violet",
    rules: "摸 2 张牌。",
    detail: () => "摸 2 张" },
  { name: "回复", cost: 1, art: "heal.png", tone: "leaf",
    rules: "回复 3 点生命。蓄力后回复 5 点生命。",
    detail: (fighter) => fighter.charged ? "回血 5" : "回血 3" },
  { name: "蓄力", cost: 1, art: "charge.png", tone: "gold",
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
  rulesList: document.getElementById("rules-list")
};

let state = null;
let pending = false;
let error = "";
let computerTimer = 0;
let visibleLog = "";
let match = null;

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
  if (pending) {
    return;
  }
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
    state = next;
  } catch (reason) {
    error = reason instanceof Error ? reason.message : "本次操作失败，请重试。";
  } finally {
    pending = false;
    render();
    if (state?.phase === "computer" && !error) {
      computerTimer = window.setTimeout(() => requestState({ type: "computer" }), 520);
    }
  }
}

function statBar(label, value, max, kind) {
  const stat = el("div", "stat");
  const meta = el("div", "stat-label");
  meta.append(el("span", "", label), el("strong", "", value + "/" + max));
  const track = el("div", "progress-track");
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-label", label);
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", max);
  track.setAttribute("aria-valuenow", value);
  const fill = el("span", "progress-fill progress-" + kind);
  fill.style.setProperty("--value", Math.max(0, Math.min(100, 100 * value / max)) + "%");
  track.append(fill);
  stat.append(meta, track);
  return stat;
}

function renderStats(container, fighter) {
  const status = el("div", "stat-lower");
  status.append(el("span", "status", "护盾 " + fighter.sp));
  if (fighter.charged) {
    status.append(el("span", "status status-charge", "蓄力"));
  }
  if (fighter.blocking) {
    status.append(el("span", "status status-block", "格挡"));
  }
  container.replaceChildren(
    statBar("生命", fighter.hp, 24, "health"),
    statBar("蓝量", fighter.mp, 7, "mana"),
    status
  );
}

function renderHand(container, fighter, player) {
  const previousScroll = container.scrollLeft;
  const handCount = fighter.hand.length;
  container.style.setProperty("--spread-steps", Math.max(1, Math.min(handCount, 6) - 1));
  container.dataset.crowded = String(handCount >= 5);
  const list = document.createDocumentFragment();

  fighter.hand.forEach((id, index) => {
    const info = cards[id];
    if (!info) {
      return;
    }
    const card = el(player ? "button" : "article", "card");
    card.dataset.tone = info.tone;
    card.dataset.index = index;
    card.dataset.card = id;
    card.title = info.rules;
    card.setAttribute("aria-label", [info.name, "费用 " + info.cost + " 蓝",
                                     info.detail(fighter), info.rules].join("，"));

    if (player) {
      card.type = "button";
      card.addEventListener("click", () => {
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
    image.src = "assets/" + info.art;
    image.alt = "";
    image.draggable = false;
    image.addEventListener("error", () => { image.hidden = true; }, { once: true });
    art.append(image);

    const caption = el("div", "card-caption");
    caption.append(el("strong", "card-title", info.name),
                   el("span", "card-effect", info.detail(fighter)));
    card.append(cost, art, caption);
    list.append(card);
  });

  if (!list.childElementCount) {
    list.append(el("p", "hand-empty", "手牌为空"));
  }
  container.replaceChildren(list);
  container.scrollLeft = previousScroll;
}

function renderReveal(reveal) {
  const name = id => id === -1 ? "跳过" : cards[id].name;
  dom.journalTitle.textContent = reveal ? "第 " + reveal.turn + " 轮亮牌" : "双方亮牌";
  dom.latestPlayer.textContent = reveal ? name(reveal.player) : "待亮牌";
  dom.latestComputer.textContent = reveal ? name(reveal.computer) : "待亮牌";
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
  dom.journalScroll.scrollTop = dom.journalScroll.scrollHeight;
}

function updateControls() {
  dom.board.setAttribute("aria-busy", String(pending));
  dom.pass.disabled = pending || Boolean(error) || state?.phase !== "play";
  dom.restart.disabled = pending || !state;
  dom.playAgain.disabled = pending || !state;
  dom.retry.disabled = pending;

  const discardMode = state?.phase === "discard";
  for (const button of dom.playerHand.querySelectorAll("button.card")) {
    const cost = cards[button.dataset.card].cost;
    const tooExpensive = state.player.mp < cost;
    const canPlay = state.phase === "play" && !tooExpensive;
    button.disabled = pending || Boolean(error) || !(discardMode || canPlay);
    button.classList.toggle("unaffordable", state.phase === "play" && tooExpensive);
  }
}

function render() {
  dom.notice.hidden = !error;
  dom.notice.textContent = error;
  dom.retry.hidden = !error;
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
      dom.phaseTitle.textContent = "你的回合";
      dom.phaseDetail.textContent = state.player.hand.length
        ? "对手已锁定行动。点一张手牌，或跳过。"
        : "手牌为空，可以跳过并摸牌。";
      dom.pass.hidden = Boolean(error);
      break;
    case "discard":
      dom.phaseTitle.textContent = "选择弃牌";
      dom.phaseDetail.textContent = "手牌 " + state.player.hand.length + " 张，点牌弃到 6 张。";
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

  renderStats(dom.computerStats, state.computer);
  renderStats(dom.playerStats, state.player);
  renderHand(dom.computerHand, state.computer, false);
  renderHand(dom.playerHand, state.player, true);
  renderReveal(state.revealed);
  renderJournal(state.log);
  updateControls();
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
dom.retry.addEventListener("click", () => requestState());
requestState();
