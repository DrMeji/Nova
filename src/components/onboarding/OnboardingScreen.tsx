import { useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  completeOnboarding,
  detectHardwareAsync,
  getHardwareClass,
  getRecommendedModel,
  type HardwareInfo,
} from '@/lib/api';
import { markSetupCompleted } from '@/lib/setup';
import {
  getProviderApiKeys,
  setLocalPrefs,
  setProviderApiKey,
} from '@/lib/localPrefs';
import { openInSystemBrowser } from '@/lib/openExternal';
import { AuthAmbientOrbs } from '@/components/auth/AuthAmbientOrbs';
import {
  Loader2, Cpu, MemoryStick, HardDrive, Zap, CheckCircle2, Download,
  Monitor, MonitorCog, Check, Gauge, KeyRound, Shield, ExternalLink,
} from 'lucide-react';

type Phase = 'intro' | 'hardware' | 'models' | 'connect' | 'finishing';

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
};

const CONNECT_PROVIDERS: ConnectProvider[] = [
  {
    id: 'groq',
    name: 'Groq',
    blurb: 'Fast free Llama chat & coding.',
    signupUrl: 'https://console.groq.com/keys',
    free: true,
  },
  {
    id: 'google',
    name: 'Google AI Studio',
    blurb: 'Gemini free tier — one key.',
    signupUrl: 'https://aistudio.google.com/apikey',
    free: true,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    blurb: 'Many free routes · good backup.',
    signupUrl: 'https://openrouter.ai/keys',
    free: true,
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    blurb: 'Free chat + FLUX images.',
    signupUrl: 'https://huggingface.co/settings/tokens',
    free: true,
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    blurb: 'Free NIM endpoints for chat.',
    signupUrl: 'https://build.nvidia.com/',
    free: true,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    blurb: 'Optional paid GPT / DALL·E path.',
    signupUrl: 'https://platform.openai.com/api-keys',
    free: false,
  },
];

function hardwareLabel(pc: ReturnType<typeof getHardwareClass>) {
  if (pc === 'strong') return 'High end capable';
  if (pc === 'standard') return 'Solid mid range';
  return 'Lightweight profile';
}

function recommendationsFor(hw: HardwareInfo): RecModel[] {
  const pc = getHardwareClass(hw);
  const primary = getRecommendedModel(hw);

  if (pc === 'strong') {
    return [
      { id: primary.id, name: primary.name, size: primary.size, detail: 'Best quality for this PC', recommended: true },
      { id: 'llama32-3b', name: 'Llama 3.2 3B Instruct', size: '2.0 GB', detail: 'Balanced general use' },
      { id: 'qwen25-15b', name: 'Qwen2.5 1.5B Instruct', size: '1.0 GB', detail: 'Default · fastest install' },
    ];
  }

  if (pc === 'standard') {
    return [
      { id: primary.id, name: primary.name, size: primary.size, detail: 'Best quality for this PC', recommended: true },
      { id: 'qwen25-15b', name: 'Qwen2.5 1.5B Instruct', size: '1.0 GB', detail: 'Default · fastest install' },
      { id: 'qwen25-coder-7b', name: 'Qwen2.5-Coder 7B', size: '4.7 GB', detail: 'Coding · larger download' },
    ];
  }

  return [
    { id: primary.id, name: primary.name, size: primary.size, detail: 'Default local brain for this PC', recommended: true },
    { id: 'llama32-3b', name: 'Llama 3.2 3B Instruct', size: '2.0 GB', detail: 'Stronger general chat' },
  ];
}

