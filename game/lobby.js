"use strict";

const panels = {
  rules: {
    title: "怎么玩",
    description: "每轮各出至多一张牌，选定后双方亮牌。格挡先于其他行动结算，可以挡住本轮的伤害和破盾。把对手打到 0 血就赢。人机和好友对战公开双方的手牌；限时 Boss 只显示你的手牌，需在三分钟内击败巨像。"
  },
  tower: {
    title: "爬塔",
    description: "这个模式筹备中。未来可以沿着高塔逐层挑战。"
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
