"use strict";

const panels = {
  rules: {
    title: "怎么玩",
    description: "双方手牌公开，每轮各出至多一张。小北先在暗中锁定行动，你选完后双方同时亮牌。格挡立即生效，能挡住本轮的伤害和破盾。其余动作按玩家、对手的顺序结算。把对手打到 0 血就赢。"
  },
  tower: {
    title: "爬塔",
    description: "这个模式筹备中。未来可以沿着高塔逐层挑战。"
  },
  boss: {
    title: "巨像",
    description: "限时挑战筹备中。"
  }
};

const dialog = document.getElementById("lobby-dialog");
const title = document.getElementById("dialog-title");
const description = document.getElementById("dialog-description");

for (const button of document.querySelectorAll("[data-dialog]")) {
  button.addEventListener("click", () => {
    const panel = panels[button.dataset.dialog];
    dialog.dataset.panel = button.dataset.dialog;
    title.textContent = panel.title;
    description.textContent = panel.description;
    dialog.showModal();
  });
}
