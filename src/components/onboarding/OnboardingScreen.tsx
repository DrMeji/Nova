import { useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  completeOnboarding,
  detectHardwareAsync,
  getHardwareClass,
  getRecommendedChatModel,
  getRecommendedCoderModel,
  saveHardwareSnapshot,
  type HardwareInfo,
} from '@/lib/api';
import { markSetupCompleted } from '@/lib/setup';
import {
  computePreloadPlan,
  formatDuration,
  formatMBps,
  runSpeedTest,
  saveSpeedSample,
  type HostSpeed,
  type PreloadPlan,
} from '@/lib/speedTest';
import {
  formatMs,
  probeConnectedApis,
  type ProviderProbe,
} from '@/lib/providerSpeed';
import {
  getProviderApiKeys,
  getLocalPrefs,
  setLocalPrefs,
  setProviderApiKey,
  type LocalPrefs,
} from '@/lib/localPrefs';
import { syncWorkspaceGrantsFromPrefs } from '@/lib/workspaceGrants';
import { openInSystemBrowser } from '@/lib/openExternal';
import { AuthAmbientOrbs } from '@/components/auth/AuthAmbientOrbs';
import {
  Loader2, Cpu, MemoryStick, HardDrive, Zap, CheckCircle2, Download,
  Monitor, MonitorCog, Check, Gauge, KeyRound, Shield, ExternalLink, Wifi, FolderOpen,
  FolderKanban, HardDriveDownload, Sparkles,
} from 'lucide-react';

type Phase = 'intro' | 'hardware' | 'speed' | 'models' | 'access' | 'connect' | 'finishing';

type RecModel = {
  id: string;
  name: string;
  size: string;
  detail: string;
  recommended?: boolean;
};

type ConnectProvider = {
  id: string;
  name: string;
  blurb: string;
  signupUrl: string;
  free: boolean;
  tone: string;
  initial: string;
};

const CONNECT_PROVIDERS: ConnectProvider[] = [
  {
    id: 'groq',
    name: 'Groq',
    blurb: 'Fast free Llama chat & coding.',
    signupUrl: 'https://console.groq.com/keys',
    free: true,
    tone: 'from-orange-500 to-red-700',
    initial: 'Gq',
  },
  {
    id: 'google',
    name: 'Google AI Studio',
    blurb: 'Gemini free tier. One key.',
    signupUrl: 'https://aistudio.google.com/apikey',
    free: true,
    tone: 'from-blue-500 to-sky-700',
    initial: 'G',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    blurb: 'Many free routes · good backup.',
    signupUrl: 'https://openrouter.ai/keys',
    free: true,
    tone: 'from-violet-500 to-purple-800',
    initial: 'OR',
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    blurb: 'Free chat + FLUX images.',
    signupUrl: 'https://huggingface.co/settings/tokens',
    free: true,
    tone: 'from-yellow-500 to-amber-700',
    initial: 'HF',
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    blurb: 'Free NIM endpoints for chat.',
    signupUrl: 'https://build.nvidia.com/',
    free: true,
    tone: 'from-lime-500 to-green-800',
    initial: 'NV',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    blurb: 'Optional paid GPT / DALL·E path.',
    signupUrl: 'https://platform.openai.com/api-keys',
    free: false,
    tone: 'from-emerald-400 to-green-800',
    initial: 'OA',
  },
];

function hardwareLabel(pc: ReturnType<typeof getHardwareClass>) {
  if (pc === 'strong') return 'High end capable';
  if (pc === 'standard') return 'Solid mid range';
  return 'Lightweight profile';
}

