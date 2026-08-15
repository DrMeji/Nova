/**
 * Lindsay / external clients talk to ARK’s brain — never to a third-party local app.
 *
 * Base URL (desktop): http://127.0.0.1:8787
 *
 * GET  /health
 *   → { ok, version, engine: { phase, ... } }
 *
 * GET  /v1/models
 *   → ARK Engine model list (GGUF + built-ins)
 *
 * GET  /v1/engine
 *   → full engine status
 *
 * POST /v1/chat
 *   body: { message: string, model?: string, kind?: 'chat' | 'image' | 'video' }
 *   → { reply, modelName?, media?: { kind, dataUrl, libraryId, real } }
 *
 * Optional bridges (Ollama, HF, …) stay behind ARK — clients only see this API.
 */

export const BRAIN_CONTRACT_VERSION = '0.2.0';
export const BRAIN_DEFAULT_URL = 'http://127.0.0.1:8787';

export type BrainChatRequest = {
  message: string;
  model?: string;
  kind?: 'chat' | 'image' | 'video';
};

export type BrainChatResponse = {
  reply: string;
  modelName?: string;
  media?: {
    kind: string;
    dataUrl: string;
    path?: string;
    libraryId?: string;
    real?: boolean;
  };
};
