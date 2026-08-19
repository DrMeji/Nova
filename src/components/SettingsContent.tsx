import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useRouter } from '@/context/RouterContext';
import {
  ARK_CHANGELOG,
  getLocalPrefs,
  getProviderApiKeys,
  setLocalPrefs,
  setProviderApiKey,
  type AccentPref,
  type AiModePref,
  type DensityPref,
  type LocalPrefs,
  type UpdateChannel,
} from '@/lib/localPrefs';
import { clearSetupCompleted } from '@/lib/setup';
import {
  detectHardware,
  getAccurateHardware,
  getHardwareClass,
  loadHardwareSnapshot,
  type HardwareInfo,
} from '@/lib/api';
import {
  User, Palette, Zap, Boxes, Cloud, Shield, HardDrive,
  FolderKanban, Lock, RefreshCw, Check, Cpu, KeyRound,
  Smartphone, Sparkles, FlaskConical,
  Mail, BadgeCheck, Trash2, Download, Info, Monitor, Copy,
} from 'lucide-react';
import { formatArkId } from '@/lib/arkUserId';
import { clearLocalAppCaches, clearLocalChatCache } from '@/lib/clearSession';
import { deleteEngineModel, engineDiskSpace, getEngineStatus, type ArkEngineModel, type ArkEngineStatus } from '@/lib/arkEngine';
import { isRevealed, setRevealed, type ParkId } from '@/lib/featurePark';
import { hasPinSet, setPin, clearPin } from '@/lib/pinLock';
import { hasSecondFactorSet, setSecondFactor, clearSecondFactor } from '@/lib/twoFactor';
import { probeProviderKey } from '@/lib/providerSpeed';
import { setCloudProviderEnabled } from '@/lib/cloudSources';
import { SettingsSystemHealth } from '@/components/SettingsSystemHealth';

const REVEAL_FEATURES: { id: ParkId; label: string; description: string }[] = [
  { id: 'networking', label: 'Networking', description: 'Social feed and contacts — shows Networking in the sidebar.' },
  { id: 'message', label: 'Message', description: 'Direct messages between ARK users.' },
  { id: 'call', label: 'Call', description: 'Voice calls (microphone + WebRTC). Video is not available yet.' },
];

const AUTO_LOCK_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 5, label: '5 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
];

const SECTIONS: { id: string; label: string; icon: typeof User; disabled?: boolean; comingSoon?: boolean }[] = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'ai', label: 'AI', icon: Zap },
  { id: 'models', label: 'Models', icon: Boxes },
  { id: 'providers', label: 'Providers', icon: Cloud },
  { id: 'privacy', label: 'Privacy', icon: Shield },
  { id: 'storage', label: 'Storage', icon: HardDrive },
  { id: 'hardware', label: 'Hardware', icon: Monitor },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'security', label: 'Security', icon: Lock },
  { id: 'updates', label: 'Updates', icon: RefreshCw },
  { id: 'testers', label: 'Testers', icon: FlaskConical, comingSoon: true },
  { id: 'beta', label: 'Beta', icon: Sparkles, comingSoon: true },
];

const AI_MODES = [
  { value: 'automatic', label: 'Automatic', description: 'ARK Router: local → free keys → paid' },
  { value: 'local_only', label: 'Local Only', description: 'Always use local AI, never use cloud' },
  { value: 'cloud_when_available', label: 'Cloud When Available', description: 'Prefer free/paid cloud, local as backup' },
  { value: 'local_fallback', label: 'Local Fallback', description: 'Try cloud first, then ARK Engine' },
];

const DEFAULT_MODELS = [
  { id: 'ark-auto', label: 'ARK Auto', detail: 'Free-first · silent failover', source: 'auto' },
  { id: 'qwen25-coder-14b', label: 'Qwen2.5 Coder 14B', detail: 'Local · coding', source: 'local' },
  { id: 'qwen25-coder-7b', label: 'Qwen2.5 Coder 7B', detail: 'Local · balanced', source: 'local' },
  { id: 'llama32-3b', label: 'Llama 3.2 3B', detail: 'Local · fast', source: 'local' },
  { id: 'gpt-4o', label: 'GPT-4o', detail: 'Cloud · chat and code', source: 'cloud' },
  { id: 'claude-sonnet', label: 'Claude Sonnet', detail: 'Cloud · long context', source: 'cloud' },
  { id: 'deepseek-chat', label: 'DeepSeek Chat', detail: 'Cloud · coding + chat', source: 'cloud' },
  { id: 'gemini-flash', label: 'Gemini 2.0 Flash', detail: 'Cloud · fast', source: 'cloud' },
];

const PROVIDER_ROWS = [
  { id: 'openai', name: 'OpenAI', hint: 'GPT models' },
  { id: 'anthropic', name: 'Anthropic', hint: 'Claude models' },
  { id: 'google', name: 'Google AI Studio', hint: 'Gemini models' },
  { id: 'groq', name: 'Groq', hint: 'Fast inference' },
  { id: 'openrouter', name: 'OpenRouter', hint: 'Many models, one key' },
  { id: 'huggingface', name: 'Hugging Face', hint: 'Chat + FLUX images' },
  { id: 'nvidia', name: 'NVIDIA NIM', hint: 'Free NIM endpoints' },
  { id: 'together', name: 'Together AI', hint: 'Open model hosting' },
  { id: 'fireworks', name: 'Fireworks', hint: 'Fast serverless open models' },
  { id: 'deepseek', name: 'DeepSeek', hint: 'Coding + chat API' },
  { id: 'mistral', name: 'Mistral', hint: 'Mistral + Codestral' },
  { id: 'cerebras', name: 'Cerebras', hint: 'Ultra-fast Llama free tier' },
  { id: 'sambanova', name: 'SambaNova', hint: 'SambaNova Cloud open models' },
  { id: 'github-models', name: 'GitHub Models', hint: 'Retired — use Groq / Google / OpenRouter' },
];

const ACCENTS: { id: AccentPref; label: string; swatch: string }[] = [
  { id: 'sky', label: 'Sky', swatch: 'bg-sky-400' },
  { id: 'emerald', label: 'Emerald', swatch: 'bg-emerald-400' },
  { id: 'amber', label: 'Amber', swatch: 'bg-amber-400' },
  { id: 'rose', label: 'Rose', swatch: 'bg-rose-400' },
];

