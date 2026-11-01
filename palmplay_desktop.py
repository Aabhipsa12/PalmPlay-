"""
PALMPLAY - Video Call Catch & Bat (Desktop Window)
- Window 1 (Left / Player 1): Serves with Open Palm.
- Window 2 (Right / Player 2): Bats with Index Finger.
- Works seamlessly whether you are testing on 1 webcam or playing on 2 separate feeds.
- If missed: "LOST" in RED on missing side, "WINNER" in GREEN on scoring side.
- Next game spawns on WINNER'S side.
"""

import os
import sys
import time
import math
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import (
    HandLandmarker,
    HandLandmarkerOptions,
    RunningMode,
)

# Model path
MODEL_PATH = r"D:\AirCanvas AI\models\hand_landmarker.task"
if not os.path.exists(MODEL_PATH):
    script_dir = os.path.dirname(os.path.abspath(__file__))
    MODEL_PATH = os.path.join(script_dir, "models", "hand_landmarker.task")

WINDOW_WIDTH = 1280
WINDOW_HEIGHT = 720
HALF_WIDTH = WINDOW_WIDTH // 2


class Ball:
    def __init__(self):
        self.trail = []
        self.serving_side = "player1"
        self.reset(self.serving_side)

    def reset(self, serving_player):
        self.serving_side = serving_player
        if serving_player == "player1":
            self.x = 0.20
            self.y = 0.50
        else:
            self.x = 0.80
            self.y = 0.50
        self.vx = 0.0
        self.vy = 0.0
        self.radius = 0.035
        self.owner = serving_player
        self.in_flight = False
        self.trail.clear()
        self.last_hit_time = 0

    def launch(self, from_player, start_y=0.5):
        self.y = start_y
        self.owner = from_player
        self.in_flight = True
        self.last_hit_time = time.time()

        if from_player == "player1":
            self.x = 0.20
            self.vx = 0.42
            self.vy = (np.random.rand() - 0.5) * 0.12
        else:
            self.x = 0.80
            self.vx = -0.42
            self.vy = (np.random.rand() - 0.5) * 0.12

    def update(self, dt):
        if not self.in_flight:
            return None

        self.x += self.vx * dt
        self.y += self.vy * dt

        self.trail.append((self.x, self.y, time.time()))
        now = time.time()
        self.trail = [p for p in self.trail if now - p[2] < 0.28]

        # Wall bounce
        if self.y <= 0.08:
            self.y = 0.08
            self.vy = abs(self.vy)
        elif self.y >= 0.92:
            self.y = 0.92
            self.vy = -abs(self.vy)

        # Off-screen loss checks
        if self.x < -0.05:
            self.in_flight = False
            self.trail.clear()
            return "player1_lost"

        if self.x > 1.05:
            self.in_flight = False
            self.trail.clear()
            return "player2_lost"

        return None

    def check_hit(self, px, py):
        """
        Check if fingertip hits the incoming ball.
        """
        if not self.in_flight:
            return False

        if time.time() - self.last_hit_time < 0.25:
            return False

        dist = math.hypot(self.x - px, self.y - py)
        hit_margin = self.radius + 0.12  # Generous touch distance

        if dist < hit_margin:
            # Deflect ball back in opposite direction
            speed = min(math.hypot(self.vx, self.vy) * 1.06, 0.88)
            speed = max(speed, 0.44)
            offset_y = (self.y - py) * 2.0

            if self.vx > 0:
                # Was moving right -> bounce left toward player 1
                self.vx = -abs(speed)
                self.owner = "player2"
            else:
                # Was moving left -> bounce right toward player 2
                self.vx = abs(speed)
                self.owner = "player1"

            self.vy = max(min(offset_y, 0.38), -0.38)
            self.last_hit_time = time.time()
            return True

        return False


def is_open_palm(landmarks):
    """
    STRICT Open Palm Recognition:
    All 4 fingers (Index, Middle, Ring, Pinky) must be extended away from wrist.
    """
    wrist = landmarks[0]
    mcp_indices = [5, 9, 13, 17]
    tip_indices = [8, 12, 16, 20]

    extended_count = 0
    for mcp_idx, tip_idx in zip(mcp_indices, tip_indices):
        mcp = landmarks[mcp_idx]
        tip = landmarks[tip_idx]
        d_tip = math.hypot(tip.x - wrist.x, tip.y - wrist.y)
        d_mcp = math.hypot(mcp.x - wrist.x, mcp.y - wrist.y)
        if d_tip > d_mcp * 1.20:
            extended_count += 1

    return extended_count >= 4


