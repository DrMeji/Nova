import { useEffect, useState } from 'react';
import { ExternalLink, KeyRound, Loader2, X, Check } from 'lucide-react';
import { getProviderApiKeys, setProviderApiKey } from '@/lib/localPrefs';
import { openInSystemBrowser } from '@/lib/openExternal';

type FreeKeyProvider = {
  id: string;
  name: string;
  signupUrl: string;
  blurb: string;
};

const FREE_KEYS: FreeKeyProvider[] = [
  {
    id: 'groq',
    name: 'Groq',
    signupUrl: 'https://console.groq.com/keys',
    blurb: 'Fast free Llama — best first free key.',
  },
  {
    id: 'google',
    name: 'Google AI Studio',
    signupUrl: 'https://aistudio.google.com/apikey',
    blurb: 'Gemini free tier — one key.',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    signupUrl: 'https://openrouter.ai/keys',
    blurb: 'Many free routes · good backup.',
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    signupUrl: 'https://huggingface.co/settings/tokens',
    blurb: 'Free chat + FLUX images.',
  },
  {
    id: 'together',
    name: 'Together AI',
    signupUrl: 'https://api.together.xyz/settings/api-keys',
    blurb: 'Open model hosting.',
  },
];

export function FreeKeyWizard({
  open,
  onClose,
  preferIds,
}: {
  open: boolean;
  onClose: () => void;
  preferIds?: string[];
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const keys = getProviderApiKeys();
    const map: Record<string, boolean> = {};
    for (const p of FREE_KEYS) map[p.id] = Boolean(keys[p.id]);
    setSaved(map);
  }, [open]);

  if (!open) return null;

  const ordered = [...FREE_KEYS].sort((a, b) => {
    const ap = preferIds?.includes(a.id) ? 0 : 1;
    const bp = preferIds?.includes(b.id) ? 0 : 1;
    return ap - bp;
  });

  const saveOne = (id: string) => {
    setBusyId(id);
    try {
      const value = drafts[id]?.trim() || '';
      setProviderApiKey(id, value);
      setSaved(prev => ({ ...prev, [id]: Boolean(value) }));
      if (value) setDrafts(prev => ({ ...prev, [id]: '' }));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/60" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-surface-border bg-ark-navy-950 shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 flex items-center justify-between gap-3 px-5 py-4 border-b border-surface-border bg-ark-navy-950/95 backdrop-blur">
          <div className="flex items-center gap-2 min-w-0">
            <KeyRound className="w-4 h-4 text-sky-400 shrink-0" />
            <div>
              <h2 className="text-base font-semibold text-content-primary">Connect a free key</h2>
              <p className="text-[11px] text-content-tertiary">Unlock ARK Auto failover — keys stay on this device.</p>
            </div>
          </div>
          <button type="button" className="w-8 h-8 rounded-lg hover:bg-surface-hover flex items-center justify-center" onClick={onClose}>
            <X className="w-4 h-4 text-content-tertiary" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {ordered.map(p => (
            <div key={p.id} className="rounded-xl border border-surface-border bg-surface-hover/20 p-3.5 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-content-primary">{p.name}</p>
                  <p className="text-[11px] text-content-tertiary mt-0.5">{p.blurb}</p>
                </div>
                {saved[p.id] && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 shrink-0">
                    <Check className="w-3 h-3" /> Connected
                  </span>
                )}
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300"
                onClick={() => void openInSystemBrowser(p.signupUrl)}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Get free key
              </button>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={drafts[p.id] || ''}
                  onChange={e => setDrafts(prev => ({ ...prev, [p.id]: e.target.value }))}
                  placeholder={saved[p.id] ? 'Paste new key to replace' : 'Paste API key'}
                  className="ark-input flex-1 text-sm"
                />
                <button
                  type="button"
                  className="ark-btn-primary shrink-0"
                  disabled={busyId === p.id || !(drafts[p.id] || '').trim()}
                  onClick={() => saveOne(p.id)}
                >
                  {busyId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 pb-5">
          <button type="button" className="ark-btn-secondary w-full" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
