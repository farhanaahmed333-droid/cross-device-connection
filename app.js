const statusText = document.getElementById("status");
const dot = document.getElementById("dot");
const roomInfo = document.getElementById("roomInfo");
const log = document.getElementById("log");
const joinForm = document.getElementById("joinForm");
const messageForm = document.getElementById("messageForm");
const roomInput = document.getElementById("room");
const messageInput = document.getElementById("message");
let socket;
let joined = false;

function addLog(text) {
  const li = document.createElement("li");
  li.textContent = text;
  log.prepend(li);
}

function connect() {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${scheme}//${location.host}`);

  socket.addEventListener("open", () => {
    statusText.textContent = "Connected to server";
    dot.classList.add("online");
  });
  socket.addEventListener("close", () => {
    statusText.textContent = "Disconnected — retrying in 2 seconds";
    dot.classList.remove("online");
    joined = false;
    setTimeout(connect, 2000);
  });
  socket.addEventListener("error", () => {
    statusText.textContent = "Connection error";
    dot.classList.remove("online");
  });
  socket.addEventListener("message", (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }
    if (data.type === "joined") {
      joined = true;
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
  if (!socket || socket.readyState !== WebSocket.OPEN) return addLog("Not connected to the server yet.");
  socket.send(JSON.stringify({ type: "join", room: roomInput.value }));
});

messageForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!joined) return addLog("Join a room before sending messages.");
  if (!socket || socket.readyState !== WebSocket.OPEN) return addLog("Connection lost; please wait for reconnect.");
  socket.send(JSON.stringify({ type: "message", text: messageInput.value }));
  messageInput.value = "";
});

connect();
