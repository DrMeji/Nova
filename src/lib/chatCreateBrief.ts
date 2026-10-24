/**
 * Leaf module: detect create/build/scaffold briefs without importing disk or folder flows.
 * Used by disk intent, catalog, explore, and route guards to avoid cross-routing.
 */

import { looksLikeInPlaceRebuildAsk, looksLikeProjectBuildAsk } from './chatBuildIntent';
import { looksLikeGreenfieldIdea, wantsClarifyBeforeCreate, wantsPlanningOnly } from './chatIdeaIntent';

const CREATE_RE =
  /\b(?:create|scaffold|build\s+me\s+(?:a\s+)?|i\s+want\s+to\s+(?:make|build|create|start)|make\s+(?:a\s+)?new|start\s+(?:a\s+)?new|spin\s+up\s+(?:a\s+)?)\b/i;

const NEW_PROJECT_RE =
  /\bnew\s+(?:web\s+)?(?:app|application|project|website|site|python\s+project|react\s+app)\b/i;

const PROJECT_NOUN_RE =
  /\b(?:app|application|project|website|site|web\s*app|webapp|bot|program|starter|cli|command[\s-]?line|api|server|backend|library|package|script|tool|game|extension|service|dashboard)\b/i;

export function normalizeChatIntentText(text: string): string {
  return String(text || '').trim();
}

/** User wants ONE file on disk — not a new app/site scaffold (even if they say "project folder"). */
export function looksLikeSingleFileCreateAsk(text: string): boolean {
  const t = normalizeChatIntentText(text);
  if (!t) return false;
  // Explicit new-project scaffolds always win over "put … App.jsx" inside the brief.
  if (
    /\bcreate\s+(?:the\s+)?project\b/i.test(t)
    || (/\bon\s+disk\b/i.test(t) && /\b(?:create|scaffold|build)\b/i.test(t) && /\b(?:app|application|project|website|site)\b/i.test(t))
  ) {
    return false;
  }
  if (/\b(?:add|create|make|write|put)\b[\s\S]{0,48}\b(?:a\s+|the\s+|new\s+)?file\b/i.test(t)) return true;
  if (/\bput\s+the\s+file\b/i.test(t)) return true;
  if (/\b(?:add|create|make|write|put|save)\b[\s\S]{0,64}\b(?:readme|markdown|\.md\b)/i.test(t)) return true;
  if (
    /\b(?:add|create|make|write|put|save)\b[\s\S]{0,40}\b[A-Za-z0-9_-]+\.[A-Za-z0-9]{1,12}\b/i.test(t)
    && !/\b(?:web\s+)?(?:app|application|website|site|project)\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

/** User wants to CREATE / BUILD / SCAFFOLD a new app or site. */
export function isProjectCreateBrief(text: string): boolean {
  const t = normalizeChatIntentText(text);
  if (!t) return false;
  // Hard override first: never misroute "Create project X on disk …".
  if (/\bcreate\s+(?:the\s+)?project\s+[A-Za-z]/i.test(t) && /\bon\s+disk\b/i.test(t)) return true;
  if (looksLikeSingleFileCreateAsk(t)) return false;
  if (wantsPlanningOnly(t)) return false;
  if (wantsClarifyBeforeCreate(t)) return false;
  if (looksLikeInPlaceRebuildAsk(t)) return false;
  // Pure advice questions ("what should I use if I were to build…") are not create.
  if (
    /\b(?:what|which|how)\b/i.test(t)
    && /\b(?:should|would|could|type|stack|framework|use)\b/i.test(t)
    && !/\b(?:create|scaffold|build\s+me|make\s+me|spin\s+up)\b/i.test(t)
  ) {
    return false;
  }
  // Do NOT veto on conversational planning — create verb + noun wins (Grok Tier A).
  if (looksLikeProjectBuildAsk(t)) return true;
  if (looksLikeGreenfieldIdea(t) && (CREATE_RE.test(t) || NEW_PROJECT_RE.test(t)) && PROJECT_NOUN_RE.test(t)) {
    return true;
  }
  if (/\b(?:add|create|make|write|put)\b[\s\S]{0,40}\bfiles?\b/i.test(t)
    && !/\b(?:web\s+)?(?:app|application|project|website|site)\b/i.test(t)) {
    return false;
  }
  // "do not create any project" still contains the word project. ignore that noun hit.
  const nounText = t.replace(/\b(?:do\s+not|don't|dont|never|without)\s+create(?:\s+any)?\s+project\b/gi, ' ');
  return (CREATE_RE.test(t) || NEW_PROJECT_RE.test(t)) && PROJECT_NOUN_RE.test(nounText);
}
