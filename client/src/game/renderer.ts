/**
 * PALMPLAY Canvas 2D Renderer
 * Renders ONLY the virtual ball and a subtle motion trail / impact effect.
 * Completely transparent background, no borders, no nets, no divider lines,
 * and no visible skeleton/reticle dots.
 */

import { BallState, Vector2D } from '@shared/types';

interface TrailPoint {
  x: number;
  y: number;
  alpha: number;
  radius: number;
}

interface ImpactRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
}

export class GameRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private trail: TrailPoint[] = [];
  private impactRings: ImpactRing[] = [];
  private width: number = 0;
  private height: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to acquire 2D canvas context');
    }
    this.ctx = context;
    this.handleResize();
  }

  public handleResize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width;
    this.height = rect.height;

    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
  }

  /**
   * Trigger a brief, subtle impact ripple when a player hits the ball
   */
  public addImpact(arenaPos: Vector2D, color: string = '#38bdf8') {
    const px = arenaPos.x * this.width;
    const py = arenaPos.y * this.height;
    this.impactRings.push({
      x: px,
      y: py,
      radius: 8,
      maxRadius: 40,
      alpha: 0.8,
      color,
    });
  }

  /**
   * Render loop: clear canvas and render ONLY the ball, subtle trail, and ripple
   */
  public render(ball: BallState) {
    this.ctx.clearRect(0, 0, this.width, this.height);

    // 1. Subtle impact rings
    this.drawImpactRings();

    // 2. Subtle motion trail
    this.drawTrail(ball);

    // 3. The virtual ball
    this.drawBall(ball);
  }

  private drawTrail(ball: BallState) {
    const bx = ball.position.x * this.width;
    const by = ball.position.y * this.height;
    const r = ball.radius * Math.min(this.width, this.height);

    // Only record trail if ball is actually moving
    const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
    if (speed > 0.05) {
      this.trail.unshift({
        x: bx,
        y: by,
        alpha: 0.45,
        radius: r * 0.85,
      });
    }

    if (this.trail.length > 8) {
      this.trail.pop();
    }

    for (let i = 0; i < this.trail.length; i++) {
      const pt = this.trail[i];
      pt.alpha *= 0.8;
      pt.radius *= 0.94;

      this.ctx.save();
      this.ctx.fillStyle = `rgba(168, 85, 247, ${pt.alpha * 0.35})`;
      this.ctx.beginPath();
      this.ctx.arc(pt.x, pt.y, Math.max(pt.radius, 1), 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }
  }

  private drawBall(ball: BallState) {
    const px = ball.position.x * this.width;
    const py = ball.position.y * this.height;
    const r = Math.max(ball.radius * Math.min(this.width, this.height), 12);

    this.ctx.save();

    // Subtle outer ambient glow
    const glowGrad = this.ctx.createRadialGradient(px, py, r * 0.3, px, py, r * 2.2);
    glowGrad.addColorStop(0, 'rgba(192, 132, 252, 0.4)');
    glowGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
    this.ctx.fillStyle = glowGrad;
    this.ctx.beginPath();
    this.ctx.arc(px, py, r * 2.2, 0, Math.PI * 2);
    this.ctx.fill();

    // Core ball body
    const ballGrad = this.ctx.createRadialGradient(px - r * 0.3, py - r * 0.3, 1, px, py, r);
    ballGrad.addColorStop(0, '#ffffff');
    ballGrad.addColorStop(0.4, '#e9d5ff');
    ballGrad.addColorStop(1, '#a855f7');

    this.ctx.fillStyle = ballGrad;
    this.ctx.beginPath();
    this.ctx.arc(px, py, r, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.restore();
  }

  private drawImpactRings() {
    for (let i = this.impactRings.length - 1; i >= 0; i--) {
      const ring = this.impactRings[i];
      ring.radius += 2.2;
      ring.alpha *= 0.88;

      if (ring.alpha <= 0.02 || ring.radius >= ring.maxRadius) {
        this.impactRings.splice(i, 1);
        continue;
      }

      this.ctx.save();
      this.ctx.strokeStyle = ring.color;
      this.ctx.globalAlpha = ring.alpha;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.restore();
    }
  }
}
