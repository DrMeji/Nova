/**
 * Real create/coding pipeline — implements the research “unique whys”
 * (understand → prep → scaffold → craft order → verify → premium → done).
 * Called from create.ts / agent loop; Missing-tab queue maps here.
 */

import { detectInventGenre } from '@/lib/inventBriefFidelity';
import { extractMustHaveFromBrief } from '@/lib/createIdentity';
import { hasAnyCloudChatKey } from '@/lib/cloudChat';
import { getLocalPrefs, hasProviderApiKey } from '@/lib/localPrefs';
import { shouldPreferCloudForCoding } from '@/lib/codingCloudPolicy';
import { pickSeatForPhase } from '@/lib/codingCreateSeats';
import {
  CODING_PIPELINE_STEPS,
  CODING_QUALITY_WIN,
  codingQualityFloorHit,
  formatCodingPipelineProgress,
  type CodingPipelineStep,
} from '@/lib/codingQualityWinPack';
import { looksLikePlaceholderFloor } from '@/lib/codingAgentPack';
import { displayProductName } from '@/lib/createAskContract';

export type CreateBriefPlan = {
  brief: string;
  brand: string;
  genre: string;
  productKind: 'website' | 'game' | 'utility' | 'dashboard' | 'unknown';
  /** One-sentence goal — peers (Replit/Devin/Claude) lead with this before writes. */
  goal: string;
  /** Who it is for — empty when brief does not name an audience. */
  audience: string;
  /** Main user action / flow (browse shelf, borrow, checkout…). */
  primaryAction: string;
  /** Assumptions the invent pass should not invent past. */
  assumptions: string[];
  premiumBar: string[];
  /** Concrete must-haves peers extract before any write (palette, hero, grid, flows). */
  mustHave: string[];
  /** Explicit “do not build X” fences from the brief. */
  outOfScope: string[];
  /** How Done is proven — fed to invent + Ready judge. */
  verifyChecks: string[];
  filePlan: string[];
  craftOrder: string[];
  twinRisk: boolean;
  hardGo: boolean;
};

export type CreatePrepReport = {
  ok: boolean;
  hasCloudKey: boolean;
  /** True when keyed AND policy says use cloud for this create. */
  preferCloud: boolean;
  /** True when invent/create would prefer cloud even if no key yet (honesty). */
  wantsCloud: boolean;
  localOnly: boolean;
  /** Provider ids that have a key — peers surface this before first model call. */
  keyedProviders: string[];
  /** Create/implement seat model id when set. */
  createSeat: string | null;
  /** Node version string when desktop bridge reports it. */
  nodeVersion: string | null;
  warnings: string[];
  statusLines: string[];
};

const HARD_GO =
  /\b(?:build|create|scaffold|ship|on\s+disk|do\s+it|go\s+ahead|just\s+build)\b/i;

/** Pull “do not / not X” fences — peers scope before invent. */
export function extractOutOfScopeFromBrief(brief: string): string[] {
  const t = String(brief || '');
  const out: string[] = [];
  const push = (s: string) => { if (!out.includes(s)) out.push(s); };
  if (/\b(?:not|no|never|avoid|without)\s+neon\b/i.test(t)) push('neon / cyber shell');
  if (/\b(?:not|no|never|avoid)\s+(?:a\s+)?tech\b/i.test(t) || /\bnot\s+tech\b/i.test(t)) push('generic tech landing');
  if (/\b(?:not|no|never|avoid)\s+(?:a\s+)?todo\b/i.test(t) || /\bnot\s+a\s+todo\b/i.test(t)) push('todo-list twin');
  if (/\b(?:not|no|never|avoid)\s+(?:a\s+)?tea\s+shop\b/i.test(t)) push('tea-shop leftover twin');
  if (/\b(?:not|no|never|avoid)\s+(?:a\s+)?(?:dashboard|saas)\b/i.test(t)) push('dashboard / SaaS chrome');
  if (/\b(?:not|no|never|avoid)\s+(?:multi[- ]?page|routing|react[- ]?router)\b/i.test(t)) push('multi-page router shell');
  if (/\bskip\s+plan\b/i.test(t)) push('plan-only reply without build');
  // Editorial reading shelf must not invent commerce / todo leftovers.
  if (/\b(?:reading\s+shelf|book\s+cards?|paper\s+background|soft\s+paper)\b/i.test(t)
    && !/\b(?:shop|store|cart|checkout|e-?commerce)\b/i.test(t)) {
    push('cart / checkout commerce chrome');
    push('todo-list twin');
  }
  return out.slice(0, 10);
}

