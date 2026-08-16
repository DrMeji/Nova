import { useEffect, useState } from 'react';

type UpdatePhase = 'idle' | 'downloading' | 'installing' | 'error';

/**
 * In-app download progress only. After download, ARK closes and a separate
 * Updating splash window (logo + percent) handles install + reopen.
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
        setMessage(payload.message || 'Closing ARK to finish updating…');
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

  const shown = phase === 'installing' ? 100 : Math.min(100, Math.max(percent, 0));

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70">
      <div className="w-full max-w-sm mx-4 rounded-2xl border border-surface-border bg-ark-navy-900 px-6 py-7 shadow-2xl text-center">
        {phase === 'error' ? (
          <>
            <p className="text-base font-medium text-content-primary">Update failed</p>
            <p className="text-sm text-content-tertiary mt-2">{message}</p>
            <button
              type="button"
              className="ark-btn-secondary mt-6 min-w-[8rem]"
              onClick={() => setPhase('idle')}
            >
              Dismiss
            </button>
          </>
        ) : (
          <>
            <img
              src={`${import.meta.env.BASE_URL}ark-icon.png`}
              alt="ARK"
              className="w-12 h-12 object-contain mx-auto mb-4 select-none"
              draggable={false}
            />
            <p className="text-sm font-medium text-content-primary">
              {phase === 'installing' ? 'Closing to finish update…' : 'Downloading update'}
            </p>
            <p className="text-sm text-content-tertiary mt-1 tabular-nums">{shown}%</p>
            <div className="w-full mt-5 h-1.5 rounded-full bg-surface-hover overflow-hidden">
              <div
                className="h-full bg-content-primary transition-all duration-300 ease-out"
                style={{ width: `${Math.max(shown, 3)}%` }}
              />
            </div>
            <p className="text-[11px] text-content-tertiary mt-4 leading-relaxed">
              {phase === 'installing'
                ? 'A small Updating window will open next.'
                : 'Keep ARK open until the download finishes.'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