function recommendationsFor(hw: HardwareInfo): RecModel[] {
  const pc = getHardwareClass(hw);
  const primary = getRecommendedChatModel(hw);

  if (pc === 'strong') {
    return [
      { id: primary.id, name: primary.name, size: primary.size, detail: 'Best chat brain for this PC', recommended: true },
      { id: 'qwen25-coder-7b', name: 'Qwen2.5-Coder 7B', size: '4.7 GB', detail: 'Coding · build apps in ARK' },
      { id: 'llama32-3b', name: 'Llama 3.2 3B Instruct', size: '2.0 GB', detail: 'Lighter general use' },
    ];
  }

  if (pc === 'standard') {
    return [
      { id: primary.id, name: primary.name, size: primary.size, detail: 'Best chat brain for this PC', recommended: true },
      { id: 'qwen25-coder-7b', name: 'Qwen2.5-Coder 7B', size: '4.7 GB', detail: 'Coding · larger download' },
      { id: 'qwen25-15b', name: 'Qwen2.5 1.5B Instruct', size: '1.0 GB', detail: 'Fastest install' },
    ];
  }

  return [
    { id: primary.id, name: primary.name, size: primary.size, detail: 'Default local brain for this PC', recommended: true },
    { id: 'llama32-3b', name: 'Llama 3.2 3B Instruct', size: '2.0 GB', detail: 'Stronger general chat' },
  ];
}

function queueSetupBrainDownloads(opts: {
  chatId: string;
  chatName?: string;
  hw: HardwareInfo | null;
}) {
  void import('@/lib/engineDownloads').then(({ startEngineDownload }) => {
    void startEngineDownload({
      id: opts.chatId,
      name: opts.chatName || opts.chatId,
      source: 'local-ai',
      forceUnknownDisk: true,
    }).catch(() => undefined);
    if (!opts.hw) return;
    const coder = getRecommendedCoderModel(opts.hw);
    if (coder && coder.id !== opts.chatId) {
      void startEngineDownload({
        id: coder.id,
        name: coder.name,
        source: 'local-ai',
        forceUnknownDisk: true,
      }).catch(() => undefined);
    }
  });
}

