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
import { isArkDevSession } from '@/lib/arkRuntime';
import {
  Check, Cpu, KeyRound, Sparkles, Mail, BadgeCheck, Trash2, Download, Info, Monitor, Copy, X, FolderOpen, Github, RefreshCw, Cloud, Lock as LockIcon,
} from 'lucide-react';


export function SettingsPrivacy({ ctx }: { ctx: any }) {
  const {
    activeSection, displayName, setDisplayName, saveDisplayName, user, profile, setArkCopied, arkCopied,
    flashSaved, setSavedFlash, deleteAccountBusy, setDeleteAccountBusy, deleteAccountMsg, setDeleteAccountMsg,
    deleteConfirmOpen, setDeleteConfirmOpen, scheduleAccountDeletion, cancelAccountDeletion,
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
                      {blockedUsers.map((b: any) => (
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
                      {localReports.slice(0, 8).map((r: any) => (
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
                    {AUTO_LOCK_OPTIONS.map((opt: any) => (
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
                <ToggleRow
                  label="Commit after green verify"
                  value={Boolean(prefs.agentLoopCommitOnSuccess)}
                  onChange={v => patchPrefs({ agentLoopCommitOnSuccess: v })}
                />

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
                    ]).map((opt: any) => {
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
                    <LockIcon className="w-4 h-4 text-ark-accent-green" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-content-primary">Credential storage</p>
                  </div>
                  <span className="text-xs text-ark-accent-green shrink-0">Active</span>
                </div>
              </div>
            </SettingsSection>
          )}

    </>
  );
}
