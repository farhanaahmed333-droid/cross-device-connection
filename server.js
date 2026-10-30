const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({
  server,
  maxPayload: 16 * 1024,
  perMessageDeflate: false
});
const rooms = new Map();

app.use(express.static(__dirname));
app.get("/health", (_req, res) => res.json({ ok: true, service: "cross-device-connection" }));

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}
function roomCount(room) {
  return (rooms.get(room) || new Set()).size;
}
function broadcast(room, payload) {
  for (const client of rooms.get(room) || []) send(client, payload);
}
function removeFromRoom(ws) {
  if (!ws.room || !rooms.has(ws.room)) return;
  const room = ws.room;
  rooms.get(room).delete(ws);
  ws.room = null;
  if (roomCount(room) === 0) rooms.delete(room);
  else broadcast(room, { type: "devices", count: roomCount(room) });
}
function allowRate(ws, key, limit, windowMs) {
  const now = Date.now();
  ws.rate[key] = (ws.rate[key] || []).filter((time) => now - time < windowMs);
  if (ws.rate[key].length >= limit) return false;
  ws.rate[key].push(now);
  return true;
}

wss.on("connection", (ws) => {
  ws.room = null;
  ws.deviceId = crypto.randomUUID().slice(0, 8);
  ws.isAlive = true;
  ws.rate = { join: [], message: [] };

  ws.on("pong", () => { ws.isAlive = true; });
  send(ws, { type: "connected", deviceId: ws.deviceId });

  ws.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return send(ws, { type: "error", message: "Invalid JSON message." });
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return send(ws, { type: "error", message: "Invalid message format." });
    }

    if (data.type === "join") {
      if (!allowRate(ws, "join", 6, 60_000)) {
        return send(ws, { type: "error", message: "Too many room changes. Please wait a minute." });
      }
      const room = String(data.room || "").trim().toUpperCase();
      if (!/^[A-Z0-9-]{4,20}$/.test(room)) {
        return send(ws, { type: "error", message: "Room code must be 4–20 letters, numbers, or hyphens." });
      }
      removeFromRoom(ws);
      ws.room = room;
      if (!rooms.has(room)) rooms.set(room, new Set());
      rooms.get(room).add(ws);
      send(ws, { type: "joined", room, count: roomCount(room) });
      broadcast(room, { type: "devices", count: roomCount(room) });
      return;
    }

    if (data.type === "message") {
      if (!ws.room) return send(ws, { type: "error", message: "Join a room first." });
      if (!allowRate(ws, "message", 20, 10_000)) {
        return send(ws, { type: "error", message: "Message rate limit reached. Please slow down." });
      }
      if (typeof data.text !== "string") {
        return send(ws, { type: "error", message: "Message text must be a string." });
      }
      const text = data.text.trim().slice(0, 1000);
      if (!text) return;
      broadcast(ws.room, {
        type: "message",
        from: ws.deviceId,
        text,
        sentAt: new Date().toISOString()
      });
    }
  });

  ws.on("close", () => removeFromRoom(ws));
  ws.on("error", () => removeFromRoom(ws));
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000);

wss.on("close", () => clearInterval(heartbeat));
const port = Number(process.env.PORT || 3000);
server.listen(port, "0.0.0.0", () => {
  console.log(`Cross-device starter running on port ${server.address().port}`);
});
