/**
 * Greenfield product ideas — plan + optional create (not "Which project folder? DeBloat").
 */

import { slugifyProjectName } from './projectNames';

export type ProjectKind = 'static-web' | 'vite-react' | 'python' | 'node-cli' | 'unknown';

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

function detectProjectKind(text: string): ProjectKind {
  const t = String(text || '').toLowerCase();
  if (/\b(python|flask|fastapi|trading\s+bot|pip|\.py)\b/.test(t)) return 'python';
  if (/\b(html|landing\s+page|simple\s+site|static\s+site|plain\s+html)\b/.test(t)) return 'static-web';
  if (/\b(node\s+cli|command\s+line\s+tool|cli\s+tool)\b/.test(t)) return 'node-cli';
  if (/\b(react|vite|next|web\s+app|website|site|electron|discord|call|chat|mobile|phone|notify|notification)\b/.test(t)) {
    return 'vite-react';
  }
  return 'vite-react';
}

const HOW_START_RE =
  /\b(?:how\s+(?:should|do|can|would)\s+i\s+(?:start|begin)|best\s+way\s+to\s+(?:start|begin)|where\s+(?:should|do)\s+i\s+start|what\s+do\s+you\s+think|help\s+me\s+(?:plan|start|figure)|what(?:'s| is)\s+(?:the\s+)?(?:best|good)\s+(?:way|approach)|how\s+(?:would|do)\s+(?:you|we)\s+(?:start|build|approach))\b/i;

const FEATURE_DESC_RE =
  /\b(?:when\s+(?:people|users|someone|they)|so\s+(?:that|when)|that\s+(?:lets|allows|sends|notifies|connects|tracks|shows|records)|idea\s+is\s+to|basically|like\s+a|similar\s+to|—|–)\b/i;

const BUILD_IDEA_RE =
  /\b(?:i\s+)?(?:want\s+to\s+)?(?:build|create|make|design|develop|start)\b/i;

const NEW_PRODUCT_RE =
  /\b(?:new|my)\s+(?:app|application|project|product|idea|system|platform|website|site|startup)\b/i;

const WORK_ON_NEW_PROJECT_RE =
  /\b(?:work\s+on|start\s+work(?:ing)?\s+on)\s+(?:a\s+)?(?:new\s+)?project\b/i;

const EXPLICIT_CREATE_RE =
  /\b(?:create|scaffold|spin\s+up)\s+(?:a\s+)?(?:new\s+)?(?:web\s+)?(?:app|application|project|website|site)\b/i;

function cleanIdeaName(raw: string): string | null {
  let s = String(raw || '').trim().replace(/[?.!,;:]+$/g, '');
  s = s.replace(/\s+(?:app|application|project|product|platform|website|site)\b.*$/i, '').trim();
  s = s.replace(/\s+(?:that|which|where|when|so|—|–|-)\b.*$/i, '').trim();
  if (s.length < 2 || s.length > 48) return null;
  if (/^(this|the|that|a|an|new|my)$/i.test(s)) return null;
  return s;
}

export function extractGreenfieldName(text: string): string | null {
  const t = String(text || '').trim();
  const patterns = [
    /\b(?:called|named|name(?:d)?\s+it|call\s+it)\s+["“']([^"”']{2,48})["”']/i,
    /\b(?:called|named|name(?:d)?\s+it|call\s+it)\s+([A-Za-z][A-Za-z0-9 _-]{1,40})/i,
    /\b(?:project|app|product|system)\s+(?:called|named)\s+["“']?([A-Za-z][A-Za-z0-9 _-]{1,40})/i,
    /\bi\s+want\s+to\s+(?:work\s+on|build|create|make)\s+([A-Za-z][A-Za-z0-9 _-]{1,40})/i,
    /\b(?:build|create|make|design|develop|start)\s+(?:a\s+)?(?:new\s+)?([A-Za-z][A-Za-z0-9 _-]{2,40})(?:\s*[—–-]|\s+that\b|\s+when\b|\s+so\b|\s*$)/i,
    /\b(?:build|create|make)\s+([A-Za-z][A-Za-z0-9 _-]{2,40})\s+(?:app|system|platform|product)\b/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) {
      const cleaned = cleanIdeaName(m[1]);
      if (cleaned) return cleaned;
    }
  }
  return null;
}

function summarizeProblem(text: string, name: string): string {
  const t = String(text || '').trim();
  if (/\b(door\s*bell|doorbell|ring)\b/i.test(t) && /\b(notif|phone|alert|press)\b/i.test(t)) {
    return 'When someone presses the doorbell, the phone should get a notification — a smart-doorbell MVP.';
  }
  const dash = t.match(/[—–]\s*(.{12,180})/);
  if (dash?.[1]) return dash[1].trim();
  const basically = t.match(/\bbasically[,:]?\s+(.{20,180})/i);
  if (basically?.[1]) return basically[1].trim().replace(/\s+/g, ' ');
  const likeA = t.match(/\bit'?s like a\s+(.{20,160})/i);
  if (likeA?.[1]) return likeA[1].trim().replace(/\s+/g, ' ');
  return `A new product idea: **${name}**.`;
}

function mvpSteps(summary: string, kind: ProjectKind): string[] {
  const t = summary.toLowerCase();
  if (/\b(doorbell|door\s+bell|ring|notify|notification|push|phone|alert)\b/.test(t)) {
    return [
      '1. **MVP scope:** log doorbell presses + show them in a simple dashboard',
      '2. **Next:** add phone push (FCM/APNs) or SMS/email alert',
      '3. **Later:** mobile app, device pairing, multi-user homes',
    ];
  }
  if (kind === 'python') {
    return [
      '1. Scaffold a small Python service + README',
      '2. One working endpoint or script for the core loop',
      '3. Add tests + install deps when the folder exists',
    ];
  }
  if (kind === 'static-web') {
    return [
      '1. Landing page + one interactive screen for the core flow',
      '2. Wire basic UI state (no backend yet if you can fake it)',
      '3. Add API/backend once the UI story is clear',
    ];
  }
  return [
    '1. Scaffold a Vite + React app with README',
    '2. Build one screen that proves the core user flow',
    '3. Add backend / notifications / auth after the MVP works locally',
  ];
}

export function looksLikeGreenfieldIdea(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/\b(delete|remove|trash|wipe|get rid of)\b/i.test(t)) return false;
  if (/\b(?:add|create|make|write|put)\b[\s\S]{0,32}\bfiles?\b/i.test(t)
    && !/\b(?:web\s+)?(?:app|application|project|website|site)\b/i.test(t)) {
    return false;
  }
  if (EXPLICIT_CREATE_RE.test(t)) return false;

  const name = extractGreenfieldName(t);
  const hasPlanAsk = HOW_START_RE.test(t);
  const hasFeatures = FEATURE_DESC_RE.test(t) || (t.length > 100 && BUILD_IDEA_RE.test(t));
  const hasBuild = BUILD_IDEA_RE.test(t) || NEW_PRODUCT_RE.test(t) || WORK_ON_NEW_PROJECT_RE.test(t);

  if (WORK_ON_NEW_PROJECT_RE.test(t) && name && (hasPlanAsk || hasFeatures)) return true;
  if (hasBuild && name && (hasPlanAsk || hasFeatures)) return true;
  if (hasPlanAsk && name && (hasBuild || NEW_PRODUCT_RE.test(t) || /\bproject\b/i.test(t))) return true;
  if (NEW_PRODUCT_RE.test(t) && (hasPlanAsk || hasFeatures)) return true;
  // Short "I want to build Ring System" / "call it X" — still a new product, not an existing folder.
  if (hasBuild && name) return true;
  if (name && WORK_ON_NEW_PROJECT_RE.test(t)) return true;
  if (name && /\bi\s+want\s+to\s+work\s+on\b/i.test(t) && !/\blet'?s\s+work\s+on\b/i.test(t)) return true;

  return false;
}

export function parseGreenfieldIdea(text: string): GreenfieldIdeaIntent | null {
  if (!looksLikeGreenfieldIdea(text)) return null;
  const t = String(text || '').trim();
  const name = extractGreenfieldName(t);
  if (!name) return null;
  const kind = detectProjectKind(t);
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
    || /\bscaffold\s+(?:project\s+)?["“']?[A-Za-z]/i.test(t)
    || /\bstart\s+building\s+(?:project\s+)?["“']?[A-Za-z]/i.test(t)
  );
}

export function looksLikeGreenfieldKeepPlanning(text: string): boolean {
  return /\b(?:keep\s+planning|plan\s+only|more\s+planning|just\s+plan|not\s+yet)\b/i.test(String(text || ''));
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
          name,
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

export function buildGreenfieldPlanReply(idea: GreenfieldIdeaIntent): string {
  const stack = idea.kind === 'python'
    ? 'Python 3 · small service or script first'
    : idea.kind === 'static-web'
      ? 'Static HTML/CSS/JS'
      : 'Vite + React · `npm run dev`';

  const steps = mvpSteps(idea.summary, idea.kind);

  return [
    `**${idea.name}** — got it.`,
    '',
    idea.problemLine,
    '',
    '**Suggested MVP:**',
    ...steps,
    '',
    `**Stack to start:** ${stack}`,
    `**Folder when ready:** Desktop\\Projects\\${idea.slug}`,
    '',
    '**Next — pick one:**',
    `- **Create project ${idea.name}** — scaffold folder + README on disk`,
    '- **Keep planning** — refine features before any files',
    '- **I have a folder already** — tell me the folder name to open',
  ].join('\n');
}

export function buildMissingWorkFolderReply(wantName: string): string {
  return [
    `No folder named **${wantName}** on Desktop or Desktop\\Projects.`,
    '',
    `Want me to create it as a **new project**? Say **Create project ${wantName}**.`,
    '',
    'Or name an existing folder: *Let’s work on DeBloat*.',
  ].join('\n');
}
