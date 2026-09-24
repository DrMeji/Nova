import { useMemo, useState } from 'react';
import {
  Search, Plus, Check, X, KeyRound, Shield, MessageSquare,
  Link2, Unplug, ChevronRight, Loader2, ExternalLink, Globe, Download,
} from 'lucide-react';
import {
  PLUGIN_CATALOG,
  PLUGIN_CATEGORIES,
  getInstalledPlugins,
  getPluginById,
  getPluginRuntime,
  isPluginLive,
  isPluginWired,
  loadPluginState,
  upsertPluginRuntime,
  runPluginAction,
  type PluginDef,
  type PluginPermission,
  type PluginRuntimeState,
  type PluginStateMap,
} from '@/lib/plugins';
import { verifyPluginToken, getCatalogPluginHandler } from '@/lib/catalogPlugins';
import { openInSystemBrowser } from '@/lib/openExternal';
import { getPluginAuthLink } from '@/lib/pluginAuth';
import { clearPluginToken, setPluginToken } from '@/lib/localPrefs';
import { BrandMark } from '@/components/BrandMark';

function pluginStatusLine(
  runtime: PluginRuntimeState,
  wired: boolean,
): string {
  if (!wired) return 'Coming soon';
  if (!runtime.installed) return 'Not added';
  if (!runtime.connected) return 'Added';
  if (runtime.enabledInChat) return 'Connected · in chat';
  return 'Connected';
}

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
  const [pluginShelf, setPluginShelf] = useState<'installed' | 'catalog'>('catalog');
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState('');

  const selected = selectedId ? getPluginById(selectedId) ?? null : null;
  const selectedRuntime = selectedId ? getPluginRuntime(selectedId, state) : null;

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    const installedIds = new Set(getInstalledPlugins(state).map(plugin => plugin.id));
    return PLUGIN_CATEGORIES.map(cat => ({
      ...cat,
      plugins: PLUGIN_CATALOG.filter(p => {
        if (p.category !== cat.id) return false;
        if (pluginShelf === 'installed' && !installedIds.has(p.id)) return false;
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q)
          || p.description.toLowerCase().includes(q)
          || cat.title.toLowerCase().includes(q)
        );
      }),
    })).filter(cat => cat.plugins.length > 0);
  }, [pluginShelf, query, state]);

  const comingSoonPlugins = useMemo(() => [] as typeof PLUGIN_CATALOG, []);

  const installedPlugins = useMemo(() => getInstalledPlugins(state), [state]);

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
    if (!plugin || !isPluginWired(id)) return;
    patch(id, {
      installed: true,
      permissions: plugin.permissions.filter(p => p.required).map(p => p.id),
    });
    openPlugin(plugin);
  };

  const uninstall = async (id: string) => {
    try {
      await clearPluginToken(id);
      patch(id, {
        installed: false,
        connected: false,
        enabledInChat: false,
        accountLabel: undefined,
        connectedAt: undefined,
      });
      closePanel();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Could not remove this token securely');
    }
  };

  const startConnect = () => {
    if (!selected) return;
    if (!isPluginWired(selected.id)) {
      setAuthError('Coming soon. not connected to a live API yet.');
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

  const finishConnect = async () => {
    if (!selected) return;
    if (!isPluginWired(selected.id)) {
      setAuthError('Coming soon. not connected to a live API yet.');
      return;
    }
    if (selected.authKind !== 'none' && !tokenDraft.trim() && !selectedRuntime?.token) {
      setAuthError('Paste a valid token, then continue.');
      setConnectStep('auth');
      return;
    }
    setAuthBusy(true);
    setAuthError('');
    try {
      const token = tokenDraft.trim() || selectedRuntime?.token || '';
      if (selected.authKind !== 'none' && token) {
        await setPluginToken(selected.id, token);
      }
      const required = selected.permissions.filter(p => p.required).map(p => p.id);
      const granted = Array.from(new Set([...required, ...permDraft]));
      patch(selected.id, {
        installed: true,
        connected: true,
        enabledInChat: true,
        permissions: granted,
        accountLabel: verifiedLogin || selectedRuntime?.accountLabel,
        connectedAt: new Date().toISOString(),
      });
      setConnectStep('idle');
      setTokenDraft('');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Could not securely save this token');
    } finally {
      setAuthBusy(false);
    }
  };

  const continueFromAuth = async () => {
    if (!selected) return;
    setAuthError('');

    if (!isPluginWired(selected.id)) {
      setAuthError('Coming soon. not connected to a live API yet.');
      return;
    }

    if (!tokenDraft.trim() && !getCatalogPluginHandler(selected.id)?.noToken) {
      setAuthError('Paste a token to verify.');
      return;
    }

    setAuthBusy(true);
    try {
      const user = await verifyPluginToken(selected.id, tokenDraft);
      setVerifiedLogin(user.label);
      setConnectStep('permissions');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : `Could not verify ${selected.name} token`);
    } finally {
      setAuthBusy(false);
    }
  };

  const startBrowserOAuth = async () => {
    if (!selected || !window.novaDesktop?.pluginOAuthStart) {
      setAuthError('Browser OAuth needs the desktop app.');
      return;
    }
    setAuthBusy(true);
    setAuthError('');
    try {
      const result = await window.novaDesktop.pluginOAuthStart(selected.id);
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

  const disconnect = async () => {
    if (!selected) return;
    try {
      await clearPluginToken(selected.id);
      patch(selected.id, {
        connected: false,
        enabledInChat: false,
        accountLabel: undefined,
        connectedAt: undefined,
      });
      setVerifiedLogin('');
      setConnectStep('idle');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Could not disconnect this account securely');
    }
  };

  const togglePerm = (id: PluginPermission, required?: boolean) => {
    if (required) return;
    setPermDraft(prev => (prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]));
  };

  return (
    <div className="h-full min-w-0 flex flex-col overflow-hidden animate-fade-in bg-transparent relative">
      <div className="shrink-0 px-4 sm:px-6 pt-[min(12vh,6rem)] bg-transparent">
        <div className="w-full max-w-4xl mx-auto min-w-0">
          <div className="flex items-center justify-between gap-3 mb-6 min-w-0">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-semibold text-content-primary tracking-tight">Plugins</h1>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-full bg-surface-hover p-1 shrink-0">
                {(['catalog', 'installed'] as const).map(id => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPluginShelf(id)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
                      pluginShelf === id ? 'bg-nova-navy-900 text-content-primary' : 'text-content-tertiary hover:text-content-secondary'
                    }`}
                  >
                    {id === 'catalog' ? <Globe className="w-4 h-4 shrink-0" /> : <Download className="w-4 h-4 shrink-0" />}
                    {id === 'catalog' ? 'Browse' : 'Installed'}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 rounded-full bg-surface-hover px-3 py-2 w-36 sm:w-52 md:w-64 shrink-0 min-w-0">
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
      </div>

      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden px-4 sm:px-6 pb-10">
        <div className="w-full max-w-4xl mx-auto">
          {(pluginShelf === 'installed' || (pluginShelf === 'catalog' && !query)) && (
            <>
              {pluginShelf === 'catalog' && (
              <section className="mb-8">
                <h2 className="text-base font-semibold text-content-primary mb-3">Suggested</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {PLUGIN_CATALOG.filter(p => isPluginLive(p.id) || p.id === 'telegram').map(plugin => {
                    const runtime = getPluginRuntime(plugin.id, state);
                    return (
                      <button
                        key={plugin.id}
                        type="button"
                        onClick={() => openPlugin(plugin)}
                        className="text-left rounded-xl border border-surface-border hover:bg-surface-hover/70 px-3 py-3 transition-colors"
                      >
                        <span className="flex items-center gap-2.5">
                          <BrandMark id={plugin.id} name={plugin.name} initial={plugin.initial} tone={plugin.tone} size="sm" />
                          <span className="min-w-0 flex-1">
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
                          <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                            runtime.installed
                              ? 'bg-surface-hover text-nova-accent-green'
                              : 'text-content-secondary'
                          }`}>
                            {runtime.installed ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
              )}

              <section className="mb-10">
                <h2 className="text-base font-semibold text-content-primary mb-2">Your library</h2>
                {installedPlugins.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-surface-border px-4 py-6 text-center">
                    <p className="text-sm text-content-secondary">Nothing installed yet</p>
                  </div>
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
                          className="relative w-10 h-10 flex items-center justify-center shadow-sm"
                        >
                          <BrandMark id={plugin.id} name={plugin.name} initial={plugin.initial} tone={plugin.tone} />
                          {runtime.connected && (
                            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-nova-navy-950" />
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
                        title={plugin.name}
                        className="flex items-center gap-3 py-3 rounded-xl px-1 text-left transition-colors hover:bg-surface-hover/50"
                      >
                        <BrandMark id={plugin.id} name={plugin.name} initial={plugin.initial} tone={plugin.tone} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium text-content-primary truncate">{plugin.name}</span>
                            {isPluginLive(plugin.id) ? (
                              <span className="text-[10px] rounded-full bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 shrink-0">
                                Live
                              </span>
                            ) : (
                              <span className="text-[10px] rounded-full bg-sky-500/15 text-sky-400 px-1.5 py-0.5 shrink-0">
                                Ready
                              </span>
                            )}
                          </span>
                        </span>
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                          runtime.installed
                            ? 'bg-surface-hover text-nova-accent-green'
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

            {filteredCategories.length === 0 && comingSoonPlugins.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <p className="text-base font-semibold text-content-primary mb-1">No plugins found</p>
                <p className="text-sm text-content-tertiary">Try a different search.</p>
              </div>
            )}

            {pluginShelf === 'catalog' && comingSoonPlugins.length > 0 && (
              <section className="mt-10 pt-8 border-t border-surface-border">
                <h2 className="text-base font-semibold text-content-primary mb-4">Coming soon</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                  {comingSoonPlugins.map(plugin => (
                    <button
                      key={`soon-${plugin.id}`}
                      type="button"
                      onClick={() => openPlugin(plugin)}
                      title={plugin.name}
                      className="flex items-center gap-3 py-3 rounded-xl px-1 text-left transition-colors hover:bg-surface-hover/40"
                    >
                      <BrandMark id={plugin.id} name={plugin.name} initial={plugin.initial} tone={plugin.tone} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-medium text-content-primary truncate">{plugin.name}</span>
                          <span className="text-[10px] rounded-full bg-white/10 text-content-tertiary px-1.5 py-0.5 shrink-0">
                            Soon
                          </span>
                        </span>
                      </span>
                      <ChevronRight className="w-4 h-4 text-content-tertiary shrink-0" />
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      {selected && selectedRuntime && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-nova-navy-950/70 backdrop-blur-md"
          onClick={closePanel}
        >
          <div
            className="w-full max-w-md max-h-[min(92vh,720px)] overflow-hidden rounded-2xl border border-surface-border bg-nova-navy-900 shadow-2xl flex flex-col animate-fade-in"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="plugin-panel-title"
          >
            <div className="shrink-0 px-5 py-4 flex items-start justify-between gap-3 border-b border-surface-border">
              <div className="flex items-center gap-3 min-w-0">
                <BrandMark id={selected.id} name={selected.name} initial={selected.initial} tone={selected.tone} size="lg" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <h2 id="plugin-panel-title" className="text-lg font-semibold text-content-primary truncate">
                      {selected.name}
                    </h2>
                    {!isPluginWired(selected.id) && (
                      <span className="inline-flex items-center rounded-full bg-zinc-500/20 text-content-tertiary px-2 py-0.5 text-[10px] font-medium leading-none shrink-0">
                        Soon
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-content-tertiary mt-0.5">
                    {pluginStatusLine(selectedRuntime, isPluginWired(selected.id))}
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
              {connectStep === 'idle' && (
                <>
                  <div className="space-y-2">
                    <StepRow done={selectedRuntime.installed} label="Add to NOVA" />
                    <StepRow done={selectedRuntime.connected} label="Connect account" />
                    <StepRow
                      done={selectedRuntime.connected && selectedRuntime.permissions.length > 0}
                      label="Permissions"
                    />
                    <StepRow done={selectedRuntime.enabledInChat} label="Use in chat" />
                  </div>

                  {selected.hero && selected.actions.length > 0 && selectedRuntime.connected && (
                    <div>
                      <p className="text-xs font-medium text-content-secondary mb-2">Try in chat</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selected.actions.map(action => (
                          <span
                            key={action.id}
                            className="rounded-full border border-surface-border px-2.5 py-1 text-[11px] text-content-secondary"
                          >
                            {action.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 pt-1">
                    {!isPluginWired(selected.id) ? null : !selectedRuntime.installed ? (
                      <button type="button" className="nova-btn-primary w-full" onClick={() => install(selected.id)}>
                        <Plus className="w-4 h-4" />
                        Add to NOVA
                      </button>
                    ) : !selectedRuntime.connected ? (
                      <button type="button" className="nova-btn-primary w-full" onClick={startConnect}>
                        <Link2 className="w-4 h-4" />
                        Connect {selected.name} account
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="nova-btn-secondary w-full"
                          onClick={() => patch(selected.id, { enabledInChat: !selectedRuntime.enabledInChat })}
                        >
                          <MessageSquare className="w-4 h-4" />
                          {selectedRuntime.enabledInChat ? 'Disable in chat' : 'Enable in chat'}
                        </button>
                        <button type="button" className="nova-btn-secondary w-full" onClick={disconnect}>
                          <Unplug className="w-4 h-4" />
                          Disconnect account
                        </button>
                        <button
                          type="button"
                          className="nova-btn-secondary w-full"
                          disabled={testBusy}
                          onClick={() => {
                            setTestBusy(true);
                            setTestResult('');
                            const action = selected.actions[0]?.prompt || `Using ${selected.name}, test the connection.`;
                            void runPluginAction(
                              selected.id,
                              action,
                              selectedRuntime.token,
                              selectedRuntime.permissions,
                            ).then(text => {
                              setTestResult(text || 'No live response.');
                              setTestBusy(false);
                            }).catch(err => {
                              setTestResult(err instanceof Error ? err.message : 'Test failed');
                              setTestBusy(false);
                            });
                          }}
                        >
                          {testBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                          {testBusy ? 'Testing…' : 'Test connection'}
                        </button>
                        {testResult && (
                          <pre className="text-[11px] text-content-secondary whitespace-pre-wrap rounded-xl border border-surface-border px-3 py-2 max-h-40 overflow-auto">
                            {testResult.slice(0, 1200)}
                          </pre>
                        )}
                      </>
                    )}
                    {selectedRuntime.installed && isPluginWired(selected.id) && (
                      <button
                        type="button"
                        className="nova-btn-secondary w-full !text-nova-accent-red"
                        onClick={() => uninstall(selected.id)}
                      >
                        Remove from NOVA
                      </button>
                    )}
                    {authError && connectStep === 'idle' && (
                      <p className="text-xs text-nova-accent-red">{authError}</p>
                    )}
                  </div>
                </>
              )}

              {connectStep === 'auth' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-content-primary">
                    <KeyRound className="w-4 h-4 text-sky-400" />
                    Connect {selected.name}
                  </div>
                  {selected.authKind === 'oauth' || selected.authKind === 'token' ? (
                    <>
                      {(() => {
                        const link = getPluginAuthLink(selected.id);
                        return (
                          <>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300"
                              onClick={() => void openInSystemBrowser(link.url)}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              {selected.authKind === 'oauth' ? `Open ${selected.name}` : link.label}
                            </button>
                            {(selected.id === 'github' || selected.id === 'gmail' || selected.authKind === 'oauth') && window.novaDesktop?.pluginOAuthStart && (
                              <button
                                type="button"
                                className="nova-btn-secondary w-full"
                                disabled={authBusy}
                                onClick={() => void startBrowserOAuth()}
                              >
                                {authBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                                {selected.id === 'github'
                                  ? 'Sign in with GitHub'
                                  : `Continue with ${selected.name}`}
                              </button>
                            )}
                          </>
                        );
                      })()}
                      {['github', 'notion', 'gmail', 'slack', 'linear', 'figma'].includes(selected.id) ? (
                        <>
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
                            className="nova-input"
                            autoFocus
                          />
                          {authError && (
                            <p className="text-xs text-nova-accent-red leading-relaxed">{authError}</p>
                          )}
                          {verifiedLogin && !authError && (
                            <p className="text-xs text-emerald-400">
                              Verified as {selected.id === 'gmail' ? verifiedLogin : `@${verifiedLogin}`}
                            </p>
                          )}
                          <button
                            type="button"
                            className="nova-btn-primary w-full"
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
                            className="nova-input"
                            autoFocus
                          />
                          <button
                            type="button"
                            className="nova-btn-primary w-full"
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
                    <button type="button" className="nova-btn-primary w-full" onClick={() => setConnectStep('permissions')}>
                      Continue
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                  <button type="button" className="nova-btn-secondary w-full" onClick={() => setConnectStep('idle')}>
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
                            <span className="text-sm text-content-primary">{perm.label}</span>
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
                  <button
                    type="button"
                    className="nova-btn-primary w-full"
                    onClick={() => void finishConnect()}
                    disabled={authBusy}
                  >
                    {authBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {authBusy
                      ? 'Saving…'
                      : 'Save and enable in chat'}
                  </button>
                  <button type="button" className="nova-btn-secondary w-full" onClick={() => setConnectStep(selected.authKind === 'none' ? 'idle' : 'auth')}>
                    Back
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepRow({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-surface-border px-3 py-2.5">
      <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
        done ? 'bg-emerald-500/15 text-emerald-400' : 'bg-surface-hover text-content-tertiary'
      }`}>
        {done ? <Check className="w-3.5 h-3.5" /> : <span className="w-1.5 h-1.5 rounded-full bg-content-tertiary" />}
      </span>
      <span className="text-sm text-content-primary">{label}</span>
    </div>
  );
}
