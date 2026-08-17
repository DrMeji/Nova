/**
 * What the user is asking for — drives which ARK Engine model Auto loads.
 * Ollama is never part of this decision.
 */

export type ChatIntent = 'chat' | 'coding' | 'media';

const BUILD_ASK =
  /\b(build|create|make|scaffold|implement|refactor|debug|fix)\b[\s\S]{0,48}\b(app|website|component|function|api|project|calculator|tool|page|ui)\b/i;
const CODE_FILE =
  /\b(look (at|into)|review|open|edit|read)\b[\s\S]{0,40}\b(file|code|repo|project|source)\b/i;

export function looksLikeCodeAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/```[\w]*\n/.test(t)) return true;
  if (BUILD_ASK.test(t)) return true;
  if (/\b(write|create|build|make)\b[\s\S]{0,64}\b(calculator|html|website|app|component|page)\b/i.test(t)) return true;
  if (CODE_FILE.test(t)) return true;
  if (/\b(typescript|javascript|python|react|node\.?js|html|css)\b/i.test(t) && /\b(build|write|create|fix|add)\b/i.test(t)) {
    return true;
  }
  return false;
}

export function classifyChatIntent(message: string, kind?: string): ChatIntent {
  if (kind === 'image' || kind === 'video') return 'media';
  if (kind === 'coding') return 'coding';
  if (looksLikeCodeAsk(message)) return 'coding';
  return 'chat';
}
