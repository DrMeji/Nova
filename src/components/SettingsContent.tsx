import { useEffect, useMemo, useState } from 'react';
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
  Smartphone, Bell, Sparkles, FlaskConical,
  Mail, BadgeCheck, Trash2, Download, Info, Monitor,
} from 'lucide-react';

const SECTIONS: { id: string; label: string; icon: typeof User; disabled?: boolean }[] = [
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
  { id: 'testers', label: 'Testers', icon: FlaskConical },
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

export function SettingsContent() {
  const { user, profile, settings, updateSettings, signOut, refreshProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const { navigate } = useRouter();
  const [activeSection, setActiveSection] = useState('account');
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

  useEffect(() => {
    void window.arkDesktop?.appMeta?.()
      .then(meta => {
        if (meta?.version) setAppVersion(meta.version);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    void getAccurateHardware().then(info => setHw(info));
  }, []);

  useEffect(() => {
    void window.arkDesktop?.loginItemGet?.()
      .then((s) => {
        if (typeof s?.openAtLogin === 'boolean') {
          setPrefs(prev => {
            if (prev.launchOnStartup === s.openAtLogin) return prev;
            return setLocalPrefs({ launchOnStartup: s.openAtLogin });
          });
        } else if (getLocalPrefs().launchOnStartup) {
          void window.arkDesktop?.loginItemSet?.(true);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const unsub = window.arkDesktop?.onUpdateProgress?.((payload) => {
      if (typeof payload?.percent === 'number') setUpdatePercent(payload.percent);
      if (payload?.message) setUpdateMsg(payload.message);
      if (payload?.status === 'downloading' || payload?.status === 'installing') {
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
    window.setTimeout(() => setSavedFlash(''), 1600);
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

  const visibleChangelog = ARK_CHANGELOG.filter(entry =>
    prefs.updateChannel === 'beta' ? true : entry.channel === 'stable',
  );

  return (
    <div className="flex h-full min-h-0 animate-fade-in">
      <div className="w-56 shrink-0 border-r border-surface-border p-3 overflow-auto">
        <nav className="flex flex-col gap-0.5">
          {SECTIONS.map(section => (
            <button
              key={section.id}
              type="button"
              disabled={Boolean(section.disabled)}
              onClick={() => {
                if (section.disabled) return;
                setActiveSection(section.id);
              }}
              className={`ark-nav-item ${activeSection === section.id ? 'active' : ''} ${
                section.disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''
              }`}
              title={section.disabled ? 'Coming later' : undefined}
            >
              <section.icon className="w-4 h-4 shrink-0" />
              <span>{section.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 overflow-auto p-8 min-h-0">
        <div className="max-w-2xl">
          {savedFlash && (
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 text-emerald-400 px-3 py-1 text-[11px]">
              <Check className="w-3 h-3" />
              {savedFlash}
            </div>
          )}

          {activeSection === 'account' && (
            <SettingsSection title="Account" description="Profile, sign in, and session controls">
              <div className="space-y-5">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-ark-blue-500/20 border border-ark-blue-500/30 flex items-center justify-center text-xl font-bold text-ark-blue-300">
                    {(displayName || profile?.display_name || user?.email || '?')[0].toUpperCase()}
                  </div>
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
                <Field label="Email" value={user?.email ?? 'guest@ark.local'} onChange={() => {}} disabled />
                <Field label="Account ID" value={user?.id ?? 'guest-local'} onChange={() => {}} disabled />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InfoCard
                    title="Plan"
                    value="Free starter"
                    hint="Local AI included · cloud keys optional"
                  />
                  <InfoCard
                    title="Devices"
                    value="This PC"
                    hint="Multi device sync arrives with cloud sync"
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
                  <div className="grid grid-cols-2 gap-3">
                    <ThemeCard label="Dark" active={theme === 'dark'} onClick={() => setTheme('dark')} />
                    <ThemeCard label="Cream" active={theme === 'light'} onClick={() => setTheme('light')} />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-content-secondary mb-2">Accent</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                  <div className="grid grid-cols-2 gap-2">
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
                  </div>
                  <Sparkles className="w-4 h-4 text-sky-400" />
                </div>

                <div className="space-y-3">
                  <label className="block text-xs font-medium text-content-secondary">Preferred mode</label>
                  {AI_MODES.map(mode => (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => {
                        patchPrefs({ aiMode: mode.value as AiModePref });
                        if (settings) updateSettings({ ai_mode: mode.value as typeof settings.ai_mode });
                      }}
                      className={`w-full text-left p-4 rounded-lg border transition-all ${
                        aiMode === mode.value
                          ? 'border-ark-blue-400 bg-ark-blue-500/10'
                          : 'border-surface-border hover:border-surface-border-light'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className={`text-sm font-medium ${aiMode === mode.value ? 'text-ark-blue-300' : 'text-content-primary'}`}>
                            {mode.label}
                          </p>
                          <p className="text-xs text-content-tertiary mt-0.5">{mode.description}</p>
                        </div>
                        {aiMode === mode.value && <Check className="w-4 h-4 text-ark-blue-400 shrink-0" />}
                      </div>
                    </button>
                  ))}
                </div>

                <ToggleRow
                  label="Auto failover"
                  description="If a provider is limited or offline, switch to the next healthy option"
                  value={prefs.autoFailover}
                  onChange={v => patchPrefs({ autoFailover: v })}
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
              </div>
            </SettingsSection>
          )}

          {activeSection === 'models' && (
            <SettingsSection title="Models" description="Default model for new chats and builds">
              <div className="space-y-3">
                {DEFAULT_MODELS.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => patchPrefs({ defaultModelId: m.id })}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                      prefs.defaultModelId === m.id
                        ? 'border-ark-blue-400 bg-ark-blue-500/10'
                        : 'border-surface-border hover:border-surface-border-light'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-content-primary truncate">{m.label}</p>
                        <p className="text-xs text-content-tertiary mt-0.5">{m.detail}</p>
                      </div>
                      {prefs.defaultModelId === m.id && <Check className="w-4 h-4 text-ark-blue-400 shrink-0" />}
                    </div>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => navigate({ name: 'models' })}
                  className="ark-btn-secondary w-full mt-2"
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
              <div className="space-y-4">
                <div className="ark-card p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-ark-blue-500/10 flex items-center justify-center shrink-0">
                    <Cloud className="w-5 h-5 text-ark-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-content-primary">Cloud connections</p>
                    <p className="text-xs text-content-secondary">
                      {keyedCount} API key{keyedCount === 1 ? '' : 's'} saved locally
                    </p>
                  </div>
                  <KeyRound className="w-4 h-4 text-content-tertiary" />
                </div>

                <div className="space-y-2">
                  {PROVIDER_ROWS.map(p => {
                    const hasKey = Boolean(providerKeys[p.id]);
                    const editing = editingProvider === p.id;
                    return (
                      <div key={p.id} className="rounded-xl border border-surface-border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-content-primary">{p.name}</p>
                            <p className="text-xs text-content-tertiary">{p.hint}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {hasKey && (
                              <span className="text-[10px] rounded-full bg-emerald-500/15 text-emerald-400 px-2 py-0.5">
                                Key saved
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingProvider(editing ? null : p.id);
                                setKeyDraft(providerKeys[p.id] ?? '');
                              }}
                              className="text-xs text-sky-400 hover:text-sky-300"
                            >
                              {editing ? 'Close' : hasKey ? 'Edit' : 'Add key'}
                            </button>
                          </div>
                        </div>
                        {editing && (
                          <div className="mt-3 space-y-2">
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
                                  setProviderApiKey(p.id, keyDraft);
                                  setProviderKeys(getProviderApiKeys());
                                  setEditingProvider(null);
                                  setKeyDraft('');
                                  setSavedFlash('Key saved on this device');
                                  window.setTimeout(() => setSavedFlash(''), 1600);
                                }}
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

                <div className="rounded-xl border border-surface-border p-4 space-y-3">
                  <div>
                    <p className="text-sm font-medium text-content-primary">Plugin OAuth client IDs</p>
                    <p className="text-xs text-content-tertiary mt-0.5 leading-relaxed">
                      Register OAuth apps once, paste the public client ids here, then use one-click sign-in in Build.
                      Client secrets stay in env only (`ARK_GOOGLE_CLIENT_SECRET`).
                    </p>
                  </div>
                  {(['github', 'google'] as const).map(id => (
                    <OAuthClientRow key={id} pluginId={id} onSaved={(msg) => {
                      setSavedFlash(msg);
                      window.setTimeout(() => setSavedFlash(''), 1600);
                    }} />
                  ))}
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
                  description="Sync project metadata across your devices when signed in"
                  value={allowSync}
                  onChange={v => {
                    patchPrefs({ allowCloudSync: v });
                    if (settings) updateSettings({ allow_cloud_sync: v });
                  }}
                />
                <ToggleRow
                  label="Send anonymous diagnostics"
                  description="Help improve ARK with crash and performance signals"
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
                <button type="button" className="ark-btn-secondary w-full !text-ark-accent-red mt-2">
                  <Trash2 className="w-4 h-4" />
                  Clear local chat cache
                </button>
              </div>
            </SettingsSection>
          )}

          {activeSection === 'storage' && (
            <SettingsSection title="Storage" description="Models, projects, and cache on this PC">
              <div className="space-y-4">
                <StorageBar label="Model storage" used="6.7 GB" total="20 GB" percent={34} tone="bg-sky-500" />
                <StorageBar label="Project storage" used="124 MB" total="10 GB" percent={5} tone="bg-emerald-500" />
                <StorageBar label="Cache and temp" used="890 MB" total="5 GB" percent={18} tone="bg-amber-500" />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InfoCard title="Installed models" value="3" hint="Managed in Local AI" />
                  <InfoCard title="Cached previews" value="12" hint="Safe to clear anytime" />
                </div>

                <div className="flex flex-wrap gap-2">
                  <button type="button" className="ark-btn-secondary">
                    <Trash2 className="w-4 h-4" />
                    Clear cache
                  </button>
                  <button type="button" className="ark-btn-secondary" onClick={() => navigate({ name: 'local-ai' })}>
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
                    <span className="text-content-primary text-right">{hw.os}</span>
                  </div>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-content-secondary">CPU</span>
                    <span className="text-content-primary text-right">{hw.cpu}</span>
                  </div>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-content-secondary">RAM</span>
                    <span className="text-content-primary text-right">{hw.ram}</span>
                  </div>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-content-secondary">GPU</span>
                    <span className="text-content-primary text-right">{hw.gpu}</span>
                  </div>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-content-secondary">Acceleration</span>
                    <span className="text-content-primary text-right">{hw.acceleration}</span>
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
                      window.setTimeout(() => setHwFlash(''), 2000);
                    });
                  }}
                >
                  <RefreshCw className={`w-4 h-4 ${hwScanning ? 'animate-spin' : ''}`} />
                  {hwScanning ? 'Scanning…' : 'Rescan hardware'}
                </button>
                {hwFlash && <p className="text-xs text-emerald-400">{hwFlash}</p>}
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
                <Field
                  label="Preferred language"
                  value={prefs.preferredLanguage}
                  onChange={v => patchPrefs({ preferredLanguage: v })}
                />

                <div>
                  <label className="block text-xs font-medium text-content-secondary mb-2">Default project type</label>
                  <div className="grid grid-cols-3 gap-2">
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
            <SettingsSection title="Security" description="Protect this account and keep agent work sandboxed">
              <div className="space-y-4">
                <div className="rounded-xl border border-surface-border p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center shrink-0">
                      <Smartphone className="w-5 h-5 text-sky-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-content-primary">Two-factor authentication</p>
                      <p className="text-xs text-content-tertiary mt-0.5">Not available yet.</p>
                    </div>
                  </div>
                </div>

                <ToggleRow
                  label="Require PIN on launch"
                  description="Ask for a local PIN before opening ARK on this PC"
                  value={prefs.requirePinOnLaunch}
                  onChange={v => patchPrefs({ requirePinOnLaunch: v })}
                />

                <div className="ark-card p-4">
                  <label className="block text-xs font-medium text-content-secondary mb-2">Auto lock</label>
                  <div className="flex flex-wrap gap-2">
                    {[5, 15, 30, 60].map(mins => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => patchPrefs({ autoLockMinutes: mins })}
                        className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                          prefs.autoLockMinutes === mins
                            ? 'bg-surface-hover text-content-primary'
                            : 'text-content-tertiary hover:text-content-secondary'
                        }`}
                      >
                        {mins} min
                      </button>
                    ))}
                  </div>
                </div>

                <ToggleRow
                  label="Sandbox agent actions"
                  description="Keep file and terminal actions inside the open project"
                  value={prefs.sandboxAgent}
                  onChange={v => patchPrefs({ sandboxAgent: v })}
                />

                <div className="flex items-center gap-3 p-4 ark-card">
                  <div className="w-9 h-9 rounded-lg bg-ark-accent-green/10 flex items-center justify-center shrink-0">
                    <Lock className="w-4 h-4 text-ark-accent-green" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-content-primary">Credential storage</p>
                    <p className="text-xs text-content-tertiary">API keys stored locally on this device</p>
                  </div>
                  <span className="text-xs text-ark-accent-green">Active</span>
                </div>
              </div>
            </SettingsSection>
          )}

          {activeSection === 'updates' && (
            <SettingsSection title="Updates" description="Download new builds inside ARK — no browser needed">
              <div className="space-y-5">
                <div className="ark-card p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
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
                    <div className="flex items-center gap-2 shrink-0">
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
                          className="ark-btn-primary"
                        >
                          {downloadingUpdate ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                          {downloadingUpdate ? 'Updating…' : 'Update'}
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-content-tertiary leading-relaxed">
                    Download finishes in ARK, then a black Updating window installs and reopens the app (no PowerShell).
                  </p>
                </div>

                <ToggleRow
                  label="Launch ARK when Windows starts"
                  description="Open ARK automatically after you sign in to this PC"
                  value={prefs.launchOnStartup}
                  onChange={v => {
                    patchPrefs({ launchOnStartup: v });
                    void window.arkDesktop?.loginItemSet?.(v);
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
                    {visibleChangelog.map(entry => (
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
                          {entry.notes.map(note => (
                            <li key={note} className="text-xs text-content-secondary flex gap-2">
                              <span className="text-content-tertiary">·</span>
                              <span>{note}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-[11px] text-content-tertiary leading-relaxed">
                  Changelog updates here whenever we ship meaningful product changes.
                </p>

                <div className="rounded-xl border border-surface-border p-4 space-y-2">
                  <p className="text-sm font-medium text-content-primary">Install signing</p>
                  <p className="text-xs text-content-tertiary leading-relaxed">
                    Buy an Authenticode cert (DigiCert, Sectigo, SSL.com), export a .pfx, then before packaging:
                  </p>
                  <ol className="text-[11px] text-content-tertiary space-y-1 list-decimal list-inside leading-relaxed">
                    <li>Buy Authenticode (OV or EV) from DigiCert / Sectigo / SSL.com</li>
                    <li>Set CSC_LINK to the .pfx path and CSC_KEY_PASSWORD</li>
                    <li>Optional CI: add CSC_LINK + CSC_KEY_PASSWORD secrets on DrMeji/Ark for signed tag builds</li>
                    <li>Confirm with “Check this install’s signature” on the packaged app</li>
                  </ol>
                  <p className="text-[11px] text-content-tertiary leading-relaxed">
                    SmartScreen reputation builds after signed installs accumulate. EV usually clears “unknown publisher”
                    faster than OV. Dev builds show n/a — use a packaged install to verify. Notes: build/signing.env.example
                  </p>
                  <button
                    type="button"
                    className="ark-btn-secondary text-xs"
                    onClick={() => {
                      void window.arkDesktop?.signingStatus?.().then((s) => {
                        setUpdateMsg(
                          s?.status
                            ? `Signing status: ${s.status}${s.signed ? ' (trusted)' : ''}${s.packaged === false ? ' · unpackaged/dev' : ''}`
                            : 'Signing check unavailable in this build.',
                        );
                      });
                    }}
                  >
                    Check this install’s signature
                  </button>
                </div>

                <div className="rounded-xl border border-surface-border p-4 space-y-2">
                  <p className="text-sm font-medium text-content-primary">Local failure reports</p>
                  <p className="text-xs text-content-tertiary leading-relaxed">
                    Update/install errors are saved only on this PC — never uploaded.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="ark-btn-secondary text-xs"
                      onClick={() => void window.arkDesktop?.localReportsOpen?.()}
                    >
                      Open reports folder
                    </button>
                    <button
                      type="button"
                      className="ark-btn-secondary text-xs"
                      onClick={() => {
                        void window.arkDesktop?.localReportsClear?.().then(() => {
                          setUpdateMsg('Local reports cleared.');
                        });
                      }}
                    >
                      Clear reports
                    </button>
                  </div>
                </div>
              </div>
            </SettingsSection>
          )}

          {activeSection === 'testers' && (
            <SettingsSection
              title="For testers"
              description="Quick path to a first real reply, then tell us what to improve"
            >
              <div className="space-y-3">
                <div className="rounded-xl border border-surface-border p-4 space-y-2">
                  <p className="text-sm font-medium text-content-primary">First successful chat</p>
                  <ol className="text-xs text-content-tertiary space-y-1.5 list-decimal list-inside leading-relaxed">
                    <li>Connect a free key (Settings → Providers or the Chat “Connect free key” link), or</li>
                    <li>Open Local AI → Install recommended (~1 GB) → wait until it says ready</li>
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
        </div>
      </div>
    </div>
  );
}

function SettingsSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="animate-fade-in">
      <h1 className="text-xl font-bold text-content-primary mb-1">{title}</h1>
      <p className="text-sm text-content-secondary mb-6">{description}</p>
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
          steps: 'New OAuth App → any Homepage URL → Device Flow enabled → copy Client ID',
          env: 'ARK_GITHUB_CLIENT_ID',
        }
      : {
          label: 'Google',
          url: 'https://console.cloud.google.com/apis/credentials',
          steps: 'OAuth client (Desktop or Web) → copy Client ID; set ARK_GOOGLE_CLIENT_SECRET in env',
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
            void window.arkDesktop?.pluginOAuthSetClient?.(pluginId, value).then(() => {
              onSaved(`${pluginId} client id saved`);
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
    <div className="flex items-center justify-between p-4 ark-card">
      <div className="flex-1 mr-4">
        <p className="text-sm font-medium text-content-primary">{label}</p>
        <p className="text-xs text-content-tertiary mt-0.5">{description}</p>
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
    <div className="ark-card p-4">
      <div className="flex justify-between mb-2">
        <span className="text-sm text-content-primary">{label}</span>
        <span className="text-xs text-content-tertiary">{used} / {total}</span>
      </div>
      <div className="h-2 bg-ark-navy-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
