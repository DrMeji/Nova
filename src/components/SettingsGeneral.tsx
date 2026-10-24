import { SettingsSection, InfoCard, ToggleRow, ThemeCard, SettingsGroup, GgufSliderRow, AI_MODES, ACCENTS, type SettingsSharedCtx } from '@/components/SettingsShared';
import { VoiceSettingsPanel } from '@/components/VoiceSettingsPanel';
import { SettingsSystemHealth } from '@/components/SettingsSystemHealth';
import '@/components/BrandMark';
import '@/lib/changelog';
import { formatNovaId } from '@/lib/novaUserId';
import { isNovaDevEmail } from '@/lib/novaDevAccount';
import '@/lib/setup';
import '@/lib/api';
import { ggufCtxCapacityLabel } from '@/lib/ggufContext';
import '@/lib/cloudSources';
import '@/lib/providerSpeed';
import { type DensityPref, type AiModePref } from '@/lib/localPrefs';
import '@/lib/pinLock';
import '@/lib/twoFactor';
import {
  getEnabledSkillIds,
  listBuiltinSkillPacks,
  toggleSkillEnabled,
  type BuiltinNovaSkillId,
} from '@/lib/novaSkills';
import '@/lib/novaRuntime';
import { Check, Cpu, Sparkles, BadgeCheck, Copy, Github } from 'lucide-react';


