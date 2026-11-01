/**
 * PALMPLAY Shared Types & Data Contracts
 * Defines communication payloads, game states, and player models.
 */

export type PlayerRole = 'player1' | 'player2';

export interface Vector2D {
  x: number;
  y: number;
}

export type GestureType = 'OPEN_PALM' | 'INDEX_POINTING' | 'FIST' | 'TRACKING_LOST' | 'NONE';

export interface HandTrackingState {
  gesture: GestureType;
  confidence: number;
  isStable: boolean;
  handPresent: boolean;
  palmPosition?: Vector2D;
  palmCenter?: Vector2D; // Alias for palmPosition
  indexTipPosition?: Vector2D;
  indexFingertip?: Vector2D; // Alias for indexTipPosition
  rawLandmarksCount?: number;
  boundingBox?: {
    xMin: number;
    yMin: number;
    width: number;
    height: number;
  };
}

export type GamePhase =
  | 'LOBBY'
  | 'READY'
  | 'WAITING_FOR_HIT'
  | 'BALL_IN_FLIGHT'
  | 'PLAYING'
  | 'RALLY_RESET'
  | 'SCORED'
  | 'GAME_OVER';

export interface BallState {
  position: Vector2D; // Normalized [0, 1] across shared arena
  velocity: Vector2D;
  radius: number;
  owner: PlayerRole;
  rallyCount: number;
  bestRally: number;
  lastHitBy?: PlayerRole;
  lastHitTimestamp?: number;
  lastEventId?: string;
  timestamp: number;
}

export interface Participant {
  id: string; // Socket ID
  displayName: string;
  role: PlayerRole;
  isHost?: boolean;
  isReady: boolean;
  ready?: boolean; // Alias for isReady
  cameraActive: boolean;
  micActive: boolean;
  joinedAt: number;
}

export interface ScoreState {
  currentRally: number;
  bestRally: number;
  player1: number;
  player2: number;
}

export interface RoomInfo {
  roomId: string;
  createdAt: number;
  participants: Participant[];
  gamePhase: GamePhase;
  currentRally: number;
  bestRally: number;
  servingPlayer: PlayerRole;
  scores?: ScoreState;
}

// ----------------------------------------------------
// Socket.IO Payload Interfaces
// ----------------------------------------------------

export interface CreateRoomPayload {
  displayName: string;
}

export interface JoinRoomPayload {
  roomId: string;
  displayName: string;
}

export interface RoomCreatedResponse {
  success: boolean;
  roomId?: string;
  participant?: Participant;
  roomInfo?: RoomInfo;
  error?: string;
}

export interface JoinRoomResponse {
  success: boolean;
  participant?: Participant;
  roomInfo?: RoomInfo;
  error?: string;
}

export interface SetReadyPayload {
  isReady: boolean;
}

export interface LaunchBallPayload {
  roomId?: string;
  ball?: BallState;
  by?: PlayerRole;
  startPosition?: Vector2D;
  initialVelocity?: Vector2D;
  eventId: string;
  timestamp: number;
}

export interface HitBallPayload {
  roomId?: string;
  ball?: BallState;
  by?: PlayerRole;
  hitBy?: PlayerRole;
  hitPosition?: Vector2D;
  contactPoint?: Vector2D;
  newVelocity?: Vector2D;
  rallyCount?: number;
  bestRally?: number;
  eventId: string;
  timestamp: number;
}

export interface MissBallPayload {
  roomId?: string;
  missedBy: PlayerRole;
  currentRally?: number;
  scores?: ScoreState;
  timestamp: number;
}

export interface RallyResetPayload {
  ball: BallState;
  servingPlayer: PlayerRole;
  bestRally: number;
  timestamp: number;
}

// ----------------------------------------------------
// WebRTC Signaling Payloads
// ----------------------------------------------------

export interface SignalingOfferPayload {
  targetSocketId: string;
  senderSocketId: string;
  offer: RTCSessionDescriptionInit;
}

export interface SignalingAnswerPayload {
  targetSocketId: string;
  senderSocketId: string;
  answer: RTCSessionDescriptionInit;
}

export interface SignalingIcePayload {
  targetSocketId: string;
  senderSocketId: string;
  candidate: RTCIceCandidateInit;
}

// ----------------------------------------------------
// Socket Event Name Typing
// ----------------------------------------------------

export interface ClientToServerEvents {
  'create-room': (payload: CreateRoomPayload, callback: (res: RoomCreatedResponse) => void) => void;
  'join-room': (payload: JoinRoomPayload, callback: (res: JoinRoomResponse) => void) => void;
  'set-ready': (payload: SetReadyPayload) => void;
  'game:launch': (payload: LaunchBallPayload) => void;
  'game:hit': (payload: HitBallPayload) => void;
  'game:miss': (payload: MissBallPayload) => void;
  'game:reset-rally': () => void;
  'signal-offer': (payload: SignalingOfferPayload) => void;
  'signal-answer': (payload: SignalingAnswerPayload) => void;
  'signal-ice': (payload: SignalingIcePayload) => void;
  'leave-room': () => void;
}

export interface ServerToClientEvents {
  'room-updated': (roomInfo: RoomInfo) => void;
  'peer-joined': (peer: Participant) => void;
  'peer-left': (peerId: string) => void;
  'game:ball-launched': (payload: LaunchBallPayload) => void;
  'game:launched': (payload: LaunchBallPayload) => void;
  'game:ball-hit': (payload: HitBallPayload) => void;
  'game:bounced': (payload: HitBallPayload & { bestRally: number }) => void;
  'game:ball-missed': (payload: MissBallPayload) => void;
  'game:missed': (payload: { missedBy: PlayerRole; scores: ScoreState }) => void;
  'game:rally-reset': (payload: RallyResetPayload) => void;
  'signal-offer': (payload: SignalingOfferPayload) => void;
  'signal-answer': (payload: SignalingAnswerPayload) => void;
  'signal-ice': (payload: SignalingIcePayload) => void;
  'error-message': (msg: string) => void;
}
