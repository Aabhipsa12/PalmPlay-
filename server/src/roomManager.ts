import {
  BallState,
  GamePhase,
  Participant,
  PlayerRole,
  RoomInfo,
} from '../../shared/types.js';

export interface InternalRoom extends RoomInfo {
  processedEventIds: Set<string>;
  lastActivity: number;
  ballState?: BallState;
  winner?: PlayerRole | null;
  loser?: PlayerRole | null;
}

export class RoomManager {
  public rooms = new Map<string, InternalRoom>();
  private socketToRoom = new Map<string, string>();

  /**
   * Generates a 6-character uppercase alphanumeric room code
   */
  private generateRoomId(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    for (let i = 0; i < 6; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  }

  /**
   * Creates or gets a session by custom callId (for integration endpoints)
   */
  public getOrCreateSession(callId: string): InternalRoom {
    const cleanId = callId.trim().toUpperCase();
    let room = this.rooms.get(cleanId);
    if (!room) {
      room = {
        roomId: cleanId,
        createdAt: Date.now(),
        participants: [],
        gamePhase: 'READY',
        currentRally: 0,
        bestRally: 0,
        servingPlayer: 'player1',
        processedEventIds: new Set<string>(),
        lastActivity: Date.now(),
        ballState: {
          position: { x: 0.20, y: 0.50 },
          velocity: { x: 0, y: 0 },
          radius: 0.035,
          owner: 'player1',
          rallyCount: 0,
          bestRally: 0,
          timestamp: Date.now(),
        },
        winner: null,
        loser: null,
      };
      this.rooms.set(cleanId, room);
    }
    return room;
  }

  public getSession(callId: string): InternalRoom | null {
    return this.rooms.get(callId.trim().toUpperCase()) || null;
  }

  /**
   * Creates a new private room hosted by the caller
   */
  public createRoom(
    socketId: string,
    displayName: string
  ): { roomId: string; participant: Participant; roomInfo: RoomInfo } {
    // If socket was in a room, clean it up first
    this.leaveRoom(socketId);

    let roomId = this.generateRoomId();
    while (this.rooms.has(roomId)) {
      roomId = this.generateRoomId();
    }

    const hostParticipant: Participant = {
      id: socketId,
      displayName: displayName.trim() || 'Player 1',
      role: 'player1',
      isReady: false,
      cameraActive: true,
      micActive: true,
      joinedAt: Date.now(),
    };

    const room: InternalRoom = {
      roomId,
      createdAt: Date.now(),
      participants: [hostParticipant],
      gamePhase: 'LOBBY',
      currentRally: 0,
      bestRally: 0,
      servingPlayer: 'player1',
      processedEventIds: new Set<string>(),
      lastActivity: Date.now(),
    };

    this.rooms.set(roomId, room);
    this.socketToRoom.set(socketId, roomId);

    return {
      roomId,
      participant: hostParticipant,
      roomInfo: this.getPublicRoomInfo(room),
    };
  }

  /**
   * Join an existing room (enforcing maximum of 2 participants)
   */
  public joinRoom(
    roomId: string,
    socketId: string,
    displayName: string
  ): { success: boolean; participant?: Participant; roomInfo?: RoomInfo; error?: string } {
    this.leaveRoom(socketId);

    const cleanRoomId = roomId.trim().toUpperCase();
    const room = this.rooms.get(cleanRoomId);

    if (!room) {
      return { success: false, error: 'Room not found. Check your code or invite link.' };
    }

    if (room.participants.length >= 2) {
      return { success: false, error: 'This room is full (maximum 2 players).' };
    }

    const guestParticipant: Participant = {
      id: socketId,
      displayName: displayName.trim() || 'Player 2',
      role: 'player2',
      isReady: false,
      cameraActive: true,
      micActive: true,
      joinedAt: Date.now(),
    };

    room.participants.push(guestParticipant);
    room.lastActivity = Date.now();
    this.socketToRoom.set(socketId, cleanRoomId);

    return {
      success: true,
      participant: guestParticipant,
      roomInfo: this.getPublicRoomInfo(room),
    };
  }

  /**
   * Updates participant ready state. When both are ready, advances game phase to READY
   */
  public setReady(
    socketId: string,
    isReady: boolean
  ): { roomInfo: RoomInfo | null; bothReady: boolean } {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return { roomInfo: null, bothReady: false };

    const room = this.rooms.get(roomId);
    if (!room) return { roomInfo: null, bothReady: false };

    const p = room.participants.find((part) => part.id === socketId);
    if (p) {
      p.isReady = isReady;
    }

    const bothReady =
      room.participants.length === 2 && room.participants.every((part) => part.isReady);

    if (bothReady) {
      room.gamePhase = 'READY';
    } else if (room.gamePhase === 'READY') {
      room.gamePhase = 'LOBBY';
    }

    room.lastActivity = Date.now();
    return { roomInfo: this.getPublicRoomInfo(room), bothReady };
  }

  /**
   * Validates ball launch event and deduplicates using eventId
   */
  public handleBallLaunch(
    socketId: string,
    ball: BallState,
    eventId: string
  ): { valid: boolean; roomInfo?: RoomInfo } {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return { valid: false };

    const room = this.rooms.get(roomId);
    if (!room) return { valid: false };

    // Deduplicate identical event
    if (room.processedEventIds.has(eventId)) {
      return { valid: false };
    }
    room.processedEventIds.add(eventId);

    const participant = room.participants.find((p) => p.id === socketId);
    if (!participant) return { valid: false };

    room.gamePhase = 'PLAYING';
    room.lastActivity = Date.now();

    return { valid: true, roomInfo: this.getPublicRoomInfo(room) };
  }

  /**
   * Validates ball hit event, updates rally score and deduplicates
   */
  public handleBallHit(
    socketId: string,
    ball: BallState,
    eventId: string,
    hitBy: PlayerRole
  ): { valid: boolean; roomInfo?: RoomInfo } {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return { valid: false };

    const room = this.rooms.get(roomId);
    if (!room) return { valid: false };

    // Deduplicate
    if (room.processedEventIds.has(eventId)) {
      return { valid: false };
    }
    room.processedEventIds.add(eventId);

    // Increment authoritative rally
    room.currentRally = ball.rallyCount;
    if (room.currentRally > room.bestRally) {
      room.bestRally = room.currentRally;
    }

    room.lastActivity = Date.now();
    return { valid: true, roomInfo: this.getPublicRoomInfo(room) };
  }

  /**
   * Handles miss / rally drop
   */
  public handleBallMiss(
    socketId: string,
    missedBy: PlayerRole
  ): { valid: boolean; roomInfo?: RoomInfo; servingPlayer: PlayerRole } {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return { valid: false, servingPlayer: 'player1' };

    const room = this.rooms.get(roomId);
    if (!room) return { valid: false, servingPlayer: 'player1' };

    // The player who missed serves the next ball
    room.servingPlayer = missedBy;
    room.currentRally = 0;
    room.gamePhase = 'READY';
    room.lastActivity = Date.now();

    return {
      valid: true,
      roomInfo: this.getPublicRoomInfo(room),
      servingPlayer: room.servingPlayer,
    };
  }

  /**
   * Removes participant on disconnect or leave
   */
  public leaveRoom(socketId: string): { roomId: string; roomInfo: RoomInfo | null } | null {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return null;

    this.socketToRoom.delete(socketId);
    const room = this.rooms.get(roomId);
    if (!room) return null;

    // Filter out participant
    room.participants = room.participants.filter((p) => p.id !== socketId);

    if (room.participants.length === 0) {
      // Room empty, delete room
      this.rooms.delete(roomId);
      return { roomId, roomInfo: null };
    } else {
      // One player remaining: reset to LOBBY
      room.gamePhase = 'LOBBY';
      room.currentRally = 0;
      room.participants[0].isReady = false;
      // If host left, elevate remaining player to player1
      if (room.participants[0].role !== 'player1') {
        room.participants[0].role = 'player1';
      }
      return { roomId, roomInfo: this.getPublicRoomInfo(room) };
    }
  }

  public getRoomBySocket(socketId: string): InternalRoom | null {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return null;
    return this.rooms.get(roomId) || null;
  }

  public getPublicRoomInfo(room: InternalRoom): RoomInfo {
    return {
      roomId: room.roomId,
      createdAt: room.createdAt,
      participants: room.participants.map((p) => ({ ...p })),
      gamePhase: room.gamePhase,
      currentRally: room.currentRally,
      bestRally: room.bestRally,
      servingPlayer: room.servingPlayer,
    };
  }
}
