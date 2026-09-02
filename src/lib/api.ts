import { supabase } from '@/lib/supabase';

export interface HardwareInfo {
  os: string;
  cpu: string;
  ram: string;
  gpu: string;
  vram: string;
  storage: string;
  acceleration: string;
  motherboard?: string;
  /** Parsed installed RAM for tiering (avoids "32 GB (12 GB free)" parse bugs). */
  ramGb?: number;
  /** True when values came from Electron OS probe (not browser guess). */
  accurate?: boolean;
  scannedAt?: string;
}

/** Models ARK Engine can actually download today (keep in sync with electron/arkEngine.cjs). */
export const ENGINE_DOWNLOADABLE_IDS = [
  'qwen25-15b',
  'llama32-3b',
  'qwen25-coder-7b',
  'qwen25-coder-14b',
  'qwen25-coder-32b',
  'deepseek-coder-v2-lite',
  'starcoder2-7b',
  'qwen25-7b',
  'llama31-8b',
  'mistral-7b',
  'gemma2-2b',
  'phi3-mini',
  'deepseek-r1-distill-8b',
  'sd15-local',
  'sdxl-turbo-local',
  'flux-schnell-local',
  'qwen2-vl-7b',
] as const;

export function isEngineDownloadable(id: string) {
  return (ENGINE_DOWNLOADABLE_IDS as readonly string[]).includes(id) || id.startsWith('hunt-');
}

export function detectHardware(): HardwareInfo {
  const nav = navigator as Navigator & { deviceMemory?: number; userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform ?? navigator.platform ?? 'Unknown';
  const cores = navigator.hardwareConcurrency ?? 4;
  const memoryGb = nav.deviceMemory;
  const memory = memoryGb ? `${memoryGb} GB (browser estimate)` : 'Unknown (scanning…)';

  let os = 'Unknown OS';
  if (platform.toLowerCase().includes('win')) os = 'Windows';
  else if (platform.toLowerCase().includes('mac')) os = 'macOS';
  else if (platform.toLowerCase().includes('linux')) os = 'Linux';

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
  let gpu = 'Scanning GPU…';
  let vram = 'Unknown';
  let gpuRaw = '';
  if (gl) {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string;
      if (renderer) {
        gpuRaw = renderer;
        if (renderer.toLowerCase().includes('nvidia')) gpu = 'NVIDIA GPU (preview)';
        else if (renderer.toLowerCase().includes('amd') || renderer.toLowerCase().includes('radeon')) gpu = 'AMD GPU (preview)';
        else if (renderer.toLowerCase().includes('apple') || renderer.toLowerCase().includes('m1') || renderer.toLowerCase().includes('m2') || renderer.toLowerCase().includes('m3')) gpu = 'Apple Silicon GPU (preview)';
        else if (renderer.toLowerCase().includes('intel')) gpu = 'Intel Graphics (preview)';
        else gpu = renderer.length < 48 ? `${renderer} (preview)` : 'GPU (preview)';
      }
    }
  }

  let acceleration = 'CPU';
  const gpuCheck = `${gpu} ${gpuRaw}`.toLowerCase();
  if (gpuCheck.includes('nvidia') || gpuCheck.includes('rtx') || gpuCheck.includes('gtx')) {
    acceleration = 'CUDA';
    vram = 'Dedicated';
  } else if (gpuCheck.includes('apple') || gpuCheck.includes('m1') || gpuCheck.includes('m2') || gpuCheck.includes('m3')) {
    acceleration = 'Metal';
    vram = 'Unified Memory';
  } else if (gpuCheck.includes('amd') || gpuCheck.includes('radeon')) {
    acceleration = 'Vulkan';
    vram = 'Dedicated';
  }

  return {
    os,
    cpu: `${cores} threads (browser estimate)`,
    ram: memory,
    gpu,
    vram,
    storage: 'See Local AI after desktop probe',
    acceleration,
    ramGb: memoryGb,
    accurate: false,
  };
}

