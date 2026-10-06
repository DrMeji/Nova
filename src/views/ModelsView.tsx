/**
 * Models catalog (For your PC / Local / Cloud). Sidebar → Models.
 * CLOUD_MODELS stays exported for SearchPanel.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Plus, Check, Download, Loader2, Cpu, Cloud, Monitor,
  Code, Boxes, Brain, Eye, Zap, Image as ImageIcon, Video, Gauge, Sparkles, Rocket, X, KeyRound, Globe, RefreshCw, Trash2, ExternalLink,
} from 'lucide-react';
import { detectHardware, getAccurateHardware, getHardwareClass, isEngineDownloadable, loadHardwareSnapshot, parseRamGb, type HardwareClass, type HardwareInfo } from '@/lib/api';
import {
  categoryDisplayLabel,
  LOCAL_CATEGORY_ORDER,
  sortModelsByCategoryThenSizeDesc,
} from '@/lib/modelSort';
import {
  engineDiskSpace,
  getEngineStatus,
  deleteEngineModel,
  scanExternalGgufs,
  importGgufPath,
  importGgufPick,
  type ExternalGgufHit,
} from '@/lib/novaEngine';
import { BrandMark, StatusCheck } from '@/components/BrandMark';
import { ModelDownloadConfirm } from '@/components/ModelDownloadConfirm';
import { useRouter } from '@/context/RouterContext';
import {
  cancelEngineDownload,
  getEngineDownloadMap,
  isEngineDownloading,
  reattachEngineDownloads,
  startEngineDownload,
  subscribeEngineDownloads,
} from '@/lib/engineDownloads';
import {
  getLocalPrefs,
  getProviderApiKeys,
  hasProviderApiKey,
  setLocalPrefs,
  setProviderApiKey,
} from '@/lib/localPrefs';
import { clearAllThreadBrains } from '@/lib/threadBrain';
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
import { huntModelsForPc, huntModelsByQuery, huntSourceBadge, type HuntedModel } from '@/lib/novaModelHunt';
import {
  assessModelDownloadFit,
  findSimilarRecommendedModel,
  type ModelFitAssessment,
  type SimilarModelPick,
} from '@/lib/modelCompat';
import { probeLiveCapacity, type LiveCapacity } from '@/lib/novaCapacity';
import { isWeakCoderId } from '@/lib/brainRoles';
import { getBrainProfile, assertCoderAllowed } from '@/lib/brainProfile';
import { assessEnsembleReadiness, type EnsembleReadiness } from '@/lib/ensembleReadiness';
import { hardwareCoderRecommendation } from '@/lib/brainRoles';
import { openInSystemBrowser } from '@/lib/openExternal';
import { providerKeyUrl } from '@/lib/providerKeyUrls';

type TabId = 'for-pc' | 'local' | 'cloud' | 'build-team';
type Tier = 'free' | 'pro';
type FitKind = 'quality' | 'balanced' | 'performance';

type LocalModel = {
  id: string;
  name: string;
  description: string;
  size: string;
  category: 'coding' | 'design' | 'general' | 'reasoning' | 'vision' | 'image' | 'video' | 'fast';
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
  /** Catalog ping is not live. Key / Live / Retired badges are the honest status. */
  health: 'available' | 'limited' | 'offline';
  /** Live in NOVA Router / media today vs catalog only */
  availability: 'live' | 'coming_soon' | 'retired';
};

export type CloudModel = {
  id: string;
  name: string;
  description: string;
  provider: string;
  category: 'chat' | 'coding' | 'reasoning' | 'vision' | 'image' | 'video' | 'fast';
  tiers: Tier[];
  recommended?: boolean;
  tone: string;
  initial: string;
};

const LOCAL_MODELS: LocalModel[] = [
  // Coding: local downloads are free to run on your machine
  { id: 'qwen25-coder-7b', name: 'Qwen2.5-Coder 7B', description: 'Strong local coding model for most PCs.', size: '4.7 GB', category: 'coding', tiers: ['free'], recommended: true, tone: 'from-sky-500 to-blue-700', initial: 'Qc' },
  { id: 'qwen25-coder-14b', name: 'Qwen2.5-Coder 14B', description: 'Higher quality coding when you have more VRAM / RAM.', size: '9.0 GB', category: 'coding', tiers: ['free'], tone: 'from-blue-500 to-indigo-700', initial: 'Q14' },
  { id: 'deepseek-coder-v2-lite', name: 'DeepSeek Coder V2 Lite', description: 'Efficient coding assistant for builds and refactors.', size: '8.9 GB', category: 'coding', tiers: ['free'], tone: 'from-cyan-500 to-teal-700', initial: 'DS' },
  { id: 'codellama-13b', name: 'Code Llama 13B', description: 'Meta coding model for generation and completion.', size: '7.4 GB', category: 'coding', tiers: ['free'], tone: 'from-violet-500 to-purple-800', initial: 'CL' },
  { id: 'starcoder2-7b', name: 'StarCoder2 7B', description: 'Code focused model trained on many languages.', size: '4.3 GB', category: 'coding', tiers: ['free'], tone: 'from-amber-500 to-orange-700', initial: 'Sc' },

  // Design — optional CSS/UI polish brain (Single Brain Create does not require this)
  { id: 'uigen-fx-4b', name: 'UIGEN-FX 4B', description: 'Optional UI polish brain — can refine CSS type/palette when pinned. Create invents original layouts from your brief with any Ready coder/instruct model; this is not required.', size: '2.5 GB', category: 'design', tiers: ['free'], recommended: true, tone: 'from-rose-400 to-orange-600', initial: 'UI' },

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
  { id: 'phi4-reasoning', name: 'Phi-4 Reasoning', description: 'Compact reasoning model for local use.', size: '8.5 GB', category: 'reasoning', tiers: ['free'], tone: 'from-sky-500 to-indigo-800', initial: 'Φ4' },

  // Vision (understand images, not generate)
  { id: 'qwen2-vl-7b', name: 'Qwen2-VL 7B', description: 'Vision bundle (~7.4 GB). On-device image chat when both GGUF + mmproj are installed. NOVA hops vision to your chat/coder brain automatically.', size: '7.4 GB', category: 'vision', tiers: ['free'], recommended: true, tone: 'from-teal-500 to-emerald-800', initial: 'VL' },
  { id: 'llava-13b', name: 'LLaVA 13B', description: 'Image chat and visual Q&A (local VL — coming to Engine downloads).', size: '7.8 GB', category: 'vision', tiers: ['free'], tone: 'from-lime-500 to-green-800', initial: 'Lv' },
  { id: 'minicpm-v', name: 'MiniCPM-V', description: 'Efficient multimodal model for vision tasks (local VL — coming soon).', size: '5.1 GB', category: 'vision', tiers: ['free'], tone: 'from-green-500 to-teal-800', initial: 'Mv' },
  { id: 'llama32-vision-11b', name: 'Llama 3.2 Vision 11B', description: 'Meta multimodal model for image understanding (local VL — coming soon).', size: '7.9 GB', category: 'vision', tiers: ['free'], tone: 'from-indigo-400 to-violet-800', initial: 'LV' },
  { id: 'moondream2', name: 'Moondream 2', description: 'Tiny vision model for quick image captions (local VL — coming soon).', size: '1.7 GB', category: 'vision', tiers: ['free'], tone: 'from-yellow-500 to-amber-700', initial: 'Md' },

  // Image generation (Image tab)
  { id: 'NOVA-image-core', name: 'NOVA Image Core', description: 'Uses Hugging Face FLUX when keyed, then local SD/FLUX. Pollinations disabled.', size: 'Cloud / local', category: 'image', tiers: ['free'], recommended: true, tone: 'from-yellow-400 to-orange-700', initial: 'AI' },
  { id: 'sd15-local', name: 'Stable Diffusion 1.5 (Local)', description: 'On-device images via NOVA Engine (sd.cpp). Download from Local AI.', size: '4.0 GB', category: 'image', tiers: ['free'], recommended: true, tone: 'from-yellow-500 to-amber-700', initial: 'SD' },
  { id: 'sdxl-turbo-local', name: 'SDXL Turbo (Local)', description: 'Fast on-device drafts via NOVA Engine. ~6.9 GB.', size: '6.9 GB', category: 'image', tiers: ['free'], recommended: true, tone: 'from-fuchsia-500 to-pink-700', initial: 'ST' },
  { id: 'flux-schnell-local', name: 'FLUX.1 Schnell (Local)', description: 'On-device FLUX via NOVA Engine (~13 GB: model + VAE + CLIP + T5).', size: '13 GB', category: 'image', tiers: ['free'], recommended: true, tone: 'from-violet-500 to-purple-800', initial: 'Fx' },
  { id: 'sdxl-turbo', name: 'SDXL Turbo', description: 'Alias. Use SDXL Turbo (Local) in Local AI.', size: '6.9 GB', category: 'image', tiers: ['free'], tone: 'from-fuchsia-500 to-pink-700', initial: 'ST' },
  { id: 'sd-15', name: 'Stable Diffusion 1.5', description: 'Alias. Use Stable Diffusion 1.5 (Local) in Local AI.', size: '4.0 GB', category: 'image', tiers: ['free'], tone: 'from-yellow-500 to-amber-700', initial: 'SD' },
  { id: 'playground-v25', name: 'Playground v2.5', description: 'Aesthetic local image generation.', size: '8.2 GB', category: 'image', tiers: ['free'], tone: 'from-rose-400 to-orange-700', initial: 'Pg' },

  // Video generation (Video tab)
  { id: 'NOVA-video-core', name: 'NOVA Video Core', description: 'Built-in NOVA video model for the Video tab.', size: '3.2 GB', category: 'video', tiers: ['free'], recommended: true, tone: 'from-sky-500 to-indigo-800', initial: 'AV' },
  { id: 'cogvideox-2b', name: 'CogVideoX 2B', description: 'Short clips via NOVA Engine free/cloud video path (not on-device weights yet).', size: '5.5 GB', category: 'video', tiers: ['free'], recommended: true, tone: 'from-cyan-500 to-blue-800', initial: 'Cv' },
  { id: 'wan-14b', name: 'Wan 2.1 14B', description: 'Higher quality video via Engine free/cloud routes when available.', size: '18 GB', category: 'video', tiers: ['free'], tone: 'from-indigo-500 to-violet-900', initial: 'Wn' },
  { id: 'ltx-video', name: 'LTX Video', description: 'Fast video drafts via Engine free video providers.', size: '7.1 GB', category: 'video', tiers: ['free'], tone: 'from-emerald-400 to-teal-800', initial: 'LT' },

  // Fast
  { id: 'qwen25-15b', name: 'Qwen2.5 1.5B', description: 'Very fast chat-only replies on modest hardware. Never use as coder.', size: '1.0 GB', category: 'fast', tiers: ['free'], recommended: false, tone: 'from-emerald-400 to-green-700', initial: 'Q1' },
  { id: 'gemma2-2b', name: 'Gemma 2 2B', description: 'Small and snappy for quick drafts.', size: '1.6 GB', category: 'fast', tiers: ['free'], tone: 'from-teal-400 to-cyan-700', initial: 'G2' },
  { id: 'phi3-mini', name: 'Phi-3 Mini', description: 'Lightweight everyday assistant.', size: '2.3 GB', category: 'fast', tiers: ['free'], tone: 'from-cyan-400 to-sky-700', initial: 'Φ3' },
  { id: 'smollm2-1.7b', name: 'SmolLM2 1.7B', description: 'Ultra small model for instant responses.', size: '1.1 GB', category: 'fast', tiers: ['free'], tone: 'from-lime-400 to-emerald-700', initial: 'Sm' },
  { id: 'tinyllama', name: 'TinyLlama 1.1B', description: 'Minimal footprint for testing and demos.', size: '0.7 GB', category: 'fast', tiers: ['free'], tone: 'from-zinc-500 to-zinc-800', initial: 'TL' },
];

