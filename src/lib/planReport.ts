/**
 * Plan mode — deep in-chat plan card (read-only until “lets build this”).
 */

import { arkRoute } from '@/lib/novaRouter';
import { encodePromptChipsMessage } from '@/lib/chatPromptChips';
import { looksLikeTalkBeforeCreateAsk } from '@/lib/chatIdeaIntent';
import { parseNewProjectIntent } from '@/lib/createProjectIntent';
import { looksLikeBuildToolingAsk, looksLikeHowToGuideAsk } from '@/lib/replySanity';
import { looksLikeSimpleBuildToyChatAsk } from '@/lib/chatIntent';
import { loadChatPlan } from '@/lib/chatPlanStore';

export type PlanStep = {
  title: string;
  detail?: string;
  /** Optional sub-steps — renders as a branching tree under this node. */
  children?: PlanStep[];
};

/** Optional side-by-side panes (current vs improved, A vs B, etc.). */
export type PlanComparePane = {
  title: string;
  summary?: string;
  bullets?: string[];
};

export type PlanReport = {
  title: string;
  summary: string;
  /** Short spoken intro shown above the card (not inside the tree). */
  intro?: string;
  steps: PlanStep[];
  questions: string[];
  /** When set, Plan map also shows a left/right compare strip. */
  compare?: {
    left: PlanComparePane;
    right: PlanComparePane;
  };
};

const PLAN_OPEN = '<!--nova-plan-report-->';
const PLAN_CLOSE = '<!--/nova-plan-report-->';

export const PLAN_ARM_MARKER = '__NOVA_ARM_PLAN__';

export const PLAN_DISCOVERY_TIP =
  'Want to go into **Plan** mode so we can map this out step by step before any files are created? Press **+** under the chat box, then choose **Plan** — or tap **Switch to Plan** below.';

/** Normalize curly / smart quotes so human chat matches our plan phrases. */
function normalizePlanAskText(text: string): string {
  return String(text || '')
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2014\u2013\u2212]/g, '-')
    .trim();
}

