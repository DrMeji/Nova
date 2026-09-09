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
} from '@/lib/localPrefs';
import { clearSetupCompleted } from '@/lib/setup';
import { hydratePrefsFromWorkspaceGrants, syncWorkspaceGrantsFromPrefs } from '@/lib/workspaceGrants';
import { formatArkId } from '@/lib/arkUserId';
import { isArkDevEmail } from '@/lib/arkDevAccount';
import {
  detectHardware,
  getAccurateHardware,
  getHardwareClass,
  loadHardwareSnapshot,
  type HardwareInfo,
} from '@/lib/api';
import { getGgufCtx, ggufCtxCapacityLabel } from '@/lib/ggufContext';
import {
  User, Palette, Zap, Boxes, Cloud, Shield, HardDrive,
  FolderKanban, Lock, RefreshCw, Check, Cpu, KeyRound,
  Sparkles,
  Mail, BadgeCheck, Trash2, Download, Info, Monitor, Copy, X, FolderOpen, Github, Mic,
} from 'lucide-react';
import { clearLocalAppCaches, clearLocalChatCache } from '@/lib/clearSession';
import { deleteEngineModel, engineDiskSpace, getEngineStatus, type ArkEngineModel, type ArkEngineStatus } from '@/lib/arkEngine';
import { NovaMark } from '@/components/NovaMark';
import { hasPinSet, setPin, clearPin } from '@/lib/pinLock';
import { hasSecondFactorSet, setSecondFactor, clearSecondFactor } from '@/lib/twoFactor';
import { probeProviderKey } from '@/lib/providerSpeed';
import { setCloudProviderEnabled } from '@/lib/cloudSources';
import { getBrainUrl } from '@/lib/brainUrl';
import { SettingsSystemHealth } from '@/components/SettingsSystemHealth';
import { BrandMark, StatusCheck } from '@/components/BrandMark';
import { VoiceSettingsPanel } from '@/components/VoiceSettingsPanel';
import { useSocial } from '@/context/SocialContext';
import { supabase } from '@/lib/supabase';

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
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'models', label: 'Models', icon: Boxes },
  { id: 'providers', label: 'Providers', icon: Cloud },
  { id: 'privacy', label: 'Privacy', icon: Shield },
  { id: 'storage', label: 'Storage', icon: HardDrive },
  { id: 'hardware', label: 'Hardware', icon: Monitor },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'security', label: 'Security', icon: Lock },
  { id: 'updates', label: 'Update', icon: RefreshCw },
];

const AI_MODES = [
  { value: 'automatic', label: 'Automatic', description: 'NOVA Router: local → free keys → paid' },
  { value: 'local_only', label: 'Local Only', description: 'Always use local AI, never use cloud' },
  { value: 'cloud_when_available', label: 'Cloud When Available', description: 'Prefer free/paid cloud, local as backup' },
  { value: 'local_fallback', label: 'Local Fallback', description: 'Try cloud first, then NOVA Engine' },
];

const DEFAULT_MODELS = [
  { id: 'NOVA-auto', label: 'NOVA Auto', detail: 'Free-first · silent failover', source: 'auto' },
  { id: 'qwen25-coder-14b', label: 'Qwen2.5 Coder 14B', detail: 'Local · coding', source: 'local' },
  { id: 'qwen25-coder-7b', label: 'Qwen2.5 Coder 7B', detail: 'Local · balanced', source: 'local' },
  { id: 'llama32-3b', label: 'Llama 3.2 3B', detail: 'Local · fast', source: 'local' },
  { id: 'gpt-4o', label: 'GPT-4o', detail: 'Cloud · chat and code', source: 'cloud' },
  { id: 'claude-sonnet', label: 'Claude Sonnet', detail: 'Cloud · long context', source: 'cloud' },
  { id: 'deepseek-chat', label: 'DeepSeek Chat', detail: 'Cloud · coding + chat', source: 'cloud' },
  { id: 'gemini-flash', label: 'Gemini 2.0 Flash', detail: 'Cloud · fast', source: 'cloud' },
];

