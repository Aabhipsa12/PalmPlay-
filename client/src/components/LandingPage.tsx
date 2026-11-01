import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Video,
  Hand,
  Pointer,
  HelpCircle,
  Users,
} from 'lucide-react';

interface LandingPageProps {
  onCreateRoom: (displayName: string) => void;
  onJoinRoom: (roomId: string, displayName: string) => void;
  onOpenTutorial: () => void;
  initialRoomId?: string;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onCreateRoom,
  onJoinRoom,
  onOpenTutorial,
  initialRoomId = '',
}) => {
  const [displayName, setDisplayName] = useState('');
  const [joinCode, setJoinCode] = useState(initialRoomId);
  const [activeTab, setActiveTab] = useState<'create' | 'join'>(
    initialRoomId ? 'join' : 'create'
  );

  // Animated hero canvas demonstration of the two-player hand rally
  const demoCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = demoCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let ballX = 0.2;
    let ballY = 0.5;
    let velX = 0.005;
    let velY = 0.0015;
    let trail: { x: number; y: number; alpha: number }[] = [];

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      // Divider line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(w / 2, 10);
      ctx.lineTo(w / 2, h - 10);
      ctx.stroke();
      ctx.setLineDash([]);

      // Update simulated ball
      ballX += velX;
      ballY += velY;

      // Bounce off walls
      if (ballY <= 0.15 || ballY >= 0.85) {
        velY = -velY;
      }

      // Bounce off virtual hands
      if (ballX >= 0.8) {
        velX = -Math.abs(velX);
        velY = (Math.random() - 0.5) * 0.004;
      } else if (ballX <= 0.2) {
        velX = Math.abs(velX);
        velY = (Math.random() - 0.5) * 0.004;
      }

      // Trail
      trail.unshift({ x: ballX * w, y: ballY * h, alpha: 0.5 });
      if (trail.length > 10) trail.pop();

      for (let i = 0; i < trail.length; i++) {
        const pt = trail[i];
        pt.alpha *= 0.85;
        ctx.fillStyle = `rgba(139, 92, 246, ${pt.alpha * 0.4})`;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 8 * (1 - i / 10), 0, Math.PI * 2);
        ctx.fill();
      }

      // Ball
      const bx = ballX * w;
      const by = ballY * h;
      const grad = ctx.createRadialGradient(bx, by, 2, bx, by, 14);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.5, '#c084fc');
      grad.addColorStop(1, '#8b5cf6');

      ctx.fillStyle = grad;
      ctx.shadowColor = '#8b5cf6';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(bx, by, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Render player mock cards
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '11px Plus Jakarta Sans, sans-serif';
      ctx.fillText('Player 1 (Open Palm)', 16, 26);
      ctx.fillText('Player 2 (Index Finger)', w - 145, 26);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateRoom(displayName.trim() || 'Player 1');
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    onJoinRoom(joinCode.trim().toUpperCase(), displayName.trim() || 'Player 2');
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-between px-4 py-8 overflow-hidden">
      {/* Background radial atmospheric glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-accent-violet/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-[500px] h-[400px] bg-accent-cyan/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Top Navbar */}
      <header className="w-full max-w-5xl flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-accent-violet to-accent-cyan p-[1px]">
            <div className="w-full h-full bg-surface rounded-[11px] flex items-center justify-center text-accent-violet">
              <Hand className="w-5 h-5 text-accent-violet" />
            </div>
          </div>
          <div>
            <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
              PALMPLAY
            </span>
            <span className="hidden sm:inline-block ml-2 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent-violet/10 text-accent-violet border border-accent-violet/20">
              Webcam AI
            </span>
          </div>
        </div>

        <button
          onClick={onOpenTutorial}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass-card text-xs text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
        >
          <HelpCircle className="w-4 h-4 text-accent-cyan" />
          <span>How It Works</span>
        </button>
      </header>

      {/* Hero Section */}
      <main className="w-full max-w-4xl my-auto flex flex-col items-center text-center z-10 pt-8 pb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-slate-300 mb-6 backdrop-blur-md">
          <Sparkles className="w-3.5 h-3.5 text-accent-amber" />
          <span>Real-time gesture-controlled social gaming</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white max-w-2xl leading-[1.15] mb-4">
          A little closer, even when you're{' '}
          <span className="bg-gradient-to-r from-accent-violet via-purple-400 to-accent-cyan bg-clip-text text-transparent">
            miles apart.
          </span>
        </h1>

        <p className="text-sm sm:text-base text-slate-400 max-w-xl mb-8 leading-relaxed">
          Step into a shared video call with someone special. Launch a glowing ball with an
          open palm, and bounce it right back using your index fingertip in mid-air.
        </p>

        {/* Live Mini Demonstration Visual */}
        <div className="w-full max-w-lg mb-8 rounded-2xl glass-panel p-2 shadow-2xl border border-white/10 overflow-hidden">
          <div className="relative w-full h-36 bg-[#0c0e17] rounded-xl flex items-center justify-center overflow-hidden">
            <canvas
              ref={demoCanvasRef}
              width={500}
              height={144}
              className="w-full h-full"
            />
            <div className="absolute bottom-2 flex items-center gap-6 text-[10px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <Hand className="w-3 h-3 text-accent-violet" /> Open Palm to Serve
              </span>
              <span className="flex items-center gap-1.5">
                <Pointer className="w-3 h-3 text-accent-cyan" /> Index Finger to Hit
              </span>
            </div>
          </div>
        </div>

        {/* Action Panel: Create or Join */}
        <div className="w-full max-w-md glass-panel p-6 rounded-2xl shadow-xl border border-white/10">
          <div className="flex border-b border-white/10 mb-6">
            <button
              onClick={() => setActiveTab('create')}
              className={`flex-1 pb-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'create'
                  ? 'text-white border-b-2 border-accent-violet'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Video className="w-4 h-4" />
              Start Call
            </button>
            <button
              onClick={() => setActiveTab('join')}
              className={`flex-1 pb-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'join'
                  ? 'text-white border-b-2 border-accent-cyan'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-4 h-4" />
              Join Call
            </button>
          </div>

          {activeTab === 'create' ? (
            <form onSubmit={handleCreate} className="flex flex-col gap-4 text-left">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Your Display Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Alex"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={20}
                  className="w-full px-4 py-2.5 rounded-xl bg-surface border border-white/10 focus:border-accent-violet focus:ring-1 focus:ring-accent-violet outline-none text-white text-sm transition-all"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 px-4 bg-gradient-to-r from-accent-violet to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-semibold rounded-xl shadow-lg shadow-accent-violet/25 transition-all text-sm flex items-center justify-center gap-2 group"
              >
                <span>Start Video Call & Play</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </form>
          ) : (
            <form onSubmit={handleJoin} className="flex flex-col gap-4 text-left">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Call Code or Link
                </label>
                <input
                  type="text"
                  placeholder="e.g. K9D7M2"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={10}
                  required
                  className="w-full px-4 py-2.5 rounded-xl bg-surface border border-white/10 focus:border-accent-cyan focus:ring-1 focus:ring-accent-cyan outline-none text-white font-mono tracking-wider text-sm transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Your Display Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sam"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={20}
                  className="w-full px-4 py-2.5 rounded-xl bg-surface border border-white/10 focus:border-accent-cyan focus:ring-1 focus:ring-accent-cyan outline-none text-white text-sm transition-all"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 px-4 bg-gradient-to-r from-accent-cyan to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-accent-cyan/25 transition-all text-sm flex items-center justify-center gap-2 group"
              >
                <span>Join Video Call</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </form>
          )}

          {/* Privacy badge */}
          <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-center gap-2 text-[11px] text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>AI runs locally in your browser. Video is never stored.</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-5xl flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 pt-6 border-t border-white/5 z-10 gap-2">
        <p>© 2026 PALMPLAY — Real-Time Computer Vision Gaming</p>
        <p className="flex items-center gap-1.5">
          <span>Peer-to-peer WebRTC</span> • <span>MediaPipe Hand Tracking</span>
        </p>
      </footer>
    </div>
  );
};
