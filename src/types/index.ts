export type ProjectType = 'web' | 'desktop' | 'api' | 'mobile' | 'game' | 'tool';
export type ProjectStatus = 'idle' | 'planning' | 'building' | 'running' | 'error' | 'complete';
export type BuildStatus = 'idle' | 'installing' | 'compiling' | 'testing' | 'running' | 'success' | 'failed';

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  project_type: ProjectType;
  status: ProjectStatus;
  build_status: BuildStatus;
  last_prompt: string | null;
  agent_state: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface ModelInfo {
  id: string;
  model_id: string;
  name: string;
  provider: string;
  source: string;
  context_length: number | null;
  coding: boolean;
  vision: boolean;
  reasoning: boolean;
  tool_calling: boolean;
  local_supported: boolean;
  license: string | null;
  model_size: string | null;
  quantization: string | null;
  category: string;
  status: string;
  is_recommended: boolean;
}

export interface ProviderConnection {
  id: string;
  user_id: string;
  provider_id: string;
  provider_name: string;
  status: string;
  connected_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  id: string;
  user_id: string;
  theme: 'dark' | 'light';
  ai_mode: 'automatic' | 'local_only' | 'cloud_when_available' | 'local_fallback';
  keep_files_local: boolean;
  allow_cloud_sync: boolean;
  send_diagnostics: boolean;
  preferred_language: string | null;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  project_id: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  provider_used: string | null;
  created_at: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  authType: 'apikey' | 'oauth' | 'none';
  isLocal: boolean;
  color: string;
  modelsCount: number;
}
