import { useMemo } from 'react';
import { SettingsSection, OAuthClientRow, DEFAULT_MODELS, PROVIDER_ROWS, type SettingsSharedCtx } from '@/components/SettingsShared';
import '@/components/VoiceSettingsPanel';
import '@/components/SettingsSystemHealth';
import '@/components/NovaMark';
import { BrandMark } from '@/components/BrandMark';
import '@/lib/changelog';
import '@/lib/novaUserId';
import '@/lib/novaDevAccount';
import '@/lib/setup';
import { getAccurateHardware } from '@/lib/api';
import '@/lib/ggufContext';
import { setCloudProviderEnabled } from '@/lib/cloudSources';
import { probeProviderKey } from '@/lib/providerSpeed';
import { setProviderApiKey, getProviderApiKeys } from '@/lib/localPrefs';
import '@/lib/pinLock';
import '@/lib/twoFactor';
import '@/lib/novaSkills';
import '@/lib/novaRuntime';
import { KeyRound, RefreshCw, Cloud } from 'lucide-react';

type SettingsModelRow = {
  id: string;
  label: string;
  detail: string;
  source: 'auto' | 'local' | 'cloud';
};

function cloudProviderForModel(id: string): string | null {
  if (id.includes('claude')) return 'anthropic';
  if (id.includes('gemini')) return 'google';
  if (id.includes('deepseek')) return 'deepseek';
  if (id.startsWith('gpt')) return 'openai';
  return null;
}

function modelReadyRank(opts: {
  source: string;
  installed: boolean;
  missingKey: boolean;
  isAuto: boolean;
}): number {
  // Lower = higher in the list. Installed / ready first; missing last.
  if (opts.isAuto) return 0;
  if (opts.source === 'local' && opts.installed) return 1;
  if (opts.source === 'cloud' && !opts.missingKey) return 2;
  if (opts.source === 'cloud' && opts.missingKey) return 4;
  return 3; // local not installed
}

