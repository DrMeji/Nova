/**
 * Greenfield product ideas — plan + optional create (not "Which project folder? DeBloat").
 */

import { slugifyProjectName } from './projectNames';
import { encodePromptChipsMessage } from '@/lib/chatPromptChips';

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

const BLOCKED_NAME_WORDS = new Set([
  'a', 'an', 'the', 'this', 'that', 'my', 'our', 'your', 'we', 'i', 'it',
  'new', 'website', 'site', 'web', 'app', 'application', 'project', 'product',
  'where', 'how', 'what', 'when', 'people', 'like', 'get', 'want', 'build',
  'copy', 'for',
]);

function detectProjectKind(text: string): ProjectKind {
  const t = String(text || '').toLowerCase();
  if (/\b(python|flask|fastapi|trading\s+bot|pip|\.py)\b/.test(t)) return 'python';
  if (/\b(html|landing\s+page|simple\s+site|static\s+site|plain\s+html)\b/.test(t)) return 'static-web';
  if (/\b(node\s+cli|command\s+line\s+tool|cli\s+tool)\b/.test(t)) return 'node-cli';
  if (/\b(react|vite|next|web\s+app|website|site|electron|discord|call|chat|mobile)\b/.test(t)) {
    return 'vite-react';
  }
  return 'vite-react';
}

