/**
 * Plan mode — deep in-chat plan card (read-only until “lets build this”).
 */

import { arkRoute } from '@/lib/novaRouter';
import { encodePromptChipsMessage } from '@/lib/chatPromptChips';
import { looksLikeTalkBeforeCreateAsk } from '@/lib/chatIdeaIntent';
import { parseNewProjectIntent } from '@/lib/createProjectIntent';

export type PlanStep = {
  title: string;
  detail?: string;
  /** Optional sub-steps — renders as a branching tree under this node. */
  children?: PlanStep[];
};

export type PlanReport = {
  title: string;
  summary: string;
  /** Short spoken intro shown above the card (not inside the tree). */
  intro?: string;
  steps: PlanStep[];
  questions: string[];
};

const PLAN_OPEN = '<!--nova-plan-report-->';
const PLAN_CLOSE = '<!--/nova-plan-report-->';

export const PLAN_ARM_MARKER = '<!--nova-arm-plan-->';

export const PLAN_DISCOVERY_TIP =
  'Want a sharper build outline? Switch to **Plan** mode — press **+** under the chat box, then choose **Plan**. We’ll go deeper step by step before any files are created.';

/** User is talking about building/creating something in plain chat. */
export function looksLikePlanDiscoveryAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t || t.length < 12) return false;
  if (parseNewProjectIntent(t)) return true;
  if (looksLikeTalkBeforeCreateAsk(t)) return true;
  if (
    /\b(?:i\s+want\s+to|i'?d\s+like\s+to|can\s+you\s+help\s+(?:me\s+)?|help\s+me)\b/i.test(t)
    && /\b(?:build|create|make|develop)\b/i.test(t)
  ) {
    return true;
  }
  if (
    /\b(?:build|create|make)\b/i.test(t)
    && /\b(?:app|application|website|site|tool|project|game|dashboard|landing)\b/i.test(t)
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
    const raw = sessionStorage.getItem(`${NUDGE_KEY}:${id}`);
    const at = raw ? Number(raw) : 0;
    if (at && Date.now() - at < NUDGE_COOLDOWN_MS) return false;
  } catch { /* ignore */ }
  return true;
}

export function markPlanDiscoveryShown(chatId: string): void {
  const id = String(chatId || '').trim();
  if (!id) return;
  try {
    sessionStorage.setItem(`${NUDGE_KEY}:${id}`, String(Date.now()));
  } catch { /* ignore */ }
}

