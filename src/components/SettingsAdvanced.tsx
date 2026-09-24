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
import { NOVA_CHANGELOG } from '@/lib/changelog';
import { formatNovaId } from '@/lib/novaUserId';
import { isNovaDevEmail } from '@/lib/novaDevAccount';
import { clearSetupCompleted } from '@/lib/setup';
import { getHardwareClass, getAccurateHardware } from '@/lib/api';
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
import { isNovaDevSession } from '@/lib/novaRuntime';
import {
  Check, Cpu, KeyRound, Sparkles, Mail, BadgeCheck, Trash2, Download, Info, Monitor, Copy, X, FolderOpen, Github, RefreshCw, Cloud, Lock as LockIcon,
} from 'lucide-react';


export function SettingsAdvanced({ ctx }: { ctx: any }) {
  const {
    activeSection, displayName, setDisplayName, saveDisplayName, user, profile, setArkCopied, arkCopied,
    flashSaved, setSavedFlash, deleteAccountBusy, setDeleteAccountBusy, deleteAccountMsg, setDeleteAccountMsg,
    deleteConfirmOpen, setDeleteConfirmOpen, deleteAccountPermanently,
    signOut, theme, setTheme, prefs, patchPrefs, enabledSkills, setEnabledSkills, featureTick,
    engineStatus, diskSpace, brainUrl, brainContractVersion, secretsEncrypted, aiMode, keepLocal,
    allowSync, diagnostics, providerKeys, setProviderKeys, editingProvider, setEditingProvider,
    keyDraft, setKeyDraft, keyTestMsg, setKeyTestMsg, keyTestFor, setKeyTestFor, showLegacyProviders,
    setShowLegacyProviders, keyedCount, hw, setHw, hwScanning, setHwScanning, hwFlash, setHwFlash,
    brainProfileReason, setBrainProfileReason, localReports, setLocalReports, cacheBusy, runClearChatCache, runClearAppCaches,
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
                        className="nova-btn-secondary text-xs"
                        onClick={() => {
                          void window.novaDesktop?.openPath?.(engineStatus.modelsDir!);
                        }}
                      >
                        Open folder
                      </button>
                      <button
                        type="button"
                        className="nova-btn-secondary text-xs"
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
                      {installedModels.map((model: any) => (
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
                    className="nova-btn-secondary"
                    disabled={cacheBusy}
                    onClick={() => void runClearAppCaches()}
                  >
                    <Trash2 className="w-4 h-4" />
                    {cacheBusy ? 'Clearing…' : 'Clear cache'}
                  </button>
                  <button type="button" className="nova-btn-secondary" onClick={() => { onClose?.(); navigate({ name: 'local-ai' }); }}>
                    Manage models
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
                    ]).map((t: any) => (
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


          {activeSection === 'updates' && (
            <SettingsSection title="Update">
              <div className="space-y-5">
                <div className="rounded-3xl border border-surface-border bg-nova-navy-900 p-5 sm:p-6 flex flex-col gap-4 shadow-[0_8px_28px_rgba(0,0,0,0.28)]">
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
                          void window.novaDesktop?.openExternal?.('https://github.com/DrMeji/Nova/releases')
                        }
                        className="h-10 w-10 rounded-xl border border-white/15 bg-white/[0.04] text-content-secondary hover:text-content-primary hover:bg-white/[0.08] flex items-center justify-center transition-colors"
                      >
                        <Github className="w-5 h-5" />
                      </button>
                      {updateInfo?.newerAvailable && updateInfo.setupAssetUrl && !isNovaDevSession() ? (
                        <button
                          type="button"
                          onClick={downloadUpdate}
                          disabled={downloadingUpdate}
                          title="Download and install the latest NOVA"
                          className="nova-btn-primary !rounded-full"
                        >
                          {downloadingUpdate ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                          {downloadingUpdate ? 'Updating…' : 'Update'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={checkForUpdates}
                          disabled={checkingUpdates || downloadingUpdate}
                          className="nova-btn-secondary !rounded-full"
                        >
                          {checkingUpdates ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                          {checkingUpdates ? 'Checking…' : 'Check for update'}
                        </button>
                      )}
                    </div>
                  </div>
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
                    void window.novaDesktop?.loginItemSet?.(v).then((r: any) => {
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
                      visibleChangelog.map((entry: any) => (
                      <div key={entry.version} className="rounded-xl border border-surface-border p-4">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div>
                            <p className="text-sm font-medium text-content-primary">
                              v{entry.version} · {String(entry.title || '').replace(/\u2014|\u2013|\u2212/g, '. ')}
                            </p>
                            <p className="text-[11px] text-content-tertiary mt-0.5">{entry.date}</p>
                          </div>
                          <span className="text-[10px] rounded-full px-2 py-0.5 bg-emerald-500/15 text-emerald-400">
                            {entry.channel}
                          </span>
                        </div>
                        <ul className="space-y-1.5">
                          {(entry.notes || []).map((note: any) => (
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
    </>
  );
}
