import { useEffect, useState } from 'react';

type UpdatePhase = 'idle' | 'downloading' | 'error';

/**
 * Download progress stays in-app only.
 * After download, ARK exits and the separate “Updating ARK” window handles install.
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
        setMessage(payload.message || 'Downloading update...');
        return;
      }
      // Handoff / install happens in the external Updating window — hide this overlay.
      if (status === 'handoff' || status === 'installing') {
        setPhase('idle');
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

  const shown = Math.min(100, Math.max(percent, 0));

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none flex items-center justify-center">
      <div className="pointer-events-auto w-[320px] rounded-xl border border-surface-border bg-[#0a0a0c] px-5 py-6 shadow-2xl text-center">
        {phase === 'error' ? (
          <>
            <p className="text-base font-medium text-content-primary">Update failed</p>
            <p className="text-sm text-content-tertiary mt-2">{message}</p>
            <button
              type="button"
              className="ark-btn-secondary mt-5 min-w-[8rem] pointer-events-auto"
              onClick={() => setPhase('idle')}
            >
              Dismiss
            </button>
          </>
        ) : (
          <>
            <div className="w-11 h-11 rounded-xl bg-[#141416] text-white text-xs font-bold flex items-center justify-center mx-auto mb-3 select-none">
              ARK
            </div>
            <p className="text-sm font-medium text-white">Downloading update</p>
            <p className="text-sm text-white/55 mt-1 tabular-nums">{shown}%</p>
            <div className="w-full mt-4 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-white/80 transition-all duration-300 ease-out"
                style={{ width: `${Math.max(shown, 3)}%` }}
              />
            </div>
            <p className="text-[11px] text-white/45 mt-3 leading-relaxed">
              Keep ARK open until the download finishes. Then ARK closes and an Updating window installs.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
