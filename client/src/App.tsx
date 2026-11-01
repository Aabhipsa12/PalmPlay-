import { useState, useEffect, useCallback } from 'react';
import { VideoCall } from './components/VideoCall';
import { getSocket } from './lib/socket';
import { webrtcManager } from './lib/webrtc';
import { soundFX } from './lib/audio';
import { Participant, RoomInfo } from '@shared/types';
import { AlertCircle, X, Video, Users, ArrowRight } from 'lucide-react';

export function App() {
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [inCall, setInCall] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form states for simple call connection
  const [displayName, setDisplayName] = useState('');
  const [callCode, setCallCode] = useState('');
  const [mode, setMode] = useState<'start' | 'join'>('start');

  // Check URL parameters for direct call link (?room=XXXXXX)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setCallCode(roomParam.toUpperCase());
      setMode('join');
    }
  }, []);

  // Acquire camera and mic stream
  const initializeMedia = async (): Promise<MediaStream> => {
    try {
      const stream = await webrtcManager.getLocalMedia();
      setLocalStream(stream);
      return stream;
    } catch (err: any) {
      console.error('Media acquisition error:', err);
      let msg = 'Could not access camera or microphone.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Camera permission was denied. Please allow camera access in your browser.';
      } else if (err.name === 'NotFoundError') {
        msg = 'No compatible webcam or microphone was found on your device.';
      }
      setErrorMessage(msg);
      throw err;
    }
  };

  // Start Call
  const handleStartCall = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      setErrorMessage(null);
      await initializeMedia();

      const socket = getSocket();
      socket.emit(
        'create-room',
        { displayName: displayName.trim() || 'You' },
        (res: { success: boolean; roomId?: string; participant?: Participant; roomInfo?: RoomInfo; room?: RoomInfo; error?: string }) => {
          const roomObj = res.roomInfo || res.room;
          if (!res.success || !roomObj || !res.participant) {
            setErrorMessage(res.error || 'Failed to start video call.');
            return;
          }

          setRoom(roomObj);
          setParticipant(res.participant);
          setInCall(true);

          window.history.pushState({}, '', `/?room=${roomObj.roomId}`);
        }
      );
    } catch (err) {
      // Error handled in initializeMedia
    }
  };

  // Join Call
  const handleJoinCall = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!callCode.trim()) return;

    try {
      setErrorMessage(null);
      await initializeMedia();

      const socket = getSocket();
      socket.emit(
        'join-room',
        { roomId: callCode.trim().toUpperCase(), displayName: displayName.trim() || 'Friend' },
        (res: { success: boolean; roomInfo?: RoomInfo; room?: RoomInfo; participant?: Participant; error?: string }) => {
          const roomObj = res.roomInfo || res.room;
          if (!res.success || !roomObj || !res.participant) {
            setErrorMessage(res.error || 'Could not connect to call. Check the code or link.');
            return;
          }

          setRoom(roomObj);
          setParticipant(res.participant);
          setInCall(true);

          window.history.pushState({}, '', `/?room=${roomObj.roomId}`);
        }
      );
    } catch (err) {
      // Error handled in initializeMedia
    }
  };

  // Toggle Camera
  const handleToggleCamera = () => {
    const nextState = webrtcManager.toggleCamera();
    if (participant) {
      const updated = { ...participant, cameraActive: nextState };
      setParticipant(updated);
      getSocket().emit('update-participant-state', { cameraActive: nextState });
    }
  };

  // Toggle Microphone
  const handleToggleMic = () => {
    const nextState = webrtcManager.toggleMic();
    if (participant) {
      const updated = { ...participant, micActive: nextState };
      setParticipant(updated);
      getSocket().emit('update-participant-state', { micActive: nextState });
    }
  };

  // End Call
  const handleEndCall = useCallback(() => {
    webrtcManager.cleanup();
    getSocket().emit('leave-room');
    setRoom(null);
    setParticipant(null);
    setLocalStream(null);
    setRemoteStream(null);
    setInCall(false);
    window.history.pushState({}, '', '/');
  }, []);

  // WebRTC & Socket Call Negotiation
  useEffect(() => {
    const socket = getSocket();

    socket.on('participant-joined', ({ room: updatedRoom }: { participant: Participant; room: RoomInfo }) => {
      setRoom(updatedRoom);
      soundFX.playJoin();

      if (participant && participant.isHost) {
        webrtcManager.initPeerConnection(updatedRoom.roomId, true);
      }
    });

    socket.on('participant-updated', ({ room: updatedRoom }: { room: RoomInfo }) => {
      setRoom(updatedRoom);
    });

    socket.on('participant-left', ({ leftParticipant, room: updatedRoom }: any) => {
      setRoom(updatedRoom);
      setRemoteStream(null);
      setErrorMessage(`${leftParticipant?.displayName || 'Friend'} left the call.`);
    });

    webrtcManager.onRemoteStream((stream) => {
      setRemoteStream(stream);
    });

    if (participant && !participant.isHost && room) {
      webrtcManager.initPeerConnection(room.roomId, false);
    }

    return () => {
      socket.off('participant-joined');
      socket.off('participant-updated');
      socket.off('participant-left');
    };
  }, [participant, room]);

  return (
    <div className="relative min-h-screen bg-[#07090e] text-slate-100 font-sans">
      {/* Global Error Notification */}
      {errorMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/90 text-white text-xs font-medium shadow-2xl backdrop-blur-md border border-red-400/30 max-w-md w-full">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="flex-1">{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="p-1 rounded hover:bg-black/20 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. Direct Video Call Screen with Hand-Gesture Ball Game */}
      {inCall && room && participant ? (
        <VideoCall
          room={room}
          participant={participant}
          localStream={localStream}
          remoteStream={remoteStream}
          onToggleCamera={handleToggleCamera}
          onToggleMic={handleToggleMic}
          onEndCall={handleEndCall}
        />
      ) : (
        /* 2. Simple Minimal Connect Screen */
        <div className="min-h-screen flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-md bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl p-6 shadow-2xl">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-white tracking-tight mb-1">PALMPLAY</h1>
              <p className="text-xs text-slate-400">
                A video call where you play catch across screens with your hands.
              </p>
            </div>

            <div className="flex border-b border-white/10 mb-5">
              <button
                onClick={() => setMode('start')}
                className={`flex-1 pb-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  mode === 'start'
                    ? 'text-white border-b-2 border-purple-500'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Video className="w-3.5 h-3.5" />
                Start Call
              </button>
              <button
                onClick={() => setMode('join')}
                className={`flex-1 pb-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  mode === 'join'
                    ? 'text-white border-b-2 border-cyan-500'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Join Call
              </button>
            </div>

            {mode === 'start' ? (
              <form onSubmit={handleStartCall} className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Your Name</label>
                  <input
                    type="text"
                    placeholder="Enter your name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={20}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-purple-500 transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-600/25"
                >
                  <span>Start Video Call</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </form>
            ) : (
              <form onSubmit={handleJoinCall} className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Call Code</label>
                  <input
                    type="text"
                    placeholder="e.g. A9B2X1"
                    value={callCode}
                    onChange={(e) => setCallCode(e.target.value.toUpperCase())}
                    maxLength={10}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white font-mono text-xs outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Your Name</label>
                  <input
                    type="text"
                    placeholder="Enter your name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={20}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-cyan-600/25"
                >
                  <span>Join Video Call</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </form>
            )}

            <div className="mt-6 pt-4 border-t border-white/5 text-[11px] text-slate-400 text-center flex flex-col gap-1">
              <span>🖐️ <strong>Player 1</strong>: Open palm toward camera to throw ball</span>
              <span>👉 <strong>Player 2</strong>: Touch incoming ball with index finger to bat back</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
