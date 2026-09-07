/**
 * Voice mode (Chat tab) — parked like Video until STT/TTS + conversation loop ship.
 *
 * Product rules (when enabled later):
 * - Back-and-forth spoken conversation only (ChatGPT-style voice).
 * - MUST NOT take over the PC, install software, build/scaffold apps, write/delete
 *   project files, or run agent/disk tools. Those stay in text Chat / Code.
 * - Plugins that are conversation-safe (weather facts, etc.) may be wired later;
 *   agentic / PC-control plugins stay off in Voice.
 *
 * Wiring stubs below so enabling the tab is mostly flipping isVoiceTabEnabled
 * and filling in the session hooks — not rediscovering architecture.
 */

import type { ChatMode } from '@/context/RouterContext';
import { isArkDevSession } from '@/lib/arkRuntime';
import { getLocalPrefs } from '@/lib/localPrefs';

/** Live on bat/dev builds, or when the user turns it on in Settings → Voice. */
export function isVoiceTabEnabled(): boolean {
  if (isArkDevSession()) return true;
  return getLocalPrefs().voiceChatEnabled === true;
}

export function isVoiceMode(mode: ChatMode | undefined): boolean {
  return mode === 'voice';
}

/** Hard product constraint for any future voice router / tool bridge. */
export const VOICE_MODE_CONSTRAINTS = {
  allowConversation: true,
  allowPcControl: false,
  allowDiskWrites: false,
  allowProjectBuilds: false,
  allowInstalls: false,
  allowAgentTools: false,
  allowCodeEdits: false,
  /** Safe chat plugins may be listed here when Voice goes live. */
  allowedPluginIds: [] as string[],
} as const;

export type VoiceSessionPhase =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'thinking'
  | 'speaking'
  | 'error';

export type VoiceSessionHooks = {
  /** Start mic capture (Web Speech / native / Electron). */
  startListening?: () => Promise<void> | void;
  /** Stop mic and finalize transcript. */
  stopListening?: () => Promise<string> | string;
  /** Speak assistant text (TTS). */
  speak?: (text: string) => Promise<void> | void;
  /** Cancel TTS / mic. */
  cancel?: () => void;
};

/**
 * Placeholder registry for Voice I/O backends.
 * Fill these when implementing the live Voice tab.
 */
export const voiceSessionHooks: VoiceSessionHooks = {};

export function registerVoiceSessionHooks(partial: VoiceSessionHooks) {
  Object.assign(voiceSessionHooks, partial);
}

/** Short spoken-conversation identity — keep this tiny so local models do not parrot constraints. */
export function voiceConversationSystemPrompt(): string {
  return [
    'You are NOVA in a spoken conversation.',
    'If asked who you are or what NOVA is, say you are NOVA, an AI creation studio on their PC — never call yourself ARK.',
    'Answer the user’s latest question directly in 1–4 natural sentences.',
    'Stay on their topic. Do not list what you cannot do unless they ask for builds, PC control, or illegal harm.',
  ].join(' ');
}
