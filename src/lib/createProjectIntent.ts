/**
 * Detect "create a new project from nothing" asks in Chat.
 */

import { looksLikeLandingBrief, prefersReactAppScaffold } from '@/lib/webLandingFromBrief';
import { looksLikeImplementGo } from '@/lib/chatPlanMode';
import { looksLikeSingleFileCreateAsk } from '@/lib/chatCreateBrief';
import {
  greenfieldToCreateIntent,
  looksLikeGreenfieldCreateGo,
  parseGreenfieldIdea,
  resolveGreenfieldFromThread,
  buildGreenfieldPlanReply,
  wantsPlanningOnly,
  looksLikeTalkBeforeCreateAsk,
  extractGreenfieldName,
  inferGreenfieldName,
  type GreenfieldIdeaIntent,
} from './chatIdeaIntent';
import { looksLikeFolderCatalogAsk } from '@/lib/folderCatalog';
import { looksLikeFolderPathAsk } from '@/lib/folderPathAsk';
import { looksLikePcExploreAsk, looksLikeInstalledAppsAsk } from '@/lib/pcExplore';
import { looksLikeInPlaceRebuildAsk, looksLikeProjectBuildAsk } from '@/lib/chatBuildIntent';
import { looksLikeBuildStart } from '@/lib/chatStudio';
import { slugifyProjectName } from '@/lib/projectNames';
import {
  detectProjectKind,
  resolveProjectKindForCreate,
  type ProjectKind,
} from '@/lib/projectKind';

export type { ProjectKind } from '@/lib/projectKind';
export { detectProjectKind, resolveProjectKindForCreate } from '@/lib/projectKind';

export type NewProjectIntent = {
  name: string;
  slug: string;
  kind: ProjectKind;
  summary: string;
  preferPlan: boolean;
  explicitPath?: string;
};

const CREATE_RE =
  /\b(?:create|scaffold|build\s+me\s+(?:a\s+)?|help\s+me\s+(?:to\s+)?(?:build|make|create)|(?:make|build)\s+(?:me\s+)?(?:an?\s+)(?:new\s+)?|i\s+want\s+to\s+(?:make|build|create|start)|make\s+(?:a\s+)?new|start\s+(?:a\s+)?new|spin\s+up\s+(?:a\s+)?|open\s+(?:a\s+)?(?:vite|react)|kick\s+off(?:\s+(?:a|an))?)\b/i;

const NEW_PROJECT_RE =
  /\bnew\s+(?:web\s+)?(?:app|application|project|website|site|python\s+project|react\s+app)\b/i;

const PROJECT_NOUN_RE =
  /\b(?:app|application|project|website|site|web\s*app|webapp|bot|program|starter|page|landing|homepage)\b/i;

