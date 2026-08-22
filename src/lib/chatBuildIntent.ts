/**
 * High-priority intent: user wants to CREATE / BUILD an app — never list Desktop folders.
 */

export function looksLikeProjectBuildAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;

  // Explicit create / scaffold
  if (/\bcreate\s+(?:a\s+)?(?:new\s+)?project\b/i.test(t)) return true;
  if (/\bscaffold\b/i.test(t) && /\b(?:project|app|application)\b/i.test(t)) return true;

  // “I want a … app called X”
  if (
    /\bi\s+want\s+(?:a|an)\b/i.test(t)
    && /\b(?:app|application|desktop\s+app|chat\s+app)\b/i.test(t)
    && /\b(?:called|named)\b/i.test(t)
  ) {
    return true;
  }

  // Multi-step build instructions in the same message
  if (/\bbuild\s+(?:the\s+)?(?:main\s+)?layout\b/i.test(t)) return true;
  if (/\badd\s+electron\b/i.test(t) && /\b(?:desktop|window|app)\b/i.test(t)) return true;
  if (
    /\b(?:server\s+rail|channel\s+list|chat\s+pane|member\s+list|title\s*bar|note\s*list)\b/i.test(t)
    && /\b(?:create|build|add|layout|theme)\b/i.test(t)
  ) {
    return true;
  }

  return false;
}
