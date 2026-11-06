const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { EventEmitter } = require("node:events");
const WebSocket = require("ws");

let child;
let baseUrl;
let wsUrl;

function waitForMessage(socket, predicate, timeoutMs = 3000, { startOnOpen = false } = {}) {
  return new Promise((resolve, reject) => {
    let timer;
    function cleanup() {
      clearTimeout(timer);
      socket.off("open", startTimer);
      socket.off("message", onMessage);
      socket.off("error", onError);
      socket.off("close", onClose);
    }
    function startTimer() {
      timer = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out waiting for WebSocket message"));
      }, timeoutMs);
    }
    function onError(error) { cleanup(); reject(error); }
    function onClose() { cleanup(); reject(new Error("WebSocket closed before message")); }
    function onMessage(raw) {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (!predicate(message)) return;
      cleanup();
      resolve(message);
    }
    socket.on("message", onMessage);
    socket.once("error", onError);
    socket.once("close", onClose);
    if (startOnOpen) socket.once("open", startTimer);
    else startTimer();
  });
}

function connectSocket() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    // The server sends "connected" immediately on connection. Subscribe before
    // waiting for "open" so the first server message cannot be missed.
    const connected = waitForMessage(socket, (m) => m.type === "connected", 3000, { startOnOpen: true });
    // The connection may fail or the greeting may time out before the caller awaits it.
    connected.catch(() => {});
    socket.once("open", () => resolve({ socket, connected }));
    socket.once("error", (error) => {
      socket.close();
      reject(error);
    });
  });
}

before(async () => {
  child = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Server did not start in time")), 8000);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      const match = output.match(/running on port (\d+)/);
      if (!match) return;
      clearTimeout(timer);
      const port = Number(match[1]);
      baseUrl = `http://127.0.0.1:${port}`;
      wsUrl = `ws://127.0.0.1:${port}`;
      resolve();
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited before startup (code ${code}): ${output}`));
    });
  });
});

after(() => {
  if (child && !child.killed) child.kill("SIGTERM");
});

test("health endpoint and frontend are served", async () => {
  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, service: "cross-device-connection" });

  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Cross-device Connection/);
});

test("greeting timeout starts after a slow socket opens", async () => {
  const socket = new EventEmitter();
  const greeting = waitForMessage(socket, (m) => m.type === "connected", 30, { startOnOpen: true });
  let settled = false;
  greeting.then(() => { settled = true; }, () => { settled = true; });
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(settled, false);
  socket.emit("open");
  socket.emit("message", Buffer.from('{"type":"connected"}'));
  assert.equal((await greeting).type, "connected");
  assert.equal(socket.listenerCount("message"), 0);
});

test("missing greeting times out after socket opens", async () => {
  const socket = new EventEmitter();
  const greeting = waitForMessage(socket, (m) => m.type === "connected", 20, { startOnOpen: true });
  socket.emit("open");
  await assert.rejects(greeting, /Timed out waiting for WebSocket message/);
  assert.equal(socket.listenerCount("message"), 0);
});

test("two devices join a room and exchange a real-time message", async () => {
  const firstConnection = await connectSocket();
  const secondConnection = await connectSocket();
  const first = firstConnection.socket;
  const second = secondConnection.socket;
  try {
    // Both listeners were registered inside connectSocket, before either
    // connection's first server message could arrive.
    const [firstConnected, secondConnected] = await Promise.all([
      firstConnection.connected,
      secondConnection.connected
    ]);
    assert.ok(firstConnected.deviceId);
    assert.ok(secondConnected.deviceId);
    assert.notEqual(firstConnected.deviceId, secondConnected.deviceId);

    const room = `TEST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const firstJoined = waitForMessage(first, (m) => m.type === "joined");
    first.send(JSON.stringify({ type: "join", room }));
    assert.equal((await firstJoined).count, 1);

    const secondJoined = waitForMessage(second, (m) => m.type === "joined");
    second.send(JSON.stringify({ type: "join", room }));
    assert.equal((await secondJoined).count, 2);

    const receivedByFirst = waitForMessage(first, (m) => m.type === "message");
    const receivedBySecond = waitForMessage(second, (m) => m.type === "message");
    first.send(JSON.stringify({ type: "message", text: "hello from device one" }));
    const [one, two] = await Promise.all([receivedByFirst, receivedBySecond]);
    assert.equal(one.text, "hello from device one");
    assert.equal(two.text, "hello from device one");
    assert.equal(one.from, firstConnected.deviceId);
    assert.equal(two.from, firstConnected.deviceId);
  } finally {
    first.close();
    second.close();
  }
});

test("invalid room codes are rejected without disconnecting the socket", async () => {
  const { socket, connected } = await connectSocket();
  try {
    await connected;
    const error = waitForMessage(socket, (m) => m.type === "error");
    socket.send(JSON.stringify({ type: "join", room: "bad" }));
    assert.match((await error).message, /Room code must be/);
    assert.equal(socket.readyState, WebSocket.OPEN);
  } finally {
    socket.close();
  }
});

