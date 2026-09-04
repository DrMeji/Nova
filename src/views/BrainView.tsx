import { useEffect, useState } from 'react';
import { getEngineStatus, type ArkEngineStatus } from '@/lib/arkEngine';
import { BrainApiCard } from '@/components/BrainApiCard';
import { ArkMark } from '@/components/ArkMark';

export function BrainView() {
  const [engineSnap, setEngineSnap] = useState<Pick<
    ArkEngineStatus,
    'phase' | 'activeModelName' | 'ggufBinary' | 'modelsDir' | 'note' | 'models'
  > | null>(null);

  useEffect(() => {
    void getEngineStatus()
      .then(status => {
        setEngineSnap({
          phase: status.phase,
          activeModelName: status.activeModelName,
          ggufBinary: status.ggufBinary,
          modelsDir: status.modelsDir,
          note: status.note,
          models: status.models,
        });
      })
      .catch(() => setEngineSnap(null));
  }, []);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-6 flex flex-col">
      <div className="w-full max-w-xl mx-auto my-auto space-y-4 py-8">
        <div className="flex items-center gap-3 mb-2">
          <ArkMark className="w-9 h-9" title="ARK Brain" />
          <div>
            <h1 className="text-xl font-semibold text-content-primary">ARK Brain</h1>
            <p className="text-[12px] text-content-tertiary">
              Local engine status and the HTTP API other apps can use as their brain.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-surface-border p-4 space-y-2 text-sm">
          <p className="text-content-secondary">
            Status:{' '}
            <span className="text-content-primary">
              {engineSnap?.phase === 'online'
                ? 'Running'
                : engineSnap?.phase === 'starting'
                  ? 'Starting'
                  : engineSnap?.phase === 'offline'
                    ? 'Offline'
                    : engineSnap?.phase === 'degraded'
                      ? 'Needs attention'
                      : 'Checking…'}
            </span>
          </p>
          <p className="text-content-secondary">
            Active:{' '}
            <span className="text-content-primary">
              {(() => {
                if (!engineSnap) return '—';
                if (engineSnap.activeModelName !== 'ARK Core') return engineSnap.activeModelName;
                return engineSnap.models.find(model =>
                  model.status === 'ready'
                  && !['ark-core', 'ark-image-core', 'ark-video-core'].includes(model.id)
                )?.name || engineSnap.activeModelName;
              })()}
            </span>
          </p>
          <p className="text-content-secondary">
            Local runtime:{' '}
            <span className="text-content-primary">
              {engineSnap ? (engineSnap.ggufBinary ? 'Ready' : 'Not installed') : 'Checking…'}
            </span>
          </p>
          {engineSnap?.modelsDir ? (
            <p className="text-[11px] text-content-tertiary font-mono break-all">{engineSnap.modelsDir}</p>
          ) : null}
          {engineSnap?.note ? (
            <p className="text-xs text-content-tertiary">{engineSnap.note}</p>
          ) : null}
        </div>

        <BrainApiCard />
      </div>
    </div>
  );
}