/** Done checks peers write before coding — Ready must prove these. */
export function extractVerifyChecksFromBrief(brief: string, mustHave: string[]): string[] {
  const checks = [
    'brand name visible in first viewport',
    ...mustHave.slice(0, 6).map((m) => `must-have present: ${m}`),
  ];
  // "not Book One" on leather invents is a ladder forbid — not a book-shelf ask.
  if (
    /\b(?:reading\s+shelf|book\s+cards?|bookshelf|title\s*\+\s*author)\b/i.test(brief)
    && !/\bnot\s+book\s+one\b/i.test(brief)
    && !/\b(?:leather[- ]?goods|handcrafted\s+bags?)\b/i.test(brief)
  ) {
    checks.push('book titles + authors visible (not meta feature cards)');
  }
  if (/\b(?:paper|brass|navy)\b/i.test(brief)) checks.push('palette matches paper/navy/brass cues when asked');
  if (/\bgrid\s+of\s+(\d+)\b/i.test(brief)) {
    const n = brief.match(/\bgrid\s+of\s+(\d+)\b/i)?.[1];
    if (n) checks.push(`primary grid shows ${n} items`);
  }
  if (/\bsingle\s+page\b/i.test(brief)) checks.push('single-page site — no fake multi-route chrome');
  return [...new Set(checks)].slice(0, 12);
}

/** TL;DR goal — Replit/Devin/Claude lead invent with this. */
export function extractGoalFromBrief(brief: string, brand: string): string {
  const t = String(brief || '').replace(/\s+/g, ' ').trim();
  if (!t) return `Ship a working ${brand} product on disk`;
  if (/\b(?:reading\s+shelf|book\s+cards?|bookshelf)\b/i.test(t)) {
    return `Ship a polished single-page reading-shelf site for ${brand}`;
  }
  if (/\b(?:todo|task\s*list|checklist)\b/i.test(t)) {
    return `Ship a working utility/todo app for ${brand}`;
  }
  if (/\b(?:dashboard|saas|KPI)\b/i.test(t)) {
    return `Ship a dashboard product surface for ${brand}`;
  }
  if (/\b(?:game|arcade|HUD|canvas)\b/i.test(t)) {
    return `Ship a playable browser game for ${brand}`;
  }
  if (/\b(?:shop|store|cart|checkout|e-?commerce)\b/i.test(t)) {
    return `Ship an on-brief shop experience for ${brand}`;
  }
  const clipped = t.slice(0, 140).replace(/\s+\S*$/, '');
  return `Ship what the brief asks for ${brand}: ${clipped}`;
}

/** Audience when named — peers always try to name who it is for. */
export function extractAudienceFromBrief(brief: string): string {
  const t = String(brief || '');
  const m =
    t.match(/\bfor\s+(?:busy\s+)?([a-z][a-z\s-]{2,40}?)\s+(?:who|that)\b/i)
    || t.match(/\b(?:readers?|designers?|chefs?|founders?|parents?|students?|collectors?)\b/i);
  if (m) return String(m[1] || m[0]).trim().slice(0, 48);
  if (/\b(?:reading\s+shelf|book\s+cards?)\b/i.test(t)) return 'readers browsing a quiet shelf';
  if (/\b(?:shop|store|buy)\b/i.test(t)) return 'shoppers on a product site';
  return '';
}

/** Primary user action — Devin “Result” / Replit main flow. */
export function extractPrimaryActionFromBrief(brief: string): string {
  const t = String(brief || '');
  if (/\bborrow\b/i.test(t)) return 'browse shelf and borrow / return an item';
  if (/\b(?:cart|checkout|add\s+to\s+cart)\b/i.test(t)) return 'browse products and add to cart / checkout';
  if (/\b(?:book\s+cards?|reading\s+shelf|grid\s+of\s+\d+\s+book)\b/i.test(t)) {
    return 'land on hero then browse title+author book cards';
  }
  if (/\b(?:todo|task)\b/i.test(t)) return 'add / complete / clear tasks';
  if (/\b(?:sign[\s-]?in|login|auth)\b/i.test(t)) return 'sign in and reach the main surface';
  if (/\b(?:search)\b/i.test(t)) return 'search and filter listed items';
  return 'complete the main brief flow in the first viewport';
}

