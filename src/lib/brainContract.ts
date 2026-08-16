/**
 * Lindsay / external clients talk to ARK’s brain — never to a third-party local app.
 *
 * Base URL (desktop): http://127.0.0.1:8787
 *
 * GET  /health
 *   → { ok, version, contractVersion, engine: { phase, ... } }
 *
 * GET  /v1/contract
 *   → endpoints, auth mode, supported kinds
 *
 * GET  /v1/models
 *   → ARK Engine model list (GGUF + built-ins)
 *
 * GET  /v1/engine
 *   → full engine status
 *
 * POST /v1/chat
 *   body: { message: string, model?: string, kind?: 'chat' | 'image' | 'video' }
 *   → { ok, reply, modelName, media?: { kind, dataUrl, libraryId, real } }
 *
 * POST /v1/chat/stream
 *   → text/event-stream with event: status | delta | done | error
 *
 * Optional: set ARK_BRAIN_TOKEN and send Authorization: Bearer <token>
 *
 * Cookbook: docs/lindsay-brain-api.md · OpenAPI: docs/lindsay-openapi.yaml · sample: examples/lindsay-client/
 *
 * Optional bridges (Ollama, HF, …) stay behind ARK — clients only see this API.
 */

export const BRAIN_CONTRACT_VERSION = '0.3.0';
export const BRAIN_DEFAULT_URL = 'http://127.0.0.1:8787';

export type BrainChatRequest = {
  message: string;
  model?: string;
  kind?: 'chat' | 'image' | 'video';
};

export type BrainChatResponse = {
  ok?: boolean;
  reply: string;
  modelName?: string;
  /** @deprecated prefer modelName */
  model?: string;
  media?: {
    kind: string;
    dataUrl: string;
    path?: string;
    libraryId?: string;
    real?: boolean;
  };
};
