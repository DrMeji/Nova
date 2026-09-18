import { useEffect, useMemo, useRef, useState } from 'react';
import { SettingsGeneral } from '@/components/SettingsGeneral';
import { SettingsModels } from '@/components/SettingsModels';
import { SettingsPrivacy } from '@/components/SettingsPrivacy';
import { SettingsAdvanced } from '@/components/SettingsAdvanced';
import type { SettingsSharedCtx } from '@/components/SettingsShared';

import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useRouter } from '@/context/RouterContext';
import {
  getLocalPrefs,
  getProviderApiKeys,
  setLocalPrefs,
  setProviderApiKey,
  type AccentPref,
  type AiModePref,
  type DensityPref,
  type LocalPrefs,
} from '@/lib/localPrefs';
import { NOVA_CHANGELOG } from '@/lib/changelog';
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
import {
  getEnabledSkillIds,
  listBuiltinSkillPacks,
  toggleSkillEnabled,
  type BuiltinNovaSkillId,
} from '@/lib/novaSkills';
import { isArkDevSession } from '@/lib/arkRuntime';
import { getBrainUrl } from '@/lib/brainUrl';
import { SettingsSystemHealth } from '@/components/SettingsSystemHealth';
import { BrandMark, StatusCheck } from '@/components/BrandMark';
import { VoiceSettingsPanel } from '@/components/VoiceSettingsPanel';
import { useSocial } from '@/context/SocialContext';
import { supabase } from '@/lib/supabase';

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
  const [enabledSkills, setEnabledSkills] = useState<BuiltinNovaSkillId[]>(() => getEnabledSkillIds());
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
  const [brainProfileReason, setBrainProfileReason] = useState('');
  const [userDataProfile, setUserDataProfile] = useState('');
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
    if (activeSection !== 'hardware' && activeSection !== 'ai') return;
    void getEngineStatus().then(setEngineStatus).catch(() => undefined);
    void engineDiskSpace().then(setDiskSpace).catch(() => undefined);
  }, [activeSection]);

  useEffect(() => {
    if (activeSection !== 'hardware') return;
    void import('@/lib/brainProfile').then((m) =>
      m.getBrainProfile(true).then((p) => setBrainProfileReason(p.reason)),
    );
  }, [activeSection, hw]);

  useEffect(() => {
    const syncSkills = () => setEnabledSkills(getEnabledSkillIds());
    syncSkills();
    window.addEventListener('NOVA:skills-changed', syncSkills);
    return () => window.removeEventListener('NOVA:skills-changed', syncSkills);
  }, []);

  useEffect(() => {
    void window.arkDesktop?.appMeta?.()
      .then(meta => {
        if (meta?.version) setAppVersion(meta.version);
        if (meta?.userDataProfile) setUserDataProfile(String(meta.userDataProfile));
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
        // Do not wipe avatar_url on rename — only update the display name.
        await supabase.from('profiles').upsert({
          id: user.id,
          display_name: name,
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

  const visibleChangelog = NOVA_CHANGELOG.filter(entry => {
    // Beta channel removed from Settings — stable entries only.
    if (entry.channel !== 'stable') return false;
    return entry.version === appVersion;
  }).slice(0, 1);

  const navSections = useMemo(() => SECTIONS, []);


  const settingsCtx: SettingsSharedCtx = {
    activeSection,
    displayName, setDisplayName, saveDisplayName,
    user, profile, setArkCopied, arkCopied,
    flashSaved, setSavedFlash, deleteAccountBusy, setDeleteAccountBusy, deleteAccountMsg, setDeleteAccountMsg,
    deleteConfirmOpen, setDeleteConfirmOpen,
    scheduleAccountDeletion, cancelAccountDeletion, signOut,
    theme, setTheme, prefs, patchPrefs,
    enabledSkills, setEnabledSkills, featureTick,
    engineStatus, diskSpace, brainUrl, brainContractVersion, secretsEncrypted,
    aiMode, keepLocal, allowSync, diagnostics,
    providerKeys, setProviderKeys, editingProvider, setEditingProvider,
    keyDraft, setKeyDraft, keyTestMsg, setKeyTestMsg, keyTestFor, setKeyTestFor,
    showLegacyProviders, setShowLegacyProviders, keyedCount,
    hw, setHw, hwScanning, setHwScanning, hwFlash, setHwFlash, brainProfileReason, setBrainProfileReason,
    userDataProfile,
    localReports, setLocalReports, cacheBusy, runClearChatCache, runClearAppCaches,
    installedModels, modelUsedGb, modelPercent, diskTotalGb, diskUsedGb, diskUsedPercent,
    deletingModelId, runDeleteModel, refreshStorage,
    pinNew, setPinNew, pinConfirm, setPinConfirm, pinMsg, setPinMsg,
    twoFaNew, setTwoFaNew, twoFaConfirm, setTwoFaConfirm, twoFaMsg, setTwoFaMsg,
    checkingUpdates, downloadingUpdate, updateMsg, updateInfo, updatePercent, appVersion,
    checkForUpdates, downloadUpdate, visibleChangelog, signingStatus,
    navigate, onClose, settings, updateSettings, blockedUsers, unblockFriend, refreshBlocked,
  };


  return (
    <div ref={settingsRootRef} className="flex h-full min-h-0 min-w-0 animate-fade-in bg-ark-navy-900">
      <div className={`${navCompact ? 'w-14' : 'w-60'} shrink-0 border-r border-surface-border flex flex-col min-h-0 min-w-0 bg-ark-navy-900`}>
        <nav className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2.5 sm:p-3 flex flex-col gap-1 ${navCompact ? 'items-center' : ''}`}>
          {navSections.map(section => (
            <button
              key={section.id}
              type="button"
              disabled={Boolean(section.disabled || section.comingSoon)}
              onClick={() => {
                if (section.disabled || section.comingSoon) return;
                setActiveSection(section.id);
              }}
              className={`settings-nav-item w-full ${navCompact ? 'settings-nav-item-compact' : ''} ${activeSection === section.id ? 'active' : ''} ${
                section.disabled || section.comingSoon ? 'opacity-45 cursor-not-allowed pointer-events-none' : ''
              }`}
              title={section.comingSoon ? `${section.label} · coming soon` : section.disabled ? 'Locked' : section.label}
            >
              <section.icon className="w-[1.125rem] h-[1.125rem] shrink-0" strokeWidth={1.75} />
              {!navCompact && <span className="flex-1 text-left truncate text-[13px] leading-snug">{section.label}</span>}
              {!navCompact && section.comingSoon ? (
                <span className="text-[9px] uppercase tracking-wide text-content-tertiary">Coming soon</span>
              ) : !navCompact && section.disabled ? (
                <Lock className="w-3.5 h-3.5 ml-auto shrink-0 opacity-70" />
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
          {(['account','appearance','ai','voice'].includes(activeSection)) && (
            <SettingsGeneral ctx={settingsCtx} />
          )}
          {(['models','providers','hardware'].includes(activeSection)) && (
            <SettingsModels ctx={settingsCtx} />
          )}
          {(['privacy','security'].includes(activeSection)) && (
            <SettingsPrivacy ctx={settingsCtx} />
          )}
          {(['storage','projects','updates'].includes(activeSection)) && (
            <SettingsAdvanced ctx={settingsCtx} />
          )}
        </div>
      </div>
    </div>
  );
}