const HOW_START_RE =
  /\b(?:how\s+(?:should|do|can|would)\s+(?:i|we)\s+(?:start|begin)|best\s+way\s+to\s+(?:start|begin)|where\s+(?:should|do)\s+(?:i|we)\s+start|what\s+do\s+you\s+think|help\s+me\s+(?:plan|start|figure)|what(?:'s| is)\s+(?:the\s+)?(?:best|good)\s+(?:way|approach)|how\s+(?:would|do)\s+(?:you|we)\s+(?:start|build|approach))\b/i;

const FEATURE_DESC_RE =
  /\b(?:when\s+(?:people|users|someone|they)|so\s+(?:that|when)|that\s+(?:lets|allows|sends|notifies|connects|tracks|shows|records)|idea\s+is\s+to|basically|like\s+a|similar\s+to|pick\s+what|schedule|gets?\s+made|ready|—|–)\b/i;

const BUILD_IDEA_RE =
  /\b(?:i\s+)?(?:want\s+to\s+)?(?:build|create|make|design|develop|start)\b/i;

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
  s = s.replace(/\s+(?:that|which|where|when|so|for|—|–|-)\b.*$/i, '').trim();
  if (s.length < 2 || s.length > 48) return null;
  const lower = s.toLowerCase();
  if (BLOCKED_NAME_WORDS.has(lower)) return null;
  if (/^(this|the|that|a|an|new|my|our)$/i.test(s)) return null;
  return s;
}

/** Guess a human project name when the user never said "called X". */
export function inferGreenfieldName(text: string): string | null {
  const t = String(text || '').trim();

  const coffee = t.match(/\b(?:coffee|copy)\s+shop\b/i);
  if (coffee) return 'Coffee Shop';

  if (/\bdiscord\b/i.test(t)) return 'Discord Site';

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

  if (/\b(?:coffee|copy)\s+shop\b/i.test(t)) return 'Coffee Shop';
  if (/\brestaurant\b/i.test(t)) return 'Restaurant App';
  if (/\b(?:e-?commerce|online\s+store|shop)\b/i.test(t)) return 'Online Shop';
  if (/\b(?:booking|appointment|schedule)\b/i.test(t)) return 'Booking App';

  if (/\bwebsite\b/i.test(t)) return 'My Website';
  if (/\bweb\s*app\b/i.test(t)) return 'My Web App';

  return null;
}

export function extractGreenfieldName(text: string): string | null {
  const t = String(text || '').trim();
  const patterns = [
    /\b(?:called|named|name(?:d)?\s+it|call\s+it)\s+["“']([^"”']{2,48})["”']/i,
    /\b(?:called|named|name(?:d)?\s+it|call\s+it)\s+([A-Za-z][A-Za-z0-9 _-]{1,40})/i,
    /\b(?:project|app|product|system)\s+(?:called|named)\s+["“']?([A-Za-z][A-Za-z0-9 _-]{1,40})/i,
    /\b(?:desktop\s+)?(?:app|application)\s+(?:called|named)\s+["“']?([A-Za-z][A-Za-z0-9 _-]{1,40})/i,
    /\bi\s+want\s+to\s+(?:work\s+on|build|create|make)\s+(?:a\s+)?(?:project\s+)?(?:called\s+)?([A-Za-z][A-Za-z0-9 _-]{2,40})/i,
    /\b(?:build|create|make)\s+([A-Za-z][A-Za-z0-9 _-]{2,40})\s+(?:app|system|platform|product)\b/i,
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
    return 'Customers order coffee ahead, pick a pickup time, and get a text when it\'s ready — like a mobile-friendly coffee shop site.';
  }
  if (/\bdiscord\b/i.test(t)) {
    return 'A chat-style site with channels, messages, and voice-style layout — built from scratch in your project folder.';
  }
  if (/\b(?:notes?|sticky)\b/i.test(t)) {
    return 'A sticky-notes style app — create, edit, and keep notes in one place.';
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

  return `You want to build **${name}** — I'll help you plan it step by step.`;
}

type MvpPlan = { steps: string[]; stackNote: string };

function mvpPlan(summary: string, kind: ProjectKind, name: string): MvpPlan {
  const t = summary.toLowerCase();

  if (/\b(?:coffee|copy)\s+shop\b/i.test(t) || (/\bcoffee\b/i.test(t) && /\b(?:order|schedule|pickup|ready)\b/i.test(t))) {
    return {
      steps: [
        '1. **Home page** — menu of drinks and a simple “order for pickup” button',
        '2. **Order screen** — customer picks a drink, chooses a pickup time, enters phone or email',
        '3. **“Ready” alert** — shop sees orders; customer gets a message when coffee is ready (start with email/SMS; phone app later)',
      ],
      stackNote: 'A modern website (React) you can open in a browser — works on phones too.',
    };
  }

  if (/\bdiscord\b/i.test(t)) {
    return {
      steps: [
        '1. **Layout** — sidebar for servers/channels, main area for messages',
        '2. **Chat** — send and show messages in a channel (real UI, built in your files)',
        '3. **Polish** — dark theme, user list, then voice/video later if you want',
      ],
      stackNote: 'React web app — we build each screen in your project, no pre-made template pack.',
    };
  }

  if (/\b(door\s*bell|doorbell)\b/i.test(t) && /\b(notif|phone|alert|press)\b/i.test(t)) {
    return {
      steps: [
        '1. **Dashboard** — log when someone presses the doorbell',
        '2. **Phone alert** — text or push notification when it rings',
        '3. **Later** — mobile app, multiple users, camera feed',
      ],
      stackNote: 'Web app first; phone notifications added once the basics work.',
    };
  }

  if (/\bwebsite\b/i.test(t) || kind === 'static-web') {
    return {
      steps: [
        '1. **One main page** — explain what the business does',
        '2. **Core action** — the one thing users come for (order, book, sign up, etc.)',
        '3. **Polish** — contact info, hours, mobile-friendly layout',
      ],
      stackNote: 'Simple website pages — easy to host and update.',
    };
  }

  if (kind === 'python') {
    return {
      steps: [
        '1. **Small backend** — handles the main job (orders, data, etc.)',
        '2. **One API or script** — prove the core flow works',
        '3. **Connect a front-end** when the logic is solid',
      ],
      stackNote: 'Python on the server; website or app can plug in later.',
    };
  }

  return {
    steps: [
      `1. **First screen** — show what ${name} does in one glance`,
      '2. **Main flow** — let users do the core task (order, book, browse, etc.)',
      '3. **Notifications or accounts** — only after the happy path works',
    ],
    stackNote: 'Modern web app (React) — runs in the browser on desktop and phone.',
  };
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
  const hasFeatures = FEATURE_DESC_RE.test(t) || (t.length > 80 && (BUILD_IDEA_RE.test(t) || WANT_APP_RE.test(t)));
  const hasBuild = BUILD_IDEA_RE.test(t) || NEW_PRODUCT_RE.test(t) || WORK_ON_NEW_PROJECT_RE.test(t) || WANT_APP_RE.test(t);

  if (WORK_ON_NEW_PROJECT_RE.test(t) && (hasPlanAsk || hasFeatures)) return true;
  if (hasBuild && (hasPlanAsk || hasFeatures)) return true;
  if (hasPlanAsk && (hasBuild || NEW_PRODUCT_RE.test(t) || /\bproject\b/i.test(t) || /\bwebsite\b/i.test(t))) return true;
  if (NEW_PRODUCT_RE.test(t) && (hasPlanAsk || hasFeatures)) return true;
  if (hasBuild && name) return true;
  if (WANT_APP_RE.test(t) && name) return true;
  if (name && WORK_ON_NEW_PROJECT_RE.test(t)) return true;
  if (name && /\bi\s+want\s+to\s+work\s+on\b/i.test(t) && !/\blet'?s\s+work\s+on\b/i.test(t)) return true;

  return false;
}

export function parseGreenfieldIdea(text: string): GreenfieldIdeaIntent | null {
  if (!looksLikeGreenfieldIdea(text)) return null;
  const t = String(text || '').trim();
  const name = extractGreenfieldName(t) || inferGreenfieldName(t) || 'My App';
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
    || looksLikeGreenfieldStartWorkGo(t)
  );
}

/** "I want to start working on this project" — continue pending idea / create it. */
export function looksLikeGreenfieldStartWorkGo(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/\blet'?s\s+work\s+on\s+[A-Za-z]/i.test(t)) return false;
  if (/\bstart\s+work(?:ing)?\s+on\s+[A-Za-z][A-Za-z0-9_-]{1,40}\b/i.test(t)
    && !/\bstart\s+work(?:ing)?\s+on\s+(?:this|the|a|my|our)\s+project\b/i.test(t)) {
    return false;
  }
  return (
    /\b(?:start|begin)\s+work(?:ing)?\s+on\s+(?:this|the|a|my|our)?\s*project\b/i.test(t)
    || /\bi\s+(?:would\s+like|want)\s+to\s+start\s+work(?:ing)?\b/i.test(t)
    || /\b(?:let'?s|ready\s+to)\s+(?:start|begin|build|create)\b/i.test(t)
    || /\bgo\s+ahead\s+and\s+(?:create|build|scaffold)\b/i.test(t)
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

export function buildGreenfieldPlanReply(idea: GreenfieldIdeaIntent): string {
  const plan = mvpPlan(idea.summary, idea.kind, idea.name);

  const body = [
    `**${idea.name}** — I understand what you're going for.`,
    '',
    idea.problemLine,
    '',
    '**Where to start (simple plan):**',
    ...plan.steps,
    '',
    `**What we'll use:** ${plan.stackNote}`,
    `**Project folder (when you're ready):** Desktop\\Projects\\${idea.slug}`,
    '',
    '**What do you want to do next?** Pick one:',
  ].join('\n');

  return encodePromptChipsMessage(body, [
    { label: `Create project ${idea.name}`, prompt: `Create project ${idea.name}` },
    { label: 'Keep planning', prompt: 'Keep planning' },
    { label: 'I have a folder already', prompt: 'I have a folder already' },
  ]);
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