const PROVIDER_ROWS = [
  { id: 'openai', name: 'OpenAI', hint: 'GPT models', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic', name: 'Anthropic', hint: 'Claude models', keyUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'google', name: 'Google AI Studio', hint: 'Gemini models', keyUrl: 'https://aistudio.google.com/apikey' },
  { id: 'groq', name: 'Groq', hint: 'Fast inference', keyUrl: 'https://console.groq.com/keys' },
  { id: 'openrouter', name: 'OpenRouter', hint: 'Many models, one key', keyUrl: 'https://openrouter.ai/keys' },
  { id: 'huggingface', name: 'Hugging Face', hint: 'Chat via Inference API', keyUrl: 'https://huggingface.co/settings/tokens' },
  { id: 'nvidia', name: 'NVIDIA NIM', hint: 'Free NIM endpoints', keyUrl: 'https://build.nvidia.com/settings/api-keys' },
  { id: 'together', name: 'Together AI', hint: 'Open model hosting', keyUrl: 'https://api.together.xyz/settings/api-keys' },
  { id: 'fireworks', name: 'Fireworks', hint: 'Fast serverless open models', keyUrl: 'https://fireworks.ai/account/api-keys' },
  { id: 'deepseek', name: 'DeepSeek', hint: 'Coding + chat API', keyUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'mistral', name: 'Mistral', hint: 'Mistral + Codestral', keyUrl: 'https://console.mistral.ai/api-keys' },
  { id: 'cerebras', name: 'Cerebras', hint: 'Ultra-fast Llama free tier', keyUrl: 'https://cloud.cerebras.ai' },
  { id: 'sambanova', name: 'SambaNova', hint: 'SambaNova Cloud open models', keyUrl: 'https://cloud.sambanova.ai' },
  { id: 'perplexity', name: 'Perplexity', hint: 'Sonar chat + search', keyUrl: 'https://www.perplexity.ai/settings/api' },
  { id: 'xai', name: 'xAI', hint: 'Grok models', keyUrl: 'https://console.x.ai' },
  { id: 'github-models', name: 'GitHub Models', hint: 'Retired. use Groq / Google / OpenRouter' },
];

const ACCENTS: { id: AccentPref; label: string; swatch: string }[] = [
  { id: 'sky', label: 'Sky', swatch: 'bg-sky-400' },
  { id: 'emerald', label: 'Emerald', swatch: 'bg-emerald-400' },
  { id: 'amber', label: 'Amber', swatch: 'bg-amber-400' },
  { id: 'rose', label: 'Rose', swatch: 'bg-rose-400' },
];

export function SettingsContent({ onClose, initialSection }: { onClose?: () => void; initialSection?: string } = {}) {
  const { user, profile, settings, updateSettings, signOut, scheduleAccountDeletion, cancelAccountDeletion, refreshProfile } = useAuth();
  const { blockedUsers, unblockFriend, refreshBlocked } = useSocial();
  const { theme, setTheme } = useTheme();
  const { navigate } = useRouter();
  const [activeSection, setActiveSection] = useState(() => {
    const s = initialSection && initialSection !== 'mcp' ? initialSection : 'account';
    if (s === 'testers' || s === 'beta') return 'account';
    return s;
  });
  useEffect(() => {
    if (initialSection === 'mcp') {
      onClose?.();
      navigate({ name: 'mcp' });
    }
  }, [initialSection, navigate, onClose]);
  useEffect(() => {
    if (!initialSection || initialSection === 'mcp') return;
    if (initialSection === 'testers' || initialSection === 'beta') {
      setActiveSection('account');
      return;
    }
    setActiveSection(initialSection);
  }, [initialSection]);
  const [prefs, setPrefs] = useState<LocalPrefs>(() => getLocalPrefs());
  const [displayName, setDisplayName] = useState(
    () => getLocalPrefs().displayName || profile?.display_name || 'Guest',
  );
  const [providerKeys, setProviderKeys] = useState(() => getProviderApiKeys());
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);
  const [updateMsg, setUpdateMsg] = useState('Press Check for update to look for a newer NOVA build.');
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
  const [deleteAccountBusy, setDeleteAccountBusy] = useState(false);
  const [deleteAccountMsg, setDeleteAccountMsg] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
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
  const [brainUrl, setBrainUrl] = useState(() => getBrainUrl());
  const [brainContractVersion, setBrainContractVersion] = useState('');
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
    window.addEventListener('NOVA:features-changed', onFeat);
    return () => window.removeEventListener('NOVA:features-changed', onFeat);
  }, []);

  useEffect(() => {
    void Promise.all([
      window.arkDesktop?.brainStatus?.(),
      window.arkDesktop?.secretsStatus?.(),
    ]).then(([status, secrets]) => {
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
        // Only surface signing when it helps (valid signature). Hide unsigned / NotSigned noise.
        if (row?.packaged && row.signed) {
          setSigningStatus('Windows Authenticode signature valid');
          return;
        }
        setSigningStatus(null);
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
    window.addEventListener('NOVA:engine-models-changed', onModels);
    return () => window.removeEventListener('NOVA:engine-models-changed', onModels);
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
        // App is about to exit for the Updating window. keep button busy briefly.
        setDownloadingUpdate(true);
      } else if (payload?.status === 'error' || payload?.status === 'idle' || payload?.status === 'available') {
        setDownloadingUpdate(false);
      }
    });
    return () => {
      unsub?.();
    };
  }, []);

  // Security grants live in Electron main + local prefs. Re-read both when opening Security
  // so Full PC / Run everything cannot desync after a prefs wipe.
  useEffect(() => {
    if (activeSection !== 'security') return;
    let cancelled = false;
    void hydratePrefsFromWorkspaceGrants().then(() => {
      if (!cancelled) setPrefs(getLocalPrefs());
    }).catch(() => {
      if (!cancelled) setPrefs(getLocalPrefs());
    });
    return () => {
      cancelled = true;
    };
  }, [activeSection]);

  const patchPrefs = (patch: Partial<LocalPrefs>) => {
    const next = setLocalPrefs(patch);
    setPrefs(next);
    setSavedFlash('Saved on this device');
    window.setTimeout(() => setSavedFlash(''), 2200);
    if ('allowDesktopFolderAccess' in patch || 'allowDocumentsFolderAccess' in patch
      || 'allowFullPcAccess' in patch || 'agentExecutionMode' in patch) {
      void syncWorkspaceGrantsFromPrefs().then(() => {
        setPrefs(getLocalPrefs());
      });
    }
  };

  const aiMode = prefs.aiMode;
  const keepLocal = prefs.keepFilesLocal;
  const allowSync = prefs.allowCloudSync;
  const diagnostics = prefs.sendDiagnostics;

  const keyedCount = useMemo(() => Object.keys(providerKeys).length, [providerKeys]);

  const pushProfileToFriends = async () => {
    try {
      await supabase.rpc('broadcast_my_profile');
    } catch {
      /* RPC may not be applied yet; friends still refresh via live lookup */
    }
  };

  const saveDisplayName = async () => {
    const name = displayName.trim() || 'Guest';
    patchPrefs({ displayName: name });
    if (user && user.id !== 'guest-local') {
      try {
        await supabase.from('profiles').upsert({
          id: user.id,
          display_name: name,
          avatar_url: null,
        });
        await pushProfileToFriends();
        await refreshProfile();
      } catch {
        /* local prefs still saved */
      }
    }
  };

  const saveAllVisible = () => {
    void saveDisplayName();
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
        const cleanMsg = String(info.message || '')
          .replace(/\s*\(delta-ready\)/ig, '')
          .replace(/\s*delta-ready/ig, '')
          .trim();
        setUpdateMsg(
          info.newerAvailable && !info.setupAssetUrl
            ? `${cleanMsg} (installer file not published yet. try again later)`
            : cleanMsg || (info.newerAvailable ? `Update available: NOVA ${info.latestTag || ''}`.trim() : 'You’re up to date.'),
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
      const { clearUpdateIndicatorCache, downloadAndInstallArkUpdate } = await import('@/lib/arkUpdates');
      const result = await downloadAndInstallArkUpdate({
        setupAssetUrl: updateInfo.setupAssetUrl,
        latestTag: updateInfo.latestTag,
      });
      if (!result?.ok) {
        setUpdateMsg(result?.message || 'Update failed.');
        setDownloadingUpdate(false);
        // Don't keep a green “available” CTA after GitHub 504 / download failure.
        setUpdateInfo(null);
        clearUpdateIndicatorCache();
      }
    })();
  };

  const installedModels = useMemo(
    () =>
      (engineStatus?.models ?? []).filter(
        (m): m is ArkEngineModel =>
          m.status === 'ready'
          && m.id !== 'NOVA-core'
          && m.id !== 'NOVA-image-core'
          && m.id !== 'NOVA-video-core',
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
  const diskUsedGb = diskTotalGb > 0 && typeof diskSpace?.freeGb === 'number'
    ? Math.max(0, diskTotalGb - diskSpace.freeGb)
    : 0;
  const diskUsedPercent = diskTotalGb > 0 ? Math.min(100, Math.round((diskUsedGb / diskTotalGb) * 100)) : 0;

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
    // Beta channel removed from Settings — stable entries only.
    if (entry.channel !== 'stable') return false;
    return entry.version === appVersion;
  }).slice(0, 1);

  const navSections = useMemo(() => SECTIONS, []);

  return (
    <div ref={settingsRootRef} className="flex h-full min-h-0 min-w-0 animate-fade-in bg-ark-navy-900">
      <div className={`${navCompact ? 'w-14' : 'w-56'} shrink-0 border-r border-surface-border flex flex-col min-h-0 min-w-0 bg-ark-navy-900`}>
        <nav className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2 sm:p-3 flex flex-col gap-0.5 ${navCompact ? 'items-center' : ''}`}>
          {navSections.map(section => (
            <button
              key={section.id}
              type="button"
              disabled={Boolean(section.disabled || section.comingSoon)}
              onClick={() => {
                if (section.disabled || section.comingSoon) return;
                setActiveSection(section.id);
              }}
              className={`ark-nav-item w-full ${navCompact ? '!px-2 !gap-0 !justify-center w-10' : ''} ${activeSection === section.id ? 'active' : ''} ${
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

      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8 bg-ark-navy-900">
        <div className={`min-w-0 mx-auto ${activeSection === 'providers' || activeSection === 'models' ? 'max-w-4xl' : 'max-w-2xl'}`}>
          {activeSection === 'account' && (
            <SettingsSection title="Account">
              <div className="space-y-5">
                <div className="flex items-start gap-4">
                  <div className="relative shrink-0 w-16 h-16 rounded-full overflow-hidden bg-ark-blue-500/15 border border-ark-blue-500/30 flex items-center justify-center">
                    <NovaMark className="w-8 h-8 text-content-primary" title="NOVA" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-content-primary truncate">{displayName || 'Guest'}</p>
                    <p className="text-xs text-content-tertiary truncate flex items-center gap-1.5 mt-0.5">
                      <Mail className="w-3 h-3" />
                      {user?.email ?? 'guest@NOVA.local'}
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
                    <label className="block text-xs font-medium text-content-secondary">NOVA ID</label>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="flex-1 min-w-0 rounded-lg border border-surface-border bg-ark-navy-900/80 px-3 py-2 text-sm font-mono tracking-[0.18em] sm:tracking-[0.28em] text-content-primary overflow-x-auto">
                      {isArkDevEmail(user?.email)
                        ? 'DEV'
                        : (profile?.ark_id ? formatArkId(profile.ark_id) : '•••••••')}
                    </p>
                    <button
                      type="button"
                      disabled={!profile?.ark_id && !isArkDevEmail(user?.email)}
                      onClick={() => {
                        if (!profile?.ark_id && !isArkDevEmail(user?.email)) return;
                        const arkIdText = isArkDevEmail(user?.email)
                          ? 'DEV'
                          : formatArkId(String(profile?.ark_id ?? ''));
                        void navigator.clipboard.writeText(arkIdText).then(() => {
                          setArkCopied(true);
                          window.setTimeout(() => setArkCopied(false), 1600);
                        }).catch(() => undefined);
                      }}
                      className="ark-btn-secondary shrink-0"
                      title="Copy NOVA ID"
                    >
                      {arkCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {arkCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <Field label="Email" value={user?.email ?? 'guest@NOVA.local'} onChange={() => {}} disabled />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InfoCard title="Plan" value="Free on this PC" />
                  <InfoCard title="Devices" value="This PC" />
                </div>

                <div className="flex flex-wrap gap-2 pt-1 items-center">
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
                  {user?.id && user.id !== 'guest-local' ? (
                    profile?.delete_scheduled_at ? (
                      <button
                        type="button"
                        disabled={deleteAccountBusy}
                        className="ark-btn-secondary !text-amber-200 border-amber-500/40 disabled:opacity-50"
                        onClick={() => {
                          setDeleteAccountBusy(true);
                          setDeleteAccountMsg(null);
                          void cancelAccountDeletion().then((res) => {
                            setDeleteAccountBusy(false);
                            if (!res.ok) {
                              setDeleteAccountMsg(res.error);
                              return;
                            }
                            flashSaved('Deletion canceled');
                          });
                        }}
                      >
                        {deleteAccountBusy ? 'Canceling…' : 'Cancel account deletion'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={deleteAccountBusy}
                        className="ark-btn-secondary !text-rose-300 border-rose-500/40 disabled:opacity-50"
                        onClick={() => {
                          setDeleteAccountMsg(null);
                          setDeleteConfirmOpen(true);
                        }}
                      >
                        Delete account
                      </button>
                    )
                  ) : null}
                </div>
                {profile?.delete_scheduled_at ? (
                  <p className="text-[11px] text-amber-200/90 leading-relaxed">
                    Account deletion is scheduled for{' '}
                    {new Date(profile.delete_scheduled_at).toLocaleString()}. You can cancel above before then.
                    We will email {user?.email || 'you'} when mail delivery is live.
                  </p>
                ) : null}
                {deleteAccountMsg ? (
                  <p className="text-[11px] text-amber-200/90">{deleteAccountMsg}</p>
                ) : null}
              </div>
            </SettingsSection>
          )}

          {deleteConfirmOpen ? (
            <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70">
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="NOVA-delete-account-title"
                className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-ark-navy-900 shadow-2xl p-5 space-y-3"
              >
                <h3 id="NOVA-delete-account-title" className="text-base font-semibold text-content-primary">
                  You&apos;re about to delete your account
                </h3>
                <p className="text-sm text-content-secondary leading-relaxed">
                  This starts a <span className="text-content-primary font-medium">24-hour</span> deletion window.
                  Your account stays usable until then. After 24 hours it is permanently removed.
                </p>
                <p className="text-[12px] text-content-tertiary leading-relaxed">
                  We&apos;ll send an email to <span className="text-content-secondary">{user?.email || 'your inbox'}</span>{' '}
                  confirming the schedule (email delivery ships with SMTP — the notice is prepared on this PC for now).
                </p>
                <div className="flex flex-wrap gap-2 justify-end pt-1">
                  <button
                    type="button"
                    className="ark-btn-secondary"
                    disabled={deleteAccountBusy}
                    onClick={() => setDeleteConfirmOpen(false)}
                  >
                    Keep account
                  </button>
                  <button
                    type="button"
                    className="ark-btn-secondary !text-rose-300 border-rose-500/40 disabled:opacity-50"
                    disabled={deleteAccountBusy}
                    onClick={() => {
                      setDeleteAccountBusy(true);
                      setDeleteAccountMsg(null);
                      void scheduleAccountDeletion(24).then((res) => {
                        setDeleteAccountBusy(false);
                        if (!res.ok) {
                          setDeleteAccountMsg(res.error);
                          return;
                        }
                        setDeleteConfirmOpen(false);
                        flashSaved('Deletion scheduled · 24 hours');
                      });
                    }}
                  >
                    {deleteAccountBusy ? 'Scheduling…' : 'Delete in 24 hours'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {activeSection === 'appearance' && (
            <SettingsSection title="Appearance">
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
                  value={prefs.compactSidebar}
                  onChange={v => patchPrefs({ compactSidebar: v })}
                />
                <ToggleRow
                  label="Show status bar"
                  value={prefs.showStatusBar}
                  onChange={v => patchPrefs({ showStatusBar: v })}
                />
                <ToggleRow
                  label="Reduce motion"
                  value={prefs.reduceMotion}
                  onChange={v => patchPrefs({ reduceMotion: v })}
                />
                </div>
              </div>
            </SettingsSection>
          )}

          {activeSection === 'ai' && (
            <SettingsSection title="AI">
              <div className="space-y-6 max-w-3xl">
                {/* Status */}
                <div className="ark-card p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-ark-accent-green/10 flex items-center justify-center shrink-0">
                    <Cpu className="w-5 h-5 text-ark-accent-green" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-content-primary">Routing brain</p>
                    <p className="text-xs text-content-secondary">
                      {AI_MODES.find(m => m.value === aiMode)?.label ?? 'Automatic'}
                    </p>
                  </div>
                  <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
                </div>

                <div className="rounded-xl border border-surface-border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <p className="text-sm font-medium text-content-primary">NOVA Brain details</p>
                  <button
                    type="button"
                    className="ark-btn-secondary text-xs shrink-0 self-start sm:self-center"
                    onClick={() => {
                      onClose?.();
                      navigate({ name: 'brain' });
                    }}
                  >
                    Open NOVA Brain
                  </button>
                </div>

                <SettingsSystemHealth
                  engineStatus={engineStatus}
                  brainUrl={brainUrl}
                  diskFreeGb={diskSpace?.freeGb}
                />

                {/* Routing mode */}
                <SettingsGroup title="Routing mode">
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
                          </div>
                          {aiMode === mode.value && <Check className="w-4 h-4 text-ark-blue-400 shrink-0" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </SettingsGroup>

                <SettingsGroup title="Failover & cloud">
                  <div className="grid grid-cols-1 gap-3">
                    <ToggleRow
                      label="Auto failover"
                      value={prefs.autoFailover}
                      onChange={v => patchPrefs({ autoFailover: v })}
                    />
                    <ToggleRow
                      label="Ask before cloud failover"
                      value={prefs.askBeforeCloudFailover}
                      onChange={v => patchPrefs({ askBeforeCloudFailover: v })}
                    />
                  </div>
                </SettingsGroup>

                {/* Chat behavior */}
                <SettingsGroup title="Chat behavior">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <ToggleRow
                      label="Stream responses"
                      value={prefs.streamResponses}
                      onChange={v => patchPrefs({ streamResponses: v })}
                    />
                    <ToggleRow
                      label="Remember chat context"
                      value={prefs.rememberContext}
                      onChange={v => patchPrefs({ rememberContext: v })}
                    />
                  </div>
                </SettingsGroup>

                {/* Model discovery */}
                <SettingsGroup title="Model discovery">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <ToggleRow
                      label="Hunt new models online"
                      value={prefs.huntInternetModels}
                      onChange={v => patchPrefs({ huntInternetModels: v })}
                    />
                    <ToggleRow
                      label="Download next when a model runs out"
                      value={prefs.autoInstallHuntModels}
                      onChange={v => patchPrefs({ autoInstallHuntModels: v })}
                    />
                  </div>
                </SettingsGroup>

                {/* Local GGUF */}
                <SettingsGroup title="Local GGUF (advanced)">
                  <div className="rounded-xl border border-surface-border p-5 space-y-6 bg-surface/30">
                    <div className="rounded-lg border border-surface-border/80 bg-ark-navy-950/40 px-3 py-2.5">
                      <p className="text-[11px] font-medium text-content-secondary">Local chat history capacity</p>
                      <p className="text-sm text-content-primary mt-0.5 tabular-nums">
                        {ggufCtxCapacityLabel()}
                      </p>
                    </div>
                    <GgufSliderRow
                      label="Temperature"
                      valueLabel={Number(prefs.ggufTemperature ?? 0.55).toFixed(2)}
                      min={0.1}
                      max={1.2}
                      step={0.05}
                      value={prefs.ggufTemperature ?? 0.55}
                      onChange={v => patchPrefs({ ggufTemperature: v })}
                      lowLabel="Focused"
                      highLabel="Creative"
                    />
                    <GgufSliderRow
                      label="Max output tokens"
                      valueLabel={String(prefs.ggufNPredict ?? 4096)}
                      min={4096}
                      max={8192}
                      step={256}
                      value={prefs.ggufNPredict ?? 4096}
                      onChange={v => patchPrefs({ ggufNPredict: v })}
                      lowLabel="4096 default"
                      highLabel="8192 longer"
                    />
                  </div>
                </SettingsGroup>
              </div>
            </SettingsSection>
          )}

          {activeSection === 'voice' && (
            <SettingsSection title="Voice">
              <div className="min-h-0 pb-6">
                <VoiceSettingsPanel onSaved={msg => {
                  setSavedFlash(msg);
                  window.setTimeout(() => setSavedFlash(''), 2200);
                }} />
              </div>
            </SettingsSection>
          )}

          {activeSection === 'models' && (
            <SettingsSection title="Models">
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
                      {(installed || missingKey) && (
                        <p className="text-[10px] text-content-tertiary mt-0.5">
                          {installed ? 'Installed' : ''}{installed && missingKey ? ' · ' : ''}{missingKey ? 'Key needed' : ''}
                        </p>
                      )}
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
            <SettingsSection title="Providers">
              <div className="space-y-3">
                {secretsEncrypted === false && window.arkDesktop ? (
                  <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-3">
                    <p className="text-sm font-semibold text-rose-200">NO_ENCRYPTION: secure key storage is unavailable</p>
                    <p className="text-xs text-rose-100/75 mt-1">
                      NOVA will not save provider secrets as plaintext. Repair Windows credential encryption before connecting a key.
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
                          <div className="flex items-center gap-2.5 min-w-0">
                            <BrandMark id={p.id} name={p.name} size="sm" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-content-primary truncate">{p.name}</p>
                            </div>
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
                            {'keyUrl' in p && p.keyUrl ? (
                              <button
                                type="button"
                                className="text-[11px] text-sky-400 hover:text-sky-300"
                                onClick={() => void window.arkDesktop?.openExternal?.(p.keyUrl!)}
                              >
                                Where to get a {p.name} key →
                              </button>
                            ) : null}
                            <input
                              type="password"
                              value={keyDraft}
                              onChange={e => setKeyDraft(e.target.value)}
                              placeholder="Paste API key"
                              className="ark-input"
                              spellCheck={false}
                              autoComplete="off"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="ark-btn-secondary flex-1"
                                onClick={() => {
                                  void (async () => {
                                    try {
                                      await setProviderApiKey(p.id, '');
                                      setProviderKeys(getProviderApiKeys());
                                      setEditingProvider(null);
                                      setKeyDraft('');
                                      setSavedFlash('Key removed');
                                      window.setTimeout(() => setSavedFlash(''), 1600);
                                    } catch (err) {
                                      setSavedFlash(err instanceof Error ? err.message : 'Could not remove key');
                                      window.setTimeout(() => setSavedFlash(''), 2600);
                                    }
                                  })();
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
                                      setSavedFlash('Key saved. those models can appear in Chat now');
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
                    <p className="text-sm font-medium text-content-primary">Plugin OAuth client IDs</p>
                    <button
                      type="button"
                      className="text-[11px] text-sky-400 hover:text-sky-300 shrink-0"
                      onClick={() => void window.arkDesktop?.openExternal?.('https://github.com/DrMeji/Nova/releases')}
                      title="Public download page (setup guide docs are not on the public repo)"
                    >
                      Releases
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
            <SettingsSection title="Privacy">
              <div className="space-y-3">
                <ToggleRow
                  label="Keep project files on this device"
                  value={keepLocal}
                  onChange={v => {
                    patchPrefs({ keepFilesLocal: v });
                    if (settings) updateSettings({ keep_files_local: v });
                  }}
                />
                <ToggleRow
                  label="Allow optional cloud sync"
                  value={allowSync}
                  onChange={v => {
                    patchPrefs({ allowCloudSync: v });
                    if (settings) updateSettings({ allow_cloud_sync: v });
                  }}
                />
                <ToggleRow
                  label="Send anonymous diagnostics"
                  value={diagnostics}
                  onChange={v => {
                    patchPrefs({ sendDiagnostics: v });
                    if (settings) updateSettings({ send_diagnostics: v });
                  }}
                />
                <ToggleRow
                  label="Share usage stats"
                  value={prefs.shareUsageStats}
                  onChange={v => patchPrefs({ shareUsageStats: v })}
                />
                <p className="text-[11px] text-content-tertiary -mt-1 px-0.5">
                  When off (default), NOVA does not send usage pings. Cloud chat history also stays off unless Allow optional cloud sync is on.
                </p>
                <ToggleRow
                  label="Clear clipboard after image paste"
                  value={prefs.clearClipboardAfterPaste}
                  onChange={v => patchPrefs({ clearClipboardAfterPaste: v })}
                />
                <div className="rounded-xl border border-surface-border p-4 space-y-3 mt-2">
                  <div className="flex items-center justify-between gap-2.5">
                    <p className="text-sm font-medium text-content-primary">Blocked users</p>
                    <button
                      type="button"
                      className="ark-btn-secondary text-xs shrink-0"
                      onClick={() => void refreshBlocked()}
                    >
                      Refresh
                    </button>
                  </div>
                  {blockedUsers.length === 0 ? (
                    <p className="text-xs text-content-tertiary">No blocked users.</p>
                  ) : (
                    <ul className="space-y-2">
                      {blockedUsers.map(b => (
                        <li
                          key={b.arkId}
                          className="flex items-center gap-2 rounded-xl border border-white/10 bg-ark-navy-950/40 px-3 py-2"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm text-content-primary truncate">{b.displayName}</span>
                            <span className="block text-[10px] font-mono text-content-tertiary tracking-wider mt-0.5">
                              {formatArkId(b.arkId)}
                            </span>
                          </span>
                          <button
                            type="button"
                            className="shrink-0 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-[11px] text-content-secondary hover:text-content-primary"
                            onClick={() => void unblockFriend(b.arkId)}
                          >
                            Unblock
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <button
                  type="button"
                  className="ark-btn-secondary w-full !text-ark-accent-red mt-2"
                  disabled={cacheBusy}
                  onClick={() => void runClearChatCache()}
                >
                  <Trash2 className="w-4 h-4" />
                  {cacheBusy ? 'Clearing…' : 'Clear local chat cache'}
                </button>
                <div className="rounded-xl border border-surface-border p-4 space-y-2 mt-2">
                  <p className="text-sm font-medium text-content-primary">Local reports & update errors</p>
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
                    a.download = 'NOVA-settings-export.json';
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
            <SettingsSection title="Storage">
              <div className="space-y-4 min-w-0">
                <StorageBar
                  label="Model storage"
                  used={`${modelUsedGb >= 10 ? modelUsedGb.toFixed(0) : modelUsedGb.toFixed(1)} GB`}
                  total={diskTotalGb > 0 ? `${diskTotalGb.toFixed(0)} GB disk` : 'this PC'}
                  percent={modelPercent}
                  tone="bg-sky-500"
                />
                <StorageBar
                  label="Disk"
                  used={`${diskUsedGb.toFixed(0)} GB used`}
                  total={diskTotalGb > 0 && typeof diskSpace?.freeGb === 'number'
                    ? `${diskTotalGb.toFixed(0)} GB · ${diskSpace.freeGb.toFixed(1)} GB free`
                    : 'this PC'}
                  percent={diskUsedPercent}
                  tone="bg-zinc-500"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InfoCard
                    title="Installed models"
                    value={String(installedModels.length)}
                  />
                  <InfoCard
                    title="Models folder"
                    value={engineStatus?.modelsDirIsCustom ? 'Custom' : 'Default'}
                  />
                </div>

                {engineStatus?.modelsDir && (
                  <div className="rounded-xl border border-surface-border p-4 space-y-2">
                    <p className="text-sm font-medium text-content-primary flex items-center gap-2">
                      <FolderOpen className="w-4 h-4 text-sky-400 shrink-0" />
                      Download location
                    </p>
                    <code className="block text-[11px] font-mono text-content-secondary break-all rounded-lg bg-surface-active/60 border border-surface-border px-3 py-2">
                      {engineStatus.modelsDir}
                    </code>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        className="ark-btn-secondary text-xs"
                        onClick={() => {
                          void window.arkDesktop?.openPath?.(engineStatus.modelsDir!);
                        }}
                      >
                        Open folder
                      </button>
                      <button
                        type="button"
                        className="ark-btn-secondary text-xs"
                        onClick={() => {
                          onClose?.();
                          navigate({ name: 'local-ai' });
                        }}
                      >
                        Change in Local AI
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-xs font-medium text-content-secondary mb-2">Downloaded models</p>
                  {installedModels.length === 0 ? (
                    <p className="text-xs text-content-tertiary rounded-xl border border-surface-border px-3.5 py-3">
                      No models installed
                    </p>
                  ) : (
                    <div className="rounded-xl border border-surface-border divide-y divide-surface-border/80 overflow-hidden">
                      {installedModels.map(model => (
                        <div key={model.id} className="flex items-center gap-3 px-3.5 py-2.5 min-w-0">
                          <StatusCheck label={`${model.name} installed in NOVA Engine`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-content-primary truncate">{model.name}</p>
                            <p className="text-[11px] text-content-tertiary truncate">
                              {model.detail || (model.sizeGb ? `${model.sizeGb} GB` : 'NOVA Engine')}
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
                  <button type="button" className="ark-btn-secondary" onClick={() => { onClose?.(); navigate({ name: 'local-ai' }); }}>
                    Manage models
                  </button>
                </div>
              </div>
            </SettingsSection>
          )}

          {activeSection === 'hardware' && (
            <SettingsSection title="Hardware">
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
                      window.dispatchEvent(new Event('NOVA:hardware-rescanned'));
                      window.setTimeout(() => setHwFlash(''), 2000);
                    });
                  }}
                >
                  <RefreshCw className={`w-4 h-4 ${hwScanning ? 'animate-spin' : ''}`} />
                  {hwScanning ? 'Scanning…' : 'Rescan hardware'}
                </button>
                {hwFlash && <p className="text-xs text-emerald-400">{hwFlash}</p>}
                <div className="pt-2">
                  <button
                    type="button"
                    className="text-xs text-sky-400 hover:text-sky-300"
                    onClick={() => { onClose?.(); navigate({ name: 'models' }); }}
                  >
                    Open Models · For your PC
                  </button>
                </div>
              </div>
            </SettingsSection>
          )}

          {activeSection === 'projects' && (
            <SettingsSection title="Projects">
              <div className="space-y-4">
                <Field
                  label="Default project location"
                  value={prefs.projectLocation}
                  onChange={v => patchPrefs({ projectLocation: v })}
                />
                <Field
                  label="Preferred language (scaffold hint)"
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
                  value={prefs.autoSaveProjects}
                  onChange={v => patchPrefs({ autoSaveProjects: v })}
                />
                <ToggleRow
                  label="Open last project on launch"
                  value={prefs.openLastProjectOnLaunch}
                  onChange={v => patchPrefs({ openLastProjectOnLaunch: v })}
                />
              </div>
            </SettingsSection>
          )}

          {activeSection === 'security' && (
            <SettingsSection title="Security">
              <div className="space-y-4">
                <div className="rounded-xl border border-surface-border p-4 space-y-3">
                  <p className="text-sm font-medium text-content-primary">Local PIN (UI lock only)</p>
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
                  <button
                    type="button"
                    className="text-[11px] text-sky-400 hover:text-sky-300"
                    onClick={() => {
                      void import('@/lib/localAuthRecovery').then(({ revealLocalLoginRecovery }) => {
                        void revealLocalLoginRecovery();
                      });
                    }}
                  >
                    Open local PIN / password note folder
                  </button>
                </div>

                <ToggleRow
                  label="Require PIN on launch"
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
                  <p className="text-sm font-medium text-content-primary">Auto lock</p>
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
                  <p className="text-sm font-medium text-content-primary">Extra unlock code</p>
                  <ToggleRow
                    label="Require second factor"
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
                  value={prefs.sandboxAgent}
                  onChange={v => patchPrefs({ sandboxAgent: v })}
                />

                <ToggleRow
                  label="Agent tool loop (Level B)"
                  value={prefs.agentLoopEnabled !== false}
                  onChange={v => patchPrefs({ agentLoopEnabled: v })}
                />
                <p className="text-[11px] text-content-tertiary -mt-2 px-0.5">
                  When on, Agent / Debug on a bound project search, read, edit, run, and verify in a loop (Stop anytime).
                </p>
                <ToggleRow
                  label="Commit after green verify"
                  value={Boolean(prefs.agentLoopCommitOnSuccess)}
                  onChange={v => patchPrefs({ agentLoopCommitOnSuccess: v })}
                />
                <p className="text-[11px] text-content-tertiary -mt-2 px-0.5">
                  Optional. after a successful verify, run allowlisted git commit on the bound folder.
                </p>

                <ToggleRow
                  label="Allow Desktop folder access"
                  value={prefs.allowDesktopFolderAccess}
                  onChange={v => patchPrefs({ allowDesktopFolderAccess: v })}
                />
                <ToggleRow
                  label="Allow Documents folder access"
                  value={prefs.allowDocumentsFolderAccess}
                  onChange={v => patchPrefs({ allowDocumentsFolderAccess: v })}
                />

                <ToggleRow
                  label="Full PC access (files)"
                  value={prefs.allowFullPcAccess}
                  onChange={v => patchPrefs({ allowFullPcAccess: v })}
                />

                <div>
                  <label className="block text-xs font-medium text-content-secondary mb-2">Execution &amp; approvals</label>
                  <div className="rounded-xl border border-surface-border overflow-hidden divide-y divide-surface-border">
                    {([
                      {
                        value: 'allowlist' as const,
                        title: 'Allowlist',
                      },
                      {
                        value: 'auto_review' as const,
                        title: 'Auto-review',
                      },
                      {
                        value: 'run_all' as const,
                        title: 'Run everything',
                      },
                    ]).map(opt => {
                      const active = prefs.agentExecutionMode === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => patchPrefs({ agentExecutionMode: opt.value })}
                          className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
                            active
                              ? 'bg-sky-500/10'
                              : 'hover:bg-surface-hover/60'
                          }`}
                        >
                          <span
                            className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                              active ? 'border-sky-400' : 'border-surface-border'
                            }`}
                            aria-hidden
                          >
                            {active && <span className="w-2 h-2 rounded-full bg-sky-400" />}
                          </span>
                          <span className="min-w-0">
                            <span className={`block text-sm font-medium ${active ? 'text-sky-300' : 'text-content-primary'}`}>
                              {opt.title}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <ToggleRow
                  label="Chat-first layout"
                  value={prefs.chatFirst}
                  onChange={v => patchPrefs({ chatFirst: v })}
                />

                <div className="flex items-center gap-3 p-4 ark-card min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-ark-accent-green/10 flex items-center justify-center shrink-0">
                    <Lock className="w-4 h-4 text-ark-accent-green" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-content-primary">Credential storage</p>
                  </div>
                  <span className="text-xs text-ark-accent-green shrink-0">Active</span>
                </div>
              </div>
            </SettingsSection>
          )}

          {activeSection === 'updates' && (
            <SettingsSection title="Update">
              <div className="space-y-5">
                <div className="rounded-3xl border border-surface-border bg-ark-navy-900 p-5 sm:p-6 flex flex-col gap-4 shadow-[0_8px_28px_rgba(0,0,0,0.28)]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-content-primary">NOVA v{appVersion}</p>
                      <p className="text-xs text-content-tertiary mt-0.5">{updateMsg}</p>
                      {downloadingUpdate && (
                        <div className="mt-3 h-2 rounded-full bg-surface-hover overflow-hidden max-w-xs">
                          <div
                            className="h-full rounded-full bg-sky-500 transition-all"
                            style={{ width: `${Math.min(100, Math.max(updatePercent, 4))}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        title="Open NOVA on GitHub"
                        aria-label="Open NOVA on GitHub"
                        onClick={() =>
                          void window.arkDesktop?.openExternal?.('https://github.com/DrMeji/Nova/releases')
                        }
                        className="h-10 w-10 rounded-xl border border-white/15 bg-white/[0.04] text-content-secondary hover:text-content-primary hover:bg-white/[0.08] flex items-center justify-center transition-colors"
                      >
                        <Github className="w-5 h-5" />
                      </button>
                      {updateInfo?.newerAvailable && updateInfo.setupAssetUrl && !isArkDevSession() ? (
                        <button
                          type="button"
                          onClick={downloadUpdate}
                          disabled={downloadingUpdate}
                          title="Download and install the latest NOVA"
                          className="ark-btn-primary !rounded-full"
                        >
                          {downloadingUpdate ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                          {downloadingUpdate ? 'Updating…' : 'Update'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={checkForUpdates}
                          disabled={checkingUpdates || downloadingUpdate}
                          className="ark-btn-secondary !rounded-full"
                        >
                          {checkingUpdates ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                          {checkingUpdates ? 'Checking…' : 'Check for update'}
                        </button>
                      )}
                    </div>
                  </div>
                  {updateInfo?.newerAvailable && updateInfo.setupAssetUrl && !downloadingUpdate ? (
                    <p className="text-[11px] text-amber-200/90 leading-relaxed">
                      A newer NOVA is ready. Install it now for the latest fixes and features.
                    </p>
                  ) : null}
                  {signingStatus ? (
                    <p className="text-[11px] text-content-tertiary leading-relaxed">
                      {signingStatus}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-xl border border-surface-border p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Info className="w-4 h-4 text-content-secondary" />
                    <h2 className="text-sm font-semibold text-content-primary">About</h2>
                  </div>
                  <p className="text-xs text-content-secondary">
                    NOVA v{appVersion}
                  </p>
                  <p className="text-[11px] text-content-tertiary mt-1">
                    Brain contract {brainContractVersion || 'unavailable'} · port {(() => {
                      try {
                        const port = new URL(brainUrl).port;
                        return port || (brainUrl ? 'default' : 'unavailable');
                      } catch {
                        return 'unavailable';
                      }
                    })()}
                  </p>
                </div>

                <ToggleRow
                  label="Launch NOVA when Windows starts"
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
                  value={prefs.autoCheckUpdates}
                  onChange={v => patchPrefs({ autoCheckUpdates: v })}
                />
                <ToggleRow
                  label="Notify when an update is ready"
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
                        You’re on NOVA v{appVersion}.
                      </p>
                    ) : (
                      visibleChangelog.map(entry => (
                      <div key={entry.version} className="rounded-xl border border-surface-border p-4">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div>
                            <p className="text-sm font-medium text-content-primary">
                              v{entry.version} · {String(entry.title || '').replace(/\u2014|\u2013|\u2212/g, '. ')}
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
                              <span>{String(note).replace(/\u2014|\u2013|\u2212/g, '. ')}</span>
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
        </div>
      </div>
    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="animate-fade-in min-w-0">
      <h1 className="text-xl font-bold text-content-primary mb-4">{title}</h1>
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

function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-content-primary">{title}</h3>
      {children}
    </section>
  );
}

function GgufSliderRow({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
  lowLabel,
  highLabel,
}: {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  lowLabel: string;
  highLabel: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-content-primary">{label}</p>
        <span className="text-xs font-mono text-ark-blue-300 tabular-nums shrink-0">{valueLabel}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full mt-1 accent-ark-blue-400"
      />
      <div className="flex justify-between text-[10px] text-content-tertiary uppercase tracking-wide">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
  disabled,
  bare,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  /** When true, skip outer card chrome (for use inside a parent card). */
  bare?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 min-w-0 ${bare ? '' : 'p-4 ark-card'} ${disabled ? 'opacity-70' : ''}`}>
      <div className="flex-1 min-w-0 pr-2">
        <p className="text-sm font-medium text-content-primary">{label}</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={`relative rounded-full transition-colors shrink-0 disabled:cursor-not-allowed ${value ? 'bg-sky-500' : 'bg-ark-navy-700'}`}
        style={{ height: '22px', width: '40px' }}
        aria-pressed={value}
        aria-label={label}
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

function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="ark-card p-4">
      <p className="text-xs text-content-tertiary">{title}</p>
      <p className="text-sm font-medium text-content-primary mt-1">{value}</p>
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
