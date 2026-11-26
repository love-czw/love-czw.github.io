const moves = [
  "normal-attack", "block", "restore-mana", "shield-strike", "break-shield",
  "raise-shield", "exchange", "heal", "charge"
];

const attackMoves = new Set(["normal-attack", "shield-strike", "break-shield"]);
const effectDuration = 410;

export function describeMove(side, before, after) {
  const effect = moves[after.revealed?.[side]];
  if (!effect) return null;

  const opponent = side === "player" ? "computer" : "player";
  const self = before[side];
  const current = after[side];

  if (attackMoves.has(effect)) {
    const damage = before[opponent].hp - after[opponent].hp;
    const absorbed = before[opponent].sp - after[opponent].sp;
    if (after.revealed[opponent] === 1) {
      return { effect, target: opponent, result: "block", text: "格挡" };
    }
    if (effect === "break-shield") {
      return { effect, target: opponent, result: "clear", text: absorbed > 0 ? "破盾 −" + absorbed : "无护盾" };
    }
    if (damage > 0) {
      return { effect, target: opponent, result: "hit", text: "−" + damage + " 生命" };
    }
    return { effect, target: opponent, result: "shield", text: "护盾 −" + absorbed };
  }

  const labels = {
    block: "格挡就绪",
    "restore-mana": "回能",
    "raise-shield": "护盾 +" + (current.sp - self.sp),
    exchange: "摸 2 张",
    heal: current.hp > self.hp ? "+" + (current.hp - self.hp) + " 生命" : "生命已满",
    charge: self.charged ? "已蓄力" : "蓄力就绪"
  };
  return { effect, target: side, result: "self", text: labels[effect] };
}

export function createBattleMotion(stage) {
  const overlay = stage.querySelector(".duel-effects");
  const units = {};
  for (const unit of stage.querySelectorAll(".duel-unit")) {
    units[unit.dataset.side] = unit;
  }

  function sync(state) {
    for (const side of Object.keys(units)) {
      units[side].dataset.ward = state[side].sp > 0 ? "true" : "false";
      units[side].dataset.charged = String(state[side].charged);
      units[side].dataset.defeated = state[side].hp === 0 ? "true" : "false";
    }
  }

  function showGuards(reveal) {
    for (const side of Object.keys(units)) {
      units[side].dataset.guard = reveal?.[side] === 1 ? "true" : "false";
    }
  }

  async function resolve(command, before, after) {
    if (command === "restart") {
      showGuards(null);
      return;
    }
    if (command === "play" || command === "pass") showGuards(after.revealed);

    const side = command === "play" ? "player" : command === "computer" ? "computer" : null;
    if (side && before) await play(side, before, after);
    if (command === "computer" || after.phase === "finished") showGuards(null);
  }

  async function play(side, before, after) {
    const move = describeMove(side, before, after);
    if (move && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      await animate(side, move);
    }
  }

  async function animate(side, move) {
    const { effect, target, result, text } = move;
    stage.dataset.actor = side;
    stage.dataset.effect = effect;
    stage.dataset.result = result;
    units[side].dataset.acting = effect;
    units[target].dataset.affected = result;

    const impact = document.createElement("div");
    impact.className = "duel-impact";
    impact.dataset.side = target;
    const projectile = document.createElement("div");
    projectile.className = "duel-projectile";
    const label = document.createElement("span");
    label.className = "duel-result";
    label.dataset.side = target;
    label.textContent = text;
    overlay.append(projectile, impact, label);

    await new Promise(resolve => window.setTimeout(resolve, effectDuration));
    overlay.replaceChildren();
    delete stage.dataset.actor;
    delete stage.dataset.effect;
    delete stage.dataset.result;
    delete units[side].dataset.acting;
    delete units[target].dataset.affected;
  }

  return { resolve, sync, play, showGuards };
}
