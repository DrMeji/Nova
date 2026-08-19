import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from '@/context/RouterContext';
import {
  Search, Plus, Check, Download, Loader2, Cpu, Cloud, Monitor,
  Code, Boxes, Brain, Eye, Zap, Image as ImageIcon, Video, Gauge, Sparkles, Rocket, X, KeyRound, Globe, RefreshCw, Trash2,
} from 'lucide-react';
import { detectHardware, getAccurateHardware, getHardwareClass, isEngineDownloadable, loadHardwareSnapshot, parseRamGb, type HardwareClass } from '@/lib/api';
import {
  categoryDisplayLabel,
  LOCAL_CATEGORY_ORDER,
  sortModelsByCategoryThenSizeDesc,
} from '@/lib/modelSort';
import { engineDiskSpace, getEngineStatus, deleteEngineModel } from '@/lib/arkEngine';
import {
  cancelEngineDownload,
  getEngineDownloadMap,
  isEngineDownloading,
  reattachEngineDownloads,
  startEngineDownload,
  subscribeEngineDownloads,
} from '@/lib/engineDownloads';
import {
  getProviderApiKeys,
  hasProviderApiKey,
  getLocalPrefs,
  setLocalPrefs,
  setProviderApiKey,
} from '@/lib/localPrefs';
import {
  addEnabledCloudModels,
  isCloudModelEnabled,
  isCloudProviderEnabled,
  listConnectedProviderIds,
  providerIdFromName,
  providerNeedsKey,
  removeEnabledCloudModels,
  setCloudModelEnabled,
  setCloudProviderEnabled,
} from '@/lib/cloudSources';
import {
  isOllamaEnabled,
  probeOllamaOptional,
  setOllamaEnabled,
  type OllamaModel,
} from '@/lib/ollamaOptional';
import { FREE_SOURCES } from '@/lib/freeSources';
import { huntModelsForPc, huntSourceBadge, type HuntedModel } from '@/lib/arkModelHunt';
import { probeLiveCapacity, type LiveCapacity } from '@/lib/arkCapacity';

type TabId = 'for-pc' | 'local' | 'cloud' | 'engine';
type Tier = 'free' | 'pro';
type FitKind = 'quality' | 'balanced' | 'performance';

type LocalModel = {
  id: string;
  name: string;
  description: string;
  size: string;
  category: 'coding' | 'general' | 'reasoning' | 'vision' | 'image' | 'video' | 'fast';
  tiers: Tier[];
  recommended?: boolean;
  tone: string;
  initial: string;
};

type CloudProvider = {
  id: string;
  name: string;
  description: string;
  tiers: Tier[];
  tone: string;
  initial: string;
  /** Catalog ping is not live — Key / Live / Retired badges are the honest status. */
  health: 'available' | 'limited' | 'offline';
  /** Live in ARK Router / media today vs catalog only */
  availability: 'live' | 'coming_soon' | 'retired';
};

export type CloudModel = {
  id: string;
  name: string;
  description: string;
  provider: string;
  category: 'chat' | 'coding' | 'reasoning' | 'vision' | 'image' | 'video' | 'fast';
  tiers: Tier[];
  tone: string;
  initial: string;
};

const LOCAL_MODELS: LocalModel[] = [
  // Coding: local downloads are free to run on your machine
  { id: 'qwen25-coder-7b', name: 'Qwen2.5-Coder 7B', description: 'Strong local coding model for most PCs.', size: '4.7 GB', category: 'coding', tiers: ['free'], recommended: true, tone: 'from-sky-500 to-blue-700', initial: 'Qc' },
  { id: 'qwen25-coder-14b', name: 'Qwen2.5-Coder 14B', description: 'Higher quality coding when you have more VRAM.', size: '9.0 GB', category: 'coding', tiers: ['free'], tone: 'from-blue-500 to-indigo-700', initial: 'Q14' },
  { id: 'qwen25-coder-32b', name: 'Qwen2.5-Coder 32B', description: 'Top tier local coding for high end hardware.', size: '20 GB', category: 'coding', tiers: ['free'], tone: 'from-indigo-500 to-violet-800', initial: 'Q32' },
  { id: 'deepseek-coder-v2-lite', name: 'DeepSeek Coder V2 Lite', description: 'Efficient coding assistant for builds and refactors.', size: '8.9 GB', category: 'coding', tiers: ['free'], tone: 'from-cyan-500 to-teal-700', initial: 'DS' },
  { id: 'codellama-13b', name: 'Code Llama 13B', description: 'Meta coding model for generation and completion.', size: '7.4 GB', category: 'coding', tiers: ['free'], tone: 'from-violet-500 to-purple-800', initial: 'CL' },
  { id: 'starcoder2-7b', name: 'StarCoder2 7B', description: 'Code focused model trained on many languages.', size: '4.3 GB', category: 'coding', tiers: ['free'], tone: 'from-amber-500 to-orange-700', initial: 'Sc' },
  { id: 'codestral-22b', name: 'Codestral 22B', description: 'Mistral coding model for larger local setups.', size: '13 GB', category: 'coding', tiers: ['free'], tone: 'from-orange-500 to-red-700', initial: 'Cs' },

  // General
  { id: 'llama32-3b', name: 'Llama 3.2 3B', description: 'Light general chat for everyday use.', size: '2.0 GB', category: 'general', tiers: ['free'], recommended: true, tone: 'from-violet-500 to-indigo-700', initial: 'L3' },
  { id: 'llama31-8b', name: 'Llama 3.1 8B', description: 'Balanced general model for chat and writing.', size: '4.9 GB', category: 'general', tiers: ['free'], tone: 'from-indigo-500 to-blue-800', initial: 'L8' },
  { id: 'qwen25-7b', name: 'Qwen2.5 7B', description: 'Strong all purpose local chat model.', size: '4.7 GB', category: 'general', tiers: ['free'], tone: 'from-sky-400 to-blue-700', initial: 'Q7' },
  { id: 'qwen25-14b', name: 'Qwen2.5 14B', description: 'Higher quality general assistant.', size: '9.0 GB', category: 'general', tiers: ['free'], tone: 'from-blue-400 to-indigo-700', initial: 'Q14' },
  { id: 'mistral-7b', name: 'Mistral 7B', description: 'Fast, capable open model for general tasks.', size: '4.1 GB', category: 'general', tiers: ['free'], tone: 'from-orange-400 to-amber-700', initial: 'Mi' },
  { id: 'gemma2-9b', name: 'Gemma 2 9B', description: 'Google open model for chat and drafting.', size: '5.4 GB', category: 'general', tiers: ['free'], tone: 'from-emerald-500 to-teal-800', initial: 'Ge' },
  { id: 'phi35-mini', name: 'Phi-3.5 Mini', description: 'Compact Microsoft model with solid quality.', size: '2.2 GB', category: 'general', tiers: ['free'], tone: 'from-cyan-500 to-blue-700', initial: 'Φ' },

  // Reasoning
  { id: 'deepseek-r1-distill-8b', name: 'DeepSeek-R1 Distill 8B', description: 'Reasoning focused distill for harder problems.', size: '5.2 GB', category: 'reasoning', tiers: ['free'], recommended: true, tone: 'from-fuchsia-500 to-purple-800', initial: 'R1' },
  { id: 'deepseek-r1-distill-14b', name: 'DeepSeek-R1 Distill 14B', description: 'Stronger reasoning when hardware allows.', size: '9.0 GB', category: 'reasoning', tiers: ['free'], tone: 'from-purple-500 to-violet-900', initial: 'R14' },
  { id: 'qwq-32b', name: 'QwQ 32B', description: 'Qwen reasoning model for complex steps.', size: '20 GB', category: 'reasoning', tiers: ['free'], tone: 'from-rose-500 to-pink-800', initial: 'Qw' },
  { id: 'phi4-reasoning', name: 'Phi-4 Reasoning', description: 'Compact reasoning model for local use.', size: '8.5 GB', category: 'reasoning', tiers: ['free'], tone: 'from-sky-500 to-indigo-800', initial: 'Φ4' },

  // Vision (understand images — not generate)
  { id: 'qwen2-vl-7b', name: 'Qwen2-VL 7B', description: 'Understand images and screenshots locally.', size: '5.8 GB', category: 'vision', tiers: ['free'], recommended: true, tone: 'from-teal-500 to-emerald-800', initial: 'VL' },
  { id: 'llava-13b', name: 'LLaVA 13B', description: 'Image chat and visual Q&A.', size: '7.8 GB', category: 'vision', tiers: ['free'], tone: 'from-lime-500 to-green-800', initial: 'Lv' },
  { id: 'minicpm-v', name: 'MiniCPM-V', description: 'Efficient multimodal model for vision tasks.', size: '5.1 GB', category: 'vision', tiers: ['free'], tone: 'from-green-500 to-teal-800', initial: 'Mv' },
  { id: 'llama32-vision-11b', name: 'Llama 3.2 Vision 11B', description: 'Meta multimodal model for image understanding.', size: '7.9 GB', category: 'vision', tiers: ['free'], tone: 'from-indigo-400 to-violet-800', initial: 'LV' },
  { id: 'moondream2', name: 'Moondream 2', description: 'Tiny vision model for quick image captions.', size: '1.7 GB', category: 'vision', tiers: ['free'], tone: 'from-yellow-500 to-amber-700', initial: 'Md' },

  // Image generation (Image tab)
  { id: 'ark-image-core', name: 'ARK Image Core', description: 'Free Pollinations images; uses local SD when installed.', size: 'Cloud / local', category: 'image', tiers: ['free'], recommended: true, tone: 'from-pink-500 to-rose-800', initial: 'AI' },
  { id: 'sd15-local', name: 'Stable Diffusion 1.5 (Local)', description: 'On-device images via ARK Engine (sd.cpp). Download from Local AI.', size: '4.0 GB', category: 'image', tiers: ['free'], recommended: true, tone: 'from-yellow-500 to-amber-700', initial: 'SD' },
  { id: 'sdxl-turbo-local', name: 'SDXL Turbo (Local)', description: 'Fast on-device drafts via ARK Engine. ~6.9 GB.', size: '6.9 GB', category: 'image', tiers: ['free'], recommended: true, tone: 'from-fuchsia-500 to-pink-700', initial: 'ST' },
  { id: 'flux-schnell-local', name: 'FLUX.1 Schnell (Local)', description: 'On-device FLUX via ARK Engine (~13 GB: model + VAE + CLIP + T5).', size: '13 GB', category: 'image', tiers: ['free'], recommended: true, tone: 'from-violet-500 to-purple-800', initial: 'Fx' },
  { id: 'sdxl-turbo', name: 'SDXL Turbo', description: 'Alias — use SDXL Turbo (Local) in Local AI.', size: '6.9 GB', category: 'image', tiers: ['free'], tone: 'from-fuchsia-500 to-pink-700', initial: 'ST' },
  { id: 'sd-15', name: 'Stable Diffusion 1.5', description: 'Alias — use Stable Diffusion 1.5 (Local) in Local AI.', size: '4.0 GB', category: 'image', tiers: ['free'], tone: 'from-yellow-500 to-amber-700', initial: 'SD' },
  { id: 'playground-v25', name: 'Playground v2.5', description: 'Aesthetic local image generation.', size: '8.2 GB', category: 'image', tiers: ['free'], tone: 'from-rose-400 to-orange-700', initial: 'Pg' },

  // Video generation (Video tab)
  { id: 'ark-video-core', name: 'ARK Video Core', description: 'Built-in ARK video model for the Video tab.', size: '3.2 GB', category: 'video', tiers: ['free'], recommended: true, tone: 'from-sky-500 to-indigo-800', initial: 'AV' },
  { id: 'cogvideox-2b', name: 'CogVideoX 2B', description: 'Short clips via ARK Engine free/cloud video path (not on-device weights yet).', size: '5.5 GB', category: 'video', tiers: ['free'], recommended: true, tone: 'from-cyan-500 to-blue-800', initial: 'Cv' },
  { id: 'wan-14b', name: 'Wan 2.1 14B', description: 'Higher quality video via Engine free/cloud routes when available.', size: '18 GB', category: 'video', tiers: ['free'], tone: 'from-indigo-500 to-violet-900', initial: 'Wn' },
  { id: 'ltx-video', name: 'LTX Video', description: 'Fast video drafts via Engine free video providers.', size: '7.1 GB', category: 'video', tiers: ['free'], tone: 'from-emerald-400 to-teal-800', initial: 'LT' },

  // Fast
  { id: 'qwen25-15b', name: 'Qwen2.5 1.5B', description: 'Very fast replies on modest hardware.', size: '1.0 GB', category: 'fast', tiers: ['free'], recommended: true, tone: 'from-emerald-400 to-green-700', initial: 'Q1' },
  { id: 'gemma2-2b', name: 'Gemma 2 2B', description: 'Small and snappy for quick drafts.', size: '1.6 GB', category: 'fast', tiers: ['free'], tone: 'from-teal-400 to-cyan-700', initial: 'G2' },
  { id: 'phi3-mini', name: 'Phi-3 Mini', description: 'Lightweight everyday assistant.', size: '2.3 GB', category: 'fast', tiers: ['free'], tone: 'from-cyan-400 to-sky-700', initial: 'Φ3' },
  { id: 'smollm2-1.7b', name: 'SmolLM2 1.7B', description: 'Ultra small model for instant responses.', size: '1.1 GB', category: 'fast', tiers: ['free'], tone: 'from-lime-400 to-emerald-700', initial: 'Sm' },
  { id: 'tinyllama', name: 'TinyLlama 1.1B', description: 'Minimal footprint for testing and demos.', size: '0.7 GB', category: 'fast', tiers: ['free'], tone: 'from-zinc-500 to-zinc-800', initial: 'TL' },
];

