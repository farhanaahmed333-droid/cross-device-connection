https://github.com/farhanaahmed333-droid/cross-device-connection.git# Cross-device Connection Starter

A small, GitHub-ready prototype for connecting two browser devices through a shared room code.

## What it does
- Runs a small Node.js server.
- Lets two devices join the same room using a room code.
- Sends text messages between connected devices in real time using WebSockets.
- Shows connection status and connected-device count.

## Requirements
- Node.js 18 or newer
- npm

## Run locally
```bash
npm install
npm start
```
Open `http://localhost:3000` on one device. To test another device on the same Wi-Fi, open `http://YOUR-COMPUTER-LAN-IP:3000` on the second device.

Enter the same room code on both devices. For phones on different networks, deploy the server to a hosting provider that supports persistent WebSocket connections and use its HTTPS URL.

## Important limitations
This is a prototype, not end-to-end encrypted. Do not send passwords, private keys, or sensitive data. Room codes are not authentication. Add authentication, authorization, rate limits, and secure transport before production use.

## Debug checklist
1. Confirm both devices can open the server URL.
2. Confirm the server is running and port 3000 is reachable.
3. Confirm both devices use the exact same room code.
4. Check browser developer tools for WebSocket errors.
5. Check the terminal for server errors.

## GitHub
Create a new repository named `cross-device-connection`, then upload these files or push this folder with Git.
