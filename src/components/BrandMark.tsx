import type { ComponentType, ReactNode, SVGProps } from 'react';
import { Check } from 'lucide-react';
import {
  Apollo,
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
  GradioIcon,
  GrokIcon,
  Groq,
  HuggingFaceIcon,
  Hubspot,
  IntercomIcon,
  LinearIcon,
  LmStudioIcon,
  MetaIcon,
  MicrosoftIcon,
  MicrosoftTeams,
  Midjourney,
  MistralAiIcon,
  MondayIcon,
  McpIcon,
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
  xs: 'w-3.5 h-3.5',
  sm: 'w-9 h-9',
  md: 'w-10 h-10',
  lg: 'w-11 h-11',
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
  llama: { bg: 'bg-white', Icon: MetaIcon },
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
  apollo: { bg: 'bg-[#FC521F]', Icon: Apollo, monoWhite: true },
  mcp: { bg: 'bg-[#1a1a1a]', Icon: McpIcon, monoWhite: true },
  midjourney: { bg: 'bg-black', Icon: Midjourney, monoWhite: true },
  lmstudio: { bg: 'bg-[#1a1a1a]', Icon: LmStudioIcon, monoWhite: true },
  gradio: { bg: 'bg-white', Icon: GradioIcon },
};

type FallbackMark = { bg: string; node: ReactNode };

/** Clean lettermark tile when no official Devicon exists. */
function Letter({
  text,
  color = '#fff',
}: {
  text: string;
  color?: string;
}) {
  const short = text.slice(0, 2);
  return (
    <span
      className="font-semibold tracking-tight leading-none select-none"
      style={{ color, fontSize: short.length > 1 ? '0.7em' : '0.95em' }}
      aria-hidden
    >
      {short}
    </span>
  );
}

function Svg({ children, viewBox = '0 0 24 24' }: { children: ReactNode; viewBox?: string }) {
  return (
    <svg viewBox={viewBox} className="w-[62%] h-[62%]" aria-hidden>
      {children}
    </svg>
  );
}