const LOCAL_CATEGORY_META: Record<LocalModel['category'], { title: string; icon: typeof Code }> = {
  general: { title: 'General', icon: Boxes },
  coding: { title: 'Coding', icon: Code },
  reasoning: { title: 'Reasoning', icon: Brain },
  fast: { title: 'Fast', icon: Zap },
  vision: { title: 'Vision', icon: Eye },
  image: { title: 'Image', icon: ImageIcon },
  video: { title: 'Video', icon: Video },
};

const LOCAL_CATEGORIES: { id: LocalModel['category']; title: string; icon: typeof Code }[] =
  LOCAL_CATEGORY_ORDER.map(id => ({
    id: id as LocalModel['category'],
    title: LOCAL_CATEGORY_META[id as LocalModel['category']].title,
    icon: LOCAL_CATEGORY_META[id as LocalModel['category']].icon,
  }));

const CLOUD_PROVIDERS: CloudProvider[] = [
  { id: 'ollama', name: 'Ollama', description: 'Optional plug-in. Connect any Ollama models the same way you connect other sources — ARK never requires it.', tiers: ['free'], tone: 'from-zinc-400 to-zinc-700', initial: 'Ol', health: 'available', availability: 'live' },
  { id: 'pollinations', name: 'Pollinations', description: 'Free no-key image generation used by ARK Image Core.', tiers: ['free'], tone: 'from-pink-500 to-rose-700', initial: 'Po', health: 'available', availability: 'live' },
  { id: 'openrouter', name: 'OpenRouter', description: 'Free + paid routes used by ARK Router.', tiers: ['free', 'pro'], tone: 'from-violet-500 to-purple-800', initial: 'OR', health: 'available', availability: 'live' },
  { id: 'google', name: 'Google AI Studio', description: 'Gemini free tier — wired into ARK Router.', tiers: ['free', 'pro'], tone: 'from-blue-500 to-sky-700', initial: 'G', health: 'available', availability: 'live' },
  { id: 'groq', name: 'Groq', description: 'Fast Llama free tier — wired into ARK Router.', tiers: ['free', 'pro'], tone: 'from-orange-500 to-red-700', initial: 'Gq', health: 'available', availability: 'live' },
  { id: 'openai', name: 'OpenAI', description: 'GPT models for chat, code, and DALL·E.', tiers: ['pro'], tone: 'from-emerald-400 to-green-800', initial: 'OA', health: 'available', availability: 'live' },
  { id: 'anthropic', name: 'Anthropic', description: 'Claude models for long context work.', tiers: ['pro'], tone: 'from-amber-500 to-orange-800', initial: 'An', health: 'available', availability: 'live' },
  { id: 'huggingface', name: 'Hugging Face', description: 'Chat + FLUX images via Inference — wired into ARK Router.', tiers: ['free', 'pro'], tone: 'from-yellow-500 to-amber-700', initial: 'HF', health: 'available', availability: 'live' },
  { id: 'nvidia', name: 'NVIDIA NIM', description: 'NVIDIA hosted inference — free-key hop in ARK Router.', tiers: ['free', 'pro'], tone: 'from-lime-500 to-green-800', initial: 'NV', health: 'available', availability: 'live' },
  { id: 'together', name: 'Together AI', description: 'Open model hosting — wired into ARK Router.', tiers: ['free', 'pro'], tone: 'from-indigo-500 to-blue-800', initial: 'To', health: 'available', availability: 'live' },
  { id: 'fireworks', name: 'Fireworks AI', description: 'Fast serverless inference — wired into ARK Router.', tiers: ['free', 'pro'], tone: 'from-rose-500 to-orange-700', initial: 'Fw', health: 'available', availability: 'live' },
  { id: 'deepseek', name: 'DeepSeek', description: 'Coding and reasoning via API — wired into ARK Router.', tiers: ['free', 'pro'], tone: 'from-blue-400 to-indigo-700', initial: 'DS', health: 'available', availability: 'live' },
  { id: 'mistral', name: 'Mistral', description: 'Mistral and Codestral — wired into ARK Router.', tiers: ['free', 'pro'], tone: 'from-orange-400 to-amber-700', initial: 'Mi', health: 'available', availability: 'live' },
  { id: 'cerebras', name: 'Cerebras', description: 'Ultra-fast Llama free tier — wired into ARK Router.', tiers: ['free', 'pro'], tone: 'from-cyan-500 to-teal-800', initial: 'Ce', health: 'available', availability: 'live' },
  { id: 'sambanova', name: 'SambaNova', description: 'SambaNova Cloud open models — wired into ARK Router.', tiers: ['free', 'pro'], tone: 'from-fuchsia-500 to-purple-800', initial: 'Sn', health: 'available', availability: 'live' },
  { id: 'github-models', name: 'GitHub Models', description: 'Retired by GitHub (July 2026).', tiers: ['free'], tone: 'from-zinc-500 to-zinc-900', initial: 'GH', health: 'offline', availability: 'retired' },
];

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
  { id: 'grok-2', name: 'Grok 2', description: 'xAI chat model for general work.', provider: 'xAI', category: 'chat', tiers: ['free', 'pro'], tone: 'from-zinc-400 to-black', initial: 'Gx' },
  { id: 'hf-llama-31', name: 'Llama 3.1 8B (HF)', description: 'Open chat via Hugging Face Inference.', provider: 'Hugging Face', category: 'chat', tiers: ['free', 'pro'], tone: 'from-yellow-500 to-amber-700', initial: 'HF' },
  { id: 'nvidia-llama-31', name: 'Llama 3.1 8B (NIM)', description: 'NVIDIA NIM hosted Llama for coding and chat.', provider: 'NVIDIA', category: 'chat', tiers: ['free', 'pro'], tone: 'from-lime-500 to-green-800', initial: 'NV' },
  { id: 'hf-flux-schnell', name: 'FLUX.1 schnell (HF)', description: 'Fast free-key images via Hugging Face.', provider: 'Hugging Face', category: 'image', tiers: ['free', 'pro'], tone: 'from-yellow-400 to-orange-700', initial: 'FX' },

  // Coding
  { id: 'claude-sonnet-code', name: 'Claude Sonnet (Coding)', description: 'Excellent for code edits and agent work.', provider: 'Anthropic', category: 'coding', tiers: ['pro'], tone: 'from-amber-500 to-orange-800', initial: 'CC' },
  { id: 'gpt-4o-code', name: 'GPT-4o (Coding)', description: 'Strong coding and tool use.', provider: 'OpenAI', category: 'coding', tiers: ['pro'], tone: 'from-emerald-400 to-green-800', initial: '4C' },
  { id: 'deepseek-v3', name: 'DeepSeek V3', description: 'High value coding and general cloud model.', provider: 'DeepSeek', category: 'coding', tiers: ['free', 'pro'], tone: 'from-blue-400 to-indigo-700', initial: 'DV' },
  { id: 'deepseek-coder', name: 'DeepSeek Coder', description: 'Specialized coding via DeepSeek API.', provider: 'DeepSeek', category: 'coding', tiers: ['free', 'pro'], tone: 'from-cyan-500 to-blue-800', initial: 'DC' },
  { id: 'codestral', name: 'Codestral', description: 'Mistral coding model in the cloud.', provider: 'Mistral', category: 'coding', tiers: ['free', 'pro'], tone: 'from-orange-400 to-amber-700', initial: 'Cs' },
  { id: 'qwen-coder-plus', name: 'Qwen2.5-Coder Plus', description: 'Cloud coding model via OpenRouter hosts.', provider: 'OpenRouter', category: 'coding', tiers: ['free', 'pro'], tone: 'from-sky-500 to-blue-700', initial: 'QC' },
  { id: 'groq-llama33', name: 'Llama 3.3 70B (Groq)', description: 'Fast free-tier coding/chat via Groq — ARK Router.', provider: 'Groq', category: 'coding', tiers: ['free'], tone: 'from-orange-500 to-red-700', initial: 'Gq' },
  { id: 'openrouter-llama-free', name: 'Llama 3.3 Free (OpenRouter)', description: 'OpenRouter free route — ARK Router.', provider: 'OpenRouter', category: 'coding', tiers: ['free'], tone: 'from-violet-500 to-indigo-800', initial: 'OR' },
  { id: 'github-gpt4o', name: 'GPT-4o (GitHub Models)', description: 'GitHub Models retired July 2026 — not available in ARK.', provider: 'GitHub Models', category: 'coding', tiers: ['free'], tone: 'from-zinc-500 to-zinc-900', initial: 'GH' },

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
  { id: 'ark-pollinations', name: 'ARK Image (Pollinations)', description: 'Free no-key images — wired into Image tab by default.', provider: 'Pollinations', category: 'image', tiers: ['free'], tone: 'from-pink-500 to-rose-700', initial: 'Po' },
  { id: 'dall-e-3', name: 'DALL·E 3', description: 'Image generation from OpenAI.', provider: 'OpenAI', category: 'image', tiers: ['pro'], tone: 'from-pink-500 to-rose-800', initial: 'D3' },
  { id: 'imagen-3', name: 'Imagen 3', description: 'Google image generation.', provider: 'Google', category: 'image', tiers: ['pro'], tone: 'from-sky-400 to-blue-700', initial: 'Im' },
  { id: 'flux-pro', name: 'FLUX Pro', description: 'High quality image generation.', provider: 'Together AI', category: 'image', tiers: ['pro'], tone: 'from-violet-500 to-purple-800', initial: 'Fx' },
  { id: 'flux-schnell', name: 'FLUX Schnell', description: 'Fast image drafts and iterations.', provider: 'Fireworks AI', category: 'image', tiers: ['free', 'pro'], tone: 'from-fuchsia-500 to-pink-700', initial: 'FS' },
  { id: 'sdxl', name: 'Stable Diffusion XL', description: 'Open image model via cloud hosts.', provider: 'Hugging Face', category: 'image', tiers: ['free', 'pro'], tone: 'from-yellow-500 to-amber-700', initial: 'SD' },
  { id: 'hf-flux-free', name: 'FLUX (HF Inference)', description: 'Free-tier friendly FLUX via Hugging Face when keyed.', provider: 'Hugging Face', category: 'image', tiers: ['free'], tone: 'from-yellow-400 to-orange-700', initial: 'HF' },

  // Coding free extras
  { id: 'or-llama-free', name: 'Llama 3.3 70B (OpenRouter Free)', description: 'Free OpenRouter coding/chat route when available.', provider: 'OpenRouter', category: 'coding', tiers: ['free'], tone: 'from-violet-400 to-indigo-700', initial: 'OR' },
  { id: 'groq-llama', name: 'Llama 3.3 70B (Groq)', description: 'Fast free-tier coding chat via Groq key.', provider: 'Groq', category: 'coding', tiers: ['free'], tone: 'from-orange-400 to-red-700', initial: 'Gq' },
  { id: 'gemini-flash-code', name: 'Gemini 2.0 Flash (Coding)', description: 'Free-tier Google coding assistant.', provider: 'Google', category: 'coding', tiers: ['free'], tone: 'from-blue-400 to-sky-700', initial: 'Gc' },

  // Video generation
  { id: 'ark-pollinations-video', name: 'ARK Video (Pollinations)', description: 'Free short MP4 when the host answers. Otherwise a 4s motion clip from a still — labeled honestly.', provider: 'Pollinations', category: 'video', tiers: ['free'], tone: 'from-pink-500 to-violet-800', initial: 'Pv' },
  { id: 'runway-gen3', name: 'Runway Gen-3', description: 'Cloud video generation and editing.', provider: 'Runway', category: 'video', tiers: ['pro'], tone: 'from-emerald-400 to-teal-800', initial: 'Rw' },
  { id: 'luma-ray2', name: 'Luma Ray2', description: 'Text and image to video.', provider: 'Luma', category: 'video', tiers: ['pro'], tone: 'from-sky-400 to-indigo-800', initial: 'Lu' },
  { id: 'kling-1', name: 'Kling', description: 'Short cinematic cloud clips — not wired in ARK yet.', provider: 'OpenRouter', category: 'video', tiers: ['free', 'pro'], tone: 'from-violet-500 to-purple-800', initial: 'Kl' },
  { id: 'pika-2', name: 'Pika 2.0', description: 'Fast creative video drafts — not wired in ARK yet.', provider: 'OpenRouter', category: 'video', tiers: ['free', 'pro'], tone: 'from-pink-500 to-rose-800', initial: 'Pk' },
  { id: 'sora', name: 'Sora', description: 'OpenAI video generation — not wired in ARK yet.', provider: 'OpenAI', category: 'video', tiers: ['pro'], tone: 'from-emerald-400 to-green-800', initial: 'So' },

  // Fast
  { id: 'groq-llama', name: 'Llama 3.3 70B (Groq)', description: 'Very fast Llama responses on Groq.', provider: 'Groq', category: 'fast', tiers: ['free', 'pro'], tone: 'from-orange-500 to-red-700', initial: 'Gq' },
  { id: 'groq-mixtral', name: 'Mixtral (Groq)', description: 'Quick Mixtral inference.', provider: 'Groq', category: 'fast', tiers: ['free', 'pro'], tone: 'from-amber-500 to-orange-700', initial: 'Mx' },
  { id: 'gemini-flash-lite', name: 'Gemini Flash-Lite', description: 'Ultra fast Google responses.', provider: 'Google', category: 'fast', tiers: ['free', 'pro'], tone: 'from-sky-400 to-cyan-700', initial: 'FL' },
  { id: 'cerebras-llama', name: 'Llama 3.1 8B (Cerebras)', description: 'High speed Cerebras inference.', provider: 'Cerebras', category: 'fast', tiers: ['free', 'pro'], tone: 'from-cyan-500 to-teal-800', initial: 'Ce' },
  { id: 'fireworks-llama', name: 'Llama 3.3 70B (Fireworks)', description: 'Fast serverless Llama hosting.', provider: 'Fireworks AI', category: 'fast', tiers: ['free', 'pro'], tone: 'from-rose-500 to-orange-700', initial: 'Fw' },
];

