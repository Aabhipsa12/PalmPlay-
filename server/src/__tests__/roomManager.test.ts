import { describe, it, expect, beforeEach } from 'vitest';
import { RoomManager } from '../roomManager.js';
import { BallState } from '../../../shared/types.js';

describe('RoomManager - PALMPLAY Multi-Player Rooms', () => {
  let roomManager: RoomManager;

  beforeEach(() => {
    roomManager = new RoomManager();
  });

  it('creates a room with Player 1 as host', () => {
    const { roomId, participant, roomInfo } = roomManager.createRoom('socket-1', 'Alice');
    expect(roomId).toBeDefined();
    expect(roomId.length).toBe(6);
    expect(participant.role).toBe('player1');
    expect(participant.displayName).toBe('Alice');
    expect(roomInfo.participants.length).toBe(1);
    expect(roomInfo.gamePhase).toBe('LOBBY');
    expect(roomInfo.currentRally).toBe(0);
  });

  it('allows Player 2 to join as guest', () => {
    const { roomId } = roomManager.createRoom('socket-1', 'Alice');
    const joinResult = roomManager.joinRoom(roomId, 'socket-2', 'Bob');

    expect(joinResult.success).toBe(true);
    expect(joinResult.participant?.role).toBe('player2');
    expect(joinResult.participant?.displayName).toBe('Bob');
    expect(joinResult.roomInfo?.participants.length).toBe(2);
  });

  it('strictly limits rooms to 2 players', () => {
    const { roomId } = roomManager.createRoom('socket-1', 'Alice');
    roomManager.joinRoom(roomId, 'socket-2', 'Bob');

    const thirdResult = roomManager.joinRoom(roomId, 'socket-3', 'Charlie');
    expect(thirdResult.success).toBe(false);
    expect(thirdResult.error).toContain('maximum 2 players');
  });

  it('transitions to READY phase when both players set ready', () => {
    const { roomId } = roomManager.createRoom('socket-1', 'Alice');
    roomManager.joinRoom(roomId, 'socket-2', 'Bob');

    const ready1 = roomManager.setReady('socket-1', true);
    expect(ready1.bothReady).toBe(false);
    expect(ready1.roomInfo?.gamePhase).toBe('LOBBY');

    const ready2 = roomManager.setReady('socket-2', true);
    expect(ready2.bothReady).toBe(true);
    expect(ready2.roomInfo?.gamePhase).toBe('READY');
  });

  it('validates ball launch and updates gamePhase to PLAYING', () => {
    const { roomId } = roomManager.createRoom('socket-1', 'Alice');
    roomManager.joinRoom(roomId, 'socket-2', 'Bob');

    const ball: BallState = {
      position: { x: 0.15, y: 0.5 },
      velocity: { x: 0.5, y: 0 },
      radius: 0.028,
      owner: 'player1',
      rallyCount: 0,
      bestRally: 0,
      timestamp: Date.now(),
    };

    const launchResult = roomManager.handleBallLaunch('socket-1', ball, 'event-1');
    expect(launchResult.valid).toBe(true);
    expect(launchResult.roomInfo?.gamePhase).toBe('PLAYING');

    // Deduplication check: duplicate eventId should be rejected
    const duplicateLaunch = roomManager.handleBallLaunch('socket-1', ball, 'event-1');
    expect(duplicateLaunch.valid).toBe(false);
  });

  it('validates ball hit and increments authoritative rally score', () => {
    const { roomId } = roomManager.createRoom('socket-1', 'Alice');
    roomManager.joinRoom(roomId, 'socket-2', 'Bob');

    const ball: BallState = {
      position: { x: 0.85, y: 0.5 },
      velocity: { x: -0.55, y: 0.1 },
      radius: 0.028,
      owner: 'player2',
      rallyCount: 1,
      bestRally: 1,
      timestamp: Date.now(),
    };

    const hitResult = roomManager.handleBallHit('socket-2', ball, 'hit-event-1', 'player2');
    expect(hitResult.valid).toBe(true);
    expect(hitResult.roomInfo?.currentRally).toBe(1);
    expect(hitResult.roomInfo?.bestRally).toBe(1);
  });

  it('handles player leaving room cleanly', () => {
    const { roomId } = roomManager.createRoom('socket-1', 'Alice');
    roomManager.joinRoom(roomId, 'socket-2', 'Bob');

    const leaveResult = roomManager.leaveRoom('socket-2');
    expect(leaveResult).not.toBeNull();
    expect(leaveResult?.roomInfo?.participants.length).toBe(1);
    expect(leaveResult?.roomInfo?.gamePhase).toBe('LOBBY');

    // When the last player leaves, the room should be deleted
    const finalLeave = roomManager.leaveRoom('socket-1');
    expect(finalLeave?.roomInfo).toBeNull();
  });
});
