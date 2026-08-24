/**
 * Leaf module: detect create/build/scaffold briefs without importing disk or folder flows.
 * Used by disk intent, catalog, explore, and route guards to avoid cross-routing.
 */

import { looksLikeInPlaceRebuildAsk, looksLikeProjectBuildAsk } from './chatBuildIntent';
import { looksLikeConversationalPlanningAsk, looksLikeGreenfieldIdea, wantsClarifyBeforeCreate, wantsPlanningOnly } from './chatIdeaIntent';

const CREATE_RE =
  /\b(?:create|scaffold|build\s+me\s+(?:a\s+)?|i\s+want\s+to\s+(?:make|build|create|start)|make\s+(?:a\s+)?new|start\s+(?:a\s+)?new|spin\s+up\s+(?:a\s+)?)\b/i;

const NEW_PROJECT_RE =
  /\bnew\s+(?:web\s+)?(?:app|application|project|website|site|python\s+project|react\s+app)\b/i;

const PROJECT_NOUN_RE =
  /\b(?:app|application|project|website|site|web\s*app|webapp|bot|program|starter)\b/i;

export function normalizeChatIntentText(text: string): string {
  return String(text || '').trim();
}

/** User wants to CREATE / BUILD / SCAFFOLD a new app or site. */
export function isProjectCreateBrief(text: string): boolean {
  const t = normalizeChatIntentText(text);
  if (!t) return false;
  if (wantsPlanningOnly(t)) return false;
  if (looksLikeConversationalPlanningAsk(t)) return false;
  if (wantsClarifyBeforeCreate(t)) return false;
  if (looksLikeInPlaceRebuildAsk(t)) return false;
  if (looksLikeProjectBuildAsk(t)) return true;
  if (looksLikeGreenfieldIdea(t)) return true;
  if (/\b(?:add|create|make|write|put)\b[\s\S]{0,40}\bfiles?\b/i.test(t)
    && !/\b(?:web\s+)?(?:app|application|project|website|site)\b/i.test(t)) {
    return false;
  }
  // "do not create any project" still contains the word project. ignore that noun hit.
  const nounText = t.replace(/\b(?:do\s+not|don't|dont|never|without)\s+create(?:\s+any)?\s+project\b/gi, ' ');
  return (CREATE_RE.test(t) || NEW_PROJECT_RE.test(t)) && PROJECT_NOUN_RE.test(nounText);
}
