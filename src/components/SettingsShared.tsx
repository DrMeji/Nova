import { useEffect, useState, type ReactNode } from 'react';
import type { AccentPref } from '@/lib/localPrefs';

export const AUTO_LOCK_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 5, label: '5 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
];

export const AI_MODES = [
  { value: 'automatic', label: 'Automatic', hint: 'Pick the best path per ask' },
  { value: 'local_only', label: 'Local Only', hint: 'On-device GGUF / Ollama only' },
  { value: 'cloud_when_available', label: 'Hybrid', hint: 'Cloud create + local when useful' },
  { value: 'local_fallback', label: 'Cloud Create', hint: 'Prefer cloud for builds, local backup' },
];

export const DEFAULT_MODELS = [
  { id: 'NOVA-auto', label: 'Nova Multimodal', detail: '', source: 'auto' },
  { id: 'qwen25-coder-14b', label: 'Qwen2.5 Coder 14B', detail: '', source: 'local' },
  { id: 'qwen25-coder-7b', label: 'Qwen2.5 Coder 7B', detail: '', source: 'local' },
  { id: 'llama32-3b', label: 'Llama 3.2 3B', detail: '', source: 'local' },
  { id: 'gpt-4o', label: 'GPT-4o', detail: '', source: 'cloud' },
  { id: 'claude-sonnet', label: 'Claude Sonnet', detail: '', source: 'cloud' },
  { id: 'deepseek-chat', label: 'DeepSeek Chat', detail: '', source: 'cloud' },
  { id: 'gemini-flash', label: 'Gemini 2.0 Flash', detail: '', source: 'cloud' },
];

export const PROVIDER_ROWS = [
  { id: 'openai', name: 'OpenAI', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic', name: 'Anthropic', keyUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'google', name: 'Google AI Studio', keyUrl: 'https://aistudio.google.com/apikey' },
  { id: 'groq', name: 'Groq', keyUrl: 'https://console.groq.com/keys' },
  { id: 'openrouter', name: 'OpenRouter', keyUrl: 'https://openrouter.ai/keys' },
  { id: 'huggingface', name: 'Hugging Face', keyUrl: 'https://huggingface.co/settings/tokens' },
  { id: 'nvidia', name: 'NVIDIA NIM', keyUrl: 'https://build.nvidia.com/settings/api-keys' },
  { id: 'together', name: 'Together AI', keyUrl: 'https://api.together.xyz/settings/api-keys' },
  { id: 'fireworks', name: 'Fireworks', keyUrl: 'https://fireworks.ai/account/api-keys' },
  { id: 'deepseek', name: 'DeepSeek', keyUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'mistral', name: 'Mistral', keyUrl: 'https://console.mistral.ai/api-keys' },
  { id: 'cerebras', name: 'Cerebras', keyUrl: 'https://cloud.cerebras.ai' },
  { id: 'sambanova', name: 'SambaNova', keyUrl: 'https://cloud.sambanova.ai' },
  { id: 'perplexity', name: 'Perplexity', keyUrl: 'https://www.perplexity.ai/settings/api' },
  { id: 'xai', name: 'xAI', keyUrl: 'https://console.x.ai' },
  { id: 'github-models', name: 'GitHub Models' },
];

export const ACCENTS: { id: AccentPref; label: string; swatch: string }[] = [
  { id: 'sky', label: 'Sky', swatch: 'bg-sky-400' },
  { id: 'emerald', label: 'Emerald', swatch: 'bg-emerald-400' },
  { id: 'amber', label: 'Amber', swatch: 'bg-amber-400' },
  { id: 'rose', label: 'Rose', swatch: 'bg-rose-400' },
];

/** Shared bag passed from SettingsContent shell into section panels. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SettingsSharedCtx = Record<string, any>;


export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="animate-fade-in min-w-0">
      <h1 className="text-xl font-bold text-content-primary mb-4">{title}</h1>
      {children}
    </div>
  );
}

export function OAuthClientRow({
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
          steps: 'OAuth App → Device Flow → copy Client ID',
          env: 'NOVA_GITHUB_CLIENT_ID',
        }
      : {
          label: 'Google',
          url: 'https://console.cloud.google.com/apis/credentials',
          steps: 'Desktop/Web OAuth client → paste Client ID',
          env: 'NOVA_GOOGLE_CLIENT_ID',
        };

  useEffect(() => {
    void window.novaDesktop?.pluginOAuthStatus?.().then((s) => {
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
          onClick={() => void window.novaDesktop?.openExternal?.(setup.url)}
        >
          Open console
        </button>
      </div>
      <div className="flex gap-2 items-center">
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={`${setup.env} or paste client id`}
          className="nova-input flex-1 text-sm"
        />
        <button
          type="button"
          className="nova-btn-secondary shrink-0 text-xs"
          onClick={() => {
            void window.novaDesktop?.pluginOAuthSetClient?.(pluginId, value).then((res) => {
              if (res && typeof res === 'object' && 'ok' in res && res.ok === false) {
                onSaved(`Could not save ${pluginId} client id`);
                return;
              }
              onSaved(`${pluginId} client id saved`);
            }).catch(() => {
              onSaved(`Could not save ${pluginId} client id`);
            });
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

export function Field({
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
        className="nova-input disabled:opacity-60"
      />
    </div>
  );
}

export function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-content-primary">{title}</h3>
      {children}
    </section>
  );
}

export function GgufSliderRow({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
  lowLabel,
  highLabel,
}: {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  lowLabel: string;
  highLabel: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-content-primary">{label}</p>
        <span className="text-xs font-mono text-nova-blue-300 tabular-nums shrink-0">{valueLabel}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full mt-1 accent-ark-blue-400"
      />
      <div className="flex justify-between text-[10px] text-content-tertiary uppercase tracking-wide">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  );
}

export function ToggleRow({
  label,
  hint,
  value,
  onChange,
  disabled,
  bare,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  /** When true, skip outer card chrome (for use inside a parent card). */
  bare?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 min-w-0 ${
        bare ? 'py-2.5 px-1' : 'p-4 ark-card'
      } ${disabled ? 'opacity-55' : ''}`}
    >
      <div className="flex-1 min-w-0 pr-3">
        <p className="text-sm font-medium text-content-primary leading-snug">{label}</p>
        {hint ? <p className="text-[11px] text-content-tertiary mt-1 leading-relaxed">{hint}</p> : null}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-[22px] w-10 shrink-0 items-center rounded-full px-0.5 transition-colors disabled:cursor-not-allowed ${
          value ? 'bg-sky-500' : 'bg-white/15'
        }`}
        aria-pressed={value}
        aria-label={label}
      >
        <span
          className={`pointer-events-none block h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform duration-150 ${
            value ? 'translate-x-[18px]' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

export function ThemeCard({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
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

export function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="ark-card p-4">
      <p className="text-xs text-content-tertiary">{title}</p>
      <p className="text-sm font-medium text-content-primary mt-1">{value}</p>
    </div>
  );
}

export function StorageBar({
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
    <div className="ark-card p-4 min-w-0">
      <div className="flex justify-between gap-3 mb-2 min-w-0">
        <span className="text-sm text-content-primary truncate">{label}</span>
        <span className="text-xs text-content-tertiary shrink-0">{used} / {total}</span>
      </div>
      <div className="h-2 bg-nova-navy-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