export function SettingsContent({ onClose, initialSection }: { onClose?: () => void; initialSection?: string } = {}) {
  const { user, profile, settings, updateSettings, signOut, refreshProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const { navigate } = useRouter();
  const [activeSection, setActiveSection] = useState(initialSection || 'account');
  const [prefs, setPrefs] = useState<LocalPrefs>(() => getLocalPrefs());
  const [displayName, setDisplayName] = useState(
    () => getLocalPrefs().displayName || profile?.display_name || 'Guest',
  );
  const [providerKeys, setProviderKeys] = useState(() => getProviderApiKeys());
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);
  const [updateMsg, setUpdateMsg] = useState('Check for a new build, then download it inside ARK.');
  const [updateInfo, setUpdateInfo] = useState<{
    newerAvailable: boolean;
    setupAssetUrl?: string;
    latestTag?: string;
  } | null>(null);
  const [updatePercent, setUpdatePercent] = useState(0);
  const [appVersion, setAppVersion] = useState('0.1.24');
  const [savedFlash, setSavedFlash] = useState('');
  const [hw, setHw] = useState<HardwareInfo>(() => loadHardwareSnapshot() || detectHardware());
  const [hwScanning, setHwScanning] = useState(false);
  const [hwFlash, setHwFlash] = useState('');
  const [arkCopied, setArkCopied] = useState(false);
  const [navCompact, setNavCompact] = useState(false);
  const [cacheBusy, setCacheBusy] = useState(false);
  const [engineStatus, setEngineStatus] = useState<ArkEngineStatus | null>(null);
  const [diskSpace, setDiskSpace] = useState<{ freeGb?: number | null; totalBytes?: number | null } | null>(null);
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);
  const [pinNew, setPinNew] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinMsg, setPinMsg] = useState('');
  const [twoFaNew, setTwoFaNew] = useState('');
  const [twoFaConfirm, setTwoFaConfirm] = useState('');
  const [twoFaMsg, setTwoFaMsg] = useState('');
  const [featureTick, setFeatureTick] = useState(0);
  const [keyTestMsg, setKeyTestMsg] = useState('');
  const [keyTestFor, setKeyTestFor] = useState<string | null>(null);
  const [brainUrl, setBrainUrl] = useState('http://127.0.0.1:8787');
  const [brainToken, setBrainToken] = useState('');
  const [brainTokenCopied, setBrainTokenCopied] = useState(false);
  const [brainContractVersion, setBrainContractVersion] = useState('');
  const [brainPackaged, setBrainPackaged] = useState<boolean | null>(null);
  const [secretsEncrypted, setSecretsEncrypted] = useState<boolean | null>(null);
  const [showLegacyProviders, setShowLegacyProviders] = useState(false);
  const [signingStatus, setSigningStatus] = useState<string | null>(null);
  const [localReports, setLocalReports] = useState<{ name: string; mtime?: string }[]>([]);
  const settingsRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeSection !== 'privacy') return;
    void window.arkDesktop?.localReportsList?.()
      .then(list => setLocalReports(Array.isArray(list) ? list : []))
      .catch(() => setLocalReports([]));
  }, [activeSection]);

  useEffect(() => {
    const onFeat = () => setFeatureTick(t => t + 1);
    window.addEventListener('ark:features-changed', onFeat);
    return () => window.removeEventListener('ark:features-changed', onFeat);
  }, []);

  useEffect(() => {
    void Promise.all([
      window.arkDesktop?.brainTokenGet?.(),
      window.arkDesktop?.brainStatus?.(),
      window.arkDesktop?.secretsStatus?.(),
    ]).then(([token, status, secrets]) => {
      if (token?.url) setBrainUrl(token.url);
      if (token?.token) setBrainToken(token.token);
      if (typeof token?.packaged === 'boolean') setBrainPackaged(token.packaged);
      if (status?.url) setBrainUrl(status.url);
      if (status?.contractVersion) setBrainContractVersion(status.contractVersion);
      if (typeof secrets?.encrypted === 'boolean') setSecretsEncrypted(secrets.encrypted);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (activeSection !== 'ai') return;
    void getEngineStatus().then(setEngineStatus).catch(() => undefined);
    void engineDiskSpace().then(setDiskSpace).catch(() => undefined);
  }, [activeSection]);

  useEffect(() => {
    void window.arkDesktop?.appMeta?.()
      .then(meta => {
        if (meta?.version) setAppVersion(meta.version);
      })
      .catch(() => {});
    void window.arkDesktop?.signingStatus?.()
      .then((row) => {
        if (!row?.packaged) {
          setSigningStatus('Dev build — signing not checked');
          return;
        }
        if (row.signed) setSigningStatus('Windows Authenticode signature valid');
        else setSigningStatus(row.status || 'Unsigned — SmartScreen may warn on first run');
      })
      .catch(() => setSigningStatus(null));
  }, []);

  useEffect(() => {
    const el = settingsRootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      setNavCompact(entry.contentRect.width < 680);
    });
    ro.observe(el);
    setNavCompact(el.clientWidth < 680);
    return () => ro.disconnect();
  }, []);

  const refreshStorage = () => {
    void getEngineStatus().then(setEngineStatus).catch(() => undefined);
    void engineDiskSpace().then(setDiskSpace).catch(() => undefined);
  };

  useEffect(() => {
    if (activeSection !== 'storage' && activeSection !== 'models') return;
    refreshStorage();
    const onModels = () => refreshStorage();
    window.addEventListener('ark:engine-models-changed', onModels);
    return () => window.removeEventListener('ark:engine-models-changed', onModels);
  }, [activeSection]);

  useEffect(() => {
    void window.arkDesktop?.loginItemGet?.()
      .then((s) => {
        if (typeof s?.openAtLogin === 'boolean') {
          setPrefs(prev => {
            if (prev.launchOnStartup === s.openAtLogin) return prev;
            return setLocalPrefs({ launchOnStartup: s.openAtLogin });
          });
        } else if (getLocalPrefs().launchOnStartup && s?.canSetLoginItem !== false) {
          void window.arkDesktop?.appMeta?.().then((meta) => {
            if (meta?.isPackaged) void window.arkDesktop?.loginItemSet?.(true);
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const unsub = window.arkDesktop?.onUpdateProgress?.((payload) => {
      if (typeof payload?.percent === 'number') setUpdatePercent(payload.percent);
      // The updater sends a noisy "checking" message that can appear in dev tooling/status
      // surfaces. Keep the message for meaningful phases only.
      if (payload?.message && payload?.status !== 'checking') setUpdateMsg(payload.message);
      if (payload?.status === 'downloading') {
        setDownloadingUpdate(true);
      } else if (payload?.status === 'handoff' || payload?.status === 'installing') {
        // App is about to exit for the Updating window — keep button busy briefly.
        setDownloadingUpdate(true);
      } else if (payload?.status === 'error' || payload?.status === 'idle' || payload?.status === 'available') {
        setDownloadingUpdate(false);
      }
    });
    return () => {
      unsub?.();
    };
  }, []);

  const patchPrefs = (patch: Partial<LocalPrefs>) => {
    const next = setLocalPrefs(patch);
    setPrefs(next);
    setSavedFlash('Saved on this device');
    window.setTimeout(() => setSavedFlash(''), 2200);
  };

  const aiMode = (settings?.ai_mode as AiModePref | undefined) ?? prefs.aiMode;
  const keepLocal = settings?.keep_files_local ?? prefs.keepFilesLocal;
  const allowSync = settings?.allow_cloud_sync ?? prefs.allowCloudSync;
  const diagnostics = settings?.send_diagnostics ?? prefs.sendDiagnostics;

  const keyedCount = useMemo(() => Object.keys(providerKeys).length, [providerKeys]);

  const saveDisplayName = async () => {
    const name = displayName.trim() || 'Guest';
    patchPrefs({ displayName: name });
    if (user && user.id !== 'guest-local') {
      try {
        const { supabase } = await import('@/lib/supabase');
        await supabase.from('profiles').upsert({
          id: user.id,
          display_name: name,
        });
        await refreshProfile();
      } catch {
        /* local prefs still saved */
      }
    }
  };

  const saveAllVisible = () => {
    void saveDisplayName();
    setLocalPrefs(prefs);
    setSavedFlash('Settings saved');
    window.setTimeout(() => setSavedFlash(''), 2200);
  };

  const checkForUpdates = () => {
    setCheckingUpdates(true);
    setUpdateMsg('Checking for updates…');
    setUpdateInfo(null);
    void (async () => {
      try {
        const { checkArkGitHubUpdate } = await import('@/lib/arkUpdates');
        const info = await checkArkGitHubUpdate();
        setUpdateMsg(
          info.newerAvailable && !info.setupAssetUrl
            ? `${info.message} (installer file not published yet — try again later)`
            : info.message,
        );
        setUpdateInfo(
          info.newerAvailable
            ? {
                newerAvailable: true,
                setupAssetUrl: info.setupAssetUrl,
                latestTag: info.latestTag,
              }
            : { newerAvailable: false },
        );
      } catch (err) {
        setUpdateMsg(err instanceof Error ? err.message : 'Update check failed');
        setUpdateInfo(null);
      } finally {
        setCheckingUpdates(false);
      }
    })();
  };

  const downloadUpdate = () => {
    if (!updateInfo?.newerAvailable || !updateInfo.setupAssetUrl) return;
    setDownloadingUpdate(true);
    setUpdatePercent(0);
    setUpdateMsg('Updating…');
    void (async () => {
      const { downloadAndInstallArkUpdate } = await import('@/lib/arkUpdates');
      const result = await downloadAndInstallArkUpdate({
        setupAssetUrl: updateInfo.setupAssetUrl,
        latestTag: updateInfo.latestTag,
      });
      if (!result?.ok) {
        setUpdateMsg(result?.message || 'Update failed.');
        setDownloadingUpdate(false);
      }
    })();
  };

  const installedModels = useMemo(
    () =>
      (engineStatus?.models ?? []).filter(
        (m): m is ArkEngineModel =>
          m.status === 'ready'
          && m.id !== 'ark-core'
          && m.id !== 'ark-image-core'
          && m.id !== 'ark-video-core',
      ),
    [engineStatus],
  );

  const modelUsedGb = useMemo(() => {
    const fromFiles = (engineStatus?.modelFiles ?? []).reduce((sum, f) => sum + (f.sizeMb || 0), 0) / 1024;
    if (fromFiles > 0) return fromFiles;
    return installedModels.reduce((sum, m) => sum + (m.sizeGb || 0), 0);
  }, [engineStatus, installedModels]);

  const diskTotalGb = typeof diskSpace?.totalBytes === 'number'
    ? diskSpace.totalBytes / (1024 ** 3)
    : 0;
  const modelPercent = diskTotalGb > 0 ? Math.min(100, Math.round((modelUsedGb / diskTotalGb) * 100)) : 0;

  const flashSaved = (msg: string) => {
    setSavedFlash(msg);
    window.setTimeout(() => setSavedFlash(''), 2200);
  };

  const runClearChatCache = async () => {
    if (cacheBusy) return;
    if (!window.confirm('Clear local chat cache on this PC? Conversations in Recent will be removed. Models and API keys stay.')) {
      return;
    }
    setCacheBusy(true);
    try {
      clearLocalChatCache();
      flashSaved('Chat cache cleared');
    } finally {
      setCacheBusy(false);
    }
  };

  const runClearAppCaches = async () => {
    if (cacheBusy) return;
    if (!window.confirm('Clear local caches on this PC? Chat threads and diagnostic reports go. Downloaded models and API keys stay.')) {
      return;
    }
    setCacheBusy(true);
    try {
      await clearLocalAppCaches();
      flashSaved('Caches cleared');
    } finally {
      setCacheBusy(false);
    }
  };

  const runDeleteModel = async (model: ArkEngineModel) => {
    if (deletingModelId) return;
    if (!window.confirm(`Delete “${model.name}” from this PC? This removes the downloaded file. You can install it again later.`)) {
      return;
    }
    setDeletingModelId(model.id);
    try {
      const result = await deleteEngineModel(model.id);
      if (!result.ok) {
        flashSaved(result.error || 'Could not delete model');
        return;
      }
      setEngineStatus(result);
      flashSaved(`Deleted ${model.name}`);
    } catch (err) {
      flashSaved(err instanceof Error ? err.message : 'Could not delete model');
    } finally {
      setDeletingModelId(null);
    }
  };

  const visibleChangelog = ARK_CHANGELOG.filter(entry => {
    if (prefs.updateChannel !== 'beta' && entry.channel !== 'stable') return false;
    // Only show the entry for the version this install is running.
    return entry.version === appVersion;
  }).slice(0, 1);

  return (
    <div ref={settingsRootRef} className="flex h-full min-h-0 min-w-0 animate-fade-in">
      <div className={`${navCompact ? 'w-14' : 'w-56'} shrink-0 border-r border-surface-border flex flex-col min-h-0 min-w-0`}>
        <nav className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2 sm:p-3 flex flex-col gap-0.5 ${navCompact ? 'items-center' : ''}`}>
          {SECTIONS.map(section => (
            <button
              key={section.id}
              type="button"
              disabled={Boolean(section.disabled || section.comingSoon)}
              onClick={() => {
                if (section.disabled || section.comingSoon) return;
                setActiveSection(section.id);
              }}
              className={`ark-nav-item ${navCompact ? '!px-2 !gap-0 !justify-center w-10' : ''} ${activeSection === section.id ? 'active' : ''} ${
                section.disabled || section.comingSoon ? 'opacity-45 cursor-not-allowed pointer-events-none' : ''
              }`}
              title={section.comingSoon ? `${section.label} · coming soon` : section.disabled ? 'Locked' : section.label}
            >
              <section.icon className="w-4 h-4 shrink-0" />
              {!navCompact && <span className="flex-1 text-left truncate">{section.label}</span>}
              {!navCompact && section.comingSoon ? (
                <span className="text-[9px] uppercase tracking-wide text-content-tertiary">Coming soon</span>
              ) : !navCompact && section.disabled ? (
                <Lock className="w-3 h-3 ml-auto shrink-0 opacity-70" />
              ) : null}
            </button>
          ))}
        </nav>
        <div className="shrink-0 p-2 sm:p-3">
          {savedFlash && (
            <p className="text-[10px] text-emerald-400 mb-2 truncate flex items-center gap-1">
              <Check className="w-3 h-3 shrink-0" />
              {savedFlash}
            </p>
          )}
          <button
            type="button"
            className={`ark-btn-primary w-full justify-center ${navCompact ? '!px-2' : ''}`}
            onClick={saveAllVisible}
            title="Save"
          >
            <Check className="w-4 h-4" />
            {!navCompact && 'Save'}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8">
        <div className={`min-w-0 mx-auto ${activeSection === 'providers' || activeSection === 'models' ? 'max-w-4xl' : 'max-w-2xl'}`}>
          {activeSection === 'account' && (
            <SettingsSection title="Account" description="Profile, sign in, and session controls">
              <div className="space-y-5">
                <div className="flex items-center gap-4">
                  <label className="relative w-16 h-16 rounded-full overflow-hidden bg-ark-blue-500/20 border border-ark-blue-500/30 flex items-center justify-center text-xl font-bold text-ark-blue-300 cursor-pointer shrink-0">
                    {prefs.avatarDataUrl
                      ? <img src={prefs.avatarDataUrl} alt="" className="w-full h-full object-cover" />
                      : (displayName || profile?.display_name || user?.email || '?')[0].toUpperCase()}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          const url = typeof reader.result === 'string' ? reader.result : '';
                          if (url) patchPrefs({ avatarDataUrl: url });
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-content-primary truncate">{displayName || 'Guest'}</p>
                    <p className="text-xs text-content-tertiary truncate flex items-center gap-1.5 mt-0.5">
                      <Mail className="w-3 h-3" />
                      {user?.email ?? 'guest@ark.local'}
                    </p>
                    <p className="text-[11px] text-content-tertiary mt-1 inline-flex items-center gap-1">
                      <BadgeCheck className="w-3 h-3 text-sky-400" />
                      {user?.id === 'guest-local' ? 'Guest session on this device' : 'Signed in account'}
                    </p>
                  </div>
                </div>

                <Field
                  label="Display Name"
                  value={displayName}
                  onChange={setDisplayName}
                  onBlur={saveDisplayName}
                />
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <label className="block text-xs font-medium text-content-secondary">ARK ID</label>
                    {user?.email && ['thomaskrishnan0107@gmail.com'].includes(user.email) && (
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-sky-300 bg-sky-500/15 px-1.5 py-0.5 rounded">dev</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="flex-1 min-w-0 rounded-lg border border-surface-border bg-ark-navy-900/80 px-3 py-2 text-sm font-mono tracking-[0.18em] sm:tracking-[0.28em] text-content-primary overflow-x-auto">
                      {profile?.ark_id ? formatArkId(profile.ark_id) : '•••••••'}
                    </p>
                    <button
                      type="button"
                      disabled={!profile?.ark_id}
                      onClick={() => {
                        if (!profile?.ark_id) return;
                        void navigator.clipboard.writeText(profile.ark_id).then(() => {
                          setArkCopied(true);
                          window.setTimeout(() => setArkCopied(false), 1600);
                        }).catch(() => undefined);
                      }}
                      className="ark-btn-secondary shrink-0"
                      title="Copy ARK ID"
                    >
                      {arkCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {arkCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-[11px] text-content-tertiary mt-1.5 leading-relaxed">
                    This 7-digit ID belongs to this account only. Friends add you with this — not your email.
                  </p>
                </div>
                <Field label="Email" value={user?.email ?? 'guest@ark.local'} onChange={() => {}} disabled />
                <p className="text-[11px] text-content-tertiary -mt-3">
                  Email is managed by sign-in (or guest@ark.local for a guest session). It is not editable here.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InfoCard
                    title="Plan"
                    value="Free on this PC"
                    hint="No billing in ARK yet. Local brain + optional keys you add."
                  />
                  <InfoCard
                    title="Devices"
                    value="This PC"
                    hint="Multi-device sync is not live. This row is this machine only."
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button type="button" onClick={signOut} className="ark-btn-secondary !text-ark-accent-red">
                    Sign Out
                  </button>
                  <button
                    type="button"
                    className="ark-btn-secondary"
                    onClick={() => {
                      patchPrefs({ displayName: 'Guest' });
                      setDisplayName('Guest');
                    }}
                  >
                    Reset profile labels
                  </button>
                </div>
              </div>
            </SettingsSection>
          )}

          {activeSection === 'appearance' && (
            <SettingsSection title="Appearance" description="Theme, density, and visual preferences">
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-medium text-content-secondary mb-2">Theme</label>
                  <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
                    <ThemeCard label="Dark" active={theme === 'dark'} onClick={() => setTheme('dark')} />
                    <ThemeCard label="Light" active={theme === 'light'} onClick={() => setTheme('light')} />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-content-secondary mb-2">Accent</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 min-w-0">
                    {ACCENTS.map(a => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => patchPrefs({ accent: a.id })}
                        className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                          prefs.accent === a.id
                            ? 'border-content-primary bg-surface-hover'
                            : 'border-surface-border hover:border-surface-border-light'
                        }`}
                      >
                        <span className={`inline-block w-4 h-4 rounded-full ${a.swatch} mb-1.5`} />
                        <span className="block text-sm text-content-primary">{a.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-content-secondary mb-2">Density</label>
                  <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2">
                    {([
                      { id: 'comfortable' as DensityPref, label: 'Comfortable', hint: 'More spacing' },
                      { id: 'compact' as DensityPref, label: 'Compact', hint: 'Tighter layout' },
                    ]).map(d => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => patchPrefs({ density: d.id })}
                        className={`rounded-xl border px-3 py-3 text-left transition-all ${
                          prefs.density === d.id
                            ? 'border-content-primary bg-surface-hover'
                            : 'border-surface-border hover:border-surface-border-light'
                        }`}
                      >
                        <span className="block text-sm font-medium text-content-primary">{d.label}</span>
                        <span className="block text-[11px] text-content-tertiary mt-0.5">{d.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-content-secondary mb-2">Font size</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={13}
                      max={18}
                      value={prefs.fontSizePx}
                      onChange={e => patchPrefs({ fontSizePx: Number(e.target.value) })}
                      className="flex-1"
                    />
                    <span className="text-xs text-content-tertiary tabular-nums w-10">{prefs.fontSizePx}px</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ToggleRow
                  label="Compact sidebar"
                  description="Use a narrower icon rail by default"
                  value={prefs.compactSidebar}
                  onChange={v => patchPrefs({ compactSidebar: v })}
                />
                <ToggleRow
                  label="Show status bar"
                  description="Keep build and engine status visible at the bottom"
                  value={prefs.showStatusBar}
                  onChange={v => patchPrefs({ showStatusBar: v })}
                />
                <ToggleRow
                  label="Reduce motion"
                  description="Limit animations and transitions"
                  value={prefs.reduceMotion}
                  onChange={v => patchPrefs({ reduceMotion: v })}
                />
                </div>
              </div>
            </SettingsSection>
          )}

          {activeSection === 'ai' && (
            <SettingsSection title="AI" description="How ARK routes and answers requests">
              <div className="space-y-5">
                <div className="ark-card p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-ark-accent-green/10 flex items-center justify-center shrink-0">
                    <Cpu className="w-5 h-5 text-ark-accent-green" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-content-primary">Routing brain</p>
                    <p className="text-xs text-content-secondary">
                      Mode: {AI_MODES.find(m => m.value === aiMode)?.label ?? 'Automatic'}
                    </p>
                    <p className="text-[11px] text-content-tertiary mt-0.5">
                      Last answer: {prefs.lastAnsweredLabel || 'None yet this session'}
                    </p>
                  </div>
                  <Sparkles className="w-4 h-4 text-sky-400" />
                </div>

                <div className="rounded-xl border border-surface-border p-4 space-y-3">
                  <div>
                    <p className="text-sm font-medium text-content-primary">Brain API (Lindsay / external apps)</p>
                    <p className="text-[11px] text-content-tertiary mt-0.5 leading-relaxed">
                      Loopback only. Packaged ARK requires a bearer token on chat routes.
                    </p>
                    {brainPackaged === false && !brainToken ? (
                      <p className="text-[11px] font-medium text-amber-400 mt-1.5">
                        Auth: off (dev) — unpackaged builds accept chat without a token. Do not ship dev builds to users.
                      </p>
                    ) : brainToken ? (
                      <p className="text-[11px] text-emerald-400/90 mt-1.5">Auth: on · bearer token required for chat</p>
                    ) : null}
                    <p className="text-[10px] text-content-tertiary mt-1">
                      Contract {brainContractVersion || 'unavailable'} · port {(() => {
                        try { return new URL(brainUrl).port || 'default'; } catch { return 'unavailable'; }
                      })()}
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <label className="block text-[11px] text-content-tertiary">URL</label>
                    <input readOnly value={brainUrl} className="ark-input font-mono text-xs" />
                    <label className="block text-[11px] text-content-tertiary">Token</label>
                    <input
                      readOnly
                      type="password"
                      value={brainToken || '(none — dev mode)'}
                      className="ark-input font-mono text-xs"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="ark-btn-secondary text-xs"
                      onClick={() => {
                        const clip = `URL: ${brainUrl}\nToken: ${brainToken || ''}`;
                        void navigator.clipboard.writeText(clip).then(() => {
                          setBrainTokenCopied(true);
                          window.setTimeout(() => setBrainTokenCopied(false), 1600);
                        });
                      }}
                    >
                      {brainTokenCopied ? 'Copied' : 'Copy URL + token'}
                    </button>
                    <button
                      type="button"
                      className="ark-btn-secondary text-xs"
                      onClick={() => {
                        const curl = `curl "${brainUrl}/v1/chat" -H "Authorization: Bearer ${brainToken}" -H "Content-Type: application/json" -d "{\\"message\\":\\"Hello from Lindsay\\"}"`;
                        void navigator.clipboard.writeText(curl).then(() => {
                          setSavedFlash('Sample curl copied');
                          window.setTimeout(() => setSavedFlash(''), 1600);
                        });
                      }}
                    >
                      Copy sample curl
                    </button>
                    <button
                      type="button"
                      className="ark-btn-secondary text-xs"
                      onClick={() => {
                        void window.arkDesktop?.brainTokenRotate?.().then(res => {
                          if (res?.token) setBrainToken(res.token);
                          if (res?.url) setBrainUrl(res.url);
                          setSavedFlash('Brain token rotated — update Lindsay/clients');
                          window.setTimeout(() => setSavedFlash(''), 2200);
                        });
                      }}
                    >
                      Rotate token
                    </button>
                  </div>
                </div>

                <SettingsSystemHealth
                  engineStatus={engineStatus}
                  brainUrl={brainUrl}
                  diskFreeGb={diskSpace?.freeGb}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {AI_MODES.map(mode => (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => {
                        patchPrefs({ aiMode: mode.value as AiModePref });
                        if (settings) updateSettings({ ai_mode: mode.value as typeof settings.ai_mode });
                      }}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        aiMode === mode.value
                          ? 'border-ark-blue-400 bg-ark-blue-500/10'
                          : 'border-surface-border hover:border-surface-border-light'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className={`text-sm font-medium ${aiMode === mode.value ? 'text-ark-blue-300' : 'text-content-primary'}`}>
                            {mode.label}
                          </p>
                          <p className="text-[11px] text-content-tertiary mt-0.5">{mode.description}</p>
                        </div>
                        {aiMode === mode.value && <Check className="w-4 h-4 text-ark-blue-400 shrink-0" />}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ToggleRow
                  label="Auto failover"
                  description="If a provider is limited or offline, switch to the next healthy option"
                  value={prefs.autoFailover}
                  onChange={v => patchPrefs({ autoFailover: v })}
                />
                <ToggleRow
                  label="Ask before cloud failover"
                  description="Confirm before a local request is sent to a cloud provider"
                  value={prefs.askBeforeCloudFailover}
                  onChange={v => patchPrefs({ askBeforeCloudFailover: v })}
                />
                <ToggleRow
                  label="Stream responses"
                  description="Show tokens as they arrive instead of waiting for the full answer"
                  value={prefs.streamResponses}
                  onChange={v => patchPrefs({ streamResponses: v })}
                />
                <ToggleRow
                  label="Remember project context"
                  description="Carry recent files and chat into the next request in a project"
                  value={prefs.rememberContext}
                  onChange={v => patchPrefs({ rememberContext: v })}
                />
                <ToggleRow
                  label="Hunt new models online"
                  description="Use this PC’s specs to search Hugging Face for GGUF brains that fit"
                  value={prefs.huntInternetModels}
                  onChange={v => patchPrefs({ huntInternetModels: v })}
                />
                <ToggleRow
                  label="Download next when a model runs out"
                  description="If the current chat, image, or video path hits a limit, ARK starts the next local brain that fits this PC"
                  value={prefs.autoInstallHuntModels}
                  onChange={v => patchPrefs({ autoInstallHuntModels: v })}
                />
                </div>
                <div className="rounded-xl border border-surface-border p-4 space-y-3">
                  <p className="text-sm font-medium text-content-primary">Local GGUF (advanced)</p>
                  <label className="block text-[11px] text-content-tertiary">
                    Temperature {Number(prefs.ggufTemperature || 0.55).toFixed(2)}
                    <input
                      type="range"
                      min={0.1}
                      max={1.2}
                      step={0.05}
                      value={prefs.ggufTemperature ?? 0.55}
                      onChange={e => patchPrefs({ ggufTemperature: Number(e.target.value) })}
                      className="w-full mt-1"
                    />
                  </label>
                  <label className="block text-[11px] text-content-tertiary">
                    Max tokens {prefs.ggufNPredict ?? 1536}
                    <input
                      type="range"
                      min={256}
                      max={4096}
                      step={128}
                      value={prefs.ggufNPredict ?? 1536}
                      onChange={e => patchPrefs({ ggufNPredict: Number(e.target.value) })}
                      className="w-full mt-1"
                    />
                  </label>
                </div>
              </div>
            </SettingsSection>
          )}

          {activeSection === 'models' && (
            <SettingsSection title="Models" description="Same library as the Models page. Cloud names need a saved key.">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {DEFAULT_MODELS.map(m => {
                  const providerId = m.source === 'cloud'
                    ? (m.id.includes('claude') ? 'anthropic'
                      : m.id.includes('gemini') ? 'google'
                      : m.id.includes('deepseek') ? 'deepseek'
                      : m.id.startsWith('gpt') ? 'openai'
                      : null)
                    : null;
                  const installed = m.source === 'local' && (engineStatus?.models || []).some(x => x.id === m.id && x.status === 'ready');
                  const missingKey = providerId ? !providerKeys[providerId] : false;
                  const isSelected = prefs.defaultModelId === m.id;
                  return (
                    <button
                      key={`model-${m.id}`}
                      type="button"
                      onClick={() => patchPrefs({ defaultModelId: m.id, defaultCodeModelId: m.id })}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        isSelected
                          ? 'border-ark-blue-400 bg-ark-blue-500/10'
                          : 'border-surface-border hover:border-surface-border-light'
                      }`}
                    >
                      <p className="text-sm font-medium text-content-primary truncate">{m.label}</p>
                      <p className="text-[11px] text-content-tertiary truncate">{m.detail}{installed ? ' · installed' : ''}{missingKey ? ' · key needed' : ''}</p>
                      {isSelected && (
                        <p className="text-[10px] text-ark-blue-300 mt-1">Selected</p>
                      )}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    onClose?.();
                    navigate({ name: 'models' });
                  }}
                  className="ark-btn-secondary w-full sm:col-span-2"
                >
                  Open Models library
                </button>
              </div>
            </SettingsSection>
          )}

          {activeSection === 'providers' && (
            <SettingsSection
              title="Providers"
              description="Connect once. Keys stay on this device (OS-encrypted in Desktop) and power ARK Auto failover."
            >
              <div className="space-y-3">
                {secretsEncrypted === false && window.arkDesktop ? (
                  <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-3">
                    <p className="text-sm font-semibold text-rose-200">NO_ENCRYPTION: secure key storage is unavailable</p>
                    <p className="text-xs text-rose-100/75 mt-1">
                      ARK will not save provider secrets as plaintext. Repair Windows credential encryption before connecting a key.
                    </p>
                  </div>
                ) : null}
                <div className="ark-card p-3.5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-ark-blue-500/10 flex items-center justify-center shrink-0">
                    <Cloud className="w-4 h-4 text-ark-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-content-primary">Cloud connections</p>
                    <p className="text-xs text-content-secondary">
                      {keyedCount} API key{keyedCount === 1 ? '' : 's'} saved locally
                    </p>
                  </div>
                  <KeyRound className="w-4 h-4 text-content-tertiary" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {PROVIDER_ROWS.filter(p => p.id !== 'github-models' || showLegacyProviders).map(p => {
                    const hasKey = Boolean(providerKeys[p.id]);
                    const editing = editingProvider === p.id;
                    return (
                      <div
                        key={p.id}
                        className={`rounded-xl border border-surface-border p-2.5 ${editing ? 'col-span-2 lg:col-span-3' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-content-primary truncate">{p.name}</p>
                            <p className="text-[11px] text-content-tertiary truncate">{p.hint}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {hasKey && (
                              <span className="text-[10px] rounded-full bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5">
                                Saved
                              </span>
                            )}
                            {hasKey && !editing && (
                              <button
                                type="button"
                                onClick={() => {
                                  setKeyTestFor(p.id);
                                  setKeyTestMsg('Testing…');
                                  void probeProviderKey(p.id, providerKeys[p.id] || '').then(res => {
                                    setKeyTestMsg(res.ok ? `${p.name} · ${res.ms} ms` : `${p.name} · ${res.error || 'failed'}`);
                                  });
                                }}
                                className="text-xs text-content-tertiary hover:text-content-secondary"
                              >
                                Test
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingProvider(editing ? null : p.id);
                                setKeyDraft(providerKeys[p.id] ?? '');
                              }}
                              className="text-xs text-sky-400 hover:text-sky-300"
                            >
                              {editing ? 'Close' : hasKey ? 'Edit' : 'Add'}
                            </button>
                          </div>
                        </div>
                        {editing && (
                          <div className="mt-2.5 space-y-2">
                            <input
                              type="password"
                              value={keyDraft}
                              onChange={e => setKeyDraft(e.target.value)}
                              placeholder="Paste API key"
                              className="ark-input"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="ark-btn-secondary flex-1"
                                onClick={() => {
                                  setProviderApiKey(p.id, '');
                                  setProviderKeys(getProviderApiKeys());
                                  setEditingProvider(null);
                                  setKeyDraft('');
                                  setSavedFlash('Key removed');
                                  window.setTimeout(() => setSavedFlash(''), 1600);
                                }}
                              >
                                Remove
                              </button>
                              <button
                                type="button"
                                className="ark-btn-primary flex-1"
                                disabled={!keyDraft.trim()}
                                onClick={() => {
                                  void (async () => {
                                    try {
                                      await setProviderApiKey(p.id, keyDraft);
                                      setProviderKeys(getProviderApiKeys());
                                      setCloudProviderEnabled(p.id, true);
                                      setEditingProvider(null);
                                      setKeyDraft('');
                                      setSavedFlash('Key saved — those models can appear in Chat now');
                                      window.setTimeout(() => setSavedFlash(''), 1600);
                                    } catch (err) {
                                      setSavedFlash(err instanceof Error ? err.message : 'Could not save key');
                                      window.setTimeout(() => setSavedFlash(''), 2600);
                                    }
                                  })();
                                }}
                              >
                                Save key
                              </button>
                              {(hasKey || keyDraft.trim()) && (
                                <button
                                  type="button"
                                  className="ark-btn-secondary flex-1"
                                  disabled={!keyDraft.trim() && !hasKey}
                                  onClick={() => {
                                    setKeyTestFor(p.id);
                                    setKeyTestMsg('Testing…');
                                    void probeProviderKey(p.id, keyDraft || providerKeys[p.id] || '').then(res => {
                                      setKeyTestMsg(res.ok ? `${p.name} · ${res.ms} ms` : `${p.name} · ${res.error || 'failed'}`);
                                    });
                                  }}
                                >
                                  Test key
                                </button>
                              )}
                            </div>
                            {keyTestMsg && keyTestFor === p.id && (
                              <p className="text-[11px] text-content-tertiary">{keyTestMsg}</p>
                            )}
                          </div>
                        )}
                        {keyTestMsg && keyTestFor === p.id && !editing && (
                          <p className="text-[11px] text-content-tertiary mt-1.5">{keyTestMsg}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="text-[11px] text-content-tertiary hover:text-content-secondary"
                  onClick={() => setShowLegacyProviders(v => !v)}
                >
                  {showLegacyProviders ? 'Hide retired sources' : 'Show retired (GitHub Models)'}
                </button>

                <div className="rounded-xl border border-surface-border p-3 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-content-primary">Plugin OAuth client IDs</p>
                      <p className="text-[11px] text-content-tertiary mt-0.5 leading-snug">
                        Register once, paste public client IDs, then one-click sign-in in Build.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="text-[11px] text-sky-400 hover:text-sky-300 shrink-0"
                      onClick={() => void window.arkDesktop?.openExternal?.('https://github.com/DrMeji/Ark/blob/main/docs/oauth-setup.md')}
                    >
                      Setup guide
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(['github', 'google'] as const).map(id => (
                      <div key={id} className="rounded-lg border border-surface-border/80 bg-ark-navy-950/40 p-2.5">
                        <OAuthClientRow pluginId={id} onSaved={(msg) => {
                          setSavedFlash(msg);
                          window.setTimeout(() => setSavedFlash(''), 1600);
                        }} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </SettingsSection>
          )}

          {activeSection === 'privacy' && (
            <SettingsSection title="Privacy" description="What stays on this device and what can leave">
              <div className="space-y-3">
                <div className="rounded-xl border border-surface-border bg-surface-hover/30 px-3.5 py-3 flex items-start gap-2.5">
                  <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-content-primary">API keys stay on this device</p>
                    <p className="text-xs text-content-tertiary mt-0.5 leading-relaxed">
                      Provider keys are stored locally
                      {window.arkDesktop ? ' with OS-level encryption in Desktop' : ''}
                      . They are only sent to the provider you connected — never to an ARK cloud for storage.
                    </p>
                  </div>
                </div>
                <ToggleRow
                  label="Keep project files on this device"
                  description="Project source code stays local by default"
                  value={keepLocal}
                  onChange={v => {
                    patchPrefs({ keepFilesLocal: v });
                    if (settings) updateSettings({ keep_files_local: v });
                  }}
                />
                <ToggleRow
                  label="Allow optional cloud sync"
                  description={prefs.allowCloudSync
                    ? 'On — ARK still has no live multi-device sync. This toggle is saved for later.'
                    : 'Off — not syncing. Multi-device project sync is not live yet.'}
                  value={allowSync}
                  onChange={v => {
                    patchPrefs({ allowCloudSync: v });
                    if (settings) updateSettings({ allow_cloud_sync: v });
                  }}
                />
                <ToggleRow
                  label="Send anonymous diagnostics"
                  description="Off by default. When on, crash-style notes would stay on this PC unless you add a backend — ARK does not send them today."
                  value={diagnostics}
                  onChange={v => {
                    patchPrefs({ sendDiagnostics: v });
                    if (settings) updateSettings({ send_diagnostics: v });
                  }}
                />
                <ToggleRow
                  label="Share usage stats"
                  description="Optional product analytics with no project contents"
                  value={prefs.shareUsageStats}
                  onChange={v => patchPrefs({ shareUsageStats: v })}
                />
                <ToggleRow
                  label="Clear clipboard after paste"
                  description="Reduce leftover secrets after pasting API keys"
                  value={prefs.clearClipboardAfterPaste}
                  onChange={v => patchPrefs({ clearClipboardAfterPaste: v })}
                />
                <button
                  type="button"
                  className="ark-btn-secondary w-full !text-ark-accent-red mt-2"
                  disabled={cacheBusy}
                  onClick={() => void runClearChatCache()}
                >
                  <Trash2 className="w-4 h-4" />
                  {cacheBusy ? 'Clearing…' : 'Clear local chat cache'}
                </button>
                <p className="text-[11px] text-content-tertiary">
                  Clear cache removes chat threads stored in this browser profile. Models, keys, and project folders stay.
                </p>
                <div className="rounded-xl border border-surface-border p-4 space-y-2 mt-2">
                  <p className="text-sm font-medium text-content-primary">Local reports & update errors</p>
                  <p className="text-xs text-content-tertiary">Crash and update logs stay on this PC only.</p>
                  {localReports.length === 0 ? (
                    <p className="text-xs text-content-tertiary">No local reports yet.</p>
                  ) : (
                    <ul className="text-xs text-content-secondary space-y-1 max-h-32 overflow-auto">
                      {localReports.slice(0, 8).map(r => (
                        <li key={r.name}>{r.name}</li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" className="ark-btn-secondary text-xs" onClick={() => void window.arkDesktop?.localReportsOpen?.()}>
                      Open reports folder
                    </button>
                    <button
                      type="button"
                      className="ark-btn-secondary text-xs"
                      onClick={() => void window.arkDesktop?.localReportsClear?.().then(() => setLocalReports([]))}
                    >
                      Clear reports
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-amber-300/80 mt-2">
                  Uninstalling ARK removes downloaded models, API keys, and local projects from this PC
                  (<code>deleteAppDataOnUninstall</code>). Export settings first if you need a copy. Quit from the tray
                  menu stops the brain; closing the window only hides to tray.
                </p>
                <button
                  type="button"
                  className="ark-btn-secondary w-full"
                  onClick={() => {
                    const prefsOnly = { ...getLocalPrefs() };
                    const blob = new Blob([JSON.stringify({
                      exportedAt: new Date().toISOString(),
                      prefs: prefsOnly,
                      note: 'API keys are not included.',
                    }, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'ark-settings-export.json';
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Export my settings
                </button>
              </div>
            </SettingsSection>
          )}

          {activeSection === 'storage' && (
            <SettingsSection title="Storage" description="Models, projects, and cache on this PC">
              <div className="space-y-4 min-w-0">
                <StorageBar
                  label="Model storage"
                  used={`${modelUsedGb >= 10 ? modelUsedGb.toFixed(0) : modelUsedGb.toFixed(1)} GB`}
                  total={diskTotalGb > 0 ? `${diskTotalGb.toFixed(0)} GB disk` : 'this PC'}
                  percent={modelPercent}
                  tone="bg-sky-500"
                />
                <StorageBar
                  label="Free space"
                  used={typeof diskSpace?.freeGb === 'number' ? `${diskSpace.freeGb.toFixed(1)} GB free` : 'Unknown'}
                  total={engineStatus?.modelsDir ? 'Models folder' : 'Desktop only'}
                  percent={typeof diskSpace?.freeGb === 'number' && diskTotalGb > 0
                    ? Math.min(100, Math.round((diskSpace.freeGb / diskTotalGb) * 100))
                    : 0}
                  tone="bg-emerald-500"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InfoCard
                    title="Installed models"
                    value={String(installedModels.length)}
                    hint="Delete from the list below or Local AI"
                  />
                  <InfoCard
                    title="Models folder"
                    value={engineStatus?.modelsDirIsCustom ? 'Custom' : 'Default'}
                    hint={engineStatus?.modelsDir ? 'Open Local AI → Storage to change' : 'Open ARK Desktop to manage files'}
                  />
                </div>

                <div>
                  <p className="text-xs font-medium text-content-secondary mb-2">Downloaded models</p>
                  {installedModels.length === 0 ? (
                    <p className="text-xs text-content-tertiary rounded-xl border border-surface-border px-3.5 py-3">
                      No GGUF brains on this PC yet. Install from Models or Local AI.
                    </p>
                  ) : (
                    <div className="rounded-xl border border-surface-border divide-y divide-surface-border/80 overflow-hidden">
                      {installedModels.map(model => (
                        <div key={model.id} className="flex items-center gap-3 px-3.5 py-2.5 min-w-0">
                          <span
                            className="w-8 h-8 rounded-full bg-surface-hover text-ark-accent-green flex items-center justify-center shrink-0"
                            title="Installed in ARK Engine"
                          >
                            <Check className="w-4 h-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-content-primary truncate">{model.name}</p>
                            <p className="text-[11px] text-content-tertiary truncate">
                              {model.detail || (model.sizeGb ? `${model.sizeGb} GB` : 'ARK Engine')}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-content-tertiary hover:text-rose-300 hover:bg-rose-500/10 transition-colors disabled:opacity-40"
                            title={`Delete ${model.name}`}
                            aria-label={`Delete ${model.name}`}
                            disabled={deletingModelId === model.id}
                            onClick={() => void runDeleteModel(model)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="ark-btn-secondary"
                    disabled={cacheBusy}
                    onClick={() => void runClearAppCaches()}
                  >
                    <Trash2 className="w-4 h-4" />
                    {cacheBusy ? 'Clearing…' : 'Clear cache'}
                  </button>
                  <p className="text-[11px] text-content-tertiary w-full">
                    Clears chat threads and local reports. Does not delete GGUF files, projects, or API keys.
                  </p>
                  <button type="button" className="ark-btn-secondary" onClick={() => { onClose?.(); navigate({ name: 'local-ai' }); }}>
                    Manage models
                  </button>
                </div>
              </div>
            </SettingsSection>
          )}

          {activeSection === 'hardware' && (
            <SettingsSection title="Hardware" description="Detected on this PC">
              <div className="space-y-4">
                <div className="rounded-xl border border-surface-border px-4 py-3 space-y-2">
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-content-secondary">OS</span>
                    <span className="text-content-primary text-right min-w-0 truncate">{hw.os}</span>
                  </div>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-content-secondary">CPU</span>
                    <span className="text-content-primary text-right min-w-0 truncate">{hw.cpu}</span>
                  </div>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-content-secondary">RAM</span>
                    <span className="text-content-primary text-right min-w-0 truncate">{hw.ram}</span>
                  </div>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-content-secondary">GPU</span>
                    <span className="text-content-primary text-right min-w-0 truncate">{hw.gpu}</span>
                  </div>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-content-secondary">Acceleration</span>
                    <span className="text-content-primary text-right min-w-0 truncate">{hw.acceleration}</span>
                  </div>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-content-secondary">Profile</span>
                    <span className="text-content-primary text-right">
                      {getHardwareClass(hw) === 'strong'
                        ? 'High end'
                        : getHardwareClass(hw) === 'standard'
                          ? 'Mid range'
                          : 'Light'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="ark-btn-secondary"
                  disabled={hwScanning}
                  onClick={() => {
                    setHwScanning(true);
                    setHwFlash('');
                    void getAccurateHardware(true).then(info => {
                      setHw(info);
                      setHwScanning(false);
                      setHwFlash(info.accurate ? 'Updated' : 'Approximate scan');
                      window.dispatchEvent(new Event('ark:hardware-rescanned'));
                      window.setTimeout(() => setHwFlash(''), 2000);
                    });
                  }}
                >
                  <RefreshCw className={`w-4 h-4 ${hwScanning ? 'animate-spin' : ''}`} />
                  {hwScanning ? 'Scanning…' : 'Rescan hardware'}
                </button>
                {hwFlash && <p className="text-xs text-emerald-400">{hwFlash}</p>}
                <button
                  type="button"
                  className="text-xs text-sky-400 hover:text-sky-300"
                  onClick={() => { onClose?.(); navigate({ name: 'models' }); }}
                >
                  Open Models · For your PC
                </button>
              </div>
            </SettingsSection>
          )}

          {activeSection === 'projects' && (
            <SettingsSection title="Projects" description="Defaults for new builds and folders">
              <div className="space-y-4">
                <Field
                  label="Default project location"
                  value={prefs.projectLocation}
                  onChange={v => patchPrefs({ projectLocation: v })}
                />
                <p className="text-[11px] text-content-tertiary -mt-2">
                  New projects and Open folder use this folder hint and the default type below.
                </p>
                <Field
                  label="Preferred language"
                  value={prefs.preferredLanguage}
                  onChange={v => patchPrefs({ preferredLanguage: v })}
                />

                <div>
                  <label className="block text-xs font-medium text-content-secondary mb-2">Default project type</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {([
                      { id: 'web' as const, label: 'Web' },
                      { id: 'api' as const, label: 'API' },
                      { id: 'desktop' as const, label: 'Desktop' },
                    ]).map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => patchPrefs({ defaultProjectType: t.id })}
                        className={`rounded-xl border px-3 py-2.5 text-sm transition-all ${
                          prefs.defaultProjectType === t.id
                            ? 'border-content-primary bg-surface-hover text-content-primary'
                            : 'border-surface-border text-content-secondary hover:text-content-primary'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <ToggleRow
                  label="Auto save project edits"
                  description="Keep explorer and code panel changes without asking"
                  value={prefs.autoSaveProjects}
                  onChange={v => patchPrefs({ autoSaveProjects: v })}
                />
                <ToggleRow
                  label="Open last project on launch"
                  description="Jump back into your most recent workspace"
                  value={prefs.openLastProjectOnLaunch}
                  onChange={v => patchPrefs({ openLastProjectOnLaunch: v })}
                />
              </div>
            </SettingsSection>
          )}

          {activeSection === 'security' && (
            <SettingsSection title="Security" description="Protect this PC and keep agent file writes inside the project sandbox">
              <div className="space-y-4">
                <div className="rounded-xl border border-surface-border p-4 space-y-3">
                  <div>
                    <p className="text-sm font-medium text-content-primary">Local PIN</p>
                    <p className="text-xs text-content-tertiary mt-0.5">
                      {hasPinSet()
                        ? 'PIN is set on this device and locks the app UI. It does not encrypt API keys.'
                        : 'Set a 4–8 digit PIN to lock the app UI on this PC. It does not encrypt API keys.'}
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="New PIN"
                      value={pinNew}
                      onChange={e => setPinNew(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      className="rounded-lg border border-surface-border bg-ark-navy-950 px-3 py-2 text-sm text-content-primary"
                    />
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="Confirm PIN"
                      value={pinConfirm}
                      onChange={e => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      className="rounded-lg border border-surface-border bg-ark-navy-950 px-3 py-2 text-sm text-content-primary"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="ark-btn-secondary text-xs"
                      onClick={() => {
                        void (async () => {
                          setPinMsg('');
                          if (pinNew !== pinConfirm) {
                            setPinMsg('PINs do not match');
                            return;
                          }
                          try {
                            await setPin(pinNew);
                            setPinNew('');
                            setPinConfirm('');
                            setPinMsg('PIN saved');
                          } catch (err) {
                            setPinMsg(err instanceof Error ? err.message : 'Could not save PIN');
                          }
                        })();
                      }}
                    >
                      {hasPinSet() ? 'Change PIN' : 'Set PIN'}
                    </button>
                    {hasPinSet() ? (
                      <button
                        type="button"
                        className="ark-btn-secondary text-xs"
                        onClick={() => {
                          void clearPin();
                          patchPrefs({ requirePinOnLaunch: false });
                          setPinNew('');
                          setPinConfirm('');
                          setPinMsg('PIN cleared');
                        }}
                      >
                        Clear PIN
                      </button>
                    ) : null}
                  </div>
                  {pinMsg ? <p className="text-xs text-content-tertiary">{pinMsg}</p> : null}
                  <p className="text-[11px] text-content-tertiary">
                    Forgot the PIN? Use Clear PIN above. That unlocks this copy of ARK. There is no email recovery.
                  </p>
                </div>

                <ToggleRow
                  label="Require PIN on launch"
                  description={hasPinSet() ? 'Lock ARK until you enter your PIN after opening the app' : 'Set a PIN first to enable launch lock'}
                  value={prefs.requirePinOnLaunch}
                  onChange={v => {
                    if (v && !hasPinSet()) {
                      setPinMsg('Set a PIN before enabling launch lock');
                      return;
                    }
                    patchPrefs({ requirePinOnLaunch: v });
                  }}
                />
                <ToggleRow
                  label="Lock when this PC sleeps"
                  description={hasPinSet() ? 'Require PIN after Windows sleep. Locks the app UI only — keys stay in OS encryption.' : 'Set a PIN first'}
                  value={prefs.lockOnSleep}
                  onChange={v => {
                    if (v && !hasPinSet()) {
                      setPinMsg('Set a PIN before enabling sleep lock');
                      return;
                    }
                    patchPrefs({ lockOnSleep: v });
                  }}
                />

                <div className="rounded-xl border border-surface-border p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-content-primary">Auto lock</p>
                    <p className="text-xs text-content-tertiary mt-0.5">
                      Lock after idle time when PIN on launch is enabled
                    </p>
                  </div>
                  <select
                    value={String(prefs.autoLockMinutes)}
                    disabled={!prefs.requirePinOnLaunch || !hasPinSet()}
                    onChange={e => patchPrefs({ autoLockMinutes: Number(e.target.value) })}
                    className="rounded-lg border border-surface-border bg-ark-navy-950 px-2 py-1.5 text-xs text-content-primary disabled:opacity-45"
                  >
                    {AUTO_LOCK_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div className="rounded-xl border border-surface-border p-4 space-y-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center shrink-0">
                      <Smartphone className="w-5 h-5 text-sky-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-content-primary">Extra unlock code</p>
                      <p className="text-xs text-content-tertiary mt-0.5">
                        After PIN, require a local security code to unlock the app UI. This does not encrypt keys and is not SMS or an authenticator app.
                      </p>
                    </div>
                  </div>
                  <ToggleRow
                    label="Require second factor"
                    description={hasSecondFactorSet() ? 'Enabled when a security code is saved below' : 'Set a security code before turning this on'}
                    value={prefs.twoFactorEnabled}
                    onChange={v => {
                      if (v && !hasSecondFactorSet()) {
                        setTwoFaMsg('Set a security code first');
                        return;
                      }
                      patchPrefs({ twoFactorEnabled: v });
                    }}
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      type="password"
                      autoComplete="off"
                      placeholder="Security code"
                      value={twoFaNew}
                      onChange={e => setTwoFaNew(e.target.value.slice(0, 32))}
                      className="rounded-lg border border-surface-border bg-ark-navy-950 px-3 py-2 text-sm text-content-primary"
                    />
                    <input
                      type="password"
                      autoComplete="off"
                      placeholder="Confirm code"
                      value={twoFaConfirm}
                      onChange={e => setTwoFaConfirm(e.target.value.slice(0, 32))}
                      className="rounded-lg border border-surface-border bg-ark-navy-950 px-3 py-2 text-sm text-content-primary"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="ark-btn-secondary text-xs"
                      onClick={() => {
                        void (async () => {
                          setTwoFaMsg('');
                          if (twoFaNew !== twoFaConfirm) {
                            setTwoFaMsg('Codes do not match');
                            return;
                          }
                          try {
                            await setSecondFactor(twoFaNew);
                            setTwoFaNew('');
                            setTwoFaConfirm('');
                            setTwoFaMsg('Security code saved');
                          } catch (err) {
                            setTwoFaMsg(err instanceof Error ? err.message : 'Could not save code');
                          }
                        })();
                      }}
                    >
                      {hasSecondFactorSet() ? 'Change code' : 'Set code'}
                    </button>
                    {hasSecondFactorSet() ? (
                      <button
                        type="button"
                        className="ark-btn-secondary text-xs"
                        onClick={() => {
                          void clearSecondFactor();
                          patchPrefs({ twoFactorEnabled: false });
                          setTwoFaNew('');
                          setTwoFaConfirm('');
                          setTwoFaMsg('Security code cleared');
                        }}
                      >
                        Clear code
                      </button>
                    ) : null}
                  </div>
                  {twoFaMsg ? <p className="text-xs text-content-tertiary">{twoFaMsg}</p> : null}
                </div>

                <ToggleRow
                  label="Sandbox agent actions"
                  description="Block agent writes to .env, node_modules, lockfiles, and paths outside the project folder"
                  value={prefs.sandboxAgent}
                  onChange={v => patchPrefs({ sandboxAgent: v })}
                />

                <div className="flex items-center gap-3 p-4 ark-card min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-ark-accent-green/10 flex items-center justify-center shrink-0">
                    <Lock className="w-4 h-4 text-ark-accent-green" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-content-primary">Credential storage</p>
                    <p className="text-xs text-content-tertiary">API keys stored locally on this device</p>
                  </div>
                  <span className="text-xs text-ark-accent-green shrink-0">Active</span>
                </div>
              </div>
            </SettingsSection>
          )}

          {activeSection === 'updates' && (
            <SettingsSection title="Updates" description="Check for new ARK builds and install them in-app">
              <div className="space-y-5">
                <div className="ark-card p-4 flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-content-primary">ARK v{appVersion}</p>
                      <p className="text-xs text-content-tertiary mt-0.5">{updateMsg}</p>
                      {downloadingUpdate && (
                        <div className="mt-2 h-1.5 rounded-full bg-surface-hover overflow-hidden max-w-xs">
                          <div
                            className="h-full bg-sky-500 transition-all"
                            style={{ width: `${Math.min(100, Math.max(updatePercent, 4))}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={checkForUpdates}
                        disabled={checkingUpdates || downloadingUpdate}
                        className="ark-btn-secondary"
                      >
                        {checkingUpdates ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Check
                      </button>
                      {updateInfo?.newerAvailable && (
                        <button
                          type="button"
                          onClick={downloadUpdate}
                          disabled={downloadingUpdate || !updateInfo.setupAssetUrl}
                          title={!updateInfo.setupAssetUrl ? 'Update is disabled until GitHub publishes an installer file for this build' : 'Download and install'}
                          className="ark-btn-primary"
                        >
                          {downloadingUpdate ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                          {downloadingUpdate ? 'Updating…' : 'Update'}
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-content-tertiary leading-relaxed">
                    Check looks at GitHub Releases for a newer ARK-Setup.exe. Pushing code to main is not enough — a <code className="text-[10px]">v*</code> tag has to publish the installer first.
                  </p>
                  {signingStatus ? (
                    <p className="text-[11px] text-content-tertiary leading-relaxed">
                      Code signing: {signingStatus}. See <code className="text-[10px]">build/signing.env.example</code> to configure Authenticode.
                    </p>
                  ) : null}
                </div>

                <div className="rounded-xl border border-surface-border p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Info className="w-4 h-4 text-content-secondary" />
                    <h2 className="text-sm font-semibold text-content-primary">About</h2>
                  </div>
                  <p className="text-xs text-content-secondary">
                    ARK v{appVersion}
                  </p>
                  <p className="text-[11px] text-content-tertiary mt-1">
                    Brain contract {brainContractVersion || 'unavailable'} · port {(() => {
                      try { return new URL(brainUrl).port || '8787'; } catch { return '8787'; }
                    })()}
                  </p>
                </div>

                <ToggleRow
                  label="Launch ARK when Windows starts"
                  description="Open ARK automatically after you sign in to this PC"
                  value={prefs.launchOnStartup}
                  onChange={v => {
                    patchPrefs({ launchOnStartup: v });
                    void window.arkDesktop?.loginItemSet?.(v).then((r) => {
                      if (r?.devBlocked && v) {
                        patchPrefs({ launchOnStartup: false });
                        setSavedFlash('Launch at startup is unavailable in a development build');
                        window.setTimeout(() => setSavedFlash(''), 2600);
                      }
                    });
                  }}
                />
                <ToggleRow
                  label="Automatically check for updates"
                  description="Look for new builds when ARK starts"
                  value={prefs.autoCheckUpdates}
                  onChange={v => patchPrefs({ autoCheckUpdates: v })}
                />
                <ToggleRow
                  label="Notify when an update is ready"
                  description="Show a badge when a new version is available"
                  value={prefs.notifyOnUpdate}
                  onChange={v => patchPrefs({ notifyOnUpdate: v })}
                />

                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Info className="w-4 h-4 text-content-secondary" />
                    <h2 className="text-sm font-semibold text-content-primary">What’s new</h2>
                  </div>
                  <div className="space-y-3">
                    {visibleChangelog.length === 0 ? (
                      <p className="text-xs text-content-tertiary">
                        You’re on ARK v{appVersion}.
                      </p>
                    ) : (
                      visibleChangelog.map(entry => (
                      <div key={entry.version} className="rounded-xl border border-surface-border p-4">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div>
                            <p className="text-sm font-medium text-content-primary">
                              v{entry.version} · {entry.title}
                            </p>
                            <p className="text-[11px] text-content-tertiary mt-0.5">{entry.date}</p>
                          </div>
                          <span className={`text-[10px] rounded-full px-2 py-0.5 ${
                            entry.channel === 'beta'
                              ? 'bg-amber-500/15 text-amber-300'
                              : 'bg-emerald-500/15 text-emerald-400'
                          }`}>
                            {entry.channel}
                          </span>
                        </div>
                        <ul className="space-y-1.5">
                          {(entry.notes || []).map(note => (
                            <li key={note} className="text-xs text-content-secondary flex gap-2">
                              <span className="text-content-tertiary">·</span>
                              <span>{note}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </SettingsSection>
          )}

          {activeSection === 'testers' && (
            <SettingsSection
              title="For testers"
              description="Quick path to a first real reply, reveal parked features, then tell us what to improve"
            >
              <div className="space-y-3">
                <div className="rounded-xl border border-surface-border p-4 space-y-3">
                  <p className="text-sm font-medium text-content-primary">Reveal parked features</p>
                  <p className="text-xs text-content-tertiary leading-relaxed">
                    These surfaces are wired and working. Toggles only affect this PC — sidebar items appear when turned on.
                  </p>
                  {REVEAL_FEATURES.map(opt => {
                    void featureTick;
                    return (
                      <ToggleRow
                        key={opt.id}
                        label={opt.label}
                        description={opt.description}
                        value={isRevealed(opt.id)}
                        onChange={v => setRevealed(opt.id, v)}
                      />
                    );
                  })}
                </div>
                <div className="rounded-xl border border-surface-border p-4 space-y-2">
                  <p className="text-sm font-medium text-content-primary">First successful chat</p>
                  <ol className="text-xs text-content-tertiary space-y-1.5 list-decimal list-inside leading-relaxed">
                    <li>Connect a free key (Settings → Providers or the Chat “Connect free key” link), or</li>
                    <li>Open Models → Engine (or Local AI) → Install recommended → wait until it says ready</li>
                    <li>Chat with ARK Auto selected — try “Hello”</li>
                  </ol>
                </div>
                <div className="rounded-xl border border-surface-border p-4 space-y-2">
                  <p className="text-sm font-medium text-content-primary">Image &amp; video</p>
                  <p className="text-xs text-content-tertiary leading-relaxed">
                    Expect real images when a free path works. Video may show a labeled motion-still preview when MP4 hosts need credits — reopen creations from Recent.
                  </p>
                </div>
                <div className="rounded-xl border border-surface-border p-4 space-y-2">
                  <p className="text-sm font-medium text-content-primary">Updates</p>
                  <p className="text-xs text-content-tertiary leading-relaxed">
                    Use a packaged install (not the build bat). Settings → Updates → Check, then Update when offered.
                  </p>
                </div>
                <div className="rounded-xl border border-surface-border p-4 space-y-2">
                  <p className="text-sm font-medium text-content-primary">Feedback</p>
                  <p className="text-xs text-content-tertiary leading-relaxed">
                    Open a GitHub issue on the ARK repo with what worked, what confused you, and what you’d change.
                  </p>
                  <button
                    type="button"
                    className="ark-btn-secondary text-xs"
                    onClick={() => void window.arkDesktop?.openExternal?.('https://github.com/DrMeji/Ark/issues/new')}
                  >
                    Open feedback issue
                  </button>
                </div>
                <div className="rounded-xl border border-surface-border p-4 space-y-2">
                  <p className="text-sm font-medium text-content-primary">Re-run first-time setup</p>
                  <p className="text-xs text-content-tertiary leading-relaxed">
                    Clears the setup flag so onboarding shows again on next launch (keys and models stay).
                  </p>
                  <button
                    type="button"
                    className="ark-btn-secondary text-xs"
                    onClick={() => {
                      clearSetupCompleted();
                      setSavedFlash('Setup cleared — restart ARK to see onboarding');
                      window.setTimeout(() => setSavedFlash(''), 2500);
                    }}
                  >
                    Reset setup flag
                  </button>
                </div>
              </div>
            </SettingsSection>
          )}

          {activeSection === 'beta' && (
            <SettingsSection title="Beta channel" description="Opt into beta builds and changelog notes on this PC">
              <div className="space-y-4">
                <ToggleRow
                  label="Beta updates"
                  description="Show beta changelog entries and prefer beta builds when Updates finds them"
                  value={prefs.updateChannel === 'beta'}
                  onChange={v => patchPrefs({ updateChannel: v ? 'beta' : 'stable' })}
                />
                <div className="rounded-xl border border-surface-border p-4 space-y-2">
                  <p className="text-sm font-medium text-content-primary">What this does</p>
                  <p className="text-xs text-content-tertiary leading-relaxed">
                    Stable stays the default. Updates checks GitHub Releases
                    {prefs.updateChannel === 'beta' ? ' and prefers pre-release / beta tags on this PC.' : ' for the latest stable tag.'}
                  </p>
                </div>
              </div>
            </SettingsSection>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="animate-fade-in min-w-0">
      <h1 className="text-xl font-bold text-content-primary mb-1">{title}</h1>
      <p className="text-sm text-content-secondary mb-4">{description}</p>
      {children}
    </div>
  );
}

function OAuthClientRow({
  pluginId,
  onSaved,
}: {
  pluginId: string;
  onSaved: (msg: string) => void;
}) {
  const [value, setValue] = useState('');
  const setup =
    pluginId === 'github'
      ? {
          label: 'GitHub',
          url: 'https://github.com/settings/developers',
          steps: 'OAuth App → Device Flow → copy Client ID',
          env: 'ARK_GITHUB_CLIENT_ID',
        }
      : {
          label: 'Google',
          url: 'https://console.cloud.google.com/apis/credentials',
          steps: 'Desktop/Web OAuth client → paste Client ID',
          env: 'ARK_GOOGLE_CLIENT_ID',
        };

  useEffect(() => {
    void window.arkDesktop?.pluginOAuthStatus?.().then((s) => {
      const stored = s?.stored?.[pluginId];
      if (stored) setValue(stored);
    });
  }, [pluginId]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-content-secondary capitalize">{setup.label}</span>
        <button
          type="button"
          className="text-[11px] text-sky-400 hover:text-sky-300"
          onClick={() => void window.arkDesktop?.openExternal?.(setup.url)}
        >
          Open console
        </button>
      </div>
      <p className="text-[11px] text-content-tertiary leading-relaxed">{setup.steps}</p>
      <div className="flex gap-2 items-center">
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={`${setup.env} or paste client id`}
          className="ark-input flex-1 text-sm"
        />
        <button
          type="button"
          className="ark-btn-secondary shrink-0 text-xs"
          onClick={() => {
            void window.arkDesktop?.pluginOAuthSetClient?.(pluginId, value).then((res) => {
              if (res && typeof res === 'object' && 'ok' in res && res.ok === false) {
                onSaved(`Could not save ${pluginId} client id`);
                return;
              }
              onSaved(`${pluginId} client id saved`);
            }).catch(() => {
              onSaved(`Could not save ${pluginId} client id`);
            });
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  onBlur?: () => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-content-secondary mb-1.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        className="ark-input disabled:opacity-60"
      />
    </div>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-4 ark-card min-w-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-content-primary">{label}</p>
        <p className="text-xs text-content-tertiary mt-0.5 leading-snug">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative rounded-full transition-colors shrink-0 ${value ? 'bg-content-primary' : 'bg-ark-navy-700'}`}
        style={{ height: '22px', width: '40px' }}
        aria-pressed={value}
      >
        <div
          className={`absolute top-0.5 bg-white rounded-full transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`}
          style={{ width: '18px', height: '18px' }}
        />
      </button>
    </div>
  );
}

function ThemeCard({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-4 rounded-lg border transition-all ${active ? 'border-content-primary bg-surface-hover' : 'border-surface-border hover:border-surface-border-light'}`}
    >
      <div className={`h-16 rounded-md mb-2 border border-surface-border ${label === 'Dark' ? 'bg-black' : 'bg-white'}`}>
        <div className={`h-3 rounded-t-md ${label === 'Dark' ? 'bg-neutral-800' : 'bg-neutral-100'}`} />
      </div>
      <p className={`text-sm font-medium ${active ? 'text-content-primary' : 'text-content-secondary'}`}>{label}</p>
    </button>
  );
}

function InfoCard({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div className="ark-card p-4">
      <p className="text-xs text-content-tertiary">{title}</p>
      <p className="text-sm font-medium text-content-primary mt-1">{value}</p>
      <p className="text-[11px] text-content-tertiary mt-1">{hint}</p>
    </div>
  );
}

function StorageBar({
  label,
  used,
  total,
  percent,
  tone,
}: {
  label: string;
  used: string;
  total: string;
  percent: number;
  tone: string;
}) {
  return (
    <div className="ark-card p-4 min-w-0">
      <div className="flex justify-between gap-3 mb-2 min-w-0">
        <span className="text-sm text-content-primary truncate">{label}</span>
        <span className="text-xs text-content-tertiary shrink-0">{used} / {total}</span>
      </div>
      <div className="h-2 bg-ark-navy-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
