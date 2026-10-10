/** Catalog metadata only; keeping it outside a React view allows SearchPanel to import safely. */
export type CloudModelTier = 'free' | 'pro';

export type CloudModel = {
  id: string;
  name: string;
  description: string;
  provider: string;
  category: 'chat' | 'coding' | 'reasoning' | 'vision' | 'image' | 'video' | 'fast';
  tiers: CloudModelTier[];
  recommended?: boolean;
  tone: string;
  initial: string;
};

export const CLOUD_MODELS: CloudModel[] = [
  // Chat
  { id: 'gpt-4o', name: 'GPT-4o', description: 'Flagship multimodal chat and coding.', provider: 'OpenAI', category: 'chat', tiers: ['pro'], tone: 'from-emerald-400 to-green-800', initial: '4o' },
  { id: 'gpt-4o-mini', name: 'GPT-4o mini', description: 'Fast, affordable everyday chat.', provider: 'OpenAI', category: 'chat', tiers: ['pro'], tone: 'from-green-400 to-emerald-700', initial: '4m' },
  { id: 'claude-sonnet', name: 'Claude Sonnet', description: 'Strong general assistant with long context.', provider: 'Anthropic', category: 'chat', tiers: ['pro'], tone: 'from-amber-500 to-orange-800', initial: 'CS' },
  { id: 'claude-haiku', name: 'Claude Haiku', description: 'Quick replies for lighter tasks.', provider: 'Anthropic', category: 'chat', tiers: ['pro'], tone: 'from-orange-400 to-amber-700', initial: 'CH' },
  { id: 'gemini-2-flash', name: 'Gemini 2.0 Flash', description: 'Fast Google model with strong multimodal support.', provider: 'Google', category: 'chat', tiers: ['free', 'pro'], tone: 'from-blue-500 to-sky-700', initial: 'G2' },
  { id: 'gemini-15-pro', name: 'Gemini 1.5 Pro', description: 'Long context Google model.', provider: 'Google', category: 'chat', tiers: ['free', 'pro'], tone: 'from-sky-500 to-blue-800', initial: 'G1' },
  { id: 'llama31-405b', name: 'Llama 3.1 405B', description: 'Large open chat model via cloud hosts.', provider: 'OpenRouter', category: 'chat', tiers: ['free', 'pro'], tone: 'from-violet-500 to-indigo-800', initial: '405' },
  { id: 'mistral-large', name: 'Mistral Large', description: 'High quality Mistral chat model.', provider: 'Mistral', category: 'chat', tiers: ['pro'], tone: 'from-orange-500 to-red-700', initial: 'ML' },
  { id: 'command-r-plus', name: 'Command R+', description: 'Cohere chat model with strong tools support.', provider: 'Cohere', category: 'chat', tiers: ['pro'], tone: 'from-emerald-500 to-teal-800', initial: 'CR' },
  { id: 'xai-chat-2', name: 'xAI Chat 2', description: 'xAI chat model for general work.', provider: 'xAI', category: 'chat', tiers: ['free', 'pro'], tone: 'from-zinc-400 to-black', initial: 'xA' },
  { id: 'hf-llama-31', name: 'Llama 3.1 8B (HF)', description: 'Open chat via Hugging Face Inference.', provider: 'Hugging Face', category: 'chat', tiers: ['free', 'pro'], tone: 'from-yellow-500 to-amber-700', initial: 'HF' },
  { id: 'nvidia-llama-31', name: 'Llama 3.1 8B (NIM)', description: 'NVIDIA NIM hosted Llama for coding and chat.', provider: 'NVIDIA', category: 'chat', tiers: ['free', 'pro'], tone: 'from-lime-500 to-green-800', initial: 'NV' },
  // Coding
  { id: 'claude-sonnet-code', name: 'Claude Sonnet (Coding)', description: 'Excellent for code edits and agent work.', provider: 'Anthropic', category: 'coding', tiers: ['pro'], tone: 'from-amber-500 to-orange-800', initial: 'CC' },
  { id: 'gpt-4o-code', name: 'GPT-4o (Coding)', description: 'Strong coding and tool use.', provider: 'OpenAI', category: 'coding', tiers: ['pro'], tone: 'from-emerald-400 to-green-800', initial: '4C' },
  { id: 'deepseek-v3', name: 'DeepSeek V3', description: 'High value coding and general cloud model.', provider: 'DeepSeek', category: 'coding', tiers: ['free', 'pro'], tone: 'from-blue-400 to-indigo-700', initial: 'DV' },
  { id: 'deepseek-coder', name: 'DeepSeek Coder', description: 'Specialized coding via DeepSeek API.', provider: 'DeepSeek', category: 'coding', tiers: ['free', 'pro'], tone: 'from-cyan-500 to-blue-800', initial: 'DC' },
  { id: 'codestral', name: 'Codestral', description: 'Mistral coding model in the cloud.', provider: 'Mistral', category: 'coding', tiers: ['free', 'pro'], tone: 'from-orange-400 to-amber-700', initial: 'Cs' },
  { id: 'qwen-coder-plus', name: 'Qwen2.5-Coder Plus', description: 'Cloud coding model via OpenRouter hosts.', provider: 'OpenRouter', category: 'coding', tiers: ['free', 'pro'], tone: 'from-sky-500 to-blue-700', initial: 'QC' },
  { id: 'groq-llama33', name: 'Llama 3.3 70B (Groq)', description: 'Fast free-tier coding/chat via Groq. NOVA Router.', provider: 'Groq', category: 'coding', tiers: ['free'], tone: 'from-orange-500 to-red-700', initial: 'Gq' },
  { id: 'openrouter-llama-free', name: 'Llama 3.3 Free (OpenRouter)', description: 'OpenRouter free route. NOVA Router.', provider: 'OpenRouter', category: 'coding', tiers: ['free'], tone: 'from-violet-500 to-indigo-800', initial: 'OR' },
  { id: 'github-gpt4o', name: 'GPT-4o (GitHub Models)', description: 'GitHub Models retired July 2026. Not available in NOVA.', provider: 'GitHub Models', category: 'coding', tiers: ['free'], tone: 'from-zinc-500 to-zinc-900', initial: 'GH' },
  // Reasoning
  { id: 'o3-mini', name: 'o3-mini', description: 'OpenAI reasoning model for harder tasks.', provider: 'OpenAI', category: 'reasoning', tiers: ['pro'], tone: 'from-emerald-500 to-teal-800', initial: 'o3' },
  { id: 'o1-mini', name: 'o1-mini', description: 'Compact reasoning for math and planning.', provider: 'OpenAI', category: 'reasoning', tiers: ['pro'], tone: 'from-green-500 to-emerald-800', initial: 'o1' },
  { id: 'deepseek-r1', name: 'DeepSeek-R1', description: 'Strong open reasoning model in the cloud.', provider: 'DeepSeek', category: 'reasoning', tiers: ['free', 'pro'], tone: 'from-fuchsia-500 to-purple-800', initial: 'R1' },
  { id: 'claude-opus', name: 'Claude Opus', description: 'Deep analysis and complex multi step work.', provider: 'Anthropic', category: 'reasoning', tiers: ['pro'], tone: 'from-amber-600 to-orange-900', initial: 'CO' },
  { id: 'qwq-cloud', name: 'QwQ', description: 'Qwen reasoning model via cloud hosts.', provider: 'OpenRouter', category: 'reasoning', tiers: ['free', 'pro'], tone: 'from-rose-500 to-pink-800', initial: 'Qw' },
  // Vision
  { id: 'gpt-4o-vision', name: 'GPT-4o Vision', description: 'Image understanding and screenshot analysis.', provider: 'OpenAI', category: 'vision', tiers: ['pro'], tone: 'from-emerald-400 to-green-800', initial: '4V' },
  { id: 'claude-vision', name: 'Claude Vision', description: 'Read images, PDFs, and UI screenshots.', provider: 'Anthropic', category: 'vision', tiers: ['pro'], tone: 'from-amber-500 to-orange-800', initial: 'CV' },
  { id: 'gemini-vision', name: 'Gemini Vision', description: 'Multimodal Google vision workflows.', provider: 'Google', category: 'vision', tiers: ['free', 'pro'], tone: 'from-blue-500 to-sky-700', initial: 'GV' },
  { id: 'llama-vision-cloud', name: 'Llama 3.2 Vision', description: 'Open vision model via cloud hosts.', provider: 'Together AI', category: 'vision', tiers: ['free', 'pro'], tone: 'from-indigo-400 to-violet-800', initial: 'LV' },
  // Image generation
  { id: 'NOVA-pollinations', name: 'NOVA Image (Pollinations)', description: 'Retired. Disabled in NOVA — use Hugging Face FLUX or a local image model.', provider: 'Pollinations', category: 'image', tiers: ['free'], tone: 'from-zinc-500 to-zinc-800', initial: 'Po' },
  { id: 'dall-e-3', name: 'DALL·E 3', description: 'Image generation from OpenAI.', provider: 'OpenAI', category: 'image', tiers: ['pro'], tone: 'from-pink-500 to-rose-800', initial: 'D3' },
  { id: 'imagen-3', name: 'Imagen 3', description: 'Google image generation.', provider: 'Google', category: 'image', tiers: ['pro'], tone: 'from-sky-400 to-blue-700', initial: 'Im' },
  { id: 'flux-pro', name: 'FLUX Pro', description: 'High quality image generation.', provider: 'Together AI', category: 'image', tiers: ['pro'], tone: 'from-violet-500 to-purple-800', initial: 'Fx' },
  { id: 'flux-schnell', name: 'FLUX Schnell', description: 'Fast image drafts and iterations.', provider: 'Fireworks AI', category: 'image', tiers: ['free', 'pro'], tone: 'from-fuchsia-500 to-pink-700', initial: 'FS' },
  { id: 'sdxl', name: 'Stable Diffusion XL', description: 'Open image model via cloud hosts.', provider: 'Hugging Face', category: 'image', tiers: ['free', 'pro'], tone: 'from-yellow-500 to-amber-700', initial: 'SD' },
  { id: 'hf-flux-free', name: 'FLUX (HF Inference)', description: 'Primary free-key image path via your Hugging Face token.', provider: 'Hugging Face', category: 'image', tiers: ['free'], recommended: true, tone: 'from-yellow-400 to-orange-700', initial: 'HF' },
  { id: 'hf-flux-schnell', name: 'FLUX.1 schnell (HF)', description: 'Fast free-key images via Hugging Face.', provider: 'Hugging Face', category: 'image', tiers: ['free', 'pro'], recommended: true, tone: 'from-yellow-400 to-orange-700', initial: 'FX' },
  // Free-tier routes
  { id: 'or-llama-free', name: 'Llama 3.3 70B (OpenRouter Free)', description: 'Free OpenRouter coding/chat route when available.', provider: 'OpenRouter', category: 'coding', tiers: ['free'], tone: 'from-violet-400 to-indigo-700', initial: 'OR' },
  { id: 'groq-llama', name: 'Llama 3.3 70B (Groq)', description: 'Fast free-tier coding chat via Groq key.', provider: 'Groq', category: 'coding', tiers: ['free'], tone: 'from-orange-400 to-red-700', initial: 'Gq' },
  { id: 'gemini-flash-code', name: 'Gemini 2.0 Flash (Coding)', description: 'Free-tier Google coding assistant.', provider: 'Google', category: 'coding', tiers: ['free'], tone: 'from-blue-400 to-sky-700', initial: 'Gc' },
];
