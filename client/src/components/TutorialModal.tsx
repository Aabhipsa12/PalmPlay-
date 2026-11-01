import React from 'react';
import { X, Hand, Pointer, Eye, Zap } from 'lucide-react';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TutorialModal: React.FC<TutorialModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-xl p-6 glass-panel rounded-2xl border border-white/10 shadow-2xl">
        <button
          onClick={onClose}
          aria-label="Close tutorial"
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-accent-violet/20 border border-accent-violet/30 flex items-center justify-center text-accent-violet">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">How to Play PALMPLAY</h2>
            <p className="text-xs text-slate-400">Master the gestures to keep the rally alive</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Step 1 */}
          <div className="p-4 rounded-xl bg-surface/60 border border-white/5 flex flex-col gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <Eye className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white">1. Position Your Hand</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Sit back slightly so your upper body and hand are visible in good lighting. Keep your hand inside your video panel.
            </p>
          </div>

          {/* Step 2 */}
          <div className="p-4 rounded-xl bg-surface/60 border border-white/5 flex flex-col gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent-violet/10 text-accent-violet flex items-center justify-center">
              <Hand className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white">2. Open Palm to Launch</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Hold your palm open toward the camera. When recognized, it serves the glowing ball toward your friend!
            </p>
          </div>

          {/* Step 3 */}
          <div className="p-4 rounded-xl bg-surface/60 border border-white/5 flex flex-col gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent-cyan/10 text-accent-cyan flex items-center justify-center">
              <Pointer className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white">3. Point Finger to Hit</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Point your index finger toward the incoming ball. When your fingertip meets the ball, it bounces back with extra speed.
            </p>
          </div>

          {/* Step 4 */}
          <div className="p-4 rounded-xl bg-surface/60 border border-white/5 flex flex-col gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white">4. Keep the Rally Going</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Work together to beat your longest rally. Hitting above or below center angles the return trajectory!
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 px-4 bg-gradient-to-r from-accent-violet to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-semibold rounded-xl shadow-lg shadow-accent-violet/20 transition-all text-sm"
        >
          Got it, let's play!
        </button>
      </div>
    </div>
  );
};
