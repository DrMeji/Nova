import { useEffect, useMemo, useState } from 'react';
import { useRouter } from '@/context/RouterContext';
import { detectHardware, detectHardwareAsync, getHardwareClass, getRecommendedModel, type HardwareInfo } from '@/lib/api';
import { getLocalPrefs, setLocalPrefs } from '@/lib/localPrefs';
import {
  downloadEngineModel,
  engineDownloadProgress,
  getEngineStatus,
  setEngineModel,
  startEngine,
  stopEngine,
  type ArkEngineStatus,
} from '@/lib/arkEngine';
import { probeBrain } from '@/lib/brain';
import {
  computePreloadPlan,
  formatDuration,
  formatMBps,
  runSpeedTest,
  type PreloadPlan,
  type SpeedSample,
} from '@/lib/speedTest';
import {
  Cpu, MemoryStick, HardDrive, Zap, Monitor, MonitorCog,
  Power, Activity, Check, Download, Shield,
  Gauge, Boxes, Wifi, Loader2, FolderOpen, FileBox,
} from 'lucide-react';

type TabId = 'overview' | 'speed' | 'hardware' | 'storage' | 'advanced';

const NEXT_PRELOAD_MODEL = { name: 'Qwen2.5-Coder 7B', sizeGb: 4.7 };

const INSTALLED = [
  {
    id: 'qwen25-15b',
    name: 'Qwen2.5 1.5B Instruct',
    detail: 'Default local brain · 1.0 GB · Q4_K_M',
    tone: 'from-emerald-400 to-green-700',
    initial: 'Q1',
    active: true,
  },
  {
    id: 'llama32-3b',
    name: 'Llama 3.2 3B Instruct',
    detail: 'General · 2.0 GB · Q4_K_M',
    tone: 'from-violet-500 to-indigo-700',
    initial: 'L3',
    active: false,
  },
  {
    id: 'qwen25-coder-7b',
    name: 'Qwen2.5-Coder 7B',
    detail: 'Coding · 4.7 GB · Q4_K_M',
    tone: 'from-blue-500 to-indigo-700',
    initial: 'Q7',
    active: false,
  },
];

const CATALOG = [
  {
    id: 'qwen25-15b',
    name: 'Qwen2.5 1.5B Instruct',
    detail: 'Default local brain · ~1.0 GB · Q4_K_M',
    tone: 'from-emerald-400 to-green-700',
    initial: 'Q1',
  },
  {
    id: 'llama32-3b',
    name: 'Llama 3.2 3B Instruct',
    detail: 'General · ~2.0 GB · Q4_K_M',
    tone: 'from-violet-500 to-indigo-700',
    initial: 'L3',
  },
  {
    id: 'qwen25-coder-7b',
    name: 'Qwen2.5-Coder 7B',
    detail: 'Coding · ~4.7 GB · Q4_K_M',
    tone: 'from-cyan-500 to-teal-700',
    initial: 'Q7',
  },
];

function hardwareLabel(pc: ReturnType<typeof getHardwareClass>) {
  if (pc === 'strong') return 'High end capable';
  if (pc === 'standard') return 'Solid mid range';
  return 'Lightweight profile';
}

function FreeBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-400 px-2 py-0.5 text-[10px] font-medium leading-none">
      Free
    </span>
  );
}

function StatusDot({ on }: { on: boolean }) {
  return (
    <span className={`w-2 h-2 rounded-full shrink-0 ${on ? 'bg-ark-accent-green' : 'bg-content-tertiary'}`} />
  );
}

