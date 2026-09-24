/**
 * Greenfield product ideas. plan + optional create (not "Which project folder?").
 */

import { slugifyProjectName } from './projectNames';
import { looksLikeProjectBuildAsk } from './chatBuildIntent';
import { looksLikeLandingBrief, prefersReactAppScaffold, wantsChatAppScaffold } from '@/lib/webLandingFromBrief';
import { detectProjectKind, resolveProjectKindForCreate, type ProjectKind } from '@/lib/projectKind';
import { looksLikeImplementGo } from '@/lib/chatPlanMode';

export type { ProjectKind };

/** Pause before plan/create replies so the UI reflects reading a real brief (not instant template dump). */
export function briefReadDelayMs(text: string): number {
  const t = String(text || '');
  const len = t.length;
  if (len < 60) return 0;
  const bulletLines = (t.match(/^\s*[-*•]/gm) || []).length;
  const structured = /\bmust\s+include\b/i.test(t) ? 800 : 0;
  // Scale with full length (no 3200 hard clip). Long briefs can take 8–14s.
  const scaled = 900 + len * 0.55 + bulletLines * 280 + structured;
  return Math.min(14000, Math.max(2000, Math.round(scaled)));
}

const BLOCKED_NAME_WORDS = new Set([
  'a', 'an', 'the', 'this', 'that', 'my', 'our', 'your', 'we', 'i', 'it',
  'new', 'website', 'site', 'web', 'app', 'application', 'project', 'product',
  'where', 'how', 'what', 'when', 'people', 'like', 'get', 'want', 'build',
  'copy', 'for', 'any', 'something', 'anything', 'yet', 'just', 'talk', 'plan',
]);

export type GreenfieldIdeaIntent = {
  name: string;
  slug: string;
  kind: ProjectKind;
  summary: string;
  problemLine: string;
};

export type GreenfieldCreatePayload = {
  name: string;
  slug: string;
  kind: ProjectKind;
  summary: string;
  preferPlan: boolean;
};

