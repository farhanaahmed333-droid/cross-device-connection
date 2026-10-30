# Cross-device Connection

A Node.js + WebSocket prototype for connecting browser devices through a shared room code.

## Features
- Two or more browser devices can join the same room.
- Real-time text messages over WebSockets.
- Live connected-device count.
- Automatic browser reconnect and room rejoin.
- Health endpoint at `/health`.
- Render Blueprint included in `render.yaml`.

## Run locally
Requires Node.js 18+ and npm.

```bash
npm install
npm start
```

Open `http://localhost:3000` on the first device. On another device on the same Wi-Fi, open `http://YOUR-COMPUTER-LAN-IP:3000`. Enter the same room code on both devices.

## Deploy on Render
1. Connect this GitHub repository to Render.
2. Create a new Blueprint using the repository.
3. Render reads `render.yaml`, installs dependencies, starts `npm start`, and checks `/health`.
4. Open the generated HTTPS URL on both devices. The browser client automatically uses secure WebSockets (WSS).

## Current safety limits
The server enforces a 16 KB WebSocket payload limit, basic per-connection rate limits, input validation, and ping/pong heartbeats.

**This remains a prototype.** Room codes are not authentication, messages are not end-to-end encrypted, and rooms are held in server memory. Do not send passwords, private keys, or sensitive data. Before production use, add authenticated room membership, secure key exchange and end-to-end encryption, abuse controls, and persistent/shared infrastructure if deploying multiple server instances.

## Health check
Visit `/health`. A healthy server returns JSON with `ok: true`.
