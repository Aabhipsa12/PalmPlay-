/**
 * PALMPLAY MediaPipe Hand Tracker
 * Initializes the MediaPipe HandLandmarker in browser, runs real-time
 * inference on the webcam video element, and dispatches tracking states.
 */

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { GestureRecognizer, NormalizedLandmark } from './gestureRecognizer';
import { HandTrackingState, PlayerRole, Vector2D } from '@shared/types';

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private recognizer: GestureRecognizer = new GestureRecognizer();
  private isRunning: boolean = false;
  private animFrameId: number | null = null;
  private lastVideoTime: number = -1;
  private videoElement: HTMLVideoElement | null = null;
  private onStateCallback: ((state: HandTrackingState, rawLandmarks?: NormalizedLandmark[]) => void) | null = null;
  private isInitializing: boolean = false;

  /**
   * Initialize MediaPipe HandLandmarker model
   */
  public async init(modelUrl?: string): Promise<boolean> {
    if (this.landmarker) return true;
    if (this.isInitializing) return false;

    this.isInitializing = true;
    try {
      console.log('[HandTracker] Loading MediaPipe vision wasm...');
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      const taskPath =
        modelUrl ||
        'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

      console.log('[HandTracker] Loading hand landmarker model from:', taskPath);
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: taskPath,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.55,
        minTrackingConfidence: 0.55,
      });

      console.log('[HandTracker] HandLandmarker successfully loaded');
      this.isInitializing = false;
      return true;
    } catch (err) {
      console.error('[HandTracker] Error initializing HandLandmarker:', err);
      this.isInitializing = false;
      throw err;
    }
  }

  /**
   * Starts inference on the provided video element
   */
  public start(
    video: HTMLVideoElement,
    callback: (state: HandTrackingState, rawLandmarks?: NormalizedLandmark[]) => void
  ) {
    if (this.isRunning) {
      this.stop();
    }

    this.videoElement = video;
    this.onStateCallback = callback;
    this.isRunning = true;
    this.recognizer.reset();

    const loop = () => {
      if (!this.isRunning || !this.videoElement || !this.landmarker) {
        return;
      }

      if (
        this.videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        this.videoElement.currentTime !== this.lastVideoTime
      ) {
        this.lastVideoTime = this.videoElement.currentTime;
        const now = performance.now();

        try {
          const results = this.landmarker.detectForVideo(this.videoElement, now);

          if (results.landmarks && results.landmarks.length > 0) {
            const raw = results.landmarks[0] as NormalizedLandmark[];
            const state = this.recognizer.analyze(raw);
            if (this.onStateCallback) {
              this.onStateCallback(state, raw);
            }
          } else {
            const emptyState = this.recognizer.analyze(null);
            if (this.onStateCallback) {
              this.onStateCallback(emptyState);
            }
          }
        } catch (inferenceErr) {
          console.warn('[HandTracker] Inference error:', inferenceErr);
        }
      }

      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  /**
   * Map local camera normalized coordinates [0, 1] to shared arena coordinates [0, 1]
   * Player 1 zone: [0, 0.5]
   * Player 2 zone: [0.5, 1.0]
   */
  public static mapToArena(
    point: Vector2D,
    role: PlayerRole,
    isMirrored: boolean = true
  ): Vector2D {
    // When mirrored, flipping x feels natural for the user
    const cameraX = isMirrored ? 1.0 - point.x : point.x;

    let arenaX: number;
    if (role === 'player1') {
      // Left side: [0.0, 0.5]
      arenaX = cameraX * 0.5;
    } else {
      // Right side: [0.5, 1.0]
      arenaX = 0.5 + cameraX * 0.5;
    }

    return {
      x: Math.max(0, Math.min(1, arenaX)),
      y: Math.max(0, Math.min(1, point.y)),
    };
  }

  /**
   * Stop inference and release loop
   */
  public stop() {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.videoElement = null;
    this.onStateCallback = null;
    this.recognizer.reset();
  }

  /**
   * Cleanup everything
   */
  public cleanup() {
    this.stop();
    if (this.landmarker) {
      this.landmarker.close();
      this.landmarker = null;
    }
  }
}

export const handTracker = new HandTracker();