/** User is talking about building/creating something in plain chat. */
export function looksLikePlanDiscoveryAsk(text: string): boolean {
  const t = normalizePlanAskText(text);
  if (!t || t.length < 12) return false;
  // DIY tooling / how-to hardware / mini demos stay in chat — never nudge Plan.
  if (looksLikeBuildToolingAsk(t) || looksLikeHowToGuideAsk(t) || looksLikeSimpleBuildToyChatAsk(t)) return false;
  if (parseNewProjectIntent(t)) return true;
  if (looksLikeTalkBeforeCreateAsk(t)) return true;
  if (
    /\b(?:i\s+want\s+to|i'd\s+like\s+to|can\s+you\s+help\s+(?:me\s+)?|help\s+me)\b/i.test(t)
    && /\b(?:build|create|make|develop|plan)\b/i.test(t)
  ) {
    return true;
  }
  // “I’m trying to build something…” — concrete enough to offer Plan after the answer.
  // Do NOT match bare “kicking around an app idea” greetings (those get a normal chat reply first).
  if (
    /\b(?:i(?:'m|\s+am)\s+trying\s+to\s+(?:build|create|make)|working\s+on\s+(?:building|an?\s+app))\b/i.test(t)
    || (
      /\b(?:been\s+(?:kicking\s+around|thinking\s+about))\b/i.test(t)
      && /\b(?:build|create|make|first\s+version|calling\s+it|what\s+should)\b/i.test(t)
    )
  ) {
    return true;
  }
  if (
    /\b(?:build|create|make)\b/i.test(t)
    && /\b(?:app|application|website|site|tool|project|game|dashboard|landing|something)\b/i.test(t)
  ) {
    return true;
  }
  // Named product sketch (“Calling it CorridorCup… first version”)
  if (
    /\b(?:calling\s+it|call\s+it|named|it's\s+called)\b/i.test(t)
    && /\b(?:build|post|app|board|tool|version|v1)\b/i.test(t)
  ) {
    return true;
  }
  // Soft product ideas in chat (“idea: a tiny web app called…”) — offer Plan after the answer.
  // Require a concrete shape (build/create/what should/first version/calling it), not a bare “app idea” hello.
  if (
    /\b(?:idea|thinking about|been thinking|what should|honest v1|first version)\b/i.test(t)
    && /\b(?:app|website|site|tool|dashboard|board|tracker|something|product)\b/i.test(t)
    && /\b(?:build|create|make|post|what should|first version|honest v1|calling\s+it|called)\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

const NUDGE_KEY = 'NOVA:plan-nudge-at';
/** One discovery nudge per chat every 30 minutes (product pacing). */
const NUDGE_COOLDOWN_MS = 30 * 60_000;

/** At most one discovery nudge per chat within the cooldown window. */
export function shouldOfferPlanDiscovery(chatId: string): boolean {
  const id = String(chatId || '').trim();
  if (!id) return true;
  try {
    const raw = localStorage.getItem(`${NUDGE_KEY}:${id}`)
      || sessionStorage.getItem(`${NUDGE_KEY}:${id}`);
    const at = raw ? Number(raw) : 0;
    if (at && Date.now() - at < NUDGE_COOLDOWN_MS) return false;
  } catch { /* ignore */ }
  return true;
}

export function markPlanDiscoveryShown(chatId: string): void {
  const id = String(chatId || '').trim();
  if (!id) return;
  try {
    localStorage.setItem(`${NUDGE_KEY}:${id}`, String(Date.now()));
    sessionStorage.removeItem(`${NUDGE_KEY}:${id}`);
  } catch { /* ignore */ }
}

/** Append tip + Switch to Plan chip (once per stretch). */
export function appendPlanDiscoveryNudge(reply: string, chatId: string): string {
  const body = String(reply || '').trim();
  if (!body) return body;
  if (/Want to go into \*\*Plan\*\*|switch to \*\*plan\*\*|__NOVA_ARM_PLAN__|<!--nova-arm-plan-->/i.test(body)) {
    return body;
  }
  if (!shouldOfferPlanDiscovery(chatId)) return body;
  markPlanDiscoveryShown(chatId);
  const withTip = `${body}\n\n${PLAN_DISCOVERY_TIP}`;
  return encodePromptChipsMessage(withTip, [
    { label: 'Switch to Plan', prompt: PLAN_ARM_MARKER },
  ]);
}

function parsePlanJson(text: string): Partial<PlanReport> | null {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as Partial<PlanReport>;
  } catch {
    return null;
  }
}

function scrubPlanText(raw: string): string {
  return String(raw || '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[└├│─┌┐┘┤┬┴┼]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extractFileChildrenFromDetail(detail: string): PlanStep[] {
  const lines = String(detail || '').split(/\r?\n/);
  const out: PlanStep[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const cleaned = line.replace(/^[└├│─\s|]+/, '').trim();
    if (!cleaned || cleaned.length > 80) continue;
    const m = cleaned.match(/^([A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@-]+)*(?:\.[A-Za-z0-9]+)?\/?)$/);
    if (!m) continue;
    const title = m[1];
    if (seen.has(title)) continue;
    if (!/\.[a-z0-9]+$/i.test(title) && !/\/$/.test(title) && !/^(?:src|public|assets|components|pages|lib|styles?|css|js|dist)\b/i.test(title)) {
      continue;
    }
    seen.add(title);
    out.push({ title: title.replace(/\/$/, '') + (/\/$/.test(title) ? '/' : '') });
    if (out.length >= 8) break;
  }
  return out;
}

function normalizeStep(raw: unknown, depth = 0): PlanStep | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as PlanStep;
  let title = scrubPlanText(String(s.title || '')).slice(0, 160);
  title = title.replace(/^[└├│─\s|]+/, '').trim();
  if (!title) return null;
  const rawDetail = String(s.detail || '').trim();
  let children: PlanStep[] | undefined;
  if (depth < 2 && Array.isArray(s.children) && s.children.length) {
    children = s.children
      .map((c) => normalizeStep(c, depth + 1))
      .filter((c): c is PlanStep => Boolean(c))
      .slice(0, 8);
    if (!children.length) children = undefined;
  }
  // Promote ASCII / path dumps in detail into file-tree children.
  if (depth < 2 && (!children || children.length < 2)) {
    const fromDetail = extractFileChildrenFromDetail(rawDetail);
    if (fromDetail.length) {
      children = [...(children || []), ...fromDetail].slice(0, 8);
    }
  }
  let detail = scrubPlanText(rawDetail).slice(0, 520) || undefined;
  // If detail was mostly a tree, drop the noisy leftover.
  if (detail && extractFileChildrenFromDetail(rawDetail).length >= 2) {
    const withoutPaths = detail
      .replace(/\b[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+\b/g, '')
      .replace(/\b[\w.-]+\.(?:html?|css|js|jsx|ts|tsx|json)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    detail = withoutPaths.length >= 12 ? withoutPaths.slice(0, 520) : undefined;
  }
  // Never ship a bare title with no body — fill a short default when model left it empty.
  if (!detail && !(children && children.length)) {
    detail = `Define how “${title}” works in v1 and what done looks like.`;
  }
  return { title, detail, children };
}

/** Expand thin model steps so Plan is readable without guessing. */
function enrichThinPlanSteps(steps: PlanStep[], product: string, brief: string): PlanStep[] {
  const name = (product || 'App').slice(0, 48);
  const pottery = /\b(?:kiln|firing|pottery|clay|glaze|cone)\b/i.test(`${brief} ${name}`);
  return steps.map((step, i) => {
    const title = step.title;
    let detail = String(step.detail || '').trim();
    const thin = detail.length < 48;
    if (!thin) return step;
    const lower = title.toLowerCase();
    if (/scaffold|shell|project|vite/i.test(lower)) {
      detail = `Stand up a Vite + React app named ${name}. Get package.json, index.html, and src/main running so we have a blank page before any UI.`;
    } else if (/header|brand|title|hero/i.test(lower) || (pottery && /name|wordmark/i.test(lower))) {
      detail = pottery
        ? `Put **${name}** large at the top with a one-line tagline (e.g. “Log every kiln run”). This is the first thing on screen — no nav.`
        : `Put the **${name}** name and a short tagline at the top of the single screen.`;
    } else if (/form|field|input|log|add|entry/i.test(lower) || (pottery && /clay|cone|glaze|result/i.test(lower))) {
      detail = pottery
        ? 'Build the add-firing form: clay body, cone (e.g. 6 / 10), glaze notes, and pass/fail. Submit appends one row — no accounts.'
        : `Wire the main form / inputs for ${name} so the user can enter the core data in one place.`;
    } else if (/list|history|saved|past|firings/i.test(lower)) {
      detail = pottery
        ? 'Show a short list of saved firings under the form (newest first). Keep it local in memory for v1 — no photos yet.'
        : `Show the saved items list under the main action so the user can see recent entries.`;
    } else if (/style|look|theme|css|palette|vibe/i.test(lower)) {
      detail = pottery
        ? 'Warm clay / charcoal studio styling — soft beige, warm gray, soft brown accents. Cozy, not corporate.'
        : `Apply light, readable styling so ${name} feels finished on one screen.`;
    } else if (/smoke|verify|check|test/i.test(lower)) {
      detail = `Click through the happy path: open ${name} → use the main action → confirm the result shows. Then we leave Plan and build.`;
    } else if (i === 0) {
      detail = `Start here: create the ${name} project shell so later steps have a place to land.`;
    } else {
      detail = `Next: ${title} for ${name} — concrete UI/work for this step, then move down the list.`;
    }
    return {
      ...step,
      detail,
      children: step.children?.length
        ? step.children
        : (/scaffold|shell|style|form|header|list/i.test(lower)
          ? [
              ...( /scaffold|shell/i.test(lower) ? [{ title: 'package.json' }, { title: 'src/App.tsx' }] : []),
              ...( /style/i.test(lower) ? [{ title: 'src/App.css' }] : []),
              ...( /form|header|list/i.test(lower) ? [{ title: 'src/App.tsx' }] : []),
            ].slice(0, 4)
          : step.children),
    };
  });
}

function countPlanNodes(steps: PlanStep[]): number {
  let n = 0;
  for (const s of steps) {
    n += 1;
    if (s.children?.length) n += countPlanNodes(s.children);
  }
  return n;
}

export function countPlanSteps(report: PlanReport): number {
  return countPlanNodes(report.steps || []);
}

function normalizeReport(row: Partial<PlanReport> | null, fallbackSummary: string, maxSteps = 12): PlanReport {
  const title = String(row?.title || 'Build plan').trim().slice(0, 120) || 'Build plan';
  const summary = String(row?.summary || fallbackSummary || '').trim().slice(0, 900)
    || 'Here is a structured plan for what you described.';
  const intro = String(row?.intro || '').trim().slice(0, 360)
    || `Here’s a clear outline for **${title}**. Tweak anything that feels off, then we can build.`;
  const stepsIn = Array.isArray(row?.steps) ? row!.steps! : [];
  let steps: PlanStep[] = stepsIn
    .map((s) => normalizeStep(s))
    .filter((s): s is PlanStep => Boolean(s))
    .slice(0, Math.max(6, maxSteps));
  if (!steps.length) {
    steps.push(
      { title: 'Clarify the core job', detail: 'Name the one outcome v1 must deliver.' },
      { title: 'Sketch the main screens', detail: 'Keep the first version small and usable.' },
      { title: 'Build and verify', detail: 'Implement, then click through the happy path.' },
    );
  }
  const productHint = title.replace(/\s+Build Plan.*$/i, '').replace(/\s+Plan$/i, '').trim() || 'App';
  steps = enrichThinPlanSteps(steps, productHint, `${summary}\n${fallbackSummary}`);
  const questions = (Array.isArray(row?.questions) ? row!.questions! : [])
    .map((q) => String(q || '').trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, 3);
  const compare = row?.compare && row.compare.left && row.compare.right
    ? {
      left: {
        title: String(row.compare.left.title || 'Now').slice(0, 80),
        summary: row.compare.left.summary ? String(row.compare.left.summary).slice(0, 400) : undefined,
        bullets: Array.isArray(row.compare.left.bullets)
          ? row.compare.left.bullets.map((b) => String(b || '').trim()).filter(Boolean).slice(0, 8)
          : undefined,
      },
      right: {
        title: String(row.compare.right.title || 'Better').slice(0, 80),
        summary: row.compare.right.summary ? String(row.compare.right.summary).slice(0, 400) : undefined,
        bullets: Array.isArray(row.compare.right.bullets)
          ? row.compare.right.bullets.map((b) => String(b || '').trim()).filter(Boolean).slice(0, 8)
          : undefined,
      },
    }
    : undefined;
  return { title, summary, intro, steps, questions, compare };
}

/** Heuristic plan when the model fails — concrete build blueprint, never process fluff. */
export function fallbackPlanReport(userMessage: string, projectNameHint?: string): PlanReport {
  const brief = String(userMessage || '').replace(/\s+/g, ' ').trim().slice(0, 900);
  const called = brief.match(/\b(?:calling\s+it|call\s+it|named|it's\s+called)\s+([A-Z][A-Za-z0-9_-]{2,40})\b/i);
  const hint = String(projectNameHint || '').trim()
    .replace(/\s+Build Plan.*$/i, '')
    .replace(/\s+Plan$/i, '')
    .trim();
  const product = (called?.[1] || hint || 'App').slice(0, 48);
  const title = `${product} Build Plan`;

  const sticky = /\b(?:notedot|note\s*dot|sticky\s*notes?|notepad)\b/i.test(brief)
    || (/\bnote\b/i.test(brief) && /\b(?:title|text\s*box|textarea|type)\b/i.test(brief)
      && /\b(?:tiny|simple|basic|just|only|most basic)\b/i.test(brief));
  const boardish = /coffee|package|hallway|apartment|board|notice|lost|found|corridor|nook|office|floor|run|claim|remind/i.test(brief);
  const pottery = /\b(?:kiln|firing|pottery|clay|glaze|cone|kilnbook)\b/i.test(brief);

  const stickySteps: PlanStep[] = [
    {
      title: `Scaffold the ${product} page`,
      detail: `Create a small Vite + React project named ${product}. Start here so we have a runnable shell before any UI.`,
      children: [
        { title: 'package.json' },
        { title: 'index.html' },
        { title: 'src/main.tsx' },
      ],
    },
    {
      title: 'Build the single-screen shell',
      detail: `Put the ${product} title on one screen — no nav, no extra pages. This is the first thing on screen.`,
      children: [{ title: 'src/App.tsx' }],
    },
    {
      title: 'Add the note text box',
      detail: 'Add one textarea so the user can type a note. Keep it in memory for v1 — no accounts or database.',
      children: [{ title: 'src/App.tsx' }],
    },
    {
      title: 'Style the page lightly',
      detail: 'Basic layout and spacing only — title above the note box, readable on a dark page. Skip themes and extras.',
      children: [{ title: 'src/App.css' }],
    },
    {
      title: 'Smoke-check the happy path',
      detail: `Confirm ${product} shows the title and the note box accepts typing. Then we are ready to leave Plan and build.`,
    },
  ];

  const boardSteps: PlanStep[] = [
    {
      title: `Scaffold ${product}`,
      detail: `Stand up a Vite + React app named ${product}. Start with the project shell before features.`,
      children: [
        { title: 'package.json' },
        { title: 'src/App.tsx' },
      ],
    },
    {
      title: 'Post the core item',
      detail: 'Build the form or composer to create the main post (run, package, or notice) with only the fields v1 needs.',
      children: [{ title: 'src/App.tsx' }],
    },
    {
      title: 'Browse and claim / respond',
      detail: 'Show an open list and the one next action (claim, hop on, or respond). Keep it one screen if possible.',
    },
    {
      title: 'Quiet reminder (if asked)',
      detail: 'Only if the brief wants it: a light reminder when nothing is claimed after a short wait. Skip otherwise.',
    },
    {
      title: 'Smoke-check the loop',
      detail: 'Walk post → see it in the list → claim/respond end to end before adding extras.',
    },
  ];

  const defaultSteps: PlanStep[] = [
    {
      title: `Scaffold ${product}`,
      detail: `Create the Vite + React project for ${product}. This is where we start — files on disk before features.`,
      children: [
        { title: 'package.json' },
        { title: 'src/App.tsx' },
      ],
    },
    {
      title: 'Build the primary screen',
      detail: 'Ship the main screen from the brief first (title + core layout). No extra pages until this works.',
      children: [{ title: 'src/App.tsx' }],
    },
    {
      title: 'Wire the main action',
      detail: 'Add the one thing the user does on that screen (type, click, submit). Keep state local for v1.',
    },
    {
      title: 'Light styling',
      detail: 'Readable layout and spacing only. Skip auth, dashboards, and marketing sections unless the brief demands them.',
      children: [{ title: 'src/App.css' }],
    },
    {
      title: 'Smoke-check v1',
      detail: `Verify ${product} matches the brief’s core loop, then leave Plan and build files.`,
    },
  ];

  const potterySteps: PlanStep[] = [
    {
      title: `Scaffold ${product}`,
      detail: `Create a Vite + React app named ${product}. Start with a runnable shell before any kiln UI.`,
      children: [
        { title: 'package.json' },
        { title: 'index.html' },
        { title: 'src/main.tsx' },
      ],
    },
    {
      title: 'Brand header',
      detail: `Show **${product}** large at the top with tagline “Log every kiln run.” Single screen — no nav, no extra pages.`,
      children: [{ title: 'src/App.tsx' }],
    },
    {
      title: 'Add-firing form',
      detail: 'Fields: clay body, cone (e.g. 6 or 10), glaze notes, pass/fail. Submit adds one firing to the list. Local-only — no accounts.',
      children: [{ title: 'src/App.tsx' }],
    },
    {
      title: 'Saved firings list',
      detail: 'Under the form, show the last few firings (newest first). Empty state when none yet. No photos in v1.',
      children: [{ title: 'src/App.tsx' }],
    },
    {
      title: 'Warm studio look',
      detail: 'Clay / charcoal vibe: soft beige background, warm gray text, soft brown accents. Cozy studio, not a SaaS dashboard.',
      children: [{ title: 'src/App.css' }],
    },
    {
      title: 'Smoke-check the loop',
      detail: `Open ${product} → fill a firing → see it in the list → confirm header + form + list all read clearly. Then leave Plan and build.`,
    },
  ];

  const steps = sticky ? stickySteps : pottery ? potterySteps : boardish ? boardSteps : defaultSteps;

  return normalizeReport({
    title,
    summary: brief
      ? `You want to build: ${brief.slice(0, 280)}. This plan is the ordered build path — where we start and what ships in v1.`
      : `Ordered build path for **${product}** — where we start and what ships in v1.`,
    intro: `Here’s a concrete build plan for **${product}**. We start at the top and work down — tweak anything, then say Let’s build this.`,
    steps,
    questions: [
      'Anything to cut from v1 before we build?',
      'Should we start from the UI shell, or is another piece first?',
    ],
  }, brief);
}

function stepKey(title: string): string {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 56);
}

/** Generic process template — never ship this as a real plan. */
export function isGenericFallbackPlan(report: PlanReport): boolean {
  const titles = (report.steps || []).map((s) => s.title.toLowerCase());
  const banned = [
    'lock the v1',
    'must-have screen',
    'main action',
    'sensible default',
    'happy path',
    'choose sensible',
    'list the must-have',
    'define the main action',
  ];
  const hits = banned.filter((k) => titles.some((t) => t.includes(k))).length;
  if (hits >= 2) return true;
  // Thin process-only plans with no product grounding in titles.
  if (titles.length >= 4 && hits >= 1 && !titles.some((t) => /scaffold|screen|app\.tsx|ui|style|smoke|post|note|title/i.test(t))) {
    return true;
  }
  return false;
}

/** Latest Plan card in the thread (for Keep refining). */
/** Latest Plan — prefer the synced chat store, then the newest plan message in the thread. */
export function findLatestPlanReport(
  messages: Array<{ role?: string; content?: string } | null | undefined>,
  chatId?: string | null,
): PlanReport | null {
  const stored = loadChatPlan(chatId);
  if (stored?.steps?.length) return stored;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role !== 'assistant') continue;
    const report = parsePlanReport(String(m.content || ''));
    if (report?.steps?.length) return report;
  }
  return null;
}

/**
 * Keep prior steps, deepen matches from next, append truly new steps.
 * Refines never shrink the plan back to a short generic outline.
 */
export function mergePlanReports(prior: PlanReport, next: PlanReport): PlanReport {
  if (!prior?.steps?.length) return next;
  if (!next?.steps?.length || isGenericFallbackPlan(next)) {
    return {
      ...prior,
      intro: String(next?.intro || prior.intro || '').trim()
        || `Updated the plan for **${prior.title}** — kept your steps and tightened the open questions.`,
      questions: (next?.questions?.length ? next.questions : prior.questions).slice(0, 3),
    };
  }

  const byKey = new Map<string, PlanStep>();
  const order: string[] = [];
  for (const s of prior.steps) {
    const k = stepKey(s.title) || `p-${order.length}`;
    byKey.set(k, s);
    order.push(k);
  }
  for (const s of next.steps) {
    const k = stepKey(s.title) || `n-${order.length}`;
    if (byKey.has(k)) {
      const old = byKey.get(k)!;
      byKey.set(k, {
        title: s.title || old.title,
        detail: s.detail || old.detail,
        children: (s.children?.length ? s.children : old.children),
      });
    } else {
      byKey.set(k, s);
      order.push(k);
    }
  }
  const steps = order.map((k) => byKey.get(k)!).filter(Boolean).slice(0, 16);
  const title = /^(?:your\s+)?build\s+plan$/i.test(String(next.title || '').trim())
    ? prior.title
    : (next.title || prior.title);
  const questions = [...(next.questions || []), ...(prior.questions || [])]
    .map((q) => String(q || '').trim())
    .filter(Boolean)
    .filter((q, i, arr) => arr.findIndex((x) => stepKey(x) === stepKey(q)) === i)
    .slice(0, 3);
  return {
    title,
    summary: next.summary || prior.summary,
    intro: next.intro
      || `Here’s the tightened plan for **${title}** — prior steps kept, with deeper detail where it mattered.`,
    steps,
    questions,
    compare: next.compare || prior.compare,
  };
}

/** One-line feature add while a Plan card already exists (“also email alerts…”). */
export function looksLikePlanIncrementalAdd(text: string): boolean {
  const t = normalizePlanAskText(text);
  if (!t || t.length > 280) return false;
  if (/\b(?:rebuild|start over|from scratch|whole new plan)\b/i.test(t)) return false;
  // Explicit “enter plan” phrasing is not a one-feature add.
  if (looksLikePlanEnterAsk(t)) return false;
  return (
    /\b(?:also|and)\s+(?:i\s+)?(?:want|need|would like)\b/i.test(t)
    || /\b(?:also|can we|could we|what about|please)\s+(?:add|include|support)\b/i.test(t)
    || /\b(?:add|include|support)\s+(?:optional\s+)?(?:email|sms|push|notif|alert|unit|package|remind)\b/i.test(t)
    || /\boptional\s+(?:email|sms|push)\s+alerts?\b/i.test(t)
    || (/\b(?:quiet\s+)?remind(?:er|ers)?\b/i.test(t) && /\b(?:also|want|need|after|minute)\b/i.test(t))
  );
}

/** Soft enter Plan mode from chat (“let’s plan this out”). */
export function looksLikePlanEnterAsk(text: string): boolean {
  const t = normalizePlanAskText(text);
  if (!t) return false;
  return /\b(?:plan\s+this\s+out|let'?s\s+plan(?:\s+this)?(?:\s+out)?|go\s+into\s+plan(?:\s+mode)?|help(?:\s+me)?\s+planning|switch\s+to\s+plan(?:\s+mode)?)\b/i.test(t);
}

/**
 * Plain chat while Plan is armed — risks, opinions, quick Qs.
 * Must NOT rebuild / re-post the Plan card.
 */
export function looksLikePlanSideChatAsk(text: string): boolean {
  const t = normalizePlanAskText(text);
  if (!t) return false;
  if (looksLikePlanEnterAsk(t) || looksLikePlanRefineAsk(t) || looksLikePlanIncrementalAdd(t)) {
    return false;
  }
  if (/\b(?:lets?\s+build|build\s+this|start\s+building|scaffold|create\s+(?:the\s+)?files)\b/i.test(t)) {
    return false;
  }
  // Opinion / risk / compare chat that should stay in the bubble.
  if (
    /\b(?:overcomplicate|too\s+much|risk|risks|trade-?offs?|pros?\s+and\s+cons?|what\s+do\s+you\s+think|quick\s+one|top\s+(?:two|2|three|3)|side\s+by\s+side|compare)\b/i.test(t)
  ) {
    return true;
  }
  if (/\?/.test(t) && t.length < 220 && !/\b(?:add|include|also\s+want|update\s+the\s+plan)\b/i.test(t)) {
    return true;
  }
  return false;
}

/**
 * Soft “keep refining / enter plan” — Plan card path.
 * Note: plain “also I want…” alone is NOT refine — that needs a prior Plan card
 * (see looksLikePlanIncrementalAdd + prior check at the call site).
 */
export function looksLikePlanRefineAsk(text: string): boolean {
  const t = normalizePlanAskText(text);
  if (!t) return false;
  if (looksLikePlanEnterAsk(t)) return true;
  return /\b(?:keep\s+refining|refine\s+(?:this\s+)?(?:the\s+)?plan|tighten\s+the\s+steps|go\s+deeper\s+on\s+(?:the\s+)?open\s+questions|add\s+(?:this\s+)?to\s+the\s+plan|update\s+the\s+plan|change\s+the\s+plan|more\s+to\s+the\s+plan|back\s+to\s+(?:the\s+)?plan|expand\s+the\s+plan|fold\s+(?:those|these|them|it)\s+into\s+the\s+plan|add\s+(?:those|these|them)\s+to\s+the\s+plan|keep\s+planning|more\s+planning)\b/i.test(t);
}

/** Stitch recent chat into the Plan brief when the ask is just “let’s plan this out”. */
export function buildPlanBriefFromThread(
  ask: string,
  messages: Array<{ role?: string; content?: string }> | null | undefined,
): string {
  const current = normalizePlanAskText(ask);
  if (!current) return '';
  const enterOnly = looksLikePlanEnterAsk(current) && current.length < 220;
  const thin = current.length < 100;
  if (!enterOnly && !thin) return current;
  const lines: string[] = [];
  for (const m of (messages || []).slice(-10)) {
    const role = String(m?.role || '');
    if (role !== 'user' && role !== 'assistant') continue;
    let body = String(m?.content || '')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!body || body.length < 8) continue;
    if (/<!--nova-plan-report-->/i.test(String(m?.content || ''))) continue;
    lines.push(`${role === 'user' ? 'User' : 'Nova'}: ${body.slice(0, 520)}`);
  }
  if (!lines.length) return current;
  return [
    'Recent thread (use this as the product brief):',
    lines.join('\n').slice(0, 3200),
    '',
    `Current ask:\n${current}`,
  ].join('\n');
}

async function withPlanTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p.then((v) => v).catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), Math.max(8_000, ms));
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Fast path: fold ONE feature into the existing plan without regenerating every step.
 * Local GGUF otherwise rewrites 12–16 steps and can stall for minutes.
 */
async function runIncrementalPlanAdd(
  prior: PlanReport,
  ask: string,
  preferredModelId: string | undefined,
  onProgress?: (msg: string) => void,
): Promise<PlanReport | null> {
  onProgress?.('Plan · adding your change');
  const titles = prior.steps.map((s, i) => `${i + 1}. ${s.title}`).join('\n');
  const prompt = [
    'Nova Plan mode — ADD ONE feature to an existing plan. Reply with JSON only:',
    '{"intro":"1 short sentence confirming what you added","step":{"title":"...","detail":"1-2 sentences","children":[{"title":"...","detail":"..."}]},"questions":[]}',
    'Rules:',
    '- Return exactly one new top-level BUILD step for the user request (or tighten one existing title if it already covers it).',
    '- Do NOT rewrite the whole plan. Do NOT repeat prior steps.',
    '- Step must be concrete work (feature/file/UI), NEVER meta titles like "Lock the v1 promise".',
    '- Keep detail under 2 short sentences. No @@@FILE, no markdown headers, no code fences.',
    `Prior plan title: ${prior.title}`,
    `Prior top-level steps (do not repeat):\n${titles.slice(0, 1200)}`,
    '',
    `User add:\n${ask.slice(0, 800)}`,
  ].join('\n');
  try {
    const routed = await withPlanTimeout(
      arkRoute({
        message: prompt,
        kind: 'chat',
        preferredModelId,
      }),
      28_000,
    );
    if (!routed) return null;
    const raw = String(routed.reply || '').trim();
    const parsed = parsePlanJson(raw) as Partial<PlanReport> & { step?: PlanStep } | null;
    let addStep: PlanStep | null = null;
    if (parsed?.step && typeof parsed.step === 'object') {
      addStep = normalizeStep(parsed.step);
    } else if (Array.isArray(parsed?.steps) && parsed!.steps!.length === 1) {
      addStep = normalizeStep(parsed!.steps![0]);
    }
    if (!addStep?.title) {
      // Local heuristic so a one-line add never stalls for minutes.
      const title = /remind/i.test(ask)
        ? 'Quiet claim reminder'
        : /alert|email|notif/i.test(ask)
          ? 'Optional alerts'
          : scrubPlanText(ask).slice(0, 72) || 'Extra v1 feature';
      addStep = normalizeStep({
        title,
        detail: `Include in v1: ${scrubPlanText(ask).slice(0, 200)}.`,
      });
    }
    if (!addStep?.title) return null;
    const intro = String(parsed?.intro || '').trim()
      || `Added **${addStep.title}** to the **${prior.title}** outline.`;
    const next: PlanReport = {
      title: prior.title,
      summary: prior.summary,
      intro,
      steps: [...prior.steps, addStep].slice(0, 16),
      questions: (Array.isArray(parsed?.questions) ? parsed!.questions! : prior.questions)
        .map((q) => String(q || '').trim())
        .filter(Boolean)
        .slice(0, 3),
    };
    return next;
  } catch {
    return null;
  }
}

export async function runPlanMode(opts: {
  userMessage: string;
  projectName?: string;
  boundName?: string | null;
  preferredModelId?: string;
  /** Previous Plan card in this chat — required for Keep refining merges. */
  priorPlan?: PlanReport | null;
  onProgress?: (msg: string) => void;
}): Promise<PlanReport> {
  const ask = String(opts.userMessage || '').trim();
  const prior = opts.priorPlan || null;
  const refining = Boolean(prior?.steps?.length);
  const incremental = refining && looksLikePlanIncrementalAdd(ask);

  if (incremental && prior) {
    const fast = await runIncrementalPlanAdd(prior, ask, opts.preferredModelId, opts.onProgress);
    if (fast?.steps?.length) {
      opts.onProgress?.('Plan · structuring card');
      return fast;
    }
    // Local fold if the model timed out — never fall into a multi-minute full rewrite for one line.
    const title = /remind/i.test(ask)
      ? 'Quiet claim reminder'
      : /alert|email|notif/i.test(ask)
        ? 'Optional alerts'
        : scrubPlanText(ask).slice(0, 72) || 'Extra v1 feature';
    const addStep = normalizeStep({
      title,
      detail: `Include in v1: ${scrubPlanText(ask).slice(0, 200)}.`,
    });
    if (addStep) {
      opts.onProgress?.('Plan · structuring card');
      return {
        title: prior.title,
        summary: prior.summary,
        intro: `Added **${addStep.title}** to the **${prior.title}** outline.`,
        steps: [...prior.steps, addStep].slice(0, 16),
        questions: prior.questions.slice(0, 3),
      };
    }
  }

  opts.onProgress?.(refining ? 'Plan · refining prior outline' : 'Plan · gathering your brief');
  const bound = opts.boundName ? `Bound project context: ${opts.boundName}.` : 'No folder bound yet — plan for a new build.';
  // Incremental fallback / full refine: keep prior JSON smaller so local models finish faster.
  const priorJson = prior
    ? JSON.stringify({
      title: prior.title,
      summary: prior.summary,
      steps: prior.steps.map((s) => ({
        title: s.title,
        detail: s.detail,
        children: (s.children || []).slice(0, 3).map((c) => ({ title: c.title, detail: c.detail })),
      })),
      questions: prior.questions,
    }).slice(0, incremental ? 2800 : 4500)
    : '';
  const prompt = [
    refining
      ? 'Nova Plan mode — REFINE the existing BUILD blueprint. Reply with JSON only (no markdown prose outside JSON):'
      : 'Nova Plan mode — produce an ordered BUILD blueprint (how we will build this product). Reply with JSON only:',
    '{"intro":"1-2 sentences","title":"Product Build Plan","summary":"2-4 sentences restating what we are building","steps":[{"title":"...","detail":"...","children":[{"title":"src/App.tsx","detail":"..."}]}],"questions":["..."]}',
    'Rules:',
    refining
      ? [
        '- KEEP every prior top-level step (tighten titles/details). ADD steps only when needed. Do NOT replace with a generic process template.',
        `- Prefer ${Math.min(14, Math.max(prior!.steps.length, 5))}–${Math.min(14, prior!.steps.length + 3)} top-level steps (prior count was ${prior!.steps.length}).`,
        '- Every step MUST have a non-empty detail (2–4 sentences of real build work: fields, UI, done-when).',
      ].join('\n')
      : [
        '- 6–9 top-level steps in BUILD ORDER (start → finish). First step is where we begin (usually scaffold / shell).',
        '- Every step MUST have a rich detail (2–4 sentences): what we build, which UI pieces/fields, and what “done” looks like for that step.',
        '- Ground every step in the product brief (product name, screens, form fields, list, look). Do not invent an unrelated app.',
        '- Name concrete UI: brand header, form fields, list rows, colors — not vague “primary screen”.',
      ].join('\n'),
    '- Steps must be concrete build work (scaffold, brand header, form, list, style, smoke-check) — NOT planning process.',
    '- FORBIDDEN step titles (never use): "Lock the v1 promise", "List the must-have screens", "Define the main actions", "Choose sensible defaults", "Build then walk the happy path", or similar meta/process fluff.',
    '- Use children (0–4) for file names when useful ("src/App.tsx", "src/App.css", "index.html") — never ASCII trees.',
    '- Put file/folder lists only in children — never paste directory trees into detail.',
    '- 0–3 plain-language product questions.',
    '- No tech-stack interview. No @@@FILE. No markdown headers (###). No code fences.',
    '- Detail per step: 2–4 short sentences of plain prose (fields, layout, acceptance). Never one-word stubs.',
    bound,
    opts.projectName ? `Working title hint: ${opts.projectName}` : '',
    priorJson ? `\nExisting plan JSON (must survive in the refined output):\n${priorJson}` : '',
    '',
    `User brief:\n${ask.slice(0, 4000)}`,
  ].filter(Boolean).join('\n');

  opts.onProgress?.(refining ? 'Plan · deepening steps' : 'Plan · drafting outline');
  // Fresh drafts and refines must not hang for minutes on a stuck local GGUF.
  const routeBudgetMs = refining ? 55_000 : 48_000;
  try {
    const routed = await withPlanTimeout(
      arkRoute({
        message: prompt,
        kind: 'chat',
        preferredModelId: opts.preferredModelId,
      }),
      routeBudgetMs,
    );
    if (routed) {
      opts.onProgress?.('Plan · structuring card');
      const parsed = parsePlanJson(String(routed.reply || ''));
      if (parsed && (parsed.steps?.length || parsed.summary)) {
        const next = normalizeReport(parsed, ask, refining ? 16 : 10);
        // Model returned process fluff — use the product build fallback instead.
        if (!refining && isGenericFallbackPlan(next)) {
          opts.onProgress?.('Plan · replacing generic outline');
          return fallbackPlanReport(ask, opts.projectName);
        }
        return prior ? mergePlanReports(prior, next) : next;
      }
    }
  } catch {
    /* fall through */
  }
  opts.onProgress?.('Plan · using local outline');
  if (prior) {
    return mergePlanReports(prior, {
      ...prior,
      intro: `Kept your **${prior.title}** outline and tightened it locally — the model reply was incomplete.`,
    });
  }
  return fallbackPlanReport(ask, opts.projectName);
}

/** Full plan text for create / ensemble — includes nested children. */
export function serializePlanReportForCreate(report: PlanReport): string {
  const lines: string[] = [
    `Plan: ${report.title}`,
    String(report.summary || '').trim(),
    '',
    'Build steps (follow in order):',
  ];
  report.steps.forEach((s, i) => {
    lines.push(`${i + 1}. ${s.title}${s.detail ? `: ${s.detail}` : ''}`);
    for (const c of s.children || []) {
      lines.push(`   - ${c.title}${c.detail ? `: ${c.detail}` : ''}`);
      for (const g of c.children || []) {
        lines.push(`     - ${g.title}${g.detail ? `: ${g.detail}` : ''}`);
      }
    }
  });
  if (report.questions.length) {
    lines.push('', 'Open questions:');
    for (const q of report.questions) lines.push(`- ${q}`);
  }
  return lines.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n').trim();
}

/** Compact ordered step lines for pending.planLog. */
export function planReportToPlanLog(report: PlanReport): string[] {
  return (report.steps || []).map((s, i) => {
    const kids = (s.children || []).map((c) => c.title).filter(Boolean);
    return `${i + 1}. ${s.title}${kids.length ? ` [${kids.join(', ')}]` : ''}`;
  });
}

/**
 * Chat bubble for Plan turns: professional prose + Keep refining / Let’s build.
 * Full map lives in the Plan pill overlay (synced store) — not pasted again each turn.
 */
export function formatPlanChatReply(
  report: PlanReport,
  opts?: { refining?: boolean; changeNote?: string },
): string {
  const title = String(report.title || 'your plan').trim() || 'your plan';
  const stepCount = countPlanSteps(report);
  const refining = Boolean(opts?.refining);
  const change = String(opts?.changeNote || '').trim();
  const intro = refining
    ? (change
      || String(report.intro || '').trim()
      || `Updated **${title}** — the synced Plan map now has **${stepCount}** steps. Open **Plan** above the chat to review.`)
    : (String(report.intro || '').trim()
      || `Here’s a clear outline for **${title}** (${stepCount} steps). Open **Plan** above the chat anytime to review the full map.`);
  const body = [
    intro,
    '',
    refining
      ? 'Tell me what to add or change, or say **Let’s build this** when you’re ready for files.'
      : 'Tweak anything that feels off, then we can build. The Plan pill stays in sync as we refine.',
    '',
    `<!--nova-plan-link-->${JSON.stringify({ title, stepCount })}<!--/nova-plan-link-->`,
  ].join('\n');
  return encodePromptChipsMessage(body, [
    { label: 'Keep refining', prompt: 'Keep refining this plan — go deeper on the open questions and tighten the steps.' },
    { label: 'Let’s build this', prompt: 'lets build this' },
  ]);
}

/** @deprecated Prefer formatPlanChatReply + chat plan store. Kept for older threads. */
export function formatPlanReportMessage(report: PlanReport): string {
  return formatPlanChatReply(report);
}

export function parsePlanReport(content: string): PlanReport | null {
  const raw = String(content || '');
  const m = raw.match(/<!--nova-plan-report-->\s*([\s\S]*?)\s*<!--\/nova-plan-report-->/i);
  if (!m?.[1]) return null;
  try {
    const data = JSON.parse(m[1].trim()) as Partial<PlanReport>;
    // Preserve refined plans up to 16 top-level steps (never re-cap to 12).
    return normalizeReport(data, '', 16);
  } catch {
    return null;
  }
}

export function isPlanLinkMessage(content: string): boolean {
  return /<!--nova-plan-link-->/i.test(String(content || ''));
}

export function parsePlanLinkMessage(content: string): { title: string; stepCount: number } | null {
  const m = String(content || '').match(/<!--nova-plan-link-->\s*([\s\S]*?)\s*<!--\/nova-plan-link-->/i);
  if (!m?.[1]) return null;
  try {
    const data = JSON.parse(m[1].trim()) as { title?: string; stepCount?: number };
    return {
      title: String(data.title || 'Build plan'),
      stepCount: Math.max(0, Number(data.stepCount) || 0),
    };
  } catch {
    return null;
  }
}

/** Plain-text plan for router / history context (includes children). */
export function planReportToPlainText(report: PlanReport): string {
  return serializePlanReportForCreate(report);
}

export function isPlanReportMessage(content: string): boolean {
  return /<!--nova-plan-report-->/i.test(String(content || ''));
}
