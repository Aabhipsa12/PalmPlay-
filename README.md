# PALMPLAY 🏓

PALMPLAY is a real-time, two-person video call game where two people play catch across screens with their physical hands.

- **Direct In-Call Experience**: No game lobbies, no separate dashboards. You are immediately on a video call side-by-side with your friend.
- **Gesture Throw & Bat**:
  - **Player 1**: Open your palm facing your camera to throw/serve the ball across the call toward Player 2.
  - **Player 2**: Move your index finger toward the ball. When your tracked fingertip touches the ball, it bats/bounces straight back to Player 1.
- **WebRTC & MediaPipe**: Direct low-latency video calling powered by WebRTC, with local in-browser hand tracking using MediaPipe Hand Landmarker.

---

## 🚀 How to Run

### 1. Start the Signaling Server
Open a terminal in `D:\GestureProjects\PALMPLAY`:
```bash
npm run dev:server
```
*(Runs on port 4000)*

### 2. Start the Video Call Web App
Open a second terminal in `D:\GestureProjects\PALMPLAY`:
```bash
npm run dev:client
```
*(Runs on port 3000)*

### 3. Play
1. Open `http://localhost:3000` in your browser.
2. Click **Start Video Call**.
3. Send the call link to your friend or open it in a second window.
4. You are both on the call together immediately, and you can throw and bat the ball back and forth with your hands!
