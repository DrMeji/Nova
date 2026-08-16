import { useEffect, useState } from 'react';

type UpdatePhase = 'idle' | 'downloading' | 'installing' | 'error';

/**
 * Single clean update surface — logo + Updating + percent.
 * No second browser window, no terminal noise.
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
        setMessage(payload.message || 'Updating…');
        return;
      }
      if (status === 'installing') {
        setPhase('installing');
        setPercent(100);
        setMessage('Finishing update…');
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-ark-navy-950">
      <div className="w-full max-w-sm mx-4 flex flex-col items-center text-center px-6">
        <img
          src={`${import.meta.env.BASE_URL}ark-icon.png`}
          alt="ARK"
          className="w-16 h-16 object-contain mb-8 select-none"
          draggable={false}
        />

        {phase === 'error' ? (
          <>
            <p className="text-base font-medium text-content-primary">Update failed</p>
            <p className="text-sm text-content-tertiary mt-2">{message}</p>
            <button
              type="button"
              className="ark-btn-secondary mt-8 min-w-[8rem]"
              onClick={() => setPhase('idle')}
            >
              Dismiss
            </button>
          </>
        ) : (
          <>
            <p className="text-base font-medium text-content-primary tracking-tight">
              {phase === 'installing' ? 'Updating' : 'Updating'}
            </p>
            <p className="text-sm text-content-tertiary mt-1 tabular-nums">{shown}%</p>
            <div className="w-full mt-6 h-1.5 rounded-full bg-surface-hover overflow-hidden">
              <div
                className="h-full bg-content-primary transition-all duration-300 ease-out"
                style={{ width: `${Math.max(shown, 3)}%` }}
              />
            </div>
            <p className="text-[11px] text-content-tertiary mt-5 leading-relaxed max-w-xs">
              {phase === 'installing'
                ? 'ARK will reopen on New Chat. Stay signed in.'
                : 'Please keep this window open.'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