/** Light assumptions — peers surface these so invent does not invent past them. */
export function extractAssumptionsFromBrief(brief: string): string[] {
  const t = String(brief || '');
  const out: string[] = [];
  const push = (s: string) => { if (!out.includes(s)) out.push(s); };
  if (/\bsingle\s+page\b/i.test(t) || /\bpolished\s+single\s+page\b/i.test(t)) {
    push('one HTML page / one App route — no auth stack');
  }
  if (/\bskip\s+plan\b/i.test(t) || /\bon\s+disk\s+now\b/i.test(t)) {
    push('hard-go create — write files, do not stop at a plan');
  }
  if (/\b(?:paper|brass|navy|reading\s+shelf)\b/i.test(t) && !/\b(?:shop|cart)\b/i.test(t)) {
    push('editorial landing — mock book data is fine; no payments');
  }
  if (/\bgrid\s+of\s+(\d+)\b/i.test(t)) {
    const n = t.match(/\bgrid\s+of\s+(\d+)\b/i)?.[1];
    if (n) push(`primary grid cardinality is ${n} unless brief changes`);
  }
  return out.slice(0, 6);
}

/**
 * Understand (step 1): peer-style intent parse BEFORE any write.
 * Cursor/Claude/Codex/v0: goal + must-haves + out-of-scope + how Done is proven.
 */
export function understandCreateBrief(opts: {
  brief: string;
  brand?: string;
}): CreateBriefPlan {
  const brief = String(opts.brief || '').trim();
  const brand = String(opts.brand || '').trim() || 'Nova App';
  let genre: string = detectInventGenre(brief);
  let productKind: CreateBriefPlan['productKind'] = 'website';
  if (genre === 'game') productKind = 'game';
  else if (genre === 'utility') productKind = 'utility';
  else if (genre === 'saas') productKind = 'dashboard';
  else if (!brief) productKind = 'unknown';

  // Editorial reading / paper shelf — peers name this genre; invent-demo map stays "generic".
  const editorialLanding = /\b(?:book|shelf|paper|brass|hero|reading|portfolio)\b/i.test(brief)
    && !/\b(?:shop|store|cart|checkout|e-?commerce)\b/i.test(brief)
    && productKind === 'website';
  if (editorialLanding && (genre === 'generic' || genre === 'portfolio')) {
    genre = 'editorial';
  }

  const mustHave = extractMustHaveFromBrief(brief);
  const outOfScope = extractOutOfScopeFromBrief(brief);
  const verifyChecks = extractVerifyChecksFromBrief(brief, mustHave);
  const goal = extractGoalFromBrief(brief, brand);
  const audience = extractAudienceFromBrief(brief);
  const primaryAction = extractPrimaryActionFromBrief(brief);
  const assumptions = extractAssumptionsFromBrief(brief);

  const premiumBar: string[] = [];
  if (/premium|luxury|bespoke|chef|forge|atelier|polished|editorial/i.test(brief)) {
    premiumBar.push('premium density + on-brief copy');
  }
  if (/dashboard|saas|KPI|analytics/i.test(brief)) {
    premiumBar.push('sidebar + KPI cards + charts');
  }
  if (/game|arcade|HUD|canvas/i.test(brief)) {
    premiumBar.push('canvas HUD loop not landing twin');
  }
  if (/todo|utility|localStorage/i.test(brief) && !/\bbook|shelf|paper|brass/i.test(brief)) {
    premiumBar.push('utility chrome not storefront');
  }
  if (mustHave.length) {
    premiumBar.push(`brief must-haves (${mustHave.length}): ${mustHave[0]}`);
  }
  if (premiumBar.length === 0) premiumBar.push('unique layout + real sections from brief');

  const twinRisk =
    /knife|cutlery|gyuto|cafe|speaker|luggage|textile|atelier/i.test(brief)
    || productKind !== 'website'
    || outOfScope.length > 0
    || /\b(?:paper|brass|reading\s+shelf)\b/i.test(brief);

  // Landing / editorial sites need App+CSS+logo — not a fake products.ts catalog.
  const filePlan =
    productKind === 'game'
      ? ['src/App.jsx', 'src/App.css', 'index.html', 'package.json']
      : productKind === 'utility'
        ? ['src/App.jsx', 'src/App.css', 'src/main.jsx', 'package.json']
        : productKind === 'dashboard'
          ? ['src/App.jsx', 'src/App.css', 'src/data/metrics.ts', 'package.json']
          : editorialLanding
            ? ['src/App.jsx', 'src/App.css', 'public/logo.svg', 'package.json', 'README.md']
            : ['src/App.jsx', 'src/App.css', 'src/data/products.ts', 'public/logo.svg', 'package.json'];

  const craftOrder = [
    'layout shell / structure from must-haves',
    'palette typography logo from brief cues',
    'real sections matching must-haves',
    mustHave.some((m) => /book|grid|card/i.test(m)) ? 'book/grid cards with real copy' : 'data / content on-brief',
    'icons motion last',
  ];

  return {
    brief,
    brand,
    genre,
    productKind,
    goal,
    audience,
    primaryAction,
    assumptions,
    premiumBar,
    mustHave,
    outOfScope,
    verifyChecks,
    filePlan,
    craftOrder,
    twinRisk,
    hardGo: HARD_GO.test(brief) || /\bskip\s+plan\b/i.test(brief) || /\bon\s+disk\s+now\b/i.test(brief),
  };
}

