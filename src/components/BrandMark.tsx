import type { ComponentType, ReactNode, SVGProps } from 'react';
import { Check } from 'lucide-react';
import {
  Atlassian,
  ClaudeIcon,
  CohereIcon,
  Datadog,
  Deepseek,
  DiscordIcon,
  Figma,
  Fireworks,
  Flux,
  GithubIcon,
  GoogleCalendar,
  GoogleDrive,
  GoogleGeminiIcon,
  GoogleGmail,
  GoogleIcon,
  GrokIcon,
  Groq,
  HuggingFaceIcon,
  Hubspot,
  IntercomIcon,
  LinearIcon,
  MetaIcon,
  MicrosoftIcon,
  MicrosoftTeams,
  MistralAiIcon,
  MondayIcon,
  NeonIcon,
  NotionIcon,
  Nvidia,
  OllamaIcon,
  OpenaiIcon,
  PerplexityIcon,
  RunwayIcon,
  Salesforce,
  Shopify,
  SlackIcon,
  StabilityAiIcon,
  Stripe,
  SupabaseIcon,
  Telegram,
  Together,
  VercelIcon,
  WhatsappIcon,
  Wix,
  Xai,
  ZoomIcon,
} from '@dev.icons/react';

type Size = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_CLASS: Record<Size, string> = {
  xs: 'w-3.5 h-3.5 rounded',
  sm: 'w-9 h-9 rounded-xl',
  md: 'w-10 h-10 rounded-xl',
  lg: 'w-11 h-11 rounded-xl',
};

const TEXT_CLASS: Record<Size, string> = {
  xs: 'text-[7px]',
  sm: 'text-[10px]',
  md: 'text-[10px]',
  lg: 'text-sm',
};

const ICON_PX: Record<Size, number> = {
  xs: 11,
  sm: 22,
  md: 24,
  lg: 28,
};

type IconComp = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string; mono?: boolean }>;

type DevMark = {
  bg: string;
  Icon: IconComp;
  /** Black/monochrome glyph — force white via currentColor */
  monoWhite?: boolean;
  /** Slightly larger glyph inside the tile */
  scale?: string;
};

/** Official logos from https://devicons.io (@dev.icons/react). */
const DEVICONS: Record<string, DevMark> = {
  openai: { bg: 'bg-white', Icon: OpenaiIcon },
  anthropic: { bg: 'bg-[#D97757]', Icon: ClaudeIcon },
  claude: { bg: 'bg-[#D97757]', Icon: ClaudeIcon },
  google: { bg: 'bg-white', Icon: GoogleIcon },
  gemini: { bg: 'bg-white', Icon: GoogleGeminiIcon },
  discord: { bg: 'bg-white', Icon: DiscordIcon },
  huggingface: { bg: 'bg-[#FFD21E]', Icon: HuggingFaceIcon },
  groq: { bg: 'bg-white', Icon: Groq },
  nvidia: { bg: 'bg-black', Icon: Nvidia, scale: 'w-[90%] h-[90%]' },
  ollama: { bg: 'bg-[#1a1a1a]', Icon: OllamaIcon, monoWhite: true, scale: 'w-[72%] h-[72%]' },
  meta: { bg: 'bg-white', Icon: MetaIcon },
  mistral: { bg: 'bg-white', Icon: MistralAiIcon },
  deepseek: { bg: 'bg-white', Icon: Deepseek },
  github: { bg: 'bg-white', Icon: GithubIcon },
  xai: { bg: 'bg-white', Icon: Xai },
  grok: { bg: 'bg-black', Icon: GrokIcon, monoWhite: true },
  perplexity: { bg: 'bg-white', Icon: PerplexityIcon },
  together: { bg: 'bg-white', Icon: Together },
  fireworks: { bg: 'bg-white', Icon: Fireworks },
  flux: { bg: 'bg-white', Icon: Flux },
  stablediffusion: { bg: 'bg-white', Icon: StabilityAiIcon },
  cohere: { bg: 'bg-white', Icon: CohereIcon },
  microsoft: { bg: 'bg-white', Icon: MicrosoftIcon },
  notion: { bg: 'bg-black', Icon: NotionIcon },
  slack: { bg: 'bg-white', Icon: SlackIcon },
  linear: { bg: 'bg-[#5E6AD2]', Icon: LinearIcon, monoWhite: true },
  figma: { bg: 'bg-[#1E1E1E]', Icon: Figma },
  gdrive: { bg: 'bg-white', Icon: GoogleDrive },
  gcal: { bg: 'bg-white', Icon: GoogleCalendar },
  gmail: { bg: 'bg-white', Icon: GoogleGmail },
  vercel: { bg: 'bg-black', Icon: VercelIcon, monoWhite: true },
  telegram: { bg: 'bg-[#229ED9]', Icon: Telegram, monoWhite: true },
  stripe: { bg: 'bg-white', Icon: Stripe },
  shopify: { bg: 'bg-white', Icon: Shopify },
  whatsapp: { bg: 'bg-[#25D366]', Icon: WhatsappIcon, monoWhite: true },
  zoom: { bg: 'bg-white', Icon: ZoomIcon },
  teams: { bg: 'bg-white', Icon: MicrosoftTeams },
  supabase: { bg: 'bg-[#1c1c1c]', Icon: SupabaseIcon },
  datadog: { bg: 'bg-white', Icon: Datadog },
  runway: { bg: 'bg-black', Icon: RunwayIcon, monoWhite: true },
  hubspot: { bg: 'bg-white', Icon: Hubspot },
  salesforce: { bg: 'bg-white', Icon: Salesforce },
  atlassian: { bg: 'bg-white', Icon: Atlassian },
  monday: { bg: 'bg-white', Icon: MondayIcon },
  intercom: { bg: 'bg-white', Icon: IntercomIcon },
  wix: { bg: 'bg-white', Icon: Wix },
  neon: { bg: 'bg-black', Icon: NeonIcon },
};

