/**
 * PALMPLAY Gesture Recognizer
 * Analyzes normalized 2D/3D landmarks to detect Open Palm and Index-Pointing poses.
 * Uses geometric heuristics, finger-extension ratios, and temporal hysteresis.
 */

import { GestureType, HandTrackingState, Vector2D } from '@shared/types';

// MediaPipe Hand Landmark Indices
export const LANDMARK_INDEX = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

export interface NormalizedLandmark {
  x: number;
  y: number;
  z?: number;
}

export class GestureRecognizer {
  private stableGesture: GestureType = 'NONE';
  private candidateGesture: GestureType = 'NONE';
  private candidateCount: number = 0;
  private readonly stabilityThreshold: number = 3; // Frames required to confirm gesture

  /**
   * Euclidean distance between two 2D points
   */
  private distance(p1: NormalizedLandmark, p2: NormalizedLandmark): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.hypot(dx, dy);
  }

  /**
   * Checks whether a specific finger is extended away from wrist relative to its PIP joint
   */
  private isFingerExtended(
    wrist: NormalizedLandmark,
    mcp: NormalizedLandmark,
    pip: NormalizedLandmark,
    tip: NormalizedLandmark
  ): boolean {
    const dWristTip = this.distance(wrist, tip);
    const dWristPip = this.distance(wrist, pip);
    const dMcpTip = this.distance(mcp, tip);
    const dMcpPip = this.distance(mcp, pip);

    // Tip must be noticeably further from wrist and MCP than the PIP joint
    return dWristTip > dWristPip * 1.15 && dMcpTip > dMcpPip * 1.1;
  }

  /**
   * Checks whether a finger is curled back toward the palm/wrist
   */
  private isFingerCurled(
    wrist: NormalizedLandmark,
    _mcp: NormalizedLandmark,
    pip: NormalizedLandmark,
    tip: NormalizedLandmark
  ): boolean {
    const dWristTip = this.distance(wrist, tip);
    const dWristPip = this.distance(wrist, pip);
    // When curled, tip is closer to wrist than or very close to pip
    return dWristTip < dWristPip * 1.1;
  }

  /**
   * Analyze raw 21 hand landmarks and output recognized gesture with stability
   */
  public analyze(landmarks: NormalizedLandmark[] | null | undefined): HandTrackingState {
    if (!landmarks || landmarks.length < 21) {
      this.candidateGesture = 'TRACKING_LOST';
      this.candidateCount = 0;
      this.stableGesture = 'TRACKING_LOST';
      return {
        gesture: 'TRACKING_LOST',
        confidence: 0,
        isStable: false,
        handPresent: false,
      };
    }

    const wrist = landmarks[LANDMARK_INDEX.WRIST];
    const thumbTip = landmarks[LANDMARK_INDEX.THUMB_TIP];
    const indexMcp = landmarks[LANDMARK_INDEX.INDEX_MCP];
    const indexPip = landmarks[LANDMARK_INDEX.INDEX_PIP];
    const indexTip = landmarks[LANDMARK_INDEX.INDEX_TIP];

    const middleMcp = landmarks[LANDMARK_INDEX.MIDDLE_MCP];
    const middlePip = landmarks[LANDMARK_INDEX.MIDDLE_PIP];
    const middleTip = landmarks[LANDMARK_INDEX.MIDDLE_TIP];

    const ringMcp = landmarks[LANDMARK_INDEX.RING_MCP];
    const ringPip = landmarks[LANDMARK_INDEX.RING_PIP];
    const ringTip = landmarks[LANDMARK_INDEX.RING_TIP];

    const pinkyMcp = landmarks[LANDMARK_INDEX.PINKY_MCP];
    const pinkyPip = landmarks[LANDMARK_INDEX.PINKY_PIP];
    const pinkyTip = landmarks[LANDMARK_INDEX.PINKY_TIP];

    // Compute extensions
    const indexExtended = this.isFingerExtended(wrist, indexMcp, indexPip, indexTip);
    const middleExtended = this.isFingerExtended(wrist, middleMcp, middlePip, middleTip);
    const ringExtended = this.isFingerExtended(wrist, ringMcp, ringPip, ringTip);
    const pinkyExtended = this.isFingerExtended(wrist, pinkyMcp, pinkyPip, pinkyTip);

    const middleCurled = this.isFingerCurled(wrist, middleMcp, middlePip, middleTip);
    const ringCurled = this.isFingerCurled(wrist, ringMcp, ringPip, ringTip);
    const pinkyCurled = this.isFingerCurled(wrist, pinkyMcp, pinkyPip, pinkyTip);

    // Palm center approximation: average of wrist and MCP bases
    const palmCenter: Vector2D = {
      x: (wrist.x + indexMcp.x + middleMcp.x + ringMcp.x + pinkyMcp.x) / 5,
      y: (wrist.y + indexMcp.y + middleMcp.y + ringMcp.y + pinkyMcp.y) / 5,
    };

    const fingertipPos: Vector2D = {
      x: indexTip.x,
      y: indexTip.y,
    };

    let instantGesture: GestureType = 'NONE';
    let confidence = 0.7;

    // Open Palm: All 4 main fingers extended, and thumb is spaced from index
    const dThumbIndexMcp = this.distance(thumbTip, indexMcp);
    if (indexExtended && middleExtended && ringExtended && pinkyExtended && dThumbIndexMcp > 0.08) {
      instantGesture = 'OPEN_PALM';
      confidence = 0.95;
    }
    // Index Pointing: Index is extended while middle, ring, and pinky are curled
    else if (indexExtended && middleCurled && (ringCurled || pinkyCurled)) {
      instantGesture = 'INDEX_POINTING';
      confidence = 0.9;
    }

    // Apply temporal hysteresis (must maintain gesture for N frames to confirm)
    if (instantGesture === this.candidateGesture) {
      this.candidateCount++;
      if (this.candidateCount >= this.stabilityThreshold) {
        this.stableGesture = instantGesture;
      }
    } else {
      this.candidateGesture = instantGesture;
      this.candidateCount = 1;
    }

    return {
      gesture: this.stableGesture,
      confidence,
      palmCenter,
      indexFingertip: fingertipPos,
      isStable: this.candidateCount >= this.stabilityThreshold,
      handPresent: true,
      rawLandmarksCount: landmarks.length,
    };
  }

  public reset() {
    this.stableGesture = 'NONE';
    this.candidateGesture = 'NONE';
    this.candidateCount = 0;
  }
}
