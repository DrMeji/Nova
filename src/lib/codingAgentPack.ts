/**
 * Coding-agent capability pack — over-implements OSS agent patterns into Nova
 * so every gap-research row can land as Have. Prune later if unused.
 *
 * Patterns: Aider (repo map, architect/editor), OpenHands (goal/evidence Done),
 * SWE-agent (read-before-edit ACI), coding-cli (doom-loop), invent-first create.
 */

import { buildRankedProjectMap } from '@/lib/createProjectMap';
import {
  resolveArtifactKind,
  isNonWebArtifactKind,
  briefHasCodingArtifactMarker,
  type ArtifactKind,
} from '@/lib/createArtifactKind';

/** Master switches — keep ON until we deliberately prune. */
export const CODING_AGENT_PACK = {
  inventFirstCreate: true,
  evidenceBeforeDone: true,
  readBeforeEdit: true,
  repoMapEveryStep: true,
  architectEditorSplit: true,
  surgicalMicroEdit: true,
  rejectFloorAsReady: true,
  localModelHonestMiss: true,
  doomLoopBreaker: true,
  /** P0–P2 agent harness pack (see src/lib/agentHarness). */
  harnessPack: true,
} as const;

/**
 * Edit / keep_building peer order (Claude Code / Cursor):
 * read → surgical propose → apply → anti-bleed → syntax → done.
 */
export const EDIT_PIPELINE_STAGES = [
  'read',
  'propose',
  'apply',
  'anti-bleed',
  'syntax',
  'done',
] as const;

export type EditPipelineStage = (typeof EDIT_PIPELINE_STAGES)[number];

export function formatEditPipelineProgress(stage: EditPipelineStage): string {
  const idx = EDIT_PIPELINE_STAGES.indexOf(stage);
  const n = idx >= 0 ? idx + 1 : 1;
  return `Edit · ${n}/${EDIT_PIPELINE_STAGES.length} ${stage} (read→propose→apply→anti-bleed→syntax→done)`;
}

/**
 * Agent tool-loop peer order (SWE-agent / OpenHands / Claude Code):
 * map → read → write/patch → verify-each → evidence → done.
 */
export const AGENT_LOOP_STAGES = [
  'map',
  'read',
  'write',
  'verify',
  'evidence',
  'done',
] as const;

export type AgentLoopStage = (typeof AGENT_LOOP_STAGES)[number];

export function formatAgentLoopProgress(stage: AgentLoopStage): string {
  const idx = AGENT_LOOP_STAGES.indexOf(stage);
  const n = idx >= 0 ? idx + 1 : 1;
  return `Agent · ${n}/${AGENT_LOOP_STAGES.length} ${stage} (map→read→write→verify→evidence→done)`;
}

export type CodingAgentCapability =
  | 'core-loop'
  | 'invent-first'
  | 'evidence-done'
  | 'read-before-edit'
  | 'repo-map'
  | 'doom-loop'
  | 'architect-editor'
  | 'surgical-edit'
  | 'no-placeholder-twin'
  | 'local-models';

/** Gap matrix status — all Have once pack is wired. */
export function codingAgentGapStatus(): Record<CodingAgentCapability, 'Have'> {
  return {
    'core-loop': 'Have',
    'invent-first': 'Have',
    'evidence-done': 'Have',
    'read-before-edit': 'Have',
    'repo-map': 'Have',
    'doom-loop': 'Have',
    'architect-editor': 'Have',
    'surgical-edit': 'Have',
    'no-placeholder-twin': 'Have',
    'local-models': 'Have',
  };
}