/** Prep: keys, model seat preference, local-only honesty. */
export function prepCreateEnvironment(opts: {
  brief: string;
  fileCount?: number;
}): CreatePrepReport {
  const warnings: string[] = [];
  const statusLines: string[] = [];
  const prefs = getLocalPrefs();
  const hasCloudKey = hasAnyCloudChatKey();
  const localOnly = prefs.aiMode === 'local_only';
  // Policy with keys — false when unkeyed (shouldPreferCloud short-circuits).
  const preferCloud = shouldPreferCloudForCoding({
    fileCount: opts.fileCount ?? 8,
    message: opts.brief,
    allowFileEdits: true,
  });
  // Honesty: invent/create wants cloud craft when not local_only (peers name this).
  const wantsCloud = !localOnly && (opts.fileCount ?? 8) >= 3;

  statusLines.push(formatCodingPipelineProgress('prep'));
  if (!hasCloudKey && !localOnly) {
    warnings.push('No cloud API key — create will lean on local / may stay thin');
  }
  if (localOnly) {
    warnings.push('local_only mode — cloud coding models skipped');
  }
  if (preferCloud && hasCloudKey) {
    statusLines.push('Prep · prefer cloud coding model for multi-file create');
  } else if (wantsCloud && !hasCloudKey) {
    statusLines.push('Prep · invent wants cloud craft but no key — local invent path');
  } else if (wantsCloud && hasCloudKey && !preferCloud) {
    statusLines.push('Prep · cloud keyed; seat policy may still pick local for this brief');
  }

  // Provider key presence (any) — surface for Missing→Settings Providers.
  const providers = ['openai', 'anthropic', 'google', 'openrouter'] as const;
  const keyed = providers.filter((p) => {
    try { return hasProviderApiKey(p); } catch { return false; }
  });
  statusLines.push(
    keyed.length
      ? `Prep · provider keys ready (${keyed.join(', ')})`
      : 'Prep · no provider keys in Settings → Providers',
  );

  // Coding seat — peers (Cursor/Bolt) name the model before craft.
  let createSeat: string | null = null;
  try {
    createSeat = pickSeatForPhase('create') || pickSeatForPhase('implement');
  } catch {
    createSeat = (prefs as { stickyModelId?: string }).stickyModelId || null;
  }
  if (!createSeat) {
    createSeat = (prefs as { stickyModelId?: string }).stickyModelId || null;
  }
  statusLines.push(
    createSeat
      ? `Prep · create seat: ${createSeat}`
      : 'Prep · create seat unset — will use sticky / default coding model',
  );

  // Disk target honesty — peers confirm write root before scaffold.
  statusLines.push('Prep · write target: NOVA Projects (fresh folder per create)');

  // PC / Node / npm probe (best-effort in renderer).
  const pc = probePcCreateReady();
  statusLines.push(...pc.statusLines);
  warnings.push(...pc.warnings);

  // Never hard-block hard-go create; warnings carry honesty (Replit/Bolt style).
  return {
    ok: true,
    hasCloudKey,
    preferCloud,
    wantsCloud,
    localOnly,
    keyedProviders: keyed.map(String),
    createSeat,
    nodeVersion: pc.nodeVersion,
    warnings,
    statusLines,
  };
}