const HOW_START_RE =
  /\b(?:how\s+(?:should|do|can|would)\s+(?:i|we)\s+(?:start|begin)|best\s+way\s+to\s+(?:start|begin)|where\s+(?:should|do)\s+(?:i|we)\s+start|where\s+to\s+start|what\s+do\s+you\s+think|help\s+me\s+(?:plan|start|figure|sequence)|what(?:'s| is)\s+(?:the\s+)?(?:best|good)\s+(?:way|approach)|how\s+(?:would|do)\s+(?:you|we)\s+(?:start|build|approach)|sequence\s+the\s+work|week\s+one\s+look\s+like)\b/i;

const FEATURE_DESC_RE =
  /\b(?:when\s+(?:people|users|someone|they)|so\s+(?:that|when)|that\s+(?:lets|allows|sends|notifies|connects|tracks|shows|records)|idea\s+is\s+to|basically|like\s+a|similar\s+to|pick\s+what|schedule|gets?\s+made|ready|—|–)\b/i;

const BUILD_IDEA_RE =
  /\b(?:i\s+)?(?:want\s+to\s+)?(?:build|create|make|design|develop|start)\b/i;

/** Hardware / real-world / ops playbooks. never greenfield software projects. */
function isNonSoftwareBuildAsk(text: string): boolean {
  const t = String(text || '');
  if (/\b(app|application|website|site|web\s*app|software|saas|react|vite|landing\s+page|mobile\s+app|kanban)\b/i.test(t)
    && !/\b(?:do\s+not|don't|dont)\s+create\s+any\s+(?:software\s+)?project\b/i.test(t)) {
    return false;
  }
  if (/\b(?:operating\s+playbook|radio\s+station|underwriting|on-air|board-op|live-show)\b/i.test(t)) return true;
  if (/\b(?:marina|berth|harbormaster|haul-out|pump-out)\b/i.test(t) && /\b(?:design|plan|clarif|not\s+build)\b/i.test(t)) return true;
  return /\b(?:gaming\s+pc|build\s+a\s+pc|pc\s+build|custom\s+pc|fpv\s+drone|drone|quadcopter|car\s+engine|gasoline|fish\s+breathe|how\s+do\s+fish|motherboard|cpu\s+and\s+gpu|frame\s+size|radio\s+first|mid-?range\s+gaming)\b/i.test(t)
    || (/\b(?:pc|drone|car|bike|house|robot|engine)\b/i.test(t) && /\b(?:build|assemble|pick|recommend)\b/i.test(t));
}

/** User asked to talk / clarify / plan first. never scaffold or auto-create. */
export function wantsClarifyBeforeCreate(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/\b(?:do\s+not|don't|dont|never|without)\s+create\b/i.test(t)) return true;
  if (/\bdo\s+not\s+create\s+any\b/i.test(t)) return true;
  if (/\bask\s+me\b[\s\S]{0,80}\b(?:clarifying\s+)?questions?\b/i.test(t)) return true;
  if (/\bclarifying\s+questions?\s+first\b/i.test(t)) return true;
  if (/\bquestions?\s+only\b/i.test(t) && /\bask\b/i.test(t)) return true;
  return false;
}

/**
 * Requirements / advice ask — talk only, never scaffold.
 * e.g. "I want to build an app like Discord, what do I need / requirements?"
 */
export function looksLikeRequirementsAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  // Explicit go-build wins over advice wording.
  if (/\b(?:build\s+it\s+now|scaffold\s+now|create\s+(?:the\s+)?(?:files|project)\s+now|lets?\s+build\s+(?:this|that|it)|go\s+build|on\s+disk|open\s+preview)\b/i.test(t)) {
    return false;
  }
  if (/\b(?:what\s+(?:do|would|will)\s+i\s+(?:actually\s+)?need|what\s+do\s+i\s+actually\s+need|all\s+the\s+requirements|requirements?\s+(?:and\s+stuff|to\s+build)|what\s+(?:are\s+)?(?:the\s+)?requirements)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:what\s+(?:stack|tech(?:nology)?|tools?|languages?|frameworks?)\s+(?:do\s+i\s+need|should\s+i\s+use)|what\s+would\s+it\s+take|how\s+(?:hard|much)\s+(?:is|would)\b)/i.test(t)) {
    return true;
  }
  // Educational how-to (hardware, business, learning) — prose advice, never scaffolds.
  if (
    /\bhow\s+(?:do\s+(?:you|i)|would\s+(?:you|i)|can\s+(?:you|i)|to)\s+(?:build|make|start|begin|learn)\b/i.test(t)
    && !/\b(?:create\s+(?:the\s+)?(?:files|project)|scaffold|on\s+disk|@@@FILE)\b/i.test(t)
  ) {
    return true;
  }
  // Mid-convo planning: MVP / high-level / before writing files.
  if (
    (
      /\b(?:keep\s+it\s+high[- ]?level|high[- ]?level\s+(?:for\s+now|overview|plan)|simple\s+MVP|what\s+would\s+(?:a\s+)?(?:simple\s+)?MVP\b)/i.test(t)
      || /\bbefore\s+(?:we|i|you)\s+(?:write|create|touch)\s+(?:any\s+)?(?:files?|code)\b/i.test(t)
      || /\bmain\s+pieces?\b/i.test(t)
      || /\bwhat\s+(?:are|would\s+be)\s+the\s+(?:main|core)\s+(?:pieces|parts|features)\b/i.test(t)
    )
    && !/\b(?:create\s+(?:the\s+)?(?:files|project)|scaffold|build\s+it\s+now|lets?\s+build\s+(?:this|that|it)\s+out|on\s+disk)\b/i.test(t)
  ) {
    return true;
  }
  // "I want to build X … what do I need / like all the requirements"
  if (
    /\b(?:i\s+want\s+to\s+(?:build|make|create)|(?:build|make)\s+(?:an?\s+)?(?:app|website|site))\b/i.test(t)
    && /\b(?:what\s+(?:do|would|will|should)|need|requirements?|advise|advice|recommend|explain)\b/i.test(t)
    && !/\b(?:create\s+(?:the\s+)?(?:files|project)|scaffold|called|named)\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

/**
 * Exploratory product talk — discuss first, never scaffold.
 * Familiarity / requirements questions stay chat.
 * Clear build asks ("build me…", "I want to build X called Y", "create a Discord-like app") create.
 */
export function looksLikeTalkBeforeCreateAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;

  const explicitGo =
    /\b(?:build\s+it\s+now|scaffold(?:\s+now)?|create\s+(?:the\s+)?(?:files|project)(?:\s+now)?|lets?\s+build\s+(?:this|that|it|out)|go\s+(?:build|ahead)|on\s+disk|open\s+preview|build\s+this\s+out|start\s+building)\b/i.test(t)
    || /\b(?:create|scaffold|spin\s+up)\s+(?:a\s+)?(?:new\s+)?(?:web\s+)?(?:app|application|project|website|site)\b/i.test(t)
    || /\b(?:build|make)\s+me\s+(?:an?\s+)?(?:new\s+)?(?:app|website|site|project|page)\b/i.test(t)
    || /\bi\s+want\s+you\s+to\s+(?:build|make|create)\b/i.test(t)
    || (/\b(?:called|named)\b/i.test(t) && /\b(?:build|create|make|scaffold|want\s+to\s+build)\b/i.test(t) && !/\b(?:are\s+you\s+familiar|do\s+you\s+know|what\s+(?:do|would|will)\s+i)\b/i.test(t))
    || (
      /\b(?:discord|slack|twitch|netflix)(?:-|\s+)?like\b/i.test(t)
      && /\b(?:build|create|make|scaffold)\b/i.test(t)
      && !/\b(?:are\s+you\s+familiar|do\s+you\s+know|what\s+(?:do|would|will)\s+i|requirements?)\b/i.test(t)
      && !/\?\s*$/.test(t)
    );

  if (explicitGo) return false;

  // Familiarity / check-in questions with product wording.
  if (/\b(?:are\s+you\s+familiar|do\s+you\s+know|have\s+you\s+(?:seen|used|heard)|familiar\s+with)\b/i.test(t)) {
    return true;
  }

  // Soft desire is talk ONLY when they are asking / planning — not commanding a build.
  if (/\bi\s+want\s+to\s+(?:build|make|create|start)\b/i.test(t)) {
    if (
      /\b(?:what\s+(?:do|would|will|should)|need|requirements?|advise|advice|recommend|explain|how\s+(?:do|would|should)|are\s+you\s+familiar|do\s+you\s+know)\b/i.test(t)
      || /\?/.test(t)
    ) {
      return true;
    }
    // "I want to build a Discord app" with no question → treat as build intent (not talk).
    return false;
  }

  // Design sketch: "I want a homepage that feels like apple.com…" with sections, no build verb.
  if (
    t.length >= 40
    && t.length < 1200
    && /\bi\s+want\s+a\s+(?:homepage|home\s*page|landing(?:\s+page)?|website|site|page)\b/i.test(t)
    && /\b(?:feels?\s+like|looks?\s+like|similar\s+to|inspired\s+by)\b/i.test(t)
    && !/\b(?:build\s+it|create\s+(?:it|the|files|project)|scaffold|go\s+build|on\s+disk|start\s+building|write\s+(?:the\s+)?code)\b/i.test(t)
  ) {
    return true;
  }
  // Layout sketch without a create command — nav / hero / bands / footer described.
  if (
    t.length >= 60
    && t.length < 1200
    && !/\b(?:build\s+it|create\s+(?:a\s+)?(?:new\s+)?(?:project|files)|scaffold|go\s+build|on\s+disk|start\s+building)\b/i.test(t)
    && /\b(?:nav|navigation|hero|footer)\b/i.test(t)
    && /\b(?:band|section|white\s+space|motion|cta|button)\b/i.test(t)
    && /\b(?:homepage|home\s*page|landing|apple\.com|product)\b/i.test(t)
  ) {
    return true;
  }

  // "…like Twitch/Discord…" plus a question mark → talk, not scaffold.
  if (
    /\b(?:app|website|site|platform)\b/i.test(t)
    && /\b(?:like|similar\s+to)\b/i.test(t)
    && (/\?/.test(t) || /\b(?:streaming|clone|inspired)\b/i.test(t))
    && !/\b(?:build|make)\s+me\b/i.test(t)
  ) {
    return true;
  }

  // Feature-sketch follow-ups: "yeah something like a little shelf you browse…"
  // Describe UX / constraints without an explicit build/create command → keep talking.
  if (
    t.length >= 24
    && t.length < 500
    && !/\b(?:build|create|scaffold|spin\s+up|make\s+me|on\s+disk|open\s+preview|start\s+building|write\s+(?:the\s+)?(?:code|files))\b/i.test(t)
    && (
      /^(?:yeah|yep|yes|exactly|right|ok|okay|sure|basically|kinda|kind\s+of|something\s+like)\b/i.test(t)
      || /\bsomething\s+like\b/i.test(t)
      || /\b(?:tap|browse|swipe|click)\b[\s\S]{0,40}\b(?:to|and)\b/i.test(t)
      || /\bno\s+(?:accounts?|payments?|login|sign[- ]?ups?|auth)\b/i.test(t)
    )
    && /\b(?:app|shelf|list|screen|page|browse|borrow|checkout|checked\s+out|lend|friends?|phone|tiny|simple)\b/i.test(t)
  ) {
    return true;
  }

  // Real-world problem + soft product sketch (no build/create command) → plan together.
  // e.g. "I organize farmers market stalls and keep losing track… think of a tiny phone page"
  if (
    t.length >= 40
    && t.length < 900
    && !/\b(?:build\s+it\s+now|scaffold|on\s+disk|open\s+preview|start\s+building|write\s+(?:the\s+)?(?:code|files)|make\s+me|spin\s+up)\b/i.test(t)
    && !/\b(?:create|scaffold)\s+(?:a\s+)?(?:new\s+)?(?:web\s+)?(?:app|application|project|website|site)\b/i.test(t)
    && (
      /\b(?:losing\s+track|keep\s+losing|hard\s+to\s+(?:track|keep\s+up)|can'?t\s+(?:keep|track)|forget(?:ting)?\s+who)\b/i.test(t)
      || /\b(?:organize|organising|organizing|manage|tracking)\b[\s\S]{0,80}\b(?:stalls?|vendors?|inventory|books?|gear|shelf|borrow)\b/i.test(t)
      || /\bthink\s+of\s+(?:a\s+)?(?:tiny|simple|small|little)\s+(?:phone\s+)?(?:page|app|screen)\b/i.test(t)
      || /\b(?:phone[- ]?friendly|mobile[- ]?first|tiny\s+phone)\b/i.test(t)
    )
    && (
      /\b(?:page|app|screen|list|stalls?|vendors?|market|phone|browse|track)\b/i.test(t)
      || /\b(?:sage|cream|terracotta|soft\s+\w+)\b/i.test(t)
    )
  ) {
    return true;
  }

  // Feasibility / honesty checks — talk only, even if they say "build".
  // e.g. "is that actually possible to build as a first version?"
  if (
    /\?/i.test(t)
    && (
      /\b(?:is\s+(?:that|this|it)\s+actually\s+possible)\b/i.test(t)
      || /\b(?:will\s+(?:that|this|it)\s+(?:really\s+)?work)\b/i.test(t)
      || /\b(?:how\s+long\s+(?:would|will|does)\s+(?:a\s+)?(?:first|useful)?\s*(?:version|v1)?\s*take)\b/i.test(t)
      || /\b(?:roughly\s+how\s+long|feasible|feasibility)\b/i.test(t)
      || /\bpossible\s+to\s+build\b/i.test(t)
    )
  ) {
    return true;
  }

  return false;
}

/** Planning-only turn. discuss sequence and features; no files, deps, or folders. */
export function wantsPlanningOnly(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (wantsClarifyBeforeCreate(t)) return true;
  if (looksLikeRequirementsAsk(t)) return true;
  if (/\bhelp\s+me\s+plan\b/i.test(t)) return true;
  if (/\bplanning\s+only\b/i.test(t)) return true;
  if (/\b(?:just|only)\s+(?:plan(?:ning)?|talk|discuss)\b/i.test(t) && !/\b(?:do\s+not|don't|dont|not)\s+only\s+plan\b/i.test(t)) return true;
  if (/\bno\s+scaffol/i.test(t)) return true;
  if (/\b(?:don't|do\s+not)\s+build\s+yet\b/i.test(t)) return true;
  if (/\bbefore\s+i\s+write\s+code\b/i.test(t)) return true;
  if (/\bstill\s+planning\s+only\b/i.test(t)) return true;
  if (/\bwhat\s+should\s+i\s+build\s+first\b/i.test(t) && /\b(?:order|sequence|plan|mvp)\b/i.test(t)) return true;
  return false;
}

function wantsSoftwareProduct(text: string): boolean {
  return /\b(app|application|website|site|web\s*app|software|saas|dashboard|react|vite|landing\s+page|mobile\s+app|habit\s+tracker|kanban|notes?\s+app)\b/i.test(text);
}

const WANT_APP_RE =
  /\bi\s+want\s+(?:a|an|to\s+(?:build|make|create)\s+(?:a|an)?)\s+[\s\S]{0,60}\b(?:app|application|desktop\s+app|website|site|project)\b/i;

const NEW_PRODUCT_RE =
  /\b(?:new|my|our)\s+(?:app|application|project|product|idea|system|platform|website|site|startup)\b/i;

const WORK_ON_NEW_PROJECT_RE =
  /\b(?:work\s+on|start\s+work(?:ing)?\s+on)\s+(?:a\s+)?(?:new\s+)?project\b/i;

const EXPLICIT_CREATE_RE =
  /\b(?:create|scaffold|spin\s+up)\s+(?:a\s+)?(?:new\s+)?(?:web\s+)?(?:app|application|project|website|site)\b/i;

function titleCaseWords(s: string): string {
  return s.replace(/\b\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function cleanIdeaName(raw: string): string | null {
  let s = String(raw || '').trim().replace(/[?.!,;:]+$/g, '');
  s = s.replace(/\s+(?:app|application|project|product|platform|website|site)\b.*$/i, '').trim();
  // Stop at clause joiners so "called BrassGate with a lineup…" → BrassGate.
  s = s.replace(/\s+(?:with|that|which|where|when|so|for|but|and|if|featuring|including|—|–|-)\b.*$/i, '').trim();
  if (s.length < 2 || s.length > 48) return null;
  if (/^(if|the|a|an)$/i.test(s)) return null;
  // Sentence fragments mistaken for names (“game can oyu help me”).
  if (/\b(?:help|please|can|oyu|want|would|like|build|create|make|start)\b/i.test(s)) return null;
  if (/\s/.test(s) && s.split(/\s+/).length >= 4) return null;
  const lower = s.toLowerCase();
  if (BLOCKED_NAME_WORDS.has(lower)) return null;
  const first = lower.split(/\s+/)[0];
  if (first && BLOCKED_NAME_WORDS.has(first)) return null;
  if (/^(this|the|that|a|an|new|my|our|game|fps)$/i.test(s)) return null;
  return s;
}

/** Guess a human project name when the user never said "called X". */
export function inferGreenfieldName(text: string): string | null {
  const t = String(text || '').trim();

  const coffee = t.match(/\b(?:coffee|copy)\s+shop\b/i);
  if (coffee) return 'Coffee Shop';

  // Never invent "Discord Site" — name must come from the user's brief.

  const shopFor = t.match(/\b(?:website|site|app)\s+for\s+(?:a\s+)?([a-z][a-z0-9 _-]{2,32})/i);
  if (shopFor?.[1]) {
    const cleaned = cleanIdeaName(shopFor[1]);
    if (cleaned) return titleCaseWords(cleaned);
  }

  const buildA = t.match(/\bbuild\s+(?:a\s+)?([a-z][a-z0-9 _-]{2,32})\s+(?:website|site|app|platform)\b/i);
  if (buildA?.[1]) {
    const cleaned = cleanIdeaName(buildA[1]);
    if (cleaned) return titleCaseWords(cleaned);
  }

  // Only for short product pitches — long design/ops briefs often mention booking/schedule/website
  // as features and must not become empty "Booking App" / "My Website" Recent titles.
  if (t.length <= 140) {
    if (/\b(?:coffee|copy)\s+shop\b/i.test(t)) return 'Coffee Shop';
    if (/\brestaurant\b/i.test(t)) return 'Restaurant App';
    if (/\b(?:e-?commerce|online\s+store)\b/i.test(t)) return 'Online Shop';
    if (/\b(?:booking|appointment)\s+(?:app|system|platform|product)\b/i.test(t)) return 'Booking App';
    if (/\b(?:build|create|make)\s+(?:a\s+)?(?:booking|appointment)\b/i.test(t)) return 'Booking App';
    if (/\b(?:build|create|make)\s+(?:a\s+)?website\b/i.test(t)) return 'My Website';
    if (/\b(?:build|create|make)\s+(?:a\s+)?web\s*app\b/i.test(t)) return 'My Web App';
    if (/\bfps\b/i.test(t) || /\bfirst[\s-]?person\s+shooter\b/i.test(t)) {
      return extractGreenfieldName(t) || 'FPS Arena';
    }
    if (/\b(?:build|create|make)\s+(?:a\s+)?(?:browser\s+)?game\b/i.test(t)) return 'Arcade Game';
  }

  return null;
}

export function extractGreenfieldName(text: string): string | null {
  const t = String(text || '').trim();
  const patterns = [
    /\b(?:called|named|name(?:d)?\s+it|call\s+it)\s+["“']([^"”']{2,48})["”']/i,
    // Multi-word product titles first ("Ring System") — single-token patterns used to stop at Ring.
    /\b(?:called|named|name(?:d)?\s+it|call\s+it)\s+([A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*){1,3})\b/,
    /\bname\s+it\s+([A-Za-z][A-Za-z0-9_-]{2,40})\b/i,
    /\b(?:called|named|name(?:d)?\s+it|call\s+it)\s+([A-Za-z][A-Za-z0-9_-]{2,40})\b/i,
    /\bname\s+it\s+something\s+like\s+([A-Za-z][A-Za-z0-9_-]{2,40})/i,
    /\bok\s+([A-Z][A-Za-z0-9]{2,40})\s+(?:sounds\s+good|is\s+fine|works)\b/,
    /\b([A-Z][A-Za-z0-9]{2,40})\s+(?:sounds\s+good|is\s+fine)\b/,
    /\bleaning\s+([A-Za-z][A-Za-z0-9_-]{1,40})\s+as\s+the\s+name\b/i,
    /\bas\s+the\s+name[,:]?\s+([A-Za-z][A-Za-z0-9_-]{1,40})\b/i,
    /\b(?:app|application)\s+named\s+["“']?([A-Za-z][A-Za-z0-9 _-]{1,40})/i,
    /\b(?:project|app|product|system)\s+(?:called|named)\s+["“']?([A-Za-z][A-Za-z0-9 _-]{1,40})/i,
    /\b(?:desktop\s+)?(?:app|application)\s+(?:called|named)\s+["“']?([A-Za-z][A-Za-z0-9 _-]{1,40})/i,
    /\bcreate\s+(?:a\s+)?(?:new\s+)?project\s+["“']?([A-Za-z][A-Za-z0-9 _-]{1,40})/i,
    /\bcreate\s+([A-Z][A-Za-z0-9]{1,40})\s*[—–\-:]/,
    /\bcreate\s+([A-Z][A-Za-z0-9]{1,40})\s+(?:as|restaurant|website|site|kanban|notes?|utility)\b/i,
    /\b(?:build|create|scaffold)\s+([A-Z][A-Za-z0-9]{1,40})\s+on\s+disk\b/,
    /\b(?:build|create|scaffold)\s+([A-Z][A-Za-z0-9]{1,40})\b(?=[\s\S]{0,80}\bon\s+disk\b)/,
    /\bi\s+want\s+to\s+(?:work\s+on|build|create|make)\s+(?:a\s+)?(?:project\s+)?(?:called\s+)([A-Za-z][A-Za-z0-9 _-]{2,40})/i,
    // "build Ring System" — keep Title Case multi-word names; do not treat System as a type noun.
    /\b(?:build|create|make)\s+([A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]+)+)\b/,
    /\b(?:build|create|make)\s+([A-Za-z][A-Za-z0-9 _-]{2,40})\s+(?:app|platform|product)\b/i,
    /\bbuild\s+([A-Z][A-Za-z0-9]{2,40})\s+(?:website|site|web\s*app)\b/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) {
      const cleaned = cleanIdeaName(m[1]);
      if (cleaned) return titleCaseWords(cleaned);
    }
  }
  return inferGreenfieldName(t);
}

function summarizeProblem(text: string, name: string): string {
  const t = String(text || '').trim();

  if (/\b(?:coffee|copy)\s+shop\b/i.test(t) || /\bpick\s+what\s+coffee\b/i.test(t)) {
    return 'Customers order coffee ahead, pick a pickup time, and get a text when it\'s ready — invent the product UI from this brief.';
  }
  if (/\bdiscord\b/i.test(t) && !/\bnot\s+discord\b/i.test(t)) {
    return 'A messaging product inspired by your brief — invent an original IA and UI (do not copy Discord chrome).';
  }
  if (wantsChatAppScaffold(t) || (/\b(chat|channel|dm|voice|screen\s+share)\b/i.test(t) && /\b(react|vite|app)\b/i.test(t) && !/\b(restaurant|menu|hero|booking|unsplash|budget|transaction|finance|ledger|invoice)\b/i.test(t))) {
    return 'A messaging / realtime app from your brief — original screens and flows, not a canned chat shell.';
  }
  if (/\b(budget|transaction|finance|ledger|invoice|expense|accounts?\s+page)\b/i.test(t)) {
    return 'A personal finance app. accounts, transactions, budgets, and a dashboard with local data only.';
  }
  if (/\b(restaurant|dining|cafe)\b/i.test(t) || (/\bmenu\b/i.test(t) && /\b(hero|booking|reserve|unsplash)\b/i.test(t))) {
    return 'A restaurant site. hero, menu, and a clear booking / reserve CTA with real photos.';
  }
  if (/\b(?:notes?|sticky)\b/i.test(t)) {
    return 'A sticky-notes style app. create, edit, and keep notes in one place.';
  }
  if (/\b(gallery|masonry|portfolio|photographer)\b/i.test(t)) {
    return 'A photography portfolio. black canvas, big logo, real image gallery, and About/Contact.';
  }
  if (/\b(door\s*bell|doorbell)\b/i.test(t) && /\b(notif|phone|alert|press)\b/i.test(t)) {
    return 'When someone presses the doorbell, the phone gets a notification.';
  }

  const basically = t.match(/\bbasically[,:]?\s+(.{20,200})/i);
  if (basically?.[1]) {
    const snippet = basically[1].trim().replace(/\s+/g, ' ');
    if (snippet.length > 20) return snippet.charAt(0).toUpperCase() + snippet.slice(1);
  }

  const likePeople = t.match(/\blike\s+people\s+can\s+(.{20,200})/i);
  if (likePeople?.[1]) {
    const snippet = likePeople[1].trim().replace(/\s+/g, ' ');
    return `People can ${snippet.charAt(0).toLowerCase()}${snippet.slice(1)}`;
  }

  return `You want to build **${name}**. I'll help you plan it step by step.`;
}

type MvpPlan = { steps: string[]; stackNote: string };

function mvpPlan(summary: string, kind: ProjectKind, name: string): MvpPlan {
  const t = summary.toLowerCase();

  if (/\b(?:coffee|copy)\s+shop\b/i.test(t) || (/\bcoffee\b/i.test(t) && /\b(?:order|schedule|pickup|ready)\b/i.test(t))) {
    return {
      steps: [
        '1. **Home page**. menu of drinks and a simple “order for pickup” button',
        '2. **Order screen**. customer picks a drink, chooses a pickup time, enters phone or email',
        '3. **“Ready” alert**. shop sees orders; customer gets a message when coffee is ready (start with email/SMS; phone app later)',
      ],
      stackNote: 'A modern website (React) you can open in a browser. works on phones too.',
    };
  }

  if (wantsChatAppScaffold(t) || (/\b(chat|channel|dm|voice|settings)\b/i.test(t) && /\b(react|vite|app)\b/i.test(t) && !/\b(restaurant|menu|hero|booking|unsplash|budget|transaction|finance|ledger|invoice)\b/i.test(t))) {
    return {
      steps: [
        '1. **Core screens**. invent the main areas from the brief (not a Discord/Slack clone shell)',
        '2. **Primary action**. working send / post / react state for the core loop',
        '3. **Polish**. unique visual language for THIS product; settings only if the brief asks',
      ],
      stackNote: 'React + Vite. scaffold when you say **Create project**.',
    };
  }

  if (/\b(budget|transaction|finance|ledger|invoice|expense)\b/i.test(t)) {
    return {
      steps: [
        '1. **App shell**. rail + pages for Dashboard, Accounts, Budgets, Settings',
        '2. **Ledger**. add/edit/delete transactions with localStorage persistence',
        '3. **Budgets + polish**. category progress bars, empty states, working modals (not placeholders)',
      ],
      stackNote: 'React + Vite finance UI. scaffold when you are ready to **Create project**.',
    };
  }

  if (/\b(kanban|drag[\s-]?and[\s-]?drop)\b/i.test(t) || (/\b(column|board)\b/i.test(t) && /\b(card|backlog|doing|review)\b/i.test(t))) {
    return {
      steps: [
        '1. **Board shell**. columns (Backlog → Doing → Review → Done) with dark original UI',
        '2. **Cards**. HTML5 drag-and-drop between columns; Add Card opens a real title/notes modal',
        '3. **Persist**. board state in localStorage; empty states and polish',
      ],
      stackNote: 'React + Vite kanban. scaffold when you are ready to **Create project**.',
    };
  }

  if (/\bdiscord\b/i.test(t) && !/\bnot\s+discord\b/i.test(t)) {
    return {
      steps: [
        '1. **Product IA**. invent screens from the brief — do not paste Discord chrome',
        '2. **Core loop**. working messaging / presence interactions the brief asks for',
        '3. **Polish**. unique brand look; deepen only what the user listed',
      ],
      stackNote: 'React web app built in your project files — original UI, no template pack.',
    };
  }

  if (/\b(restaurant|dining|cafe)\b/i.test(t) || (/\bmenu\b/i.test(t) && /\b(hero|booking|reserve|unsplash)\b/i.test(t))) {
    return {
      steps: [
        '1. **Primary flow**. search / browse / book / order — whatever THIS brief asks (one kitchen or many venues)',
        '2. **Working actions**. CTAs and forms that match the brief (not a canned coastal menu pack)',
        '3. **Finish**. unique brand look, honest empty states, Preview-ready UI',
      ],
      stackNote: 'Landing or marketplace from the brief. open **Preview** under chat when ready.',
    };
  }

  if (/\b(gallery|masonry|portfolio|photographer|photo\s+grid)\b/i.test(t)) {
    return {
      steps: [
        '1. **Black canvas + logo**. FrameLab-style header and Work / About / Contact nav',
        '2. **Photo gallery**. responsive grid with unique generative images for this brand',
        '3. **About blurb**. short story under the gallery, then polish spacing and mobile',
      ],
      stackNote: 'Static HTML/CSS/JS site. open index.html or localhost preview; images are unique per project.',
    };
  }

  if (/\b(cabin|rental|nest\s*stay|check\s+availability)\b/i.test(t)) {
    return {
      steps: [
        '1. **Hero**. full-bleed cabin photo, title, subtitle, CTA buttons',
        '2. **Cabin cards**. photo, name, nightly price, Book button for each listing',
        '3. **Polish**. footer and mobile layout',
      ],
      stackNote: 'Static HTML/CSS/JS landing page with your image URLs baked in.',
    };
  }

  if (/\b(gym|fitness|pulse\s*fit|hiit|yoga)\b/i.test(t)) {
    return {
      steps: [
        '1. **Hero**. dark gym photo, bold headline, Join a class CTA',
        '2. **Classes row**. three class cards with photos, names, and times',
        '3. **Schedule table**. fake weekly schedule under the cards',
      ],
      stackNote: 'Static HTML/CSS/JS fitness landing page.',
    };
  }

  if (/\b(door\s*bell|doorbell)\b/i.test(t) && /\b(notif|phone|alert|press)\b/i.test(t)) {
    return {
      steps: [
        '1. **Dashboard**. log when someone presses the doorbell',
        '2. **Phone alert**. text or push notification when it rings',
        '3. **Later**. mobile app, multiple users, camera feed',
      ],
      stackNote: 'Web app first; phone notifications added once the basics work.',
    };
  }

  if (/\bwebsite\b/i.test(t) && !prefersReactAppScaffold(summary) && kind === 'static-web') {
    return {
      steps: [
        '1. **Hero / first screen**. match the look and copy from your brief',
        '2. **Main sections**. cards, gallery, or menu you described (with real images if you gave URLs)',
        '3. **Polish**. nav, footer, and mobile layout',
      ],
      stackNote: 'Simple website pages. easy to open in a browser and update.',
    };
  }

  if (kind === 'python') {
    return {
      steps: [
        '1. **Small backend**. handles the main job (orders, data, etc.)',
        '2. **One API or script**. prove the core flow works',
        '3. **Connect a front-end** when the logic is solid',
      ],
      stackNote: 'Python on the server; website or app can plug in later.',
    };
  }

  return {
    steps: [
      `1. **First screen**. show what ${name} does in one glance`,
      '2. **Main flow**. let users do the core task (order, book, browse, etc.)',
      '3. **Notifications or accounts**. only after the happy path works',
    ],
    stackNote: 'Modern web app (React). runs in the browser on desktop and phone.',
  };
}

export function looksLikeGreenfieldIdea(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/\b(delete|remove|trash|wipe|get rid of)\b/i.test(t)) return false;
  // Vague "help me plan" openers. chat first, not instant My App template.
  if (
    wantsPlanningOnly(t)
    && t.length < 220
    && !FEATURE_DESC_RE.test(t)
    && !looksLikeProjectBuildAsk(t)
    && !extractGreenfieldName(t)
  ) {
    return false;
  }
  if (wantsPlanningOnly(t) && /\bbuild\s+something\b/i.test(t) && !FEATURE_DESC_RE.test(t)) {
    return false;
  }
  if (wantsClarifyBeforeCreate(t) && t.length < 220 && !FEATURE_DESC_RE.test(t) && !extractGreenfieldName(t)) return false;
  // Bound-folder rebuilds are edits, not greenfield creates.
  if (/\b(?:scrap|rebuild|redo|replace)\b/i.test(t) && /\b(?:same\s+folder|this\s+folder|this\s+project|this\s+same\s+folder|in\s+place|current\s+ui|do\s+not\s+create\s+a\s+new)\b/i.test(t)) {
    return false;
  }
  if (isNonSoftwareBuildAsk(t)) return false;
  if (/\b(?:add|create|make|write|put)\b[\s\S]{0,32}\bfiles?\b/i.test(t)
    && !/\b(?:web\s+)?(?:app|application|project|website|site)\b/i.test(t)) {
    return false;
  }
  if (EXPLICIT_CREATE_RE.test(t)) {
    // Short “create project X” → create path. Long briefs → plan with chips first.
    const rich = looksLikeLandingBrief(t) || t.length > 220;
    if (!rich) return false;
  }

  const name = extractGreenfieldName(t);
  const hasPlanAsk = HOW_START_RE.test(t);
  // Length alone must NOT turn every “I want to build…” into a software plan.
  const hasFeatures = FEATURE_DESC_RE.test(t)
    || (t.length > 80 && wantsSoftwareProduct(t) && (BUILD_IDEA_RE.test(t) || WANT_APP_RE.test(t)));
  const hasBuild = (
    (BUILD_IDEA_RE.test(t) && wantsSoftwareProduct(t))
    || NEW_PRODUCT_RE.test(t)
    || WORK_ON_NEW_PROJECT_RE.test(t)
    || WANT_APP_RE.test(t)
  );

  if (WORK_ON_NEW_PROJECT_RE.test(t) && (hasPlanAsk || hasFeatures)) return true;
  if (hasBuild && (hasPlanAsk || hasFeatures)) return true;
  if (hasPlanAsk && (hasBuild || NEW_PRODUCT_RE.test(t) || /\bproject\b/i.test(t) || /\bwebsite\b/i.test(t) || /\blanding\s+page\b/i.test(t))) return true;
  if (NEW_PRODUCT_RE.test(t) && (hasPlanAsk || hasFeatures)) return true;
  if (hasBuild && name) return true;
  // A named direct build ask is enough to establish a product intent even
  // when the user omits "app", "website", or another software noun.
  if (name && /\b(?:i\s+want\s+to\s+)?build\s+[A-Za-z]/i.test(t)) return true;
  if (WANT_APP_RE.test(t) && name) return true;
  if (name && WORK_ON_NEW_PROJECT_RE.test(t)) return true;
  if (name && /\bi\s+want\s+to\s+work\s+on\b/i.test(t) && !/\blet'?s\s+work\s+on\b/i.test(t)) return true;
  // Named product briefs asking for MVP / sequencing. plan, don't scaffold.
  if (name && /\b(?:mvp\s+order|what\s+should\s+i\s+build\s+first|week\s+one\s+look\s+like)\b/i.test(t)) return true;
  if (name && (/\b(dashboard|finance|kanban|restaurant|website|site|messaging|tracker|landing\s+page|festival|planner|grocery|meal[\s-]?prep)\b/i.test(t) || FEATURE_DESC_RE.test(t))) {
    return true;
  }
  // Named brief + help-me-plan / still-planning even without the word "build".
  if (name && hasPlanAsk) return true;
  if (name && wantsPlanningOnly(t) && t.length >= 80) return true;

  return false;
}

export function parseGreenfieldIdea(text: string): GreenfieldIdeaIntent | null {
  if (!looksLikeGreenfieldIdea(text)) return null;
  const t = String(text || '').trim();
  const name = extractGreenfieldName(t) || inferGreenfieldName(t) || 'My App';
  const rawKind = detectProjectKind(t);
  const kind = resolveProjectKindForCreate(t, rawKind, rawKind);
  return {
    name,
    slug: slugifyProjectName(name),
    kind,
    summary: t,
    problemLine: summarizeProblem(t, name),
  };
}

export function looksLikeGreenfieldCreateGo(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  return (
    /\bcreate\s+(?:project\s+)?["“']?[A-Za-z]/i.test(t)
    || /\b(?:yes|yeah|sure|ok(?:ay)?)[\s,]*create\b/i.test(t)
    // Stretch: requirements → “ok start.” / “okay, start building”
    || /\b(?:yes|yeah|sure|ok(?:ay)?)[\s,!.]*start(?:\s+building)?\b/i.test(t)
    || /\bscaffold\s+(?:project\s+)?["“']?[A-Za-z]/i.test(t)
    || /\bstart\s+building\b/i.test(t)
    || /\bbuild\s+it(?:\s+now)?\b/i.test(t)
    || looksLikeGreenfieldStartWorkGo(t)
  );
}

/** Explicit “create/build files now”. continue pending idea. Bare “start” does NOT count. */
export function looksLikeGreenfieldStartWorkGo(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/\blet'?s\s+work\s+on\s+[A-Za-z]/i.test(t)) return false;
  // Folder bind: "start working on Lyndsey". not create.
  if (/\bstart\s+work(?:ing)?\s+on\s+[A-Za-z][A-Za-z0-9_-]{1,40}\b/i.test(t)
    && !/\bstart\s+work(?:ing)?\s+on\s+(?:this|the|a|my|our)\s+project\b/i.test(t)) {
    return false;
  }
  if (/\b(?:don'?t|do\s+not|never)\s+(?:build|create|implement|scaffold)\b/i.test(t)
    || /\b(?:not\s+yet|just\s+plan|keep\s+planning)\b/i.test(t)) {
    return false;
  }
  return (
    /\bgo\s+ahead\s+and\s+(?:create|build|scaffold)\b/i.test(t)
    || /\b(?:lets?\s+build\s+(?:this|that|it)|build\s+this|build\s+that|build\s+it(?:\s+now)?|go\s+implement|go\s+build)\b/i.test(t)
    || /\blets?\s+start\s+building\b/i.test(t)
    || /\bstart\s+building(?:\s+the)?(?:\s+(?:game|app|project|site|ui|fps))?\b/i.test(t)
    || /\blets?\s+go(?:\s+ahead)?\s+and\s+(?:start\s+)?build\b/i.test(t)
    || /\bready\s+to\s+build(?:\s+this)?\b/i.test(t)
    || /\bcreate\s+(?:the\s+)?(?:files|project)\s+now\b/i.test(t)
    || /\b(?:stop\s+planning|done\s+planning|enough\s+planning|have\s+enough).{0,40}\b(?:build|create|implement)\b/i.test(t)
  );
}

export function looksLikeGreenfieldKeepPlanning(text: string): boolean {
  const t = String(text || '');
  // Require an explicit planning-continue signal — not bare “not yet” (too common in normal talk).
  return /\b(?:keep\s+planning|plan\s+only|more\s+planning|just\s+plan|add\s+more\s+features\s+to\s+the\s+plan|expand\s+the\s+plan|fold\s+(?:those|these|them|it)\s+into\s+the\s+plan|add\s+(?:those|these|them)\s+to\s+the\s+plan|update\s+the\s+plan)\b/i.test(t);
}

export function looksLikeGreenfieldHaveFolder(text: string): boolean {
  return /\b(?:i\s+)?(?:already\s+)?have\s+a\s+folder\b/i.test(String(text || ''));
}

export function greenfieldToCreateIntent(idea: GreenfieldIdeaIntent): GreenfieldCreatePayload {
  return {
    name: idea.name,
    slug: idea.slug,
    kind: idea.kind,
    summary: idea.summary,
    preferPlan: false,
  };
}

export function resolveGreenfieldFromThread(
  message: string,
  recentUserLines: string[],
  pending?: GreenfieldIdeaIntent | null,
): GreenfieldIdeaIntent | null {
  const direct = parseGreenfieldIdea(message);
  if (direct) return direct;

  if (looksLikeGreenfieldCreateGo(message) && pending) return pending;

  if (looksLikeGreenfieldCreateGo(message)) {
    const m = String(message || '').match(/\bcreate\s+(?:project\s+)?["“']?([A-Za-z][A-Za-z0-9 _-]{1,40})/i);
    if (m?.[1]) {
      const name = cleanIdeaName(m[1]);
      if (name) {
        return {
          name: titleCaseWords(name),
          slug: slugifyProjectName(name),
          kind: detectProjectKind(message),
          summary: message,
          problemLine: summarizeProblem(message, name),
        };
      }
    }
  }

  for (let i = recentUserLines.length - 1; i >= 0; i--) {
    const hit = parseGreenfieldIdea(recentUserLines[i]);
    if (hit) return hit;
  }

  if (pending && (looksLikeGreenfieldCreateGo(message) || /\b(?:go\s+implement|create\s+it|build\s+it)\b/i.test(message))) {
    return pending;
  }

  return pending && looksLikeGreenfieldCreateGo(message) ? pending : null;
}

/** Extract requirement bullets from a pasted brief so the plan echoes the user's ask. */
export function extractBriefBullets(text: string): string[] {
  const raw = String(text || '');
  const bullets: string[] = [];
  for (const line of raw.split(/\n/)) {
    const m = line.match(/^\s*(?:[-•*]|\d+[.)])\s+(.+)/);
    if (m?.[1]) {
      const item = m[1].trim();
      if (item.length > 8 && item.length < 180) bullets.push(item);
    }
  }
  const mustBlock = raw.match(/\bmust\s+include:?\s*([\s\S]*?)(?:\n\n|create\s+the\s+project|npm\s+install|$)/i);
  if (mustBlock?.[1]) {
    for (const line of mustBlock[1].split('\n')) {
      const item = line.replace(/^\s*[-•*]\s*/, '').trim();
      if (item.length > 10 && item.length < 180 && !bullets.includes(item)) bullets.push(item);
    }
  }
  return bullets.slice(0, 14);
}

/** Vague planning opener. questions only, no scaffold, no action chips. */
export function buildPlanningStarterReply(): string {
  return [
    'I can help you shape this before we touch any files.',
    '',
    'Best way to start is to lock the *job* of the first version: who opens it, what they do in one sitting, and what “done for today” looks like. I’ll handle the technical choices (privacy defaults, data storage, auth when it matters) — you don’t need to know that stuff.',
    '',
    'A few things that help me steer:',
    '- Who is this for, and what’s the one outcome they should get in a session?',
    '- Browser web app, or a phone-style app (overall iOS, overall Android, or a specific device like iPhone 16 / Galaxy S24)?',
    '- Calm and simple, or a little more playful?',
    '',
    'Tell me whatever you already know — even rough notes — and we’ll keep talking it through until you’re ready to build.',
  ].join('\n');
}

/** Conversational “how do I build / what stack”. chat freely, do not dump create chips. */
export function looksLikeConversationalPlanningAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/^create\s+project\s+[A-Za-z]/i.test(t) && t.length < 80) return false;
  if (/\b(?:go\s+build|go\s+implement|implement\s+it|build\s+it\s+now|lets?\s+build\s+(?:this|that|it)|build\s+this|build\s+that|create\s+(?:the\s+)?(?:files|project)\s+now)\b/i.test(t)) {
    return false;
  }
  if (looksLikeRequirementsAsk(t) || looksLikeTalkBeforeCreateAsk(t)) return true;
  // Create/build verb + product noun = create, not planning chat.
  // Exception: requirements / advice wording ("what do I need", "requirements").
  if (
    /\b(?:create|build|make|scaffold|spin\s+up|kick\s+off)\b/i.test(t)
    && /\b(?:website|site|web\s*app|react\s+app|app|application|project|page|landing|homepage)\b/i.test(t)
    && !/\b(?:how\s+(?:do|can|should|would)|what\s+(?:do|should|would|will|stack|are)|need|requirements?|are\s+you\s+familiar|do\s+you\s+know|i\s+want\s+to|plan\s+only|don'?t\s+build\s+yet)\b/i.test(t)
  ) {
    return false;
  }
  // Bound-folder polish: keep/continue building is an edit ask, not planning-only.
  if (/^(?:keep\s+building|continue\s+building|keep\s+going|continue\s+(?:going|polish(?:ing)?))\s*[.!]?$/i.test(t)) {
    return false;
  }
  if (/\b(?:keep\s+building|continue\s+building)\b/i.test(t) && t.split(/\s+/).length <= 8
    && !/\b(?:from\s+scratch|rebuild|scrap|new\s+project)\b/i.test(t)) {
    return false;
  }
  // Explicit disk build asks are never “just talking”.
  if (/\bon\s+disk\b/i.test(t) && /\b(?:build|create|scaffold|make)\b/i.test(t)) return false;
  if (/\bopen\s+preview\b/i.test(t) && /\b(?:build|create|make)\b/i.test(t)) return false;
  if (/\bcreate\s+(?:a\s+)?(?:brand[- ]?new\s+)?project\b/i.test(t)) return false;
  if (/\bgo\s+ahead(?:\s+and)?\s+(?:start\s+)?(?:building|build|implement|create|scaffold)\b/i.test(t)) return false;
  if (/\bcreate\s+(?:the\s+)?files\b/i.test(t) && /\b(?:now|please|desktop)\b/i.test(t)) return false;
  if (wantsPlanningOnly(t)) return true;
  // Timeline / worth-it follow-ups are normal Q&A — not a reason to inject “planning only” framing.
  if (looksLikeDirectJudgmentAsk(t)) return false;
  if (/\bfirst\s+usable\s+version\b/i.test(t) || /\bkeep\s+scope\s+tiny\b/i.test(t)) return true;
  if (/\bhow\s+(?:do|can|should|would)\b/i.test(t)) return true;
  if (/\bwhat\s+(?:do|should|would|type|stack|software|framework|language|code|kind)\b/i.test(t)) return true;
  if (/\b(?:get\s+started|where\s+(?:should|do)\s+(?:i|we)\s+(?:begin|start)|how\s+to\s+(?:begin|approach))\b/i.test(t)) return true;
  if (/\bhelp\s+me\s+(?:figure|understand|think|plan|decide)\b/i.test(t)) return true;
  // “Help me build a coffee shop web” with a product noun = create (handled above). Remaining help-me-build without a noun stays planning.
  if (
    /\bhelp\s+me\s+(?:to\s+)?(?:build|make|create)\b/i.test(t)
    && !/\b(?:website|site|web\s*app|app|project|page|landing)\b/i.test(t)
    && !/\b(?:create\s+(?:the\s+)?(?:files|project)|scaffold|lets?\s+build\s+this|build\s+it\s+now)\b/i.test(t)
  ) {
    return true;
  }
  if (/\bdoes\s+(?:it|this)\s+need\b/i.test(t)) return true;
  if (/\bshould\s+(?:i|we)\s+use\b/i.test(t)) return true;
  if (/\b(?:would|will)\s+(?:something|this|it)\b.{0,40}\b(?:run|work|feel)\b/i.test(t)) return true;
  if (/\b(?:github|open[- ]source|starter|template|reference|inspiration|mood\s*board)\b/i.test(t)
    && /\b(?:repo|site|sites|faster|help|peek|look|worth|use)\b/i.test(t)) return true;
  if (/\bnot\s+(?:building|creating|ready)\s+yet\b/i.test(t) || /\bjust\s+(?:figuring|talking|planning|wondering)\b/i.test(t)) return true;
  if (/\bstill\s+just\s+(?:planning|talking|discussing)\b/i.test(t)) return true;
  // Bare “more details / tell me more” is a normal follow-up, not a product-planning turn.
  // Those only stay in planning when a greenfield brief is already pending (see shouldInjectPlanningConversation).
  if (/\bi(?:'m| am)\s+(?:building|thinking\s+about|planning|working\s+on)\b/i.test(t)
    && !/\bcreate\s+(?:the\s+)?(?:files|project)\b/i.test(t)) return true;
  if (/\bbuilding\s+(?:a|an|my)\b/i.test(t) && /\b(?:app|website|site|tool|game)\b/i.test(t)
    && !/\b(?:create\s+project|scaffold|files\s+now)\b/i.test(t)) return true;
  return false;
}

/** Short “more details / tell me more” with no product words. */
export function isBarePlanningFollowUp(text: string): boolean {
  const content = String(text || '').trim();
  if (!content || content.length >= 100) return false;
  if (!/\b(?:more\s+details?|tell\s+me\s+more|expand\s+on|give\s+me\s+more)\b/i.test(content)) return false;
  return !/\b(?:app|application|website|site|product|project|mvp|stack)\b/i.test(content);
}

/**
 * When true, Chat injects planningConversationHint (product-plan framing).
 * Bare teach-me / more-details follow-ups must stay normal chat unless a greenfield brief is pending.
 */
export function looksLikeDirectJudgmentAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/\b(?:is\s+it\s+worth|worth\s+(?:it|building|making|doing)|should\s+(?:i|we)\s+(?:build|make|pursue))\b/i.test(t)) {
    return true;
  }
  if (/\bhow\s+(?:fast|quick|long|soon)\b/i.test(t)
    && /\b(?:up\s+and\s+running|get\s+(?:this|it)|ship|launch|beta|mvp|finish|done)\b/i.test(t)) {
    return true;
  }
  if (/\bhow\s+(?:fast|quick|long|soon)\b.{0,40}\b(?:think|estimate|take)\b/i.test(t)) return true;
  return false;
}

export function shouldInjectPlanningConversation(
  content: string,
  opts?: { pendingIdea?: boolean; diskRoot?: string | null },
): boolean {
  // Bound project: never wrap replies in planning framing after a real create.
  if (opts?.diskRoot && String(opts.diskRoot).trim()) return false;
  if (looksLikeImplementGo(content)) return false;
  if (looksLikeDirectJudgmentAsk(content)) return false;
  // Bare continue — recommend next polish; never treat as a full rebuild trigger.
  if (
    /^(?:keep\s+building|continue\s+building|keep\s+going|continue\s+(?:going|polish(?:ing)?))\s*[.!]?$/i.test(String(content || '').trim())
    || (/\b(?:keep\s+building|continue\s+building)\b/i.test(content) && String(content || '').trim().split(/\s+/).length <= 8
      && !/\b(?:from\s+scratch|rebuild|scrap|new\s+project)\b/i.test(content))
  ) {
    return true;
  }
  // Bound UI / copy edits are never “planning only” — apply on disk.
  if (
    /\b(?:change|update|set|rename|edit|make)\b[\s\S]{0,100}\b(?:hero|headline|heading|title|h1|button|text|label|copy|wording|background|color)\b/i.test(content)
  ) {
    return false;
  }
  const pending = Boolean(opts?.pendingIdea);
  const bare = isBarePlanningFollowUp(content);
  if (looksLikeGreenfieldIdea(content) || wantsPlanningOnly(content)) return true;
  if (pending && (looksLikeConversationalPlanningAsk(content) || bare)) return true;
  if (looksLikeConversationalPlanningAsk(content) && !bare) return true;
  return false;
}

export function buildGreenfieldPlanReply(idea: GreenfieldIdeaIntent): string {
  const plan = mvpPlan(idea.summary, idea.kind, idea.name);
  const fromBrief = extractBriefBullets(idea.summary);

  return [
    `**${idea.name}**. here’s a simple way to think about it.`,
    '',
    idea.problemLine,
    '',
    fromBrief.length >= 2
      ? [
        '**From what you described:**',
        ...fromBrief.map(b => `- ${b}`),
        '',
      ].join('\n')
      : '',
    '**A sensible order:**',
    ...plan.steps,
    '',
    `**Likely stack:** ${plan.stackNote}`,
    '',
    'We can keep talking. ask about features, stack, or MVP order.',
    'When you want files on disk, say **lets build this**.',
  ].filter(Boolean).join('\n');
}

/** Chip: Keep planning. deepen the plan each time (never repeat the same blob). */
function isFinanceBrief(text: string): boolean {
  return /\b(budget|transaction|finance|ledger|invoice|expense|accounts?\s+page|vaultbean|spend\s+chart|bill\s+reminder)\b/i.test(String(text || ''));
}

function isKanbanBrief(text: string): boolean {
  return /\b(kanban|backlog|drag[\s-]?and[\s-]?drop|taskrail)\b/i.test(String(text || ''))
    || (/\b(column|board)\b/i.test(String(text || '')) && /\b(card|doing|review|done)\b/i.test(String(text || '')));
}

function isChatAppBrief(text: string): boolean {
  const t = String(text || '');
  return prefersReactAppScaffold(t)
    && !isFinanceBrief(t)
    && !isKanbanBrief(t)
    && (/\b(discord|channel|dm|voice|messaging|chat\s+app|command\s+palette)\b/i.test(t) || wantsChatAppScaffold(t));
}

export function detectPlanFocus(ask: string, brief?: string): string {
  const t = String(ask || '').toLowerCase();
  const ctx = `${brief || ''} ${ask}`.toLowerCase();

  if (isFinanceBrief(ctx)) {
    if (/\b(bill|reminder|recurring)\b/.test(t)) return 'bills';
    if (/\b(chart|report|spend|analytics)\b/.test(t)) return 'reports';
    if (/\b(budget|category|progress)\b/.test(t)) return 'budgets';
    if (/\b(transaction|ledger|account)\b/.test(t)) return 'ledger';
    if (/\bkeep\s+planning\b/i.test(t) || /\badd\s+more\s+features\b/i.test(t) || /\b(?:also|plus)\s+add\b/.test(t)) {
      return /\b(chart|report|bill|reminder)\b/.test(t) ? (/\b(chart|report)\b/.test(t) ? 'reports' : 'bills') : 'dashboard';
    }
    return 'dashboard';
  }

  if (isKanbanBrief(ctx)) {
    if (/\b(drag|drop|column|card|modal)\b/.test(t)) return 'board';
    if (/\b(localstorage|persist|save)\b/.test(t)) return 'persist';
    if (/\bkeep\s+planning\b/i.test(t) || /\badd\s+more\s+features\b/i.test(t)) return 'board';
    return 'board';
  }

  const isApp = isChatAppBrief(brief || ask);

  if (isApp) {
    if (/\b(settings|appearance|account|privacy|notifications|keybinds|voice\s*&\s*video)\b/.test(t)) return 'settings';
    if (/\b(call|voice|screen\s*share|mute|deafen|webrtc)\b/.test(t)) return 'voice';
    if (/\b(dm|direct\s+message|message|chat|channel|friend)\b/.test(t)) return 'chat';
    if (/\b(sidebar|rail|server|member|ui|layout|main)\b/.test(t)) return 'ui';
    if (/\bkeep\s+planning\b/i.test(t) || /\badd\s+more\s+features\b/i.test(t)) return 'chat';
    return 'chat';
  }

  if (/\b(gallery|masonry|photo|portfolio|grid)\b/.test(t)) return 'gallery';
  if (/\b(menu|dish|food|card)\b/.test(t)) return 'menu';
  if (/\b(hero|headline|cta|landing)\b/.test(t)) return 'hero';
  if (/\b(nav|header|footer|about|contact)\b/.test(t)) return 'chrome';
  if (/\b(schedule|class|booking|cabin)\b/.test(t)) return 'booking';
  if (/\b(ui|layout|section|main)\b/.test(t)) return 'ui';
  return 'general';
}

/** One new section to append. never re-lists the base plan. */
export function buildPlanExpansionSection(
  idea: GreenfieldIdeaIntent,
  focus: string,
  depth: number,
): string {
  const brief = idea.summary;
  const hasImages = /unsplash|https?:\/\//i.test(brief);
  const financeBrief = isFinanceBrief(brief);
  const kanbanBrief = isKanbanBrief(brief);
  const isApp = isChatAppBrief(brief);
  const lines: string[] = [];

  if (financeBrief && (focus === 'dashboard' || focus === 'ledger' || focus === 'budgets' || focus === 'bills' || focus === 'reports' || focus === 'general')) {
    if (focus === 'bills' || (focus === 'general' && /\bbill\b/i.test(brief))) {
      lines.push(`**+ Recurring bills & reminders** (pass ${depth})`);
      lines.push(
        '- Bills list: name, amount, due day, category',
        '- Upcoming-due strip on Dashboard (next 7 days)',
        '- Mark paid + optional reminder toggle (localStorage only)',
        depth > 1 ? '- Snooze / skip one cycle without deleting the bill' : '- Empty state when no bills yet',
      );
    } else if (focus === 'reports' || /\b(chart|report|spend)\b/i.test(brief)) {
      lines.push(`**+ Reports & charts** (pass ${depth})`);
      lines.push(
        '- Monthly spend chart (bar or line) from transaction totals',
        '- Category breakdown for the selected month',
        '- Summary row: income vs spend vs net',
        depth > 1 ? '- Export CSV stub (UI-only is fine for v1)' : '- Month picker to scrub the chart',
      );
    } else if (focus === 'budgets') {
      lines.push(`**+ Budgets** (pass ${depth})`);
      lines.push(
        '- Category budgets with progress bars',
        '- Over-budget warning color on the bar',
        '- Edit budget modal with amount + category',
        '- Empty state + “Add budget” CTA',
      );
    } else if (focus === 'ledger') {
      lines.push(`**+ Ledger / transactions** (pass ${depth})`);
      lines.push(
        '- Add / edit / delete transactions modal',
        '- Category tags + date picker',
        '- Filter by account and category',
        '- Persist everything in localStorage',
      );
    } else {
      lines.push(`**+ Dashboard shell** (pass ${depth})`);
      lines.push(
        '- Left rail: Dashboard, Accounts, Budgets, Reports, Settings',
        '- Top summary cards: balance, monthly spend, budget health',
        '- Recent transactions table (last 10)',
        depth > 1 ? '- Dark theme tokens + empty states on every page' : '- Account switcher stub in the header',
      );
    }
  } else if (kanbanBrief && (focus === 'board' || focus === 'persist' || focus === 'general')) {
    if (focus === 'persist') {
      lines.push(`**+ Persist & polish** (pass ${depth})`);
      lines.push(
        '- Save board + cards to localStorage on every change',
        '- Reload state on refresh',
        '- Empty column hints (“Drop cards here” / “Add a card”)',
        '- Column rename stub (optional for v1)',
      );
    } else {
      lines.push(`**+ Board & cards** (pass ${depth})`);
      lines.push(
        '- Columns: Backlog → Doing → Review → Done',
        '- HTML5 drag-and-drop between columns',
        '- Add Card modal: title + notes',
        depth > 1 ? '- Card count badges on column headers' : '- Delete card with confirm',
      );
    }
  } else if (isApp && (focus === 'ui' || focus === 'chat')) {
    lines.push(`**+ Main product UI** (pass ${depth})`);
    lines.push(
      '- Invent the primary screens from the user brief — do not copy Discord/Slack chrome',
      '- Working navigation between the main areas the brief describes',
      '- Real interactive state for the core action (send, book, add, toggle, etc.)',
      '- Unique visual language for THIS product — not a prior Nova demo shell',
    );
  } else if (isApp && focus === 'settings') {
    lines.push(`**+ Settings** (pass ${depth})`);
    lines.push(
      '- Settings only if the brief asks — tabs that match the product',
      '- Appearance controls that update CSS vars live when relevant',
      '- Persist toggles in localStorage when the brief needs saved prefs',
    );
  } else if (isApp && focus === 'voice') {
    lines.push(`**+ Voice / call UI** (pass ${depth})`);
    lines.push(
      '- Only if the brief asks for voice/call: mute, disconnect, participant tiles',
      '- Fake connected state is fine for v1 — keep it original to this product',
    );
  } else if (focus === 'gallery' || focus === 'ui') {
    lines.push(`**+ Main UI** (pass ${depth})`);
    lines.push(
      '- Structure and sections taken from the user brief only',
      '- Brand wordmark + clear primary action',
      '- Unique layout — not a canned gallery/portfolio template',
      '- Use images the user provided; otherwise leave honest image slots',
    );
  } else if (focus === 'menu') {
    lines.push(`**+ Menu / catalog** (pass ${depth})`);
    if (depth <= 1) {
      lines.push(
        '- Build the menu/catalog the brief describes (not a fixed coastal bistro pack)',
        '- Search/filter if the brief asks to browse many items or places',
        '- Primary CTA matching the brief (book, order, reserve, etc.)',
        '- Original copy and layout for THIS brand',
      );
    } else {
      lines.push(
        '- Group items the way the brief implies',
        '- Hours/location only if asked',
        '- Mobile-friendly primary action',
      );
    }
  } else if (focus === 'hero') {
    lines.push(`**+ Hero** (pass ${depth})`);
    lines.push(
      '- Full-bleed background image from your brief',
      '- Brand name + one strong headline + one supporting line',
      '- Primary + secondary CTA buttons',
      depth > 1 ? '- Subtle scroll indicator and darker gradient for text contrast' : '- Keep CTAs large and centered',
    );
  } else if (focus === 'booking' || focus === 'chrome') {
    lines.push(`**+ ${focus === 'booking' ? 'Booking / schedule' : 'Nav / footer'}** (pass ${depth})`);
    lines.push(
      '- Clear nav and footer so the site feels finished',
      '- Booking / schedule section if your brief asked for times or cabins',
      '- Contact line (email or phone) even if fake for now',
      '- Mobile spacing pass so nothing feels cramped',
    );
  } else if (isApp && depth === 1) {
    lines.push(`**+ Deeper plan** (pass ${depth})`);
    lines.push(
      '- React + Vite file layout (`src/App.jsx` + App.css)',
      '- Screens and controls named for THIS brief',
      '- Local demo state only when the brief needs it',
      '- npm run dev → **Live** under chat',
    );
  } else if (isApp && depth >= 2) {
    lines.push(`**+ Deeper plan** (pass ${depth})`);
    lines.push(
      '- Split UI into components named for THIS product’s screens (from the brief)',
      '- State for the primary flows the brief describes',
      '- Polish spacing, typography, and hover/focus states',
      '- Ready to create — real files, original UI',
    );
  } else if (depth === 1) {
    lines.push(`**+ Deeper plan** (pass ${depth})`);
    lines.push(
      '- Match colors and mood from your brief (dark / neon / warm)',
      hasImages ? '- Use every image URL you pasted. no blank cards' : '- Gather 3–6 images for the main sections',
      '- One clear CTA above the fold',
      '- Polish spacing so the first screen feels intentional',
    );
  } else if (depth === 2) {
    lines.push(`**+ Deeper plan** (pass ${depth})`);
    lines.push(
      '- Section order locked to your brief (hero → main content → about/footer)',
      '- Interactive bits: buttons, hover states, smooth scroll for nav',
      '- Content checklist: title, subtitle, CTAs, cards/gallery, about',
      '- Preview path: use Preview under the chat box once created',
    );
  } else {
    lines.push(`**+ Deeper plan** (pass ${depth})`);
    lines.push(
      '- Accessibility and SEO basics (title, alt text, headings)',
      '- Performance: compress hero, lazy images',
      '- Stretch: simple booking form or newsletter field (can stay UI-only)',
      '- You’re ready. Create project when you want files on disk',
    );
  }

  return lines.join('\n');
}

export function buildKeepPlanningReply(
  idea: GreenfieldIdeaIntent,
  opts?: {
    depth?: number;
    ask?: string;
    focus?: string;
    /** Prior accumulated sections (already includes everything before this pass). */
    planLog?: string[];
    /** The newest section for this pass (appended after planLog). */
    newSection?: string;
  },
): string {
  const depth = Math.max(1, opts?.depth ?? 1);
  const focus = opts?.focus || detectPlanFocus(opts?.ask || '', idea.summary);
  const plan = mvpPlan(idea.summary, idea.kind, idea.name);
  const prior = Array.isArray(opts?.planLog) ? opts!.planLog!.filter(Boolean) : [];
  const newest = String(opts?.newSection || '').trim()
    || buildPlanExpansionSection(idea, focus, depth);
  // If caller already appended newest into planLog, don't double it
  const accumulated = prior.length && prior[prior.length - 1] === newest
    ? prior
    : [...prior, newest];

  const body = [
    `Still planning **${idea.name}**. pass **${depth}** (keeping everything so far, then adding more).`,
    '',
    idea.problemLine,
    '',
    '**Base plan:**',
    ...plan.steps,
    '',
    '**Built so far (all passes):**',
    ...accumulated.flatMap((block, i) => (i === 0 ? [block] : ['', block])),
    '',
    depth < 4
      ? 'Ask another question anytime. we can keep refining in chat. When you want real files, say **lets build this**.'
      : 'Plan is deep. Say **lets build this** when you want files on disk, or keep asking questions.',
  ].join('\n');

  return body;
}

export function buildMissingWorkFolderReply(wantName: string): string {
  return [
    `No folder named **${wantName}** on Desktop or Desktop\\Projects.`,
    '',
    `Want me to create it as a **new project**? Say **Create project ${wantName}**.`,
    '',
    'Or name an existing folder: *Let’s work on MyApp*.',
  ].join('\n');
}