const CLOUD_MODEL_CATEGORIES: { id: CloudModel['category']; title: string; icon: typeof Boxes }[] = [
  { id: 'chat', title: 'Chat', icon: Boxes },
  { id: 'coding', title: 'Coding', icon: Code },
  { id: 'reasoning', title: 'Reasoning', icon: Brain },
  { id: 'fast', title: 'Fast', icon: Zap },
  { id: 'vision', title: 'Vision', icon: Eye },
  { id: 'image', title: 'Image', icon: ImageIcon },
  { id: 'video', title: 'Video', icon: Video },
];

/** Providers ARK Router / media can actually call today. */
const LIVE_MODEL_PROVIDERS = new Set([
  'OpenAI',
  'Anthropic',
  'Google',
  'Groq',
  'OpenRouter',
  'Pollinations',
  'Hugging Face',
  'NVIDIA',
  'Together',
  'Together AI',
  'Fireworks',
  'DeepSeek',
  'Mistral',
  'Cerebras',
  'SambaNova',
  'Fireworks AI',
]);

function cloudModelAvailability(model: CloudModel): 'live' | 'coming_soon' | 'retired' {
  if (model.provider === 'GitHub Models') return 'retired';
  if (model.category === 'video') {
    // Router only calls ARK Engine video (Pollinations / HF / motion still).
    if (model.provider === 'Pollinations' || model.provider === 'Hugging Face') return 'live';
    return 'coming_soon';
  }
  if (model.category === 'image') {
    if (
      model.provider === 'Pollinations'
      || model.provider === 'Hugging Face'
      || model.id === 'dall-e-3'
    ) return 'live';
    return 'coming_soon';
  }
  if (model.category === 'vision') {
    if (
      model.provider === 'Google'
      || model.provider === 'OpenAI'
      || model.provider === 'Anthropic'
    ) return 'live';
    return 'coming_soon';
  }
  if (LIVE_MODEL_PROVIDERS.has(model.provider)) return 'live';
  return 'coming_soon';
}