export function OnboardingScreen() {
  const { refreshProfile } = useAuth();
  const [phase, setPhase] = useState<Phase>('intro');
  const [hw, setHw] = useState<HardwareInfo | null>(null);
  const [hwScanning, setHwScanning] = useState(false);
  const [hwStep, setHwStep] = useState(0);
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
    const recs = recommendationsFor(detected);
    setHw(detected);
    setModels(recs);
    setSelectedId(recs.find(m => m.recommended)?.id ?? recs[0]?.id ?? null);
    setHwScanning(false);
  };

  const finish = async () => {
    setPhase('finishing');
    setProgress(0);
    setFinishError(null);

    const brainId =
      selectedId && ['qwen25-15b', 'llama32-3b', 'qwen25-coder-7b'].includes(selectedId)
        ? selectedId
        : 'qwen25-15b';

    setLocalPrefs({
      defaultModelId: 'ark-auto',
      aiMode: 'automatic',
      autoFailover: true,
    });

    // Install default local brain (llama-cli + GGUF) so zero-key chat works.
    let downloadStarted = false;
    let downloadError: string | null = null;
    try {
      const { downloadEngineModel, engineDownloadProgress, engineDownloadError } = await import('@/lib/arkEngine');
      await downloadEngineModel(brainId);
      downloadStarted = true;

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

  const stepLabels = ['Hardware', 'Models', 'Connect'] as const;

  return (
    <div className="h-full bg-ark-navy-950 flex items-center justify-center px-4 relative overflow-hidden">
      <AuthAmbientOrbs />

      <div className="relative z-10 w-full max-w-lg animate-fade-in">
        <div className="text-center mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-content-tertiary mb-3">First run setup</p>
          <h1 className="text-3xl font-semibold text-content-primary tracking-tight">
            {phase === 'connect' ? 'Connect free capacity' : "Let's optimize your computer"}
          </h1>
          <p className="text-sm text-content-secondary mt-2 max-w-md mx-auto">
            {phase === 'connect'
              ? 'Add free keys once (Groq, Google, OpenRouter). ARK Auto fails over between them and your local brain so chat keeps going.'
              : 'ARK checks your hardware, installs a fitting local brain, then helps you connect free cloud capacity.'}
          </p>
        </div>

        <div className="rounded-2xl border border-surface-border bg-ark-navy-900/90 backdrop-blur-sm p-6 sm:p-7 shadow-2xl animate-slide-up">
          <div className="flex items-center gap-2 mb-7">
            {stepLabels.map((label, i) => {
              const active =
                (i === 0 && (phase === 'intro' || phase === 'hardware'))
                || (i === 1 && phase === 'models')
                || (i === 2 && (phase === 'connect' || phase === 'finishing'));
              const done =
                (i === 0 && Boolean(hw) && (phase === 'models' || phase === 'connect' || phase === 'finishing'))
                || (i === 1 && (phase === 'connect' || phase === 'finishing'))
                || (i === 2 && phase === 'finishing' && progress >= 100);
              return (
                <div key={label} className="flex-1">
                  <div className={`h-1 rounded-full mb-2 ${
                    done || active ? 'bg-sky-500/80' : 'bg-surface-hover'
                  }`} />
                  <p className={`text-[11px] ${active || done ? 'text-content-primary' : 'text-content-tertiary'}`}>
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
                  <KeyRound className="w-4 h-4 mt-0.5 shrink-0 text-content-tertiary" />
                  Optionally connect free providers once — keys stay encrypted on this device.
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
                  <button type="button" onClick={() => setPhase('models')} className="ark-btn-primary w-full h-11 rounded-xl">
                    See recommended models
                  </button>
                </>
              )}
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
                onClick={() => setPhase('connect')}
                className="ark-btn-primary w-full h-11 rounded-xl"
              >
                Continue to connect
              </button>
            </div>
          )}

          {phase === 'connect' && (
            <div className="space-y-4">
              <p className="text-sm text-content-secondary">
                Press Connect to open the provider site, create a free key, then paste it here.
                Keys stay on this device{window.arkDesktop ? ' (OS-encrypted)' : ''} and power ARK Auto
                with your local GGUF. Skip anytime — local ARK still works.
              </p>

              <div className="space-y-2 max-h-[min(24rem,48vh)] overflow-y-auto">
                {CONNECT_PROVIDERS.map(p => {
                  const open = expandedProvider === p.id;
                  const saved = savedKeys[p.id];
                  return (
                    <div key={p.id} className="rounded-xl border border-surface-border px-3 py-2.5">
                      <div className="flex items-center gap-3">
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
              {progress >= 100 && (
                <div className={`flex items-center justify-center gap-2 text-sm animate-fade-in ${
                  finishError ? 'text-amber-400' : 'text-ark-accent-green'
                }`}>
                  <CheckCircle2 className="w-4 h-4" />
                  {finishError
                    ? 'Opening ARK — local brain needs a retry in Local AI'
                    : 'Ready. Opening ARK…'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
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
