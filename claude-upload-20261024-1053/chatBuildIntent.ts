/**
 * High-priority intent: user wants to CREATE / BUILD an app. never list Desktop folders.
 */

/** Disk file/folder deletes must never be treated as product scrap/rebuild. */
function looksLikeDiskDeleteAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!/\b(?:delete|remove|trash|wipe|get\s+rid\s+of)\b/i.test(t)) return false;
  // "delete the file…", "delete Starbucks inside pictures", "delete that folder"
  if (/\bfiles?\b/i.test(t)) return true;
  if (/\b(?:delete|remove|trash|wipe)\b[\s\S]{0,64}\b(?:inside|in|from|within)\b[\s\S]{0,48}\b(?:folder|pictures?|photos?|desktop|documents|downloads)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:delete|remove|trash|wipe)\b[\s\S]{0,40}\b(?:that|this|the)\s+(?:file|folder|directory)\b/i.test(t)) {
    return true;
  }
  // Named item + location without the word "file"
  if (/\b(?:delete|remove|trash|wipe)\s+(?:the\s+)?[A-Za-z][A-Za-z0-9 _.-]{1,40}\s+(?:inside|in|from|within)\b/i.test(t)) {
    return true;
  }
  return false;
}

/** Same-chat “you built the wrong thing — rebuild as X” (bound workspace). */
export function looksLikeProductCorrectionAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t || t.length < 12) return false;
  // Never steal Desktop disk deletes into wipeProjectUiFiles.
  if (looksLikeDiskDeleteAsk(t)) return false;

  // Explicit scrap / start over / rebuild as…
  // Do NOT treat bare "delete it/this/the project" as product wipe — those are disk intents.
  if (
    /\b(?:scrap|scratch|trash|throw\s+away|wipe)\b[\s\S]{0,60}\b(?:everything|it|this|all|the\s+(?:ui|app|site|page|project|files?))\b/i.test(t)
    || /\bdelete\b[\s\S]{0,48}\b(?:everything|all\s+(?:of\s+)?(?:it|this)|the\s+(?:entire\s+)?(?:ui|app|site|page)|all\s+the\s+files)\b/i.test(t)
    || /\b(?:start\s+over|from\s+scratch|redo\s+(?:everything|it|this)|rebuild\s+(?:everything|it|this|as|from))\b/i.test(t)
    || /\b(?:replace\s+(?:the\s+)?(?:entire|whole|all)|completely\s+wrong|totally\s+wrong)\b/i.test(t)
  ) {
    return true;
  }

  // “Not what I asked / wrong product type”
  if (
    /\b(?:not\s+what\s+i\s+(?:asked|wanted|meant)|that(?:'s| is)\s+not\s+what\s+i\s+(?:asked|wanted)|wrong\s+(?:app|site|game|product|build|thing|ui|page|website))\b/i.test(t)
    || (/\bi\s+asked\s+for\s+(?:a|an)\b/i.test(t) && /\b(?:not\s+a|instead\s+of|not\s+an?)\b/i.test(t)
      && /\b(?:game|app|site|website|store|shop|product|canvas|playable|landing|dashboard|ui)\b/i.test(t))
    || /\byou\s+(?:built|made|created)\b[\s\S]{0,80}\b(?:wrong|instead|marketing|landing|website)\b/i.test(t)
  ) {
    return true;
  }

  // “Turn this into / rebuild as / instead make…”
  if (
    /\b(?:turn\s+(?:this|it)\s+into|rebuild\s+as|make\s+it\s+(?:a|an)|instead\s+(?:make|build|create)|i\s+need\s+(?:an?\s+)?actual)\b/i.test(t)
    && /\b(?:game|app|site|website|store|shop|bracelet|product|canvas|playable|landing|dashboard)\b/i.test(t)
  ) {
    return true;
  }

  return false;
}

/** Scrap/rebuild the open folder in place. never spin up a sibling project. */
export function looksLikeInPlaceRebuildAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (looksLikeProductCorrectionAsk(t)) return true;
  // Create fail-copy + user phrasing: "rebuild the UI", "fix broken JSX", full polish.
  if (/\brebuild\s+(?:the\s+)?ui\b/i.test(t)) return true;
  if (/\b(?:full\s+)?(?:ui\s+)?polish\b/i.test(t) && /\b(?:rebuild|fix|rewrite|redo)\b/i.test(t)) return true;
  if (
    /\b(?:fix|rewrite|redo)\b[\s\S]{0,40}\b(?:broken\s+)?(?:jsx|tsx|css|app\.css|tags?)\b/i.test(t)
    && /\b(?:ui|app|premium|welcome|desk|slot|confirm)\b/i.test(t)
  ) {
    return true;
  }
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
  // "build QuietStreak as a real app on disk"
  if (/\bbuild\s+[A-Z][A-Za-z0-9_-]{2,40}\b/i.test(t) && /\b(?:on\s+disk|open\s+preview|as\s+a\s+real)\b/i.test(t)) return true;
  if (/\bnew\s+project\s+[A-Z][A-Za-z0-9_-]{2,40}\b/i.test(t) && /\b(?:on\s+disk|build|create)\b/i.test(t)) return true;
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