/** Read PC RAM / Node / npm availability before scaffold. */
export function probePcCreateReady(): {
  statusLines: string[];
  warnings: string[];
  nodeVersion: string | null;
} {
  const statusLines: string[] = [];
  const warnings: string[] = [];
  let nodeVersion: string | null = null;
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    const dm = (nav as Navigator & { deviceMemory?: number })?.deviceMemory;
    if (dm) statusLines.push(`Prep · PC RAM hint ~${dm}GB`);
    else statusLines.push('Prep · PC RAM hint unavailable');
  } catch {
    statusLines.push('Prep · PC probe skipped');
  }
  try {
    type Desk = {
      nodeVersion?: () => string;
      npmVersion?: () => string;
    };
    const desk = (typeof window !== 'undefined'
      ? (window as unknown as { novaDesktop?: Desk }).novaDesktop
      : undefined);
    if (desk?.nodeVersion) {
      nodeVersion = String(desk.nodeVersion() || '').trim() || null;
      statusLines.push(nodeVersion ? `Prep · Node ${nodeVersion}` : 'Prep · Node bridge returned empty');
    } else {
      statusLines.push('Prep · Node via desktop bridge when Live/npm runs');
    }
    if (desk?.npmVersion) {
      const npmV = String(desk.npmVersion() || '').trim();
      statusLines.push(npmV ? `Prep · npm ${npmV}` : 'Prep · npm bridge returned empty');
    } else {
      statusLines.push('Prep · npm checked at install / Live attach');
    }
  } catch {
    warnings.push('Node/npm availability checked at npm install step');
  }
  return { statusLines, warnings, nodeVersion };
}

/** Binder path guard — Create must not hijack an open binder project. */
export function bindBinderGuard(opts: {
  openProjectId?: string | null;
  openDiskRoot?: string | null;
  createSlug?: string;
}): { ok: boolean; detail: string } {
  const openId = String(opts.openProjectId || '');
  const root = String(opts.openDiskRoot || '');
  const slug = String(opts.createSlug || '');
  if (openId && root && slug && root.toLowerCase().includes(slug.toLowerCase())) {
    return {
      ok: false,
      detail: 'Create would collide with open binder path — using fresh NOVA Projects folder',
    };
  }
  return { ok: true, detail: 'binder clear for new create' };
}

/** Status blast for understand + prep before scaffold writes. */
export function emitCreatePipelineStart(
  plan: CreateBriefPlan,
  prep: CreatePrepReport,
  onStatus?: (msg: string) => void,
): void {
  if (!CODING_QUALITY_WIN.pipelineProgress) return;
  onStatus?.(formatCodingPipelineProgress('understand'));
  onStatus?.(
    `Understand · ${plan.productKind}/${plan.genre} · plan: ${plan.filePlan.slice(0, 3).join(', ')}…`,
  );
  if (plan.goal) onStatus?.(`Understand · goal: ${plan.goal}`);
  if (plan.audience) onStatus?.(`Understand · audience: ${plan.audience}`);
  if (plan.primaryAction) onStatus?.(`Understand · primary action: ${plan.primaryAction}`);
  onStatus?.(
    `Understand · craft order: ${plan.craftOrder[0]} → ${plan.craftOrder[1]} → …`,
  );
  if (plan.mustHave.length) {
    onStatus?.(
      `Understand · must-haves (${plan.mustHave.length}): ${plan.mustHave.slice(0, 3).join(' · ')}…`,
    );
  } else {
    onStatus?.('Understand · warn — no concrete must-haves extracted; invent may drift');
  }
  if (plan.outOfScope.length) {
    onStatus?.(`Understand · out-of-scope: ${plan.outOfScope.slice(0, 3).join(', ')}`);
  }
  if (plan.assumptions.length) {
    onStatus?.(`Understand · assumptions: ${plan.assumptions.slice(0, 2).join(' · ')}…`);
  }
  if (plan.verifyChecks.length) {
    onStatus?.(`Understand · Done checks: ${plan.verifyChecks.slice(0, 2).join(' · ')}…`);
  }
  if (plan.twinRisk) {
    onStatus?.('Understand · twin-risk genre — force unique salt / anti-storefront');
  }
  for (const line of prep.statusLines) onStatus?.(line);
  for (const w of prep.warnings) onStatus?.(`Prep warn · ${w}`);
  onStatus?.(formatCodingPipelineProgress('scaffold'));
}

