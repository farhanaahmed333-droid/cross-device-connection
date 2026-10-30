const statusText = document.getElementById("status");
const dot = document.getElementById("dot");
const roomInfo = document.getElementById("roomInfo");
const log = document.getElementById("log");
const joinForm = document.getElementById("joinForm");
const messageForm = document.getElementById("messageForm");
const roomInput = document.getElementById("room");
const messageInput = document.getElementById("message");

let socket = null;
let joined = false;
let reconnectTimer = null;
let manuallyClosed = false;
let activeRoom = "";

function addLog(text) {
  const li = document.createElement("li");
  li.textContent = text;
  log.prepend(li);
  while (log.children.length > 100) log.lastElementChild.remove();
}

function setStatus(text, online = false) {
  statusText.textContent = text;
  dot.classList.toggle("online", online);
}

function joinRoom(room, announce = true) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    if (announce) addLog("Not connected to the server yet.");
    return;
  }
  socket.send(JSON.stringify({ type: "join", room }));
}

function connect() {
  if (manuallyClosed) return;
  clearTimeout(reconnectTimer);
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  const currentSocket = new WebSocket(`${scheme}//${location.host}`);
  socket = currentSocket;
  joined = false;
  setStatus("Connecting to server…");

  currentSocket.addEventListener("open", () => {
    if (socket !== currentSocket) return;
    setStatus("Connected to server", true);
    if (activeRoom) joinRoom(activeRoom, false);
  });

  currentSocket.addEventListener("close", () => {
    if (socket !== currentSocket) return;
    joined = false;
    setStatus("Disconnected — reconnecting…");
    roomInfo.textContent = activeRoom
      ? `Reconnecting to room ${activeRoom}…`
      : "Not in a room yet.";
    reconnectTimer = setTimeout(connect, 2000);
  });

  currentSocket.addEventListener("error", () => {
    if (socket === currentSocket) setStatus("Connection error");
  });

  currentSocket.addEventListener("message", (event) => {
    if (socket !== currentSocket) return;
    let data;
    try { data = JSON.parse(event.data); } catch { return; }

    if (data.type === "joined") {
      joined = true;
      activeRoom = data.room;
      roomInput.value = data.room;
      try { sessionStorage.setItem("crossDeviceRoom", data.room); } catch {}
      roomInfo.textContent = `Room ${data.room} · ${data.count} device(s) connected`;
      addLog(`Joined room ${data.room}`);
    } else if (data.type === "devices") {
      roomInfo.textContent = `${data.count} device(s) connected in this room`;
    } else if (data.type === "message") {
      addLog(`${data.from}: ${data.text}`);
    } else if (data.type === "error") {
      addLog(`Error: ${data.message}`);
    }
  });
}

joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const room = roomInput.value.trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,20}$/.test(room)) {
    addLog("Room code must be 4–20 letters, numbers, or hyphens.");
    return;
  }
  activeRoom = room;
  joined = false;
  try { sessionStorage.setItem("crossDeviceRoom", room); } catch {}
  joinRoom(room);
});

messageForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!joined) return addLog("Join a room before sending messages.");
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return addLog("Connection lost; please wait for reconnect.");
  }
  const text = messageInput.value.trim();
  if (!text) return;
  socket.send(JSON.stringify({ type: "message", text }));
  messageInput.value = "";
  messageInput.focus();
});

try {
  activeRoom = sessionStorage.getItem("crossDeviceRoom") || "";
  if (activeRoom) roomInput.value = activeRoom;
} catch {}

connect();
