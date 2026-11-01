import React, { useState, useEffect, useRef } from 'react';
import {
  Copy,
  Check,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Hand,
  Users,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { HandTracker } from '../vision/handTracker';
import { HandTrackingState, Participant, RoomInfo } from '@shared/types';

interface LobbyModalProps {
  room: RoomInfo;
  participant: Participant;
  localStream: MediaStream | null;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onSetReady: () => void;
  onLeave: () => void;
}

export const LobbyModal: React.FC<LobbyModalProps> = ({
  room,
  participant,
  localStream,
  onToggleCamera,
  onToggleMic,
  onSetReady,
  onLeave,
}) => {
  const [copied, setCopied] = useState(false);
  const [handState, setHandState] = useState<HandTrackingState>({
    gesture: 'NONE',
    confidence: 0,
    isStable: false,
    handPresent: false,
  });
  const [modelLoading, setModelLoading] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);

  // Set video source when localStream is ready
  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Initialize and run hand tracker for the lobby preview
  useEffect(() => {
    let active = true;
    const tracker = new HandTracker();
    trackerRef.current = tracker;

    async function initVision() {
      try {
        setModelLoading(true);
        await tracker.init();
        if (!active) return;
        setModelLoading(false);

        if (videoRef.current) {
          tracker.start(videoRef.current, (state) => {
            if (active) {
              setHandState(state);
            }
          });
        }
      } catch (err: any) {
        if (!active) return;
        console.warn('Lobby vision loading warning:', err);
        setModelLoading(false);
      }
    }

    initVision();

    return () => {
      active = false;
      tracker.stop();
      trackerRef.current = null;
    };
  }, []);

  const inviteUrl = `${window.location.origin}/?room=${room.roomId}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const isReady = participant.ready;
  const isP2Connected = room.participants.length >= 2;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-background/90 backdrop-blur-md">
      <div className="w-full max-w-2xl glass-panel rounded-2xl border border-white/10 p-6 shadow-2xl flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div>
            <span className="text-xs uppercase tracking-wider font-semibold text-accent-violet">
              Pre-Game Lobby
            </span>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span>Room {room.roomId}</span>
              <span className="text-xs font-normal px-2.5 py-0.5 rounded-full bg-white/5 text-slate-300 border border-white/10">
                {participant.role === 'player1' ? 'Player 1 (Host)' : 'Player 2 (Guest)'}
              </span>
            </h2>
          </div>

          <button
            onClick={onLeave}
            className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
          >
            Leave
          </button>
        </div>

        {/* Invite link card */}
        <div className="p-4 rounded-xl bg-surface/70 border border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="w-9 h-9 rounded-lg bg-accent-violet/10 text-accent-violet flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Invite Player 2</p>
              <p className="text-[11px] text-slate-400 font-mono truncate max-w-[240px] sm:max-w-xs">
                {inviteUrl}
              </p>
            </div>
          </div>

          <button
            onClick={handleCopyLink}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-accent-violet/20 hover:bg-accent-violet/30 text-accent-violet text-xs font-semibold border border-accent-violet/30 transition-all"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Invite Link</span>
              </>
            )}
          </button>
        </div>

        {/* Video Preview & Hand Tracking Test */}
        <div className="relative w-full aspect-video rounded-xl bg-black/60 border border-white/10 overflow-hidden flex items-center justify-center">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover -scale-x-100"
          />

          {/* Model Loading Spinner */}
          {modelLoading && (
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center gap-2 text-white">
              <Loader2 className="w-6 h-6 animate-spin text-accent-violet" />
              <p className="text-xs font-medium">Loading Vision Engine...</p>
            </div>
          )}

          {/* Hand Tracking Real-time Badge */}
          <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-full glass-card text-xs">
            <div
              className={`w-2 h-2 rounded-full ${
                handState.handPresent ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="font-medium text-white">
              {handState.gesture === 'OPEN_PALM'
                ? '🖐️ Open Palm Detected!'
                : handState.gesture === 'INDEX_POINTING'
                ? '👉 Pointing Finger Detected!'
                : handState.handPresent
                ? '👋 Hand Detected'
                : 'Looking for hand...'}
            </span>
          </div>

          {/* Floating Media Controls */}
          <div className="absolute bottom-3 flex items-center gap-2 z-10">
            <button
              onClick={onToggleMic}
              aria-label={participant.micActive ? 'Mute microphone' : 'Unmute microphone'}
              className={`p-2.5 rounded-xl backdrop-blur-md transition-all ${
                participant.micActive
                  ? 'bg-white/10 text-white hover:bg-white/20'
                  : 'bg-red-500/80 text-white hover:bg-red-600'
              }`}
            >
              {participant.micActive ? (
                <Mic className="w-4 h-4" />
              ) : (
                <MicOff className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={onToggleCamera}
              aria-label={participant.cameraActive ? 'Turn off camera' : 'Turn on camera'}
              className={`p-2.5 rounded-xl backdrop-blur-md transition-all ${
                participant.cameraActive
                  ? 'bg-white/10 text-white hover:bg-white/20'
                  : 'bg-red-500/80 text-white hover:bg-red-600'
              }`}
            >
              {participant.cameraActive ? (
                <Video className="w-4 h-4" />
              ) : (
                <VideoOff className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Guidance tip */}
        <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-white/5 text-xs text-slate-400">
          <Hand className="w-4 h-4 text-accent-violet shrink-0 mt-0.5" />
          <p>
            <strong className="text-white">Gesture Check:</strong> Hold your hand up now to test.
            Open your palm to see the detection indicator turn green!
          </p>
        </div>

        {/* Bottom Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            {isP2Connected ? (
              <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Both players connected
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-amber-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Waiting for Player 2 to join...
              </span>
            )}
          </div>

          <button
            onClick={onSetReady}
            disabled={isReady}
            className={`w-full sm:w-auto px-6 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
              isReady
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default'
                : 'bg-gradient-to-r from-accent-violet to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-lg shadow-accent-violet/25'
            }`}
          >
            {isReady ? (
              <>
                <Check className="w-4 h-4" />
                <span>Ready & Waiting for Game</span>
              </>
            ) : (
              <>
                <span>I'm Ready to Play</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