export function SettingsGeneral({ ctx }: { ctx: SettingsSharedCtx }) {
  const { activeSection, user, profile, setArkCopied, arkCopied, setSavedFlash, signOut, theme, setTheme, prefs, patchPrefs, enabledSkills, setEnabledSkills, featureTick, engineStatus, diskSpace, brainUrl, aiMode, setLocalReports, navigate, onClose, settings, updateSettings, refreshBlocked } = ctx;

  void featureTick;
  void setLocalReports;
  void refreshBlocked;


  return (
    <>
          {activeSection === 'account' && (
            <SettingsSection title="Account">
              <div className="space-y-5">
                <div className="flex items-start gap-4">
                  <div className="relative shrink-0 w-16 h-16 flex items-center justify-center overflow-hidden rounded-full border border-surface-border bg-nova-navy-900">
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Github className="w-7 h-7 text-content-primary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-mono font-medium text-content-primary truncate flex items-center gap-1.5">
                      <Github className="w-3.5 h-3.5 shrink-0" />
                      {user?.id === 'guest-local'
                        ? 'guest@NOVA.local'
                        : isNovaDevEmail(user?.email)
                          ? 'DEV'
                          : (profile?.nova_id ? formatNovaId(profile.nova_id) : 'GitHub')}
                    </p>
                    <p className="text-[11px] text-content-tertiary mt-1 inline-flex items-center gap-1">
                      <BadgeCheck className="w-3 h-3 text-sky-400" />
                      {user?.id === 'guest-local' ? 'Guest session on this device' : 'Signed in with GitHub'}
                    </p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <label className="block text-xs font-medium text-content-secondary">GitHub</label>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="flex-1 min-w-0 rounded-lg border border-surface-border bg-nova-navy-900/80 px-3 py-2 text-sm font-mono text-content-primary overflow-x-auto">
                      {isNovaDevEmail(user?.email)
                        ? 'DEV'
                        : (profile?.nova_id ? formatNovaId(profile.nova_id) : '•••••••')}
                    </p>
                    <button
                      type="button"
                      disabled={!profile?.nova_id && !isNovaDevEmail(user?.email)}
                      onClick={() => {
                        if (!profile?.nova_id && !isNovaDevEmail(user?.email)) return;
                        const idText = isNovaDevEmail(user?.email)
                          ? 'DEV'
                          : formatNovaId(String(profile?.nova_id ?? ''));
                        void navigator.clipboard.writeText(idText).then(() => {
                          setArkCopied(true);
                          window.setTimeout(() => setArkCopied(false), 1600);
                        }).catch(() => undefined);
                      }}
                      className="nova-btn-secondary shrink-0"
                      title="Copy GitHub username"
                    >
                      {arkCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {arkCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InfoCard title="Plan" value="Free on this PC" />
                  <InfoCard title="Devices" value="This PC" />
                </div>

                <div className="flex flex-wrap gap-2 pt-1 items-center">
                  <button type="button" onClick={signOut} className="nova-btn-secondary !text-nova-accent-red">
                    Sign Out
                  </button>
                </div>
              </div>
            </SettingsSection>
          )}

          {activeSection === 'appearance' && (
            <SettingsSection title="Appearance">
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-medium text-content-secondary mb-2">Theme</label>
                  <div className="grid grid-cols-2 min-[520px]:grid-cols-4 gap-3">
                    <ThemeCard label="Fun" variant="fun" active={theme === 'fun'} onClick={() => setTheme('fun')} />
                    <ThemeCard label="Dark" variant="dark" active={theme === 'dark'} onClick={() => setTheme('dark')} />
                    <ThemeCard label="Light" variant="light" active={theme === 'light'} onClick={() => setTheme('light')} />
                    <ThemeCard label="Gray" variant="gray" active={theme === 'gray'} onClick={() => setTheme('gray')} />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-content-secondary mb-2">Accent</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 min-w-0">
                    {ACCENTS.map((a) => (
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
                      { id: 'comfortable' as DensityPref, label: 'Comfortable' },
                      { id: 'compact' as DensityPref, label: 'Compact' },
                    ]).map((d) => (
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

                <div>
                  <div className="flex items-baseline justify-between gap-3 mb-2">
                    <label className="block text-xs font-medium text-content-secondary">Background circle blur</label>
                    <span className="text-xs text-content-tertiary tabular-nums">
                      {prefs.reduceMotion ? '24px (Reduce motion)' : `${prefs.orbBlurPx}px`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={24}
                    step={1}
                    value={prefs.orbBlurPx}
                    onChange={e => patchPrefs({ orbBlurPx: Number(e.target.value) })}
                    className="w-full accent-ark-blue-400"
                    aria-label="Background circle blur"
                  />
                  <div className="flex justify-between text-[10px] text-content-tertiary uppercase tracking-wide mt-1">
                    <span>Sharp / bright</span>
                    <span>Soft / dim</span>
                  </div>
                  <p className="text-[11px] text-content-tertiary mt-1.5 leading-relaxed">
                    {prefs.reduceMotion
                      ? `Circles stay at maximum soft blur while Reduce motion is on. Your saved level is ${prefs.orbBlurPx}px and comes back when you turn Reduce motion off.`
                      : 'Drag left for brighter sharp circles. Drag right for softer dimmer circles.'}
                  </p>
                </div>

                <ToggleRow
                  label="Reduce motion"
                  hint="Freezes the bouncing circles and switches them to maximum soft blur. Turn off to restore movement and your blur setting."
                  value={prefs.reduceMotion}
                  onChange={v => patchPrefs({ reduceMotion: v })}
                />
              </div>
            </SettingsSection>
          )}


          {activeSection === 'ai' && (
            <SettingsSection title="AI">
              <div className="space-y-6 max-w-3xl">
                {/* Status */}
                <div className="ark-card p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-nova-accent-green/10 flex items-center justify-center shrink-0">
                    <Cpu className="w-5 h-5 text-nova-accent-green" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-content-primary">Routing brain</p>
                    <p className="text-xs text-content-secondary">
                      {AI_MODES.find((m) => m.value === aiMode)?.label ?? 'Automatic'}
                    </p>
                  </div>
                  <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
                </div>

                <div className="rounded-xl border border-surface-border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <p className="text-sm font-medium text-content-primary">NOVA Brain details</p>
                  <button
                    type="button"
                    className="nova-btn-secondary text-xs shrink-0 self-start sm:self-center"
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
                    {AI_MODES.map((mode) => (
                      <button
                        key={mode.value}
                        type="button"
                        onClick={() => {
                          patchPrefs({ aiMode: mode.value as AiModePref });
                          if (settings) updateSettings({ ai_mode: mode.value as typeof settings.ai_mode });
                        }}
                        className={`w-full text-left p-3 rounded-lg border transition-all ${
                          aiMode === mode.value
                            ? 'border-nova-blue-400 bg-nova-blue-500/10'
                            : 'border-surface-border hover:border-surface-border-light'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className={`text-sm font-medium ${aiMode === mode.value ? 'text-nova-blue-300' : 'text-content-primary'}`}>
                              {mode.label}
                            </p>
                            {'hint' in mode && mode.hint ? (
                              <p className="text-xs text-content-tertiary mt-0.5">{mode.hint}</p>
                            ) : null}
                          </div>
                          {aiMode === mode.value && <Check className="w-4 h-4 text-nova-blue-400 shrink-0" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </SettingsGroup>

                <SettingsGroup title="Failover & cloud">
                  <div className="rounded-xl border border-surface-border px-3 divide-y divide-white/[0.06]">
                    <ToggleRow
                      bare
                      label="Auto failover"
                      value={prefs.autoFailover}
                      onChange={v => patchPrefs({ autoFailover: v })}
                    />
                    <ToggleRow
                      bare
                      label="Ask before cloud failover"
                      value={prefs.askBeforeCloudFailover}
                      onChange={v => patchPrefs({ askBeforeCloudFailover: v })}
                    />
                  </div>
                </SettingsGroup>

                {/* Chat behavior */}
                <SettingsGroup title="Chat behavior">
                  <div className="rounded-xl border border-surface-border px-3 divide-y divide-white/[0.06]">
                    <ToggleRow
                      bare
                      label="Stream responses"
                      value={prefs.streamResponses}
                      onChange={v => patchPrefs({ streamResponses: v })}
                    />
                    <ToggleRow
                      bare
                      label="Remember chat context"
                      value={prefs.rememberContext}
                      onChange={v => patchPrefs({ rememberContext: v })}
                    />
                  </div>
                </SettingsGroup>

                <SettingsGroup title="Skills">
                  <p className="text-[11px] text-content-tertiary leading-relaxed mb-3">
                    NOVA skills are build contracts injected into create and edit prompts so Auto builds stay Preview-ready.
                    Drop custom packs in a bound project at <span className="font-mono text-content-secondary">.nova/skills/packName/SKILL.md</span>.
                    Preview contract stays on for every create/build.
                  </p>
                  <div className="rounded-xl border border-surface-border px-3 divide-y divide-white/[0.06]">
                    {listBuiltinSkillPacks().map((pack) => {
                      const locked = Boolean(pack.alwaysOnCreate);
                      const on = locked || enabledSkills.includes(pack.id as BuiltinNovaSkillId);
                      return (
                        <ToggleRow
                          key={pack.id}
                          bare
                          disabled={locked}
                          label={locked ? `${pack.name} (always on)` : pack.name}
                          hint={pack.summary}
                          value={on}
                          onChange={v => {
                            if (locked) return;
                            toggleSkillEnabled(pack.id as BuiltinNovaSkillId, v);
                            setEnabledSkills(getEnabledSkillIds());
                            setSavedFlash('Saved on this device');
                            window.setTimeout(() => setSavedFlash(''), 2200);
                          }}
                        />
                      );
                    })}
                  </div>
                </SettingsGroup>

                {/* Model discovery */}
                <SettingsGroup title="Model discovery">
                  <div className="rounded-xl border border-surface-border px-3 divide-y divide-white/[0.06]">
                    <ToggleRow
                      bare
                      label="Hunt new models online"
                      value={prefs.huntInternetModels}
                      onChange={v => patchPrefs({ huntInternetModels: v })}
                    />
                    <ToggleRow
                      bare
                      label="Download next when a model runs out"
                      value={prefs.autoInstallHuntModels}
                      onChange={v => patchPrefs({ autoInstallHuntModels: v })}
                    />
                  </div>
                </SettingsGroup>

                {/* Local GGUF */}
                <SettingsGroup title="Local GGUF (advanced)">
                  <div className="rounded-xl border border-surface-border p-5 space-y-6 bg-surface/30">
                    <div className="rounded-lg border border-surface-border/80 bg-nova-navy-950/40 px-3 py-2.5">
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

    </>
  );
}
