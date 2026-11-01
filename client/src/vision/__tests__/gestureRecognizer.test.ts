import { describe, it, expect, beforeEach } from 'vitest';
import { GestureRecognizer, NormalizedLandmark } from '../gestureRecognizer';

describe('GestureRecognizer', () => {
  let recognizer: GestureRecognizer;

  beforeEach(() => {
    recognizer = new GestureRecognizer();
  });

  it('reports TRACKING_LOST for null or incomplete landmarks', () => {
    const resNull = recognizer.analyze(null);
    expect(resNull.gesture).toBe('TRACKING_LOST');
    expect(resNull.handPresent).toBe(false);

    const resIncomplete = recognizer.analyze([
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.4 },
    ]);
    expect(resIncomplete.gesture).toBe('TRACKING_LOST');
  });

  it('detects OPEN_PALM after stability threshold', () => {
    // Generate open palm landmarks where all fingers are extended away from wrist (y=0.8) upwards (tips at y=0.1)
    const openHand: NormalizedLandmark[] = Array.from({ length: 21 }, (_, i) => {
      // 0: wrist
      if (i === 0) return { x: 0.5, y: 0.8 };
      // Tips (4, 8, 12, 16, 20)
      if ([4, 8, 12, 16, 20].includes(i)) {
        return { x: 0.3 + (i / 20) * 0.4, y: 0.15 };
      }
      // PIPs / joints midway
      return { x: 0.3 + (i / 20) * 0.4, y: 0.55 };
    });

    // Frame 1
    const f1 = recognizer.analyze(openHand);
    expect(f1.handPresent).toBe(true);

    // Frame 2
    recognizer.analyze(openHand);

    // Frame 3 (Stability threshold is 3)
    const f3 = recognizer.analyze(openHand);
    expect(f3.gesture).toBe('OPEN_PALM');
    expect(f3.isStable).toBe(true);
  });

  it('detects INDEX_POINTING when index is extended and others are curled', () => {
    // Index extended (tip at y=0.1), while middle/ring/pinky tips are curled close to palm (y=0.6)
    const pointingHand: NormalizedLandmark[] = Array.from({ length: 21 }, (_, i) => {
      if (i === 0) return { x: 0.5, y: 0.8 }; // wrist
      if (i === 8) return { x: 0.5, y: 0.15 }; // index tip extended!
      if (i === 5 || i === 6 || i === 7) return { x: 0.5, y: 0.45 }; // index joint
      // Other finger tips curled close to wrist
      if ([12, 16, 20].includes(i)) return { x: 0.6, y: 0.72 };
      return { x: 0.5, y: 0.65 };
    });

    // Run 3 frames for stability
    recognizer.analyze(pointingHand);
    recognizer.analyze(pointingHand);
    const f3 = recognizer.analyze(pointingHand);

    expect(f3.gesture).toBe('INDEX_POINTING');
    expect(f3.indexFingertip?.x).toBe(0.5);
    expect(f3.indexFingertip?.y).toBe(0.15);
  });
});