type FallbackMark = { bg: string; node: ReactNode };

function Svg({ children, viewBox = '0 0 24 24' }: { children: ReactNode; viewBox?: string }) {
  return (
    <svg viewBox={viewBox} className="w-[62%] h-[62%]" aria-hidden>
      {children}
    </svg>
  );
}

/** Brands not in Devicons (or better as compact glyphs). */
const FALLBACKS: Record<string, FallbackMark> = {
  openrouter: {
    bg: 'bg-[#6566F1]',
    node: (
      <Svg>
        <path fill="#fff" d="M6.5 5.5h4v13h-4zm7.2 0 6.3 6.5-6.3 6.5h-4.3l6.3-6.5-6.3-6.5h4.3z" />
      </Svg>
    ),
  },
  pollinations: {
    bg: 'bg-[#EC4899]',
    node: (
      <Svg>
        <circle cx="12" cy="12" r="3.2" fill="#fff" />
        <circle cx="12" cy="5.2" r="1.6" fill="#fff" opacity=".9" />
        <circle cx="12" cy="18.8" r="1.6" fill="#fff" opacity=".9" />
        <circle cx="5.2" cy="12" r="1.6" fill="#fff" opacity=".9" />
        <circle cx="18.8" cy="12" r="1.6" fill="#fff" opacity=".9" />
      </Svg>
    ),
  },
  qwen: {
    bg: 'bg-[#6366F1]',
    node: (
      <Svg>
        <path fill="#fff" d="M12 3.5 19.5 8v8L12 20.5 4.5 16V8L12 3.5zm0 3.2L7.8 9.1v5.8L12 17.3l4.2-2.4V9.1L12 6.7z" />
      </Svg>
    ),
  },
  gemma: {
    bg: 'bg-[#4285F4]',
    node: (
      <Svg>
        <path fill="#fff" d="M12 4 18.5 8v8L12 20 5.5 16V8L12 4zm0 2.6L7.8 9.1v5.8L12 17.4l4.2-2.5V9.1L12 6.6z" />
      </Svg>
    ),
  },
  phi: {
    bg: 'bg-[#00A4EF]',
    node: (
      <Svg>
        <path fill="#fff" d="M10.2 4.5h2.6c3.4 0 5.6 2.1 5.6 5.3S16.2 15 12.8 15H12v4.5h-2.8V4.5zm2.6 7.7c1.6 0 2.6-.9 2.6-2.4s-1-2.4-2.6-2.4h-.8v4.8h.8z" />
      </Svg>
    ),
  },
  cerebras: {
    bg: 'bg-[#F97316]',
    node: (
      <Svg>
        <path fill="#fff" d="M12 3.5A8.5 8.5 0 1 0 20.5 12 8.5 8.5 0 0 0 12 3.5zm0 13.2A4.7 4.7 0 1 1 16.7 12 4.7 4.7 0 0 1 12 16.7z" />
      </Svg>
    ),
  },
  sambanova: {
    bg: 'bg-[#EE3A8C]',
    node: (
      <Svg viewBox="0 0 24 24">
        <path
          fill="#fff"
          d="M14.2 6.2c-2.1 0-3.6 1.1-4.4 2.8-.6-1.5-1.9-2.8-4-2.8-2.6 0-4.4 2-4.4 4.8 0 2.9 1.9 4.9 4.5 4.9 1.8 0 3.1-.8 3.9-2.1.8 1.3 2.1 2.1 3.9 2.1 2.6 0 4.5-2 4.5-4.9 0-2.8-1.8-4.8-4.4-4.8zm-8.3 7.4c-1.4 0-2.3-1.1-2.3-2.6s.9-2.6 2.3-2.6c1.3 0 2.1.9 2.4 2.1h-2.1v1.1h3.3c0 .1 0 .2 0 .3 0 1.5-.9 2.7-2.7 2.7zm8.2 0c-1.4 0-2.4-1-2.6-2.4h5.1c-.2 1.4-1.2 2.4-2.5 2.4z"
        />
      </Svg>
    ),
  },
  outlook: {
    bg: 'bg-[#0078D4]',
    node: (
      <Svg>
        <path fill="#fff" d="M4 7.2h7.5v9.6H4z" />
        <path fill="#28A8EA" d="M11.5 8.5 20 6.8v10.4l-8.5-1.7V8.5z" />
        <ellipse cx="7.8" cy="12" rx="2.2" ry="2.6" fill="#0078D4" />
      </Svg>
    ),
  },
  canva: {
    bg: 'bg-[#00C4CC]',
    node: (
      <Svg>
        <path fill="#fff" d="M12 3.5c-4.7 0-8.5 3.8-8.5 8.5S7.3 20.5 12 20.5s8.5-3.8 8.5-8.5S16.7 3.5 12 3.5zm1.8 12.2c-1.1.7-2.6.8-3.8.2-1.6-.8-2.3-2.7-1.6-4.4.6-1.4 2-2.2 3.5-2.2.7 0 1.4.2 2 .5l-.7 1.6c-.3-.2-.7-.3-1.1-.3-.8 0-1.5.5-1.8 1.2-.3.8.1 1.7.9 2.1.5.2 1.1.2 1.5-.1.3-.2.5-.5.5-.9h-1.4V12h3.1c0 1.6-.8 3-2.1 3.7z" />
      </Svg>
    ),
  },
  asana: {
    bg: 'bg-[#F06A6A]',
    node: (
      <Svg>
        <circle cx="12" cy="7.5" r="3" fill="#fff" />
        <circle cx="7" cy="16" r="3" fill="#fff" />
        <circle cx="17" cy="16" r="3" fill="#fff" />
      </Svg>
    ),
  },
  ark: {
    bg: 'bg-transparent',
    node: (
      <img
        src={`${import.meta.env.BASE_URL}ark-icon.png`}
        alt=""
        className="w-[88%] h-[88%] object-contain"
        draggable={false}
      />
    ),
  },
};

