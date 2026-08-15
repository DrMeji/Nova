import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import {
  User, Palette, Zap, Boxes, Cloud, Shield, HardDrive,
  FolderKanban, Lock, RefreshCw, ChevronRight, Check,
} from 'lucide-react';

const SECTIONS = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'ai', label: 'AI', icon: Zap },
  { id: 'models', label: 'Models', icon: Boxes },
  { id: 'providers', label: 'Providers', icon: Cloud },
  { id: 'privacy', label: 'Privacy', icon: Shield },
  { id: 'storage', label: 'Storage', icon: HardDrive },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'security', label: 'Security', icon: Lock },
  { id: 'updates', label: 'Updates', icon: RefreshCw },
];

const AI_MODES = [
  { value: 'automatic', label: 'Automatic', description: 'ARK Router: local → free keys → paid' },
  { value: 'local_only', label: 'Local Only', description: 'Always use local AI, never use cloud' },
  { value: 'cloud_when_available', label: 'Cloud When Available', description: 'Prefer free/paid cloud, local as backup' },
  { value: 'local_fallback', label: 'Local Fallback', description: 'Try cloud first, then ARK Engine' },
];

export function Settings() {
  const { user, profile, settings, updateSettings, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [activeSection, setActiveSection] = useState('account');

  return (
    <div className="h-full flex animate-fade-in">
      {/* Settings sidebar */}
      <div className="w-56 shrink-0 border-r border-surface-border p-3 overflow-auto">
        <p className="text-2xs uppercase tracking-wider text-content-tertiary font-semibold px-3 py-2">Settings</p>
        <nav className="flex flex-col gap-0.5">
          {SECTIONS.map(section => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`ark-nav-item ${activeSection === section.id ? 'active' : ''}`}
            >
              <section.icon className="w-4 h-4 shrink-0" />
              <span>{section.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Settings content */}
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-2xl">
          {activeSection === 'account' && (
            <SettingsSection title="Account" description="Manage your ARK account">
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-ark-blue-500/20 border border-ark-blue-500/30 flex items-center justify-center text-lg font-bold text-ark-blue-300">
                    {(profile?.display_name ?? user?.email ?? '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-content-primary">{profile?.display_name ?? 'ARK User'}</p>
                    <p className="text-xs text-content-tertiary">{user?.email}</p>
                  </div>
                </div>
                <Field label="Display Name" value={profile?.display_name ?? ''} onChange={() => {}} />
                <Field label="Email" value={user?.email ?? ''} onChange={() => {}} disabled />
                <button onClick={signOut} className="ark-btn-secondary !text-ark-accent-red">
                  Sign Out
                </button>
              </div>
            </SettingsSection>
          )}

          {activeSection === 'appearance' && (
            <SettingsSection title="Appearance" description="Customize how ARK looks">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-content-secondary mb-2">Theme</label>
                  <div className="grid grid-cols-2 gap-3">
                    <ThemeCard label="Dark" active={theme === 'dark'} onClick={() => setTheme('dark')} />
                    <ThemeCard label="Light" active={theme === 'light'} onClick={() => setTheme('light')} />
                  </div>
                </div>
              </div>
            </SettingsSection>
          )}

          {activeSection === 'ai' && settings && (
            <SettingsSection title="AI" description="Configure how ARK routes your AI requests">
              <div className="space-y-3">
                <label className="block text-xs font-medium text-content-secondary mb-1">Preferred Mode</label>
                {AI_MODES.map(mode => (
                  <button
                    key={mode.value}
                    onClick={() => updateSettings({ ai_mode: mode.value as typeof settings.ai_mode })}
                    className={`w-full text-left p-4 rounded-lg border transition-all ${
                      settings.ai_mode === mode.value
                        ? 'border-ark-blue-400 bg-ark-blue-500/10'
                        : 'border-surface-border hover:border-surface-border-light'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`text-sm font-medium ${settings.ai_mode === mode.value ? 'text-ark-blue-300' : 'text-content-primary'}`}>{mode.label}</p>
                        <p className="text-xs text-content-tertiary mt-0.5">{mode.description}</p>
                      </div>
                      {settings.ai_mode === mode.value && <Check className="w-4 h-4 text-ark-blue-400" />}
                    </div>
                  </button>
                ))}
              </div>
            </SettingsSection>
          )}

          {activeSection === 'models' && (
            <SettingsSection title="Models" description="Manage local and cloud AI models">
              <p className="text-sm text-content-secondary">Model management is available in the Models section.</p>
            </SettingsSection>
          )}

          {activeSection === 'providers' && (
            <SettingsSection title="Providers" description="Connect and manage AI providers">
              <p className="text-sm text-content-secondary">Provider connections are managed in the Models section.</p>
            </SettingsSection>
          )}

          {activeSection === 'privacy' && settings && (
            <SettingsSection title="Privacy" description="Control how your data is handled">
              <div className="space-y-4">
                <ToggleRow
                  label="Keep project files on this device"
                  description="Project source code stays local by default"
                  value={settings.keep_files_local}
                  onChange={v => updateSettings({ keep_files_local: v })}
                />
                <ToggleRow
                  label="Allow optional cloud sync"
                  description="Sync project metadata across your devices"
                  value={settings.allow_cloud_sync}
                  onChange={v => updateSettings({ allow_cloud_sync: v })}
                />
                <ToggleRow
                  label="Send anonymous diagnostics"
                  description="Help improve ARK by sending anonymous usage data"
                  value={settings.send_diagnostics}
                  onChange={v => updateSettings({ send_diagnostics: v })}
                />
              </div>
            </SettingsSection>
          )}

          {activeSection === 'storage' && (
            <SettingsSection title="Storage" description="Manage local storage and model files">
              <div className="space-y-3">
                <div className="ark-card p-4">
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-content-primary">Model Storage</span>
                    <span className="text-xs text-content-tertiary">6.7 GB used</span>
                  </div>
                  <div className="h-2 bg-ark-navy-800 rounded-full overflow-hidden">
                    <div className="h-full bg-ark-blue-500 rounded-full" style={{ width: '35%' }} />
                  </div>
                </div>
                <div className="ark-card p-4">
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-content-primary">Project Storage</span>
                    <span className="text-xs text-content-tertiary">124 MB used</span>
                  </div>
                  <div className="h-2 bg-ark-navy-800 rounded-full overflow-hidden">
                    <div className="h-full bg-ark-accent-green rounded-full" style={{ width: '5%' }} />
                  </div>
                </div>
              </div>
            </SettingsSection>
          )}

          {activeSection === 'projects' && (
            <SettingsSection title="Projects" description="Configure project defaults">
              <div className="space-y-4">
                <Field label="Default Project Location" value="~/ARK/Projects" onChange={() => {}} />
                <Field label="Preferred Language" value={settings?.preferred_language ?? 'TypeScript'} onChange={() => {}} />
              </div>
            </SettingsSection>
          )}

          {activeSection === 'security' && (
            <SettingsSection title="Security" description="Security and sandbox settings">
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-4 ark-card">
                  <div className="w-9 h-9 rounded-lg bg-ark-accent-green/10 flex items-center justify-center shrink-0">
                    <Shield className="w-4 h-4 text-ark-accent-green" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-content-primary">Project Sandbox</p>
                    <p className="text-xs text-content-tertiary">AI agent operates within project boundaries</p>
                  </div>
                  <span className="text-xs text-ark-accent-green">Enabled</span>
                </div>
                <div className="flex items-center gap-3 p-4 ark-card">
                  <div className="w-9 h-9 rounded-lg bg-ark-accent-green/10 flex items-center justify-center shrink-0">
                    <Lock className="w-4 h-4 text-ark-accent-green" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-content-primary">Credential Storage</p>
                    <p className="text-xs text-content-tertiary">API keys stored in OS secure storage</p>
                  </div>
                  <span className="text-xs text-ark-accent-green">Active</span>
                </div>
              </div>
            </SettingsSection>
          )}

          {activeSection === 'updates' && (
            <SettingsSection title="Updates" description="Keep ARK up to date">
              <div className="ark-card p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-content-primary">ARK v0.1.0</p>
                  <p className="text-xs text-content-tertiary">Up to date</p>
                </div>
                <Check className="w-5 h-5 text-ark-accent-green" />
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

function Field({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-medium text-content-secondary mb-1.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="ark-input disabled:opacity-60"
      />
    </div>
  );
}

function ToggleRow({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-4 ark-card">
      <div className="flex-1 mr-4">
        <p className="text-sm font-medium text-content-primary">{label}</p>
        <p className="text-xs text-content-tertiary mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-10 h-5.5 rounded-full transition-colors shrink-0 ${value ? 'bg-content-primary' : 'bg-ark-navy-700'}`}
        style={{ height: '22px', width: '40px' }}
      >
        <div
          className={`absolute top-0.5 w-4.5 h-4.5 bg-white rounded-full transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`}
          style={{ width: '18px', height: '18px' }}
        />
      </button>
    </div>
  );
}

function ThemeCard({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
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

