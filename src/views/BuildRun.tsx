import { useMemo, useState } from 'react';
import {
  Search, Plus, Check, X, KeyRound, Shield, MessageSquare,
  Link2, Unplug, ChevronRight, Loader2, ExternalLink,
} from 'lucide-react';
import {
  PLUGIN_CATALOG,
  PLUGIN_CATEGORIES,
  getChatEnabledPlugins,
  getInstalledPlugins,
  getPluginById,
  getPluginRuntime,
  isPluginLive,
  loadPluginState,
  upsertPluginRuntime,
  type PluginDef,
  type PluginPermission,
  type PluginStateMap,
} from '@/lib/plugins';
import { verifyGitHubToken } from '@/lib/github';
import { verifyNotionToken } from '@/lib/notion';
import { verifyGmailToken } from '@/lib/gmail';
import { verifySlackToken } from '@/lib/slack';
import { verifyLinearToken } from '@/lib/linear';
import { verifyFigmaToken } from '@/lib/figma';
import { verifyVercelToken } from '@/lib/vercel';
import { verifyDiscordToken } from '@/lib/discord';
import { verifyDriveToken } from '@/lib/gdrive';
import { verifyCalendarToken } from '@/lib/gcal';
import { openInSystemBrowser } from '@/lib/openExternal';
import { getPluginAuthLink } from '@/lib/pluginAuth';

