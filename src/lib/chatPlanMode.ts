/** Plan → implement gating for Chat (Step 6). */

const IMPLEMENT_GO_RE =
  /\b(go build|go implement|implement it|build it now|make it happen|do it now|yes build|yes implement|ship it|let'?s\s+build\s+(?:this|that|it)|lets\s+build\s+(?:this|that|it)|build\s+this|build\s+that|create\s+(?:the\s+)?(?:files|project)\s+now|stop\s+planning.{0,40}(?:build|create|implement)|done\s+planning.{0,40}(?:build|create|implement)|lets?\s+go(?:\s+ahead)?\s+and\s+(?:start\s+)?build|okay[,.]?\s+lets?\s+go(?:\s+ahead)?\s+and\s+(?:start\s+)?build|ready\s+to\s+build(?:\s+this)?)\b/i;

const GO_AHEAD_BUILD_RE =
  /\bgo ahead(?:\s+and)?\s+(?:build|implement|create|scaffold|write|code)\b/i;

export function isPlanPrefixedMessage(message: string): boolean {
  return /^\[Plan\]\s*/i.test(String(message || '').trim());
}

export function looksLikeImplementGo(message: string): boolean {
  const t = String(message || '').trim();
  if (!t) return false;
  if (/\b(delete|remove|trash|wipe|uninstall)\b/i.test(t)) return false;
  // Chip: "Create project SignalDesk". always execute, never re-plan.
  if (/^create\s+project\s+[A-Za-z]/i.test(t) && t.length < 80) return true;
  if (IMPLEMENT_GO_RE.test(t)) return true;
  if (/\bbuild\s+it\s+now\b/i.test(t)) return true;
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
  return 'The user is in **Plan** mode. Output a step-by-step plan only. no @@@FILE blocks, no file writes. End with: *Say “lets build this” when you want me to create files.*';
}

/** Soft planning chat. thorough unique advice, never scaffold. */
export function planningConversationHint(topicHint?: string): string {
  const topic = topicHint ? ` Focus on: ${topicHint.slice(0, 280)}` : '';
  return [
    'Planning conversation only. Do not create files, folders, or projects.',
    'Stay on the user’s actual topic. If they asked a general how-to (coding, learning, troubleshooting), deepen THAT answer.',
    'Do not invent a random product name, EcoBuddy-style demo app, stack, or timeline unless they described a product to build.',
    'If they already shared a product idea, answer that idea with concrete detail (stack, scope, tradeoffs).',
    'Never invent UI chips like Create project or Keep planning.',
    'Do not greet empty. Jump into useful content.',
    topic,
  ].filter(Boolean).join(' ');
}