function resolveBrand(id: string, name?: string): string | null {
  const bare = id.toLowerCase().trim();
  if (DEVICONS[bare] || FALLBACKS[bare]) return bare;
  if (bare === 'github-models') return 'github';
  const raw = `${id} ${name || ''}`.toLowerCase();
  const hay = raw.replace(/[^a-z0-9]+/g, ' ');
  const checks: [string, string][] = [
    ['github', 'github'],
    ['notion', 'notion'],
    ['gmail', 'gmail'],
    ['slack', 'slack'],
    ['linear', 'linear'],
    ['figma', 'figma'],
    ['gdrive', 'gdrive'],
    ['google drive', 'gdrive'],
    ['gcal', 'gcal'],
    ['google calendar', 'gcal'],
    ['google ai', 'google'],
    ['google', 'google'],
    ['gemini', 'gemini'],
    ['imagen', 'google'],
    ['gemma', 'gemma'],
    ['vercel', 'vercel'],
    ['discord', 'discord'],
    ['telegram', 'telegram'],
    ['openai', 'openai'],
    ['gpt', 'openai'],
    ['dall', 'openai'],
    ['anthropic', 'anthropic'],
    ['claude', 'claude'],
    ['hugging face', 'huggingface'],
    ['huggingface', 'huggingface'],
    ['hf-', 'huggingface'],
    ['groq', 'groq'],
    ['nvidia', 'nvidia'],
    ['nim', 'nvidia'],
    ['ollama', 'ollama'],
    ['openrouter', 'openrouter'],
    ['pollinations', 'pollinations'],
    ['qwen', 'qwen'],
    ['qwq', 'qwen'],
    ['llama', 'meta'],
    ['meta', 'meta'],
    ['codellama', 'meta'],
    ['tinyllama', 'meta'],
    ['mistral', 'mistral'],
    ['codestral', 'mistral'],
    ['deepseek', 'deepseek'],
    ['microsoft', 'microsoft'],
    ['phi', 'phi'],
    ['outlook', 'outlook'],
    ['teams', 'teams'],
    ['stripe', 'stripe'],
    ['shopify', 'shopify'],
    ['whatsapp', 'whatsapp'],
    ['zoom', 'zoom'],
    ['supabase', 'supabase'],
    ['datadog', 'datadog'],
    ['canva', 'canva'],
    ['ark-', 'ark'],
    ['ark engine', 'ark'],
    ['ark image', 'ark'],
    ['ark video', 'ark'],
    ['together', 'together'],
    ['fireworks', 'fireworks'],
    ['xai', 'xai'],
    ['grok', 'grok'],
    ['perplexity', 'perplexity'],
    ['sonar', 'perplexity'],
    ['flux', 'flux'],
    ['stable diffusion', 'stablediffusion'],
    ['sdxl', 'stablediffusion'],
    ['sd15', 'stablediffusion'],
    ['sd-15', 'stablediffusion'],
    ['cerebras', 'cerebras'],
    ['sambanova', 'sambanova'],
    ['neon', 'neon'],
    ['hubspot', 'hubspot'],
    ['salesforce', 'salesforce'],
    ['asana', 'asana'],
    ['atlassian', 'atlassian'],
    ['jira', 'atlassian'],
    ['monday', 'monday'],
    ['intercom', 'intercom'],
    ['wix', 'wix'],
    ['runway', 'runway'],
    ['cohere', 'cohere'],
    ['command r', 'cohere'],
    ['starcoder', 'github'],
    ['stability', 'stablediffusion'],
  ];
  for (const [needle, key] of checks) {
    if (hay.includes(needle) || id.toLowerCase() === needle) return key;
  }
  if (DEVICONS[id] || FALLBACKS[id]) return id;
  return null;
}

