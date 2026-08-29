/**
 * High-priority intent: user wants to CREATE / BUILD an app. never list Desktop folders.
 */

/** Scrap/rebuild the open (or named) folder in place. never spin up a sibling project. */
export function looksLikeInPlaceRebuildAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (!/\b(?:scrap|rebuild|redo|replace|start\s+over)\b/i.test(t)) return false;
  return (
    /\b(?:same\s+folder|this\s+folder|this\s+project|this\s+same\s+folder|in\s+place|current\s+ui|keep\s+the\s+same(?:\s+project)?\s+folder)\b/i.test(t)
    || /\b(?:do\s+not|don't|dont)\s+create\s+a\s+new\b/i.test(t)
  );
}

export function looksLikeProjectBuildAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  // Soft planning / “I'm building…” talk is not a create brief.
  if (/\b(?:help\s+me\s+plan|planning\s+only|just\s+(?:talk|plan|discuss)|get\s+started|how\s+(?:do|can|should)\s+i)\b/i.test(t)
    && !/\bcreate\s+(?:the\s+)?(?:files|project)\s+now\b/i.test(t)) {
    return false;
  }
  if (/\bi(?:'m| am)\s+building\b/i.test(t) && !/\b(?:create\s+project|scaffold|files\s+now|lets?\s+build\s+this)\b/i.test(t)) {
    return false;
  }

  // Explicit create / scaffold
  if (/\bcreate\s+(?:a\s+)?(?:new\s+)?project\b/i.test(t)) return true;
  if (/\bcreate\s+(?:a\s+)?(?:new\s+)?(?:website|site|web\s*app|app|application)\b/i.test(t)) return true;
  // "Create a React + Vite app named <Name>". words between create and app are OK.
  if (/\bcreate\s+(?:a\s+)?(?:new\s+)?[\s\S]{0,120}?\b(?:app|application|website|site|project)\b/i.test(t)) return true;
  if (/\b(?:react|vite)\b/i.test(t) && /\b(?:create|build|named|called)\b/i.test(t)) return true;
  if (/\bscaffold\b/i.test(t) && /\b(?:project|app|application|website|site)\b/i.test(t)) return true;
  // In-place scrap/rebuild of the bound folder is an edit, not a new project create.
  if (looksLikeInPlaceRebuildAsk(t)) return false;

  // “I want a … app called X”
  if (
    /\bi\s+want\s+(?:a|an)\b/i.test(t)
    && /\b(?:app|application|desktop\s+app|chat\s+app|website|site)\b/i.test(t)
    && /\b(?:called|named)\b/i.test(t)
  ) {
    return true;
  }

  // Multi-step build instructions in the same message
  if (/\bbuild\s+(?:the\s+)?(?:main\s+)?layout\b/i.test(t)) return true;
  if (/\bbuild\s+(?:real\s+)?files\b/i.test(t) && /\b(?:website|site|app|html|code|project)\b/i.test(t)) return true;
  if (/\badd\s+electron\b/i.test(t) && /\b(?:desktop|window|app)\b/i.test(t)) return true;
  if (
    /\b(?:server\s+rail|channel\s+list|chat\s+pane|member\s+list|title\s*bar|note\s*list)\b/i.test(t)
    && /\b(?:create|build|add|layout|theme)\b/i.test(t)
  ) {
    return true;
  }
  // Full landing-page briefs (hero + cards + images)
  if (
    /\b(?:website|site|landing\s+page)\b/i.test(t)
    && /\b(?:hero|unsplash|img|image|cta|headline)\b/i.test(t)
    && /\b(?:create|build|make)\b/i.test(t)
  ) {
    return true;
  }

  return false;
}
