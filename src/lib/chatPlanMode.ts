/** Plan → implement gating for Chat (Step 6). */

const IMPLEMENT_GO_RE =
  /\b(go build|go implement|implement it|build it now|start building|start coding|make it happen|do it now|yes build|yes implement|ship it)\b/i;

const GO_AHEAD_BUILD_RE =
  /\bgo ahead(?:\s+and)?\s+(?:build|implement|create|start|make|scaffold|write|code)\b/i;

export function isPlanPrefixedMessage(message: string): boolean {
  return /^\[Plan\]\s*/i.test(String(message || '').trim());
}

export function looksLikeImplementGo(message: string): boolean {
  const t = String(message || '').trim();
  if (!t) return false;
  if (/\b(delete|remove|trash|wipe|uninstall)\b/i.test(t)) return false;
  if (IMPLEMENT_GO_RE.test(t)) return true;
  return GO_AHEAD_BUILD_RE.test(t);
}

/** Plan turns must not write files until user explicitly says go. */
export function shouldBlockChatFileWrites(message: string, composerMode: string | null): boolean {
  if (composerMode === 'plan') return true;
  if (isPlanPrefixedMessage(message)) return true;
  if (/^\[Plan\]/i.test(message)) return true;
  return false;
}

export function planModeSystemHint(): string {
  return 'The user is in **Plan** mode. Output a step-by-step plan only — no @@@FILE blocks, no file writes. End with: *Say “go implement” when you want me to build this.*';
}
