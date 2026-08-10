import { supabase } from '@/lib/supabase';

export interface HardwareInfo {
  os: string;
  cpu: string;
  ram: string;
  gpu: string;
  vram: string;
  storage: string;
  acceleration: string;
}

export function detectHardware(): HardwareInfo {
  const nav = navigator as Navigator & { deviceMemory?: number; userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform ?? navigator.platform ?? 'Unknown';
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ? `${nav.deviceMemory} GB` : '16 GB';

  let os = 'Unknown OS';
  if (platform.toLowerCase().includes('win')) os = 'Windows';
  else if (platform.toLowerCase().includes('mac')) os = 'macOS';
  else if (platform.toLowerCase().includes('linux')) os = 'Linux';

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
  let gpu = 'Integrated Graphics';
  let vram = 'Shared';
  if (gl) {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string;
      if (renderer) {
        if (renderer.toLowerCase().includes('nvidia')) gpu = 'NVIDIA GPU';
        else if (renderer.toLowerCase().includes('amd') || renderer.toLowerCase().includes('radeon')) gpu = 'AMD GPU';
        else if (renderer.toLowerCase().includes('apple') || renderer.toLowerCase().includes('m1') || renderer.toLowerCase().includes('m2') || renderer.toLowerCase().includes('m3')) gpu = 'Apple Silicon GPU';
        else if (renderer.toLowerCase().includes('intel')) gpu = 'Intel Graphics';
        gpu = renderer.length < 40 ? renderer : gpu;
      }
    }
  }

  let acceleration = 'CPU';
  if (gpu.toLowerCase().includes('nvidia') || gpu.toLowerCase().includes('rtx') || gpu.toLowerCase().includes('gtx')) {
    acceleration = 'CUDA';
    vram = 'Dedicated';
  } else if (gpu.toLowerCase().includes('apple') || gpu.toLowerCase().includes('m1') || gpu.toLowerCase().includes('m2') || gpu.toLowerCase().includes('m3')) {
    acceleration = 'Metal';
    vram = 'Unified Memory';
  } else if (gpu.toLowerCase().includes('amd') || gpu.toLowerCase().includes('radeon')) {
    acceleration = 'Vulkan';
    vram = 'Dedicated';
  }

  return {
    os,
    cpu: `${cores} cores`,
    ram: memory,
    gpu,
    vram,
    storage: 'Sufficient',
    acceleration,
  };
}

export function getRecommendedModel(hw: HardwareInfo): { name: string; size: string; id: string } {
  const cores = parseInt(hw.cpu);
  if (cores >= 8 || hw.acceleration !== 'CPU') {
    return { name: 'Qwen2.5 Coder 7B', size: '4.7 GB', id: 'qwen2.5-coder-7b' };
  }
  return { name: 'Qwen2.5 Coder 3B', size: '2.0 GB', id: 'qwen2.5-coder-3b' };
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