export function SettingsModels({ ctx }: { ctx: SettingsSharedCtx }) {
  const { activeSection, setSavedFlash, prefs, patchPrefs, featureTick, engineStatus, secretsEncrypted, providerKeys, setProviderKeys, editingProvider, setEditingProvider, keyDraft, setKeyDraft, keyTestMsg, setKeyTestMsg, keyTestFor, setKeyTestFor, showLegacyProviders, setShowLegacyProviders, keyedCount, hw, setHw, hwScanning, setHwScanning, hwFlash, setHwFlash, brainProfileReason, setBrainProfileReason, userDataProfile, setLocalReports, installedModels, navigate, onClose, refreshBlocked } = ctx;

  void featureTick;
  void setLocalReports;
  void refreshBlocked;

  const modelRows = useMemo(() => {
    const byId = new Map<string, SettingsModelRow>();
    for (const m of DEFAULT_MODELS) {
      byId.set(m.id, { id: m.id, label: m.label, detail: m.detail || '', source: m.source });
    }
    // Surface every ready Engine GGUF even if it is not in the static quick-pick list.
    for (const m of installedModels || []) {
      const id = String(m.id || '');
      if (!id || id === 'NOVA-core' || id.startsWith('NOVA-')) continue;
      if (/mmproj/i.test(`${id} ${m.name || ''}`)) continue;
      if (byId.has(id)) continue;
      byId.set(id, {
        id,
        label: String(m.name || id),
        detail: String(m.detail || ''),
        source: 'local',
      });
    }
    const readyIds = new Set(
      (engineStatus?.models || [])
        .filter((x: { id?: string; status?: string }) => x.status === 'ready' && x.id)
        .map((x: { id: string }) => x.id),
    );
    const rows = [...byId.values()].map((m) => {
      const providerId = m.source === 'cloud' ? cloudProviderForModel(m.id) : null;
      const installed = m.source === 'local' && readyIds.has(m.id);
      const missingKey = providerId ? !providerKeys[providerId] : false;
      const rank = modelReadyRank({
        source: m.source,
        installed,
        missingKey,
        isAuto: m.source === 'auto',
      });
      return { ...m, providerId, installed, missingKey, rank };
    });
    rows.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));
    return rows;
  }, [engineStatus, installedModels, providerKeys]);

  const providerRowsSorted = useMemo(() => {
    const rows = PROVIDER_ROWS.filter((p: { id: string }) => p.id !== 'github-models' || showLegacyProviders);
    return [...rows].sort((a, b) => {
      const aOn = providerKeys[a.id] ? 0 : 1;
      const bOn = providerKeys[b.id] ? 0 : 1;
      return aOn - bOn || a.name.localeCompare(b.name);
    });
  }, [providerKeys, showLegacyProviders]);

  return (
    <>
          {activeSection === 'models' && (
            <SettingsSection title="Models">
              {brainProfileReason ? (
                <p className="text-xs text-content-tertiary mb-3 leading-relaxed">
                  For this PC: {brainProfileReason}
                </p>
              ) : null}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {modelRows.map((m) => {
                  const isSelected = prefs.defaultModelId === m.id;
                  const statusLine = m.source === 'auto'
                    ? 'Auto · picks a fit model for this PC'
                    : m.source === 'local'
                      ? (m.installed
                        ? 'Installed in NOVA Engine'
                        : 'Not installed — open Models library to download')
                      : (m.missingKey ? 'Key needed' : 'Cloud key ready');
                  const statusTone = m.source === 'local' && m.installed
                    ? 'text-emerald-400/90'
                    : m.source === 'cloud' && !m.missingKey
                      ? 'text-emerald-400/80'
                      : 'text-content-tertiary';
                  return (
                    <button
                      key={`model-${m.id}`}
                      type="button"
                      onClick={() => patchPrefs({ defaultModelId: m.id, defaultCodeModelId: m.id })}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        isSelected
                          ? 'border-nova-blue-400 bg-nova-blue-500/10'
                          : 'border-surface-border hover:border-surface-border-light'
                      }`}
                    >
                      <p className="text-sm font-medium text-content-primary truncate">{m.label}</p>
                      <p className={`text-[10px] mt-0.5 ${statusTone}`}>{statusLine}</p>
                      {isSelected && (
                        <p className="text-[10px] text-nova-blue-300 mt-1">Selected</p>
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
                  className="nova-btn-secondary w-full sm:col-span-2"
                >
                  Open Models library
                </button>
              </div>
            </SettingsSection>
          )}


          {activeSection === 'providers' && (
            <SettingsSection title="Providers">
              <div className="space-y-3">
                {secretsEncrypted === false && window.novaDesktop ? (
                  <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-3">
                    <p className="text-sm font-semibold text-rose-200">NO_ENCRYPTION: secure key storage is unavailable</p>
                    <p className="text-xs text-rose-100/75 mt-1">
                      NOVA will not save provider secrets as plaintext. Repair Windows credential encryption before connecting a key.
                    </p>
                  </div>
                ) : null}
                <div className="ark-card p-3.5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-nova-blue-500/10 flex items-center justify-center shrink-0">
                    <Cloud className="w-4 h-4 text-nova-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-content-primary">Cloud connections</p>
                    <p className="text-xs text-content-secondary">
                      {keyedCount} API key{keyedCount === 1 ? '' : 's'} saved locally
                      {keyedCount > 0
                        ? ' · pick them in the chat model menu next to Auto'
                        : ' · then choose a Cloud model in chat'}
                    </p>
                  </div>
                  <KeyRound className="w-4 h-4 text-content-tertiary" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {providerRowsSorted.map((p) => {
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
                                onClick={() => void window.novaDesktop?.openExternal?.(p.keyUrl!)}
                              >
                                Where to get a {p.name} key →
                              </button>
                            ) : null}
                            <input
                              type="password"
                              value={keyDraft}
                              onChange={e => setKeyDraft(e.target.value)}
                              placeholder="Paste API key"
                              className="nova-input"
                              spellCheck={false}
                              autoComplete="off"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="nova-btn-secondary flex-1"
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
                                className="nova-btn-primary flex-1"
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
                                  className="nova-btn-secondary flex-1"
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
              onClick={() => setShowLegacyProviders((v: boolean) => !v)}
                >
                  {showLegacyProviders ? 'Hide retired sources' : 'Show retired (GitHub Models)'}
                </button>

                <div className="rounded-xl border border-surface-border p-3 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-content-primary">Plugin OAuth client IDs</p>
                    <button
                      type="button"
                      className="text-[11px] text-sky-400 hover:text-sky-300 shrink-0"
                      onClick={() => void window.novaDesktop?.openExternal?.('https://github.com/DrMeji/Nova/releases')}
                      title="Public download page (setup guide docs are not on the public repo)"
                    >
                      Releases
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(['github', 'google'] as const).map((id) => (
                      <div key={id} className="rounded-lg border border-surface-border/80 bg-nova-navy-950/40 p-2.5">
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
                    <span className="text-content-secondary">This PC</span>
                    <span className="text-content-primary text-right min-w-0 text-xs leading-snug max-w-[70%]">
                      {brainProfileReason || 'Probing…'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-content-secondary">App profile</span>
                    <span className="text-content-primary text-right font-mono text-xs">
                      {userDataProfile
                        || (window.novaDesktop?.isElectron
                          ? '…'
                          : 'Browser')}
                      {userDataProfile === 'NOVA-Dev'
                        ? ' · source bat'
                        : userDataProfile === 'NOVA'
                          ? ' · installed'
                          : ''}
                    </span>
                  </div>
                  {engineStatus?.modelsDir ? (
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="text-content-secondary">Models dir</span>
                      <span
                        className="text-content-primary text-right min-w-0 text-[11px] font-mono leading-snug max-w-[70%] break-all"
                        title={engineStatus.modelsDir}
                      >
                        {engineStatus.modelsDir}
                      </span>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="nova-btn-secondary"
                  disabled={hwScanning}
                  onClick={() => {
                    setHwScanning(true);
                    setHwFlash('');
                    void getAccurateHardware(true).then(info => {
                      setHw(info);
                      setHwScanning(false);
                      setHwFlash(info.accurate ? 'Updated' : 'Approximate scan');
                      void import('@/lib/brainProfile').then((m) =>
                        m.getBrainProfile(true).then((p) => setBrainProfileReason(p.reason)),
                      );
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

    </>
  );
}