/** Shared create-verb + product-noun gate (classifyTurn / createBrief / buildStart). */
export function isCreateVerbNoun(message: string): boolean {
  const t = String(message || '').trim();
  if (!t) return false;
  if (/\b(?:do\s+not|don't|dont|never|without)\s+create\b/i.test(t)) return false;
  if (wantsPlanningOnly(t)) return false;
  if (looksLikeTalkBeforeCreateAsk(t)) return false;
  // "what do I need / requirements" even if wantsPlanningOnly missed a variant
  if (/\b(?:what\s+(?:do|would|will)\s+i\s+(?:actually\s+)?need|requirements?)\b/i.test(t)
    && !/\b(?:build\s+it\s+now|scaffold\s+now|on\s+disk)\b/i.test(t)) {
    return false;
  }
  return (
    CREATE_RE.test(t) || NEW_PROJECT_RE.test(t) || looksLikeProjectBuildAsk(t) || looksLikeBuildStart(t)
  ) && PROJECT_NOUN_RE.test(t);
}

/** Lightweight create detect. no project name required (used by route guards). */
export function looksLikeCreateProjectBrief(message: string): boolean {
  const t = String(message || '').trim();
  if (!t) return false;
  if (looksLikeSingleFileCreateAsk(t)) return false;
  if (/\bask\s+me\b[\s\S]{0,80}\b(?:clarifying\s+)?questions?\b/i.test(t)) return false;
  if (/\b(?:add|create|make|write|put)\b[\s\S]{0,40}\bfiles?\b/i.test(t)
    && !/\b(?:web\s+)?(?:app|application|project|website|site)\b/i.test(t)) {
    return false;
  }
  return isCreateVerbNoun(t);
}

export { slugifyProjectName } from '@/lib/projectNames';

/** When the user says create/build but never names the product. */
export function fallbackCreateProjectName(text: string): string {
  const t = String(text || '');
  const kind = resolveProjectKindForCreate(t, detectProjectKind(t), detectProjectKind(t));
  if (/\b(?:kanban|board|tracker|dashboard)\b/i.test(t)) return 'Board';
  if (/\b(?:game|arcade|fps|shooter)\b/i.test(t)) return 'Game';
  if (/\b(?:bot|cli|script)\b/i.test(t) && kind === 'python') return 'Tool';
  if (kind === 'static-web' || /\b(?:website|site|landing|page|homepage)\b/i.test(t)) return 'Site';
  if (kind === 'vite-react' || /\b(?:app|application|spa|react)\b/i.test(t)) return 'App';
  return 'My App';
}

export function extractProjectName(text: string): string | null {
  const t = String(text || '').trim();
  // Prefer explicit called/named titles before "create the project on disk" (which used to
  // capture the junk name "on disk").
  const patterns = [
    /\b(?:called|named|titled|name(?:d)?\s+it|call\s+it)\s+["“']([^"”']{2,48})["”']/i,
    /\b(?:called|named|titled|name(?:d)?\s+it|call\s+it)\s+([A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*){0,3})\b/,
    /\b(?:called|named|titled|name(?:d)?\s+it|call\s+it)\s+([A-Za-z][A-Za-z0-9._\s-]{1,48})/i,
    /\b(?:app|application|website|site)\s+named\s+["“']?([A-Za-z][A-Za-z0-9._\s-]{1,48})/i,
    /\b(?:project|app|product|system)\s+(?:called|named)\s+["“']?([A-Za-z][A-Za-z0-9._\s-]{1,40})/i,
    // "Create the project apple.com on disk" / "Create project Peach"
    /\bcreate\s+(?:the\s+)?project\s+["“']?([A-Za-z][A-Za-z0-9][A-Za-z0-9._\s-]{0,48})/i,
    // "Create the Ledger Bay project on disk"
    /\bcreate\s+(?:the\s+)?([A-Za-z][A-Za-z0-9][A-Za-z0-9._\s-]{0,48}?)\s+project(?:\s+on\s+disk)?\b/i,
    /\bcreate\s+(?:the\s+)?([A-Za-z][A-Za-z0-9][A-Za-z0-9._\s-]{0,48}?)\s+on\s+disk\b/i,
    // "build EmberOak on disk" / "go ahead and build QuietStreak on disk"
    /\b(?:build|create|scaffold)\s+([A-Z][A-Za-z0-9.]{1,40})\s+on\s+disk\b/,
    /\b(?:build|create|scaffold)\s+([A-Z][A-Za-z0-9.]{1,40})\b(?=[\s\S]{0,80}\bon\s+disk\b)/,
    /\bcreate\s+(?:a\s+)?(?:new\s+)?project\s+["“']?([A-Za-z][A-Za-z0-9._\s-]{1,48})/i,
    /\bcreate\s+([A-Z][A-Za-z0-9.]{1,40})\s*[—–\-:]/,
    /\bcreate\s+([A-Z][A-Za-z0-9.]{1,40})\s+as\b/i,
    // "Create SaltPier restaurant website" / "Create Nightglass site"
    /\bcreate\s+([A-Z][A-Za-z0-9.]{1,40})\s+(?:restaurant|landing|marketing|festival|portfolio)?\s*(?:website|site|app|application|project)\b/i,
    /\b(?:app|project|website|site)\s+["“']([^"”']{2,48})["”']/i,
    /\bnew\s+(?:web\s+)?(?:app|project|website|site)\s+([A-Za-z][A-Za-z0-9._-]{1,40})/i,
    /\bkeep\s+the\s+folder\s+name\s+([A-Za-z][A-Za-z0-9._\s-]{1,40})/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) {
      let raw = m[1].trim().replace(/[?.!,;:]+$/g, '');
      // "NexusLink. Team chat with…" → NexusLink (stop at sentence break).
      raw = raw.replace(/\.\s+.*$/, '').trim();
      // "ReefLog and build a reef…" → ReefLog (never the whole sentence as the product name).
      raw = raw.replace(/\s+(?:and|with|that|which|where|when|so|for|but|featuring|including|—|–|-)\b.*$/i, '').trim();
      raw = raw.replace(/\s+(?:app|project|website|site|on|for|with)\b.*$/i, '').trim();
      // Reject ultra-generic leftovers from older chats / "create the project on disk".
      if (/^(my|new|app|project|the|this|that|ok|yeah|cool|sure|on|disk|on[\s-]?disk|folder|files?|ready|ui|site|website)$/i.test(raw)) continue;
      if (raw.length >= 2 && raw.length <= 48) return raw;
    }
  }
  return null;
}

function extractExplicitPath(text: string): string | undefined {
  const m = String(text || '').match(/\b([A-Za-z]:\\(?:[^\s"'<>|]+\\)*[^\s"'<>|]+)\b/);
  return m?.[1];
}

export function recoverOriginalUserBrief(
  messages: Array<{ role: string; content?: string | null }>,
): string | null {
  const CHIP_RE = /^(?:keep planning|create project|add more features|for .+ expand the plan|let'?s build|lets build|build this|go implement|go build)\b/i;
  const candidates = messages
    .filter(m => m.role === 'user')
    .map(m => String(m.content || '').trim())
    .filter(t => {
      if (!t || t.startsWith('__generating__:') || CHIP_RE.test(t)) return false;
      if (t.length > 100) return true;
      // Short but named product briefs still count.
      return /\b(?:called|named)\s+[A-Za-z]/i.test(t)
        && /\b(?:app|website|site|landing|festival|dashboard|tracker|board)\b/i.test(t);
    });
  if (!candidates.length) return null;
  return candidates.sort((a, b) => b.length - a.length)[0];
}

/** Best product brief from recent user turns (for "lets build this" after planning). */
export function findBestProductBrief(recentUserLines: string[]): string | null {
  const CHIP_RE = /^(?:keep planning|create project|add more features|let'?s build|lets build|build this|build it|lets?\s+start\s+building|go implement|go build|ok\s+lets?\s+start\s+building)\b/i;
  const scored = recentUserLines
    .map(t => String(t || '').trim())
    .filter(t => t && !CHIP_RE.test(t) && !t.startsWith('__generating__:'))
    .map(t => {
      let score = t.length;
      if (/\b(?:called|named)\s+[A-Za-z]/i.test(t)) score += 200;
      if (/\b(?:landing|festival|lineup|ticket|restaurant|dashboard|kanban|tracker)\b/i.test(t)) score += 120;
      if (/\b(?:fps|first[\s-]?person|shooter|arena|hitscan|crosshair|enemy|crate|muzzle)\b/i.test(t)) score += 180;
      if (/\b(?:game|playable|arcade)\b/i.test(t) && t.length > 120) score += 100;
      if (/\b(?:plan|planning|mvp|week one)\b/i.test(t)) score += 40;
      if (t.length < 40) score -= 200;
      return { t, score };
    })
    .filter(x => x.score > 80)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.t || null;
}

export function parseNewProjectIntent(message: string): NewProjectIntent | null {
  const t = String(message || '').trim();
  if (!t) return null;
  if (looksLikeSingleFileCreateAsk(t)) return null;

  if (wantsPlanningOnly(t)) return null;
  if (looksLikeTalkBeforeCreateAsk(t)) return null;
  if (/\b(?:do\s+not|don't|dont|never|without)\s+create\b/i.test(t)) return null;
  if (/\bask\s+me\b[\s\S]{0,80}\b(?:clarifying\s+)?questions?\b/i.test(t)) return null;
  if (/\bclarifying\s+questions?\s+first\b/i.test(t)) return null;
  if (looksLikeInPlaceRebuildAsk(t)) return null;

  if (
    /\b(?:add|create|make|write|put)\b[\s\S]{0,40}\bfiles?\b/i.test(t)
    && !/\b(?:web\s+)?(?:app|application|project|website|site)\b/i.test(t)
  ) {
    return null;
  }

  const isCreate = isCreateVerbNoun(t) || CREATE_RE.test(t) || NEW_PROJECT_RE.test(t) || looksLikeProjectBuildAsk(t) || looksLikeBuildStart(t);
  if (!isCreate || !PROJECT_NOUN_RE.test(t)) return null;

  // Build/create always wins over explore/catalog false positives.
  if (!looksLikeProjectBuildAsk(t)) {
    if (looksLikePcExploreAsk(t)) return null;
    if (looksLikeFolderCatalogAsk(t)) return null;
    if (looksLikeInstalledAppsAsk(t)) return null;
    if (/\b(?:what|which|list|show|find|tell me)\b/i.test(t) && /\b(?:on|in)\s+(?:my\s+)?(?:pc|desktop)\b/i.test(t)) {
      return null;
    }
  }
  if (looksLikeFolderPathAsk(t) && !isCreate) return null;
  if (/\b(?:open|attach|import)\s+(?:folder|project)\b/i.test(t) && !/\bnew\b/i.test(t) && !/\bcreate\s+project\b/i.test(t)) return null;
  if (/\b(?:install|npm\s+i|pip\s+install)\b/i.test(t) && !/\bnew\b/i.test(t) && !looksLikeProjectBuildAsk(t)) return null;
  // “delete selected” UI feature must not cancel Create the project X on disk.
  if (
    /\b(delete|remove|trash|wipe)\b/i.test(t)
    && /\b(project|workspace|folder|directory)\b/i.test(t)
    && !/\bcreate\s+(?:the\s+)?project\b/i.test(t)
    && !/\bon\s+disk\b/i.test(t)
  ) {
    return null;
  }

  const name = extractProjectName(t)
    || extractGreenfieldName(t)
    || inferGreenfieldName(t)
    || fallbackCreateProjectName(t)
    || 'App';

  const kind = resolveProjectKindForCreate(t, detectProjectKind(t), detectProjectKind(t));
  // Rich briefs plan first (chips). Short "Create project X" builds now.
  // Explicit disk/preview asks must build immediately — never bounce to yellow "Bind a project".
  const shortChip = /^create\s+project\s+[A-Za-z]/i.test(t.trim()) && t.length < 80;
  // Premium website replicas should plan + research first unless the user clearly says go.
  // Do NOT treat negated mentions ("NOT apple.com", "not a Netflix clone") as replica asks.
  const richReplicaBrief = /\b(?:exact\s+replica|identical|clone\s+(?:of\s+)?(?:the\s+)?(?:look|site|homepage)|apple\.com|netflix\.com|twitch\.tv)\b/i.test(t)
    && /\b(?:website|site|landing|homepage|marketing|web\s*app|replica)\b/i.test(t)
    && !/\b(?:not|never|isn't|isnt|no)\b[\s\S]{0,40}\b(?:exact\s+replica|identical|apple\.com|netflix\.com|twitch\.tv|clone)\b/i.test(t);
  const explicitPlanOnly = /\b(?:plan\s+only|planning\s+only|don'?t\s+build\s+yet|do\s+not\s+build\s+yet|questions?\s+only|just\s+plan)\b/i.test(t)
    || wantsPlanningOnly(t);
  const shortCreateAsk = t.length <= 200
    && /\b(?:create|build|make|scaffold|spin\s+up|kick\s+off|open)\b/i.test(t)
    && /\b(?:website|site|web\s*app|react\s+app|app|project|page|landing)\b/i.test(t);
  const wantsImmediateBuild = !richReplicaBrief && !explicitPlanOnly && (
    shortCreateAsk
    || looksLikeBuildStart(t)
    || /\bon\s+disk\b/i.test(t)
    || /\b(?:files?\s+on\s+disk|scaffold\s+now|build\s+it\s+now|open\s+preview|and\s+open\s+preview)\b/i.test(t)
    || /\bkeep\s+building\s+until\s+ready\b/i.test(t)
    || /\bcreate\s+(?:a\s+)?(?:brand[- ]?new\s+)?project\s+folder\b/i.test(t)
    || /\bcreate\s+(?:the\s+)?project\s+[A-Za-z]/i.test(t)
    // "Create a new project: … called Nightcord" (colon or dash after project)
    || /\bcreate\s+(?:a\s+)?(?:brand[- ]?new\s+)?(?:new\s+)?project\b/i.test(t)
    // "Create a brand-new website project called X" / "Create a new website called X"
    || /\bcreate\s+(?:a\s+)?(?:brand[- ]?new\s+)?(?:website|site|web\s*app|home\s*page|landing)\b/i.test(t)
    || /\bbrand[- ]?new\s+(?:website|site|project|app)\b/i.test(t)
    || (/\b(?:create|build|scaffold|spin\s+up|make|open|kick\s+off)\b/i.test(t)
      && /\b(?:called|named|titled)\b/i.test(t)
      && /\b(?:website|site|project|app|page|homepage)\b/i.test(t))
    || (/\bcreate\b/i.test(t) && /\b(?:called|named)\b/i.test(t) && /\b(?:website|site|project|app)\b/i.test(t) && /\bsrc\/app\.(jsx|tsx|css)\b/i.test(t))
    // "Create a Vite + React website named X" (stack words between create and website)
    || /\bcreate\s+(?:a\s+)?(?:[\w.+#-]+\s+){0,6}(?:website|site|web\s*app|react\s+app)\b/i.test(t)
    // "Spin up a Vite React project named X" / "Scaffold a React app called X"
    || /\b(?:spin\s+up|scaffold)\s+(?:a\s+)?(?:[\w.+#-]+\s+){0,8}(?:website|site|web\s*app|react\s+app|project|app)\b/i.test(t)
    // "Open a Vite React site named X"
    || /\bopen\s+(?:a\s+)?(?:[\w.+#-]+\s+){0,8}(?:website|site|web\s*app|react\s+app|project|app)\b/i.test(t)
  );
  // Plan only for explicit plan-only or rich replica research — never for normal create/build.
  const preferPlan = Boolean(explicitPlanOnly || (richReplicaBrief && !wantsImmediateBuild && !shortChip));

  return {
    name,
    slug: slugifyProjectName(name),
    kind,
    summary: t,
    preferPlan,
    explicitPath: extractExplicitPath(t),
  };
}

export function buildCreateProjectPlan(intent: NewProjectIntent): string {
  const kind = resolveProjectKindForCreate(intent.summary, intent.kind, intent.kind);
  const idea: GreenfieldIdeaIntent = {
    name: intent.name,
    slug: intent.slug,
    kind,
    summary: intent.summary,
    problemLine: `Build ${intent.name} from your brief.`,
  };
  return buildGreenfieldPlanReply(idea);
}

/** After a plan, user says "go implement". recover create intent from recent turns. */
export function resolveCreateIntentFromThread(
  message: string,
  recentUserLines: string[],
  opts?: { workspaceActive?: boolean; pendingGreenfield?: GreenfieldIdeaIntent | null },
): NewProjectIntent | null {
  const direct = parseNewProjectIntent(message);
  if (direct && !direct.preferPlan) {
    // Chip / short create. prefer the pending brief so landing pages are not empty.
    if (opts?.pendingGreenfield && namesMatch(opts.pendingGreenfield.name, direct.name)) {
      return {
        ...direct,
        summary: opts.pendingGreenfield.summary || direct.summary,
        kind: resolveProjectKindForCreate(
          opts.pendingGreenfield.summary || direct.summary,
          opts.pendingGreenfield.kind,
          direct.kind,
        ),
        preferPlan: false,
      };
    }
    for (let i = recentUserLines.length - 1; i >= 0; i--) {
      const prior = parseNewProjectIntent(recentUserLines[i]);
      if (prior && namesMatch(prior.name, direct.name) && prior.summary.length > direct.summary.length) {
        return { ...direct, summary: prior.summary, kind: prior.kind, preferPlan: false };
      }
    }
    return direct;
  }
  if (direct) return direct;

  const greenfield = resolveGreenfieldFromThread(
    message,
    recentUserLines,
    opts?.pendingGreenfield || null,
  );
  if (greenfield && (looksLikeGreenfieldCreateGo(message) || looksLikeImplementGo(message) || /\b(?:create|build)\s+it\b/i.test(message))) {
    const payload = greenfieldToCreateIntent(greenfield);
    const bestBrief = findBestProductBrief(recentUserLines);
    const summary = bestBrief && bestBrief.length > (payload.summary?.length || 0)
      ? bestBrief
      : payload.summary;
    const name = /^(My App|New App|App|Game)$/i.test(payload.name) && bestBrief
      ? (parseGreenfieldIdea(bestBrief)?.name
        || extractGreenfieldName(bestBrief)
        || inferGreenfieldName(bestBrief)
        || payload.name)
      : payload.name;
    return {
      name,
      slug: slugifyProjectName(name),
      kind: resolveProjectKindForCreate(summary, payload.kind, payload.kind),
      summary,
      preferPlan: false,
    };
  }

  if (!looksLikeImplementGo(message)
    && !/\b(?:create|build)\s+it\b/i.test(message)
    && !/^create\s+project\s+/i.test(message.trim())
    && !(looksLikeProjectBuildAsk(message) && /\bon\s+disk\b/i.test(message))
  ) {
    return null;
  }

  if (opts?.workspaceActive && looksLikeImplementGo(message)) {
    // Already bound to a folder. only skip create when this is a short go-chip with no new product name.
    const named = extractProjectName(message) || extractGreenfieldName(message);
    if (!named) return null;
  }

  const bestBrief = findBestProductBrief(recentUserLines);

  if (opts?.pendingGreenfield) {
    const payload = greenfieldToCreateIntent(opts.pendingGreenfield);
    const summary = bestBrief && bestBrief.length > (payload.summary?.length || 0)
      ? bestBrief
      : payload.summary;
    return {
      name: payload.name,
      slug: payload.slug,
      kind: resolveProjectKindForCreate(summary, payload.kind, payload.kind),
      summary,
      preferPlan: false,
    };
  }

  if (bestBrief) {
    const idea = parseGreenfieldIdea(bestBrief) || parseNewProjectIntent(bestBrief);
    if (idea) {
      return {
        name: idea.name,
        slug: idea.slug,
        kind: idea.kind,
        summary: bestBrief,
        preferPlan: false,
      };
    }
    // Brief recovered but parsers were picky. still create from the brief text.
    const named = bestBrief.match(/\b(?:called|named|leaning|name(?:d)?\s+it)\s+([A-Za-z][A-Za-z0-9_-]{1,40})\b/i)?.[1]
      || bestBrief.match(/\bleaning\s+([A-Za-z][A-Za-z0-9_-]{1,40})\s+as\s+the\s+name\b/i)?.[1]
      || bestBrief.match(/\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/)?.[1]
      || 'My App';
    return {
      name: named,
      slug: slugifyProjectName(named),
      kind: resolveProjectKindForCreate(bestBrief, detectProjectKind(bestBrief), detectProjectKind(bestBrief)),
      summary: bestBrief,
      preferPlan: false,
    };
  }

  for (let i = recentUserLines.length - 1; i >= 0; i--) {
    const hit = parseNewProjectIntent(recentUserLines[i]);
    if (hit) return { ...hit, preferPlan: false };
  }

  const stripped = String(message || '')
    .replace(/\b(go ahead|go build|go implement|implement it|build it now|build it|create it|let'?s start building|lets start building|start building|let'?s build(?:\s+(?:this|that|it))?|build this|build that)\b/gi, '')
    .trim();
  return parseNewProjectIntent(stripped);
}

function namesMatch(a: string, b: string): boolean {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}