function liveEnabledCloudIds() {
  return CLOUD_MODELS
    .filter(m => isCloudModelEnabled(m.id, providerIdFromName(m.provider), cloudModelAvailability(m) === 'live'))
    .map(m => m.id);
}

const CATEGORY_LABEL: Record<string, string> = {
  coding: 'Coding',
  general: 'General',
  reasoning: 'Reasoning',
  vision: 'Vision',
  image: 'Image',
  video: 'Video',
  fast: 'Fast',
  chat: 'Chat',
};

const FIT_SECTIONS: {
  id: FitKind;
  title: string;
  icon: typeof Sparkles;
}[] = [
  { id: 'quality', title: 'Best quality', icon: Sparkles },
  { id: 'balanced', title: 'Balanced', icon: Gauge },
  { id: 'performance', title: 'Best performance', icon: Rocket },
];

function modelSizeGb(model: { size: string }) {
  return parseFloat(model.size) || 0;
}

function modelHwNeed(model: LocalModel): HardwareClass {
  const gb = modelSizeGb(model);
  if (gb >= 12) return 'strong';
  if (gb >= 4) return 'standard';
  return 'light';
}

function canRunOnPc(model: LocalModel, pc: HardwareClass, ramGb = 8) {
  const rank: Record<HardwareClass, number> = { light: 0, standard: 1, strong: 2 };
  if (rank[modelHwNeed(model)] > rank[pc]) return false;
  // GGUF needs headroom beyond file size (context + OS).
  const needRam = modelSizeGb(model) * 1.35 + 4;
  return ramGb >= needRam || modelSizeGb(model) < 2;
}

function buildFitLists(pc: HardwareClass, ramGb = 8) {
  // Prefer models ARK can actually install; keep others discoverable via Search.
  const installable = LOCAL_MODELS.filter(m => isEngineDownloadable(m.id));
  const pool = installable.length ? installable : LOCAL_MODELS;
  const compatible = sortModelsByCategoryThenSizeDesc(
    pool.filter(m => canRunOnPc(m, pc, ramGb)),
  );

  const bySizeDesc = [...compatible].sort((a, b) => modelSizeGb(b) - modelSizeGb(a));
  const quality = sortModelsByCategoryThenSizeDesc(bySizeDesc.slice(0, 8));
  const performance = sortModelsByCategoryThenSizeDesc(
    [...bySizeDesc].reverse().slice(0, 8),
  );
  const balanced = sortModelsByCategoryThenSizeDesc(
    compatible.filter(m => {
      const gb = modelSizeGb(m);
      return gb >= 1 && gb < 12;
    }).slice(0, 8),
  );

  return {
    quality: quality.length ? quality : compatible.slice(0, 6),
    balanced: balanced.length ? balanced : compatible.slice(0, 6),
    performance: performance.length ? performance : compatible.slice(0, 6),
  };
}

function ModelInstallControl({
  modelId,
  name,
  isOn,
  isBusy,
  progress,
  onInstall,
  onCancel,
  onDelete,
}: {
  modelId: string;
  name: string;
  isOn: boolean;
  isBusy: boolean;
  progress?: number;
  onInstall: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const [prefTick, setPrefTick] = useState(0);
  useEffect(() => {
    const on = () => setPrefTick(t => t + 1);
    window.addEventListener('ark:prefs-changed', on);
    return () => window.removeEventListener('ark:prefs-changed', on);
  }, []);
  void prefTick;
  const prefs = getLocalPrefs();
  const isChatDefault = prefs.defaultModelId === modelId;
  const isCodeDefault = prefs.defaultCodeModelId === modelId;
  const canInstall = isEngineDownloadable(modelId);
  if (isOn) {
    return (
      <span className="inline-flex items-center gap-0.5 shrink-0">
        <span
          className="w-8 h-8 rounded-full bg-surface-hover text-emerald-400 flex items-center justify-center"
          title="Installed in ARK Engine"
          aria-label={`Installed ${name}`}
        >
          <Check className="w-4 h-4" />
        </span>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="w-8 h-8 rounded-full text-rose-500 hover:text-rose-300 transition-colors flex items-center justify-center"
            title={`Delete ${name}`}
            aria-label={`Delete ${name}`}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </span>
    );
  }
  if (!canInstall) {
    return (
      <span
        className="inline-flex items-center rounded-full bg-surface-hover/80 px-2 py-1 text-[10px] font-medium text-content-tertiary shrink-0"
        title="Listed for discovery — not downloadable in ARK Engine yet"
      >
        Discover
      </span>
    );
  }
  if (isBusy) {
    return (
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-1 text-[10px] font-medium text-rose-300 shrink-0 hover:bg-rose-500/25"
        title="Cancel download"
        aria-label={`Cancel ${name}`}
      >
        <Loader2 className="w-3 h-3 animate-spin" />
        {progress != null ? `${Math.round(progress)}%` : '…'}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onInstall}
      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors"
      title="Download into ARK Engine"
      aria-label={`Download ${name}`}
    >
      <Download className="w-4 h-4" />
    </button>
  );
}

function TierBadges({ tiers }: { tiers: Tier[] }) {
  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      {tiers.includes('free') && (
        <span className="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-400 px-2 py-0.5 text-[10px] font-medium leading-none">
          Free
        </span>
      )}
      {tiers.includes('pro') && (
        <span className="inline-flex items-center rounded-full bg-sky-500/15 text-sky-400 px-2 py-0.5 text-[10px] font-medium leading-none">
          Pro
        </span>
      )}
    </span>
  );
}

