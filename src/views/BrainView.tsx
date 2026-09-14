/**
 * NOVA Brain — engine status, this-PC profile, and Brain API only.
 * Models catalog lives in Models. Local engine tools live in Local AI.
 */
import { useEffect, useState } from 'react';
import { getEngineStatus, type ArkEngineStatus } from '@/lib/arkEngine';
import { BrainApiCard } from '@/components/BrainApiCard';
import { ArkMark } from '@/components/ArkMark';
import { getBrainProfile, type BrainProfile } from '@/lib/brainProfile';
import { useRouter } from '@/context/RouterContext';

export function BrainView() {
  const { navigate } = useRouter();
  const [engineSnap, setEngineSnap] = useState<Pick<
    ArkEngineStatus,
    'phase' | 'activeModelName' | 'ggufBinary' | 'modelsDir' | 'note' | 'models'
  > | null>(null);
  const [profile, setProfile] = useState<BrainProfile | null>(null);
  const [userDataProfile, setUserDataProfile] = useState('');

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
    void window.arkDesktop?.appMeta?.()
      .then((meta) => {
        if (meta?.userDataProfile) setUserDataProfile(String(meta.userDataProfile));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void getBrainProfile(true)
      .then(setProfile)
      .catch(() => setProfile(null));
  }, []);

  return (
    <div className="h-full min-h-0 w-full overflow-y-auto animate-fade-in">
      <div className="min-h-full flex items-start justify-center px-4 sm:px-6 py-6 pt-[min(10vh,5rem)]">
        <div className="w-full max-w-xl space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <ArkMark className="w-9 h-9" title="NOVA Brain" />
            <div>
              <h1 className="text-xl font-semibold text-content-primary">NOVA Brain</h1>
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
                  if (engineSnap.activeModelName !== 'NOVA Core') return engineSnap.activeModelName;
                  return engineSnap.models.find(model =>
                    model.status === 'ready'
                    && !['NOVA-core', 'NOVA-image-core', 'NOVA-video-core'].includes(model.id)
                  )?.name || engineSnap.activeModelName;
                })()}
              </span>
            </p>
            <p className="text-content-secondary">
              Local runtime:{' '}
              <span className="text-content-primary">
                {engineSnap?.ggufBinary ? 'Ready' : 'Not installed'}
              </span>
            </p>
            {userDataProfile ? (
              <p className="text-content-secondary">
                Profile:{' '}
                <span className="text-content-primary font-mono text-[12px]">{userDataProfile}</span>
              </p>
            ) : null}
            {engineSnap?.modelsDir ? (
              <p className="text-content-secondary break-all">
                Models:{' '}
                <span className="text-content-primary font-mono text-[11px]">{engineSnap.modelsDir}</span>
              </p>
            ) : null}
            {engineSnap?.note ? (
              <p className="text-xs text-content-tertiary pt-1">{engineSnap.note}</p>
            ) : null}
          </div>

          <div className="rounded-xl border border-surface-border p-4 space-y-2 text-sm">
            <p className="text-[11px] uppercase tracking-wide text-content-tertiary">This PC</p>
            {!profile ? (
              <p className="text-content-tertiary">Probing this PC…</p>
            ) : (
              <>
                <p className="text-content-primary leading-relaxed">{profile.reason}</p>
                <p className="text-xs text-content-tertiary">
                  RAM ~{Math.round(profile.ramGB)} GB · VRAM ~{Math.round(profile.vramGB || 0)} GB
                  {profile.gpuUsable ? ' · GPU usable' : ' · CPU path'}
                </p>
                <p className="text-xs text-content-tertiary">
                  Max coder ~{profile.maxCoderParamsB}B · Max chat ~{profile.maxChatParamsB}B · Prefer {profile.preferredQuant}
                </p>
                <div className="pt-1 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => navigate({ name: 'models', tab: 'for-pc' })}
                    className="text-xs text-sky-400 hover:text-sky-300"
                  >
                    Open Recommended →
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate({ name: 'local-ai' })}
                    className="text-xs text-sky-400 hover:text-sky-300"
                  >
                    Open Local AI →
                  </button>
                </div>
              </>
            )}
          </div>

          <BrainApiCard />
        </div>
      </div>
    </div>
  );
}