export function BrandMark({
  id,
  name,
  initial,
  tone,
  size = 'md',
  className = '',
  glyph: _glyph,
}: {
  id: string;
  name?: string;
  initial?: string;
  tone?: string;
  size?: Size;
  className?: string;
  /** @deprecated Kept for call-site compat. Brand logos always win when known. */
  glyph?: 'brain' | 'initial';
}) {
  const key = resolveBrand(id, name);
  const dev = key ? DEVICONS[key] : null;
  if (dev) {
    const Icon = dev.Icon;
    return (
      <span
        className={`${SIZE_CLASS[size]} ${dev.bg} flex items-center justify-center shrink-0 overflow-hidden ${dev.monoWhite ? 'text-white' : ''} ${className}`}
        title={name || id}
      >
        <Icon
          size={ICON_PX[size]}
          mono={dev.monoWhite}
          className={dev.scale || 'w-[68%] h-[68%]'}
          aria-hidden
        />
      </span>
    );
  }

  const fallback = key ? FALLBACKS[key] : null;
  if (fallback) {
    return (
      <span
        className={`${SIZE_CLASS[size]} ${fallback.bg} flex items-center justify-center shrink-0 overflow-hidden ${className}`}
        title={name || id}
      >
        {fallback.node}
      </span>
    );
  }

  return (
    <span
      className={`${SIZE_CLASS[size]} bg-gradient-to-br ${tone || 'from-zinc-600 to-zinc-900'} flex items-center justify-center ${TEXT_CLASS[size]} font-bold text-white shrink-0 ${className}`}
      title={name || id}
    >
      {(initial || (name || id).slice(0, 2)).slice(0, 2)}
    </span>
  );
}

/** Green check without a circular button chrome (installed / enabled). */
export function StatusCheck({ label }: { label: string }) {
  return (
    <span
      className="w-8 h-8 flex items-center justify-center shrink-0 text-emerald-400"
      title={label}
      aria-label={label}
    >
      <Check className="w-4 h-4" strokeWidth={2.5} />
    </span>
  );
}