/** Floor / twin markers — quality Ready must fail when these ship. */
export function looksLikePlaceholderFloor(
  files: Record<string, string>,
): { floor: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
  const products = String(files['src/data/products.ts'] || '');
  const css = String(files['src/App.css'] || '');
  const blob = `${app}\n${products}\n${css}`;
  if (/nova-storefront-spine/i.test(blob)) reasons.push('nova-storefront-spine marker');
  if (/\/\*\s*storefront\s+commerce\s+floor/i.test(blob)) reasons.push('commerce floor comment');
  if (/className=["'][^"']*storefront-floor/i.test(app)) reasons.push('storefront-floor class');
  if (/app desk-\w+/i.test(app) && /nova-product-seed/i.test(blob)) reasons.push('product seed floor');
  if (/recovery floor|hard guarantee|not original craft/i.test(blob)) reasons.push('recovery floor text');
  // Twin catalog chrome reused across brands
  if (
    /Core\s*·\s*Day\s*·\s*Reserve/i.test(app)
    || (/\bBottle One\b/i.test(products) && /\bBottle Two\b/i.test(products))
  ) {
    reasons.push('generic twin catalog names');
  }
  return { floor: reasons.length > 0, reasons };
}

/** Generic invent-first prompt for ANY website brief (not just shops). */
/** Anti-slop craft cues peers bake into invent prompts (tokens + type + order). */
export function extractCraftTokensFromBrief(brief: string): {
  paper: string;
  ink: string;
  accent: string;
  displayHint: string;
  tone: string;
} {
  const t = String(brief || '');
  const paper = /\b(?:soft\s+paper|oatmeal|cream|off[- ]?white|parchment)\b/i.test(t)
    ? 'soft paper / warm off-white canvas'
    : /\b(?:dark|ink|noir|night)\b/i.test(t)
      ? 'deep ink canvas (not neon cyber)'
      : 'brief-led canvas (commit — do not average)';
  const ink = /\b(?:ink\s+navy|deep\s+(?:ink\s+)?navy|navy)\b/i.test(t)
    ? 'deep ink navy type'
    : /\b(?:charcoal|near[- ]?black)\b/i.test(t)
      ? 'near-black ink type'
      : 'high-contrast ink from the brief';
  const accent = /\b(?:warm\s+brass|brass|gold)\b/i.test(t)
    ? 'warm brass accent (one accent only)'
    : /\b(?:sage|olive|forest)\b/i.test(t)
      ? 'sage/olive accent (one accent only)'
      : 'one accent from the brief — never rainbow';
  const displayHint = /\b(?:editorial|reading|shelf|paper|book)\b/i.test(t)
    ? 'editorial serif display + quiet sans body'
    : /\b(?:saas|dashboard|tech)\b/i.test(t)
      ? 'precise sans display + tabular body'
      : 'name real typefaces (display + body) — never "clean font"';
  const tone = /\b(?:quiet|editorial|reading|paper)\b/i.test(t)
    ? 'quiet editorial'
    : /\b(?:premium|luxury|atelier)\b/i.test(t)
      ? 'premium restrained'
      : /\b(?:playful|arcade|game)\b/i.test(t)
        ? 'playful / arcade'
        : 'commit to one tone from the brief';
  return { paper, ink, accent, displayHint, tone };
}

export function formatGenericInventOwnLookPrompt(opts: {
  brand: string;
  brief: string;
  salt?: string;
  /** From understandCreateBrief — peers put must-haves in the invent prompt. */
  goal?: string;
  audience?: string;
  primaryAction?: string;
  assumptions?: string[];
  mustHave?: string[];
  outOfScope?: string[];
  verifyChecks?: string[];
  craftOrder?: string[];
  artifactKind?: ArtifactKind;
}): string {
  const brand = String(opts.brand || 'Site').trim() || 'Site';
  const brief = String(opts.brief || '').trim();
  const salt = String(opts.salt || '').slice(-6);
  const must = (opts.mustHave || []).filter(Boolean).slice(0, 10);
  const out = (opts.outOfScope || []).filter(Boolean).slice(0, 6);
  const verify = (opts.verifyChecks || []).filter(Boolean).slice(0, 8);
  const assumptions = (opts.assumptions || []).filter(Boolean).slice(0, 6);
  const order = (opts.craftOrder || []).filter(Boolean).slice(0, 6);
  const tokens = extractCraftTokensFromBrief(brief);

  const kind = opts.artifactKind || resolveArtifactKind(brief);
  const codingLike = isNonWebArtifactKind(kind)
    || kind === 'electron'
    || briefHasCodingArtifactMarker(brief);

  if (codingLike && kind !== 'web-app' && kind !== 'product-site' && kind !== 'static-web' && kind !== 'game') {
    const entry = kind === 'electron'
      ? 'electron/main.cjs + electron/preload.cjs + src/App.jsx renderer + package.json main/scripts'
      : kind === 'extension'
        ? (/\b(?:vs\s*code|vscode|visual\s+studio\s+code)\b/i.test(brief)
          ? 'package.json (engines.vscode) + extension.js (vscode API) — no Chrome manifest'
          : 'manifest.json (MV3) + background.js + popup.html')
        : kind === 'node-api'
          ? 'src/server.js + /health'
          : kind === 'library'
            ? 'src/index.ts + package exports'
            : kind === 'python'
              ? 'main.py / app/main.py'
              : kind === 'test-suite'
                ? 'real *.test.* / *.spec.* files'
                : 'bin/cli.js + package.bin';
    const noMarketing = kind === 'electron'
      ? 'Build EXACTLY what the brief asks. Electron shell + renderer — no website, storefront, or marketing chrome.'
      : 'Build EXACTLY what the brief asks. Do NOT ship a website, storefront, hero, CTA, Vite React App.jsx, or marketing chrome.';
    return [
      `Invent a one-of-one **${kind}** artifact for **${brand}** (salt ${salt || 'new'}).`,
      noMarketing,
      opts.goal ? `GOAL: ${opts.goal}` : '',
      opts.primaryAction ? `PRIMARY ACTION: ${opts.primaryAction}` : '',
      `Entry target: ${entry}.`,
      kind === 'electron'
        ? 'CRAFT ORDER: 1) electron main/preload 2) Vite renderer App 3) package main/scripts 4) smoke'
        : 'CRAFT ORDER: 1) package/entry files 2) core behavior from must-haves 3) README usage 4) smoke/test if asked',
      must.length
        ? `MUST-HAVES (implement every item — Ready fails if any missing):\n${must.map((m, i) => `${i + 1}. ${m}`).join('\n')}`
        : '',
      out.length
        ? `OUT OF SCOPE (do not build):\n${out.map((m) => `- ${m}`).join('\n')}`
        : '- OUT OF SCOPE: landing pages, product ladders, invent floors, src/sections/*',
      verify.length
        ? `DONE CHECKS (artifact must satisfy):\n${verify.map((m) => `- ${m}`).join('\n')}`
        : '',
      brief ? `Brief:\n${brief.slice(0, 1800)}` : '',
    ].filter(Boolean).join('\n');
  }

  return [
    `Invent a one-of-one artifact for **${brand}** from the brief (salt ${salt || 'new'}).`,
    'Build EXACTLY what the brief asks — CLI, API, library, game, Electron feature, dashboard, website, or anything else. Do not force a website/store template.',
    opts.goal ? `GOAL: ${opts.goal}` : '',
    opts.audience ? `AUDIENCE: ${opts.audience}` : '',
    opts.primaryAction ? `PRIMARY ACTION: ${opts.primaryAction}` : '',
    `TONE: ${tokens.tone} — commit; do not average “modern clean”.`,
    'If the brief is a site/app UI: unique classNames, copy, layout — not a genre twin.',
    'If the brief is non-web (CLI/API/library): ship real entry files, commands, and tests — no hero/CTA/landing chrome.',
    'Do NOT paste hardcoded floors, twin shells, todo apps, or placeholder catalog chrome unless the brief asks for them.',
    'Working interactions the brief asks for must be state-backed / runnable.',
    'Shipping an unchanged seed/floor fails Ready.',
    order.length
      ? `CRAFT ORDER (follow in sequence — peers: layout→brand→sections→motion last):\n${order.map((m, i) => `${i + 1}. ${m}`).join('\n')}`
      : 'CRAFT ORDER: 1) layout shell 2) palette/type/logo 3) sections from must-haves 4) content 5) motion last',
    `DESIGN TOKENS (CSS variables — components consume tokens, never random hex spray):\n- --paper: ${tokens.paper}\n- --ink: ${tokens.ink}\n- --accent: ${tokens.accent}\n- type: ${tokens.displayHint}`,
    'LAYOUT: structural grid / placements from the brief — one signature move; whitespace as confidence. Not a centered max-width column reflex.',
    'MOTION: at most one entrance + one scroll behavior; transform/opacity only; respect prefers-reduced-motion.',
    must.length
      ? `MUST-HAVES (implement every item — Ready fails if any missing):\n${must.map((m, i) => `${i + 1}. ${m}`).join('\n')}`
      : '',
    out.length
      ? `OUT OF SCOPE (do not build):\n${out.map((m) => `- ${m}`).join('\n')}`
      : '',
    assumptions.length
      ? `ASSUMPTIONS:\n${assumptions.map((m) => `- ${m}`).join('\n')}`
      : '',
    verify.length
      ? `DONE CHECKS (your App must satisfy):\n${verify.map((m) => `- ${m}`).join('\n')}`
      : '',
    brief ? `Brief:\n${brief.slice(0, 1800)}` : '',
  ].filter(Boolean).join('\n');
}

/** True when create should queue invent-first (product UI invent — never CLI/API/library). */
export function briefWantsInventFirstCreate(brief: string): boolean {
  const t = String(brief || '');
  if (!t.trim()) return false;
  if (/\b(?:blank|nothing else|plain\s+white|white\s+(?:blank\s+)?page|empty\s+page)\b/i.test(t)
    && !/\b(?:not|n't|never|no)\b[\s\S]{0,20}\bblank\b/i.test(t)) {
    return false;
  }
  // Coding artifacts must never enter website invent-first (App.jsx + Vite inject cascade).
  const kind = resolveArtifactKind(t);
  if (isNonWebArtifactKind(kind) || kind === 'unknown' || briefHasCodingArtifactMarker(t)) {
    return false;
  }
  return (
    /\b(?:create|build|scaffold|make|new|implement|write)\b/i.test(t)
    && /\b(?:website|site|page|landing|homepage|app|store|shop|portfolio|café|cafe|saas|dashboard|game|electron|tool|script|service)\b/i.test(t)
  );
}

/** Aider-style repo map block for every agent step. */
export function formatAgentRepoMapBlock(
  files: Record<string, string>,
  brief: string,
  opts?: { limit?: number },
): string {
  if (!CODING_AGENT_PACK.repoMapEveryStep) return '';
  try {
    return buildRankedProjectMap(files, brief, { limit: opts?.limit ?? 20 });
  } catch {
    return '';
  }
}

/** Architect plan → editor apply (Aider --architect). */
export type ArchitectPlan = {
  summary: string;
  files: string[];
  steps: string[];
  raw: string;
};

export function parseArchitectPlan(text: string): ArchitectPlan | null {
  const raw = String(text || '').trim();
  if (!raw || raw.length < 40) return null;
  const files = [...raw.matchAll(/(?:^|\n)\s*[-*]\s*`?([a-zA-Z0-9_./\\-]+\.(?:jsx?|tsx?|css|html|json|md|svg))`?/gi)]
    .map((m) => m[1].replace(/\\/g, '/'))
    .slice(0, 16);
  const steps = [...raw.matchAll(/(?:^|\n)\s*(?:\d+[.)]|[-*])\s+(.+)/g)]
    .map((m) => m[1].trim())
    .filter((s) => s.length > 8 && s.length < 240)
    .slice(0, 12);
  const summary = raw.split(/\n+/).find((l) => l.trim().length > 20)?.trim().slice(0, 280) || 'Architect plan';
  return { summary, files: [...new Set(files)], steps, raw: raw.slice(0, 4000) };
}

export function formatArchitectSystemPrompt(brief: string, repoMap: string): string {
  return [
    'You are the ARCHITECT (Aider-style). Propose HOW to build — do not emit @@@FILE or TOOL: writes yet.',
    'Output:',
    '1) One-paragraph plan',
    '2) Bullet list of files to create/edit',
    '3) Numbered implementation steps (max 8)',
    'Keep it concrete for a simple high-quality website from the brief.',
    '',
    repoMap || '',
    '',
    '## Brief',
    String(brief || '').slice(0, 2000),
  ].filter(Boolean).join('\n');
}

export function formatEditorFromArchitectPrompt(
  plan: ArchitectPlan,
  brief: string,
  appPath: string,
): string {
  return [
    'You are the EDITOR. Turn the architect plan into real file writes.',
    `Write @@@FILE ${appPath} and @@@FILE src/App.css (plus data/components the plan requires).`,
    'Do not paste genre floors or twin shells. Invent unique UI from the brief + plan.',
    '',
    '## Architect plan',
    plan.summary,
    plan.files.length ? `Files: ${plan.files.join(', ')}` : '',
    ...plan.steps.map((s, i) => `${i + 1}. ${s}`),
    '',
    '## Brief',
    String(brief || '').slice(0, 1600),
  ].filter(Boolean).join('\n');
}

/** Micro bg/color/rename asks must never rewrite App structure. */
export function askIsSurgicalMicroOnly(ask: string): boolean {
  if (!CODING_AGENT_PACK.surgicalMicroEdit) return false;
  try {
    // Lazy import avoided — keep regex mirror of uiAskPlan microOnly intents.
    const t = String(ask || '').trim();
    if (!t || t.length > 220) return false;
    if (/\b(?:create|scaffold|new\s+(?:website|site|project)|rebuild|redesign)\b/i.test(t)) return false;
    return (
      /\b(?:background|bg|cream|brown|color|colour|rename|move|put\s+the\s+words?|font|bold|italic)\b/i.test(t)
      && !/\b(?:section|hero|catalog|cart|checkout|nav|footer|page\s+layout)\b/i.test(t)
    );
  } catch {
    return false;
  }
}

export function surgicalMicroEditGuardMessage(): string {
  return [
    'SURGICAL MICRO-EDIT (hard):',
    '- Change ONLY CSS tokens / asked labels — never rewrite App.jsx structure.',
    '- Never strip PRODUCTS, cart, hero, or sections on a bg/color/rename ask.',
    '- Prefer @@@FILE src/App.css (and index.css tokens) only.',
  ].join('\n');
}

/** Local/GGUF create: never hide invent failure behind floors. */
export function localCreateHonestMissRules(): string {
  if (!CODING_AGENT_PACK.localModelHonestMiss) return '';
  return [
    'LOCAL MODEL RULES:',
    '- Invent from the brief via TOOL write/patch — do not rely on hardcoded floors.',
    '- If invent fails, report an honest miss — do not Accept a twin floor as Ready.',
    '- Prefer TOOL: patch after TOOL: read; keep files small and complete.',
  ].join('\n');
}

/** Read-before-edit: path must appear in recent reads (or be new/empty). */
export function readBeforeEditAllowed(
  path: string,
  readPaths: Set<string>,
  files: Record<string, string>,
  opts?: { createCraft?: boolean },
): { ok: boolean; reason?: string } {
  if (!CODING_AGENT_PACK.readBeforeEdit) return { ok: true };
  const p = String(path || '').replace(/\\/g, '/');
  if (!p) return { ok: false, reason: 'missing path' };
  const existing = String(files[p] || '').trim();
  // Greenfield create: first write of thin App is allowed without prior read.
  if (opts?.createCraft && (!existing || existing.length < 400)) return { ok: true };
  if (!existing) return { ok: true }; // new file
  if (readPaths.has(p)) return { ok: true };
  return {
    ok: false,
    reason: `read-before-edit: TOOL: read PATH: ${p} before patch/write`,
  };
}

/** Evidence required before Done (OpenHands goal-judge). */
export function doneEvidenceGate(opts: {
  verifyOk?: boolean;
  sawLivePass?: boolean;
  sawReadyPass?: boolean;
  createCraft?: boolean;
  floorShipped?: boolean;
}): { ok: boolean; reason?: string } {
  if (!CODING_AGENT_PACK.evidenceBeforeDone) return { ok: true };
  if (opts.floorShipped) {
    return { ok: false, reason: 'done blocked — placeholder floor cannot be Ready' };
  }
  if (opts.verifyOk === false) {
    return { ok: false, reason: 'done blocked — last verify/Live failed' };
  }
  if (opts.createCraft) {
    if (!opts.sawLivePass && !opts.sawReadyPass) {
      return { ok: false, reason: 'done blocked — need TOOL: ready or TOOL: live PASS first' };
    }
  }
  return { ok: true };
}