/** Brands not in Devicons — professional lettermarks / compact glyphs (not geometric placeholders). */
const FALLBACKS: Record<string, FallbackMark> = {
  openrouter: {
    bg: 'bg-[#6566F1]',
    node: <Letter text="OR" />,
  },
  pollinations: {
    bg: 'bg-[#EC4899]',
    node: <Letter text="Po" />,
  },
  qwen: {
    bg: 'bg-[#6A5ACD]',
    node: <Letter text="Qw" />,
  },
  gemma: {
    bg: 'bg-[#4285F4]',
    node: <Letter text="Ge" />,
  },
  phi: {
    bg: 'bg-[#00A4EF]',
    node: <Letter text="Φ" />,
  },
  cerebras: {
    bg: 'bg-[#F97316]',
    node: <Letter text="Ce" />,
  },
  sambanova: {
    bg: 'bg-[#EE3A8C]',
    node: <Letter text="Sn" />,
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
    node: <Letter text="Ca" />,
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
  quickbooks: {
    bg: 'bg-[#2CA01C]',
    node: <Letter text="Qb" />,
  },
  superhuman: {
    bg: 'bg-[#6E5BFF]',
    node: <Letter text="Su" />,
  },
  llava: { bg: 'bg-[#0EA5E9]', node: <Letter text="Lv" /> },
  moondream: { bg: 'bg-[#F59E0B]', node: <Letter text="Md" /> },
  minicpm: { bg: 'bg-[#10B981]', node: <Letter text="Mv" /> },
  smollm: { bg: 'bg-[#84CC16]', node: <Letter text="Sm" /> },
  playground: { bg: 'bg-[#F43F5E]', node: <Letter text="Pg" /> },
  cogvideo: { bg: 'bg-[#06B6D4]', node: <Letter text="Cv" /> },
  wan: { bg: 'bg-[#6366F1]', node: <Letter text="Wn" /> },
  ltx: { bg: 'bg-[#14B8A6]', node: <Letter text="LT" /> },
  granola: { bg: 'bg-[#059669]', node: <Letter text="Gr" /> },
  plaud: { bg: 'bg-[#7C3AED]', node: <Letter text="Pl" /> },
  otter: { bg: 'bg-[#0D9488]', node: <Letter text="Ot" /> },
  fireflies: { bg: 'bg-[#EA580C]', node: <Letter text="Ff" /> },
  heygen: { bg: 'bg-[#4F46E5]', node: <Letter text="Hy" /> },
  magnific: { bg: 'bg-[#65A30D]', node: <Letter text="Mg" /> },
  higgsfield: { bg: 'bg-[#C026D3]', node: <Letter text="Hf" /> },
  mobbin: { bg: 'bg-[#27272A]', node: <Letter text="Mb" /> },
  zoho: { bg: 'bg-[#E42527]', node: <Letter text="Zo" /> },
  context7: { bg: 'bg-[#D97706]', node: <Letter text="C7" /> },
  exa: { bg: 'bg-[#1D4ED8]', node: <Letter text="Ex" /> },
  productdesign: { bg: 'bg-[#BE185D]', node: <Letter text="PD" /> },
  devpost: { bg: 'bg-[#003E54]', node: <Letter text="Dp" /> },
  gguf: { bg: 'bg-[#0F766E]', node: <Letter text="GG" /> },
  nova: {
    bg: 'bg-transparent',
    node: (
      <svg viewBox="0 0 128 128" className="w-[88%] h-[88%]" aria-hidden fill="none">
        <g stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="64" cy="64" r="8.5" />
          <path d="M64 55.5 V24" />
          <path d="M64 72.5 V104" />
          <path d="M72.5 64 H104" />
          <path d="M55.5 64 H24" />
          <path d="M70.2 57.8 L78 50 L96 50" />
          <path d="M70.2 57.8 L78 50 L78 32" />
          <path d="M57.8 57.8 L50 50 L32 50" />
          <path d="M57.8 57.8 L50 50 L50 32" />
          <path d="M70.2 70.2 L78 78 L96 78" />
          <path d="M70.2 70.2 L78 78 L78 96" />
          <path d="M57.8 70.2 L50 78 L32 78" />
          <path d="M57.8 70.2 L50 78 L50 96" />
        </g>
        <g fill="currentColor">
          <circle cx="64" cy="24" r="3.6" fill="none" stroke="currentColor" strokeWidth="2.6" />
          <circle cx="64" cy="104" r="3.6" fill="none" stroke="currentColor" strokeWidth="2.6" />
          <circle cx="104" cy="64" r="3.6" fill="none" stroke="currentColor" strokeWidth="2.6" />
          <circle cx="24" cy="64" r="3.6" fill="none" stroke="currentColor" strokeWidth="2.6" />
          <circle cx="96" cy="50" r="3.4" />
          <circle cx="78" cy="32" r="3.4" />
          <circle cx="32" cy="50" r="3.4" />
          <circle cx="50" cy="32" r="3.4" />
          <circle cx="96" cy="78" r="3.4" />
          <circle cx="78" cy="96" r="3.4" />
          <circle cx="32" cy="78" r="3.4" />
          <circle cx="50" cy="96" r="3.4" />
        </g>
      </svg>
    ),
  },
};

function resolveBrand(id: string, name?: string): string | null {
  const bare = id.toLowerCase().trim();
  if (DEVICONS[bare] || FALLBACKS[bare]) return bare;
  if (bare === 'github-models') return 'github';
  if (bare === 'outlook-mail' || bare === 'outlook-cal') return 'outlook';
  if (bare === 'product-design') return 'productdesign';
  if (bare === 'gguf-local') return 'gguf';
  if (bare.startsWith('nova-engine') || bare === 'nova-core' || bare === 'nova-image-core' || bare === 'nova-video-core') {
    return 'nova';
  }

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
    ['lm studio', 'lmstudio'],
    ['lmstudio', 'lmstudio'],
    ['openrouter', 'openrouter'],
    ['pollinations', 'pollinations'],
    ['qwen', 'qwen'],
    ['qwq', 'qwen'],
    ['llava', 'llava'],
    ['moondream', 'moondream'],
    ['minicpm', 'minicpm'],
    ['smollm', 'smollm'],
    ['playground', 'playground'],
    ['cogvideo', 'cogvideo'],
    ['wan 2', 'wan'],
    ['wan-', 'wan'],
    ['ltx', 'ltx'],
    ['llama', 'llama'],
    ['meta', 'meta'],
    ['codellama', 'llama'],
    ['tinyllama', 'llama'],
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
    ['granola', 'granola'],
    ['plaud', 'plaud'],
    ['otter', 'otter'],
    ['fireflies', 'fireflies'],
    ['heygen', 'heygen'],
    ['magnific', 'magnific'],
    ['higgsfield', 'higgsfield'],
    ['mobbin', 'mobbin'],
    ['zoho', 'zoho'],
    ['context7', 'context7'],
    ['exa', 'exa'],
    ['apollo', 'apollo'],
    ['product design', 'productdesign'],
    ['devpost', 'devpost'],
    ['midjourney', 'midjourney'],
    ['gradio', 'gradio'],
    ['mcp', 'mcp'],
    ['gguf', 'gguf'],
    ['nova-', 'nova'],
    ['nova engine', 'nova'],
    ['nova image', 'nova'],
    ['nova video', 'nova'],
    ['ark-', 'nova'],
    ['ark engine', 'nova'],
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
    ['quickbooks', 'quickbooks'],
    ['intuit', 'quickbooks'],
    ['superhuman', 'superhuman'],
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
  tone: _tone,
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
        className={`${SIZE_CLASS[size]} bg-transparent flex items-center justify-center shrink-0 overflow-hidden ${dev.monoWhite ? 'text-content-primary' : ''} ${className}`}
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
        className={`${SIZE_CLASS[size]} ${TEXT_CLASS[size]} bg-transparent flex items-center justify-center shrink-0 overflow-hidden text-content-primary ${className}`}
        title={name || id}
      >
        {fallback.node}
      </span>
    );
  }

  // Unknown brand — plain lettermark, no tile behind the glyph.
  const label = (initial || (name || id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 2) || '?').slice(0, 2);
  return (
    <span
      className={`${SIZE_CLASS[size]} bg-transparent flex items-center justify-center ${TEXT_CLASS[size]} font-semibold text-content-primary shrink-0 ${className}`}
      title={name || id}
    >
      {label}
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
