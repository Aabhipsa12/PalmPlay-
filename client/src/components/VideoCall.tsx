import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  RotateCcw,
  Copy,
  Check,
} from 'lucide-react';
import { GameEngine } from '../game/engine';
import { GameRenderer } from '../game/renderer';
import { HandTracker } from '../vision/handTracker';
import { soundFX } from '../lib/audio';
import { getSocket } from '../lib/socket';
import {
  GamePhase,
  HandTrackingState,
  HitBallPayload,
  LaunchBallPayload,
  Participant,
  RoomInfo,
} from '@shared/types';

interface VideoCallProps {
  room: RoomInfo;
  participant: Participant;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onEndCall: () => void;
}

export const VideoCall: React.FC<VideoCallProps> = ({
  room,
  participant,
  localStream,
  remoteStream,
  onToggleCamera,
  onToggleMic,
  onEndCall,
}) => {
  const [copied, setCopied] = useState(false);
  const [_gamePhase, setGamePhase] = useState<GamePhase>(room.gamePhase);
  const [lostPlayer, setLostPlayer] = useState<'player1' | 'player2' | null>(null);
  const [localGesture, setLocalGesture] = useState<HandTrackingState>({
    gesture: 'NONE',
    confidence: 0,
    isStable: false,
    handPresent: false,
  });

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const engineRef = useRef<GameEngine | null>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);

  const lastFrameTimeRef = useRef<number>(performance.now());
  const myRole = participant.role; // 'player1' or 'player2'
  const isP1 = myRole === 'player1';

  // 1. Direct Video Stream Attachment
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // 2. Initialize Shared Transparent Canvas Engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new GameRenderer(canvas);
    rendererRef.current = renderer;

    const socket = getSocket();

    const engine = new GameEngine({
      onLaunch: (ball, eventId) => {
        soundFX.playLaunch();
        if (ball.owner === myRole) {
          const payload: LaunchBallPayload = {
            roomId: room.roomId,
            eventId,
            by: myRole,
            startPosition: ball.position,
            initialVelocity: ball.velocity,
            timestamp: Date.now(),
          };
          socket.emit('game:launch', payload);
        }
      },
      onHit: (ball, eventId, by) => {
        soundFX.playHit(ball.rallyCount);
        if (rendererRef.current) {
          rendererRef.current.addImpact(ball.position, by === 'player1' ? '#c084fc' : '#38bdf8');
        }

        if (by === myRole) {
          const payload: HitBallPayload = {
            roomId: room.roomId,
            eventId,
            by: myRole,
            contactPoint: ball.position,
            newVelocity: ball.velocity,
            rallyCount: ball.rallyCount,
            timestamp: Date.now(),
          };
          socket.emit('game:hit', payload);
        }
      },
      onMiss: (missedBy) => {
        soundFX.playMiss();
        setLostPlayer(missedBy);
        setTimeout(() => setLostPlayer(null), 2500);

        if (missedBy === myRole) {
          socket.emit('game:miss', {
            roomId: room.roomId,
            missedBy,
            timestamp: Date.now(),
          });
        }
      },
      onPhaseChange: (phase) => {
        setGamePhase(phase);
      },
    });

    engineRef.current = engine;

    const handleResize = () => {
      renderer.handleResize();
    };
    window.addEventListener('resize', handleResize);

    // Socket events
    socket.on('game:launched', (payload: LaunchBallPayload) => {
      const launcher = payload.by || (myRole === 'player1' ? 'player2' : 'player1');
      if (launcher !== myRole && payload.startPosition) {
        engine.launch(launcher, payload.startPosition, payload.eventId);
      }
    });

    socket.on('game:bounced', (payload: HitBallPayload & { bestRally: number }) => {
      const hitter = payload.by || payload.hitBy || (myRole === 'player1' ? 'player2' : 'player1');
      if (hitter !== myRole && payload.newVelocity && payload.contactPoint) {
        const ball = engine.getBall();
        ball.velocity = payload.newVelocity;
        ball.position = payload.contactPoint;
        ball.rallyCount = payload.rallyCount ?? ball.rallyCount + 1;
        ball.bestRally = payload.bestRally ?? Math.max(ball.bestRally, ball.rallyCount);
        ball.owner = hitter;
        ball.lastHitBy = hitter;
        ball.lastEventId = payload.eventId;
        engine.setBall(ball);
        engine.setPhase('BALL_IN_FLIGHT');

        soundFX.playHit(ball.rallyCount);
        if (rendererRef.current) {
          rendererRef.current.addImpact(payload.contactPoint, '#38bdf8');
        }
      }
    });

    socket.on('game:missed', (data: any) => {
      const missedBy = data?.missedBy;
      if (missedBy) {
        setLostPlayer(missedBy);
        setTimeout(() => setLostPlayer(null), 2500);
      }
      engine.setPhase('RALLY_RESET');
      soundFX.playMiss();
    });

    socket.on('game:rally-reset', (payload: any) => {
      if (payload?.ball) {
        engine.setBall(payload.ball);
        engine.setPhase('READY');
      }
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      socket.off('game:launched');
      socket.off('game:bounced');
      socket.off('game:missed');
      socket.off('game:rally-reset');
      engineRef.current = null;
      rendererRef.current = null;
    };
  }, [myRole, room.roomId]);

  // 3. Invisible Hand Tracking in Background
  useEffect(() => {
    const video = localVideoRef.current;
    if (!video) return;

    let isMounted = true;
    const tracker = new HandTracker();
    trackerRef.current = tracker;

    tracker
      .init()
      .then(() => {
        if (!isMounted) return;
        tracker.start(video, (state) => {
          if (!isMounted) return;

          // Normalized positions in local camera feed (mirrored)
          const rawTip = state.indexTipPosition || state.indexFingertip;
          const rawPalm = state.palmPosition || state.palmCenter;

          const arenaX = isP1
            ? (rawTip?.x ?? 0.25) * 0.5
            : 0.5 + (rawTip?.x ?? 0.25) * 0.5;

          const arenaPalmX = isP1
            ? (rawPalm?.x ?? 0.25) * 0.5
            : 0.5 + (rawPalm?.x ?? 0.25) * 0.5;

          const updatedPos = rawTip ? { x: arenaX, y: rawTip.y } : undefined;
          const updatedPalm = rawPalm ? { x: arenaPalmX, y: rawPalm.y } : undefined;

          setLocalGesture({
            ...state,
            indexTipPosition: updatedPos,
            indexFingertip: updatedPos,
            palmPosition: updatedPalm,
            palmCenter: updatedPalm,
          });
        });
      })
      .catch((err) => {
        console.warn('Hand tracking initialization warning:', err);
      });

    return () => {
      isMounted = false;
      tracker.stop();
      trackerRef.current = null;
    };
  }, [isP1]);

  // 4. Main Game Loop (Only renders ball over live call)
  useEffect(() => {
    let animId: number;

    const gameLoop = () => {
      const now = performance.now();
      const dt = Math.min((now - lastFrameTimeRef.current) / 1000, 0.05);
      lastFrameTimeRef.current = now;

      const engine = engineRef.current;
      const renderer = rendererRef.current;

      if (engine && renderer) {
        const curPhase = engine.getPhase();
        const palmPos = localGesture.palmPosition || localGesture.palmCenter;
        const tipPos = localGesture.indexTipPosition || localGesture.indexFingertip;

        // Player launches with Open Palm (can launch when in READY or RALLY_RESET)
        if (
          localGesture.gesture === 'OPEN_PALM' &&
          palmPos &&
          (curPhase === 'READY' || curPhase === 'RALLY_RESET')
        ) {
          const ballOwner = engine.getBall().owner;
          // Launch if ball belongs to current player's side
          if (ballOwner === myRole) {
            engine.launch(myRole, palmPos);
          }
        }

        // Batting / bouncing with Index Fingertip
        if (
          localGesture.gesture === 'INDEX_POINTING' &&
          tipPos
        ) {
          engine.checkFingertipCollision(tipPos, myRole);
        }

        // Advance ball physics
        engine.update(dt);

        // Render ONLY the virtual ball onto the transparent canvas
        const ball = engine.getBall();
        renderer.render(ball);
      }

      animId = requestAnimationFrame(gameLoop);
    };

    animId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animId);
  }, [localGesture, myRole, isP1]);

  const handleManualRestart = () => {
    if (engineRef.current) {
      engineRef.current.reset(myRole);
      setGamePhase('READY');
      getSocket().emit('game:reset-rally');
    }
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/?room=${room.roomId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden select-none">
      {/* 1. THE VIDEO CALL VIEW (Two people side by side) */}
      <div className="relative w-full h-full flex flex-row items-center justify-center p-2 gap-2">
        {/* Left Video: Player 1 */}
        <div className="relative flex-1 h-full rounded-2xl bg-[#11131a] overflow-hidden flex items-center justify-center">
          {isP1 ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover -scale-x-100"
            />
          ) : (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          )}

          {/* LOST Overlay on Player 1 side */}
          {lostPlayer === 'player1' && (
            <div className="absolute inset-0 bg-red-950/40 backdrop-blur-xs flex items-center justify-center pointer-events-none z-10 animate-pulse">
              <span className="text-4xl sm:text-5xl font-extrabold tracking-widest text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.8)]">
                LOST
              </span>
            </div>
          )}

          {/* WINNER Overlay on Player 1 side */}
          {lostPlayer === 'player2' && (
            <div className="absolute inset-0 bg-emerald-950/40 backdrop-blur-xs flex items-center justify-center pointer-events-none z-10 animate-pulse">
              <span className="text-4xl sm:text-5xl font-extrabold tracking-widest text-emerald-400 drop-shadow-[0_0_20px_rgba(52,211,153,0.8)]">
                WINNER
              </span>
            </div>
          )}
        </div>

        {/* Right Video: Player 2 */}
        <div className="relative flex-1 h-full rounded-2xl bg-[#11131a] overflow-hidden flex items-center justify-center">
          {!isP1 ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover -scale-x-100"
            />
          ) : (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          )}

          {/* LOST Overlay on Player 2 side */}
          {lostPlayer === 'player2' && (
            <div className="absolute inset-0 bg-red-950/40 backdrop-blur-xs flex items-center justify-center pointer-events-none z-10 animate-pulse">
              <span className="text-4xl sm:text-5xl font-extrabold tracking-widest text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.8)]">
                LOST
              </span>
            </div>
          )}

          {/* WINNER Overlay on Player 2 side */}
          {lostPlayer === 'player1' && (
            <div className="absolute inset-0 bg-emerald-950/40 backdrop-blur-xs flex items-center justify-center pointer-events-none z-10 animate-pulse">
              <span className="text-4xl sm:text-5xl font-extrabold tracking-widest text-emerald-400 drop-shadow-[0_0_20px_rgba(52,211,153,0.8)]">
                WINNER
              </span>
            </div>
          )}

          {/* Simple subtle invitation prompt if friend has not joined yet */}
          {(!remoteStream || room.participants.length < 2) && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-10">
              <p className="text-sm font-medium text-white/90 mb-3">Waiting for other person to join call</p>
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs border border-white/10 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Link Copied' : 'Copy Call Link'}</span>
              </button>
            </div>
          )}
        </div>

        {/* 2. THE VIRTUAL BALL (Transparent canvas directly over the call) */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-20"
        />
      </div>

      {/* 3. NORMAL VIDEO CALL CONTROLS */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2 rounded-2xl bg-black/50 backdrop-blur-md border border-white/10 shadow-xl">
        <button
          onClick={onToggleMic}
          aria-label={participant.micActive ? 'Mute' : 'Unmute'}
          className={`p-3 rounded-xl transition-all ${
            participant.micActive
              ? 'bg-white/10 text-white hover:bg-white/20'
              : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
          }`}
        >
          {participant.micActive ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
        </button>

        <button
          onClick={onToggleCamera}
          aria-label={participant.cameraActive ? 'Turn Off Camera' : 'Turn On Camera'}
          className={`p-3 rounded-xl transition-all ${
            participant.cameraActive
              ? 'bg-white/10 text-white hover:bg-white/20'
              : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
          }`}
        >
          {participant.cameraActive ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
        </button>

        <button
          onClick={handleManualRestart}
          title="Reset Ball"
          className="p-3 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          onClick={onEndCall}
          title="End Call"
          className="p-3 rounded-xl bg-red-600 hover:bg-red-500 text-white transition-colors shadow-lg shadow-red-600/30 ml-1"
        >
          <PhoneOff className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
