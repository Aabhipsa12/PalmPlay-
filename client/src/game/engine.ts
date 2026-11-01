/**
 * PALMPLAY Standalone Game Engine
 * Pure TypeScript physics simulation in normalized 2D coordinate space [0, 1].
 * Completely decoupled from React and DOM rendering.
 */

import { BallState, GamePhase, PlayerRole, Vector2D } from '@shared/types';

export interface GameEngineCallbacks {
  onLaunch?: (ball: BallState, eventId: string) => void;
  onHit?: (ball: BallState, eventId: string, by: PlayerRole) => void;
  onMiss?: (missedBy: PlayerRole, rallyCount: number) => void;
  onPhaseChange?: (phase: GamePhase) => void;
}

export class GameEngine {
  private ball: BallState;
  private gamePhase: GamePhase = 'READY';
  private callbacks: GameEngineCallbacks = {};
  private lastHitCooldown: number = 0; // Cooldown timer in seconds
  private readonly defaultRadius = 0.028;
  private readonly minSpeed = 0.45;
  private readonly maxSpeed = 0.95;
  private readonly collisionForgiveness = 0.045; // Generous margin for webcam fingertip detection

  constructor(callbacks: GameEngineCallbacks = {}) {
    this.callbacks = callbacks;
    this.ball = this.getInitialBallState();
  }

  public getInitialBallState(): BallState {
    return {
      position: { x: 0.15, y: 0.5 },
      velocity: { x: 0, y: 0 },
      radius: this.defaultRadius,
      owner: 'player1',
      rallyCount: 0,
      bestRally: 0,
      timestamp: Date.now(),
    };
  }

  public getBall(): BallState {
    return { ...this.ball, position: { ...this.ball.position }, velocity: { ...this.ball.velocity } };
  }

  public getPhase(): GamePhase {
    return this.gamePhase;
  }

  public setPhase(phase: GamePhase) {
    this.gamePhase = phase;
    if (this.callbacks.onPhaseChange) {
      this.callbacks.onPhaseChange(phase);
    }
  }

  public setBall(ball: BallState) {
    this.ball = { ...ball, position: { ...ball.position }, velocity: { ...ball.velocity } };
  }

  /**
   * Launch ball from player's hand towards opponent
   */
  public launch(by: PlayerRole, startPos?: Vector2D, customEventId?: string): boolean {
    if (this.gamePhase !== 'READY' && this.gamePhase !== 'RALLY_RESET') {
      return false;
    }

    const eventId = customEventId || `launch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const x = startPos ? Math.max(0.05, Math.min(0.4, startPos.x)) : 0.15;
    const y = startPos ? Math.max(0.15, Math.min(0.85, startPos.y)) : 0.5;

    // Player 1 launches to right (+vx), Player 2 launches to left (-vx)
    const dir = by === 'player1' ? 1 : -1;
    const speed = 0.55;

    this.ball = {
      position: { x, y },
      velocity: { x: dir * speed, y: (Math.random() - 0.5) * 0.2 },
      radius: this.defaultRadius,
      owner: by,
      rallyCount: 1,
      bestRally: Math.max(this.ball.bestRally, 1),
      lastHitBy: by,
      lastEventId: eventId,
      timestamp: Date.now(),
    };

    this.lastHitCooldown = 0.35;
    this.setPhase('BALL_IN_FLIGHT');

    if (this.callbacks.onLaunch) {
      this.callbacks.onLaunch(this.getBall(), eventId);
    }
    return true;
  }

  /**
   * Check fingertip collision for receiving player
   */
  public checkFingertipCollision(
    fingertipArenaPos: Vector2D,
    playerRole: PlayerRole,
    customEventId?: string
  ): boolean {
    if (this.gamePhase !== 'BALL_IN_FLIGHT' && this.gamePhase !== 'WAITING_FOR_HIT') {
      return false;
    }

    // Only block if the same player tries to hit again during cooldown
    if (this.ball.lastHitBy === playerRole && this.lastHitCooldown > 0) {
      return false;
    }

    // Player can only hit when ball is traveling TOWARD them
    // Player 1 receiving: ball traveling left (vx < 0) and in player 1 zone (x <= 0.5)
    // Player 2 receiving: ball traveling right (vx > 0) and in player 2 zone (x >= 0.5)
    if (playerRole === 'player1' && this.ball.velocity.x >= 0) return false;
    if (playerRole === 'player2' && this.ball.velocity.x <= 0) return false;

    // Distance calculation
    const dx = this.ball.position.x - fingertipArenaPos.x;
    const dy = this.ball.position.y - fingertipArenaPos.y;
    const dist = Math.hypot(dx, dy);

    const hitDistance = this.ball.radius + this.collisionForgiveness;

    if (dist <= hitDistance) {
      // Valid collision!
      const eventId = customEventId || `hit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      
      // Calculate outgoing velocity with vertical deflection based on contact offset
      const currentSpeed = Math.hypot(this.ball.velocity.x, this.ball.velocity.y);
      const newSpeed = Math.min(this.maxSpeed, Math.max(this.minSpeed, currentSpeed * 1.05));

      // Reverse horizontal direction
      const newVx = (playerRole === 'player1' ? 1 : -1) * newSpeed * 0.88;
      
      // Vertical deflection: if hit below ball, dy > 0 -> deflect upward (-vy)
      const verticalDeflection = Math.max(-0.4, Math.min(0.4, (dy / hitDistance) * 0.45));
      const newVy = verticalDeflection * newSpeed;

      const newRally = this.ball.rallyCount + 1;
      const bestRally = Math.max(this.ball.bestRally, newRally);

      this.ball = {
        ...this.ball,
        velocity: { x: newVx, y: newVy },
        owner: playerRole,
        rallyCount: newRally,
        bestRally,
        lastHitBy: playerRole,
        lastEventId: eventId,
        timestamp: Date.now(),
      };

      this.lastHitCooldown = 0.3; // Prevent duplicate hits
      this.setPhase('BALL_IN_FLIGHT');

      if (this.callbacks.onHit) {
        this.callbacks.onHit(this.getBall(), eventId, playerRole);
      }
      return true;
    }

