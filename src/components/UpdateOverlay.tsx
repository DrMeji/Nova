import { useEffect, useState } from 'react';
import { Download, Loader2, RefreshCw } from 'lucide-react';

type UpdatePhase = 'idle' | 'downloading' | 'installing' | 'error';

/**
 * Full-window update HUD so download → install → reopen never looks like a freeze.
 */
export function UpdateOverlay() {
  const [phase, setPhase] = useState<UpdatePhase>('idle');
  const [percent, setPercent] = useState(0);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const unsub = window.arkDesktop?.onUpdateProgress?.((payload) => {
      const status = payload?.status || '';
      if (status === 'downloading') {
        setPhase('downloading');
        setPercent(typeof payload.percent === 'number' ? payload.percent : 0);
        setMessage(payload.message || 'Downloading update…');
        return;
      }
      if (status === 'installing') {
        setPhase('installing');
        setPercent(100);
        setMessage(payload.message || 'Installing and reopening ARK…');
        return;
      }
      if (status === 'error') {
        setPhase('error');
        setMessage(payload.message || 'Update failed.');
      }
    });
    return () => {
      unsub?.();
    };
  }, []);

  if (phase === 'idle') return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 rounded-2xl border border-surface-border bg-ark-navy-900 p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-11 h-11 rounded-xl bg-surface-hover flex items-center justify-center">
            {phase === 'error' ? (
              <RefreshCw className="w-5 h-5 text-rose-400" />
            ) : phase === 'installing' ? (
              <Loader2 className="w-5 h-5 text-content-primary animate-spin" />
            ) : (
              <Download className="w-5 h-5 text-content-primary" />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-content-primary">
              {phase === 'downloading' && 'Downloading update'}
              {phase === 'installing' && 'Installing update'}
              {phase === 'error' && 'Update failed'}
            </p>
            <p className="text-xs text-content-tertiary mt-0.5">{message}</p>
          </div>
        </div>

        {(phase === 'downloading' || phase === 'installing') && (
          <>
            <div className="h-2 rounded-full bg-surface-hover overflow-hidden">
              <div
                className="h-full bg-sky-500 transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(phase === 'installing' ? 100 : percent, 4))}%` }}
              />
            </div>
            <p className="text-[11px] text-content-tertiary mt-3 leading-relaxed">
              {phase === 'downloading'
                ? 'Keep ARK open while the package downloads.'
                : 'ARK will close briefly, install the build, then reopen on New Chat. You stay signed in — models and setup stay on this PC.'}
            </p>
          </>
        )}

        {phase === 'error' && (
          <button
            type="button"
            className="ark-btn-secondary w-full mt-4"
            onClick={() => setPhase('idle')}
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