const LOCAL_CATEGORY_META: Record<LocalModel['category'], { title: string; icon: typeof Code }> = {
  general: { title: 'General', icon: Boxes },
  coding: { title: 'Coding', icon: Code },
  design: { title: 'Design', icon: Sparkles },
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
  { id: 'ollama', name: 'Ollama', description: 'Optional plug-in. Connect any Ollama models the same way you connect other sources. NOVA never requires it.', tiers: ['free'], tone: 'from-zinc-400 to-zinc-700', initial: 'Ol', health: 'available', availability: 'live' },
  { id: 'openrouter', name: 'OpenRouter', description: 'Free + paid routes used by NOVA Router.', tiers: ['free', 'pro'], tone: 'from-violet-500 to-purple-800', initial: 'OR', health: 'available', availability: 'live' },
  { id: 'google', name: 'Google AI Studio', description: 'Gemini free tier. Wired into NOVA Router.', tiers: ['free', 'pro'], tone: 'from-blue-500 to-sky-700', initial: 'G', health: 'available', availability: 'live' },
  { id: 'groq', name: 'Groq', description: 'Fast Llama free tier. Wired into NOVA Router.', tiers: ['free', 'pro'], tone: 'from-orange-500 to-red-700', initial: 'Gq', health: 'available', availability: 'live' },
  { id: 'openai', name: 'OpenAI', description: 'GPT models for chat and code.', tiers: ['pro'], tone: 'from-emerald-400 to-green-800', initial: 'OA', health: 'available', availability: 'live' },
  { id: 'anthropic', name: 'Anthropic', description: 'Claude models for long context work.', tiers: ['pro'], tone: 'from-amber-500 to-orange-800', initial: 'An', health: 'available', availability: 'live' },
  { id: 'huggingface', name: 'Hugging Face', description: 'Chat via Inference API. Wired into NOVA Router.', tiers: ['free', 'pro'], tone: 'from-yellow-500 to-amber-700', initial: 'HF', health: 'available', availability: 'live' },
  { id: 'nvidia', name: 'NVIDIA NIM', description: 'NVIDIA hosted inference. free-key hop in NOVA Router.', tiers: ['free', 'pro'], tone: 'from-lime-500 to-green-800', initial: 'NV', health: 'available', availability: 'live' },
  { id: 'together', name: 'Together AI', description: 'Open model hosting. Wired into NOVA Router.', tiers: ['free', 'pro'], tone: 'from-indigo-500 to-blue-800', initial: 'To', health: 'available', availability: 'live' },
  { id: 'fireworks', name: 'Fireworks AI', description: 'Fast serverless inference. Wired into NOVA Router.', tiers: ['free', 'pro'], tone: 'from-rose-500 to-orange-700', initial: 'Fw', health: 'available', availability: 'live' },
  { id: 'deepseek', name: 'DeepSeek', description: 'Coding and reasoning via API. Wired into NOVA Router.', tiers: ['free', 'pro'], tone: 'from-blue-400 to-indigo-700', initial: 'DS', health: 'available', availability: 'live' },
  { id: 'mistral', name: 'Mistral', description: 'Mistral and Codestral. Wired into NOVA Router.', tiers: ['free', 'pro'], tone: 'from-orange-400 to-amber-700', initial: 'Mi', health: 'available', availability: 'live' },
  { id: 'cerebras', name: 'Cerebras', description: 'Ultra-fast Llama free tier. Wired into NOVA Router.', tiers: ['free', 'pro'], tone: 'from-cyan-500 to-teal-800', initial: 'Ce', health: 'available', availability: 'live' },
  { id: 'sambanova', name: 'SambaNova', description: 'SambaNova Cloud open models. Wired into NOVA Router.', tiers: ['free', 'pro'], tone: 'from-fuchsia-500 to-purple-800', initial: 'Sn', health: 'available', availability: 'live' },
  { id: 'perplexity', name: 'Perplexity', description: 'Sonar chat with live search. add your API key.', tiers: ['pro'], tone: 'from-teal-400 to-cyan-800', initial: 'Px', health: 'available', availability: 'live' },
  { id: 'xai', name: 'xAI', description: 'Grok models. add your xAI API key.', tiers: ['pro'], tone: 'from-zinc-400 to-black', initial: 'xA', health: 'available', availability: 'live' },
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

  // Coding free extras
  { id: 'or-llama-free', name: 'Llama 3.3 70B (OpenRouter Free)', description: 'Free OpenRouter coding/chat route when available.', provider: 'OpenRouter', category: 'coding', tiers: ['free'], tone: 'from-violet-400 to-indigo-700', initial: 'OR' },
  { id: 'groq-llama', name: 'Llama 3.3 70B (Groq)', description: 'Fast free-tier coding chat via Groq key.', provider: 'Groq', category: 'coding', tiers: ['free'], tone: 'from-orange-400 to-red-700', initial: 'Gq' },
  { id: 'gemini-flash-code', name: 'Gemini 2.0 Flash (Coding)', description: 'Free-tier Google coding assistant.', provider: 'Google', category: 'coding', tiers: ['free'], tone: 'from-blue-400 to-sky-700', initial: 'Gc' },

  // Video generation
  { id: 'NOVA-pollinations-video', name: 'NOVA Video (Pollinations)', description: 'Free short MP4 when the host answers. Otherwise a 4s motion clip from a still. labeled honestly.', provider: 'Pollinations', category: 'video', tiers: ['free'], tone: 'from-pink-500 to-violet-800', initial: 'Pv' },
  { id: 'runway-gen3', name: 'Runway Gen-3', description: 'Cloud video generation and editing.', provider: 'Runway', category: 'video', tiers: ['pro'], tone: 'from-emerald-400 to-teal-800', initial: 'Rw' },
  { id: 'luma-ray2', name: 'Luma Ray2', description: 'Text and image to video.', provider: 'Luma', category: 'video', tiers: ['pro'], tone: 'from-sky-400 to-indigo-800', initial: 'Lu' },
  { id: 'kling-1', name: 'Kling', description: 'Short cinematic cloud clips. Not wired in NOVA yet.', provider: 'OpenRouter', category: 'video', tiers: ['free', 'pro'], tone: 'from-violet-500 to-purple-800', initial: 'Kl' },
  { id: 'pika-2', name: 'Pika 2.0', description: 'Fast creative video drafts. Not wired in NOVA yet.', provider: 'OpenRouter', category: 'video', tiers: ['free', 'pro'], tone: 'from-pink-500 to-rose-800', initial: 'Pk' },
  { id: 'sora', name: 'Sora', description: 'OpenAI video generation. Not wired in NOVA yet.', provider: 'OpenAI', category: 'video', tiers: ['pro'], tone: 'from-emerald-400 to-green-800', initial: 'So' },

  // Fast
  { id: 'groq-llama-fast', name: 'Llama 3.3 70B (Groq)', description: 'Very fast Llama responses on Groq.', provider: 'Groq', category: 'fast', tiers: ['free', 'pro'], tone: 'from-orange-500 to-red-700', initial: 'Gq' },
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
];

