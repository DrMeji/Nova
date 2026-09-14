import {
  SettingsSection,
  Field,
  InfoCard,
  ToggleRow,
  ThemeCard,
  SettingsGroup,
  GgufSliderRow,
  StorageBar,
  OAuthClientRow,
  AUTO_LOCK_OPTIONS,
  AI_MODES,
  DEFAULT_MODELS,
  PROVIDER_ROWS,
  ACCENTS,
} from '@/components/SettingsShared';
import { VoiceSettingsPanel } from '@/components/VoiceSettingsPanel';
import { SettingsSystemHealth } from '@/components/SettingsSystemHealth';
import { NovaMark } from '@/components/NovaMark';
import { BrandMark, StatusCheck } from '@/components/BrandMark';
import { ARK_CHANGELOG } from '@/lib/changelog';
import { formatArkId } from '@/lib/arkUserId';
import { isArkDevEmail } from '@/lib/arkDevAccount';
import { clearSetupCompleted } from '@/lib/setup';
import { getAccurateHardware } from '@/lib/api';
import { getGgufCtx, ggufCtxCapacityLabel } from '@/lib/ggufContext';
import { setCloudProviderEnabled } from '@/lib/cloudSources';
import { probeProviderKey } from '@/lib/providerSpeed';
import { setProviderApiKey, getProviderApiKeys, getLocalPrefs, type DensityPref, type AiModePref } from '@/lib/localPrefs';
import { hasPinSet, setPin, clearPin } from '@/lib/pinLock';
import { hasSecondFactorSet, setSecondFactor, clearSecondFactor } from '@/lib/twoFactor';
import {
  getEnabledSkillIds,
  listBuiltinSkillPacks,
  toggleSkillEnabled,
  type BuiltinNovaSkillId,
} from '@/lib/novaSkills';
import { isArkDevSession } from '@/lib/arkRuntime';
import {
  Check, Cpu, KeyRound, Sparkles, Mail, BadgeCheck, Trash2, Download, Info, Monitor, Copy, X, FolderOpen, Github, RefreshCw, Cloud, Lock as LockIcon,
} from 'lucide-react';


export function SettingsModels({ ctx }: { ctx: any }) {
  const {
    activeSection, displayName, setDisplayName, saveDisplayName, user, profile, setArkCopied, arkCopied,
    flashSaved, setSavedFlash, deleteAccountBusy, setDeleteAccountBusy, deleteAccountMsg, setDeleteAccountMsg,
    deleteConfirmOpen, setDeleteConfirmOpen, scheduleAccountDeletion, cancelAccountDeletion,
    signOut, theme, setTheme, prefs, patchPrefs, enabledSkills, setEnabledSkills, featureTick,
    engineStatus, diskSpace, brainUrl, brainContractVersion, secretsEncrypted, aiMode, keepLocal,
    allowSync, diagnostics, providerKeys, setProviderKeys, editingProvider, setEditingProvider,
    keyDraft, setKeyDraft, keyTestMsg, setKeyTestMsg, keyTestFor, setKeyTestFor, showLegacyProviders,
    setShowLegacyProviders, keyedCount, hw, setHw, hwScanning, setHwScanning, hwFlash, setHwFlash,
    brainProfileReason, setBrainProfileReason, userDataProfile, localReports, setLocalReports, cacheBusy, runClearChatCache, runClearAppCaches,
    installedModels, modelUsedGb, modelPercent, diskTotalGb, diskUsedGb, diskUsedPercent,
    deletingModelId, runDeleteModel, refreshStorage, pinNew, setPinNew, pinConfirm, setPinConfirm,
    pinMsg, setPinMsg, twoFaNew, setTwoFaNew, twoFaConfirm, setTwoFaConfirm, twoFaMsg, setTwoFaMsg,
    checkingUpdates, downloadingUpdate, updateMsg, updateInfo, updatePercent, appVersion,
    checkForUpdates, downloadUpdate, visibleChangelog, signingStatus, navigate, onClose,
    settings, updateSettings, blockedUsers, unblockFriend, refreshBlocked,
  } = ctx;

  void featureTick;
  void setLocalReports;
  void refreshBlocked;


  return (
    <>
          {activeSection === 'models' && (
            <SettingsSection title="Models">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {DEFAULT_MODELS.map((m: any) => {
                  const providerId = m.source === 'cloud'
                    ? (m.id.includes('claude') ? 'anthropic'
                      : m.id.includes('gemini') ? 'google'
                      : m.id.includes('deepseek') ? 'deepseek'
                      : m.id.startsWith('gpt') ? 'openai'
                      : null)
                    : null;
                  const installed = m.source === 'local' && (engineStatus?.models || []).some((x: any) => x.id === m.id && x.status === 'ready');
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
                  {PROVIDER_ROWS.filter((p: any) => p.id !== 'github-models' || showLegacyProviders).map((p: any) => {
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
                  onClick={() => setShowLegacyProviders((v: any) => !v)}
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
                    {(['github', 'google'] as const).map((id: any) => (
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
                        || (window.arkDesktop?.isElectron
                          ? '…'
                          : 'Browser')}
                      {userDataProfile === 'ARK-Dev'
                        ? ' · source bat'
                        : userDataProfile === 'ARK' || userDataProfile === 'NOVA'
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
                  className="ark-btn-secondary"
                  disabled={hwScanning}
                  onClick={() => {
                    setHwScanning(true);
                    setHwFlash('');
                    void getAccurateHardware(true).then(info => {
                      setHw(info);
                      setHwScanning(false);
                      setHwFlash(info.accurate ? 'Updated' : 'Approximate scan');
                      void import('@/lib/brainProfile').then((m: any) =>
                        m.getBrainProfile(true).then((p: any) => setBrainProfileReason(p.reason)),
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
