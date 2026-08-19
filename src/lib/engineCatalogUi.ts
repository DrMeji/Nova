/** UI catalog for Local AI — ids/sizes must match electron/arkCatalog.cjs (enforced by smoke-catalog-ssot). */

import { sortModelsByCategoryThenSizeDesc } from '@/lib/modelSort';

export type EngineUiCategory = 'general' | 'coding' | 'reasoning' | 'fast' | 'image';

export type EngineUiModel = {
  id: string;
  name: string;
  category: EngineUiCategory;
  sizeGb: number;
  tone: string;
  initial: string;
};

export const ENGINE_UI_CATALOG: EngineUiModel[] = sortModelsByCategoryThenSizeDesc([
  { id: 'qwen25-15b', name: 'Qwen2.5 1.5B Instruct', category: 'general', sizeGb: 1.0, tone: 'from-emerald-400 to-green-700', initial: 'Q1' },
  { id: 'sd15-local', name: 'Stable Diffusion 1.5 (Local)', category: 'image', sizeGb: 4.0, tone: 'from-yellow-500 to-amber-700', initial: 'SD' },
  { id: 'sdxl-turbo-local', name: 'SDXL Turbo (Local)', category: 'image', sizeGb: 6.9, tone: 'from-fuchsia-500 to-pink-700', initial: 'ST' },
  { id: 'flux-schnell-local', name: 'FLUX.1 Schnell (Local)', category: 'image', sizeGb: 13, tone: 'from-violet-500 to-purple-800', initial: 'Fx' },
  { id: 'llama32-3b', name: 'Llama 3.2 3B Instruct', category: 'general', sizeGb: 2.0, tone: 'from-violet-500 to-indigo-700', initial: 'L3' },
  { id: 'qwen25-coder-7b', name: 'Qwen2.5-Coder 7B', category: 'coding', sizeGb: 4.7, tone: 'from-cyan-500 to-teal-700', initial: 'Q7' },
  { id: 'qwen25-coder-14b', name: 'Qwen2.5-Coder 14B', category: 'coding', sizeGb: 9.0, tone: 'from-blue-500 to-indigo-700', initial: '14' },
  { id: 'qwen25-coder-32b', name: 'Qwen2.5-Coder 32B', category: 'coding', sizeGb: 20, tone: 'from-indigo-500 to-violet-800', initial: '32' },
  { id: 'deepseek-coder-v2-lite', name: 'DeepSeek Coder V2 Lite', category: 'coding', sizeGb: 8.9, tone: 'from-cyan-500 to-teal-700', initial: 'DS' },
  { id: 'starcoder2-7b', name: 'StarCoder2 7B', category: 'coding', sizeGb: 4.3, tone: 'from-amber-500 to-orange-700', initial: 'Sc' },
  { id: 'qwen25-7b', name: 'Qwen2.5 7B Instruct', category: 'general', sizeGb: 4.7, tone: 'from-sky-400 to-blue-700', initial: 'Q7' },
  { id: 'llama31-8b', name: 'Llama 3.1 8B Instruct', category: 'general', sizeGb: 4.9, tone: 'from-indigo-500 to-blue-800', initial: 'L8' },
  { id: 'mistral-7b', name: 'Mistral 7B Instruct', category: 'general', sizeGb: 4.1, tone: 'from-orange-400 to-amber-700', initial: 'Mi' },
  { id: 'gemma2-2b', name: 'Gemma 2 2B Instruct', category: 'fast', sizeGb: 1.6, tone: 'from-teal-400 to-cyan-700', initial: 'G2' },
  { id: 'phi3-mini', name: 'Phi-3 Mini Instruct', category: 'fast', sizeGb: 2.3, tone: 'from-cyan-400 to-sky-700', initial: 'Φ3' },
  { id: 'deepseek-r1-distill-8b', name: 'DeepSeek-R1 Distill 8B', category: 'reasoning', sizeGb: 5.2, tone: 'from-fuchsia-500 to-purple-800', initial: 'R1' },
]);
