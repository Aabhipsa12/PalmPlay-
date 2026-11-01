import { describe, it, expect, vi } from 'vitest';
import { GameEngine } from '../engine';

describe('GameEngine Physics and Logic', () => {
  it('initializes with correct default state in ready phase', () => {
    const engine = new GameEngine();
    const ball = engine.getBall();

    expect(engine.getPhase()).toBe('READY');
    expect(ball.position.x).toBe(0.15);
    expect(ball.position.y).toBe(0.5);
    expect(ball.velocity.x).toBe(0);
    expect(ball.velocity.y).toBe(0);
    expect(ball.rallyCount).toBe(0);
  });

  it('launches ball towards player 2 when player 1 launches', () => {
    const onLaunch = vi.fn();
    const engine = new GameEngine({ onLaunch });

    const success = engine.launch('player1', { x: 0.1, y: 0.4 });
    expect(success).toBe(true);

    const ball = engine.getBall();
    expect(engine.getPhase()).toBe('BALL_IN_FLIGHT');
    expect(ball.velocity.x).toBeGreaterThan(0); // Moving towards player 2
    expect(onLaunch).toHaveBeenCalledTimes(1);
  });

  it('updates ball position over elapsed delta time', () => {
    const engine = new GameEngine();
    engine.launch('player1');

    const initialX = engine.getBall().position.x;
    const vx = engine.getBall().velocity.x;

    // Simulate 0.05 seconds
    engine.update(0.05);

    const newX = engine.getBall().position.x;
    expect(newX).toBeCloseTo(initialX + vx * 0.05, 3);
  });

  it('bounces vertically when hitting top and bottom boundaries', () => {
    const engine = new GameEngine();
    engine.launch('player1');

    // Place ball near top wall moving upwards
    const ball = engine.getBall();
    ball.position.y = 0.01;
    ball.velocity.y = -0.5; // moving up
    engine.setBall(ball);

    engine.update(0.02);
    // Should bounce downward (positive vy)
    expect(engine.getBall().velocity.y).toBeGreaterThan(0);

    // Place ball near bottom wall moving downwards
    const ballBottom = engine.getBall();
    ballBottom.position.y = 0.99;
    ballBottom.velocity.y = 0.5; // moving down
    engine.setBall(ballBottom);

    engine.update(0.02);
    // Should bounce upward (negative vy)
    expect(engine.getBall().velocity.y).toBeLessThan(0);
  });

  it('detects fingertip collision and reverses direction with bounce', () => {
    const onHit = vi.fn();
    const engine = new GameEngine({ onHit });
    engine.launch('player1');

    // Move ball into Player 2 receiving zone
    const ball = engine.getBall();
    ball.position = { x: 0.85, y: 0.5 };
    ball.velocity = { x: 0.6, y: 0 };
    engine.setBall(ball);

    // Player 2 index finger touches near ball
    const hit = engine.checkFingertipCollision({ x: 0.86, y: 0.51 }, 'player2');
    expect(hit).toBe(true);

    const updatedBall = engine.getBall();
    expect(updatedBall.velocity.x).toBeLessThan(0); // Reversed towards player 1!
    expect(updatedBall.rallyCount).toBe(2);
    expect(onHit).toHaveBeenCalledTimes(1);
  });

  it('prevents duplicate hits within cooldown period', () => {
    const engine = new GameEngine();
    engine.launch('player1');

    const ball = engine.getBall();
    ball.position = { x: 0.85, y: 0.5 };
    ball.velocity = { x: 0.6, y: 0 };
    engine.setBall(ball);

    const firstHit = engine.checkFingertipCollision({ x: 0.85, y: 0.5 }, 'player2');
    expect(firstHit).toBe(true);

    // Immediate second hit attempt during cooldown should return false
    const secondHit = engine.checkFingertipCollision({ x: 0.85, y: 0.5 }, 'player2');
    expect(secondHit).toBe(false);
  });

  it('triggers miss and resets rally when ball goes out of bounds', () => {
    const onMiss = vi.fn();
    const engine = new GameEngine({ onMiss });
    engine.launch('player1');

    const ball = engine.getBall();
    ball.position = { x: 1.04, y: 0.5 };
    ball.velocity = { x: 0.5, y: 0 };
    engine.setBall(ball);

    // Update pushes it past 1.05
    engine.update(0.04);

    expect(engine.getPhase()).toBe('RALLY_RESET');
    expect(onMiss).toHaveBeenCalledWith('player2', 1);
  });
});
