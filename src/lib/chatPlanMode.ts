/** Plan → implement gating for Chat (Step 6). */

const IMPLEMENT_GO_RE =
  /\b(go ahead|go build|go implement|implement it|build it now|start building|start coding|make it happen|do it now|yes build|yes implement|ship it)\b/i;

export function isPlanPrefixedMessage(message: string): boolean {
  return /^\[Plan\]\s*/i.test(String(message || '').trim());
}

export function looksLikeImplementGo(message: string): boolean {
  return IMPLEMENT_GO_RE.test(String(message || '').trim());
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
