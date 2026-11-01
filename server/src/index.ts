import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { RoomManager } from './roomManager.js';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  SignalingOfferPayload,
  SignalingAnswerPayload,
  SignalingIcePayload,
} from '../../shared/types.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = Number(process.env.PORT) || 4001;
const CLIENT_URL = process.env.CLIENT_URL || '*';

app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());

// 1. Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'PALMPLAY Server',
    timestamp: Date.now(),
  });
});

// ==============================================================================
// PALMPLAY VIDEO CALL INTEGRATION REST API
// ==============================================================================

// POST /api/palmplay/sessions - Create or attach to an interactive PALMPLAY session for a call
app.post('/api/palmplay/sessions', (req, res) => {
  try {
    const { call_id } = req.body || {};
    if (!call_id || typeof call_id !== 'string' || !call_id.trim()) {
      return res.status(400).json({
        success: false,
        error: 'call_id is required and must be a non-empty string',
      });
    }

    const cleanId = call_id.trim();
    const existing = roomManager.getSession(cleanId);
    if (existing) {
      return res.status(200).json({
        success: true,
        call_id: cleanId,
        already_existed: true,
        session: {
          serving_side: existing.servingPlayer,
          gamePhase: existing.gamePhase,
          ball: existing.ballState,
        },
        endpoints: {
          launch: `/api/palmplay/sessions/${cleanId}/launch`,
          hit: `/api/palmplay/sessions/${cleanId}/hit`,
          state: `/api/palmplay/sessions/${cleanId}/state`,
        },
      });
    }

    const room = roomManager.getOrCreateSession(cleanId);
    return res.status(201).json({
      success: true,
      call_id: cleanId,
      session: {
        serving_side: room.servingPlayer,
        gamePhase: room.gamePhase,
        ball: room.ballState,
      },
      endpoints: {
        launch: `/api/palmplay/sessions/${cleanId}/launch`,
        hit: `/api/palmplay/sessions/${cleanId}/hit`,
        state: `/api/palmplay/sessions/${cleanId}/state`,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/palmplay/sessions/:call_id/state - Retrieve live ball state and game status
app.get('/api/palmplay/sessions/:call_id/state', (req, res) => {
  const { call_id } = req.params;
  const room = roomManager.getSession(call_id);
  if (!room) {
    return res.status(404).json({
      success: false,
      error: `Call session '${call_id}' not found`,
    });
  }

  return res.status(200).json({
    success: true,
    call_id: room.roomId,
    gamePhase: room.gamePhase,
    serving_side: room.servingPlayer,
    winner: room.winner || null,
    loser: room.loser || null,
    rallyCount: room.currentRally,
    bestRally: room.bestRally,
    ball: room.ballState || {
      position: { x: room.servingPlayer === 'player1' ? 0.20 : 0.80, y: 0.50 },
      velocity: { x: 0, y: 0 },
      radius: 0.035,
      owner: room.servingPlayer,
      rallyCount: 0,
      bestRally: room.bestRally,
      timestamp: Date.now(),
    },
  });
});

// POST /api/palmplay/sessions/:call_id/launch - Trigger an open palm ball serve
app.post('/api/palmplay/sessions/:call_id/launch', (req, res) => {
  const { call_id } = req.params;
  const { player, start_y } = req.body || {};

  const room = roomManager.getSession(call_id);
  if (!room) {
    return res.status(404).json({
      success: false,
      error: `Call session '${call_id}' not found`,
    });
  }

  if (player !== 'player1' && player !== 'player2') {
    return res.status(400).json({
      success: false,
      error: "Invalid player identifier. Must be 'player1' or 'player2'",
    });
  }

  if (room.gamePhase === 'PLAYING') {
    return res.status(409).json({
      success: false,
      error: 'Ball already in flight (duplicate launch)',
    });
  }

  const yCoord = typeof start_y === 'number' && !isNaN(start_y) ? Math.min(Math.max(start_y, 0.05), 0.95) : 0.50;
  const isP1 = player === 'player1';

  room.gamePhase = 'PLAYING';
  room.ballState = {
    position: { x: isP1 ? 0.20 : 0.80, y: yCoord },
    velocity: { x: isP1 ? 0.44 : -0.44, y: 0.0 },
    radius: 0.035,
    owner: player,
    rallyCount: 0,
    bestRally: room.bestRally,
    timestamp: Date.now(),
  };
  room.lastActivity = Date.now();
  room.winner = null;
  room.loser = null;

  const eventPayload = {
    roomId: room.roomId,
    ball: room.ballState,
    by: player,
    startPosition: room.ballState.position,
    initialVelocity: room.ballState.velocity,
    eventId: `api-launch-${Date.now()}`,
    timestamp: Date.now(),
  };

  // Broadcast to Socket.IO clients connected to this call room
  io.to(room.roomId).emit('game:ball-launched', eventPayload);
  io.to(room.roomId).emit('game:launched', eventPayload);
  io.to(room.roomId).emit('room-updated', roomManager.getPublicRoomInfo(room));

  return res.status(200).json({
    success: true,
    event: 'BALL_LAUNCHED',
    ball: room.ballState,
  });
});

// POST /api/palmplay/sessions/:call_id/hit - Trigger an index fingertip collision/bounce
app.post('/api/palmplay/sessions/:call_id/hit', (req, res) => {
  const { call_id } = req.params;
  const { player, tip_x, tip_y } = req.body || {};

  const room = roomManager.getSession(call_id);
  if (!room) {
    return res.status(404).json({
      success: false,
      error: `Call session '${call_id}' not found`,
    });
  }

  if (player !== 'player1' && player !== 'player2') {
    return res.status(400).json({
      success: false,
      error: "Invalid player identifier. Must be 'player1' or 'player2'",
    });
  }

  if (room.gamePhase !== 'PLAYING' || !room.ballState) {
    return res.status(400).json({
      success: false,
      error: 'Ball not in flight',
    });
  }

  if (typeof tip_x !== 'number' || typeof tip_y !== 'number' || isNaN(tip_x) || isNaN(tip_y)) {
    return res.status(400).json({
      success: false,
      error: 'tip_x and tip_y numbers are required',
    });
  }

  const dx = room.ballState.position.x - tip_x;
  const dy = room.ballState.position.y - tip_y;
  const dist = Math.hypot(dx, dy);

  // Contact range check: radius (0.035) + tolerance (0.12) = 0.155
  if (dist > (room.ballState.radius + 0.12)) {
    return res.status(400).json({
      success: false,
      error: 'Fingertip not in contact range',
      distance: dist,
      maxAllowedRange: room.ballState.radius + 0.12,
    });
  }

  const currentSpeed = Math.hypot(room.ballState.velocity.x, room.ballState.velocity.y) || 0.44;
  const speed = Math.max(0.44, Math.min(currentSpeed * 1.06, 0.88));
  const offsetY = (room.ballState.position.y - tip_y) * 2.0;

  room.currentRally += 1;
  if (room.currentRally > room.bestRally) {
    room.bestRally = room.currentRally;
  }

  room.ballState.owner = player;
  room.ballState.velocity = {
    x: player === 'player1' ? Math.abs(speed) : -Math.abs(speed),
    y: Math.max(-0.38, Math.min(0.38, offsetY)),
  };
  room.ballState.rallyCount = room.currentRally;
  room.ballState.bestRally = room.bestRally;
  room.ballState.timestamp = Date.now();
  room.lastActivity = Date.now();

  const hitPayload = {
    roomId: room.roomId,
    ball: room.ballState,
    by: player,
    hitBy: player,
    hitPosition: { x: tip_x, y: tip_y },
    contactPoint: { x: tip_x, y: tip_y },
    newVelocity: room.ballState.velocity,
    rallyCount: room.currentRally,
    bestRally: room.bestRally,
    eventId: `api-hit-${Date.now()}`,
    timestamp: Date.now(),
  };

  io.to(room.roomId).emit('game:ball-hit', hitPayload);
  io.to(room.roomId).emit('game:bounced', {
    ...hitPayload,
    bestRally: room.bestRally,
  });
  io.to(room.roomId).emit('room-updated', roomManager.getPublicRoomInfo(room));

  return res.status(200).json({
    success: true,
    event: 'BALL_BOUNCED',
    hit_by: player,
    rallyCount: room.currentRally,
    bestRally: room.bestRally,
    ball: room.ballState,
  });
});

// 2. Integration REST API: Programmatically create a video call room from another service
app.post('/api/rooms', (req, res) => {
  try {
    const { hostName } = req.body || {};
    const dummyHostId = 'ext-' + Math.random().toString(36).substring(2, 9);
    const { roomId, roomInfo } = roomManager.createRoom(
      dummyHostId,
      hostName || 'Host'
    );

    res.status(201).json({
      success: true,
      roomId,
      callUrl: `${req.protocol}://${req.get('host')}/?room=${roomId}`,
      roomInfo,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Integration REST API: Check call room status by ID
app.get('/api/rooms/:roomId', (req, res) => {
  const cleanId = req.params.roomId.trim().toUpperCase();
  const room = (roomManager as any).rooms.get(cleanId);
  if (!room) {
    return res.status(404).json({ success: false, error: 'Room not found' });
  }
  res.json({
    success: true,
    room: roomManager.getPublicRoomInfo(room),
  });
});

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST'],
  },
});

const roomManager = new RoomManager();

io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  // Create private room
  socket.on('create-room', (data, callback) => {
    try {
      const { roomId, participant, roomInfo } = roomManager.createRoom(
        socket.id,
        data.displayName || 'Player 1'
      );
      socket.join(roomId);
      console.log(`[Room Created] Room ID: ${roomId} by ${socket.id}`);
      callback({
        success: true,
        roomId,
        participant,
        roomInfo,
      });
    } catch (err: any) {
      console.error('[Create Room Error]:', err);
      callback({ success: false, error: err.message || 'Failed to create room' });
    }
  });

  // Join room
  socket.on('join-room', (data, callback) => {
    try {
      const result = roomManager.joinRoom(
        data.roomId,
        socket.id,
        data.displayName || 'Player 2'
      );

      if (!result.success || !result.participant || !result.roomInfo) {
        return callback({
          success: false,
          error: result.error || 'Could not join room',
        });
      }

      const cleanRoomId = data.roomId.trim().toUpperCase();
      socket.join(cleanRoomId);
      console.log(`[Room Joined] Player ${socket.id} joined room ${cleanRoomId}`);

      // Notify caller
      callback({
        success: true,
        participant: result.participant,
        roomInfo: result.roomInfo,
      });

      // Notify host and other players
      socket.to(cleanRoomId).emit('peer-joined', result.participant);
      io.to(cleanRoomId).emit('room-updated', result.roomInfo);
    } catch (err: any) {
      console.error('[Join Room Error]:', err);
      callback({ success: false, error: err.message || 'Failed to join room' });
    }
  });

  // Set ready state
  socket.on('set-ready', (data) => {
    const { roomInfo, bothReady } = roomManager.setReady(socket.id, data.isReady);
    if (roomInfo) {
      io.to(roomInfo.roomId).emit('room-updated', roomInfo);
      if (bothReady) {
        console.log(`[Game Ready] Both players ready in room ${roomInfo.roomId}`);
      }
    }
  });

  // Game: Launch Ball
  socket.on('game:launch', (payload) => {
    if (!payload.ball) {
      payload.ball = {
        position: payload.startPosition || { x: 0.15, y: 0.5 },
        velocity: payload.initialVelocity || { x: 0.5, y: 0 },
        radius: 0.028,
        owner: payload.by || 'player1',
        rallyCount: 0,
        bestRally: 0,
        timestamp: payload.timestamp || Date.now(),
      };
    }
    const result = roomManager.handleBallLaunch(socket.id, payload.ball, payload.eventId);
    if (result.valid && result.roomInfo) {
      // Broadcast launch event to both participants
      io.to(result.roomInfo.roomId).emit('game:ball-launched', payload);
      io.to(result.roomInfo.roomId).emit('game:launched', payload);
      io.to(result.roomInfo.roomId).emit('room-updated', result.roomInfo);
    }
  });

  // Game: Hit Ball
  socket.on('game:hit', (payload) => {
    const hitter = payload.hitBy || payload.by || 'player1';
    if (!payload.ball) {
      payload.ball = {
        position: payload.contactPoint || payload.hitPosition || { x: 0.5, y: 0.5 },
        velocity: payload.newVelocity || { x: -0.5, y: 0 },
        radius: 0.028,
        owner: hitter,
        rallyCount: payload.rallyCount || 1,
        bestRally: payload.bestRally || 1,
        timestamp: payload.timestamp || Date.now(),
      };
    }
    const result = roomManager.handleBallHit(
      socket.id,
      payload.ball,
      payload.eventId,
      hitter
    );
    if (result.valid && result.roomInfo) {
      // Broadcast hit event to both participants
      io.to(result.roomInfo.roomId).emit('game:ball-hit', payload);
      io.to(result.roomInfo.roomId).emit('game:bounced', {
        ...payload,
        bestRally: result.roomInfo.bestRally,
      });
      io.to(result.roomInfo.roomId).emit('room-updated', result.roomInfo);
    }
  });

  // Game: Miss Ball
  socket.on('game:miss', (payload) => {
    const result = roomManager.handleBallMiss(socket.id, payload.missedBy);
    if (result.valid && result.roomInfo) {
      io.to(result.roomInfo.roomId).emit('game:ball-missed', payload);
      io.to(result.roomInfo.roomId).emit('room-updated', result.roomInfo);
    }
  });

  // Game: Reset Rally
  socket.on('game:reset-rally', () => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (room) {
      room.currentRally = 0;
      room.gamePhase = 'READY';
      const initialBall = {
        position: { x: 0.15, y: 0.5 },
        velocity: { x: 0, y: 0 },
        radius: 0.028,
        owner: room.servingPlayer,
        rallyCount: 0,
        bestRally: room.bestRally,
        timestamp: Date.now(),
      };
      io.to(room.roomId).emit('game:rally-reset', {
        ball: initialBall,
        servingPlayer: room.servingPlayer,
        bestRally: room.bestRally,
        timestamp: Date.now(),
      });
      io.to(room.roomId).emit('room-updated', roomManager.getPublicRoomInfo(room));
    }
  });

  // WebRTC Signaling: Offer
  socket.on('signal-offer', (payload: SignalingOfferPayload) => {
    socket.to(payload.targetSocketId).emit('signal-offer', {
      ...payload,
      senderSocketId: socket.id,
    });
  });

  // WebRTC Signaling: Answer
  socket.on('signal-answer', (payload: SignalingAnswerPayload) => {
    socket.to(payload.targetSocketId).emit('signal-answer', {
      ...payload,
      senderSocketId: socket.id,
    });
  });

  // WebRTC Signaling: ICE Candidate
  socket.on('signal-ice', (payload: SignalingIcePayload) => {
    socket.to(payload.targetSocketId).emit('signal-ice', {
      ...payload,
      senderSocketId: socket.id,
    });
  });

  // Manual Leave Room
  socket.on('leave-room', () => {
    handleDisconnect(socket);
  });

  // Socket Disconnection
  socket.on('disconnect', () => {
    console.log(`[Socket Disconnected] ID: ${socket.id}`);
    handleDisconnect(socket);
  });
});

function handleDisconnect(socket: Socket) {
  const result = roomManager.leaveRoom(socket.id);
  if (result) {
    const { roomId, roomInfo } = result;
    socket.leave(roomId);
    socket.to(roomId).emit('peer-left', socket.id);
    if (roomInfo) {
      io.to(roomId).emit('room-updated', roomInfo);
    }
  }
}

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[PALMPLAY Server] Running on http://localhost:${PORT}`);
});