/** Providers NOVA Router / media can actually call today. */
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
    // Video tab is parked — never show video models as live in the catalog.
    return 'coming_soon';
  }
  if (model.category === 'image') {
    // Image product removed — catalog discovery only, never "live".
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
  design: 'Design',
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

function canRunOnPc(model: LocalModel, pc: HardwareClass, ramGb = 8, hw?: HardwareInfo | null) {
  // For your PC: only models assessed as a good fit (not stretch / blocked).
  if (hw) {
    return assessModelDownloadFit(modelSizeGb(model), hw).level === 'good';
  }
  const rank: Record<HardwareClass, number> = { light: 0, standard: 1, strong: 2 };
  if (rank[modelHwNeed(model)] > rank[pc]) return false;
  // GGUF needs headroom beyond file size (context + OS).
  const needRam = modelSizeGb(model) * 1.35 + 4;
  if (modelSizeGb(model) >= 16) return false;
  return ramGb >= needRam || modelSizeGb(model) < 2;
}

function buildFitLists(pc: HardwareClass, ramGb = 8, hw?: HardwareInfo | null) {
  // Prefer models NOVA can actually install; keep others discoverable via Search.
  const installable = LOCAL_MODELS.filter(m => isEngineDownloadable(m.id));
  const pool = installable.length ? installable : LOCAL_MODELS;
  const compatible = sortModelsByCategoryThenSizeDesc(
    pool.filter(m => canRunOnPc(m, pc, ramGb, hw)),
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
  const canInstall = isEngineDownloadable(modelId);
  if (isOn) {
    return (
      <span className="inline-flex items-center gap-0.5 shrink-0">
        <StatusCheck label={`Installed ${name} in NOVA Engine`} />
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="w-8 h-8 rounded-full bg-surface-hover text-rose-500 hover:bg-surface-hover/80 hover:text-rose-300 transition-colors flex items-center justify-center"
            title={`Delete ${name}`}
            aria-label={`Delete ${name}`}
          >
            <Trash2 className="w-4 h-4 text-rose-500" />
          </button>
        )}
      </span>
    );
  }
  if (!canInstall) {
    return (
      <span
        className="inline-flex items-center rounded-full bg-surface-hover/80 px-2 py-1 text-[10px] font-medium text-content-tertiary shrink-0"
        title="Listed for discovery. Not downloadable in NOVA Engine yet"
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
      className="inline-flex items-center gap-1.5 h-8 rounded-full px-2.5 shrink-0 text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors text-[11px] font-medium"
      title="Download into NOVA Engine"
      aria-label={`Download ${name}`}
    >
      <Download className="w-4 h-4" />
      <span>Download</span>
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

export type ModelsViewProps = {
  /** When set (Brain embed), show only this catalog tab and skip Models chrome. */
  embedTab?: TabId;
  hideChrome?: boolean;
};

function BuildTeamPanel({
  installed,
  installing,
  installProgress,
  onInstall,
  onInstallTeam,
  onCancel,
  onDelete,
}: {
  installed: Set<string>;
  installing: Set<string>;
  installProgress: Record<string, number>;
  onInstall: (id: string) => void;
  onInstallTeam: (ids: string[]) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const [team, setTeam] = useState<EnsembleReadiness | null>(null);
  const [ramHint, setRamHint] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [status, profile] = await Promise.all([getEngineStatus(), getBrainProfile()]);
        if (cancelled) return;
        setTeam(assessEnsembleReadiness(status.models, {
          ramGb: profile.ramGB,
          maxCoderParamsB: profile.maxCoderParamsB,
        }));
        setRamHint(hardwareCoderRecommendation(profile.ramGB));
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [installed, installing]);

  const roleModels = useMemo(() => {
    const byRole: Record<'chat' | 'coder' | 'design' | 'vision', LocalModel[]> = {
      chat: LOCAL_MODELS.filter(m => m.category === 'general' || m.category === 'fast'),
      coder: LOCAL_MODELS.filter(m => m.category === 'coding'),
      design: LOCAL_MODELS.filter(m => m.category === 'design' || m.id === 'uigen-fx-4b'),
      vision: LOCAL_MODELS.filter(m => m.category === 'vision'),
    };
    for (const key of Object.keys(byRole) as Array<keyof typeof byRole>) {
      byRole[key] = sortModelsByCategoryThenSizeDesc(
        byRole[key].filter(m => isEngineDownloadable(m.id)),
      );
    }
    return byRole;
  }, []);

  /** Missing roles + Design specialist when only Instruct fallback — skip optional Vision. */
  const missingInstalls = (team?.roles || [])
    .filter((r) => {
      if (r.role === 'vision') return false;
      if (r.status === 'missing') return true;
      if (r.role === 'design' && r.status === 'fallback') return true;
      return false;
    })
    .map((r) => ({ id: r.recommendedId, name: r.recommendedId, role: r.role }))
    .filter((m) => m.id && !installed.has(m.id) && !installing.has(m.id) && isEngineDownloadable(m.id));

  return (
    <div className="space-y-10">
      <section>
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-content-primary">Build team</h2>
            <p className="text-sm text-content-tertiary mt-1">
              One locked brain does talk, create, and edit (ensemble Auto is parked — not removed). Install backups for when context fills. {ramHint}
            </p>
          </div>
          {missingInstalls.length > 0 && (
            <button
              type="button"
              className="nova-btn-primary h-8 px-3 rounded-lg text-xs shrink-0"
              onClick={() => {
                const ids = [...new Set(missingInstalls.map((m) => m.id))];
                onInstallTeam(ids);
              }}
            >
              Install recommended team
            </button>
          )}
        </div>

        {!team ? (
          <p className="text-sm text-content-tertiary">Checking engines…</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {team.roles.map((r) => (
              <li
                key={r.role}
                className="flex items-center justify-between gap-2 rounded-xl border border-surface-border/80 bg-surface-hover/30 px-3 py-2.5"
              >
                <span className="min-w-0">
                  <span className="font-medium text-content-primary capitalize">{r.role}</span>
                  <span className="block text-content-tertiary truncate mt-0.5">{r.name}</span>
                  <span className="block text-content-tertiary/80 mt-0.5 leading-snug">{r.why}</span>
                </span>
                <span className={
                  r.status === 'ready' ? 'text-emerald-400 shrink-0'
                    : r.status === 'fallback' ? 'text-amber-300 shrink-0'
                      : 'text-rose-300 shrink-0'
                }
                >
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(['chat', 'coder', 'design', 'vision'] as const).map((role) => {
        const models = roleModels[role];
        if (!models.length) return null;
        const title =
          role === 'chat' ? 'Chat'
            : role === 'coder' ? 'Coder'
              : role === 'design' ? 'Design'
                : 'Vision';
        return (
          <section key={role}>
            <div className="flex items-center gap-2 mb-4">
              {role === 'chat' ? <Brain className="w-4 h-4 text-content-secondary" />
                : role === 'coder' ? <Code className="w-4 h-4 text-content-secondary" />
                  : role === 'design' ? <Sparkles className="w-4 h-4 text-content-secondary" />
                    : <Eye className="w-4 h-4 text-content-secondary" />}
              <h2 className="text-base font-semibold text-content-primary">{title}</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
              {models.map((model) => {
                const isOn = installed.has(model.id);
                const isBusy = installing.has(model.id);
                return (
                  <div
                    key={model.id}
                    className="flex items-center gap-3 py-3 rounded-xl px-1 hover:bg-surface-hover/50 transition-colors"
                  >
                    <BrandMark id={model.id} name={model.name} initial={model.initial} tone={model.tone} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 min-w-0 flex-wrap">
                        <span className="text-sm font-medium text-content-primary truncate">{model.name}</span>
                        <TierBadges tiers={model.tiers} />
                        {model.recommended ? (
                          <span className="inline-flex items-center rounded-full bg-sky-500/15 text-sky-300 px-2 py-0.5 text-[10px] font-medium leading-none">
                            Recommended
                          </span>
                        ) : null}
                      </span>
                      <span className="block text-xs text-content-tertiary truncate mt-0.5">
                        {model.size} · {model.description}
                      </span>
                    </span>
                    <ModelInstallControl
                      modelId={model.id}
                      name={model.name}
                      isOn={isOn}
                      isBusy={isBusy}
                      progress={installProgress[model.id]}
                      onInstall={() => onInstall(model.id)}
                      onCancel={() => onCancel(model.id)}
                      onDelete={() => onDelete(model.id, model.name)}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function ModelsView({ embedTab, hideChrome = false }: ModelsViewProps = {}) {
  const { route, navigate } = useRouter();
  const [tab, setTab] = useState<TabId>(() => {
    if (embedTab) return embedTab;
    if (route.name !== 'models') return 'for-pc';
    const t = route.tab;
    if (t === 'local' || t === 'cloud' || t === 'for-pc' || t === 'build-team') return t;
    return 'for-pc';
  });
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
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectError, setConnectError] = useState('');
  const [keyedProviders, setKeyedProviders] = useState<Set<string>>(
    () => new Set(Object.keys(getProviderApiKeys())),
  );
  const [ollamaOn, setOllamaOn] = useState(() => isOllamaEnabled());
  const [ollamaOnline, setOllamaOnline] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [ollamaNote, setOllamaNote] = useState('');
  const [hunted, setHunted] = useState<HuntedModel[]>([]);
  const [queryHunted, setQueryHunted] = useState<HuntedModel[]>([]);
  const [queryHuntBusy, setQueryHuntBusy] = useState(false);
  const [huntNote, setHuntNote] = useState('');
  const [huntBusy, setHuntBusy] = useState(false);
  const [externalHits, setExternalHits] = useState<ExternalGgufHit[]>([]);
  const [externalNote, setExternalNote] = useState('');
  const [externalBusy, setExternalBusy] = useState(false);
  const [liveCapacity, setLiveCapacity] = useState<LiveCapacity | null>(null);
  const [showRetiredSources, setShowRetiredSources] = useState(false);
  const [downloadConfirm, setDownloadConfirm] = useState<{
    id: string;
    name: string;
    sizeLabel?: string;
    sizeGb?: number;
    category?: string;
    detail?: string;
    hunt?: HuntedModel;
    fit?: ModelFitAssessment | null;
    recommended?: SimilarModelPick | null;
  } | null>(null);
  const prevInstalledRef = useRef<Set<string>>(new Set());

  const pinOnEngineReady = useCallback((id: string) => {
    if (id === 'NOVA-core' || id === 'NOVA-image-core' || id === 'NOVA-video-core') return;
    const model = LOCAL_MODELS.find(m => m.id === id);
    const cat = model?.category;
    if (cat === 'image' || cat === 'video' || cat === 'vision') return;
    if (cat === 'coding') {
      if (isWeakCoderId(id)) {
        setLocalPrefs({ defaultModelId: id, lastChatModelId: id, activeChatId: id });
        setOllamaNote(`${model?.name || id} is ready for chat only — too small for the coder role.`);
      } else {
        setLocalPrefs({ defaultCodeModelId: id, activeCoderId: id });
      }
    } else if (cat === 'design') {
      setLocalPrefs({ activeDesignId: id });
      setOllamaNote(`${model?.name || id} pinned as Design brain for Layout Contract hops.`);
    } else {
      setLocalPrefs({ defaultModelId: id, lastChatModelId: id, activeChatId: id });
    }
    clearAllThreadBrains();
    if (!(cat === 'coding' && isWeakCoderId(id))) {
      setOllamaNote(`${model?.name || id} is ready — Chat will use it on the next message.`);
    }
    try {
      window.dispatchEvent(new CustomEvent('NOVA:local-model-ready', { detail: { id } }));
    } catch {
      /* ignore */
    }
  }, []);

  const applyReadySet = useCallback((ready: Set<string>) => {
    const prev = prevInstalledRef.current;
    for (const id of ready) {
      if (!prev.has(id)) pinOnEngineReady(id);
    }
    prevInstalledRef.current = ready;
    setInstalled(ready);
  }, [pinOnEngineReady]);

  const pcClass = useMemo(() => getHardwareClass(hw), [hw]);
  const ramGb = useMemo(() => parseRamGb(hw), [hw]);
  const fitLists = useMemo(() => buildFitLists(pcClass, ramGb, hw), [pcClass, ramGb, hw]);

  // Drop retired 32B pins so Auto never tries to load a removed GGUF.
  useEffect(() => {
    const prefs = getLocalPrefs();
    const retired = /coder-32b|32b/i;
    const patch: Record<string, string> = {};
    if (retired.test(String(prefs.activeCoderId || ''))) patch.activeCoderId = 'NOVA-auto';
    if (retired.test(String(prefs.defaultCodeModelId || ''))) patch.defaultCodeModelId = 'NOVA-auto';
    if (retired.test(String(prefs.defaultModelId || ''))) patch.defaultModelId = 'NOVA-auto';
    if (retired.test(String(prefs.lastChatModelId || ''))) patch.lastChatModelId = 'NOVA-auto';
    if (retired.test(String(prefs.activeChatId || ''))) patch.activeChatId = 'NOVA-auto';
    if (Object.keys(patch).length) setLocalPrefs(patch as Parameters<typeof setLocalPrefs>[0]);
  }, []);

  useEffect(() => {
    if (embedTab) {
      setTab(embedTab);
      return;
    }
    if (route.name !== 'models') return;
    const t = route.tab;
    if (t === 'local' || t === 'cloud' || t === 'for-pc' || t === 'build-team') setTab(t);
    else setTab('for-pc');
  }, [route, embedTab]);

  useEffect(() => {
    const hydrate = () => {
      setKeyedProviders(new Set(Object.keys(getProviderApiKeys())));
      setConnected(new Set(listConnectedProviderIds()));
      setEnabledCloud(new Set(liveEnabledCloudIds()));
      setOllamaOn(isOllamaEnabled());
    };
    hydrate();
    window.addEventListener('NOVA:cloud-sources-changed', hydrate);
    window.addEventListener('NOVA:provider-keys-changed', hydrate);
    return () => {
      window.removeEventListener('NOVA:cloud-sources-changed', hydrate);
      window.removeEventListener('NOVA:provider-keys-changed', hydrate);
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
              && m.id !== 'NOVA-core'
              && m.id !== 'NOVA-image-core'
              && m.id !== 'NOVA-video-core',
            )
            .map(m => m.id),
        );
        // First hydrate: seed prev so we don't re-pin every already-installed model.
        prevInstalledRef.current = ready;
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
              && m.id !== 'NOVA-core'
              && m.id !== 'NOVA-image-core'
              && m.id !== 'NOVA-video-core',
            )
            .map(m => m.id),
        );
        applyReadySet(ready);
      }).catch(() => undefined);
    });
  }, [applyReadySet]);

  useEffect(() => {
    const onHw = () => {
      void getAccurateHardware(true).then(setHw);
    };
    window.addEventListener('NOVA:hardware-rescanned', onHw);
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
            && m.id !== 'NOVA-core'
            && m.id !== 'NOVA-image-core'
            && m.id !== 'NOVA-video-core',
          )
          .map(m => m.id),
      );
      prevInstalledRef.current = ready;
      setInstalled(ready);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      window.removeEventListener('NOVA:hardware-rescanned', onHw);
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
          : 'No extra online models right now. catalog below still applies',
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

  // Free-text online hunt — any GGUF, not limited to the curated PC list.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setQueryHunted([]);
      setQueryHuntBusy(false);
      return;
    }
    let cancelled = false;
    setQueryHuntBusy(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const info = hw.accurate ? hw : await getAccurateHardware(true);
          const found = await huntModelsByQuery(q, info, { limit: 14 });
          if (!cancelled) setQueryHunted(found);
        } catch {
          if (!cancelled) setQueryHunted([]);
        } finally {
          if (!cancelled) setQueryHuntBusy(false);
        }
      })();
    }, 420);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, hw]);

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
    setConnectError('');
  };

  const saveConnect = async () => {
    if (!connectTarget) return;
    const providerId = connectTarget.id;
    const value = apiKeyDraft.trim();
    setConnectBusy(true);
    setConnectError('');
    try {
      await setProviderApiKey(providerId, value);
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Could not save API key securely');
      setConnectBusy(false);
      return;
    }
    setKeyedProviders(prev => {
      const next = new Set(prev);
      if (value) next.add(providerId);
      else next.delete(providerId);
      return next;
    });
    setConnected(prev => {
      const next = new Set(prev);
      if (value) next.add(providerId);
      return next;
    });
    if (value) {
      setCloudProviderEnabled(providerId, true);
      const ids = CLOUD_MODELS
        .filter(m => providerIdFromName(m.provider) === providerId && cloudModelAvailability(m) === 'live')
        .map(m => m.id);
      const currentlyOn = liveEnabledCloudIds();
      setEnabledCloud(addEnabledCloudModels(ids, currentlyOn));
    }
    setConnectBusy(false);
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

  /** Normalize so "qwen2-vl-7b", "qwen2 vl 7b", "Qwen2-VL 7B" all match. */
  const normalizeModelSearch = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

  const modelMatchesQuery = (m: { id: string; name: string; description: string; category: string; tiers: string[] }, rawQ: string) => {
    if (!rawQ) return true;
    const nq = normalizeModelSearch(rawQ);
    const hay = normalizeModelSearch(
      [m.id, m.name, m.description, CATEGORY_LABEL[m.category] || m.category, ...m.tiers].join(' '),
    );
    if (hay.includes(nq) || m.id.toLowerCase().includes(rawQ) || m.name.toLowerCase().includes(rawQ)) {
      return true;
    }
    // Token match: every query token must appear somewhere in the haystack.
    const tokens = nq.split(' ').filter(Boolean);
    return tokens.length > 0 && tokens.every(t => hay.includes(t));
  };

  const filteredFit = useMemo(() => {
    const match = (m: LocalModel) => modelMatchesQuery(m, q);

    // Searching: show every catalog hit (including Design / stretch), not only fit tiers.
    if (q) {
      const hits = LOCAL_MODELS.filter(match);
      const installable = hits.filter(m => isEngineDownloadable(m.id));
      const discovery = hits.filter(m => !isEngineDownloadable(m.id));
      // Search on For your PC: only good-fit installable models (blocked/oversized stay out).
      const fit = installable.filter(m => canRunOnPc(m, pcClass, ramGb, hw));
      const allHits = sortModelsByCategoryThenSizeDesc([...fit, ...discovery.filter(m => canRunOnPc(m, pcClass, ramGb, hw))]);
      return {
        quality: allHits,
        balanced: sortModelsByCategoryThenSizeDesc(
          fit.filter(m => {
            const gb = modelSizeGb(m);
            return gb >= 2 && gb < 12;
          }),
        ),
        performance: sortModelsByCategoryThenSizeDesc(
          [...fit].sort((a, b) => modelSizeGb(a) - modelSizeGb(b)),
        ),
      };
    }

    return {
      quality: sortModelsByCategoryThenSizeDesc(fitLists.quality.filter(match)),
      balanced: sortModelsByCategoryThenSizeDesc(fitLists.balanced.filter(match)),
      performance: sortModelsByCategoryThenSizeDesc(fitLists.performance.filter(match)),
    };
  }, [fitLists, q, pcClass, ramGb, hw]);

  const catalogSearchHits = useMemo(() => {
    if (!q) return [] as LocalModel[];
    return sortModelsByCategoryThenSizeDesc(
      LOCAL_MODELS.filter(m => m.category !== 'image' && m.category !== 'video' && modelMatchesQuery(m, q)),
    );
  }, [q]);

  const onlineSearchHits = useMemo(() => {
    const fitsPc = (m: HuntedModel) =>
      !m.oversize && assessModelDownloadFit(m.sizeGb, hw).allowDownload;
    if (!q) return hunted.filter(fitsPc);
    const nq = normalizeModelSearch(q);
    const tokens = nq.split(' ').filter(Boolean);
    const matchHunt = (m: HuntedModel) => {
      const hay = normalizeModelSearch([m.id, m.name, m.repo, m.detail, m.category].join(' '));
      if (hay.includes(nq) || m.name.toLowerCase().includes(q) || m.repo.toLowerCase().includes(q)) return true;
      return tokens.length > 0 && tokens.every(t => hay.includes(t));
    };
    const fromPcList = hunted.filter(matchHunt);
    // Prefer query-specific hunt; merge unique repos. For your PC never lists blocked sizes.
    const merged: HuntedModel[] = [];
    const seen = new Set<string>();
    for (const row of [...queryHunted, ...fromPcList]) {
      if (!fitsPc(row)) continue;
      const key = row.repo.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(row);
    }
    return merged;
  }, [q, hunted, queryHunted, hw]);

  const localCategories = useMemo(() => {
    return LOCAL_CATEGORIES.map(cat => {
      const models = LOCAL_MODELS.filter(m => {
        if (m.category === 'image' || m.category === 'video') return false;
        if (m.category !== cat.id) return false;
        // Default list: only real Engine downloads. Search surfaces discovery-only.
        if (!q && !isEngineDownloadable(m.id)) return false;
        if (!q) return true;
        return modelMatchesQuery(m, q);
      });
      // Installed first, then not installed (size desc within each group).
      const on = models.filter(m => installed.has(m.id));
      const off = models.filter(m => !installed.has(m.id));
      return {
        ...cat,
        models: [
          ...sortModelsByCategoryThenSizeDesc(on),
          ...sortModelsByCategoryThenSizeDesc(off),
        ],
      };
    }).filter(cat => cat.models.length > 0);
  }, [q, installed]);

  const installedModels = useMemo(
    () => sortModelsByCategoryThenSizeDesc(
      LOCAL_MODELS.filter(m => installed.has(m.id) && m.category !== 'image' && m.category !== 'video'),
    ),
    [installed],
  );

  const connectedProviders = useMemo(
    () => CLOUD_PROVIDERS.filter(p => connected.has(p.id) && (showRetiredSources || p.availability !== 'retired')),
    [connected, showRetiredSources],
  );

  const filteredProviders = useMemo(() => {
    const pool = showRetiredSources
      ? CLOUD_PROVIDERS
      : CLOUD_PROVIDERS.filter(p => p.availability !== 'retired');
    if (!q) return pool;
    return pool.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tiers.some(t => t.includes(q)),
    );
  }, [q, showRetiredSources]);

  const cloudCategories = useMemo(() => {
    return CLOUD_MODEL_CATEGORIES.map(cat => ({
      ...cat,
      models: CLOUD_MODELS.filter(m => {
        if (m.category !== cat.id) return false;
        if (cloudModelAvailability(m) !== 'live') return false;
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
  }, [q, showRetiredSources]);

  const comingSoonCloudModels = useMemo(() => {
    return CLOUD_MODELS.filter(m => {
      if (m.category === 'image' || m.category === 'video') return false;
      if (cloudModelAvailability(m) !== 'coming_soon') return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q) ||
        m.tiers.some(t => t.includes(q))
      );
    });
  }, [q]);

  const retiredCloudModels = useMemo(() => {
    if (!showRetiredSources) return [];
    return CLOUD_MODELS.filter(m => {
      if (cloudModelAvailability(m) !== 'retired') return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q) ||
        m.tiers.some(t => t.includes(q))
      );
    });
  }, [q, showRetiredSources]);

  const executeInstall = (target: {
    id: string;
    name: string;
    hunt?: HuntedModel;
    category?: string;
  }) => {
    const { id, hunt } = target;

    const startDownload = async (opts: {
      downloadId: string;
      downloadName: string;
      needGb: number;
      category?: string;
      huntMeta?: HuntedModel;
    }) => {
      if (opts.category === 'coding' && !isWeakCoderId(opts.downloadId)) {
        const profile = await getBrainProfile(true);
        const gate = assertCoderAllowed(profile, opts.downloadId, opts.downloadName);
        if (!gate.ok) {
          setOllamaNote(`Blocked as coder on this PC: ${gate.reason}`);
          setLocalPrefs({
            defaultModelId: opts.downloadId,
            lastChatModelId: opts.downloadId,
            activeChatId: opts.downloadId,
          });
          return;
        }
        setLocalPrefs({ defaultCodeModelId: opts.downloadId, activeCoderId: opts.downloadId });
      } else if (opts.category === 'coding' && isWeakCoderId(opts.downloadId)) {
        setLocalPrefs({
          defaultModelId: opts.downloadId,
          lastChatModelId: opts.downloadId,
          activeChatId: opts.downloadId,
        });
        setOllamaNote(`${opts.downloadName} will be chat-only — too small for the coder role.`);
      } else if (opts.category === 'design') {
        setLocalPrefs({ activeDesignId: opts.downloadId });
        setOllamaNote(`${opts.downloadName} will be the Design brain for create Layout Contracts.`);
      } else {
        setLocalPrefs({
          defaultModelId: opts.downloadId,
          lastChatModelId: opts.downloadId,
          activeChatId: opts.downloadId,
        });
      }

      const disk = await engineDiskSpace();
      if (disk?.freeGb != null && opts.needGb > 0 && disk.freeGb < opts.needGb) {
        setOllamaNote(
          `⚠️ Not enough space. ${opts.downloadName} needs ~${opts.needGb.toFixed(1)} GB but only ${disk.freeGb.toFixed(1)} GB is free. Free up space or change the models folder in Settings → Storage.`,
        );
        return;
      }
      setOllamaNote(`Downloading ${opts.downloadName}…`);
      void startEngineDownload({
        id: opts.downloadId,
        name: opts.downloadName,
        source: 'models',
        sizeGb: opts.needGb > 0 ? opts.needGb / 1.15 : undefined,
        hunt: opts.huntMeta
          ? {
              url: opts.huntMeta.url,
              sizeGb: opts.huntMeta.sizeGb,
              detail: opts.huntMeta.detail,
              category: opts.huntMeta.category,
            }
          : undefined,
      });
    };

    if (hunt) {
      if (installed.has(id) || isEngineDownloading(id)) return;
      void startDownload({
        downloadId: hunt.id,
        downloadName: hunt.name,
        needGb: hunt.sizeGb * 1.15,
        category: hunt.category,
        huntMeta: hunt,
      });
      return;
    }
    if (!isEngineDownloadable(id)) {
      setOllamaNote('Not downloadable in NOVA Engine yet. search shows discovery only.');
      return;
    }
    if (installed.has(id) || isEngineDownloading(id)) return;
    const model = LOCAL_MODELS.find(m => m.id === id);
    void startDownload({
      downloadId: id,
      downloadName: model?.name || id,
      needGb: modelSizeGb(model || { size: '0' }) * 1.15,
      category: model?.category,
    });
  };

  const buildDownloadConfirm = (opts: {
    id: string;
    name: string;
    sizeGb: number;
    sizeLabel?: string;
    category?: string;
    detail?: string;
    hunt?: HuntedModel;
  }) => {
    const fit = assessModelDownloadFit(opts.sizeGb, hw);
    const candidates = [
      ...LOCAL_MODELS
        .filter(m => isEngineDownloadable(m.id) && m.category !== 'image' && m.category !== 'video')
        .map(m => ({
          id: m.id,
          name: m.name,
          sizeGb: modelSizeGb(m),
          category: m.category,
          preferred: Boolean(m.recommended),
        })),
      ...hunted.map(m => ({
        id: m.id,
        name: m.name,
        sizeGb: m.sizeGb,
        category: m.category,
        preferred: false,
      })),
      ...queryHunted.map(m => ({
        id: m.id,
        name: m.name,
        sizeGb: m.sizeGb,
        category: m.category,
        preferred: false,
      })),
    ];
    const recommended = findSimilarRecommendedModel(
      {
        id: opts.id,
        name: opts.name,
        sizeGb: opts.sizeGb,
        category: opts.category,
      },
      candidates,
      hw,
    );
    return {
      id: opts.id,
      name: opts.name,
      sizeLabel: opts.sizeLabel || `${opts.sizeGb.toFixed(1)} GB`,
      sizeGb: opts.sizeGb,
      category: opts.category,
      detail: opts.detail,
      hunt: opts.hunt,
      fit,
      recommended,
    };
  };

  const requestInstall = (id: string, hunt?: HuntedModel) => {
    if (installed.has(id) || isEngineDownloading(id)) return;
    if (hunt) {
      setDownloadConfirm(buildDownloadConfirm({
        id: hunt.id,
        name: hunt.name,
        sizeGb: hunt.sizeGb,
        sizeLabel: `${hunt.sizeGb.toFixed(1)} GB`,
        category: hunt.category,
        detail: hunt.detail,
        hunt,
      }));
      return;
    }
    if (!isEngineDownloadable(id)) {
      setOllamaNote('Not downloadable in NOVA Engine yet. Search shows discovery only.');
      return;
    }
    const model = LOCAL_MODELS.find(m => m.id === id);
    const sizeGb = modelSizeGb(model || { size: '0' });
    setDownloadConfirm(buildDownloadConfirm({
      id,
      name: model?.name || id,
      sizeGb,
      sizeLabel: model?.size,
      category: model?.category,
      detail: model?.description,
    }));
  };

  const toggleInstall = (id: string, hunt?: HuntedModel) => {
    requestInstall(id, hunt);
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
    <div className="h-full min-w-0 flex flex-col overflow-hidden animate-fade-in bg-transparent">
      {!hideChrome && (
        <div className="shrink-0 px-4 sm:px-6 pt-[min(12vh,6rem)] bg-transparent">
          <div className="w-full max-w-4xl mx-auto min-w-0">
            <div className="flex items-center justify-between gap-3 mb-5 min-w-0">
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl font-semibold text-content-primary tracking-tight">Models</h1>
              </div>
            </div>

            {liveCapacity && !liveCapacity.liveChat && (
              <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90 leading-relaxed">
                <span className="font-medium text-amber-200">No live brain yet</span>
                {'. '}
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

            <div className="flex items-center justify-between gap-3 mb-4 min-w-0">
              <div className="flex items-center gap-1 flex-wrap min-w-0">
                {([
                  { id: 'for-pc' as const, label: 'For your PC', icon: Monitor },
                  { id: 'local' as const, label: 'Local AI', icon: Cpu },
                  { id: 'cloud' as const, label: 'Cloud AI', icon: Cloud },
                  { id: 'build-team' as const, label: 'Build team', icon: Boxes },
                ]).map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setTab(t.id);
                      navigate({ name: 'models', tab: t.id });
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
              {tab !== 'build-team' ? (
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
              ) : null}
            </div>
          </div>
        </div>
      )}

      {hideChrome && (
        <div className="shrink-0 px-4 sm:px-6 pb-2">
          <div className="w-full max-w-4xl mx-auto min-w-0">
            <div className="flex items-center gap-2 rounded-full bg-surface-hover px-3 py-2 w-full sm:w-72 md:w-80 min-w-0">
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
        </div>
      )}

      <div className={`flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden px-4 sm:px-6 pb-10 ${hideChrome ? '' : ''}`}>
        <div className="w-full max-w-4xl mx-auto min-w-0">
          {tab === 'for-pc' ? (
            <>
              <div className="flex items-center justify-end gap-3 mb-8">
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

              {(onlineSearchHits.length > 0 || queryHuntBusy || (q && huntNote)) && (
                <section className="mb-10">
                  <div className="flex items-center gap-2 mb-4">
                    <Globe className="w-4 h-4 text-content-secondary" />
                    <h2 className="text-base font-semibold text-content-primary">
                      {q ? 'Found online' : 'Found online for this PC'}
                    </h2>
                    {queryHuntBusy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-content-tertiary" />
                    ) : null}
                  </div>
                  {onlineSearchHits.length === 0 && queryHuntBusy ? (
                    <p className="text-sm text-content-tertiary">Searching Hugging Face and ModelScope…</p>
                  ) : onlineSearchHits.length === 0 && q ? (
                    <p className="text-sm text-content-tertiary">No online GGUF matches yet. Catalog matches appear below when available.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                      {onlineSearchHits.map(model => {
                        const isOn = installed.has(model.id);
                        const isBusy = installing.has(model.id);
                        return (
                          <div
                            key={model.id}
                            className="flex items-center gap-3 py-3 rounded-xl px-1 hover:bg-surface-hover/50 transition-colors"
                          >
                            <BrandMark
                              id={model.id}
                              name={model.name}
                              initial={huntSourceBadge(model.source)}
                              tone={model.source === 'modelscope' ? 'from-sky-500 to-indigo-700' : 'from-emerald-400 to-sky-700'}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2 min-w-0 flex-wrap">
                                <span className="text-sm font-medium text-content-primary truncate">{model.name}</span>
                                <span className="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-300 px-2 py-0.5 text-[10px] font-medium leading-none">
                                  Online
                                </span>
                                {model.oversize ? (
                                  <span className="inline-flex items-center rounded-full bg-amber-500/15 text-amber-300 px-2 py-0.5 text-[10px] font-medium leading-none">
                                    Large for this PC
                                  </span>
                                ) : null}
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
                  )}
                </section>
              )}

              <div className="space-y-10">
                {q ? (
                  <section>
                    <div className="flex items-center gap-2 mb-4">
                      <Sparkles className="w-4 h-4 text-content-secondary" />
                      <h2 className="text-base font-semibold text-content-primary">Matching catalog</h2>
                    </div>
                    {catalogSearchHits.length === 0 ? (
                      <p className="text-sm text-content-tertiary">No catalog matches for this search.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                        {catalogSearchHits.map(model => {
                          const isOn = installed.has(model.id);
                          const isBusy = installing.has(model.id);
                          return (
                            <div
                              key={`search-${model.id}`}
                              className="flex items-center gap-3 py-3 rounded-xl px-1 hover:bg-surface-hover/50 transition-colors"
                            >
                              <BrandMark id={model.id} name={model.name} initial={model.initial} tone={model.tone} />
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2 min-w-0 flex-wrap">
                                  <span className="text-sm font-medium text-content-primary truncate">{model.name}</span>
                                  <TierBadges tiers={model.tiers} />
                                  {model.recommended ? (
                                    <span className="inline-flex items-center rounded-full bg-sky-500/15 text-sky-300 px-2 py-0.5 text-[10px] font-medium leading-none">
                                      Recommended
                                    </span>
                                  ) : null}
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
                ) : (
                  FIT_SECTIONS.map(section => {
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
                                  <BrandMark id={model.id} name={model.name} initial={model.initial} tone={model.tone} />
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
                  })
                )}

                {q
                  && catalogSearchHits.length === 0
                  && onlineSearchHits.length === 0
                  && !queryHuntBusy
                  && <EmptySearch />}
              </div>
            </>
          ) : tab === 'local' ? (
            <>
              {!q && (
                <section className="mb-10">
                  <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                    <h2 className="text-base font-semibold text-content-primary">Installed</h2>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={externalBusy}
                        onClick={() => {
                          void (async () => {
                            setExternalBusy(true);
                            setExternalNote('Scanning LM Studio, Hugging Face cache, Desktop, Downloads…');
                            try {
                              const r = await scanExternalGgufs();
                              setExternalHits(r.models || []);
                              setExternalNote(
                                r.count
                                  ? `Found ${r.count} GGUF(s) outside NOVA. Import to use them in chat/create.`
                                  : (r.note || 'No external GGUFs found on common folders.'),
                              );
                            } catch (e) {
                              setExternalNote(e instanceof Error ? e.message : 'Scan failed');
                            } finally {
                              setExternalBusy(false);
                            }
                          })();
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-surface-hover/40 hover:bg-surface-hover px-3 py-1.5 text-xs text-content-secondary hover:text-content-primary transition-colors disabled:opacity-50"
                        title="Find GGUFs from LM Studio, Hugging Face, Downloads, etc."
                      >
                        {externalBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                        Scan this PC
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void importGgufPick()
                            .then((r) => {
                              if (r?.canceled) return;
                              setOllamaNote(r?.ok ? `Imported ${r.count || 1} GGUF(s) into NOVA Engine.` : 'Import canceled');
                              window.dispatchEvent(new Event('NOVA:engine-models-changed'));
                            })
                            .catch((e) => setOllamaNote(e instanceof Error ? e.message : 'Import failed'));
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-surface-hover/40 hover:bg-surface-hover px-3 py-1.5 text-xs text-content-secondary hover:text-content-primary transition-colors"
                        title="Pick a .gguf file to add to NOVA Engine"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Import GGUF
                      </button>
                    </div>
                  </div>
                  {installedModels.length === 0 ? (
                    <p className="text-sm text-content-tertiary">No local models installed yet.</p>
                  ) : (
                    <div className="flex flex-col">
                      {installedModels.map(model => (
                        <div
                          key={model.id}
                          className="w-full flex items-center gap-3 py-3 px-1 rounded-xl hover:bg-surface-hover/50 transition-colors min-w-0"
                        >
                          <BrandMark id={model.id} name={model.name} initial={model.initial} tone={model.tone} />
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
                  {(externalNote || externalHits.length > 0) && (
                    <div className="mt-6 rounded-xl border border-surface-border/80 bg-surface-hover/20 px-3.5 py-3">
                      <p className="text-xs text-content-secondary leading-relaxed mb-2">{externalNote}</p>
                      {externalHits.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {externalHits.slice(0, 12).map((hit) => (
                            <div
                              key={hit.path}
                              className="flex items-center gap-3 py-2 min-w-0"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm text-content-primary truncate">{hit.fileName}</span>
                                <span className="block text-[11px] text-content-tertiary truncate">
                                  {hit.source} · {hit.sizeGb.toFixed(1)} GB
                                  {hit.catalogId ? ` · maps to ${hit.catalogId}` : ''}
                                  {hit.mmproj ? ' · projector' : ''}
                                </span>
                              </span>
                              <button
                                type="button"
                                className="nova-btn-secondary text-xs px-2.5 py-1.5 shrink-0"
                                onClick={() => {
                                  void importGgufPath(hit.path)
                                    .then((r) => {
                                      setOllamaNote(
                                        r?.importedId
                                          ? `Imported as ${r.importedId}${r.importMode ? ` (${r.importMode})` : ''}`
                                          : 'Imported into NOVA Engine',
                                      );
                                      setExternalHits((prev) => prev.filter((x) => x.path !== hit.path));
                                      window.dispatchEvent(new Event('NOVA:engine-models-changed'));
                                    })
                                    .catch((e) => setOllamaNote(e instanceof Error ? e.message : 'Import failed'));
                                }}
                              >
                                Add to NOVA
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
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
                            <BrandMark id={model.id} name={model.name} initial={model.initial} tone={model.tone} />
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
          ) : tab === 'cloud' ? (
            <>
              {!q && (
                <section className="mb-10">
                  <h2 className="text-base font-semibold text-content-primary mb-4">Connected</h2>
                  {connectedProviders.length === 0 ? (
                    <p className="text-sm text-content-tertiary">No providers connected.</p>
                  ) : (
                    <div className="flex flex-col">
                      {connectedProviders.map(provider => (
                        <button
                          key={provider.id}
                          type="button"
                          onClick={() => toggleConnected(provider.id)}
                          className="w-full flex items-center gap-3 py-3 px-1 rounded-xl text-left hover:bg-surface-hover/50 transition-colors"
                        >
                          <BrandMark id={provider.id} name={provider.name} initial={provider.initial} tone={provider.tone} />
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
                          </span>
                          <StatusCheck label={`${provider.name} connected`} />
                        </button>
                      ))}
                    </div>
                  )}
                  {ollamaOn && ollamaModels.length > 0 && (
                    <div className="mt-4 rounded-2xl border border-surface-border bg-nova-navy-900/40 px-4 py-3">
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
                  {FREE_SOURCES.filter(src => src.wired && (!q || src.name.toLowerCase().includes(q))).map(src => (
                    <div
                      key={src.id}
                      className="flex items-center gap-3 py-3 rounded-xl px-1 hover:bg-surface-hover/50 transition-colors"
                    >
                      <BrandMark id={src.id} name={src.name} initial={src.initial} tone={src.tone} />
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
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mb-10">
                <h2 className="text-base font-semibold text-content-primary mb-4">Providers</h2>
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
                          <BrandMark id={provider.id} name={provider.name} initial={provider.initial} tone={provider.tone} />
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
                                  ? 'bg-surface-hover text-nova-accent-green'
                                  : 'text-content-secondary hover:text-content-primary hover:bg-surface-hover'
                            }`}
                            title={
                              provider.availability !== 'live' && provider.id !== 'ollama'
                                ? 'Coming soon'
                                : isOn
                                  ? 'On'
                                  : keyedProviders.has(provider.id)
                                    ? 'Turn on'
                                    : providerNeedsKey(provider.id)
                                      ? 'Add API key'
                                      : 'Turn on'
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
                <button
                  type="button"
                  className="text-[11px] text-content-tertiary hover:text-content-secondary"
                  onClick={() => setShowRetiredSources(v => !v)}
                >
                  {showRetiredSources ? 'Hide retired' : 'Show retired (GitHub Models)'}
                </button>
                {showRetiredSources && retiredCloudModels.length > 0 && (
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                    {retiredCloudModels.map(model => (
                      <div key={model.id} className="flex items-center gap-3 py-3 rounded-xl px-1 opacity-75">
                        <BrandMark id={model.id} name={model.name} initial={model.initial} tone={model.tone} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 min-w-0 flex-wrap">
                            <span className="text-sm font-medium text-content-primary truncate">{model.name}</span>
                            <span className="inline-flex items-center rounded-full bg-zinc-500/20 text-content-tertiary px-2 py-0.5 text-[10px] font-medium leading-none">
                              Retired
                            </span>
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <div className="space-y-10">
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
                            <BrandMark id={model.id} name={model.name} initial={model.initial} tone={model.tone} />
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
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleCloudModel(model.id)}
                              disabled={avail !== 'live'}
                              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                                avail !== 'live'
                                  ? 'text-content-tertiary cursor-not-allowed'
                                  : isOn
                                    ? 'bg-surface-hover text-nova-accent-green'
                                    : 'text-content-secondary hover:text-content-primary hover:bg-surface-hover'
                              }`}
                              title={avail !== 'live' ? 'Coming soon' : isOn ? 'On' : 'Enable'}
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

                {cloudCategories.length === 0 && comingSoonCloudModels.length === 0 && filteredProviders.length > 0 && q && (
                  <p className="text-sm text-content-tertiary">No matching cloud models.</p>
                )}

                {!q && comingSoonCloudModels.length > 0 && (
                  <section className="mt-10 pt-8 border-t border-surface-border">
                    <h2 className="text-base font-semibold text-content-primary mb-4">Coming soon</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                      {comingSoonCloudModels.map(model => (
                        <div
                          key={`soon-${model.id}`}
                          className="flex items-center gap-3 py-3 rounded-xl px-1 opacity-80"
                        >
                          <BrandMark id={model.id} name={model.name} initial={model.initial} tone={model.tone} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 min-w-0 flex-wrap">
                              <span className="text-sm font-medium text-content-primary truncate">{model.name}</span>
                              <TierBadges tiers={model.tiers} />
                              <span className="inline-flex items-center rounded-full bg-amber-500/15 text-amber-400/90 px-2 py-0.5 text-[10px] font-medium leading-none">
                                Soon
                              </span>
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </>
          ) : (
            <BuildTeamPanel
              installed={installed}
              installing={installing}
              installProgress={installProgress}
              onInstall={(id) => toggleInstall(id)}
              onInstallTeam={(ids) => {
                const unique = [...new Set(ids)].filter(
                  (id) => isEngineDownloadable(id) && !installed.has(id) && !isEngineDownloading(id),
                );
                if (unique.length === 0) {
                  setOllamaNote('Recommended team models are already installed or downloading.');
                  return;
                }
                const names = unique.map((id) => LOCAL_MODELS.find((m) => m.id === id)?.name || id);
                setOllamaNote(
                  unique.length === 1
                    ? `Downloading ${names[0]}…`
                    : `Downloading ${unique.length} team models: ${names.join(', ')}…`,
                );
                for (const id of unique) {
                  const model = LOCAL_MODELS.find((m) => m.id === id);
                  executeInstall({
                    id,
                    name: model?.name || id,
                    category: model?.category,
                  });
                }
              }}
              onCancel={(id) => cancelInstall(id)}
              onDelete={(id, name) => removeInstall(id, name)}
            />
          )}
        </div>
      </div>

      {downloadConfirm && (
        <ModelDownloadConfirm
          name={downloadConfirm.name}
          sizeLabel={downloadConfirm.sizeLabel}
          category={downloadConfirm.category}
          detail={downloadConfirm.detail}
          fit={downloadConfirm.fit}
          recommended={downloadConfirm.recommended}
          onCancel={() => setDownloadConfirm(null)}
          onConfirm={() => {
            const pending = downloadConfirm;
            setDownloadConfirm(null);
            executeInstall(pending);
          }}
          onConfirmRecommended={
            downloadConfirm.recommended
              ? () => {
                  const alt = downloadConfirm.recommended!;
                  const huntAlt =
                    hunted.find(h => h.id === alt.id)
                    || queryHunted.find(h => h.id === alt.id);
                  setDownloadConfirm(null);
                  executeInstall({
                    id: alt.id,
                    name: alt.name,
                    category: alt.category,
                    hunt: huntAlt,
                  });
                }
              : undefined
          }
        />
      )}

      {connectTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-nova-navy-950/70 backdrop-blur-md"
          onClick={() => setConnectTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-surface-border bg-nova-navy-900 p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <h2 className="text-lg font-semibold text-content-primary">Connect {connectTarget.name}</h2>
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
              className="nova-input"
              autoFocus
            />
            {providerKeyUrl(connectTarget.id) ? (
              <button
                type="button"
                onClick={() => void openInSystemBrowser(providerKeyUrl(connectTarget.id)!)}
                className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-surface-border px-3 py-2.5 text-sm text-sky-400 hover:text-sky-300 hover:bg-surface-hover/50 transition-colors"
              >
                <ExternalLink className="w-4 h-4 shrink-0" />
                Get API key
              </button>
            ) : null}
            <div className="flex gap-2 mt-5">
              <button type="button" onClick={() => setConnectTarget(null)} className="nova-btn-secondary flex-1">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveConnect()}
                disabled={!apiKeyDraft.trim() || connectBusy}
                className="nova-btn-primary flex-1 disabled:opacity-40"
              >
                {connectBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                {connectBusy ? 'Saving…' : 'Save & connect'}
              </button>
            </div>
            {connectError && (
              <p className="mt-3 text-xs text-rose-400" role="alert">
                {connectError}
              </p>
            )}
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