def is_index_pointing(landmarks):
    """
    STRICT Index Finger Pointing Recognition:
    - Index finger MUST be extended away from its knuckle/pip joint.
    - At least 2 of the other fingers (Middle, Ring, Pinky) MUST be curled.
    """
    wrist = landmarks[0]

    # Index finger extension
    d_index_tip = math.hypot(landmarks[8].x - wrist.x, landmarks[8].y - wrist.y)
    d_index_pip = math.hypot(landmarks[6].x - wrist.x, landmarks[6].y - wrist.y)
    d_index_mcp = math.hypot(landmarks[5].x - wrist.x, landmarks[5].y - wrist.y)

    index_pointing = (d_index_tip > d_index_pip * 1.10) and (d_index_tip > d_index_mcp * 1.25)
    if not index_pointing:
        return False

    # Check other fingers curled (middle, ring, pinky)
    curled = 0
    for mcp_idx, tip_idx in [(9, 12), (13, 16), (17, 20)]:
        d_tip = math.hypot(landmarks[tip_idx].x - wrist.x, landmarks[tip_idx].y - wrist.y)
        d_mcp = math.hypot(landmarks[mcp_idx].x - wrist.x, landmarks[mcp_idx].y - wrist.y)
        if d_tip < d_mcp * 1.35:
            curled += 1

    return curled >= 2