    return false;
  }

  /**
   * Physics simulation step
   * @param dt Elapsed time in seconds (clamped to prevent tab switch tunneling)
   */
  public update(dt: number) {
    if (this.lastHitCooldown > 0) {
      this.lastHitCooldown -= dt;
    }

    if (this.gamePhase !== 'BALL_IN_FLIGHT' && this.gamePhase !== 'WAITING_FOR_HIT') {
      return;
    }

    // Clamp dt to avoid teleportation after background tab
    const clampedDt = Math.min(dt, 0.05);

    // Update position
    let newX = this.ball.position.x + this.ball.velocity.x * clampedDt;
    let newY = this.ball.position.y + this.ball.velocity.y * clampedDt;
    let newVy = this.ball.velocity.y;

    // Top / Bottom boundary bounce
    const topLimit = this.ball.radius;
    const bottomLimit = 1.0 - this.ball.radius;

    if (newY <= topLimit) {
      newY = topLimit;
      newVy = Math.abs(newVy); // Bounce downwards
    } else if (newY >= bottomLimit) {
      newY = bottomLimit;
      newVy = -Math.abs(newVy); // Bounce upwards
    }

    this.ball.position = { x: newX, y: newY };
    this.ball.velocity.y = newVy;

    // Check if entered receiving zone
    if (this.ball.velocity.x > 0 && newX >= 0.55 && this.gamePhase === 'BALL_IN_FLIGHT') {
      this.setPhase('WAITING_FOR_HIT');
    } else if (this.ball.velocity.x < 0 && newX <= 0.45 && this.gamePhase === 'BALL_IN_FLIGHT') {
      this.setPhase('WAITING_FOR_HIT');
    }

    // Out of bounds check (Missed ball)
    if (newX > 1.05) {
      // Missed by player 2
      this.handleMiss('player2');
    } else if (newX < -0.05) {
      // Missed by player 1
      this.handleMiss('player1');
    }
  }

  private handleMiss(missedBy: PlayerRole) {
    const finalRally = this.ball.rallyCount;
    this.setPhase('RALLY_RESET');
    this.ball.velocity = { x: 0, y: 0 };
    // Ball spawns on the WINNER's side (the opponent of whoever missed)
    const winner: PlayerRole = missedBy === 'player1' ? 'player2' : 'player1';
    this.ball.position = { x: winner === 'player1' ? 0.2 : 0.8, y: 0.5 };
    this.ball.owner = winner;
    this.ball.rallyCount = 0;

    if (this.callbacks.onMiss) {
      this.callbacks.onMiss(missedBy, finalRally);
    }
  }

  public reset(servingPlayer: PlayerRole = 'player1') {
    this.setPhase('READY');
    this.ball = {
      position: { x: servingPlayer === 'player1' ? 0.15 : 0.85, y: 0.5 },
      velocity: { x: 0, y: 0 },
      radius: this.defaultRadius,
      owner: servingPlayer,
      rallyCount: 0,
      bestRally: this.ball.bestRally,
      timestamp: Date.now(),
    };
    this.lastHitCooldown = 0;
  }
}
