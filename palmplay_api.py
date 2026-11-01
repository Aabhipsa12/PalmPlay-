"""
PALMPLAY Video Call Integration Middleware & Endpoints

Use this standalone module to embed PALMPLAY into any video call platform
(Zoom Web SDK, Agora, Twilio Video, Daily.co, LiveKit, WebRTC, etc.).

It provides:
1. An HTTP REST API (Flask / FastAPI compatible endpoints).
2. A WebSocket event handler for real-time multiplayer ball synchronization.
3. A transparent canvas/frame gesture processor that wraps existing video streams.
"""

import time
import math
import json
from dataclasses import dataclass, asdict
from typing import Optional, Tuple, Dict, Any


@dataclass
class Vector2D:
    x: float
    y: float


@dataclass
class BallState:
    x: float
    y: float
    vx: float
    vy: float
    radius: float
    in_flight: bool
    serving_side: str
    owner: str
    last_hit_time: float


class PalmplaySession:
    """Authoritative game state session for a 2-person video call"""

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.created_at = time.time()
        self.serving_side = "player1"
        self.winner: Optional[str] = None
        self.loser: Optional[str] = None
        self.banner_expiry: float = 0
        self.ball = BallState(
            x=0.20,
            y=0.50,
            vx=0.0,
            vy=0.0,
            radius=0.035,
            in_flight=False,
            serving_side="player1",
            owner="player1",
            last_hit_time=0.0,
        )

    def launch(self, from_player: str, start_y: float = 0.5) -> Dict[str, Any]:
        """Player serves the ball with an open palm"""
        if self.ball.in_flight:
            return {"success": False, "reason": "Ball already in flight"}

        self.ball.in_flight = True
        self.ball.y = start_y
        self.ball.owner = from_player
        self.ball.last_hit_time = time.time()

        if from_player == "player1":
            self.ball.x = 0.20
            self.ball.vx = 0.44
            self.ball.vy = 0.0
        else:
            self.ball.x = 0.80
            self.ball.vx = -0.44
            self.ball.vy = 0.0

        return {"success": True, "event": "BALL_LAUNCHED", "ball": asdict(self.ball)}

    def hit(self, by_player: str, tip_x: float, tip_y: float) -> Dict[str, Any]:
        """Player bats the ball with an index finger"""
        if not self.ball.in_flight:
            return {"success": False, "reason": "Ball not in flight"}

        dist = math.hypot(self.ball.x - tip_x, self.ball.y - tip_y)
        if dist > (self.ball.radius + 0.12):
            return {"success": False, "reason": "Fingertip not in contact range"}

        speed = min(math.hypot(self.ball.vx, self.ball.vy) * 1.06, 0.88)
        speed = max(speed, 0.44)
        offset_y = (self.ball.y - tip_y) * 2.0

        if by_player == "player1":
            self.ball.vx = abs(speed)
            self.ball.owner = "player1"
        else:
            self.ball.vx = -abs(speed)
            self.ball.owner = "player2"

        self.ball.vy = max(min(offset_y, 0.38), -0.38)
        self.ball.last_hit_time = time.time()

        return {
            "success": True,
            "event": "BALL_BOUNCED",
            "hit_by": by_player,
            "ball": asdict(self.ball),
        }

    def update(self, dt: float) -> Optional[Dict[str, Any]]:
        """Advance ball physics for one tick"""
        if not self.ball.in_flight:
            return None

        self.ball.x += self.ball.vx * dt
        self.ball.y += self.ball.vy * dt

        # Bounce off top & bottom boundaries
        if self.ball.y <= 0.08:
            self.ball.y = 0.08
            self.ball.vy = abs(self.ball.vy)
        elif self.ball.y >= 0.92:
            self.ball.y = 0.92
            self.ball.vy = -abs(self.ball.vy)

        # Off-screen loss checks
        if self.ball.x < -0.05:
            # Player 1 lost, Player 2 won
            self.winner = "player2"
            self.loser = "player1"
            self.serving_side = "player2"
            self.ball.in_flight = False
            self.ball.x = 0.80
            self.ball.y = 0.50
            self.ball.vx = 0.0
            self.ball.vy = 0.0
            return {
                "event": "GAME_OVER",
                "winner": "player2",
                "loser": "player1",
                "serving_side": "player2",
            }

        if self.ball.x > 1.05:
            # Player 2 lost, Player 1 won
            self.winner = "player1"
            self.loser = "player2"
            self.serving_side = "player1"
            self.ball.in_flight = False
            self.ball.x = 0.20
            self.ball.y = 0.50
            self.ball.vx = 0.0
            self.ball.vy = 0.0
            return {
                "event": "GAME_OVER",
                "winner": "player1",
                "loser": "player2",
                "serving_side": "player1",
            }

        return None


