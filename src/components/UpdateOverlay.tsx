import { useEffect, useState } from 'react';

type UpdatePhase = 'idle' | 'closing' | 'error';

/**
 * Brief notice before ARK closes. Download + install happen in the small
 * external Updating splash (Discord-style), not a fullscreen overlay.
 */
export function UpdateOverlay() {
  const [phase, setPhase] = useState<UpdatePhase>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const unsub = window.arkDesktop?.onUpdateProgress?.((payload) => {
      const status = payload?.status || '';
      if (status === 'installing' || status === 'downloading') {
        setPhase('closing');
        setMessage(payload.message || 'Closing ARK to update…');
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
    <div className="fixed inset-0 z-[200] pointer-events-none flex items-center justify-center">
      <div className="pointer-events-auto w-[320px] rounded-xl border border-surface-border bg-[#232428] px-5 py-6 shadow-2xl text-center">
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
            <img
              src={`${import.meta.env.BASE_URL}ark-icon.png`}
              alt="ARK"
              className="w-11 h-11 object-contain mx-auto mb-3 select-none"
              draggable={false}
            />
            <p className="text-sm font-medium text-white">Closing to update…</p>
            <p className="text-[11px] text-white/55 mt-2 leading-relaxed">
              A small Updating window opens next.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