/** Append tip + Switch to Plan chip (once per stretch). */
export function appendPlanDiscoveryNudge(reply: string, chatId: string): string {
  const body = String(reply || '').trim();
  if (!body) return body;
  if (/switch to \*\*plan\*\* mode|<!--nova-arm-plan-->/i.test(body)) return body;
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
  let detail = scrubPlanText(rawDetail).slice(0, 280) || undefined;
  // If detail was mostly a tree, drop the noisy leftover.
  if (detail && extractFileChildrenFromDetail(rawDetail).length >= 2) {
    const withoutPaths = detail
      .replace(/\b[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+\b/g, '')
      .replace(/\b[\w.-]+\.(?:html?|css|js|jsx|ts|tsx|json)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    detail = withoutPaths.length >= 12 ? withoutPaths.slice(0, 280) : undefined;
  }
  return { title, detail, children };
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
  const summary = String(row?.summary || fallbackSummary || '').trim().slice(0, 600)
    || 'Here is a structured plan for what you described.';
  const intro = String(row?.intro || '').trim().slice(0, 280)
    || `Here’s a clear outline for **${title}**. Tweak anything that feels off, then we can build.`;
  const stepsIn = Array.isArray(row?.steps) ? row!.steps! : [];
  const steps: PlanStep[] = stepsIn
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
  const questions = (Array.isArray(row?.questions) ? row!.questions! : [])
    .map((q) => String(q || '').trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, 3);
  return { title, summary, intro, steps, questions };
}

/** Heuristic plan when the model fails — still a real card, never empty. */
export function fallbackPlanReport(userMessage: string): PlanReport {
  const brief = String(userMessage || '').replace(/\s+/g, ' ').trim().slice(0, 280);
  return normalizeReport({
    title: brief.length > 8 && brief.length < 60 ? brief : 'Your build plan',
    summary: brief
      ? `You want to build: ${brief}. Here is a careful v1 outline before any files are created.`
      : 'Here is a careful v1 outline before any files are created.',
    steps: [
      { title: 'Lock the v1 promise', detail: 'One sentence: who it is for and what success looks like on day one.' },
      { title: 'List the must-have screens', detail: 'Only the paths needed for that promise — cut the rest for later.' },
      { title: 'Define the main actions', detail: 'What the user clicks or does in each screen, in order.' },
      { title: 'Choose sensible defaults', detail: 'NOVA picks stack and structure; you confirm feel (calm vs bold, simple vs rich).' },
      { title: 'Build, then walk the happy path', detail: 'Implement the outline, then verify the core flow works end to end.' },
    ],
    questions: [
      'Who is this for first — just you, or other people too?',
      'What is the one thing that must work in version 1?',
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

/** Generic v1 template — never replace a real prior plan with this. */
function isGenericFallbackPlan(report: PlanReport): boolean {
  const titles = (report.steps || []).map((s) => s.title.toLowerCase());
  const hits = ['lock the v1', 'must-have screen', 'main action', 'sensible default', 'happy path']
    .filter((k) => titles.some((t) => t.includes(k))).length;
  return hits >= 3;
}

/** Latest Plan card in the thread (for Keep refining). */
export function findLatestPlanReport(
  messages: Array<{ role?: string; content?: string } | null | undefined>,
): PlanReport | null {
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
  };
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
  opts.onProgress?.(refining ? 'Plan · refining prior outline' : 'Plan · gathering your brief');
  const bound = opts.boundName ? `Bound project context: ${opts.boundName}.` : 'No folder bound yet — plan for a new build.';
  const priorJson = prior
    ? JSON.stringify({
      title: prior.title,
      summary: prior.summary,
      steps: prior.steps,
      questions: prior.questions,
    }).slice(0, 6000)
    : '';
  const prompt = [
    refining
      ? 'Nova Plan mode — REFINE the existing plan. Reply with JSON only (no markdown prose outside JSON):'
      : 'Nova Plan mode — produce a deep, accurate build plan. Reply with JSON only (no markdown prose outside JSON):',
    '{"intro":"1-2 warm sentences acknowledging the idea","title":"...","summary":"2-4 sentences restating the idea","steps":[{"title":"...","detail":"...","children":[{"title":"...","detail":"..."}]}],"questions":["..."]}',
    'Rules:',
    refining
      ? [
        '- KEEP every prior top-level step (you may tighten titles/details). ADD new steps for open questions / deeper work. Do NOT replace the plan with a short generic v1 template.',
        `- Target ${Math.min(16, Math.max(prior!.steps.length + 2, 8))}–16 top-level steps in the final JSON (prior count was ${prior!.steps.length}).`,
      ].join('\n')
      : '- 5–10 top-level steps, concrete and ordered.',
    '- Use children (0–4) for sub-work OR file/folder names (plain names like "index.html", "src/App.tsx" — never ASCII trees, never └── ├──).',
    '- Put file/folder lists only in children — never paste directory trees into detail.',
    '- 0–3 plain-language product questions (answer prior open questions when refining).',
    '- No tech-stack interview. No @@@FILE. No markdown headers (###). No code fences. No CSS/hex dumps. No “Done” labels.',
    '- Keep detail under each step to 1–2 short sentences (plain prose only).',
    bound,
    opts.projectName ? `Working title hint: ${opts.projectName}` : '',
    priorJson ? `\nExisting plan JSON (must survive in the refined output):\n${priorJson}` : '',
    '',
    `User brief:\n${ask.slice(0, 4000)}`,
  ].filter(Boolean).join('\n');

  opts.onProgress?.(refining ? 'Plan · deepening steps' : 'Plan · drafting outline');
  try {
    const routed = await arkRoute({
      message: prompt,
      kind: 'chat',
      preferredModelId: opts.preferredModelId,
    });
    opts.onProgress?.('Plan · structuring card');
    const parsed = parsePlanJson(String(routed.reply || ''));
    if (parsed && (parsed.steps?.length || parsed.summary)) {
      const next = normalizeReport(parsed, ask, refining ? 16 : 12);
      return prior ? mergePlanReports(prior, next) : next;
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
  return fallbackPlanReport(ask);
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

export function formatPlanReportMessage(report: PlanReport): string {
  const payload = {
    title: report.title,
    summary: report.summary,
    intro: report.intro,
    steps: report.steps,
    questions: report.questions,
  };
  const intro = String(report.intro || '').trim()
    || `Here’s a clear outline for **${report.title}**. Tweak anything that feels off, then we can build.`;
  const body = [
    intro,
    '',
    PLAN_OPEN,
    JSON.stringify(payload),
    PLAN_CLOSE,
  ].join('\n');
  return encodePromptChipsMessage(body, [
    { label: 'Keep refining', prompt: 'Keep refining this plan — go deeper on the open questions and tighten the steps.' },
    { label: 'Let’s build this', prompt: 'lets build this' },
  ]);
}

/** Soft “keep refining / add to the plan” — stay on the Plan card path. */
export function looksLikePlanRefineAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  return /\b(?:keep\s+refining|refine\s+(?:this\s+)?(?:the\s+)?plan|tighten\s+the\s+steps|go\s+deeper\s+on\s+(?:the\s+)?open\s+questions|add\s+(?:this\s+)?to\s+the\s+plan|update\s+the\s+plan|change\s+the\s+plan|more\s+to\s+the\s+plan|back\s+to\s+(?:the\s+)?plan|expand\s+the\s+plan|fold\s+(?:those|these|them|it)\s+into\s+the\s+plan|add\s+(?:those|these|them)\s+to\s+the\s+plan|keep\s+planning|more\s+planning)\b/i.test(t);
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

/** Plain-text plan for router / history context (includes children). */
export function planReportToPlainText(report: PlanReport): string {
  return serializePlanReportForCreate(report);
}

export function isPlanReportMessage(content: string): boolean {
  return /<!--nova-plan-report-->/i.test(String(content || ''));
}
