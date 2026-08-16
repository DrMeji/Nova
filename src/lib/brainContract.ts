/**
 * ARK’s local brain HTTP API (desktop loopback).
 * External tools can use this later — the app itself owns the engine.
 *
 * Base URL (desktop): http://127.0.0.1:8787
 *
 * GET  /health
 * GET  /v1/contract
 * GET  /v1/models
 * GET  /v1/engine
 * POST /v1/chat
 * POST /v1/chat/stream
 *
 * Optional: set ARK_BRAIN_TOKEN and send Authorization: Bearer <token>
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
