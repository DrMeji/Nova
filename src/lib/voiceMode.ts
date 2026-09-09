/**
 * Voice mode (Chat tab) — spoken conversation only (no PC control / builds).
 *
 * Live on bat/dev builds, or when the user turns it on in Settings → Voice.
 *
 * Product rules:
 * - Back-and-forth spoken conversation only.
 * - MUST NOT take over the PC, install software, build/scaffold apps, write/delete
 *   project files, or run agent/disk tools. Those stay in text Chat / Code.
 */

import type { ChatMode } from '@/context/RouterContext';
import { isArkDevSession } from '@/lib/arkRuntime';
import { getLocalPrefs } from '@/lib/localPrefs';

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
    'If they ask you to build, scaffold, edit, or delete project files, say Voice is conversation only and they should use Chat or Code.',
  ].join(' ');
}

/** Spoken refuse when Voice is asked to build / edit / control the PC. */
export function voiceBuildEditRefuseReply(): string {
  return 'Voice is conversation only. Switch to Chat or Code if you want me to build or edit something.';
}

/**
 * True when the user is asking Voice to create/scaffold/edit files or take over the PC.
 * Keep this conservative — normal Q&A about coding should still get an answer.
 */
export function looksLikeVoiceBuildOrEditAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (
    /\b(build|create|scaffold|generate|make|spin\s*up)\b.{0,40}\b(app|site|website|landing|project|game|page)\b/i.test(t)
  ) return true;
  if (
    /\b(edit|change|update|rewrite|patch|delete|remove|rename)\b.{0,40}\b(file|code|folder|project|app\.tsx|index\.html|css)\b/i.test(t)
  ) return true;
  if (/\b(install|download)\b.{0,30}\b(npm|package|dependency|software|program)\b/i.test(t)) return true;
  if (/\b(take over|control)\b.{0,20}\b(my )?(pc|computer|desktop)\b/i.test(t)) return true;
  if (/\bopen\b.{0,20}\b(file explorer|terminal|powershell|cmd)\b/i.test(t)) return true;
  if (/\b(write|save)\b.{0,20}\b(to disk|to (the )?project|these files)\b/i.test(t)) return true;
  return false;
}