/** Prefer Electron OS probe when available (real RAM/CPU/GPU/board). */
export async function detectHardwareAsync(): Promise<HardwareInfo> {
  const base = detectHardware();
  try {
    const info = await window.arkDesktop?.systemInfo?.();
    if (!info?.ok) return base;

    const corePart = info.cpuPhysicalCores && info.cpuCores
      ? `${info.cpuPhysicalCores} cores / ${info.cpuCores} threads`
      : info.cpuCores
        ? `${info.cpuCores} threads`
        : '';

    let vram = base.vram;
    if (info.vramGb != null && info.vramGb > 0) {
      vram = `${info.vramGb} GB dedicated`;
    } else if (info.acceleration === 'CUDA' || info.acceleration === 'Vulkan') {
      vram = 'Dedicated';
    } else if (info.acceleration === 'Metal') {
      vram = 'Unified Memory';
    } else if (info.acceleration === 'CPU+iGPU') {
      vram = 'Shared (iGPU)';
    }

    const hw: HardwareInfo = {
      os: info.os || base.os,
      cpu: info.cpu
        ? `${info.cpu}${corePart ? ` · ${corePart}` : ''}`
        : base.cpu,
      ram: info.ramGb
        ? `${info.ramGb} GB${info.ramFreeGb != null ? ` (${info.ramFreeGb} GB free)` : ''}`
        : base.ram,
      gpu: info.gpu || base.gpu,
      vram,
      storage: info.hostname ? `Host · ${info.hostname}` : base.storage,
      acceleration: info.acceleration || base.acceleration,
      motherboard: info.motherboard || undefined,
      ramGb: typeof info.ramGb === 'number' ? info.ramGb : base.ramGb,
      accurate: true,
      scannedAt: new Date().toISOString(),
    };
    saveHardwareSnapshot(hw);
    return hw;
  } catch {
    return base;
  }
}

const HW_SNAPSHOT_KEY = 'ark:hardware-snapshot';

export function saveHardwareSnapshot(hw: HardwareInfo) {
  try {
    localStorage.setItem(HW_SNAPSHOT_KEY, JSON.stringify(hw));
  } catch {
    /* ignore */
  }
}