export function emitCreatePipelineStep(
  step: CodingPipelineStep,
  onStatus?: (msg: string) => void,
  detail?: string,
): void {
  if (!CODING_QUALITY_WIN.pipelineProgress) return;
  onStatus?.(formatCodingPipelineProgress(step));
  if (detail) onStatus?.(detail);
}

/**
 * Live invent harnesses append a short run salt (`Brand ab12`) so folders stay unique.
 * Craft paints the human brand without the salt — Ready must not fail on the suffix alone.
 * Vale Latch 2026-10-23: Acc had "Vale Latch Atelier" but lockedProductName was
 * "Vale Latch Atelier j9yj" → codingQualityGate forever blocked → live-soft handback.
 */
export function brandCoreForVerify(brand: string): string {
  const s = String(brand || '').trim();
  if (!s) return '';
  // Prefer ask-contract display scrub (covers zl02 / j9yj / digit run tokens).
  const shown = displayProductName(s);
  if (shown && shown !== s) return shown;
  const stripped = s.replace(/\s+[a-z0-9]{3,5}$/i, '').trim();
  if (stripped && stripped !== s && /[A-Z]/.test(stripped) && stripped.split(/\s+/).length >= 2) {
    return stripped;
  }
  return s;
}

function brandVisibleInBlob(blob: string, brand: string): boolean {
  const full = String(brand || '').trim();
  if (!full) return true;
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(esc(full), 'i').test(blob)) return true;
  const core = brandCoreForVerify(full);
  if (core && core !== full && new RegExp(esc(core), 'i').test(blob)) return true;
  return false;
}

/**
 * Verify (step 5): peer Done checks against Acc files.
 * Replit/Devin/Claude: acceptance criteria must be provable in the App before Ready.
 */