export function ModelsView() {
  const { navigate } = useRouter();
  const [tab, setTab] = useState<TabId>('for-pc');
  const [query, setQuery] = useState('');
  const [installed, setInstalled] = useState<Set<string>>(() => new Set());
  const [installing, setInstalling] = useState<Set<string>>(() => new Set(
    Object.keys(getEngineDownloadMap()).filter(id => isEngineDownloading(id)),
  ));
  const [installProgress, setInstallProgress] = useState<Record<string, number>>(() => getEngineDownloadMap());
  const [connected, setConnected] = useState<Set<string>>(() => new Set(listConnectedProviderIds()));
  const [enabledCloud, setEnabledCloud] = useState<Set<string>>(() => new Set(liveEnabledCloudIds()));
  const [hw, setHw] = useState(() => loadHardwareSnapshot() || detectHardware());
  const [connectTarget, setConnectTarget] = useState<CloudProvider | null>(null);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [keyedProviders, setKeyedProviders] = useState<Set<string>>(
    () => new Set(Object.keys(getProviderApiKeys())),
  );
  const [ollamaOn, setOllamaOn] = useState(() => isOllamaEnabled());
  const [ollamaOnline, setOllamaOnline] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [ollamaNote, setOllamaNote] = useState('');
  const [hunted, setHunted] = useState<HuntedModel[]>([]);
  const [huntNote, setHuntNote] = useState('');
  const [huntBusy, setHuntBusy] = useState(false);
  const [liveCapacity, setLiveCapacity] = useState<LiveCapacity | null>(null);
  const pcClass = useMemo(() => getHardwareClass(hw), [hw]);
  const ramGb = useMemo(() => parseRamGb(hw), [hw]);
  const fitLists = useMemo(() => buildFitLists(pcClass, ramGb), [pcClass, ramGb]);

  useEffect(() => {
    const hydrate = () => {
      setKeyedProviders(new Set(Object.keys(getProviderApiKeys())));
      setConnected(new Set(listConnectedProviderIds()));
      setEnabledCloud(new Set(liveEnabledCloudIds()));
      setOllamaOn(isOllamaEnabled());
    };
    hydrate();
    window.addEventListener('ark:cloud-sources-changed', hydrate);
    window.addEventListener('ark:provider-keys-changed', hydrate);
    return () => {
      window.removeEventListener('ark:cloud-sources-changed', hydrate);
      window.removeEventListener('ark:provider-keys-changed', hydrate);
    };
  }, []);


  useEffect(() => {
    void probeLiveCapacity().then(setLiveCapacity);
  }, [keyedProviders, ollamaOn, installed]);

  useEffect(() => {
    const sync = () => {
      const map = getEngineDownloadMap();
      setInstallProgress(map);
      setInstalling(new Set(Object.keys(map).filter(id => isEngineDownloading(id))));
    };
    sync();
    void reattachEngineDownloads('models').then(async () => {
      sync();
      try {
        const status = await getEngineStatus();
        const ready = new Set(
          status.models
            .filter(m =>
              m.status === 'ready'
              && m.id !== 'ark-core'
              && m.id !== 'ark-image-core'
              && m.id !== 'ark-video-core',
            )
            .map(m => m.id),
        );
        setInstalled(ready);
      } catch {
        /* ignore */
      }
    });
    return subscribeEngineDownloads(() => {
      sync();
      // When a job drops off at 100%, refresh installed set
      void getEngineStatus().then(status => {
        const ready = new Set(
          status.models
            .filter(m =>
              m.status === 'ready'
              && m.id !== 'ark-core'
              && m.id !== 'ark-image-core'
              && m.id !== 'ark-video-core',
            )
            .map(m => m.id),
        );
        setInstalled(ready);
      }).catch(() => undefined);
    });
  }, []);

  useEffect(() => {
    const onHw = () => {
      void getAccurateHardware(true).then(setHw);
    };
    window.addEventListener('ark:hardware-rescanned', onHw);
    let cancelled = false;
    void getAccurateHardware(true).then(info => {
      if (cancelled) return;
      setHw(info);
    });
    void getEngineStatus().then(status => {
      if (cancelled) return;
      const ready = new Set(
        status.models
          .filter(m =>
            m.status === 'ready'
            && m.id !== 'ark-core'
            && m.id !== 'ark-image-core'
            && m.id !== 'ark-video-core',
          )
          .map(m => m.id),
      );
      setInstalled(ready);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      window.removeEventListener('ark:hardware-rescanned', onHw);
    };
  }, []);

  const runHunt = useCallback(async () => {
    setHuntBusy(true);
    setHuntNote('Searching online for models that fit this PC…');
    try {
      const info = await getAccurateHardware(true);
      const found = await huntModelsForPc(info);
      setHunted(found);
      setHuntNote(
        found.length
          ? `${found.length} online ${found.length === 1 ? 'model' : 'models'} from Hugging Face + ModelScope`
          : 'No extra online models right now — catalog below still applies',
      );
    } catch {
      setHuntNote('Could not reach model hosts right now');
    } finally {
      setHuntBusy(false);
    }
  }, []);

  useEffect(() => {
    void runHunt();
  }, [runHunt]);

  useEffect(() => {
    if (!ollamaOn) {
      setOllamaOnline(false);
      setOllamaModels([]);
      setOllamaNote('Ollama is optional and currently off.');
      return;
    }
    void probeOllamaOptional().then(res => {
      setOllamaOnline(res.online);
      setOllamaModels(res.models);
      setOllamaNote(
        res.online
          ? `Ollama connected · ${res.models.length} model${res.models.length === 1 ? '' : 's'}`
          : res.error || 'Ollama not reachable on :11434',
      );
    });
  }, [ollamaOn]);

  const openConnect = (provider: CloudProvider) => {
    setConnectTarget(provider);
    setApiKeyDraft(getProviderApiKeys()[provider.id] ?? '');
  };

  const saveConnect = () => {
    if (!connectTarget) return;
    setProviderApiKey(connectTarget.id, apiKeyDraft);
    setKeyedProviders(prev => {
      const next = new Set(prev);
      if (apiKeyDraft.trim()) next.add(connectTarget.id);
      else next.delete(connectTarget.id);
      return next;
    });
    setConnected(prev => {
      const next = new Set(prev);
      if (apiKeyDraft.trim()) next.add(connectTarget.id);
      return next;
    });
    if (apiKeyDraft.trim()) {
      setCloudProviderEnabled(connectTarget.id, true);
      const ids = CLOUD_MODELS
        .filter(m => providerIdFromName(m.provider) === connectTarget.id && cloudModelAvailability(m) === 'live')
        .map(m => m.id);
      const currentlyOn = liveEnabledCloudIds();
      setEnabledCloud(addEnabledCloudModels(ids, currentlyOn));
    }
    setConnectTarget(null);
    setApiKeyDraft('');
  };

  const toggleConnected = (id: string) => {
    const provider = CLOUD_PROVIDERS.find(p => p.id === id);
    if (!provider) return;

    const currentlyOn = liveEnabledCloudIds();
    const modelIds = CLOUD_MODELS
      .filter(m => providerIdFromName(m.provider) === id && cloudModelAvailability(m) === 'live')
      .map(m => m.id);

    if (id === 'ollama') {
      const next = !ollamaOn;
      setOllamaEnabled(next);
      setOllamaOn(next);
      setCloudProviderEnabled('ollama', next);
      setConnected(prev => {
        const copy = new Set(prev);
        if (next) copy.add('ollama');
        else copy.delete('ollama');
        return copy;
      });
      return;
    }

    if (connected.has(id) || isCloudProviderEnabled(id)) {
      setCloudProviderEnabled(id, false);
      setConnected(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setEnabledCloud(removeEnabledCloudModels(modelIds, currentlyOn));
      return;
    }
    if (providerNeedsKey(id) && !hasProviderApiKey(id)) {
      openConnect(provider);
      return;
    }
    setCloudProviderEnabled(id, true);
    setConnected(prev => new Set(prev).add(id));
    setEnabledCloud(addEnabledCloudModels(modelIds, currentlyOn));
  };

  const toggleCloudModel = (id: string) => {
    const model = CLOUD_MODELS.find(m => m.id === id);
    if (!model) return;
    const providerId = providerIdFromName(model.provider);
    const currentlyOn = liveEnabledCloudIds();
    const on = isCloudModelEnabled(id, providerId, cloudModelAvailability(model) === 'live')
      || enabledCloud.has(id);

    if (!on && providerId && providerNeedsKey(providerId) && !hasProviderApiKey(providerId)) {
      const provider = CLOUD_PROVIDERS.find(p => p.id === providerId);
      if (provider) openConnect(provider);
      return;
    }
    if (!on && providerId && !isCloudProviderEnabled(providerId)) {
      setCloudProviderEnabled(providerId, true);
      setConnected(prev => new Set(prev).add(providerId));
    }
    setEnabledCloud(setCloudModelEnabled(id, !on, currentlyOn));
  };
  const q = query.trim().toLowerCase();

  const filteredFit = useMemo(() => {
    const match = (m: LocalModel) =>
      !q ||
      m.name.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      CATEGORY_LABEL[m.category]?.toLowerCase().includes(q) ||
      m.tiers.some(t => t.includes(q));

    // Default: only hardware-fit installable models. Searching also surfaces discovery-only.
    if (q) {
      const hits = LOCAL_MODELS.filter(match);
      const installable = hits.filter(m => isEngineDownloadable(m.id));
      const discovery = hits.filter(m => !isEngineDownloadable(m.id));
      const fit = installable.filter(m => canRunOnPc(m, pcClass, ramGb));
      const stretch = installable.filter(m => !canRunOnPc(m, pcClass, ramGb));
      return {
        quality: sortModelsByCategoryThenSizeDesc([
          ...fit.filter(m => m.category !== 'fast').slice(0, 8),
          ...stretch.slice(0, 4),
          ...discovery.slice(0, 6),
        ]),
        balanced: sortModelsByCategoryThenSizeDesc(
          fit.filter(m => {
            const gb = modelSizeGb(m);
            return gb >= 2 && gb < 12;
          }).slice(0, 10),
        ),
        performance: sortModelsByCategoryThenSizeDesc(
          [...fit].sort((a, b) => modelSizeGb(a) - modelSizeGb(b)).slice(0, 10),
        ),
      };
    }

    return {
      quality: sortModelsByCategoryThenSizeDesc(fitLists.quality.filter(match)),
      balanced: sortModelsByCategoryThenSizeDesc(fitLists.balanced.filter(match)),
      performance: sortModelsByCategoryThenSizeDesc(fitLists.performance.filter(match)),
    };
  }, [fitLists, q, pcClass, ramGb]);

  const localCategories = useMemo(() => {
    return LOCAL_CATEGORIES.map(cat => ({
      ...cat,
      models: sortModelsByCategoryThenSizeDesc(
        LOCAL_MODELS.filter(m => {
          if (m.category !== cat.id) return false;
          // Default list: only real Engine downloads. Search surfaces discovery-only.
          if (!q && !isEngineDownloadable(m.id)) return false;
          if (!q) return true;
          return (
            m.name.toLowerCase().includes(q) ||
            m.description.toLowerCase().includes(q) ||
            cat.title.toLowerCase().includes(q) ||
            m.tiers.some(t => t.includes(q))
          );
        }),
      ),
    })).filter(cat => cat.models.length > 0);
  }, [q]);

  const installedModels = useMemo(
    () => sortModelsByCategoryThenSizeDesc(LOCAL_MODELS.filter(m => installed.has(m.id))),
    [installed],
  );

  const connectedProviders = useMemo(
    () => CLOUD_PROVIDERS.filter(p => connected.has(p.id)),
    [connected],
  );

  const filteredProviders = useMemo(() => {
    if (!q) return CLOUD_PROVIDERS;
    return CLOUD_PROVIDERS.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tiers.some(t => t.includes(q)),
    );
  }, [q]);

  const cloudCategories = useMemo(() => {
    return CLOUD_MODEL_CATEGORIES.map(cat => ({
      ...cat,
      models: CLOUD_MODELS.filter(m => {
        if (m.category !== cat.id) return false;
        if (!q) return true;
        return (
          m.name.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.provider.toLowerCase().includes(q) ||
          cat.title.toLowerCase().includes(q) ||
          m.tiers.some(t => t.includes(q))
        );
      }),
    })).filter(cat => cat.models.length > 0);
  }, [q]);

  const toggleInstall = (id: string, hunt?: HuntedModel) => {
    if (hunt) {
      if (installed.has(id) || isEngineDownloading(id)) return;

      // Auto-set defaults based on the model category (keep Models tab simple).
      if (hunt.category === 'coding') {
        setLocalPrefs({ defaultCodeModelId: id });
      } else {
        setLocalPrefs({ defaultModelId: id, lastChatModelId: id });
      }

      const needGb = hunt.sizeGb * 1.15;
      void engineDiskSpace().then(disk => {
        if (disk?.freeGb != null && needGb > 0 && disk.freeGb < needGb) {
          setOllamaNote(`⚠️ Not enough space — ${hunt.name} needs ~${needGb.toFixed(1)} GB but only ${disk.freeGb.toFixed(1)} GB is free. Free up space or change the models folder in Settings → Storage.`);
          return;
        }
        setOllamaNote(`Downloading ${hunt.name}…`);
        void startEngineDownload({
          id: hunt.id,
          name: hunt.name,
          source: 'models',
          hunt: {
            url: hunt.url,
            sizeGb: hunt.sizeGb,
            detail: hunt.detail,
            category: hunt.category,
          },
        });
      });
      return;
    }
    if (!isEngineDownloadable(id)) {
      setOllamaNote('Not downloadable in ARK Engine yet — search shows discovery only.');
      return;
    }
    if (installed.has(id) || isEngineDownloading(id)) return;
    const model = LOCAL_MODELS.find(m => m.id === id);

    // Auto-set defaults based on local model category.
    if (model?.category === 'coding') {
      setLocalPrefs({ defaultCodeModelId: id });
    } else {
      setLocalPrefs({ defaultModelId: id, lastChatModelId: id });
    }

    const needGb = modelSizeGb(model || { size: '0' }) * 1.15;
    void engineDiskSpace().then(disk => {
      if (disk?.freeGb != null && needGb > 0 && disk.freeGb < needGb) {
        setOllamaNote(`⚠️ Not enough space — ${model?.name || id} needs ~${needGb.toFixed(1)} GB but only ${disk.freeGb.toFixed(1)} GB is free. Free up space or change the models folder in Settings → Storage.`);
        return;
      }
      setOllamaNote(`Downloading ${model?.name || id}…`);
      void startEngineDownload({
        id,
        name: model?.name || id,
        source: 'models',
      });
    });
  };

  const cancelInstall = (id: string) => {
    void cancelEngineDownload(id).then(() => {
      setOllamaNote('Download canceled');
    });
  };

  const removeInstall = (id: string, name: string) => {
    if (!window.confirm(`Delete “${name}” from this PC? This removes the downloaded file. You can install it again later.`)) {
      return;
    }
    void deleteEngineModel(id)
      .then(result => {
        if (!result.ok) {
          setOllamaNote(result.error || 'Could not delete model');
          return;
        }
        setInstalled(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setOllamaNote(`Deleted ${name}`);
      })
      .catch(err => {
        setOllamaNote(err instanceof Error ? err.message : 'Could not delete model');
      });
  };

  return (
    <div className="h-full min-w-0 flex flex-col overflow-hidden animate-fade-in bg-ark-navy-950">
      <div className="shrink-0 px-4 sm:px-6 pt-[min(12vh,6rem)] bg-ark-navy-950">
        <div className="w-full max-w-4xl mx-auto min-w-0">
          <div className="flex items-center justify-between gap-3 mb-5 min-w-0">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-semibold text-content-primary tracking-tight">Models</h1>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-surface-hover px-3 py-2 w-36 sm:w-52 md:w-64 shrink-0 min-w-0">
              <Search className="w-4 h-4 text-content-tertiary shrink-0" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search models"
                className="flex-1 bg-transparent border-none text-sm text-content-primary placeholder:text-content-tertiary focus:outline-none min-w-0"
              />
            </div>
          </div>

          {liveCapacity && !liveCapacity.liveChat && (
            <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90 leading-relaxed">
              <span className="font-medium text-amber-200">No live brain yet</span>
              {' — '}
              {liveCapacity.summary}
              {liveCapacity.suggestedFreeKeys.length > 0 && (
                <>
                  {' '}
                  Try free keys:
                  {' '}
                  {liveCapacity.suggestedFreeKeys.map(k => k.name).join(', ')}
                  {' '}
                  in Settings → Connect.
                </>
              )}
            </div>
          )}

          <div className="flex items-center gap-1 mb-4 flex-wrap">
            {([
              { id: 'for-pc' as const, label: 'For your PC', icon: Monitor },
              { id: 'local' as const, label: 'Local AI', icon: Cpu },
              { id: 'cloud' as const, label: 'Cloud AI', icon: Cloud },
              { id: 'engine' as const, label: 'Engine', icon: Gauge },
            ]).map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                }}
                className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                  tab === t.id
                    ? 'bg-surface-hover text-content-primary'
                    : 'text-content-secondary hover:text-content-primary'
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden px-4 sm:px-6 pb-10">
        <div className="w-full max-w-4xl mx-auto min-w-0">
          {tab === 'for-pc' ? (
            <>
              <div className="flex items-center justify-between gap-3 mb-8">
                <p className="text-xs text-content-tertiary truncate min-w-0">
                  {huntNote || 'Find more models that fit this PC'}
                </p>
                <button
                  type="button"
                  onClick={() => void runHunt()}
                  disabled={huntBusy}
                  className="inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-surface-hover/40 hover:bg-surface-hover px-3 py-1.5 text-xs text-content-secondary hover:text-content-primary transition-colors shrink-0 disabled:opacity-50"
                  title="Search Hugging Face and ModelScope for new models"
                >
                  {huntBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Refresh
                </button>
              </div>

              {hunted.length > 0 && (
                <section className="mb-10">
                  <div className="flex items-center gap-2 mb-1">
                    <Globe className="w-4 h-4 text-content-secondary" />
                    <h2 className="text-base font-semibold text-content-primary">Found online for this PC</h2>
                  </div>
                  <p className="text-xs text-content-tertiary mb-4">
                    {huntNote || 'Live search on Hugging Face + ModelScope · GGUF · sized for your RAM'}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                    {hunted.map(model => {
                      const isOn = installed.has(model.id);
                      const isBusy = installing.has(model.id);
                      return (
                        <div
                          key={model.id}
                          className="flex items-center gap-3 py-3 rounded-xl px-1 hover:bg-surface-hover/50 transition-colors"
                        >
                          <span className={`w-10 h-10 rounded-xl bg-gradient-to-br ${
                            model.source === 'modelscope' ? 'from-sky-500 to-indigo-700' : 'from-emerald-400 to-sky-700'
                          } flex items-center justify-center text-[10px] font-bold text-white shrink-0`}>
                            {huntSourceBadge(model.source)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 min-w-0 flex-wrap">
                              <span className="text-sm font-medium text-content-primary truncate">{model.name}</span>
                              <span className="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-300 px-2 py-0.5 text-[10px] font-medium leading-none">
                                Online
                              </span>
                            </span>
                            <span className="block text-xs text-content-tertiary truncate mt-0.5">
                              {model.detail}
                            </span>
                          </span>
                          <ModelInstallControl
                            modelId={model.id}
                            name={model.name}
                            isOn={isOn}
                            isBusy={isBusy}
                            progress={installProgress[model.id]}
                            onInstall={() => toggleInstall(model.id, model)}
                            onCancel={() => cancelInstall(model.id)}
                            onDelete={() => removeInstall(model.id, model.name)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              <div className="space-y-10">
                {FIT_SECTIONS.map(section => {
                  const models = filteredFit[section.id];
                  return (
                    <section key={section.id}>
                      <div className="flex items-center gap-2 mb-4">
                        <section.icon className="w-4 h-4 text-content-secondary" />
                        <h2 className="text-base font-semibold text-content-primary">{section.title}</h2>
                      </div>
                      {models.length === 0 ? (
                        <p className="text-sm text-content-tertiary">No matches.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                          {models.map(model => {
                            const isOn = installed.has(model.id);
                            const isBusy = installing.has(model.id);
                            return (
                              <div
                                key={`${section.id}-${model.id}`}
                                className="flex items-center gap-3 py-3 rounded-xl px-1 hover:bg-surface-hover/50 transition-colors"
                              >
                                <span className={`w-10 h-10 rounded-xl bg-gradient-to-br ${model.tone} flex items-center justify-center text-[10px] font-bold text-white shrink-0`}>
                                  {model.initial}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="flex items-center gap-2 min-w-0 flex-wrap">
                                    <span className="text-sm font-medium text-content-primary truncate">{model.name}</span>
                                    <TierBadges tiers={model.tiers} />
                                  </span>
                                  <span className="block text-xs text-content-tertiary truncate mt-0.5">
                                    {categoryDisplayLabel(model.category, model.id)} · {model.size}
                                  </span>
                                </span>
                                <ModelInstallControl
                                  modelId={model.id}
                                  name={model.name}
                                  isOn={isOn}
                                  isBusy={isBusy}
                                  progress={installProgress[model.id]}
                                  onInstall={() => toggleInstall(model.id)}
                                  onCancel={() => cancelInstall(model.id)}
                                  onDelete={() => removeInstall(model.id, model.name)}
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  );
                })}

                {filteredFit.quality.length === 0 &&
                  filteredFit.balanced.length === 0 &&
                  filteredFit.performance.length === 0 && <EmptySearch />}
              </div>
            </>
          ) : tab === 'local' ? (
            <>
              {!q && (
                <section className="mb-10">
                  <h2 className="text-base font-semibold text-content-primary mb-4">Installed</h2>
                  {installedModels.length === 0 ? (
                    <p className="text-sm text-content-tertiary">No local models installed yet.</p>
                  ) : (
                    <div className="flex flex-col">
                      {installedModels.map(model => (
                        <div
                          key={model.id}
                          className="w-full flex items-center gap-3 py-3 px-1 rounded-xl hover:bg-surface-hover/50 transition-colors min-w-0"
                        >
                          <span className={`w-10 h-10 rounded-xl bg-gradient-to-br ${model.tone} flex items-center justify-center text-[10px] font-bold text-white shrink-0`}>
                            {model.initial}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 min-w-0 flex-wrap">
                              <span className="text-sm font-medium text-content-primary truncate">{model.name}</span>
                              <TierBadges tiers={model.tiers} />
                            </span>
                            <span className="block text-xs text-content-tertiary truncate mt-0.5">
                              {categoryDisplayLabel(model.category, model.id)} · {model.size}
                            </span>
                          </span>
                          <ModelInstallControl
                            modelId={model.id}
                            name={model.name}
                            isOn
                            isBusy={false}
                            onInstall={() => undefined}
                            onDelete={() => removeInstall(model.id, model.name)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              <div className="space-y-10">
                {localCategories.map(cat => (
                  <section key={cat.id}>
                    <div className="flex items-center gap-2 mb-4">
                      <cat.icon className="w-4 h-4 text-content-secondary" />
                      <h2 className="text-base font-semibold text-content-primary">{cat.title}</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                      {cat.models.map(model => {
                        const isOn = installed.has(model.id);
                        const isBusy = installing.has(model.id);
                        return (
                          <div
                            key={model.id}
                            className="flex items-center gap-3 py-3 rounded-xl px-1 hover:bg-surface-hover/50 transition-colors"
                          >
                            <span className={`w-10 h-10 rounded-xl bg-gradient-to-br ${model.tone} flex items-center justify-center text-[10px] font-bold text-white shrink-0`}>
                              {model.initial}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2 min-w-0 flex-wrap">
                                <span className="text-sm font-medium text-content-primary truncate">{model.name}</span>
                                <TierBadges tiers={model.tiers} />
                              </span>
                              <span className="block text-xs text-content-tertiary truncate mt-0.5">
                                {isEngineDownloadable(model.id)
                                  ? `${categoryDisplayLabel(model.category, model.id)} · ${model.size}`
                                  : `${categoryDisplayLabel(model.category, model.id)} · Discovery`}
                              </span>
                            </span>
                            <ModelInstallControl
                              modelId={model.id}
                              name={model.name}
                              isOn={isOn}
                              isBusy={isBusy}
                              progress={installProgress[model.id]}
                              onInstall={() => toggleInstall(model.id)}
                              onCancel={() => cancelInstall(model.id)}
                              onDelete={() => removeInstall(model.id, model.name)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}

                {localCategories.length === 0 && <EmptySearch />}
              </div>
            </>
          ) : tab === 'engine' ? (
            <div className="py-6">
              <h2 className="text-lg font-semibold text-content-primary mb-2">ARK Engine</h2>
              <p className="text-sm text-content-tertiary mb-6 leading-relaxed">
                ARK Engine is the local inference runtime built into ARK. It runs GGUF models on your hardware with no cloud dependency.
                Use the <strong className="text-content-secondary">Local AI</strong> tab in the sidebar to manage downloaded models and engine settings.
              </p>
              <button
                type="button"
                className="ark-btn-secondary"
                onClick={() => navigate({ name: 'local-ai' })}
              >
                <Brain className="w-4 h-4" />
                Open Local AI &amp; Engine settings
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-content-tertiary mb-8 leading-relaxed">
                Cloud AI does not download a file. A checkmark means “ARK may use this in Chat.”
                Providers are the companies (OpenRouter, Groq, NVIDIA…). Chat / Coding / Fast rows
                are the models on those companies. If a Key badge is showing, that source is already
                saved from Settings and stays checked when you leave this page.
              </p>
              {!q && (
                <section className="mb-10">
                  <h2 className="text-base font-semibold text-content-primary mb-4">Connected</h2>
                  {connectedProviders.length === 0 ? (
                    <p className="text-sm text-content-tertiary">
                      None on yet. If you already saved keys in Settings, they should appear checked here after this page loads.
                    </p>
                  ) : (
                    <div className="flex flex-col">
                      {connectedProviders.map(provider => (
                        <button
                          key={provider.id}
                          type="button"
                          onClick={() => toggleConnected(provider.id)}
                          className="w-full flex items-center gap-3 py-3 px-1 rounded-xl text-left hover:bg-surface-hover/50 transition-colors"
                        >
                          <span className={`w-10 h-10 rounded-xl bg-gradient-to-br ${provider.tone} flex items-center justify-center text-[10px] font-bold text-white shrink-0`}>
                            {provider.initial}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 min-w-0 flex-wrap">
                              <span className="text-sm font-medium text-content-primary truncate">{provider.name}</span>
                              <TierBadges tiers={provider.tiers} />
                              {provider.id === 'ollama' && (
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium leading-none ${
                                  ollamaOnline
                                    ? 'bg-emerald-500/15 text-emerald-400'
                                    : 'bg-zinc-500/20 text-zinc-400'
                                }`}>
                                  {ollamaOnline ? 'Online' : 'Offline'}
                                </span>
                              )}
                              {keyedProviders.has(provider.id) && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 text-sky-400 px-2 py-0.5 text-[10px] font-medium leading-none">
                                  <KeyRound className="w-2.5 h-2.5" />
                                  Key
                                </span>
                              )}
                            </span>
                            <span className="block text-xs text-content-tertiary truncate mt-0.5">
                              {provider.id === 'ollama' ? (ollamaNote || provider.name) : provider.name}
                            </span>
                          </span>
                          <span className="w-8 h-8 rounded-full bg-surface-hover text-ark-accent-green flex items-center justify-center shrink-0">
                            <Check className="w-4 h-4" />
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {ollamaOn && ollamaModels.length > 0 && (
                    <div className="mt-4 rounded-2xl border border-surface-border bg-ark-navy-900/40 px-4 py-3">
                      <p className="text-xs font-semibold text-content-secondary mb-2">Ollama models</p>
                      <div className="flex flex-wrap gap-1.5">
                        {ollamaModels.slice(0, 12).map(m => (
                          <span key={m.name} className="rounded-full border border-surface-border px-2.5 py-1 text-[11px] text-content-tertiary">
                            {m.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}

              <section className="mb-10">
                <h2 className="text-base font-semibold text-content-primary mb-4">Free sources</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                  {FREE_SOURCES.filter(s => !q || s.name.toLowerCase().includes(q) || s.detail.toLowerCase().includes(q)).map(src => (
                    <div
                      key={src.id}
                      className="flex items-center gap-3 py-3 rounded-xl px-1 hover:bg-surface-hover/50 transition-colors"
                      title={src.detail}
                    >
                      <span className={`w-10 h-10 rounded-xl bg-gradient-to-br ${src.tone} flex items-center justify-center text-[10px] font-bold text-white shrink-0`}>
                        {src.initial}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 min-w-0 flex-wrap">
                          <span className="text-sm font-medium text-content-primary truncate">{src.name}</span>
                          {src.wired ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-400 px-2 py-0.5 text-[10px] font-medium leading-none">
                              Live
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-zinc-500/20 text-content-tertiary px-2 py-0.5 text-[10px] font-medium leading-none">
                              Next
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-content-tertiary mt-0.5 truncate">{src.detail}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mb-10">
                <h2 className="text-base font-semibold text-content-primary mb-1">Providers</h2>
                <p className="text-xs text-content-tertiary mb-4">
                  Turn a source on for Chat Auto. Plus asks for a key only if one is not saved yet.
                  Pollinations and Ollama have no cloud key — plus just enables them.
                </p>
                {filteredProviders.length === 0 ? (
                  <EmptySearch />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                    {filteredProviders.map(provider => {
                      const isOn = connected.has(provider.id) || isCloudProviderEnabled(provider.id);
                      return (
                        <div
                          key={provider.id}
                          className="flex items-center gap-3 py-3 rounded-xl px-1 hover:bg-surface-hover/50 transition-colors"
                        >
                          <span className={`w-10 h-10 rounded-xl bg-gradient-to-br ${provider.tone} flex items-center justify-center text-[10px] font-bold text-white shrink-0`}>
                            {provider.initial}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 min-w-0 flex-wrap">
                              <span className="text-sm font-medium text-content-primary truncate">{provider.name}</span>
                              <TierBadges tiers={provider.tiers} />
                              {provider.availability === 'live' ? (
                                <span className="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-400 px-2 py-0.5 text-[10px] font-medium leading-none">
                                  Live
                                </span>
                              ) : provider.availability === 'retired' ? (
                                <span className="inline-flex items-center rounded-full bg-zinc-500/20 text-content-tertiary px-2 py-0.5 text-[10px] font-medium leading-none">
                                  Retired
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-amber-500/15 text-amber-400/90 px-2 py-0.5 text-[10px] font-medium leading-none">
                                  Coming soon
                                </span>
                              )}
                              {provider.health === 'offline' && (
                                <span className="inline-flex items-center rounded-full bg-rose-500/15 text-rose-300 px-2 py-0.5 text-[10px] font-medium leading-none">
                                  Offline
                                </span>
                              )}
                              {provider.id === 'ollama' && (
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium leading-none ${
                                  ollamaOnline
                                    ? 'bg-emerald-500/15 text-emerald-400'
                                    : 'bg-zinc-500/20 text-zinc-400'
                                }`}>
                                  {ollamaOnline ? 'Online' : 'Offline'}
                                </span>
                              )}
                              {keyedProviders.has(provider.id) && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 text-sky-400 px-2 py-0.5 text-[10px] font-medium leading-none">
                                  <KeyRound className="w-2.5 h-2.5" />
                                  Key
                                </span>
                              )}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleConnected(provider.id)}
                            disabled={provider.availability !== 'live' && provider.id !== 'ollama'}
                            className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                              provider.availability !== 'live' && provider.id !== 'ollama'
                                ? 'text-content-tertiary cursor-not-allowed'
                                : isOn
                                  ? 'bg-surface-hover text-ark-accent-green'
                                  : 'text-content-secondary hover:text-content-primary hover:bg-surface-hover'
                            }`}
                            title={
                              provider.availability !== 'live' && provider.id !== 'ollama'
                                ? 'Coming soon'
                                : isOn
                                  ? 'On for Chat — click to turn off (your key stays saved)'
                                  : keyedProviders.has(provider.id)
                                    ? 'Turn on for Chat'
                                    : providerNeedsKey(provider.id)
                                      ? 'Add API key to use in Chat'
                                      : 'Turn on for Chat'
                            }
                            aria-label={isOn ? `Disconnect ${provider.name}` : `Connect ${provider.name}`}
                          >
                            {isOn ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <div className="space-y-10">
                <p className="text-xs text-content-tertiary -mt-4">
                  Chat, Coding, Reasoning, Vision, and Fast are cloud models — not files you download.
                  Checkmark = this model is available in Chat. It stays selected when you leave this page.
                </p>
                {cloudCategories.map(cat => (
                  <section key={cat.id}>
                    <div className="flex items-center gap-2 mb-4">
                      <cat.icon className="w-4 h-4 text-content-secondary" />
                      <h2 className="text-base font-semibold text-content-primary">{cat.title}</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                      {cat.models.map(model => {
                        const providerId = providerIdFromName(model.provider);
                        const avail = cloudModelAvailability(model);
                        const isOn = isCloudModelEnabled(model.id, providerId, avail === 'live')
                          || enabledCloud.has(model.id);
                        return (
                          <div
                            key={model.id}
                            className={`flex items-center gap-3 py-3 rounded-xl px-1 hover:bg-surface-hover/50 transition-colors ${
                              avail !== 'live' ? 'opacity-80' : ''
                            }`}
                          >
                            <span className={`w-10 h-10 rounded-xl bg-gradient-to-br ${model.tone} flex items-center justify-center text-[10px] font-bold text-white shrink-0`}>
                              {model.initial}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2 min-w-0 flex-wrap">
                                <span className="text-sm font-medium text-content-primary truncate">{model.name}</span>
                                <TierBadges tiers={model.tiers} />
                                {avail === 'live' ? (
                                  <span className="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-400 px-2 py-0.5 text-[10px] font-medium leading-none">
                                    Live
                                  </span>
                                ) : avail === 'retired' ? (
                                  <span className="inline-flex items-center rounded-full bg-zinc-500/20 text-content-tertiary px-2 py-0.5 text-[10px] font-medium leading-none">
                                    Retired
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-full bg-amber-500/15 text-amber-400/90 px-2 py-0.5 text-[10px] font-medium leading-none">
                                    Coming soon
                                  </span>
                                )}
                              </span>
                              <span className="block text-xs text-content-tertiary truncate mt-0.5">
                                {categoryDisplayLabel(model.category)} · {model.provider}
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleCloudModel(model.id)}
                              disabled={avail !== 'live'}
                              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                                avail !== 'live'
                                  ? 'text-content-tertiary cursor-not-allowed'
                                  : isOn
                                    ? 'bg-surface-hover text-ark-accent-green'
                                    : 'text-content-secondary hover:text-content-primary hover:bg-surface-hover'
                              }`}
                              title={avail !== 'live' ? 'Not wired in ARK yet' : isOn ? 'On in Chat — click to turn off' : 'Enable in Chat'}
                              aria-label={isOn ? `Disable ${model.name}` : `Enable ${model.name}`}
                            >
                              {isOn ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}

                {cloudCategories.length === 0 && filteredProviders.length > 0 && q && (
                  <p className="text-sm text-content-tertiary">No matching cloud models.</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {connectTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ark-navy-950/70 backdrop-blur-md"
          onClick={() => setConnectTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-surface-border bg-ark-navy-900 p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-content-primary">Connect {connectTarget.name}</h2>
                <p className="text-xs text-content-tertiary mt-1">
                  Paste an API key. It stays on this device. After you save, this provider stays checked
                  and Chat Auto can use it — same as adding it in Settings.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConnectTarget(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-content-tertiary hover:text-content-primary hover:bg-surface-hover"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <label className="block text-xs font-medium text-content-secondary mb-1.5">API key</label>
            <input
              type="password"
              value={apiKeyDraft}
              onChange={e => setApiKeyDraft(e.target.value)}
              placeholder="sk-… or provider token"
              className="ark-input"
              autoFocus
            />
            <div className="flex gap-2 mt-5">
              <button type="button" onClick={() => setConnectTarget(null)} className="ark-btn-secondary flex-1">
                Cancel
              </button>
              <button
                type="button"
                onClick={saveConnect}
                disabled={!apiKeyDraft.trim()}
                className="ark-btn-primary flex-1 disabled:opacity-40"
              >
                <KeyRound className="w-4 h-4" />
                Save & connect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptySearch() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-base font-semibold text-content-primary mb-1">No matches</p>
      <p className="text-sm text-content-tertiary">Try a different search.</p>
    </div>
  );
}