export function loadHardwareSnapshot(): HardwareInfo | null {
  try {
    const raw = localStorage.getItem(HW_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HardwareInfo;
    if (!parsed?.os || !parsed?.cpu) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Cached accurate probe, or refresh from Electron. */
export async function getAccurateHardware(force = false): Promise<HardwareInfo> {
  if (!force) {
    const cached = loadHardwareSnapshot();
    if (cached?.accurate) return cached;
  }
  return detectHardwareAsync();
}

export function parseRamGb(hw: HardwareInfo): number {
  if (typeof hw.ramGb === 'number' && hw.ramGb > 0) return hw.ramGb;
  const m = String(hw.ram || '').match(/(\d+(?:\.\d+)?)\s*GB/i);
  if (m) return parseFloat(m[1]);
  const n = parseFloat(hw.ram);
  return Number.isFinite(n) ? n : 8;
}

export type HardwareClass = 'light' | 'standard' | 'strong';

export function getHardwareClass(hw: HardwareInfo): HardwareClass {
  const ramGb = parseRamGb(hw);
  // Only dedicated GPU accel counts. Intel iGPU (CPU+iGPU) is not "strong".
  const hasDedicatedAccel =
    hw.acceleration === 'CUDA'
    || hw.acceleration === 'Vulkan'
    || hw.acceleration === 'Metal';
  if (hasDedicatedAccel && ramGb >= 16) return 'strong';
  if (hasDedicatedAccel || ramGb >= 16) return 'standard';
  return 'light';
}

export function getRecommendedModel(hw: HardwareInfo): { name: string; size: string; id: string } {
  const tier = getHardwareClass(hw);
  const ramGb = parseRamGb(hw);
  if (tier === 'strong' && ramGb >= 28) {
    return { name: 'Qwen2.5-Coder 14B Instruct', size: '9.0 GB', id: 'qwen25-coder-14b' };
  }
  if (tier === 'strong') {
    return { name: 'Qwen2.5-Coder 7B Instruct', size: '4.7 GB', id: 'qwen25-coder-7b' };
  }
  if (tier === 'standard') {
    return { name: 'Llama 3.2 3B Instruct', size: '2.0 GB', id: 'llama32-3b' };
  }
  return { name: 'Qwen2.5 1.5B Instruct', size: '1.0 GB', id: 'qwen25-15b' };
}

/** Default chat brain for Auto / onboarding. instruct, not the tiny 1.5B, when RAM allows. */
export function getRecommendedChatModel(hw: HardwareInfo): { name: string; size: string; id: string } {
  const ramGb = parseRamGb(hw);
  if (ramGb >= 16) {
    return { name: 'Qwen2.5 7B Instruct', size: '4.7 GB', id: 'qwen25-7b' };
  }
  if (ramGb >= 8) {
    return { name: 'Llama 3.2 3B Instruct', size: '2.0 GB', id: 'llama32-3b' };
  }
  return { name: 'Qwen2.5 1.5B Instruct', size: '1.0 GB', id: 'qwen25-15b' };
}

/** Optional second download during setup when RAM can hold a coder. */
export function getRecommendedCoderModel(hw: HardwareInfo): { name: string; size: string; id: string } | null {
  const ramGb = parseRamGb(hw);
  if (ramGb >= 16) {
    return { name: 'Qwen2.5-Coder 7B Instruct', size: '4.7 GB', id: 'qwen25-coder-7b' };
  }
  if (ramGb >= 10) {
    return { name: 'Qwen2.5-Coder 7B Instruct', size: '4.7 GB', id: 'qwen25-coder-7b' };
  }
  return null;
}

/** Free-key providers that work well as first hops for this PC (always useful; heavier local needs RAM). */
export function suggestedKeysForHardware(hw: HardwareInfo): { id: string; name: string; why: string }[] {
  const tier = getHardwareClass(hw);
  const base = [
    { id: 'groq', name: 'Groq', why: 'Fast free chat. best first key on any PC' },
    { id: 'google', name: 'Google AI Studio', why: 'Gemini free tier. solid coding backup' },
    { id: 'openrouter', name: 'OpenRouter', why: 'Many free routes when others rate-limit' },
  ];
  if (tier === 'light') {
    return [
      ...base,
      { id: 'cerebras', name: 'Cerebras', why: 'Ultra-fast cloud when local models stay small' },
    ];
  }
  return [
    ...base,
    { id: 'huggingface', name: 'Hugging Face', why: 'Free chat + FLUX images' },
    { id: 'together', name: 'Together AI', why: 'Open models when you outgrow free tiers' },
  ];
}

export async function fetchProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createProject(name: string, description: string, type: string, prompt?: string) {
  const { data, error } = await supabase
    .from('projects')
    .insert({ name, description, project_type: type, last_prompt: prompt ?? null })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteProject(id: string) {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}

export async function updateProject(id: string, updates: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('projects')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchModelCatalog() {
  const { data, error } = await supabase
    .from('model_catalog')
    .select('*')
    .order('is_recommended', { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchProviderConnections() {
  const { data, error } = await supabase
    .from('provider_connections')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function connectProvider(providerId: string, providerName: string) {
  const { data, error } = await supabase
    .from('provider_connections')
    .upsert({
      provider_id: providerId,
      provider_name: providerName,
      status: 'connected',
      connected_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider_id' })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function disconnectProvider(providerId: string) {
  const { error } = await supabase
    .from('provider_connections')
    .delete()
    .eq('provider_id', providerId);
  if (error) throw error;
}

export async function completeOnboarding() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('profiles').update({ onboarding_completed: true }).eq('id', user.id);
}

export async function fetchChatMessages(projectId: string | null) {
  let query = supabase.from('chat_messages').select('*').order('created_at', { ascending: true });
  if (projectId) {
    query = query.eq('project_id', projectId);
  } else {
    query = query.is('project_id', null);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function saveChatMessage(projectId: string | null, role: string, content: string, providerUsed?: string) {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      project_id: projectId,
      role,
      content,
      provider_used: providerUsed ?? null,
    })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}