export function verifyCreateBriefAgainstFiles(opts: {
  files: Record<string, string>;
  brand?: string;
  mustHave?: string[];
  verifyChecks?: string[];
  outOfScope?: string[];
}): { ok: boolean; missing: string[]; violations: string[] } {
  const app = String(opts.files['src/App.jsx'] || opts.files['src/App.tsx'] || '');
  const css = String(opts.files['src/App.css'] || '');
  // Compositional invent: brand often lives in Hero/Nav sections, not thin App shell.
  const sectionBlob = Object.entries(opts.files || {})
    .filter(([k]) => /src\/sections\/.+\.(?:jsx|tsx|css)$/i.test(k))
    .map(([, v]) => String(v || ''))
    .join('\n');
  const blob = `${app}\n${css}\n${sectionBlob}`;
  const brand = String(opts.brand || '').trim();
  const missing: string[] = [];
  const violations: string[] = [];

  if (brand && (app || sectionBlob) && !brandVisibleInBlob(blob, brand)) {
    missing.push(`brand name visible: ${brandCoreForVerify(brand) || brand}`);
  }

  for (const need of opts.mustHave || []) {
    const n = String(need || '');
    if (!n) continue;
    // Heuristic probes — peers check concrete UI, not the must-have sentence itself.
    if (/paper|oatmeal|cream|off[- ]?white/i.test(n)) {
      if (!/(?:#f[0-9a-f]{2,5}|paper|cream|oatmeal|parchment|background|--paper)/i.test(blob)) {
        missing.push(n);
      }
      continue;
    }
    if (/navy|ink/i.test(n) && /type|text|color/i.test(n)) {
      if (!/(?:navy|#0[0-3][0-9a-f]{3,4}|#1[0-3][0-9a-f]{3,4}|--ink|color:\s*#)/i.test(blob)) {
        missing.push(n);
      }
      continue;
    }
    if (/brass|gold|accent/i.test(n)) {
      if (!/(?:brass|gold|#[bc][0-9a-f]{4}|--accent|accent)/i.test(blob)) {
        missing.push(n);
      }
      continue;
    }
    if (/hero/i.test(n)) {
      if (!/(?:hero|<h1|className=["'][^"']*hero)/i.test(blob)) missing.push(n);
      continue;
    }
    if (/book|shelf|reading|title\s*\+?\s*author|grid/i.test(n)) {
      if (!/(?:book|shelf|author|title|grid|card)/i.test(blob)) missing.push(n);
      continue;
    }
    if (/exactly\s+(\d+)\s+cards?/i.test(n)) {
      const want = Number(n.match(/exactly\s+(\d+)/i)?.[1] || 0);
      if (want > 0) {
        // Compositional catalog lives in sections — count the surface, not thin App.
        const byClass = (blob.match(/className=["'][^"']*card/gi) || []).length;
        const byTitle = (blob.match(/\btitle\s*:/gi) || []).length;
        const byAuthor = (blob.match(/\bauthor\s*:/gi) || []).length;
        const byProductId = (blob.match(/\bid\s*:\s*['"]?\d+/gi) || []).length;
        const byArrayLen = Number(blob.match(/\[\s*(?:\{[\s\S]*?\}\s*,\s*){3}\{/) ? 4 : 0);
        const byProductsConst = /const\s+PRODUCTS\s*=\s*\[/i.test(blob)
          ? (blob.match(/const\s+PRODUCTS\s*=\s*\[[\s\S]*?\]/)?.[0].match(/\{\s*id\s*:/g) || []).length
          : 0;
        const cardish = Math.max(byClass, byTitle, byAuthor, byArrayLen, byProductId, byProductsConst);
        if (cardish < want && !new RegExp(`\\b${want}\\b`).test(blob)) missing.push(n);
      }
      continue;
    }
    if (/single[- ]?page/i.test(n)) {
      if (/react-router|BrowserRouter|createBrowserRouter|Routes\s*>/i.test(app)) {
        violations.push('multi-route chrome vs single-page must-have');
      }
      continue;
    }
    if (/todo|neon|tech twin|avoid/i.test(n)) {
      // handled via outOfScope / twin checks
      continue;
    }
    if (/cart|purchase|checkout/i.test(n)) {
      if (!/(?:cart|checkout|addToCart|add-to-cart)/i.test(app)) missing.push(n);
      continue;
    }
    if (/sign-in|account UI|login/i.test(n)) {
      if (!/(?:sign[\s-]?in|login|auth)/i.test(app)) missing.push(n);
      continue;
    }
  }

  for (const fence of opts.outOfScope || []) {
    if (/todo/i.test(fence) && /(?:todo|TaskItem|localStorage\.setItem\(\s*['"]todos?)/i.test(app)
      && !/book|shelf|author/i.test(app)) {
      violations.push(`out-of-scope shipped: ${fence}`);
    }
    if (/cart|commerce/i.test(fence) && /(?:addToCart|checkout|shopping-cart)/i.test(app)
      && !/mustHave.*cart/i.test((opts.mustHave || []).join(' '))) {
      // Only violate when editorial OOS and commerce chrome appears without cart must-have
      if ((opts.mustHave || []).every((m) => !/cart|purchase/i.test(m))) {
        violations.push(`out-of-scope shipped: ${fence}`);
      }
    }
  }

  // Todo twin when editorial must-haves present
  if (
    (opts.mustHave || []).some((m) => /paper|brass|book|shelf|hero/i.test(m))
    && /(?:new todo|Add todo|todos\.map|setTodos)/i.test(app)
    && !/book|shelf|author/i.test(app)
  ) {
    violations.push('todo twin shipped for editorial brief');
  }

  return {
    ok: missing.length === 0 && violations.length === 0,
    missing: missing.slice(0, 12),
    violations: violations.slice(0, 8),
  };
}

/** Premium / Ready gate — blocks Ready when floor/twin/thin. */
export function readyBlockedByCodingQuality(
  files: Record<string, string>,
  opts?: {
    brand?: string;
    mustHave?: string[];
    verifyChecks?: string[];
    outOfScope?: string[];
  },
): {
  blocked: boolean;
  reasons: string[];
} {
  if (!CODING_QUALITY_WIN.premiumRejectFloor) return { blocked: false, reasons: [] };
  const floor = codingQualityFloorHit(files);
  const placeholder = looksLikePlaceholderFloor(files);
  const reasons = [...floor.reasons, ...placeholder.reasons];
  if (opts && (opts.mustHave?.length || opts.outOfScope?.length || opts.brand)) {
    const v = verifyCreateBriefAgainstFiles({
      files,
      brand: opts.brand,
      mustHave: opts.mustHave,
      verifyChecks: opts.verifyChecks,
      outOfScope: opts.outOfScope,
    });
    for (const m of v.missing) reasons.push(`brief miss: ${m}`);
    for (const x of v.violations) reasons.push(`brief violate: ${x}`);
  }
  return { blocked: reasons.length > 0, reasons };
}

export function codingPipelineChecklist(): Array<{ id: CodingPipelineStep; label: string }> {
  return CODING_PIPELINE_STEPS.map((id) => ({
    id,
    label: id,
  }));
}