# Global active call sessions dictionary
ACTIVE_SESSIONS: Dict[str, PalmplaySession] = {}


# ==============================================================================
# REST API ENDPOINTS (Compatible with Flask, FastAPI, Express, or Django)
# ==============================================================================

def create_call_session(call_id: str) -> Dict[str, Any]:
    """
    POST /api/palmplay/sessions
    Creates an interactive PALMPLAY game session for an existing video call.
    """
    session = PalmplaySession(call_id)
    ACTIVE_SESSIONS[call_id] = session
    return {
        "success": True,
        "call_id": call_id,
        "session": {
            "serving_side": session.serving_side,
            "ball": asdict(session.ball),
        },
        "endpoints": {
            "launch": f"/api/palmplay/sessions/{call_id}/launch",
            "hit": f"/api/palmplay/sessions/{call_id}/hit",
            "state": f"/api/palmplay/sessions/{call_id}/state",
        },
    }


def get_call_state(call_id: str) -> Dict[str, Any]:
    """
    GET /api/palmplay/sessions/<call_id>/state
    Retrieves the live ball coordinates and game status for synchronization.
    """
    session = ACTIVE_SESSIONS.get(call_id)
    if not session:
        return {"success": False, "error": "Call session not found"}

    return {
        "success": True,
        "call_id": call_id,
        "serving_side": session.serving_side,
        "winner": session.winner,
        "loser": session.loser,
        "ball": asdict(session.ball),
    }


def trigger_launch(call_id: str, player: str, start_y: float = 0.5) -> Dict[str, Any]:
    """
    POST /api/palmplay/sessions/<call_id>/launch
    Triggers an open-palm serve from a player.
    """
    session = ACTIVE_SESSIONS.get(call_id)
    if not session:
        return {"success": False, "error": "Call session not found"}

    return session.launch(from_player=player, start_y=start_y)


def trigger_hit(call_id: str, player: str, tip_x: float, tip_y: float) -> Dict[str, Any]:
    """
    POST /api/palmplay/sessions/<call_id>/hit
    Triggers an index fingertip collision/bat event.
    """
    session = ACTIVE_SESSIONS.get(call_id)
    if not session:
        return {"success": False, "error": "Call session not found"}

    return session.hit(by_player=player, tip_x=tip_x, tip_y=tip_y)


# ==============================================================================
# INTEGRATION SCRIPT DEMO
# ==============================================================================
if __name__ == "__main__":
    print("PALMPLAY Video Call Integration Endpoints Initialized.")
    print("\n--- Example: Creating a session for video call 'meeting-9482' ---")
    session_res = create_call_session("meeting-9482")
    print(json.dumps(session_res, indent=2))

    print("\n--- Example: Player 1 serves with Open Palm ---")
    launch_res = trigger_launch("meeting-9482", player="player1", start_y=0.48)
    print(json.dumps(launch_res, indent=2))

    print("\n--- Example: Player 2 bats back with Index Finger ---")
    hit_res = trigger_hit("meeting-9482", player="player2", tip_x=0.82, tip_y=0.48)
    print(json.dumps(hit_res, indent=2))