export function LocalAI() {
  const { navigate } = useRouter();
  const [tab, setTab] = useState<TabId>('overview');
  const [hw, setHw] = useState<HardwareInfo>(() => detectHardware());
  const [recommendation] = useState(() => getRecommendedModel(detectHardware()));
  const [engineRunning, setEngineRunning] = useState(false);
  const [enginePhase, setEnginePhase] = useState<'offline' | 'starting' | 'online'>('offline');
  const [installed, setInstalled] = useState(() => [...INSTALLED]);
  const [activeId, setActiveId] = useState(() => getLocalPrefs().defaultModelId || recommendation.id);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [statusNote, setStatusNote] = useState('Starting ARK Engine…');
  const [engineMeta, setEngineMeta] = useState<ArkEngineStatus | null>(null);
  const [brainNote, setBrainNote] = useState('Brain API · checking');
  const [speedTesting, setSpeedTesting] = useState(false);
  const [speedSample, setSpeedSample] = useState<SpeedSample | null>(null);
  const [preloadPlan, setPreloadPlan] = useState<PreloadPlan | null>(null);
  const pcClass = useMemo(() => getHardwareClass(hw), [hw]);

  useEffect(() => {
    let cancelled = false;
    void detectHardwareAsync().then(info => {
      if (!cancelled) setHw(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const applyEngine = (status: ArkEngineStatus) => {
    setEngineMeta(status);
    setEnginePhase(status.phase);
    setEngineRunning(status.phase === 'online');
    setActiveId(status.activeModelId);
    setStatusNote(status.note);
    setInstalled(prev => {
      const fromEngine = status.models
        .filter(m => m.id !== 'ark-core' && m.status === 'ready')
        .map(m => ({
          id: m.id,
          name: m.name,
          detail: m.detail,
          tone: 'from-emerald-400 to-green-700',
          initial: m.name.slice(0, 2).toUpperCase(),
          active: m.id === status.activeModelId,
        }));
      if (fromEngine.length === 0) return prev.map(m => ({ ...m, active: m.id === status.activeModelId }));
      return fromEngine;
    });
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const status = await startEngine();
        if (!cancelled) applyEngine(status);
      } catch {
        if (!cancelled) {
          const status = await getEngineStatus();
          applyEngine(status);
        }
      }
      const brain = await probeBrain();
      if (!cancelled) {
        setBrainNote(
          brain.ok
            ? `ARK Brain · ${brain.version ?? 'ok'} @ :8787`
            : 'ARK Brain · offline (restart desktop ARK)',
        );
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSpeedTest = async () => {
    setSpeedTesting(true);
    try {
      const sample = await runSpeedTest();
      setSpeedSample(sample);
      setPreloadPlan(computePreloadPlan(sample.MBps, NEXT_PRELOAD_MODEL));
    } finally {
      setSpeedTesting(false);
    }
  };

  // Speed tab is available for download/preload estimates (not AI token speed).

  const toggleEngine = () => {
    if (engineRunning) {
      void stopEngine().then(applyEngine);
      return;
    }
    setEnginePhase('starting');
    setStatusNote('Starting ARK Engine…');
    void startEngine().then(applyEngine);
  };

  const switchModel = (id: string) => {
    void setEngineModel(id)
      .then(status => {
        applyEngine(status);
        setLocalPrefs({ defaultModelId: id });
        setStatusNote(`ARK Engine · active model updated`);
      })
      .catch(err => {
        setStatusNote(err instanceof Error ? err.message : 'Could not switch model');
      });
  };

  const downloadModel = (model: typeof CATALOG[number]) => {
    if (downloadingId) return;
    setDownloadingId(model.id);
    setDownloadProgress(0);
    void downloadEngineModel(model.id).then(async () => {
      const tick = window.setInterval(async () => {
        const p = await engineDownloadProgress(model.id);
        setDownloadProgress(p);
        try {
          const { engineDownloadError } = await import('@/lib/arkEngine');
          const err = await engineDownloadError(model.id);
          if (err) {
            window.clearInterval(tick);
            setDownloadingId(null);
            setDownloadProgress(0);
            setStatusNote(err);
            return;
          }
        } catch {
          /* ignore */
        }
        if (p >= 100) {
          window.clearInterval(tick);
          setDownloadingId(null);
          setDownloadProgress(0);
          const status = await getEngineStatus();
          applyEngine(status);
          setStatusNote(`${model.name} ready in ARK Engine`);
        }
      }, 350);
    }).catch(err => {
      setDownloadingId(null);
      setStatusNote(err instanceof Error ? err.message : 'Download failed');
    });
  };

  const activeModel = installed.find(m => m.id === activeId) ?? {
    id: recommendation.id,
    name: recommendation.name,
    detail: `${recommendation.size} · Q4_K_M`,
    tone: 'from-sky-500 to-blue-700',
    initial: 'AI',
    active: true,
  };

  const specs = [
    { icon: Monitor, label: 'Operating system', value: hw.os },
    { icon: Cpu, label: 'CPU', value: hw.cpu },
    { icon: MemoryStick, label: 'System RAM', value: hw.ram },
    { icon: MonitorCog, label: 'GPU', value: hw.gpu },
    ...(hw.motherboard
      ? [{ icon: HardDrive, label: 'Motherboard', value: hw.motherboard }]
      : []),
    { icon: Zap, label: 'Acceleration', value: hw.acceleration },
    { icon: HardDrive, label: 'VRAM / memory', value: hw.vram },
    { icon: HardDrive, label: 'Host', value: hw.storage },
    { icon: Gauge, label: 'Hardware profile', value: hardwareLabel(pcClass) },
  ];

  const engineRows = [
    { label: 'Status', value: engineRunning ? 'Online' : 'Offline', live: engineRunning },
    { label: 'Engine', value: 'Built in local runtime' },
    { label: 'Acceleration', value: hw.acceleration },
    { label: 'Active model', value: activeModel.name },
  ];

  const performanceRows = [
    {
      label: 'Engine phase',
      value: engineMeta?.phase ?? (engineRunning ? 'online' : 'offline'),
    },
    {
      label: 'Active model',
      value: engineMeta?.activeModelName ?? activeModel.name,
    },
    {
      label: 'Models ready',
      value: String(engineMeta?.models?.filter(m => m.status === 'ready').length ?? installed.length),
    },
    {
      label: 'Brain',
      value: brainNote,
    },
  ];

  const advancedRows = [
    { label: 'Runtime', value: 'ARK Engine' },
    { label: 'Active model', value: engineMeta?.activeModelName ?? activeModel.name },
    { label: 'ARK Brain', value: brainNote },
    { label: 'GGUF files', value: String((engineMeta as { ggufCount?: number } | null)?.ggufCount ?? 0) },
    { label: 'GGUF binary', value: (engineMeta as { ggufBinary?: boolean } | null)?.ggufBinary ? 'Found' : 'Not installed' },
    { label: 'Models folder', value: engineMeta?.modelsDir ?? '—' },
    { label: 'Engine version', value: engineMeta?.version ?? '—' },
    { label: 'OS / CPU', value: `${hw.os} · ${hw.cpu}` },
    { label: 'RAM', value: hw.ram },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden animate-fade-in bg-ark-navy-950">
      <div className="shrink-0 px-6 pt-[min(12vh,6rem)] bg-ark-navy-950">
        <div className="w-full max-w-4xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h1 className="text-3xl font-semibold text-content-primary tracking-tight">Local AI</h1>
            </div>
            <button
              type="button"
              onClick={toggleEngine}
              className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm shrink-0 transition-colors ${
                engineRunning
                  ? 'bg-surface-hover text-ark-accent-red hover:bg-surface-hover/80'
                  : 'text-[rgb(var(--color-accent-fg))]'
              }`}
              style={!engineRunning ? { backgroundColor: 'rgb(var(--color-accent))' } : undefined}
            >
              {enginePhase === 'starting' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
              {enginePhase === 'starting' ? 'Starting' : engineRunning ? 'Stop' : 'Start'}
            </button>
          </div>

          <div className="flex items-center gap-1 mb-4 flex-wrap">
            {([
              { id: 'overview' as const, label: 'Overview' },
              { id: 'speed' as const, label: 'Speed' },
              { id: 'hardware' as const, label: 'Hardware' },
              { id: 'storage' as const, label: 'Storage' },
              { id: 'advanced' as const, label: 'Advanced' },
            ] as const).map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                  tab === t.id
                    ? 'bg-surface-hover text-content-primary'
                    : 'text-content-secondary hover:text-content-primary'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-10">
        <div className="w-full max-w-4xl mx-auto">
          {/* Hardware strip always visible */}
          <section className="mb-8 rounded-2xl border border-surface-border bg-surface-hover/30 px-4 py-4">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-surface-hover flex items-center justify-center shrink-0">
                <Monitor className="w-5 h-5 text-content-secondary" />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-content-tertiary leading-relaxed">
                  {hw.os} · {hw.cpu} · {hw.ram} RAM · {hw.gpu} · {hw.acceleration}
                </p>
                <p className="text-xs text-content-secondary mt-1">
                  Profile: {hardwareLabel(pcClass)} · Local models stay on this machine
                </p>
              </div>
            </div>
          </section>

          {tab === 'overview' && (
            <div className="space-y-10">
              {/* Engine */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Cpu className="w-4 h-4 text-content-secondary" />
                  <h2 className="text-base font-semibold text-content-primary">Engine</h2>
                </div>
                <div className="flex flex-col">
                  {engineRows.map(row => (
                    <div
                      key={row.label}
                      className="flex items-center gap-3 py-3 px-1 rounded-xl"
                    >
                      <span className="w-28 shrink-0 text-sm text-content-secondary">{row.label}</span>
                      <span className="min-w-0 flex-1 flex items-center gap-2 text-sm text-content-primary">
                        {'live' in row && row.live !== undefined && <StatusDot on={!!row.live} />}
                        <span className="truncate">{row.value}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Active model */}
              <section>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-content-secondary" />
                    <h2 className="text-base font-semibold text-content-primary">Active model</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate({ name: 'models' })}
                    className="text-xs text-content-secondary hover:text-content-primary transition-colors"
                  >
                    Browse models
                  </button>
                </div>
                <div className="flex items-center gap-3 py-3 px-1 rounded-xl hover:bg-surface-hover/50 transition-colors">
                  <span className={`w-10 h-10 rounded-xl bg-gradient-to-br ${activeModel.tone} flex items-center justify-center text-[10px] font-bold text-white shrink-0`}>
                    {activeModel.initial}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="text-sm font-medium text-content-primary truncate">{activeModel.name}</span>
                      <FreeBadge />
                    </span>
                    <span className="block text-xs text-content-tertiary truncate mt-0.5">
                      {activeModel.detail} · {hw.acceleration}
                    </span>
                  </span>
                  <span className={`inline-flex items-center gap-1.5 text-xs shrink-0 ${
                    engineRunning ? 'text-ark-accent-green' : 'text-content-tertiary'
                  }`}>
                    <StatusDot on={engineRunning} />
                    {engineRunning ? 'Loaded' : 'Idle'}
                  </span>
                </div>
              </section>

              {/* Installed */}
              <section>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <Boxes className="w-4 h-4 text-content-secondary" />
                    <h2 className="text-base font-semibold text-content-primary">Installed</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate({ name: 'chat' })}
                    className="text-xs text-sky-400 hover:text-sky-300"
                  >
                    Use in chat
                  </button>
                </div>
                <p className="text-xs text-content-tertiary mb-4">{statusNote}</p>
                {downloadingId && (
                  <div className="mb-4 rounded-xl border border-surface-border bg-ark-navy-900/40 px-3 py-2.5">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-content-secondary">Downloading model…</span>
                      <span className="text-content-tertiary tabular-nums">{downloadProgress}%</span>
                    </div>
                    <div className="h-1 bg-surface-hover rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-400/80 transition-all" style={{ width: `${downloadProgress}%` }} />
                    </div>
                  </div>
                )}
                <div className="flex flex-col">
                  {installed.map(model => {
                    const isActive = model.id === activeId;
                    return (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => switchModel(model.id)}
                        className="w-full flex items-center gap-3 py-3 px-1 rounded-xl text-left hover:bg-surface-hover/50 transition-colors"
                      >
                        <span className={`w-10 h-10 rounded-xl bg-gradient-to-br ${model.tone} flex items-center justify-center text-[10px] font-bold text-white shrink-0`}>
                          {model.initial}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 min-w-0 flex-wrap">
                            <span className="text-sm font-medium text-content-primary truncate">{model.name}</span>
                            <FreeBadge />
                            {isActive && (
                              <span className="inline-flex items-center rounded-full bg-sky-500/15 text-sky-400 px-2 py-0.5 text-[10px] font-medium leading-none">
                                Active
                              </span>
                            )}
                          </span>
                          <span className="block text-xs text-content-tertiary truncate mt-0.5">{model.detail}</span>
                        </span>
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                          isActive ? 'bg-surface-hover text-ark-accent-green' : 'text-content-tertiary'
                        }`}>
                          {isActive ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4 opacity-40" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Download className="w-4 h-4 text-content-secondary" />
                  <h2 className="text-base font-semibold text-content-primary">Get more models</h2>
                </div>
                <div className="flex flex-col">
                  {CATALOG.filter(m => !installed.some(i => i.id === m.id)).map(model => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => downloadModel(model)}
                      disabled={Boolean(downloadingId)}
                      className="w-full flex items-center gap-3 py-3 px-1 rounded-xl text-left hover:bg-surface-hover/50 transition-colors disabled:opacity-50"
                    >
                      <span className={`w-10 h-10 rounded-xl bg-gradient-to-br ${model.tone} flex items-center justify-center text-[10px] font-bold text-white shrink-0`}>
                        {model.initial}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-content-primary truncate block">{model.name}</span>
                        <span className="block text-xs text-content-tertiary truncate mt-0.5">{model.detail}</span>
                      </span>
                      <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-content-secondary hover:text-content-primary">
                        {downloadingId === model.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              {/* Performance */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Gauge className="w-4 h-4 text-content-secondary" />
                  <h2 className="text-base font-semibold text-content-primary">Performance</h2>
                </div>
                <div className="flex flex-col">
                  {performanceRows.map(row => (
                    <div key={row.label} className="flex items-center gap-3 py-3 px-1">
                      <span className="w-36 shrink-0 text-sm text-content-secondary">{row.label}</span>
                      <span className="text-sm text-content-primary tabular-nums">{row.value}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-content-secondary" />
                    <h2 className="text-base font-semibold text-content-primary">Connection & preload</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTab('speed')}
                    className="text-xs text-content-secondary hover:text-content-primary transition-colors"
                  >
                    Open Speed
                  </button>
                </div>
                <p className="text-sm text-content-tertiary px-1">
                  Measure download speed so ARK can estimate model install times and preload the next brain while you work.
                </p>
              </section>

              <p className="flex items-start gap-2 text-xs text-content-tertiary pt-2">
                <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5 text-content-secondary" />
                <span>
                  Local AI keeps prompts and generations on this PC. Nothing is sent to the cloud while you use local models.
                </span>
              </p>
            </div>
          )}

          {tab === 'speed' && (
            <div className="space-y-10">
              <section>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-content-secondary" />
                    <h2 className="text-base font-semibold text-content-primary">Download speed</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleSpeedTest()}
                    disabled={speedTesting}
                    className="inline-flex items-center gap-2 rounded-full bg-surface-hover px-3.5 py-2 text-sm text-content-primary hover:bg-surface-hover/80 transition-colors disabled:opacity-50"
                  >
                    {speedTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                    {speedTesting ? 'Measuring…' : 'Run speed test'}
                  </button>
                </div>
                <p className="text-xs text-content-tertiary mb-4 px-1 leading-relaxed">
                  This measures <span className="text-content-secondary">download throughput</span> for model installs —
                  not how fast the AI replies. Use it to plan when to preload the next GGUF.
                </p>
                <div className="flex flex-col">
                  <div className="flex items-center gap-3 py-3 px-1">
                    <span className="w-40 shrink-0 text-sm text-content-secondary">Download speed</span>
                    <span className="text-sm text-content-primary">
                      {speedSample ? formatMBps(speedSample.MBps) : 'Not tested yet'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 py-3 px-1">
                    <span className="w-40 shrink-0 text-sm text-content-secondary">Source</span>
                    <span className="text-sm text-content-primary capitalize">
                      {speedSample
                        ? speedSample.source === 'measured'
                          ? 'Live measurement'
                          : speedSample.source === 'browser'
                            ? 'Browser estimate'
                            : 'Fallback estimate'
                        : 'n/a'}
                    </span>
                  </div>
                  {preloadPlan && (
                    <div className="flex items-center gap-3 py-3 px-1">
                      <span className="w-40 shrink-0 text-sm text-content-secondary">Connection</span>
                      <span className={`text-sm ${
                        preloadPlan.rating === 'slow'
                          ? 'text-amber-400'
                          : preloadPlan.rating === 'fast'
                            ? 'text-ark-accent-green'
                            : 'text-content-primary'
                      }`}>
                        {preloadPlan.ratingLabel}
                      </span>
                    </div>
                  )}
                </div>
              </section>

              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Download className="w-4 h-4 text-content-secondary" />
                  <h2 className="text-base font-semibold text-content-primary">Preload planner</h2>
                </div>
                {!preloadPlan ? (
                  <p className="text-sm text-content-tertiary px-1">
                    Run a speed test to calculate when ARK should start downloading the next model in the background.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-col mb-5">
                      <div className="flex items-center gap-3 py-3 px-1">
                        <span className="w-44 shrink-0 text-sm text-content-secondary">Next model</span>
                        <span className="text-sm text-content-primary">
                          {preloadPlan.nextModelName} · {preloadPlan.nextModelSizeGb} GB
                        </span>
                      </div>
                      <div className="flex items-center gap-3 py-3 px-1">
                        <span className="w-44 shrink-0 text-sm text-content-secondary">Download time</span>
                        <span className="text-sm text-content-primary tabular-nums">
                          ~{formatDuration(preloadPlan.downloadSeconds)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 py-3 px-1">
                        <span className="w-44 shrink-0 text-sm text-content-secondary">Start preload at</span>
                        <span className="text-sm text-content-primary">~{preloadPlan.startAtPercent}% usage</span>
                      </div>
                      <div className="flex items-center gap-3 py-3 px-1">
                        <span className="w-44 shrink-0 text-sm text-content-secondary">Measured speed</span>
                        <span className="text-sm text-content-primary">
                          {speedSample ? `${formatMBps(speedSample.MBps)} · ${speedSample.source}` : '—'}
                        </span>
                      </div>
                    </div>

                    <div className="px-1 mb-3">
                      <div className="relative h-2 rounded-full bg-surface-hover overflow-hidden">
                        <div
                          className="absolute inset-y-0 left-0 bg-emerald-500/70 rounded-full"
                          style={{ width: `${preloadPlan.startAtPercent}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-2 text-[10px] text-content-tertiary">
                        <span>0%</span>
                        <span className="text-emerald-400">Start preload by {preloadPlan.startAtPercent}%</span>
                        <span>100%</span>
                      </div>
                    </div>

                    <p className="text-xs text-content-tertiary px-1 leading-relaxed">
                      {preloadPlan.summary}
                    </p>
                  </>
                )}
              </section>

              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="w-4 h-4 text-content-secondary" />
                  <h2 className="text-base font-semibold text-content-primary">How it works</h2>
                </div>
                <div className="flex flex-col text-sm">
                  <div className="py-3 px-1">
                    <p className="text-content-primary font-medium">1. Measure the line</p>
                    <p className="text-xs text-content-tertiary mt-1">
                      Know how fast models can download on this connection.
                    </p>
                  </div>
                  <div className="py-3 px-1">
                    <p className="text-content-primary font-medium">2. Time the next download</p>
                    <p className="text-xs text-content-tertiary mt-1">
                      A 5 GB model on a slow line needs to start much earlier than on a fast line.
                    </p>
                  </div>
                  <div className="py-3 px-1">
                    <p className="text-content-primary font-medium">3. Preload while you work</p>
                    <p className="text-xs text-content-tertiary mt-1">
                      While you chat on the current model, ARK downloads the next one in the background and switches when ready, with no stall.
                    </p>
                  </div>
                </div>
              </section>
            </div>
          )}

          {tab === 'hardware' && (
            <div className="space-y-10">
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <MonitorCog className="w-4 h-4 text-content-secondary" />
                  <h2 className="text-base font-semibold text-content-primary">Detected hardware</h2>
                </div>
                <div className="flex flex-col">
                  {specs.map(spec => (
                    <div key={spec.label} className="flex items-center gap-3 py-3 px-1 rounded-xl hover:bg-surface-hover/40 transition-colors">
                      <span className="w-9 h-9 rounded-lg bg-surface-hover flex items-center justify-center shrink-0">
                        <spec.icon className="w-4 h-4 text-content-secondary" />
                      </span>
                      <span className="w-40 shrink-0 text-sm text-content-secondary">{spec.label}</span>
                      <span className="min-w-0 flex-1 text-sm text-content-primary truncate">{spec.value}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="w-4 h-4 text-content-secondary" />
                  <h2 className="text-base font-semibold text-content-primary">What this means</h2>
                </div>
                <div className="flex flex-col text-sm">
                  <div className="py-3 px-1">
                    <p className="text-content-primary font-medium">Recommended model</p>
                    <p className="text-xs text-content-tertiary mt-1">
                      {recommendation.name} · {recommendation.size}, best fit from the current scan.
                    </p>
                  </div>
                  <div className="py-3 px-1">
                    <p className="text-content-primary font-medium">Acceleration</p>
                    <p className="text-xs text-content-tertiary mt-1">
                      {hw.acceleration === 'CPU'
                        ? 'Running on CPU. Smaller models will feel snappier.'
                        : `Using ${hw.acceleration} for faster local responses when a model is loaded.`}
                    </p>
                  </div>
                  <div className="py-3 px-1">
                    <p className="text-content-primary font-medium">Privacy</p>
                    <p className="text-xs text-content-tertiary mt-1">
                      Inference stays on this machine. Cloud providers are only used when you choose Cloud AI.
                    </p>
                  </div>
                </div>
              </section>
            </div>
          )}

          {tab === 'storage' && (
            <div className="space-y-8">
              <section>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-content-secondary" />
                    <h2 className="text-base font-semibold text-content-primary">Downloaded models</h2>
                  </div>
                  {engineMeta?.modelsDir && window.arkDesktop?.openPath && (
                    <button
                      type="button"
                      onClick={() => void window.arkDesktop?.openPath?.(engineMeta.modelsDir)}
                      className="inline-flex items-center gap-2 rounded-full bg-surface-hover px-3 py-1.5 text-xs text-content-primary hover:bg-surface-hover/80"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      Open folder
                    </button>
                  )}
                </div>
                <p className="text-xs text-content-tertiary mb-3 font-mono break-all">
                  {engineMeta?.modelsDir ?? 'Open ARK Desktop to see the models folder on this PC.'}
                </p>
                {(engineMeta?.modelFiles?.length ?? 0) === 0 ? (
                  <p className="text-sm text-content-tertiary">
                    No GGUF files yet. Download a brain from Overview or finish first-run setup.
                  </p>
                ) : (
                  <div className="flex flex-col">
                    {engineMeta?.modelFiles?.map(f => (
                      <div key={f.path} className="flex items-start gap-3 py-3 border-b border-surface-border/60 last:border-0">
                        <FileBox className="w-4 h-4 text-content-secondary shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-content-primary font-medium">{f.file}</p>
                          <p className="text-xs text-content-tertiary mt-0.5">{f.sizeMb} MB</p>
                          <p className="text-[11px] text-content-tertiary font-mono break-all mt-1">{f.path}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <div className="flex items-center gap-2 mb-3">
                  <HardDrive className="w-4 h-4 text-content-secondary" />
                  <h2 className="text-base font-semibold text-content-primary">Runtime</h2>
                </div>
                <div className="flex flex-col text-sm">
                  <div className="flex gap-3 py-2">
                    <span className="w-36 shrink-0 text-content-secondary">llama-cli</span>
                    <span className="text-content-primary font-mono break-all">
                      {engineMeta?.ggufBinaryPath || (engineMeta?.ggufBinary ? 'Installed' : 'Not installed')}
                    </span>
                  </div>
                  <div className="flex gap-3 py-2">
                    <span className="w-36 shrink-0 text-content-secondary">GGUF count</span>
                    <span className="text-content-primary">{engineMeta?.ggufCount ?? 0}</span>
                  </div>
                </div>
              </section>
            </div>
          )}

          {tab === 'advanced' && (
            <div className="space-y-10">
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <FolderOpen className="w-4 h-4 text-content-secondary" />
                  <h2 className="text-base font-semibold text-content-primary">Models folder</h2>
                </div>
                <p className="text-xs text-content-tertiary mb-3 leading-relaxed">
                  GGUF weights download and load from this folder. Change it if you want models on another drive.
                </p>
                <p className="text-xs text-content-primary font-mono break-all mb-3 px-1">
                  {engineMeta?.modelsDir ?? '—'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.arkDesktop?.modelsDirPick) return;
                      try {
                        const res = await window.arkDesktop.modelsDirPick();
                        if (res?.canceled) return;
                        if (res?.ok === false && res.error) {
                          setStatusNote(res.error);
                          return;
                        }
                        const next = await getEngineStatus();
                        applyEngine(next);
                        setStatusNote(`Models folder set · ${next.modelsDir}`);
                      } catch (err) {
                        setStatusNote(err instanceof Error ? err.message : 'Could not change folder');
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-full bg-surface-hover px-3.5 py-2 text-sm text-content-primary hover:bg-surface-hover/80 transition-colors"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    Change folder
                  </button>
                  <button
                    type="button"
                    disabled={!engineMeta?.modelsDirIsCustom}
                    onClick={async () => {
                      if (!window.arkDesktop?.modelsDirReset) return;
                      await window.arkDesktop.modelsDirReset();
                      const next = await getEngineStatus();
                      applyEngine(next);
                      setStatusNote('Models folder reset to default');
                    }}
                    className="inline-flex items-center gap-2 rounded-full bg-surface-hover px-3.5 py-2 text-sm text-content-primary hover:bg-surface-hover/80 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                  >
                    Use default
                  </button>
                  {engineMeta?.modelsDir && window.arkDesktop?.openPath && (
                    <button
                      type="button"
                      onClick={() => void window.arkDesktop?.openPath?.(engineMeta.modelsDir)}
                      className="inline-flex items-center gap-2 rounded-full bg-surface-hover px-3.5 py-2 text-sm text-content-primary hover:bg-surface-hover/80 transition-colors"
                    >
                      Open folder
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-content-tertiary mt-3 leading-relaxed">
                  Existing downloads stay where they are. New GGUF installs go to the folder above.
                  {engineMeta?.modelsDirIsCustom
                    ? ` Default was ${engineMeta.modelsDirDefault ?? 'app data'}.`
                    : ' Using the default ARK Engine location.'}
                </p>
              </section>

              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Gauge className="w-4 h-4 text-content-secondary" />
                  <h2 className="text-base font-semibold text-content-primary">Engine parameters</h2>
                </div>
                <div className="flex flex-col">
                  {advancedRows.map(row => (
                    <div key={row.label} className="flex items-center gap-3 py-3 px-1">
                      <span className="w-40 shrink-0 text-sm text-content-secondary">{row.label}</span>
                      <span className="text-sm text-content-primary font-mono tabular-nums">{row.value}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Power className="w-4 h-4 text-content-secondary" />
                  <h2 className="text-base font-semibold text-content-primary">Controls</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={toggleEngine}
                    className="inline-flex items-center gap-2 rounded-full bg-surface-hover px-3.5 py-2 text-sm text-content-primary hover:bg-surface-hover/80 transition-colors"
                  >
                    <Power className="w-3.5 h-3.5" />
                    {engineRunning ? 'Stop engine' : 'Start engine'}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate({ name: 'models' })}
                    className="inline-flex items-center gap-2 rounded-full bg-surface-hover px-3.5 py-2 text-sm text-content-primary hover:bg-surface-hover/80 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Manage models
                  </button>
                </div>
                <p className="text-xs text-content-tertiary mt-4">
                  Controls talk to ARK Engine on this PC. Hardware and speed values are measured from your machine.
                </p>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
