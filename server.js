const express = require("express");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const rooms = new Map();

app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req, res) => res.json({ ok: true, service: "cross-device-connection" }));

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function roomCount(room) {
  return (rooms.get(room) || new Set()).size;
}

wss.on("connection", (ws) => {
  ws.room = null;
  ws.deviceId = Math.random().toString(36).slice(2, 10);

  send(ws, { type: "connected", deviceId: ws.deviceId });

  ws.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return send(ws, { type: "error", message: "Invalid JSON message." });
    }

    if (data.type === "join") {
      const room = String(data.room || "").trim().toUpperCase();
      if (!/^[A-Z0-9-]{4,20}$/.test(room)) {
        return send(ws, { type: "error", message: "Room code must be 4–20 letters, numbers, or hyphens." });
      }

      if (ws.room && rooms.has(ws.room)) {
        rooms.get(ws.room).delete(ws);
        if (roomCount(ws.room) === 0) rooms.delete(ws.room);
        else broadcast(ws.room, { type: "devices", count: roomCount(ws.room) });
      }

      ws.room = room;
      if (!rooms.has(room)) rooms.set(room, new Set());
      rooms.get(room).add(ws);

      send(ws, { type: "joined", room, count: roomCount(room) });
      broadcast(room, { type: "devices", count: roomCount(room) });
      return;
    }

    if (data.type === "message") {
      if (!ws.room) return send(ws, { type: "error", message: "Join a room first." });
      const text = String(data.text || "").trim().slice(0, 1000);
      if (!text) return;
      broadcast(ws.room, {
        type: "message",
        from: ws.deviceId,
        text,
        sentAt: new Date().toISOString()
      });
    }
  });

  ws.on("close", () => {
    if (!ws.room || !rooms.has(ws.room)) return;
    rooms.get(ws.room).delete(ws);
    if (roomCount(ws.room) === 0) rooms.delete(ws.room);
    else broadcast(ws.room, { type: "devices", count: roomCount(ws.room) });
  });
});

function broadcast(room, payload) {
  for (const client of rooms.get(room) || []) send(client, payload);
}

const port = Number(process.env.PORT || 3000);
server.listen(port, "0.0.0.0", () => {
  console.log(`Cross-device starter running on http://localhost:${port}`);
});
