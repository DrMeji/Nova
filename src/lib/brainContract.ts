/**
 * ARK’s local brain HTTP API (desktop loopback).
 * External tools can use this later — the app itself owns the engine.
 *
 * Base URL (desktop): http://127.0.0.1:8787
 *
 * Native:
 * GET  /health
 * GET  /v1/contract
 * GET  /v1/models
 * GET  /v1/engine
 * POST /v1/chat              — { message } or { messages:[{role,content}] }, model?, kind?
 * POST /v1/chat/stream
 *
 * OpenAI-shaped:
 * POST /v1/chat/completions  — { model, messages, stream? }
 *
 * Ollama-shaped:
 * GET  /api/tags
 * GET  /api/version
 * POST /api/chat
 * POST /api/generate
 *
 * Optional: set ARK_BRAIN_TOKEN and send Authorization: Bearer <token>
 */

export const BRAIN_CONTRACT_VERSION = '0.4.0';
export const BRAIN_DEFAULT_URL = 'http://127.0.0.1:8787';

export type BrainChatMessage = {
  role: string;
  content: string;
};

export type BrainChatRequest = {
  /** Single-turn prompt (legacy / simple clients) */
  message?: string;
  /** Multi-turn — preferred when continuing a thread */
  messages?: BrainChatMessage[];
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
