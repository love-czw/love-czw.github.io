const roomPattern = /^[A-HJ-NP-Z2-9]{6}$/;
const resumePrefix = "stupid-mind-games.room.";

function readSeat(code) {
  try {
    return JSON.parse(sessionStorage.getItem(resumePrefix + code));
  } catch {
    return null;
  }
}

function saveSeat(code, seat) {
  try {
    if (seat) sessionStorage.setItem(resumePrefix + code, JSON.stringify(seat));
    else sessionStorage.removeItem(resumePrefix + code);
  } catch {
    // A private browser may block storage. The open tab can still play.
  }
}

export function orientMatch(match, seat) {
  if (!match || seat === 0) return match;
  return {
    ...match,
    player: match.computer,
    computer: match.player,
    revealed: match.revealed && {
      ...match.revealed, player: match.revealed.computer, computer: match.revealed.player
    },
    winner: match.winner === null ? null : flipSide(match.winner),
    log: match.log.map(event => ({ ...event, side: flipSide(event.side) }))
  };
}

function flipSide(side) {
  if (side === "player") return "computer";
  if (side === "computer") return "player";
  return side;
}

function roomGateway() {
  const configured = document.querySelector('meta[name="room-server"]')?.content.trim();
  if (!configured) return new URL(location.origin);

  const url = new URL(configured);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("正式的房间服务须使用 HTTPS。");
  }
  return new URL(url.origin);
}

export function initRoom({ onState, onDisconnect, onError }) {
  const panel = document.getElementById("room-panel");
  const access = document.getElementById("room-access");
  const waiting = document.getElementById("room-waiting");
  const create = document.getElementById("room-create");
  const join = document.getElementById("room-join");
  const codeInput = document.getElementById("room-input");
  const shareText = document.getElementById("room-link");
  const shareButton = document.getElementById("room-copy");
  const message = document.getElementById("room-message");
  const roomCode = document.getElementById("room-code");
  const board = document.getElementById("board");
  const hud = document.getElementById("room-hud");
  const status = document.getElementById("room-hud-status");
  const params = new URLSearchParams(location.search);
  const invite = (params.get("room") || "").toUpperCase();
  panel.hidden = false;
  board.hidden = true;
  let gateway;
  try {
    gateway = roomGateway();
  } catch {
    message.textContent = "房间服务地址配置有误。";
    create.disabled = true;
    join.querySelector("button").disabled = true;
    return { isConnected: () => false, send: () => false };
  }
  const endpoint = new URL("/ws", gateway);
  endpoint.protocol = gateway.protocol === "https:" ? "wss:" : "ws:";
  const seatKey = code => gateway.origin === location.origin ? code : gateway.origin + "/" + code;

  let socket = null;
  let seat = null;
  let connected = false;
  let reconnect = 0;
  let attempts = 0;
  let lastRoom = null;

  function loseSeat(reason) {
    if (seat) saveSeat(seatKey(seat.code), null);
    seat = null;
    lastRoom = null;
    connected = false;
    access.hidden = false;
    waiting.hidden = true;
    panel.hidden = false;
    board.hidden = true;
    hud.hidden = true;
    create.hidden = false;
    message.textContent = reason;
    onError(reason, true);
  }

  function roomURL(code) {
    const url = new URL(location.href);
    url.searchParams.set("room", code);
    return url;
  }

  function enter(credentials) {
    seat = credentials;
    saveSeat(seatKey(seat.code), seat);
    const url = roomURL(seat.code);
    history.replaceState(null, "", url);
    roomCode.textContent = seat.code;
    shareText.value = url.href;
    access.hidden = true;
    waiting.hidden = false;
    message.textContent = "正在连接房间…";
    connect();
  }

  function update(room) {
    connected = true;
    attempts = 0;
    lastRoom = room;
    panel.hidden = Boolean(room.state);
    board.hidden = !room.state;
    hud.hidden = !room.state;
    message.textContent = room.seat === 0 ? "等好友通过链接进入房间。" : "等房主连接后开始。";

    if (room.state) {
      const order = room.state.first === room.seat ? "你是先手" : "你是后手";
      const membership = room.seat === 0 ? "房主" : "加入者";
      status.textContent = "房间 " + room.code + " · 第 " + room.game + " 局 · " + membership + " · " + order;
    }
    onState(room);
  }

  function connect() {
    if (!seat) return;
    window.clearTimeout(reconnect);
    const connection = new WebSocket(endpoint);
    socket = connection;
    connection.addEventListener("open", () => {
      connection.send(JSON.stringify({ type: "auth", code: seat.code, token: seat.token }));
    });
    connection.addEventListener("message", event => {
      if (socket !== connection) return;
      const data = JSON.parse(event.data);
      if (data.type === "room") {
        update(data);
      } else if (data.type === "error") {
        if (data.fatal) {
          loseSeat(data.message);
          connection.close();
        } else {
          message.textContent = data.message;
          onError(data.message, false);
        }
      }
    });
    connection.addEventListener("close", event => {
      if (socket !== connection) return;
      connected = false;
      onDisconnect();
      if (!seat) return;
      if (event.code === 4001 || event.code === 4002) {
        loseSeat(event.code === 4002 ? "这个座位已在另一个页面连接。" : "房间身份已失效，请重新开房或加入。");
        return;
      }
      message.textContent = "连接中断，正在尝试恢复…";
      reconnect = window.setTimeout(connect, Math.min(6000, 650 * 2 ** attempts));
      attempts += 1;
    });
  }

  async function claim(code) {
    if (code && !roomPattern.test(code)) {
      message.textContent = "请输入 6 位房间码。";
      return;
    }
    create.disabled = true;
    codeInput.disabled = true;
    join.querySelector("button").disabled = true;
    message.textContent = code ? "正在加入…" : "正在创建…";
    try {
      const resource = code ? "/api/rooms/" + encodeURIComponent(code) + "/join" : "/api/rooms";
      const response = await fetch(new URL(resource, gateway), {
        method: "POST", credentials: "omit", signal: AbortSignal.timeout(8000)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "暂时无法进入房间。");
      enter(body);
    } catch (error) {
      message.textContent = error instanceof SyntaxError || error instanceof TypeError
        ? "房间服务暂时无法连接，请稍后再试。"
        : error.message;
      create.hidden = false;
    } finally {
      create.disabled = false;
      codeInput.disabled = false;
      join.querySelector("button").disabled = false;
    }
  }

  shareButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(shareText.value);
      message.textContent = "邀请链接已复制。";
    } catch {
      shareText.select();
      if (document.execCommand("copy")) {
        message.textContent = "邀请链接已复制。";
      } else {
        message.textContent = "已选中邀请链接，可以手动复制。";
      }
    }
  });
  create.addEventListener("click", () => claim(""));
  join.addEventListener("submit", event => {
    event.preventDefault();
    const code = codeInput.value.trim().toUpperCase();
    if (!code) {
      message.textContent = "请输入好友发给你的房间码。";
      codeInput.focus();
      return;
    }
    claim(code);
  });

  if (roomPattern.test(invite)) {
    codeInput.value = invite;
    create.hidden = true;
    message.textContent = "好友邀请你加入房间。";
    const saved = readSeat(seatKey(invite));
    if (saved?.token) enter(saved);
  }

  return {
    isConnected: () => connected,
    send(type, index) {
      if (!connected || !lastRoom?.state || socket.readyState !== WebSocket.OPEN) return false;
      socket.send(JSON.stringify({ type, index, game: lastRoom.game, turn: lastRoom.state.turn }));
      return true;
    }
  };
}