export function BuildRun() {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<PluginStateMap>(() => loadPluginState());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connectStep, setConnectStep] = useState<'idle' | 'auth' | 'permissions'>('idle');
  const [tokenDraft, setTokenDraft] = useState('');
  const [permDraft, setPermDraft] = useState<PluginPermission[]>([]);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [verifiedLogin, setVerifiedLogin] = useState('');

  const selected = selectedId ? getPluginById(selectedId) ?? null : null;
  const selectedRuntime = selectedId ? getPluginRuntime(selectedId, state) : null;

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PLUGIN_CATEGORIES.map(cat => ({
      ...cat,
      plugins: PLUGIN_CATALOG.filter(p => {
        if (p.category !== cat.id) return false;
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q)
          || p.description.toLowerCase().includes(q)
          || cat.title.toLowerCase().includes(q)
        );
      }),
    })).filter(cat => cat.plugins.length > 0);
  }, [query]);

  const installedPlugins = useMemo(() => getInstalledPlugins(state), [state]);
  const chatPlugins = useMemo(() => getChatEnabledPlugins(state), [state]);

  const patch = (id: string, next: Parameters<typeof upsertPluginRuntime>[2]) => {
    setState(prev => upsertPluginRuntime(prev, id, next));
  };

  const openPlugin = (plugin: PluginDef) => {
    setSelectedId(plugin.id);
    setConnectStep('idle');
    setTokenDraft(getPluginRuntime(plugin.id, state).token ?? '');
    setPermDraft(getPluginRuntime(plugin.id, state).permissions);
    setAuthError('');
    setVerifiedLogin(getPluginRuntime(plugin.id, state).accountLabel ?? '');
    setAuthBusy(false);
  };

  const closePanel = () => {
    setSelectedId(null);
    setConnectStep('idle');
    setTokenDraft('');
    setAuthError('');
    setVerifiedLogin('');
    setAuthBusy(false);
  };

  const install = (id: string) => {
    const plugin = getPluginById(id);
    if (!plugin) return;
    patch(id, {
      installed: true,
      permissions: plugin.permissions.filter(p => p.required).map(p => p.id),
    });
    openPlugin(plugin);
  };

  const uninstall = (id: string) => {
    patch(id, {
      installed: false,
      connected: false,
      enabledInChat: false,
      token: undefined,
      accountLabel: undefined,
      connectedAt: undefined,
    });
    closePanel();
  };

  const startConnect = () => {
    if (!selected) return;
    if (!isPluginLive(selected.id)) {
      setAuthError('Coming soon — not connected to a live API yet.');
      return;
    }
    setPermDraft(
      selectedRuntime?.permissions?.length
        ? selectedRuntime.permissions
        : selected.permissions.filter(p => p.required).map(p => p.id),
    );
    if (selected.authKind === 'none') {
      setConnectStep('permissions');
      return;
    }
    setConnectStep('auth');
  };

  const finishConnect = () => {
    if (!selected) return;
    if (!isPluginLive(selected.id)) {
      setAuthError('Coming soon — not connected to a live API yet.');
      return;
    }
    if (selected.authKind !== 'none' && !tokenDraft.trim() && !selectedRuntime?.token) {
      setAuthError('Paste a valid token, then continue.');
      setConnectStep('auth');
      return;
    }
    const required = selected.permissions.filter(p => p.required).map(p => p.id);
    const granted = Array.from(new Set([...required, ...permDraft]));
    patch(selected.id, {
      installed: true,
      connected: true,
      enabledInChat: true,
      permissions: granted,
      token: tokenDraft.trim() || selectedRuntime?.token,
      accountLabel: verifiedLogin || selectedRuntime?.accountLabel,
      connectedAt: new Date().toISOString(),
    });
    setConnectStep('idle');
    setTokenDraft('');
    setAuthError('');
  };

  const continueFromAuth = async () => {
    if (!selected) return;
    setAuthError('');

    if (!isPluginLive(selected.id)) {
      setAuthError('Coming soon — not connected to a live API yet.');
      return;
    }

    if (!tokenDraft.trim()) {
      setAuthError('Paste a token to verify.');
      return;
    }

    setAuthBusy(true);
    try {
      if (selected.id === 'github') {
        const user = await verifyGitHubToken(tokenDraft);
        setVerifiedLogin(user.login);
      } else if (selected.id === 'notion') {
        const user = await verifyNotionToken(tokenDraft);
        setVerifiedLogin(user.label);
      } else if (selected.id === 'gmail') {
        const user = await verifyGmailToken(tokenDraft);
        setVerifiedLogin(user.label);
      } else if (selected.id === 'slack') {
        const user = await verifySlackToken(tokenDraft);
        setVerifiedLogin(user.label);
      } else if (selected.id === 'linear') {
        const user = await verifyLinearToken(tokenDraft);
        setVerifiedLogin(user.label);
      } else if (selected.id === 'vercel') {
        const user = await verifyVercelToken(tokenDraft);
        setVerifiedLogin(user.label);
      } else if (selected.id === 'discord') {
        const user = await verifyDiscordToken(tokenDraft);
        setVerifiedLogin(user.label);
      } else if (selected.id === 'figma') {
        const user = await verifyFigmaToken(tokenDraft);
        setVerifiedLogin(user.label);
      } else if (selected.id === 'gdrive') {
        const user = await verifyDriveToken(tokenDraft);
        setVerifiedLogin(user.label);
      } else if (selected.id === 'gcal') {
        const user = await verifyCalendarToken(tokenDraft);
        setVerifiedLogin(user.label);
      } else {
        setAuthError('Coming soon — not connected to a live API yet.');
        return;
      }
      setConnectStep('permissions');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : `Could not verify ${selected.name} token`);
    } finally {
      setAuthBusy(false);
    }
  };

  const startBrowserOAuth = async () => {
    if (!selected || !window.arkDesktop?.pluginOAuthStart) {
      setAuthError('Browser OAuth needs the desktop app.');
      return;
    }
    setAuthBusy(true);
    setAuthError('');
    try {
      const result = await window.arkDesktop.pluginOAuthStart(selected.id);
      if (result?.ok && result.accessToken) {
        setTokenDraft(result.accessToken);
        setVerifiedLogin(result.accountLabel || selected.name);
        setConnectStep('permissions');
        return;
      }
      setAuthError(result?.message || 'OAuth did not complete. Paste a token instead.');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'OAuth failed');
    } finally {
      setAuthBusy(false);
    }
  };

  const disconnect = () => {
    if (!selected) return;
    patch(selected.id, {
      connected: false,
      enabledInChat: false,
      token: undefined,
      accountLabel: undefined,
      connectedAt: undefined,
    });
    setVerifiedLogin('');
    setConnectStep('idle');
  };

  const togglePerm = (id: PluginPermission, required?: boolean) => {
    if (required) return;
    setPermDraft(prev => (prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]));
  };

  return (
    <div className="h-full flex flex-col overflow-hidden animate-fade-in bg-ark-navy-950 relative">
      <div className="shrink-0 px-6 pt-[min(12vh,6rem)] bg-ark-navy-950">
        <div className="w-full max-w-4xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-semibold text-content-primary tracking-tight">Plugins</h1>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-surface-hover px-3.5 py-2 w-52 sm:w-64 shrink-0">
              <Search className="w-4 h-4 text-content-tertiary shrink-0" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search plugins"
                className="flex-1 bg-transparent border-none text-sm text-content-primary placeholder:text-content-tertiary focus:outline-none min-w-0"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-10">
        <div className="w-full max-w-4xl mx-auto">
          {!query && (
            <>
              <section className="mb-8">
                <h2 className="text-base font-semibold text-content-primary mb-3">Suggested</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {PLUGIN_CATALOG.filter(p => p.hero).map(plugin => {
                    const runtime = getPluginRuntime(plugin.id, state);
                    return (
                      <button
                        key={plugin.id}
                        type="button"
                        onClick={() => openPlugin(plugin)}
                        className="text-left rounded-xl border border-surface-border hover:bg-surface-hover/70 px-3 py-3 transition-colors"
                      >
                        <span className="flex items-center gap-2.5">
                          <span className={`w-9 h-9 rounded-xl bg-gradient-to-br ${plugin.tone} flex items-center justify-center text-[10px] font-bold text-white shrink-0`}>
                            {plugin.initial}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-content-primary">{plugin.name}</span>
                            <span className="block text-[11px] text-content-tertiary truncate">
                              {!isPluginLive(plugin.id)
                                ? 'Coming soon'
                                : !runtime.installed
                                  ? 'Not added yet'
                                  : !runtime.connected
                                    ? 'Added · connect account'
                                    : runtime.enabledInChat
                                      ? 'Connected · in chat'
                                      : 'Connected'}
                            </span>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="mb-10">
                <h2 className="text-base font-semibold text-content-primary mb-2">Your library</h2>
                {chatPlugins.length > 0 && (
                  <p className="text-xs text-content-tertiary mb-3">
                    In chat: {chatPlugins.map(p => p.name).join(', ')}
                  </p>
                )}
                {installedPlugins.length === 0 ? (
                  <p className="text-sm text-content-tertiary">Nothing added yet — pick a plugin above to start.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {installedPlugins.map(plugin => {
                      const runtime = getPluginRuntime(plugin.id, state);
                      return (
                        <button
                          key={plugin.id}
                          type="button"
                          onClick={() => openPlugin(plugin)}
                          title={plugin.name}
                          className={`relative w-10 h-10 rounded-xl bg-gradient-to-br ${plugin.tone} flex items-center justify-center text-xs font-bold text-white shadow-sm`}
                        >
                          {plugin.initial}
                          {runtime.connected && (
                            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-ark-navy-950" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}

          <div className="space-y-10">
            {filteredCategories.map(category => (
              <section key={category.id}>
                <h2 className="text-base font-semibold text-content-primary mb-4">{category.title}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                  {category.plugins.map(plugin => {
                    const runtime = getPluginRuntime(plugin.id, state);
                    return (
                      <button
                        key={`${category.id}-${plugin.id}`}
                        type="button"
                        onClick={() => openPlugin(plugin)}
                        className="flex items-center gap-3 py-3 rounded-xl px-1 text-left hover:bg-surface-hover/50 transition-colors"
                      >
                        <span className={`w-10 h-10 rounded-xl bg-gradient-to-br ${plugin.tone} flex items-center justify-center text-xs font-bold text-white shrink-0`}>
                          {plugin.initial}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium text-content-primary truncate">{plugin.name}</span>
                            {isPluginLive(plugin.id) ? (
                              <span className="text-[10px] rounded-full bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 shrink-0">
                                Live
                              </span>
                            ) : (
                              <span className="text-[10px] rounded-full bg-amber-500/15 text-amber-400/90 px-1.5 py-0.5 shrink-0">
                                Coming soon
                              </span>
                            )}
                          </span>
                          <span className="block text-xs text-content-tertiary truncate">{plugin.description}</span>
                        </span>
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                          runtime.installed
                            ? 'bg-surface-hover text-ark-accent-green'
                            : 'text-content-secondary'
                        }`}>
                          {runtime.installed ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}

            {filteredCategories.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <p className="text-base font-semibold text-content-primary mb-1">No plugins found</p>
                <p className="text-sm text-content-tertiary">Try a different search.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {selected && selectedRuntime && (
        <div className="absolute inset-0 z-20 flex items-center justify-end p-4 sm:p-6 bg-ark-navy-950/45 backdrop-blur-[2px]" onClick={closePanel}>
          <aside
            className="w-full max-w-md max-h-[min(92vh,720px)] overflow-hidden rounded-2xl border border-surface-border bg-ark-navy-900 shadow-2xl flex flex-col animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="shrink-0 px-5 py-4 flex items-start justify-between gap-3 border-b border-surface-border">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`w-11 h-11 rounded-xl bg-gradient-to-br ${selected.tone} flex items-center justify-center text-sm font-bold text-white shrink-0`}>
                  {selected.initial}
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-content-primary truncate">{selected.name}</h2>
                  <p className="text-xs text-content-tertiary">
                    {!selectedRuntime.installed
                      ? 'Not added yet'
                      : !selectedRuntime.connected
                        ? 'Added · connect your account'
                        : selectedRuntime.enabledInChat
                          ? selectedRuntime.accountLabel
                            ? selected.id === 'gmail'
                              ? `Connected as ${selectedRuntime.accountLabel} · in chat`
                              : `Connected as @${selectedRuntime.accountLabel} · in chat`
                            : 'Connected · in chat'
                          : selectedRuntime.accountLabel
                            ? selected.id === 'gmail'
                              ? `Connected as ${selectedRuntime.accountLabel}`
                              : `Connected as @${selectedRuntime.accountLabel}`
                            : 'Connected'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closePanel}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-content-tertiary hover:text-content-primary hover:bg-surface-hover"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto px-5 py-5 space-y-5">
              <p className="text-sm text-content-secondary leading-relaxed">{selected.longDescription}</p>
              {selected.id === 'github' && (
                <p className="text-xs text-content-tertiary leading-relaxed rounded-xl border border-surface-border bg-ark-navy-950/50 px-3 py-2.5">
                  Connect a GitHub token here so chat can list repos and PRs. GitHub Desktop on your PC is separate.
                </p>
              )}

              {connectStep === 'idle' && (
                <>
                  <div className="space-y-2">
                    <StepRow done={selectedRuntime.installed} label="Add to ARK" detail={`Save ${selected.name} in your library`} />
                    <StepRow done={selectedRuntime.connected} label="Connect account" detail={`Link your ${selected.name} account`} />
                    <StepRow
                      done={selectedRuntime.connected && selectedRuntime.permissions.length > 0}
                      label="Permissions"
                      detail="Choose what ARK may access"
                    />
                    <StepRow done={selectedRuntime.enabledInChat} label="Use in chat" detail="Show as a tool chip in New Chat" />
                  </div>

                  {selected.hero && selected.actions.length > 0 && selectedRuntime.connected && (
                    <div>
                      <p className="text-xs font-medium text-content-secondary mb-2">Try in chat</p>
                      <div className="space-y-1.5">
                        {selected.actions.map(action => (
                          <div
                            key={action.id}
                            className="rounded-xl border border-surface-border px-3 py-2 text-xs text-content-secondary"
                          >
                            <span className="text-content-primary font-medium">{action.label}</span>
                            <span className="block text-content-tertiary mt-0.5">{action.prompt}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 pt-1">
                    {!isPluginLive(selected.id) ? (
                      <p className="text-sm text-content-tertiary rounded-xl border border-surface-border px-3 py-3">
                        Coming soon — listed for discovery only. Not connected to a live API yet.
                      </p>
                    ) : !selectedRuntime.installed ? (
                      <button type="button" className="ark-btn-primary w-full" onClick={() => install(selected.id)}>
                        <Plus className="w-4 h-4" />
                        Add to ARK
                      </button>
                    ) : !selectedRuntime.connected ? (
                      <button type="button" className="ark-btn-primary w-full" onClick={startConnect}>
                        <Link2 className="w-4 h-4" />
                        Connect {selected.name} account
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="ark-btn-secondary w-full"
                          onClick={() => patch(selected.id, { enabledInChat: !selectedRuntime.enabledInChat })}
                        >
                          <MessageSquare className="w-4 h-4" />
                          {selectedRuntime.enabledInChat ? 'Disable in chat' : 'Enable in chat'}
                        </button>
                        <button type="button" className="ark-btn-secondary w-full" onClick={disconnect}>
                          <Unplug className="w-4 h-4" />
                          Disconnect account
                        </button>
                      </>
                    )}
                    {selectedRuntime.installed && isPluginLive(selected.id) && (
                      <button
                        type="button"
                        className="ark-btn-secondary w-full !text-ark-accent-red"
                        onClick={() => uninstall(selected.id)}
                      >
                        Remove from ARK
                      </button>
                    )}
                    {authError && connectStep === 'idle' && (
                      <p className="text-xs text-ark-accent-red">{authError}</p>
                    )}
                  </div>
                </>
              )}

              {connectStep === 'auth' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-content-primary">
                    <KeyRound className="w-4 h-4 text-sky-400" />
                    Connect with {selected.authKind === 'oauth' ? 'account' : 'token'}
                  </div>
                  {selected.authKind === 'oauth' || selected.authKind === 'token' ? (
                    <>
                      {(() => {
                        const link = getPluginAuthLink(selected.id);
                        return (
                          <>
                            <p className="text-xs text-content-tertiary leading-relaxed">
                              {selected.authKind === 'oauth'
                                ? `Browser-assisted connect: open ${selected.name}, sign in / authorize, then paste the access token below. ARK stores it in the OS vault.`
                                : link.hint}
                            </p>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300"
                              onClick={() => void openInSystemBrowser(link.url)}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              {selected.authKind === 'oauth' ? `Open ${selected.name} in browser` : link.label}
                            </button>
                            {(selected.id === 'github' || selected.id === 'gmail' || selected.authKind === 'oauth') && window.arkDesktop?.pluginOAuthStart && (
                              <button
                                type="button"
                                className="ark-btn-secondary w-full"
                                disabled={authBusy}
                                onClick={() => void startBrowserOAuth()}
                              >
                                {authBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                                {selected.id === 'github'
                                  ? 'Sign in with GitHub (device)'
                                  : `Continue with ${selected.name} OAuth`}
                              </button>
                            )}
                          </>
                        );
                      })()}
                      {['github', 'notion', 'gmail', 'slack', 'linear', 'figma'].includes(selected.id) ? (
                        <>
                          {selected.id === 'github' && (
                            <p className="text-[11px] text-content-tertiary leading-relaxed">
                              Classic token: enable <span className="text-content-secondary">repo</span> and <span className="text-content-secondary">read:user</span>.
                            </p>
                          )}
                          <input
                            type="password"
                            value={tokenDraft}
                            onChange={e => setTokenDraft(e.target.value)}
                            placeholder={
                              selected.id === 'github'
                                ? 'ghp_… or github_pat_…'
                                : selected.id === 'notion'
                                  ? 'secret_… or ntn_…'
                                  : selected.id === 'gmail'
                                    ? 'ya29.… access token'
                                    : selected.id === 'slack'
                                      ? 'xoxb-…'
                                      : selected.id === 'linear'
                                        ? 'lin_api_…'
                                        : selected.id === 'vercel'
                                          ? 'vercel token'
                                          : selected.id === 'discord'
                                            ? 'bot token'
                                            : selected.authKind === 'oauth'
                                              ? 'access token from browser'
                                              : 'figd_…'
                            }
                            className="ark-input"
                            autoFocus
                          />
                          {authError && (
                            <p className="text-xs text-ark-accent-red leading-relaxed">{authError}</p>
                          )}
                          {verifiedLogin && !authError && (
                            <p className="text-xs text-emerald-400">
                              Verified as {selected.id === 'gmail' ? verifiedLogin : `@${verifiedLogin}`}
                            </p>
                          )}
                          <button
                            type="button"
                            className="ark-btn-primary w-full"
                            disabled={authBusy || !tokenDraft.trim()}
                            onClick={() => void continueFromAuth()}
                          >
                            {authBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            {authBusy
                              ? `Checking with ${selected.name}…`
                              : selected.authKind === 'oauth'
                                ? 'Verify & continue'
                                : 'Verify token'}
                          </button>
                        </>
                      ) : (
                        <>
                          <input
                            type="password"
                            value={tokenDraft}
                            onChange={e => setTokenDraft(e.target.value)}
                            placeholder={selected.authKind === 'oauth' ? 'access token from browser' : 'token'}
                            className="ark-input"
                            autoFocus
                          />
                          <button
                            type="button"
                            className="ark-btn-primary w-full"
                            disabled={!tokenDraft.trim()}
                            onClick={() => void continueFromAuth()}
                          >
                            Continue
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-content-tertiary leading-relaxed">
                        No account needed — continue to grant permissions.
                      </p>
                      <button type="button" className="ark-btn-primary w-full" onClick={() => setConnectStep('permissions')}>
                        Continue
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  <button type="button" className="ark-btn-secondary w-full" onClick={() => setConnectStep('idle')}>
                    Back
                  </button>
                </div>
              )}

              {connectStep === 'permissions' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-content-primary">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    Permissions
                  </div>
                  <p className="text-xs text-content-tertiary">
                    Required permissions stay on. Optional ones you can turn off.
                  </p>
                  <div className="space-y-2">
                    {selected.permissions.map(perm => {
                      const on = permDraft.includes(perm.id) || Boolean(perm.required);
                      return (
                        <button
                          key={perm.id}
                          type="button"
                          onClick={() => togglePerm(perm.id, perm.required)}
                          className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${
                            on ? 'border-surface-border bg-surface-hover/50' : 'border-surface-border'
                          }`}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span>
                              <span className="block text-sm text-content-primary">{perm.label}</span>
                              <span className="block text-[11px] text-content-tertiary mt-0.5">{perm.detail}</span>
                            </span>
                            <span className={`text-[10px] rounded-full px-2 py-0.5 ${
                              perm.required
                                ? 'bg-sky-500/15 text-sky-400'
                                : on
                                  ? 'bg-emerald-500/15 text-emerald-400'
                                  : 'bg-surface-hover text-content-tertiary'
                            }`}>
                              {perm.required ? 'Required' : on ? 'On' : 'Off'}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <button type="button" className="ark-btn-primary w-full" onClick={finishConnect}>
                    <Check className="w-4 h-4" />
                    {verifiedLogin
                      ? `Save ${selected.id === 'gmail' ? verifiedLogin : `@${verifiedLogin}`} and enable in chat`
                      : 'Save and enable in chat'}
                  </button>
                  <button type="button" className="ark-btn-secondary w-full" onClick={() => setConnectStep(selected.authKind === 'none' ? 'idle' : 'auth')}>
                    Back
                  </button>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function StepRow({ done, label, detail }: { done: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-surface-border px-3 py-2.5">
      <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
        done ? 'bg-emerald-500/15 text-emerald-400' : 'bg-surface-hover text-content-tertiary'
      }`}>
        {done ? <Check className="w-3.5 h-3.5" /> : <span className="w-1.5 h-1.5 rounded-full bg-content-tertiary" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-content-primary">{label}</span>
        <span className="block text-[11px] text-content-tertiary">{detail}</span>
      </span>
    </div>
  );
}
