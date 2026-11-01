# 🎾 PALMPLAY — Gesture-Controlled Video Call Interactive Game

> Real-time interactive gesture pong over peer-to-peer video calls using MediaPipe & WebRTC. Serve with an open palm, return with an index finger point, and embed directly into video platforms.

---

## 🌟 Overview

**PALMPLAY** transforms peer-to-peer video calls into an interactive, zero-controller AR pong match powered by computer vision.

Players communicate over real-time WebRTC video while a transparent, hardware-accelerated physics canvas overlays the video feed. Game physics and turns are governed strictly by natural hand gestures:

- ✋ **Open Palm Serve**: Starts the rally by serving the glowing ball from your screen to your peer.
- ☝️ **Index Finger Bat**: Returns and accelerates the ball back across the network when your fingertip strikes it.
- 🏆 **Authoritative Game States**: If a return is missed, the missing player's feed displays **LOST** in red, while the winner displays **WINNER** in green. The winning side earns serving privilege for the next round.
- 🔌 **Integration-Ready Architecture**: Includes dedicated REST and Socket.IO endpoints allowing PALMPLAY to be embedded as a transparent overlay layer inside third-party video calling platforms (Daily.co, LiveKit, Zoom SDK, Twilio Video).

---

## 🚀 Key Features

- **MediaPipe Hand Tracking**: High-framerate local hand landmark tracking with strict separation between open palm and pointing gestures.
- **Peer-to-Peer WebRTC Video**: Low-latency, direct browser-to-browser audiovisual streams with STUN/TURN signaling.
- **Authoritative Session State**: Node.js & Socket.IO backend handles room creation, ball deduplication, collision verification, and win/loss resolution.
- **Overlay & Embedded Architecture**: Zero intrusive UI—clean video stream with transparent HUD designed to mount into external calling apps.
- **Dual Runtime Support**: Run as a modern web app (React + Vite + TypeScript) or via the standalone desktop client (`palmplay_desktop.py`).

---

## 🏗️ Architecture

```
PALMPLAY/
├── client/                     # React + Vite + TypeScript frontend
│   ├── src/
│   │   ├── components/         # VideoCall, GameRoom, LandingPage, Modals
│   │   ├── game/               # Physics engine, transparent canvas renderer
│   │   ├── lib/                # Socket.IO client, WebRTC peer connection, Web Audio
│   │   └── vision/             # MediaPipe hand tracker & gesture recognizer
├── server/                     # Node.js + Express + Socket.IO authoritative backend
│   ├── src/
│   │   ├── index.ts            # REST API endpoints & Socket.IO signaling server
│   │   └── roomManager.ts      # Multi-room & authoritative game-state engine
│   └── test_rest_api.ts        # Automated integration verification test suite
├── shared/                     # Shared TypeScript interfaces & event payloads
├── palmplay_api.py             # Python integration endpoints & state manager
├── palmplay_desktop.py         # Standalone desktop OpenCV / MediaPipe video window
└── run_desktop.bat             # Quick-launch desktop client
```

---

## 🔌 Integration API Endpoints

PALMPLAY provides REST and Socket.IO interfaces for embedding inside existing video calling platforms:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/palmplay/sessions` | Create or attach to an interactive session using an external call ID |
| `GET` | `/api/palmplay/sessions/:call_id/state` | Retrieve live ball coordinates, serving side, and game phase |
| `POST` | `/api/palmplay/sessions/:call_id/launch` | Authoritative launch event (open palm serve) |
| `POST` | `/api/palmplay/sessions/:call_id/hit` | Authoritative hit validation with collision distance check |

### Socket.IO Synchronization Events
- `game:ball-launched` / `game:launched` — Broadcasts serve event and initial trajectory.
- `game:ball-hit` / `game:bounced` — Broadcasts validated index finger bounce.
- `game:ball-missed` / `game:missed` — Broadcasts missed ball, updating scores and winner/loser banners.
- `room-updated` — Syncs participant readiness, roles, and rally stats.

---

## ⚡ Quick Start

### 1. Browser Full-Stack Web App

#### Start Backend Server:
```bash
cd server
npm install
npm run dev
```

#### Start Frontend Client:
```bash
cd client
npm install
npm run dev
```
Open two browser windows at `http://localhost:3000` to start a peer-to-peer game!

---

### 2. Standalone Desktop Client (No Browser Required)

```bash
run_desktop.bat
```
*Or via command line:*
```bash
python palmplay_desktop.py
```
- Open your palm to serve.
- Point your index finger to bat the ball back and forth!

---

## 🛡️ License

MIT License. Built with ❤️ for interactive computer vision and real-time WebRTC communications.