export function OnboardingScreen() {
  const { refreshProfile } = useAuth();
  const [phase, setPhase] = useState<Phase>('intro');
  const [hw, setHw] = useState<HardwareInfo | null>(null);
  const [hwScanning, setHwScanning] = useState(false);
  const [hwStep, setHwStep] = useState(0);
  const [speedTesting, setSpeedTesting] = useState(false);
  const [speedPlan, setSpeedPlan] = useState<PreloadPlan | null>(null);
  const [speedMbps, setSpeedMbps] = useState<number | null>(null);
  const [speedHostName, setSpeedHostName] = useState<string | null>(null);
  const [speedHosts, setSpeedHosts] = useState<HostSpeed[]>([]);
  const [speedSkipped, setSpeedSkipped] = useState(false);
  const [apiProbes, setApiProbes] = useState<ProviderProbe[]>([]);
  const [models, setModels] = useState<RecModel[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>(() => {
    const keys = getProviderApiKeys();
    const map: Record<string, boolean> = {};
    for (const p of CONNECT_PROVIDERS) map[p.id] = Boolean(keys[p.id]);
    return map;
  });
  const [desktopAccess, setDesktopAccess] = useState(() => getLocalPrefs().allowDesktopFolderAccess);
  const [documentsAccess, setDocumentsAccess] = useState(() => getLocalPrefs().allowDocumentsFolderAccess);
  const [fullPcAccess, setFullPcAccess] = useState(() => getLocalPrefs().allowFullPcAccess);
  const [executionMode, setExecutionMode] = useState<LocalPrefs['agentExecutionMode']>(
    () => getLocalPrefs().agentExecutionMode || 'allowlist',
  );

  const pcClass = useMemo(() => (hw ? getHardwareClass(hw) : null), [hw]);
  const selected = models.find(m => m.id === selectedId) ?? models.find(m => m.recommended) ?? null;
  const connectedCount = Object.values(savedKeys).filter(Boolean).length;

  const runHardware = async () => {
    setPhase('hardware');
    setHwScanning(true);
    setHwStep(0);
    const labels = 5;
    for (let i = 0; i < labels; i++) {
      await new Promise(r => setTimeout(r, 450));
      setHwStep(i + 1);
    }
    const detected = await detectHardwareAsync();
    saveHardwareSnapshot(detected);
    const recs = recommendationsFor(detected);
    setHw(detected);
    setModels(recs.slice(0, 2));
    const chatId = recs.find(m => m.recommended)?.id ?? recs[0]?.id ?? null;
    setSelectedId(chatId);
    setHwScanning(false);
    if (chatId) {
      queueSetupBrainDownloads({
        chatId,
        chatName: recs.find(m => m.id === chatId)?.name,
        hw: detected,
      });
    }
  };

  const runSpeed = async () => {
    setPhase('speed');
    setSpeedTesting(true);
    setSpeedPlan(null);
    try {
      const [sample, probes] = await Promise.all([runSpeedTest(), probeConnectedApis()]);
      const plan = computePreloadPlan(sample.MBps);
      setSpeedMbps(sample.MBps);
      setSpeedPlan(plan);
      setSpeedHostName(sample.preferredHostName || null);
      setSpeedHosts(sample.hosts || []);
      setApiProbes(probes);
      saveSpeedSample(sample, plan);
    } catch {
      setSpeedMbps(null);
      setSpeedPlan(null);
      setSpeedHostName(null);
      setSpeedHosts([]);
      setApiProbes([]);
    } finally {
      setSpeedTesting(false);
    }
  };

  const finish = async () => {
    setPhase('finishing');
    setProgress(0);
    setFinishError(null);

    const rec = hw ? getRecommendedChatModel(hw) : { id: 'qwen25-15b' };
    const allowed = ['qwen25-15b', 'llama32-3b', 'qwen25-7b', 'qwen25-coder-7b', 'qwen25-coder-14b'];
    const brainId =
      selectedId && allowed.includes(selectedId)
        ? selectedId
        : rec.id;

    setLocalPrefs({
      defaultModelId: 'ark-auto',
      aiMode: 'automatic',
      autoFailover: true,
      allowDesktopFolderAccess: desktopAccess,
      allowDocumentsFolderAccess: documentsAccess,
      allowFullPcAccess: fullPcAccess,
      agentExecutionMode: executionMode,
    });
    void syncWorkspaceGrantsFromPrefs();

    // Install default local brain (llama-cli + GGUF) so zero-key chat works.
    let downloadStarted = false;
    let downloadError: string | null = null;
    try {
      const { downloadEngineModel, engineDownloadProgress, engineDownloadError } = await import('@/lib/arkEngine');
      await downloadEngineModel(brainId);
      downloadStarted = true;
      const coder = hw ? getRecommendedCoderModel(hw) : null;
      if (coder && coder.id !== brainId) {
        void downloadEngineModel(coder.id).catch(() => undefined);
      }

      await new Promise<void>((resolve) => {
        const tick = window.setInterval(async () => {
          try {
            const p = await engineDownloadProgress(brainId);
            setProgress(Math.max(5, Math.min(99, p)));
            const err = await engineDownloadError(brainId);
            if (err) {
              downloadError = err;
              setFinishError(err);
              window.clearInterval(tick);
              setProgress(100);
              resolve();
              return;
            }
            if (p >= 100) {
              window.clearInterval(tick);
              setProgress(100);
              resolve();
            }
          } catch {
            window.clearInterval(tick);
            setProgress(100);
            resolve();
          }
        }, 400);
        window.setTimeout(() => {
          window.clearInterval(tick);
          setProgress(100);
          resolve();
        }, 20 * 60 * 1000);
      });
    } catch (err) {
      downloadError = err instanceof Error ? err.message : 'Could not start local brain download';
      setFinishError(downloadError);
      if (!downloadStarted) {
        setProgress(100);
      }
    }

    if (downloadError) {
      try {
        localStorage.setItem('ark:setup-brain-note', downloadError);
      } catch {
        /* ignore */
      }
    } else {
      try {
        localStorage.removeItem('ark:setup-brain-note');
      } catch {
        /* ignore */
      }
    }

    markSetupCompleted();
    try {
      await completeOnboarding();
    } catch {
      // Guest / offline is fine; local setup flag is enough for now.
    }
    await refreshProfile();
  };

  const saveProviderKey = (providerId: string) => {
    const draft = (keyDrafts[providerId] || '').trim();
    if (!draft) return;
    setProviderApiKey(providerId, draft);
    setSavedKeys(prev => ({ ...prev, [providerId]: true }));
    setKeyDrafts(prev => ({ ...prev, [providerId]: '' }));
    setExpandedProvider(null);
  };

  const removeProviderKey = (providerId: string) => {
    setProviderApiKey(providerId, '');
    setSavedKeys(prev => ({ ...prev, [providerId]: false }));
  };

  const hwSteps = [
    'Checking operating system',
    'Reading CPU and memory',
    'Detecting GPU and acceleration',
    'Checking storage headroom',
    'Matching models to this PC',
  ];

  const stepLabels = ['Hardware', 'Speed', 'Models', 'Access', 'Connect'] as const;
  const accessEnabledCount = [desktopAccess, documentsAccess, fullPcAccess].filter(Boolean).length;

  const enableRecommendedAccess = () => {
    setDesktopAccess(true);
    setDocumentsAccess(true);
    setFullPcAccess(true);
  };

  const toggleDesktopAccess = () => {
    setDesktopAccess(v => !v);
  };

  const toggleDocumentsAccess = () => {
    setDocumentsAccess(v => !v);
  };

  const toggleFullPcAccess = () => {
    const next = !fullPcAccess;
    setFullPcAccess(next);
    if (next) {
      setDesktopAccess(true);
      setDocumentsAccess(true);
    }
  };

  return (
    <div className="h-full bg-ark-navy-950 flex items-center justify-center px-4 relative overflow-hidden">
      <AuthAmbientOrbs />

      <div className="relative z-10 w-full max-w-xl animate-fade-in">
        <div className="text-center mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-content-tertiary mb-3">First run setup</p>
          <h1 className="text-3xl font-semibold text-content-primary tracking-tight">
            {phase === 'access'
              ? 'Give ARK access'
              : phase === 'connect'
                ? 'Connect free capacity'
                : "Let's optimize your computer"}
          </h1>
          <p className="text-sm text-content-secondary mt-2 max-w-md mx-auto">
            {phase === 'access'
              ? 'Let ARK explore your Desktop, list projects, find games, and run installs when you ask. You can change this anytime in Settings → Security.'
              : phase === 'connect'
                ? 'Add free keys once (Groq, Google, OpenRouter). ARK Auto fails over between them and your local brain so chat keeps going.'
                : 'ARK checks your hardware and download speed, installs a fitting local brain, then helps you connect free cloud capacity.'}
          </p>
        </div>

        <div className="rounded-2xl border border-surface-border bg-ark-navy-900/90 backdrop-blur-sm p-6 sm:p-7 shadow-2xl animate-slide-up">
          <div className="flex items-center gap-2 mb-7">
            {stepLabels.map((label, i) => {
              const active =
                (i === 0 && (phase === 'intro' || phase === 'hardware'))
                || (i === 1 && phase === 'speed')
                || (i === 2 && phase === 'models')
                || (i === 3 && phase === 'access')
                || (i === 4 && (phase === 'connect' || phase === 'finishing'));
              const done =
                (i === 0 && Boolean(hw) && (phase === 'speed' || phase === 'models' || phase === 'access' || phase === 'connect' || phase === 'finishing'))
                || (i === 1 && Boolean(speedPlan) && (phase === 'models' || phase === 'access' || phase === 'connect' || phase === 'finishing'))
                || (i === 2 && (phase === 'access' || phase === 'connect' || phase === 'finishing'))
                || (i === 3 && (phase === 'connect' || phase === 'finishing'))
                || (i === 4 && phase === 'finishing' && progress >= 100);
              return (
                <div key={label} className="flex-1 min-w-0">
                  <div className={`h-1 rounded-full mb-2 ${
                    done || active ? 'bg-sky-500/80' : 'bg-surface-hover'
                  }`} />
                  <p className={`text-[10px] truncate ${active || done ? 'text-content-primary' : 'text-content-tertiary'}`}>
                    {label}
                  </p>
                </div>
              );
            })}
          </div>

          {phase === 'intro' && (
            <div className="space-y-5">
              <div className="space-y-3 text-sm text-content-secondary">
                <p className="flex items-start gap-2.5">
                  <MonitorCog className="w-4 h-4 mt-0.5 shrink-0 text-content-tertiary" />
                  Scan this PC and match models that fit your hardware.
                </p>
                <p className="flex items-start gap-2.5">
                  <Wifi className="w-4 h-4 mt-0.5 shrink-0 text-content-tertiary" />
                  Measure download speed so ARK knows when to preload the next brain.
                </p>
                <p className="flex items-start gap-2.5">
                  <KeyRound className="w-4 h-4 mt-0.5 shrink-0 text-content-tertiary" />
                  Optionally connect free providers once. Keys stay encrypted on this device.
                </p>
                <p className="flex items-start gap-2.5">
                  <FolderOpen className="w-4 h-4 mt-0.5 shrink-0 text-content-tertiary" />
                  Choose Desktop or full PC access so ARK can explore folders and answer “what’s on my PC?” without templates.
                </p>
                <p className="flex items-start gap-2.5">
                  <Shield className="w-4 h-4 mt-0.5 shrink-0 text-content-tertiary" />
                  API keys never leave this PC except to the provider you connected.
                </p>
              </div>
              <button type="button" onClick={runHardware} className="ark-btn-primary w-full h-11 rounded-xl">
                Start optimization
              </button>
            </div>
          )}

          {phase === 'hardware' && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 mb-1">
                <span className="w-10 h-10 rounded-xl bg-surface-hover flex items-center justify-center">
                  {hwScanning ? (
                    <Loader2 className="w-5 h-5 text-content-secondary animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-ark-accent-green" />
                  )}
                </span>
                <div>
                  <p className="text-sm font-medium text-content-primary">
                    {hwScanning ? 'Scanning your hardware…' : 'Hardware profile ready'}
                  </p>
                  <p className="text-xs text-content-tertiary mt-0.5">
                    {pcClass ? hardwareLabel(pcClass) : 'Figuring out what this PC can run'}
                  </p>
                </div>
              </div>

              {hwScanning && (
                <div className="space-y-2.5">
                  {hwSteps.map((label, i) => (
                    <div key={label} className="flex items-center gap-2.5">
                      {i < hwStep ? (
                        <CheckCircle2 className="w-4 h-4 text-ark-accent-green shrink-0" />
                      ) : i === hwStep ? (
                        <Loader2 className="w-4 h-4 text-content-secondary animate-spin shrink-0" />
                      ) : (
                        <span className="w-4 h-4 rounded-full border border-surface-border shrink-0" />
                      )}
                      <span className={`text-sm ${i <= hwStep ? 'text-content-primary' : 'text-content-tertiary'}`}>
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {!hwScanning && hw && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Spec icon={Monitor} label="OS" value={hw.os} />
                    <Spec icon={Cpu} label="CPU" value={hw.cpu} />
                    <Spec icon={MemoryStick} label="RAM" value={hw.ram} />
                    <Spec icon={MonitorCog} label="GPU" value={hw.gpu} />
                    <Spec icon={Zap} label="Accel" value={hw.acceleration} />
                    <Spec icon={HardDrive} label="Storage" value={hw.storage} />
                  </div>
                  <button type="button" onClick={() => { setPhase('speed'); void runSpeed(); }} className="ark-btn-primary w-full h-11 rounded-xl">
                    Measure download speed
                  </button>
                </>
              )}
            </div>
          )}

          {phase === 'speed' && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 mb-1">
                <span className="w-10 h-10 rounded-xl bg-surface-hover flex items-center justify-center">
                  {speedTesting ? (
                    <Loader2 className="w-5 h-5 text-content-secondary animate-spin" />
                  ) : (
                    <Wifi className="w-5 h-5 text-content-secondary" />
                  )}
                </span>
                <div>
                  <p className="text-sm font-medium text-content-primary">
                    {speedTesting ? 'Measuring download speed…' : speedPlan ? 'Speed profile ready' : 'Speed test'}
                  </p>
                  <p className="text-xs text-content-tertiary mt-0.5">
                    {speedTesting
                      ? 'Hugging Face, HF Mirror, and ModelScope, plus any API keys already plugged in'
                      : speedPlan
                        ? speedPlan.ratingLabel
                        : 'ARK uses this to start a backup brain earlier on slow Wi-Fi'}
                  </p>
                </div>
              </div>
              {speedPlan && speedMbps != null && (
                <div className="space-y-2 text-sm text-content-secondary">
                  <p>
                    Fastest download:{' '}
                    <span className="text-content-primary">{formatMBps(speedMbps)}</span>
                    {speedHostName ? ` · ${speedHostName}` : ''}
                  </p>
                  <p>Start next model at <span className="text-content-primary">~{speedPlan.startAtPercent}% usage</span></p>
                  <p>Typical backup download ~{formatDuration(speedPlan.downloadSeconds)}</p>
                  {speedHosts.length > 0 && (
                    <div className="pt-2 space-y-1">
                      <p className="text-xs text-content-tertiary">Model hosts</p>
                      {speedHosts.map(host => (
                        <p key={host.id}>
                          {host.name}:{' '}
                          <span className={host.ok ? 'text-content-primary' : 'text-amber-400'}>
                            {host.ok ? formatMBps(host.MBps) : host.error || 'Failed'}
                          </span>
                          {host.ok && host.rttMs != null ? ` · ${formatMs(host.rttMs)} RTT` : ''}
                        </p>
                      ))}
                    </div>
                  )}
                  {apiProbes.length > 0 && (
                    <div className="pt-2 space-y-1">
                      <p className="text-xs text-content-tertiary">Connected APIs</p>
                      {apiProbes.map(probe => (
                        <p key={probe.id}>
                          {probe.name}:{' '}
                          <span className={probe.ok ? 'text-content-primary' : 'text-amber-400'}>
                            {probe.ok ? formatMs(probe.ms) : probe.error || 'Failed'}
                          </span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                {!speedTesting && (
                  <button type="button" onClick={() => void runSpeed()} className="flex-1 h-11 rounded-xl border border-surface-border text-sm text-content-secondary hover:bg-surface-hover">
                    {speedPlan ? 'Test again' : 'Run test'}
                  </button>
                )}
                {!speedTesting && !speedPlan && (
                  <button
                    type="button"
                    onClick={() => { setSpeedSkipped(true); setPhase('models'); }}
                    className="flex-1 h-11 rounded-xl border border-surface-border text-sm text-content-secondary hover:bg-surface-hover"
                  >
                    Skip test
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPhase('models')}
                  disabled={speedTesting || (!speedPlan && !speedSkipped)}
                  className="ark-btn-primary flex-1 h-11 rounded-xl disabled:opacity-50"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {phase === 'models' && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-surface-hover flex items-center justify-center">
                  <Gauge className="w-5 h-5 text-content-secondary" />
                </span>
                <div>
                  <p className="text-sm font-medium text-content-primary">Recommended for this PC</p>
                  <p className="text-xs text-content-tertiary mt-0.5">
                    Choose a local preference. Chat still defaults to ARK Auto for failover.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                {models.map(model => {
                  const on = selectedId === model.id;
                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => setSelectedId(model.id)}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors ${
                        on ? 'bg-surface-hover' : 'hover:bg-surface-hover/50'
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-content-primary">{model.name}</span>
                          {model.recommended && (
                            <span className="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-400 px-2 py-0.5 text-[10px] font-medium">
                              Recommended
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-content-tertiary mt-0.5">
                          {model.detail} · {model.size}
                        </span>
                      </span>
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        on ? 'bg-surface-hover text-ark-accent-green' : 'text-content-tertiary'
                      }`}>
                        {on ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4 opacity-50" />}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                disabled={!selected}
                onClick={() => {
                  setPhase('access');
                  const chatId = selectedId || selected?.id;
                  if (chatId) {
                    queueSetupBrainDownloads({
                      chatId,
                      chatName: selected?.name,
                      hw,
                    });
                  }
                }}
                className="ark-btn-primary w-full h-11 rounded-xl"
              >
                Continue to access
              </button>
            </div>
          )}

          {phase === 'access' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-emerald-400" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-content-primary">PC permissions</p>
                  <p className="text-xs text-content-tertiary mt-0.5">
                    {accessEnabledCount > 0
                      ? `${accessEnabledCount} permission${accessEnabledCount === 1 ? '' : 's'} enabled. ARK can answer folder and project asks`
                      : 'Skip for now if you prefer. Enable later in Settings → Security'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={enableRecommendedAccess}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-2.5 text-sm font-medium text-sky-300 hover:bg-sky-500/15 transition-colors"
              >
                <Sparkles className="w-4 h-4 shrink-0" aria-hidden />
                Enable recommended access
              </button>

              <div className="space-y-2">
                <AccessPermissionCard
                  icon={FolderOpen}
                  title="Desktop folder access"
                  detail="Projects, games, and folders on your Desktop"
                  enabled={desktopAccess}
                  onToggle={toggleDesktopAccess}
                  accent="sky"
                />
                <AccessPermissionCard
                  icon={FolderKanban}
                  title="Documents folder access"
                  detail="Open and list projects under Documents"
                  enabled={documentsAccess}
                  onToggle={toggleDocumentsAccess}
                  accent="violet"
                />
                <AccessPermissionCard
                  icon={HardDriveDownload}
                  title="Full PC access (files)"
                  detail="Installed apps, Steam libraries, profile-wide search"
                  enabled={fullPcAccess}
                  onToggle={toggleFullPcAccess}
                  accent="emerald"
                  recommended
                />
              </div>

              <div className="rounded-xl border border-surface-border bg-black/20 p-3">
                <p className="text-xs font-medium text-content-secondary mb-2">Execution &amp; approvals</p>
                <div className="grid grid-cols-1 gap-1.5">
                  {([
                    { id: 'allowlist' as const, label: 'Confirm each command', hint: 'Safest. npm, pip, and git ask first' },
                    { id: 'auto_review' as const, label: 'Auto-review', hint: 'Known tools after one confirm' },
                    { id: 'run_all' as const, label: 'Run everything', hint: 'Allowlisted tools run when you ask' },
                  ]).map(opt => {
                    const on = executionMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setExecutionMode(opt.id)}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                          on
                            ? 'bg-surface-hover border border-sky-500/30'
                            : 'border border-transparent hover:bg-surface-hover/60'
                        }`}
                      >
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                          on ? 'border-sky-400 bg-sky-500/20' : 'border-surface-border bg-black/20'
                        }`}>
                          {on ? <span className="h-2 w-2 rounded-full bg-sky-400" /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-content-primary">{opt.label}</span>
                          <span className="block text-[11px] text-content-tertiary">{opt.hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPhase('models')}
                  className="flex-1 h-11 rounded-xl border border-surface-border text-sm text-content-secondary hover:bg-surface-hover"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setPhase('connect')}
                  className="ark-btn-primary flex-[2] h-11 rounded-xl"
                >
                  {accessEnabledCount > 0 ? 'Continue to connect' : 'Skip for now'}
                </button>
              </div>
            </div>
          )}

          {phase === 'connect' && (
            <div className="space-y-4">
              <div className="space-y-2">
                {CONNECT_PROVIDERS.map(p => {
                  const open = expandedProvider === p.id;
                  const saved = savedKeys[p.id];
                  return (
                    <div key={p.id} className="rounded-xl border border-surface-border px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <span className={`w-9 h-9 rounded-xl bg-gradient-to-br ${p.tone} flex items-center justify-center text-[10px] font-bold text-white shrink-0`}>
                          {p.initial}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-content-primary">{p.name}</p>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                              p.free ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
                            }`}>
                              {p.free ? 'Free' : 'Optional'}
                            </span>
                            {saved && (
                              <span className="text-[10px] text-sky-400">Saved</span>
                            )}
                          </div>
                          {!open && (
                            <p className="text-xs text-content-tertiary mt-0.5 truncate">{p.blurb}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (!open) void openInSystemBrowser(p.signupUrl);
                            setExpandedProvider(open ? null : p.id);
                          }}
                          className="text-xs font-medium text-sky-400 hover:text-sky-300 shrink-0"
                        >
                          {open ? 'Close' : saved ? 'Edit' : 'Connect'}
                        </button>
                      </div>
                      {open && (
                        <div className="mt-3 space-y-2">
                          <button
                            type="button"
                            onClick={() => void openInSystemBrowser(p.signupUrl)}
                            className="inline-flex items-center gap-1.5 text-xs text-content-tertiary hover:text-content-secondary"
                          >
                            Open {p.name} again
                            <ExternalLink className="w-3 h-3" />
                          </button>
                          <input
                            type="password"
                            value={keyDrafts[p.id] || ''}
                            onChange={e => setKeyDrafts(prev => ({ ...prev, [p.id]: e.target.value }))}
                            placeholder="Paste API key"
                            className="ark-input h-10"
                            autoComplete="off"
                            spellCheck={false}
                            autoFocus
                          />
                          <div className="flex gap-2">
                            {saved && (
                              <button
                                type="button"
                                className="ark-btn-secondary flex-1 h-9"
                                onClick={() => removeProviderKey(p.id)}
                              >
                                Remove
                              </button>
                            )}
                            <button
                              type="button"
                              className="ark-btn-primary flex-1 h-9"
                              disabled={!(keyDrafts[p.id] || '').trim()}
                              onClick={() => saveProviderKey(p.id)}
                            >
                              Save key
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <button type="button" onClick={finish} className="ark-btn-primary w-full h-11 rounded-xl">
                {connectedCount > 0 ? 'Enter ARK' : 'Continue without connecting'}
              </button>
            </div>
          )}

          {phase === 'finishing' && (
            <div className="space-y-5">
              <div className="text-center">
                <p className="text-sm font-medium text-content-primary mb-1">Installing your local brain</p>
                <p className="text-xs text-content-tertiary">
                  {selected?.name || 'Qwen2.5 1.5B'} · llama-cli + GGUF into ARK Engine
                  {connectedCount > 0 ? ` · ${connectedCount} cloud provider${connectedCount === 1 ? '' : 's'}` : ''}
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-content-secondary">
                  <span>{progress < 25 ? 'Installing runtime…' : progress < 100 ? 'Downloading model weights…' : 'Finishing…'}</span>
                  <span>{Math.min(100, Math.round(progress))}%</span>
                </div>
                <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sky-500/80 rounded-full transition-all duration-75"
                    style={{ width: `${Math.min(100, progress)}%` }}
                  />
                </div>
              </div>
              <p className="text-[11px] text-content-tertiary text-center leading-relaxed">
                This is a one-time download (~1 GB for the default brain). You can keep working with cloud keys if you connected any.
              </p>
              {finishError && (
                <button
                  type="button"
                  onClick={() => {
                    markSetupCompleted();
                    void completeOnboarding().catch(() => undefined);
                    void refreshProfile();
                  }}
                  className="ark-btn-secondary w-full h-11 rounded-xl"
                >
                  Skip to chat
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AccessPermissionCard({
  icon: Icon,
  title,
  detail,
  enabled,
  onToggle,
  accent,
  recommended,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  enabled: boolean;
  onToggle: () => void;
  accent: 'sky' | 'violet' | 'emerald';
  recommended?: boolean;
}) {
  const accentRing = enabled
    ? accent === 'sky'
      ? 'border-sky-500/40 bg-sky-500/5'
      : accent === 'violet'
        ? 'border-violet-500/40 bg-violet-500/5'
        : 'border-emerald-500/40 bg-emerald-500/5'
    : 'border-surface-border bg-black/15 hover:bg-surface-hover/40';
  const iconTone = enabled
    ? accent === 'sky'
      ? 'text-sky-400 bg-sky-500/15'
      : accent === 'violet'
        ? 'text-violet-400 bg-violet-500/15'
        : 'text-emerald-400 bg-emerald-500/15'
    : 'text-content-tertiary bg-surface-hover';

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all ${accentRing}`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconTone}`}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-content-primary">{title}</span>
          {recommended ? (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-emerald-400">
              Recommended
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-xs text-content-tertiary leading-snug">{detail}</span>
      </span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          enabled ? 'bg-sky-500/80' : 'bg-surface-hover border border-surface-border'
        }`}
        aria-hidden
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
            enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}

function Spec({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-surface-hover/40 px-3 py-2.5 min-w-0">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 text-content-tertiary" />
        <span className="text-[10px] uppercase tracking-wider text-content-tertiary">{label}</span>
      </div>
      <p className="text-sm text-content-primary truncate">{value}</p>
    </div>
  );
}
