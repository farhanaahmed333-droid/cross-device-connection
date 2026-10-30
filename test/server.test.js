const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const WebSocket = require("ws");

let child;
let baseUrl;
let wsUrl;

function waitForMessage(socket, predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error("Timed out waiting for WebSocket message"));
    }, timeoutMs);
    function onMessage(raw) {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve(message);
    }
    socket.on("message", onMessage);
  });
}

function connectSocket() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
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

test("two devices join a room and exchange a real-time message", async () => {
  const first = await connectSocket();
  const second = await connectSocket();
  try {
    const firstConnected = await waitForMessage(first, (m) => m.type === "connected");
    const secondConnected = await waitForMessage(second, (m) => m.type === "connected");
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
  const socket = await connectSocket();
  try {
    const error = waitForMessage(socket, (m) => m.type === "error");
    socket.send(JSON.stringify({ type: "join", room: "bad" }));
    assert.match((await error).message, /Room code must be/);
    assert.equal(socket.readyState, WebSocket.OPEN);
  } finally {
    socket.close();
  }
});
