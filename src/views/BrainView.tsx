import { useEffect, useState } from 'react';
import { Boxes, Cloud, Monitor, Sparkles } from 'lucide-react';
import { getEngineStatus, type ArkEngineStatus } from '@/lib/arkEngine';
import { BrainApiCard } from '@/components/BrainApiCard';
import { ArkMark } from '@/components/ArkMark';
import { getBrainProfile, type BrainProfile } from '@/lib/brainProfile';
import { ModelsView } from '@/views/ModelsView';
import { useRouter } from '@/context/RouterContext';

export type BrainTab = 'installed' | 'recommended' | 'cloud' | 'this-pc';

const BRAIN_TABS: { id: BrainTab; label: string; icon: typeof Boxes }[] = [
  { id: 'installed', label: 'Installed', icon: Boxes },
  { id: 'recommended', label: 'Recommended', icon: Sparkles },
  { id: 'cloud', label: 'Cloud', icon: Cloud },
  { id: 'this-pc', label: 'This PC', icon: Monitor },
];

function resolveInitialTab(
  initialTab: BrainTab | undefined,
  routeName: string,
  routeTab?: string,
): BrainTab {
  if (initialTab && BRAIN_TABS.some(t => t.id === initialTab)) return initialTab;
  if (routeName === 'local-ai') return 'this-pc';
  if (routeName === 'models') {
    if (routeTab === 'cloud') return 'cloud';
    if (routeTab === 'for-pc') return 'recommended';
    return 'installed';
  }
  if (routeName === 'brain') {
    if (routeTab === 'installed' || routeTab === 'recommended' || routeTab === 'cloud' || routeTab === 'this-pc') {
      return routeTab;
    }
  }
  return 'installed';
}

export function BrainView({ initialTab }: { initialTab?: BrainTab } = {}) {
  const { route, navigate } = useRouter();
  const routeTab = 'tab' in route ? route.tab : undefined;
  const [tab, setTab] = useState<BrainTab>(() =>
    resolveInitialTab(initialTab, route.name, routeTab),
  );
  const [engineSnap, setEngineSnap] = useState<Pick<
    ArkEngineStatus,
    'phase' | 'activeModelName' | 'ggufBinary' | 'modelsDir' | 'note' | 'models'
  > | null>(null);
  const [profile, setProfile] = useState<BrainProfile | null>(null);

  useEffect(() => {
    setTab(resolveInitialTab(initialTab, route.name, routeTab));
  }, [initialTab, route.name, routeTab]);

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

  useEffect(() => {
    void getBrainProfile(true)
      .then(setProfile)
      .catch(() => setProfile(null));
  }, []);

  const selectTab = (next: BrainTab) => {
    setTab(next);
    navigate({ name: 'brain', tab: next });
  };

  const showModelsEmbed = tab === 'installed' || tab === 'cloud';

  return (
    <div className="h-full min-w-0 flex flex-col overflow-hidden animate-fade-in bg-transparent">
      <div className="shrink-0 px-4 sm:px-6 pt-[min(12vh,6rem)] bg-transparent">
        <div className="w-full max-w-4xl mx-auto min-w-0">
          <div className="flex items-center gap-3 mb-5 min-w-0">
            <ArkMark className="w-9 h-9 shrink-0" title="NOVA Brain" />
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-semibold text-content-primary tracking-tight">
                Brain
              </h1>
              <p className="mt-1 text-xs text-content-tertiary">
                Installed models, PC recommendations, cloud sources, and this machine.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 mb-4 flex-wrap">
            {BRAIN_TABS.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTab(t.id)}
                className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                  tab === t.id
                    ? 'bg-surface-hover text-content-primary'
                    : 'text-content-secondary hover:text-content-primary'
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
        {showModelsEmbed ? (
          <ModelsView
            embedTab={tab === 'cloud' ? 'cloud' : 'local'}
            hideChrome
          />
        ) : tab === 'recommended' ? (
          <div className="h-full min-h-0 overflow-y-auto px-4 sm:px-6 pb-10">
            <div className="w-full max-w-4xl mx-auto min-w-0 space-y-6">
              {!profile ? (
                <p className="text-sm text-content-tertiary">Probing this PC…</p>
              ) : (
                <>
                  <p className="text-sm text-content-secondary">
                    {profile.reason}
                  </p>
                  <p className="text-xs text-content-tertiary">
                    Preferred coder quant: {profile.preferredQuant}
                    {' '}(Q5_K_M when it fits, else Q4_K_M — never Q3/Q2 or 1.5B as coder)
                  </p>
                  <div className="space-y-4">
                    {[
                      { label: 'Chat', ref: profile.recommend.chat },
                      { label: 'Coder', ref: profile.recommend.coder },
                      { label: 'Vision', ref: profile.recommend.vision },
                    ].map(row => (
                      <div
                        key={row.label}
                        className="rounded-xl border border-surface-border px-4 py-3"
                      >
                        <p className="text-xs text-content-tertiary mb-1">{row.label}</p>
                        {row.ref ? (
                          <>
                            <p className="text-sm font-medium text-content-primary">{row.ref.name}</p>
                            <p className="text-[11px] text-content-tertiary font-mono mt-0.5">{row.ref.id}</p>
                            {row.label === 'Coder' ? (
                              <p className="text-xs text-content-tertiary mt-1">
                                Download as {profile.preferredQuant} when available
                              </p>
                            ) : null}
                          </>
                        ) : (
                          <p className="text-sm text-content-tertiary">
                            {row.label === 'Coder'
                              ? 'No local coder on this PC — use scaffold + optional cloud'
                              : 'Not recommended on this PC'}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => selectTab('installed')}
                    className="text-xs text-sky-400 hover:text-sky-300"
                  >
                    Browse installed & catalog →
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full min-h-0 overflow-y-auto px-4 sm:px-6 pb-10">
            <div className="w-full max-w-xl mx-auto min-w-0 space-y-4 pt-2">
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

              <div className="rounded-xl border border-surface-border p-4 space-y-2 text-sm">
                <p className="font-medium text-content-primary">This PC</p>
                {profile ? (
                  <>
                    <p className="text-content-secondary">
                      RAM ~{profile.ramGB} GB · VRAM ~{profile.vramGB} GB
                      {profile.gpuUsable ? ' · GPU usable' : ' · CPU path'}
                    </p>
                    <p className="text-content-secondary">
                      Max coder ~{profile.maxCoderParamsB}B · Max chat ~{profile.maxChatParamsB}B
                      {profile.allowMultiModel ? ' · Multi-model ok' : ''}
                    </p>
                    <p className="text-content-secondary">
                      Preferred quant · {profile.preferredQuant}
                    </p>
                    {profile.recommend?.coder || profile.recommend?.chat ? (
                      <p className="text-[12px] text-content-tertiary">
                        Suggest:{' '}
                        {[profile.recommend.chat?.name, profile.recommend.coder?.name]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    ) : null}
                    {profile.reason ? (
                      <p className="text-xs text-content-tertiary">{profile.reason}</p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-content-tertiary">Probing this PC…</p>
                )}
                <button
                  type="button"
                  onClick={() => selectTab('recommended')}
                  className="text-[12px] text-sky-400 hover:text-sky-300"
                >
                  Open Recommended →
                </button>
              </div>

              <BrainApiCard />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