def main():
    print("=" * 65)
    print("PALMPLAY - Video Call Strict Gestures & Win/Loss")
    print("=" * 65)
    print("Rules:")
    print(" 1. OPEN PALM: Serves the ball from the serving side.")
    print(" 2. INDEX FINGER POINTING: Bats/bounces the incoming ball back.")
    print(" 3. If missed / not pointed with index finger:")
    print("    - 'LOST' appears in RED on the side that missed.")
    print("    - 'WINNER' appears in GREEN on the side that scored.")
    print("    - Next serve begins on the WINNER'S side.")
    print("=" * 65)

    if not os.path.exists(MODEL_PATH):
        print(f"Error: Model not found at {MODEL_PATH}")
        sys.exit(1)

    options = HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=MODEL_PATH),
        running_mode=RunningMode.VIDEO,
        num_hands=2,
        min_hand_detection_confidence=0.50,
        min_hand_presence_confidence=0.50,
        min_tracking_confidence=0.50,
    )
    landmarker = HandLandmarker.create_from_options(options)

    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    if not cap.isOpened():
        cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Error: Could not open webcam.")
        sys.exit(1)

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    ball = Ball()
    prev_time = time.time()
    impact_effect_until = 0

    result_banner = None

    cv2.namedWindow("PALMPLAY - Live Call", cv2.WINDOW_NORMAL)
    cv2.resizeWindow("PALMPLAY - Live Call", WINDOW_WIDTH, WINDOW_HEIGHT)

    frame_timestamp_ms = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        now = time.time()
        dt = min(now - prev_time, 0.05)
        prev_time = now

        frame = cv2.flip(frame, 1)  # Mirror so physical movement matches screen
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

        frame_timestamp_ms += int(dt * 1000)
        results = landmarker.detect_for_video(mp_image, frame_timestamp_ms)

        # Build side-by-side call view:
        left_feed = cv2.resize(frame, (HALF_WIDTH, WINDOW_HEIGHT))
        right_feed = left_feed.copy()
        right_feed[:, :, 2] = np.clip(right_feed[:, :, 2].astype(np.int16) + 12, 0, 255).astype(np.uint8)

        call_screen = np.hstack([left_feed, right_feed])

        # Hand Gesture Tracking
        if results.hand_landmarks:
            for landmarks in results.hand_landmarks:
                raw_tip_x = landmarks[8].x
                raw_tip_y = landmarks[8].y
                palm_y = landmarks[0].y

                # Both sides can be tested seamlessly:
                # Map hand coordinate into left feed [0.0 to 0.5] and right feed [0.5 to 1.0]
                left_arena_x = raw_tip_x * 0.5
                right_arena_x = 0.5 + (raw_tip_x * 0.5)

                # 1. LAUNCH CHECK (Requires Open Palm on serving side)
                if not ball.in_flight:
                    if is_open_palm(landmarks):
                        ball.launch(ball.serving_side, palm_y)

                # 2. BATTING CHECK (Requires Index Finger Pointing)
                if ball.in_flight:
                    if is_index_pointing(landmarks):
                        # Check touch in current ball target area
                        target_x = right_arena_x if ball.vx > 0 else left_arena_x
                        if ball.check_hit(target_x, raw_tip_y):
                            impact_effect_until = time.time() + 0.28

        # Update ball physics & check if missed
        miss_event = ball.update(dt)

        if miss_event == "player1_lost":
            # Player 1 missed -> Player 2 wins
            result_banner = ("player2", "player1", time.time() + 2.5)
            ball.reset(serving_player="player2")

        elif miss_event == "player2_lost":
            # Player 2 missed -> Player 1 wins
            result_banner = ("player1", "player2", time.time() + 2.5)
            ball.reset(serving_player="player1")

        # Draw ball trail
        if ball.in_flight:
            for p in ball.trail:
                px = int(p[0] * WINDOW_WIDTH)
                py = int(p[1] * WINDOW_HEIGHT)
                age = now - p[2]
                alpha = max(1.0 - (age / 0.28), 0.0)
                tr_radius = int(ball.radius * WINDOW_HEIGHT * 0.65 * alpha)
                if tr_radius > 1 and 0 <= px < WINDOW_WIDTH:
                    cv2.circle(call_screen, (px, py), tr_radius, (230, 140, 255), -1)

        # Draw glowing virtual ball
        if 0.0 <= ball.x <= 1.0:
            bx = int(ball.x * WINDOW_WIDTH)
            by = int(ball.y * WINDOW_HEIGHT)
            br = int(ball.radius * WINDOW_HEIGHT)

            # Outer glow
            cv2.circle(call_screen, (bx, by), int(br * 1.9), (255, 180, 240), 2)
            # Solid core
            cv2.circle(call_screen, (bx, by), br, (255, 255, 255), -1)
            cv2.circle(call_screen, (bx, by), br - 3, (215, 90, 240), -1)

            # Impact ripple
            if time.time() < impact_effect_until:
                cv2.circle(call_screen, (bx, by), int(br * 2.8), (255, 230, 100), 3)

        # DISPLAY "WINNER" IN GREEN & "LOST" IN RED
        if result_banner:
            winner_side, loser_side, expiry = result_banner
            if time.time() < expiry:
                font = cv2.FONT_HERSHEY_DUPLEX

                # 1. "WINNER" in GREEN on the winner's window
                win_cx = (HALF_WIDTH // 2) if winner_side == "player1" else (HALF_WIDTH + HALF_WIDTH // 2)
                (w_w, w_h), _ = cv2.getTextSize("WINNER", font, 2.3, 6)
                wx = win_cx - w_w // 2
                wy = WINDOW_HEIGHT // 2 + w_h // 2

                cv2.rectangle(call_screen, (wx - 25, wy - w_h - 20), (wx + w_w + 25, wy + 20), (0, 0, 0), -1)
                cv2.putText(call_screen, "WINNER", (wx, wy), font, 2.3, (50, 220, 50), 6, cv2.LINE_AA)

                # 2. "LOST" in RED on the loser's window
                lose_cx = (HALF_WIDTH // 2) if loser_side == "player1" else (HALF_WIDTH + HALF_WIDTH // 2)
                (l_w, l_h), _ = cv2.getTextSize("LOST", font, 2.3, 6)
                lx = lose_cx - l_w // 2
                ly = WINDOW_HEIGHT // 2 + l_h // 2

                cv2.rectangle(call_screen, (lx - 25, ly - l_h - 20), (lx + l_w + 25, ly + 20), (0, 0, 0), -1)
                cv2.putText(call_screen, "LOST", (lx, ly), font, 2.3, (40, 40, 245), 6, cv2.LINE_AA)
            else:
                result_banner = None

        # Divider between two call feeds
        cv2.line(call_screen, (HALF_WIDTH, 0), (HALF_WIDTH, WINDOW_HEIGHT), (45, 45, 45), 2)

        cv2.imshow("PALMPLAY - Live Call", call_screen)
        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        elif key == ord("r"):
            ball.reset("player1")

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
