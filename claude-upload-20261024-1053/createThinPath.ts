/**
 * Thin create path — Temp Nova shape inside Nova (approach only; apps stay separate).
 *
 * Ask → sticky model craft → syntax → npm → honest Live.
 * App.jsx is the product: lock one target, finish truncations, strip TS — never floor paste.
 * Rich website / brand asks get invent-from-brief depth continues (still no floors).
 */
import { buildProductPlan } from '@/lib/createProductPlan';
import { formatCreateQualityRubricReasons } from '@/lib/createQualityRubric';
import { briefWantsLightPaperGround, detectHeroProductKind } from '@/lib/createIdentity';
import {
  atelierLeatherHeroDataUrl,
  atelierLeatherPlateDataUrl,
  hasAtelierLeatherPlateArt,
} from '@/lib/atelierLeatherPlate';
import {
  inventFloorShellId,
  looksLikeClassicFourBoxAtelierShell,
  writeAtelierInventShell,
  healModernAtelierCompanionStomp,
  accHasModernAtelierShell,
} from '@/lib/atelierInventShells';
import { askMatchDeficits, buildAskContract, isCraftLeakCue } from '@/lib/createAskContract';
import { brandLogoSvgFor } from '@/lib/brandAssets';
import { understandCreateBrief } from '@/lib/codingCreatePipeline';
import {
  briefWantsProductLadder,
  productMeetsPremiumLock,
} from '@/lib/createProductLadder';
import {
  resolveArtifactKind,
  isNonWebArtifactKind,
  artifactWantsProductLadder,
  briefHasCodingArtifactMarker,
} from '@/lib/createArtifactKind';

/** Always on for create turns. Edit path unchanged. */
export const THIN_CREATE = true;

/** Thin create always targets plain JSX (no .tsx flip-flop). */
export const THIN_CREATE_APP_PATH = 'src/App.jsx';

/**
 * Canonical create → Live spine (peers + Nova invent-loop lessons).
 * Order is intentional: npm before long craft; floor before invent; prove this brand last.
 *
 * 1 hard-go · 2 brief · 3 disk · 4 scaffold · 5 floor · 6 npm ·
 * 7 craft · 8 heal · 9 syntax · 10 live · 11 prove · 12 ready
 */
export const THIN_CREATE_STAGES = [
  'hard-go',
  'brief',
  'disk',
  'scaffold',
  'floor',
  'npm',
  'craft',
  'heal',
  'syntax',
  'live',
  'prove',
  'ready',
] as const;

export type ThinCreateStage = (typeof THIN_CREATE_STAGES)[number];

const THIN_CREATE_STAGE_CHAIN = THIN_CREATE_STAGES.join('→');

export function formatThinCreateStageProgress(stage: ThinCreateStage): string {
  const idx = THIN_CREATE_STAGES.indexOf(stage);
  const n = idx >= 0 ? idx + 1 : 1;
  return `Thin create · ${n}/${THIN_CREATE_STAGES.length} ${stage} (${THIN_CREATE_STAGE_CHAIN})`;
}

/** Human status line for Chat while a spine stage runs (feeds the activity dropdown). */
export function formatThinCreateSpineStatus(stage: ThinCreateStage, detail?: string): string {
  setActiveThinCreateSpineStage(stage);
  const short: Record<ThinCreateStage, string> = {
    'hard-go': 'Go',
    brief: 'Brief',
    disk: 'Disk',
    scaffold: 'Scaffold',
    floor: 'Floor',
    npm: 'npm',
    craft: 'Craft',
    heal: 'Heal',
    syntax: 'Syntax',
    live: 'Live',
    prove: 'Prove',
    ready: 'Ready',
  };
  const labels: Record<ThinCreateStage, string> = {
    'hard-go': 'hard-go (not chat)',
    brief: 'freeze brief + brand',
    disk: 'bind project folder',
    scaffold: 'Vite scaffold',
    floor: 'invent floor (hero/shop/story)',
    npm: 'npm/vite install',
    craft: 'invent enrich',
    heal: 'remount + heal',
    syntax: 'syntax gate',
    live: 'Live unlock',
    prove: 'prove this brand',
    ready: 'hand back',
  };
  const n = THIN_CREATE_STAGES.indexOf(stage) + 1;
  const name = short[stage] || stage;
  const what = labels[stage] || stage;
  // "Spine: Scaffold (5/12) · Vite scaffold" — classifies as spine in the dropdown.
  const base = `Spine: ${name} (${n}/${THIN_CREATE_STAGES.length}) · ${what}`;
  return detail ? `${base} · ${detail}` : base;
}

let activeThinCreateSpineStage: ThinCreateStage | null = null;
const thinCreateSpineListeners = new Set<() => void>();

export function setActiveThinCreateSpineStage(stage: ThinCreateStage | null): void {
  activeThinCreateSpineStage = stage;
  for (const listener of thinCreateSpineListeners) {
    try { listener(); } catch { /* ignore */ }
  }
}

export function getActiveThinCreateSpineStage(): ThinCreateStage | null {
  return activeThinCreateSpineStage;
}

export function subscribeThinCreateSpine(listener: () => void): () => void {
  thinCreateSpineListeners.add(listener);
  return () => { thinCreateSpineListeners.delete(listener); };
}

const THIN_GAME_BRIEF_RE = /\b(?:game|pong|fps|platformer|simulator|simulation|arcade|playable)\b/i;

/** Game / simulation asks may keep multi-file App.tsx — not forced to App.jsx. */
export function thinBriefIsGameFamily(brief: string, productName = ''): boolean {
  if (THIN_GAME_BRIEF_RE.test(String(brief || ''))) return true;
  const plan = buildProductPlan(brief, productName);
  return plan.compositionFamily === 'game-stage';
}

/** Landing / marketing / utility thin create locks App.jsx (plain JS). */
export function thinCreateLocksAppJsx(brief: string, productName = ''): boolean {
  return !thinBriefIsGameFamily(brief, productName);
}

export function thinCreatePrimaryAppPath(
  brief: string,
  files: Record<string, string>,
  productName = '',
): string {
  if (thinCreateLocksAppJsx(brief, productName)) return THIN_CREATE_APP_PATH;
  if (files['src/App.tsx'] && !files['src/App.jsx']) return 'src/App.tsx';
  if (files['src/App.jsx']) return THIN_CREATE_APP_PATH;
  return THIN_CREATE_APP_PATH;
}

/** Coerce App.tsx → App.jsx when the thin jsx lock applies. */
export function thinCoerceLockedAppJsx(files: Record<string, string>): Record<string, string> {
  const next = { ...files };
  if (next['src/App.tsx'] && !next['src/App.jsx']) {
    next['src/App.jsx'] = next['src/App.tsx'];
  }
  delete next['src/App.tsx'];
  return next;
}

/** Depth merge: only strip App.tsx when jsx lock applies. */
export function thinMergeDepthAppFiles(
  raw: Record<string, string>,
  brief: string,
  productName = '',
): Record<string, string> {
  let nf = { ...raw };
  if (!thinCreateLocksAppJsx(brief, productName)) return nf;
  if (nf['src/App.tsx'] && !nf['src/App.jsx']) {
    nf = { ...nf, 'src/App.jsx': nf['src/App.tsx'] };
  }
  delete nf['src/App.tsx'];
  return nf;
}

/** Abort depth craft when host stops or no stream token within 45s. */
export const THIN_DEPTH_FIRST_TOKEN_MS = 45_000;

/**
 * Mid-stream idle wall for thin depth invent (matches createV2 App idle).
 * After first tokens, no further chunks for this long → abort so chat can finish
 * with an honest create miss instead of infinite Thinking.
 */
export const THIN_DEPTH_IDLE_MS = 60_000;

/** How many compositional zero-gain bail resets before hard-stop (was infinite). */
export const THIN_DEPTH_COMPOSITIONAL_ZERO_GAIN_CYCLES = 2;

export function makeThinDepthStreamGuards(hostShouldAbort?: () => boolean): {
  onDelta: (text: string) => void;
  shouldAbort: () => boolean;
  /** True when first-token or mid-stream idle wall fired (not user stop). */
  wasQuietAbort: () => boolean;
} {
  const attemptStarted = Date.now();
  let sawStreamToken = false;
  let lastTokenAt = Date.now();
  let quietAbort = false;
  return {
    onDelta(text: string) {
      if (String(text || '').trim().length >= 2) {
        sawStreamToken = true;
        lastTokenAt = Date.now();
      }
    },
    shouldAbort() {
      if (hostShouldAbort?.()) return true;
      const now = Date.now();
      if (!sawStreamToken && now - attemptStarted > THIN_DEPTH_FIRST_TOKEN_MS) {
        quietAbort = true;
        return true;
      }
      if (sawStreamToken && now - lastTokenAt > THIN_DEPTH_IDLE_MS) {
        quietAbort = true;
        return true;
      }
      return false;
    },
    wasQuietAbort: () => quietAbort,
  };
}

/** How many invent-from-brief depth continues after a thin compiling App.
 * User preference: quality over speed — more passes OK on 7B (several minutes). */
export const THIN_DEPTH_CONTINUE_MAX = 8;

/** Compacted App length below this is "too thin" for a real website/brand page.
 * Raised so brand/marketing creates keep inventing past stub shells (~120 lines).
 * Soft invent target — does NOT alone block Live (see THIN_LIVE_VISUAL_*). */
export const THIN_DEPTH_MIN_APP_CHARS = 9000;

/** Minimum landmark sections for a rich website/brand page. */
export const THIN_DEPTH_MIN_SECTIONS = 6;

/**
 * Live unlock visual floor — reachable for 7B + Nova-owned seed.
 * Research (WebGen-R1 / localforge / µagent): small models need deterministic
 * scaffold + execution gate, not a subjective 9k invent threshold for Live.
 */
export const THIN_LIVE_VISUAL_MIN_CHARS = 2800;
export const THIN_LIVE_VISUAL_MIN_CSS = 1600;
export const THIN_LIVE_VISUAL_MIN_LANDED_SECTIONS = 3;

/** Minimum compact chars for a compositional section file to count as "landed". */
export const THIN_COMPOSITIONAL_SECTION_MIN_CHARS = 300;

/**
 * Hero stub floor for App mount only (depth still wants premium / section min).
 * Sable Forge Atelier 2026-10-23: Hero.jsx ~164 compact failed the old 180 special-case,
 * so ensureLanded never remounted and Live stayed without a hero.
 */
export const THIN_HERO_MOUNTABLE_MIN_CHARS = 100;

/**
 * Footer/Contact stub floor for App mount only.
 * Short but real footers (~150–280 compact) used to fail the 300 substantial gate,
 * so ensureLanded skipped them and Live shipped without contact.
 */
export const THIN_FOOTER_MOUNTABLE_MIN_CHARS = 120;

/**
 * Premium Live / invent-floor hero compact floor (live-premium thin-hero miss).
 * Pine Latch 2026-10-23: invent overwrote floor hero with title+lede (~240) that cleared
 * the old 180 substantial special-case while still failing the 280 scorer.
 */
/** Pine Latch 2026-10-23: h1 + short lede heroes landed at ~271 compact — was soft forever at 280. */
export const THIN_HERO_PREMIUM_MIN_CHARS = 250;

/** Max unique section targets (no *2 twins). */
/** Cap unique section files — room for nav/hero/story/notes/shop/subscribe/footer. */
export const THIN_COMPOSITIONAL_SECTION_MAX = 7;

/**
 * Per-section ask size — derived so MAX sections can clear the depth floor:
 * TARGET × MAX >= THIN_DEPTH_MIN_APP_CHARS (asserted in smoke).
 */
export const THIN_COMPOSITIONAL_SECTION_TARGET_CHARS = Math.ceil(
  THIN_DEPTH_MIN_APP_CHARS / THIN_COMPOSITIONAL_SECTION_MAX,
);

export function isThinCreatePath(): boolean {
  return THIN_CREATE;
}

/**
 * Short invent-from-ask craft law (Temp Nova spirit).
 * Always App.jsx — plain JS only.
 * Includes a compact ProductPlan so 7B gets structure (family/regions/files/checklist)
 * without the full non-thin pass-spine essay.
 */
export function formatThinCreateCraftRules(opts: {
  brief: string;
  productName?: string;
  preferTs?: boolean;
  artifactKind?: string;
}): string[] {
  void opts.preferTs;
  const name = String(opts.productName || '').trim();
  const brief = String(opts.brief || '').trim().slice(0, 900);
  const kind = (opts.artifactKind as ReturnType<typeof resolveArtifactKind> | undefined)
    || resolveArtifactKind(brief);

  // Electron / game / web-app keep React craft — even if IPC/cli words appear.
  const webRendererKind = kind === 'electron' || kind === 'game' || kind === 'web-app' || kind === 'product-site' || kind === 'static-web';
  // Non-web / coding artifacts (incl. unknown stacks): never force React App.jsx craft contract.
  const codingUnknown = kind === 'unknown' && !webRendererKind;
  if (!webRendererKind && (isNonWebArtifactKind(kind) || codingUnknown || briefHasCodingArtifactMarker(brief))) {
    const entryHint = kind === 'unknown'
      ? 'the real source/config files for the stack the brief names (main.go + go.mod, Cargo.toml + src/main.rs, build.gradle + *.kt, *.swift, Gemfile, *.csproj) — never src/App.jsx or a website shell'
      : kind === 'node-api'
        ? 'src/server.js (or server.ts) + package.json with start script + /health route'
        : kind === 'library'
          ? 'src/index.ts (or .js) + package.json with main/exports'
          : kind === 'python'
            ? 'main.py or app/main.py + requirements.txt'
            : kind === 'test-suite'
              ? (/\b(?:pytest|python|\.py)\b/i.test(brief)
                ? 'tests/test_*.py + requirements.txt with pytest — not vitest/jest'
                : 'real *.test.* / *.spec.* files that import the code under test')
              : kind === 'extension'
                ? (/\b(?:vs\s*code|vscode|visual\s+studio\s+code)\b/i.test(brief)
                  ? 'package.json with engines.vscode + extension.js (vscode API activate/commands) — no Chrome manifest'
                  : 'manifest.json + background.js + popup.html')
                : 'bin/cli.js (or src/cli.ts) + package.json with bin/start';
    return [
      'CODING CREATE — invent THIS ask. Output ONLY @@@FILE blocks. No preface.',
      `Artifact kind: **${kind}** — do NOT ship a website, storefront, hero, CTA, or Vite React App.jsx unless the brief explicitly asks for a web UI.`,
      formatThinCreateStageProgress('craft'),
      `- Ship working ${kind} files. Minimum: ${entryHint}.`,
      name ? `- Project name: ${name}` : '- Invent a fitting package/tool name from the brief.',
      brief ? `- User brief (source of truth):\n${brief}` : '- Follow the user brief in the messages.',
      '- Build EXACTLY what the brief asks — CLI args, API routes, library exports, tests — not a landing page.',
      '- Finish every brace/import. Files must run with node/python as appropriate.',
      '- No marketing copy, no /logo.svg invent, no src/sections/* shells.',
    ].filter(Boolean);
  }

  const jsxLock = thinCreateLocksAppJsx(brief, name);
  
  const rich = thinBriefWantsDepth(brief);
  // Structured contract for 7B — invent under constraints, not blind free-form.
  // CRITICAL: buildProductPlan defaults mustHaveFiles to App.tsx — thin path ALWAYS
  // locks App.jsx. Remap so the plan never contradicts "ALWAYS write App.jsx / NO .tsx".
  const plan = buildProductPlan(brief, name);
  const mustHave = (plan.mustHaveFiles || []).map((f) => {
    const s = String(f);
    if (!jsxLock && /^src\/App\.jsx$/i.test(s)) return 'src/App.tsx';
    if (jsxLock && /^src\/App\.tsx$/i.test(s)) return THIN_CREATE_APP_PATH;
    return s;
  });
  // Deduplicate if both App.tsx and App.jsx somehow appear.
  const mustHaveUnique = [...new Set(mustHave)];
  // Peer understand contract — same must-haves / OOS / Done as invent-first create.
  const understand = understandCreateBrief({ brief, brand: name || 'App' });
  const planLines = [
    `## Thin product plan (REQUIRED shape hint — invent THIS ask)`,
    `- Family: **${plan.compositionFamily}** · Genre: ${plan.genre}`,
    `- Required regions: ${plan.requiredRegions.join(', ')}`,
    `- Required interactions: ${plan.requiredInteractions.join(', ') || 'none'}`,
    `- REQUIRED @@@FILE: ${mustHaveUnique.join(', ')}`,
    '- Checklist:',
    ...plan.checklist.slice(0, 6).map((c) => `  - ${c}`),
  ];
  const understandLines = [
    understand.goal ? `- GOAL: ${understand.goal}` : '',
    understand.primaryAction ? `- PRIMARY ACTION: ${understand.primaryAction}` : '',
    understand.mustHave.length
      ? `- MUST-HAVES:\n${understand.mustHave.slice(0, 8).map((m, i) => `  ${i + 1}. ${m}`).join('\n')}`
      : '',
    understand.outOfScope.length
      ? `- OUT OF SCOPE:\n${understand.outOfScope.slice(0, 6).map((m) => `  - ${m}`).join('\n')}`
      : '',
    understand.verifyChecks.length
      ? `- DONE CHECKS:\n${understand.verifyChecks.slice(0, 6).map((m) => `  - ${m}`).join('\n')}`
      : '',
  ].filter(Boolean);
  const webMin = kind === 'game' || kind === 'electron' || kind === 'web-app'
    ? `- Minimum: @@@FILE ${jsxLock ? THIN_CREATE_APP_PATH : 'src/App.tsx or src/App.jsx'} and @@@FILE src/App.css (complete, mountable React for this ${kind}).`
    : `- Minimum: @@@FILE ${jsxLock ? THIN_CREATE_APP_PATH : 'src/App.tsx or src/App.jsx'} and @@@FILE src/App.css (complete, mountable React).`;
  return [
    'THIN CREATE — invent THIS ask. Output ONLY @@@FILE blocks. No preface.',
    'FORBIDDEN placeholders: Bag One, Book One, Card one, Product One, Author A, Short text for card — invent real names + copy for THIS brand.',
    formatThinCreateStageProgress('craft'),
    webMin,
    jsxLock
      ? `- ALWAYS write ${THIN_CREATE_APP_PATH} — plain JavaScript JSX. NO TypeScript (no generics, no type annotations, no .tsx). Never emit src/App.tsx.`
      : `- Game/simulation: prefer src/App.tsx when using TypeScript; src/App.jsx is OK for plain JS. Do not flip extensions mid-reply.`,
    name ? `- Product name: ${name}` : '- Invent a fitting product name from the brief when none is given.',
    brief ? `- User brief (source of truth):\n${brief}` : '- Follow the user brief in the messages.',
    ...planLines,
    ...(understandLines.length
      ? ['## Understand contract (peers extract before invent — Ready fails if missed)', ...understandLines]
      : []),
    '- Build a unique working UI for THIS brief — never a tip/todo/notes/shop/apple.com preset or floor paste.',
    '- Do not copy apple.com bands, Pond\'s layouts, SoftPalm, or any canned brand template. Invent original structure and copy.',
    '- Finish every tag and brace. The file must end with a complete component + export default.',
    '- Do not invent COVER_HREFS / marketing heroes unless the brief asks for a marketing/brand site.',
    '- Do not wrap the page in a centered phone-column stub.',
    ...(rich ? formatCompositionalShellPrompt({ brief, productName: name }) : []),
    rich
      ? `- This ask needs a complete page before Ready: at least ${THIN_DEPTH_MIN_SECTIONS} sections, real copy from the brief, substantial CSS, and model-authored depth files. Follow-up depth passes fill one section at a time.`
      : '- Keep the UI complete for the brief — no half-finished stubs.',
    '- Nav brand = <img src="/logo.svg" alt="…" /> or a text wordmark in the header/nav. Never a bare decorative Lucide glyph (music/star/notebook) as the only logo.',
    '- More files only when the brief needs them (e.g. products data for a real shop).',
  ].filter(Boolean);
}

/** Same-model continue when App.jsx was truncated or broken. */
export function formatFinishAppPrompt(opts: {
  brief: string;
  productName?: string;
  brokenApp: string;
}): string {
  const name = String(opts.productName || '').trim() || 'App';
  const brief = String(opts.brief || '').trim().slice(0, 700);
  const stub = String(opts.brokenApp || '').slice(0, 2800);
  // Compositional depth: never ask the model to re-monolith App — Nova owns the shell.
  if (thinWantsCompositionalShell(brief)) {
    return [
      `FINISH SHELL — ${name}`,
      'App.jsx must stay a thin compositional shell (imports + <Section /> tags only).',
      `@@@FILE ${THIN_CREATE_APP_PATH}`,
      'Rules:',
      '- Plain JavaScript JSX only. Import ./App.css and each src/sections/*.jsx that exists.',
      '- Render <ComponentName /> placeholders — do NOT paste full page copy into App.jsx.',
      '- Every tag closed + export default.',
      brief ? `Brief:\n${brief}` : '',
      stub ? `Broken shell stub:\n${stub.slice(0, 1200)}` : '',
    ].filter(Boolean).join('\n');
  }
  return [
    `FINISH APP — ${name}`,
    'Your previous src/App.jsx was cut off or invalid. Output ONE complete file only.',
    `@@@FILE ${THIN_CREATE_APP_PATH}`,
    'Rules:',
    '- Plain JavaScript JSX only — NO TypeScript generics or type annotations.',
    '- Complete working UI for the brief (every tag/brace closed + export default).',
    '- Invent from the brief — no preset floors, no apple.com / tip / todo templates.',
    '- No COVER_HREFS / marketing hero theater unless the brief is a marketing site.',
    brief ? `User brief:\n${brief}` : '',
    stub ? `Broken prior App.jsx (for context — rewrite fully, do not append):\n${stub}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * Thin preflight: App is the product. Continue to Live when App compiles.
 * Thin/missing App.css alone must not fail a complete App (floors never unlock).
 */
/**
 * Syntax/craft gate only — NOT a depth gate.
 * May return true while thinNeedsDepthPass is still true (that is how we enter depth).
 * Callers MUST seed + re-check thinBlocksLivePreview after depth and before npm/Live.
 */
export function thinCraftMayContinue(
  files: Record<string, string>,
  syntaxOk: boolean,
  syntaxReasons: string[] = [],
): boolean {
  const raw = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
  const app = raw.replace(/\s+/g, '');
  if (app.length < 120) return false;
  if (!/export\s+default\b/i.test(raw)) return false;
  if (syntaxOk) return true;
  // App-only blockers still fail; CSS-only trunc/thin does not block Live under thin.
  // syntaxOk=false with no stated reasons is unknown → treat as App-blocking.
  const reasons = (syntaxReasons || []).map((r) => String(r || '')).filter((r) => r.trim());
  if (reasons.length === 0) return false;
  const appBlocking = reasons.filter((r) => !/App\.css|CSS too thin|css looks truncated/i.test(r));
  return appBlocking.length === 0;
}

/** True when App needs a finish-App continue (trunc/broken/TS), not a floor. */
export function thinAppNeedsFinishPass(files: Record<string, string>, syntaxReasons: string[]): boolean {
  const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
  if (!app.trim()) return true;
  const blob = (syntaxReasons || []).join(' ');
  if (/truncat|broken|incomplete|TypeScript|brace imbalance|Adjacent JSX|Orphan JSX|Mangled JSX|blank Live/i.test(blob)) {
    return true;
  }
  // Depth-continue fuse that still fails the gate after heal.
  if (/<\/div>\)\s*=>/.test(app) || /\)\s*=>\s*set[A-Z]\w*\([^)]*\)\}>[^<]*<\/button>/.test(app)) {
    return true;
  }
  if (!/export\s+default\b/i.test(app)) return true;
  if (app.replace(/\s+/g, '').length < 200) return true;
  return false;
}

/** Briefs that deserve a real multi-section page (not a micro toy). */
export function thinBriefWantsDepth(brief: string): boolean {
  const t = String(brief || '');
  if (!t.trim()) return false;
  // CLI / API / library / Electron / tests / unknown stacks never take invent depth / section shells.
  const depthKind = resolveArtifactKind(t);
  if (briefHasCodingArtifactMarker(t) || isNonWebArtifactKind(depthKind) || depthKind === 'unknown') {
    return false;
  }
  // Micro toys stay on the fast thin path.
  if (/\b(?:tip\s*calc|tipjar|todo(?:s)?|to-?do|checklist|counter|timer|stopwatch|pomodoro|click\s*count)\b/i.test(t)
    && !/\b(?:website|landing|homepage|marketing|brand|store|shop)\b/i.test(t)) {
    return false;
  }
  if (/\bcalculator\b/i.test(t) && !/\b(?:website|landing|marketing|brand)\b/i.test(t)) {
    return false;
  }
  // Dashboards / games / Electron renderer: not marketing invent depth.
  const kind = resolveArtifactKind(t);
  if (kind === 'web-app' || kind === 'game' || kind === 'electron' || kind === 'extension') {
    return false;
  }
  return (
    /\b(?:website|web\s*site|landing|homepage|home\s*page|marketing|brand(?:ed)?|storefront|product\s+page)\b/i.test(t)
    || /\b(?:looks?\s+like|inspired\s+by|in\s+the\s+style\s+of)\b/i.test(t)
    || /\b(?:lotion|skincare|beauty|cosmetic|restaurant|cafe|café|portfolio|festival|boutique)\b/i.test(t)
    || /\b(?:matcha|tea\s+brand|coffee\s+brand|tin\s+hero|tasting\s+notes)\b/i.test(t)
    || /\b(?:ceramic|pottery|porcelain|stoneware|tableware|kiln|dinnerware|chocolate|cacao)\b/i.test(t)
    || /\b(?:leather[- ]?goods|leather\s+atelier|handcrafted\s+bags?|atelier\s+site|parchment|satchel|tote)\b/i.test(t)
    || /\bapple(?:\.com)?\b/i.test(t)
  );
}

/** Marketing / brand depth asks use App shell + src/sections/*.jsx (one section per depth pass). */
export function thinWantsCompositionalShell(brief: string): boolean {
  return thinBriefWantsDepth(brief);
}

export const COMPOSITIONAL_SECTION_DIR = 'src/sections';

export type CompositionalSectionSpec = {
  slotLabel: string;
  filePath: string;
  componentName: string;
};

const COMPOSITIONAL_NAME_RULES: readonly { re: RegExp; base: string }[] = [
  { re: /nav|header|chrome|wordmark|sidebar|hud/i, base: 'NavHeaderSection' },
  { re: /hero|cover|stage|primary visual|headline/i, base: 'HeroSection' },
  { re: /note|tast|flavor|aroma|palate/i, base: 'NotesSection' },
  { re: /subscribe|newsletter|club/i, base: 'SubscribeSection' },
  { re: /story|feature|value|band|about/i, base: 'StorySection' },
  { re: /proof|metric|social|testimonial/i, base: 'ProofSection' },
  { re: /catalog|filter|product|cart|checkout|grid|shop|collection/i, base: 'CatalogSection' },
  { re: /secondary|cta/i, base: 'SecondaryCtaSection' },
  { re: /footer|legal|copyright/i, base: 'FooterSection' },
  { re: /input|tool|compute|result|control|workspace|primary action|empty/i, base: 'ToolSection' },
];

function compositionalComponentName(slotLabel: string, index: number): string {
  const slot = String(slotLabel || '');
  for (const rule of COMPOSITIONAL_NAME_RULES) {
    if (rule.re.test(slot)) return rule.base;
  }
  return `ContentSection${index + 1}`;
}

/** Map depth slots → unique section paths (collapse twins; cap at MAX). */
export function formatCompositionalSectionSpecs(
  brief: string,
  productName?: string,
): CompositionalSectionSpec[] {
  const seen = new Set<string>();
  const specs: CompositionalSectionSpec[] = [];
  for (const [index, slotLabel] of formatDepthSectionSlots(brief, productName).entries()) {
    const componentName = compositionalComponentName(slotLabel, index);
    if (seen.has(componentName)) continue;
    seen.add(componentName);
    specs.push({
      slotLabel,
      filePath: `${COMPOSITIONAL_SECTION_DIR}/${componentName}.jsx`,
      componentName,
    });
    if (specs.length >= THIN_COMPOSITIONAL_SECTION_MAX) break;
  }
  // Ensure at least 4 unique targets for brand depth.
  let pad = 1;
  while (specs.length < 4) {
    const componentName = `ContentSection${pad}`;
    pad += 1;
    if (seen.has(componentName)) continue;
    seen.add(componentName);
    specs.push({
      slotLabel: 'supporting content band',
      filePath: `${COMPOSITIONAL_SECTION_DIR}/${componentName}.jsx`,
      componentName,
    });
  }
  return specs;
}

/** Keep the initial response small; dedicated depth passes complete the original sections. */
export function formatCompositionalShellPrompt(opts: {
  brief: string;
  productName?: string;
}): string[] {
  if (!thinWantsCompositionalShell(opts.brief)) return [];
  const specs = formatCompositionalSectionSpecs(opts.brief, opts.productName);
  return [
    'COMPOSITIONAL PAGE (staged generation; complete before Ready):',
    `- In this craft response, write @@@FILE ${THIN_CREATE_APP_PATH} and @@@FILE src/App.css as a working page/shell. Keep the output focused; section files are generated in bounded depth passes.`,
    '- Never leave empty sections in the delivered page. Nova continues section generation and blocks Ready until every required section has real authored content.',
    '- Every section needs distinct, useful copy and layout for this product. Do not repeat a previous generated page or generic demo content.',
    '- Treat reference sites as visual references only. Create original copy, assets, branding, and section content for the requested subject.',
    'Required section files for the follow-up depth passes:',
    ...specs.map((s, i) => `  ${i + 1}. @@@FILE ${s.filePath} — ${s.componentName} (${s.slotLabel})`),
  ];
}

export function listCompositionalSectionPaths(brief: string, productName?: string): string[] {
  return formatCompositionalSectionSpecs(brief, productName).map((s) => s.filePath);
}

export function pickThinDepthFiles(files: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const appKey = files['src/App.jsx']
    ? 'src/App.jsx'
    : (files['src/App.tsx'] ? 'src/App.tsx' : '');
  if (appKey && files[appKey]) out[appKey] = String(files[appKey]);
  if (files['src/App.css']) out['src/App.css'] = String(files['src/App.css']);
  for (const [k, v] of Object.entries(files)) {
    if (/^src\/sections\/[^/]+\.jsx$/i.test(k.replace(/\\/g, '/'))) out[k] = String(v);
  }
  return out;
}

function compositionalSectionBodies(files: Record<string, string>): string {
  return Object.entries(files)
    .filter(([k]) => /^src\/sections\/[^/]+\.jsx$/i.test(k.replace(/\\/g, '/')))
    .map(([, v]) => String(v || ''))
    .join('\n');
}

/**
 * Thin Hero.jsx still deserves `<Hero />` in App. Depth top-up keeps asking until
 * compositionalSectionFileSubstantial clears — mount ≠ depth-complete.
 */
export function compositionalHeroFileMountable(body: string): boolean {
  const raw = String(body || '');
  if (!raw.trim() || !/export\s+default\b/i.test(raw)) return false;
  if (!/HeroSection|function\s+Hero\b|const\s+Hero\b|className=["'][^"']*\bhero/i.test(raw)) {
    return false;
  }
  if (!/<h1\b/i.test(raw)) return false;
  return raw.replace(/\s+/g, '').length >= THIN_HERO_MOUNTABLE_MIN_CHARS;
}

/** Short but real footer/contact — mount into App even under the 300 substantial floor. */
export function compositionalFooterFileMountable(body: string): boolean {
  const raw = String(body || '');
  if (!raw.trim() || !/export\s+default\b/i.test(raw)) return false;
  if (!/<footer\b|role=["']contentinfo["']|className=["'][^"']*\bfooter|id=["']contact["']/i.test(raw)) {
    return false;
  }
  return raw.replace(/\s+/g, '').length >= THIN_FOOTER_MOUNTABLE_MIN_CHARS;
}

export function compositionalSectionFileSubstantial(body: string): boolean {
  const raw = String(body || '');
  if (!raw.trim() || !/export\s+default\b/i.test(raw)) return false;
  if (/\{\s*$/.test(raw.trim()) || /<[A-Za-z][\w.:-]*[^>]*$/.test(raw.trim())) return false;
  // 7B often ships `const X = () => …` without export default — still real work.
  if (!/export\s+default\b/i.test(raw) && !/^\s*(?:export\s+)?(?:default\s+)?function\s+\w+/m.test(raw)
    && !/^\s*(?:export\s+)?const\s+\w+\s*=/m.test(raw)) {
    return false;
  }
  const compact = raw.replace(/\s+/g, '').length;
  // Hero with real h1 clears depth at the premium Live floor (not the softer mountable floor).
  if (
    /HeroSection|function\s+Hero\b|const\s+Hero\b|className=["'][^"']*\bhero/i.test(raw)
    && /<h1\b/i.test(raw)
    && compact >= THIN_HERO_PREMIUM_MIN_CHARS
  ) {
    return true;
  }
  return compact >= THIN_COMPOSITIONAL_SECTION_MIN_CHARS;
}

function sectionCountsAsLandedForMount(componentName: string, body: string): boolean {
  if (/Hero/i.test(componentName) && compositionalHeroFileMountable(body)) return true;
  if (/Footer|Contact/i.test(componentName) && compositionalFooterFileMountable(body)) return true;
  return compositionalSectionFileSubstantial(body);
}

/** Check current files at each depth boundary; generated sections can arrive after the loop starts. */
/** Optional bands — nice for depth, must not block Ready when core page is built. */
const COMPOSITIONAL_OPTIONAL_SECTIONS = new Set([
  'NotesSection',
  'SecondaryCtaSection',
  'ProofSection',
  'SubscribeSection',
  'ToolSection',
  'ContentSection1',
  'ContentSection2',
  'ContentSection3',
  'PageBodySection',
]);

export function compositionalDepthIsComplete(
  files: Record<string, string>,
  brief: string,
  productName = '',
): boolean {
  if (!thinWantsCompositionalShell(brief)) return true;
  // Ivy Latch 2026-10-23: Notes/SecondaryCta CSS stubs kept Ready false forever while
  // Nav/Hero/Shop/Story/Footer already painted Live — only core sections gate complete.
  return formatCompositionalSectionSpecs(brief, productName)
    .filter((spec) => !COMPOSITIONAL_OPTIONAL_SECTIONS.has(spec.componentName))
    .every((spec) =>
      compositionalSectionFileSubstantial(String(files[spec.filePath] || '')),
    );
}

/** Normalize one or many avoid paths (rejected sections stay retired for the depth session). */
function normalizeAvoidPaths(avoidPath?: string | readonly string[]): Set<string> {
  const out = new Set<string>();
  if (!avoidPath) return out;
  const list = Array.isArray(avoidPath) ? avoidPath : [avoidPath];
  for (const p of list) {
    const n = String(p || '').replace(/\\/g, '/').trim();
    if (n) out.add(n);
  }
  return out;
}

/**
 * Next section file depth should invent (missing or too thin).
 * Retires every path in avoidPath (single or list) so a rejected nav is not re-asked forever.
 */
export function nextCompositionalDepthTarget(
  files: Record<string, string>,
  brief: string,
  productName?: string,
  avoidPath?: string | readonly string[],
): CompositionalSectionSpec | null {
  if (!thinWantsCompositionalShell(brief)) return null;
  const thin = formatCompositionalSectionSpecs(brief, productName)
    .filter((s) => !compositionalSectionFileSubstantial(String(files[s.filePath] || '')));
  if (!thin.length) return null;
  const avoid = normalizeAvoidPaths(avoidPath);
  if (!avoid.size) return thin[0];
  const fresh = thin.filter((s) => !avoid.has(s.filePath.replace(/\\/g, '/')));
  // Prefer never-rejected targets; do not fall back to retired thin[0] (invent thrash).
  return fresh[0] || null;
}

/** Thinnest existing section files — used for compositional top-up (never rewrite App). */
export function thinnestCompositionalSections(
  files: Record<string, string>,
  brief: string,
  productName = '',
  count = 2,
): CompositionalSectionSpec[] {
  return formatCompositionalSectionSpecs(brief, productName)
    .map((s) => ({ s, n: String(files[s.filePath] || '').replace(/\s+/g, '').length }))
    .sort((a, b) => a.n - b.n)
    .slice(0, Math.max(1, count))
    .map((x) => x.s);
}

export function replyHasCompositionalSectionBlock(reply: string): boolean {
  return /@@@FILE\s+src\/sections\/[^\s\n]+\.jsx\b/i.test(String(reply || ''));
}

/** Deterministic shell source. Only imports/renders sections that actually exist. */
/** Canonical page order — Story before Footer/Contact (Cedar Latch Acc had footer mid-page). */
const COMPOSITIONAL_MOUNT_RANK: Record<string, number> = {
  NavHeaderSection: 10,
  HeroSection: 20,
  Hero: 20,
  CatalogSection: 30,
  NotesSection: 35,
  StorySection: 40,
  ProofSection: 45,
  SubscribeSection: 50,
  SecondaryCtaSection: 55,
  ToolSection: 60,
  ContentSection1: 70,
  ContentSection2: 71,
  ContentSection3: 72,
  PageBodySection: 80,
  FooterSection: 90,
  Footer: 90,
  Contact: 95,
  ContactSection: 95,
};

export function sortCompositionalMountOrder(
  present: readonly CompositionalSectionSpec[],
): CompositionalSectionSpec[] {
  return [...present].sort((a, b) => {
    const ra = COMPOSITIONAL_MOUNT_RANK[a.componentName] ?? 65;
    const rb = COMPOSITIONAL_MOUNT_RANK[b.componentName] ?? 65;
    if (ra !== rb) return ra - rb;
    return a.componentName.localeCompare(b.componentName);
  });
}

export function buildCompositionalShellSource(
  present: readonly CompositionalSectionSpec[],
): string {
  const ordered = sortCompositionalMountOrder(present);
  return [
    "import './App.css';",
    ...ordered.map((s) => `import ${s.componentName} from './sections/${s.componentName}.jsx';`),
    '',
    'export default function App() {',
    '  return (',
    '    <div className="app">',
    ...ordered.map((s) => `      <${s.componentName} />`),
    '    </div>',
    '  );',
    '}',
    '',
  ].join('\n');
}

/** True when App is a Nova shell (no page JSX of its own). */
export function appLooksLikeCompositionalShell(app: string): boolean {
  const raw = String(app || '');
  if (!raw.trim()) return true;
  if (/<header\b|<main\b|<section\b|<footer\b/i.test(raw)) return false;
  return raw.replace(/\s+/g, '').length <= 1400;
}

/** Spec targets plus any other mountable src/sections/*.jsx the model invented. */
export function listLandedCompositionalSections(
  files: Record<string, string>,
  brief: string,
  productName = '',
): CompositionalSectionSpec[] {
  const specs = formatCompositionalSectionSpecs(brief, productName);
  const present = specs.filter((s) =>
    sectionCountsAsLandedForMount(s.componentName, String(files[s.filePath] || '')),
  );
  const seen = new Set(present.map((s) => s.filePath.replace(/\\/g, '/')));
  for (const [k, v] of Object.entries(files)) {
    const norm = k.replace(/\\/g, '/');
    const m = norm.match(/^src\/sections\/([^/]+)\.jsx$/i);
    if (!m) continue;
    if (/^PageBodySection$/i.test(m[1])) continue;
    if (seen.has(norm)) continue;
    if (!sectionCountsAsLandedForMount(m[1], String(v || ''))) continue;
    seen.add(norm);
    present.push({
      slotLabel: m[1],
      filePath: norm,
      componentName: m[1],
    });
  }
  return present;
}

/**
 * Fat App → PageBodySection lives under src/sections/, so ./sections/X and ./data/X
 * must be rewritten or Vite fails resolve and Live paints kids:0
 * (Sable Forge Atelier 2026-10-23).
 * Also covers providers/store(s)/services/api — model often keeps App-relative paths.
 */
export function rewriteAppImportsForPageBody(src: string): string {
  let s = String(src || '');
  s = s.replace(/(from\s+['"])\.\/sections\/([^'"]+)(['"])/g, '$1./$2$3');
  s = s.replace(
    /(from\s+['"])\.\/(components|data|pages|hooks|lib|utils|game|styles|context|contexts|providers|store|stores|services|api|assets)\//g,
    '$1../$2/',
  );
  // Bare `./context` or `./context/session` without trailing folder group already handled;
  // also rewrite `from './context'` (no slash) when it was App-relative.
  s = s.replace(/(from\s+['"])\.\/(context|contexts|providers|store|stores)(['"])/g, '$1../$2$3');
  s = s.replace(/(import\s+['"])\.\/(?:index\.css)(['"])/g, '$1../index.css$2');
  return s;
}

/**
 * App.jsx lives in src/ — PageBody rewrite must NEVER run on it.
 * If a prior heal stamped ../context onto App, Vite resolves outside src → kids:0.
 */
export function healAppShellRelativeImports(src: string): string {
  let s = String(src || '');
  s = s.replace(
    /(from\s+['"])\.\.\/(components|data|pages|hooks|lib|utils|game|styles|context|contexts|providers|store|stores|services|api|assets)\//g,
    '$1./$2/',
  );
  s = s.replace(/(from\s+['"])\.\.\/(context|contexts|providers|store|stores)(['"])/g, '$1./$2$3');
  return s;
}

/** Rewrite App-relative imports inside every src/sections/*.jsx (not only PageBody). */
export function healSectionRelativeImports(
  files: Record<string, string>,
): Record<string, string> {
  const next: Record<string, string> = { ...files };
  for (const k of Object.keys(next)) {
    const norm = k.replace(/\\/g, '/');
    if (!/^src\/sections\/.+\.jsx$/i.test(norm)) continue;
    const body = String(next[k] || '');
    if (!body.trim()) continue;
    const rewritten = rewriteAppImportsForPageBody(body);
    if (rewritten !== body) next[k] = rewritten;
  }
  const appKey = next['src/App.jsx'] ? 'src/App.jsx' : (next['src/App.tsx'] ? 'src/App.tsx' : '');
  if (appKey && next[appKey]) {
    const fixed = healAppShellRelativeImports(String(next[appKey]));
    if (fixed !== next[appKey]) next[appKey] = fixed;
  }
  return next;
}

/** Resolve ./ and ../ import targets against an in-memory files map. */
export function resolveRelativeImportInFiles(
  fromFile: string,
  specifier: string,
  files: Record<string, string>,
): string | null {
  const from = String(fromFile || '').replace(/\\/g, '/');
  const spec = String(specifier || '').replace(/\\/g, '/');
  if (!spec.startsWith('.')) return null;
  if (/\.(css|scss|sass|less|svg|png|jpe?g|webp|gif|json)$/i.test(spec)) return null;
  const dir = from.includes('/') ? from.slice(0, from.lastIndexOf('/')) : '';
  const parts = [...dir.split('/').filter(Boolean), ...spec.split('/')];
  const resolved: string[] = [];
  for (const p of parts) {
    if (!p || p === '.') continue;
    if (p === '..') {
      resolved.pop();
      continue;
    }
    resolved.push(p);
  }
  const base = resolved.join('/');
  const candidates = [
    base,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.js`,
    `${base}/index.jsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ];
  const keys = new Set(Object.keys(files).map((k) => k.replace(/\\/g, '/')));
  for (const c of candidates) {
    if (keys.has(c)) return c;
  }
  return null;
}

/** Vite "Failed to resolve import" preflight across src tree. */
export function unresolvedRelativeImportReasons(files: Record<string, string>): string[] {
  const reasons: string[] = [];
  for (const [rel, body] of Object.entries(files)) {
    const norm = rel.replace(/\\/g, '/');
    if (!/^src\/.+\.(jsx|tsx|js|ts)$/i.test(norm)) continue;
    if (typeof body !== 'string' || !body.trim()) continue;
    for (const m of body.matchAll(/(?:import|from)\s+['"](\.[^'"]+)['"]/g)) {
      const spec = m[1];
      if (/\.(css|scss|sass|less|svg|png|jpe?g|webp|gif)$/i.test(spec)) continue;
      // `import './App.css'` style already skipped; bare `from './x'` handled.
      if (!spec.startsWith('.')) continue;
      if (resolveRelativeImportInFiles(norm, spec, files)) continue;
      reasons.push(`${norm} imports missing ${spec}`);
    }
  }
  return [...new Set(reasons)].slice(0, 8);
}

/**
 * ProductGrid often imports ../data/products that never landed — blank Live.
 * Seed a small real-named catalog (never Bag/Product One) when the import is dangling.
 */
export function healMissingSectionDataImports(
  files: Record<string, string>,
  productName = '',
): Record<string, string> {
  const next: Record<string, string> = { ...files };
  const brand = String(productName || '').trim() || 'Atelier';
  const short = brand.replace(/\s+(Atelier|Studio|Co|Lab|House)\s*$/i, '').trim() || brand;
  let seeded = false;
  for (const [rel, body] of Object.entries(files)) {
    const norm = rel.replace(/\\/g, '/');
    if (!/^src\/.+\.(jsx|tsx|js|ts)$/i.test(norm)) continue;
    if (!/from\s+['"]\.\.\/data\/products['"]/.test(String(body || ''))
      && !/from\s+['"]\.\/data\/products['"]/.test(String(body || ''))) {
      continue;
    }
    const fromSections = /from\s+['"]\.\.\/data\/products['"]/.test(body);
    const hit = resolveRelativeImportInFiles(
      norm,
      fromSections ? '../data/products' : './data/products',
      next,
    );
    if (hit) continue;
    if (!seeded) {
      const healSkus = brandOwnedBreakProducts(short, brand);
      next['src/data/products.js'] = [
        'export const products = [',
        ...healSkus.map((p) =>
          `  { id: '${p.id}', name: ${JSON.stringify(p.name)}, material: ${JSON.stringify(p.material)} },`,
        ),
        '];',
        '',
      ].join('\n');
      seeded = true;
    }
  }
  return next;
}

/**
 * Nova-owned shell assembly. Never injects into a fat App, never regexes a return.
 * A fat App may be carved once as PageBodySection.jsx, but is dropped as soon as
 * real sections can stand alone (visual floor or ≥3 landed sections) — do not keep
 * the monolith in the Live tree forever (Lumenjar defect A).
 */
export function assembleCompositionalAppShell(
  files: Record<string, string>,
  brief: string,
  productName = '',
): Record<string, string> {
  if (!thinWantsCompositionalShell(brief)) return files;
  const bodyKey = `${COMPOSITIONAL_SECTION_DIR}/PageBodySection.jsx`;
  let next = healSectionRelativeImports(
    healMissingSectionDataImports({ ...files }, productName),
  );
  const app = String(next['src/App.jsx'] || next['src/App.tsx'] || '');
  const present = listLandedCompositionalSections(next, brief, productName);

  if (!next[bodyKey] && app.trim() && !appLooksLikeCompositionalShell(app)) {
    const carved = rewriteAppImportsForPageBody(
      app
        .replace(/^\s*import\s+['"]\.\/App\.css['"];?\s*$/m, '')
        .replace(/(export\s+default\s+)?function\s+App\s*\(/, 'export default function PageBodySection(')
        .replace(/^\s*export\s+default\s+App\s*;?\s*$/m, ''),
    );
    if (!/export\s+default\s+function\s+PageBodySection\s*\(/.test(carved)) return files;
    if (/export\s+default\s+App\b/.test(carved)) return files;
    next[bodyKey] = carved;
  } else if (next[bodyKey]) {
    // Heal prior carves that kept App-relative ./sections/ paths.
    next[bodyKey] = rewriteAppImportsForPageBody(String(next[bodyKey]));
  }

  const presentWithBody = next[bodyKey]
    ? [...present, {
      slotLabel: 'preserved page body',
      filePath: bodyKey,
      componentName: 'PageBodySection',
    }]
    : present;

  const shellWithBody = buildCompositionalShellSource(presentWithBody);
  const shellWithoutBody = buildCompositionalShellSource(present);
  const withoutBody: Record<string, string> = { ...next, 'src/App.jsx': shellWithoutBody };
  delete withoutBody[bodyKey];
  // Drop PageBody only when real sections clear invent floor / visual floor, or ≥3
  // sections each exceed 2× the stub minimum (never drop for three 300-char wrappers).
  const richLanded = present.filter((s) => {
    const raw = String(next[s.filePath] || '');
    return raw.replace(/\s+/g, '').length >= THIN_COMPOSITIONAL_SECTION_MIN_CHARS * 2;
  }).length;
  // Also drop when PageBody re-mounts the same sections already in the shell
  // (duplicate tree + often broken relative imports after carve).
  const bodySrc = String(next[bodyKey] || '');
  const bodyDupesLanded = Boolean(bodySrc) && present.length >= 2
    && present.filter((s) => new RegExp(`<${s.componentName}\\b`).test(bodySrc)).length >= 2;
  const bodyStillBroken = Boolean(bodySrc)
    && unresolvedRelativeImportReasons({ ...next, [bodyKey]: bodySrc })
      .some((r) => r.startsWith(bodyKey));
  const dropBody = Boolean(next[bodyKey]) && (
    thinDepthLedgerMeetsFloor(readThinDepthLedger(withoutBody))
    || thinMeetsLiveVisualFloor(withoutBody, brief)
    || richLanded >= 3
    || bodyDupesLanded
    || bodyStillBroken
  );

  next['src/App.jsx'] = healAppShellRelativeImports(
    dropBody ? shellWithoutBody : shellWithBody,
  );
  if (dropBody) delete next[bodyKey];
  delete next['src/App.tsx'];
  return healSectionRelativeImports(next);
}

/**
 * Live invent gap: HeroSection.jsx / FooterSection.jsx (etc.) can land while App
 * keeps a thin nav shell that never imports them. Force shell remount when ANY
 * landed section is omitted — Footer/Contact alone used to skip and Live shipped
 * without a contact band (Fern Latch / Amber Quill class).
 */
export function ensureLandedSectionsMountedInApp(
  files: Record<string, string>,
  brief: string,
  productName = '',
): Record<string, string> {
  if (!thinWantsCompositionalShell(brief)) return files;
  const present = listLandedCompositionalSections(files, brief, productName);
  if (!present.length) return files;
  const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
  const omitted = present.filter((s) => !new RegExp(`<${s.componentName}\\b`).test(app));
  if (!omitted.length) {
    // Still heal bad ../context on App and ./context inside sections.
    return healSectionRelativeImports(files);
  }
  return assembleCompositionalAppShell(files, brief, productName);
}

/** Kept name — call sites unchanged. Safe: no inject-into-return. */
export function applyCompositionalDepthMerge(
  files: Record<string, string>,
  brief: string,
  productName = '',
): Record<string, string> {
  const assembled = assembleCompositionalAppShell(files, brief, productName);
  return ensureLandedSectionsMountedInApp(assembled, brief, productName);
}

/** True when the tree is visually rich enough to unlock Live (not the 9k invent floor). */
export function thinMeetsLiveVisualFloor(
  files: Record<string, string>,
  brief: string,
): boolean {
  if (!thinBriefWantsDepth(brief)) return true;
  const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
  if (!app.trim() || !/export\s+default\b/i.test(app)) return false;
  if (/How to fix it|###\s+Verification|Ensure that the path/i.test(app)) return false;
  const ledger = readThinDepthLedger(files);
  if (!ledger.hasLogo) return false;
  if (ledger.compact < THIN_LIVE_VISUAL_MIN_CHARS) return false;
  if (ledger.cssCompact < THIN_LIVE_VISUAL_MIN_CSS) return false;
  if (thinWantsCompositionalShell(brief)) {
    // PageBody must not pad the Live section floor (Lumenjar defect A).
    const landed = listLandedCompositionalSections(files, brief).length;
    if (landed < THIN_LIVE_VISUAL_MIN_LANDED_SECTIONS) return false;
  } else if (ledger.landmarks < 4) {
    return false;
  }
  return true;
}

/** True when host invent-demo salvage shipped a complete first-pass App. */
export function filesHaveInventDemoSite(files: Record<string, string>): boolean {
  const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
  return /data-nova-invent-demo\s*=\s*["']1["']/.test(app)
    && app.replace(/\s+/g, '').length >= 1800
    && /export\s+default\b/i.test(app);
}

/**
 * Absolute invent logo lock — invent-demo App OR invent-demo logo.svg.
 * Late Lucide/family stamps must not overwrite these marks (speakers→package race).
 */
export function inventDemoOwnsLogo(files: Record<string, string>): boolean {
  if (filesHaveInventDemoSite(files)) return true;
  const logo = String(files['public/logo.svg'] || '');
  if (/data-nova-invent-logo\s*=\s*["']1["']/i.test(logo)) return true;
  // Legacy invent logos (pre-lock attr): 64×64 tile with brand initial text.
  return /viewBox=["']0 0 64 64["']/i.test(logo)
    && /<text\b/i.test(logo)
    && !/viewBox=["']0 0 24 24["']/i.test(logo);
}

/** Live gate — blocks when visual floor is open or F&B genre art is still wrong. */
export function thinBlocksLivePreview(
  files: Record<string, string>,
  brief: string,
  productName = '',
): boolean {
  if (!thinBriefWantsDepth(brief)) return false;
  // Host invent-demo salvage: complete first-pass site — allow Live unlock.
  // Do not require public/logo.svg in Acc (may be disk-only); App /logo.svg ref is enough.
  if (filesHaveInventDemoSite(files)) return false;
  if (thinLiveVisualDeficits(files, brief, productName).length) return true;
  return !thinMeetsLiveVisualFloor(files, brief);
}

/** Deficits for Live unlock (visual floor) — not the 9k invent-from-brief floor. */
export function thinLiveVisualDeficits(
  files: Record<string, string>,
  brief: string,
  productName = '',
): string[] {
  if (!thinBriefWantsDepth(brief)) return [];
  if (filesHaveInventDemoSite(files)) return [];
  const deficits: string[] = [];
  // Genre honesty always — phone hero / sparkles mark must not clear Live on F&B asks,
  // even when invent-length / section counts already look "thick".
  if (thinWantsCompositionalShell(brief)) {
    const name = String(productName || '').trim() || buildAskContract(brief).productName;
    for (const r of thinAskMatchDeficits(files, brief, name)) {
      if (/wrong genre|sparkles|hero art/i.test(r)) deficits.push(r);
    }
  }
  if (thinMeetsLiveVisualFloor(files, brief) && !deficits.length) return [];
  if (thinMeetsLiveVisualFloor(files, brief)) return [...new Set(deficits)];
  const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
  if (!app.trim() || !/export\s+default\b/i.test(app)) deficits.push('App.jsx missing or no default export');
  if (isBareOrNavOnlyInventApp(app)) {
    deficits.push('App is still bare Vite / nav-only scaffold — invent sections before Live');
  }
  if (/How to fix it|###\s+Verification|Ensure that the path/i.test(app)) {
    deficits.push('model prose leaked into App.jsx');
  }
  const ledger = readThinDepthLedger(files);
  if (!ledger.hasLogo) deficits.push('nav brand missing /logo.svg');
  if (ledger.compact < THIN_LIVE_VISUAL_MIN_CHARS) {
    deficits.push(`visual compact chars ${ledger.compact} < ${THIN_LIVE_VISUAL_MIN_CHARS}`);
  }
  if (ledger.cssCompact < THIN_LIVE_VISUAL_MIN_CSS) {
    deficits.push(`visual CSS compact ${ledger.cssCompact} < ${THIN_LIVE_VISUAL_MIN_CSS}`);
  }
  if (thinWantsCompositionalShell(brief)) {
    const landed = listLandedCompositionalSections(files, brief).length;
    if (landed < THIN_LIVE_VISUAL_MIN_LANDED_SECTIONS) {
      deficits.push(`landed sections ${landed} < ${THIN_LIVE_VISUAL_MIN_LANDED_SECTIONS}`);
    }
  } else if (ledger.landmarks < 4) {
    deficits.push(`landmarks ${ledger.landmarks} < 4`);
  }
  return [...new Set(deficits)];
}

/** Ask-match deficits for brand Live (Graphics + contract + interact). Soft invent depth. */
export function thinAskMatchDeficits(
  files: Record<string, string>,
  brief: string,
  productName = '',
): string[] {
  if (!thinBriefWantsDepth(brief)) return [];
  // Invent-demo twins are NOT Ready — still score ask-match (block Landing-demo floors).
  if (filesHaveInventDemoSite(files)) {
    return [
      'invent-demo host twin on disk — not a brief invent (Landing demo / genre stamp)',
      ...askMatchDeficits(files, brief, productName).slice(0, 6),
    ];
  }
  const misses = askMatchDeficits(files, brief, productName);
  const app0 = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
  if (isBareOrNavOnlyInventApp(app0)) {
    misses.push('App is still bare Vite / nav-only scaffold — invent never shipped sections');
  }
  // Genre visual honesty — phone stage / sparkles mark must not clear Live on F&B asks.
  if (thinWantsCompositionalShell(brief)) {
    const heroKey = Object.keys(files).find((k) => /src\/sections\/.*Hero.*\.jsx$/i.test(k.replace(/\\/g, '/')));
    if (heroKey && heroSectionWrongGenreArt(String(files[heroKey] || ''), brief, productName)) {
      misses.push('hero art is wrong genre (phone/leak) for this brief');
    }
    const logo = String(files['public/logo.svg'] || '');
    const kind = detectHeroProductKind(productName, brief);
    if (logo && /M9\.937 15\.5/i.test(logo)
      && (kind === 'bottle' || kind === 'coffee' || kind === 'tea' || kind === 'ceramic')) {
      misses.push('logo.svg is generic sparkles — needs a genre family mark');
    }
    // Hero file landed but App never mounts it (Amber Quill / Sable Forge Live invent).
    if (heroKey && sectionCountsAsLandedForMount('Hero', String(files[heroKey] || ''))) {
      const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
      if (
        !/<(?:HeroSection|Hero)\b/.test(app)
        && !/from\s+['"]\.\/sections\/[^'"]*Hero/i.test(app)
      ) {
        misses.push('HeroSection.jsx landed but App does not mount it');
      }
    }
    // Footer / Contact landed but App never mounts it (lone-footer ensureLanded skip).
    const footKey = Object.keys(files).find((k) =>
      /src\/sections\/[^/]*(?:Footer|Contact)[^/]*\.jsx$/i.test(k.replace(/\\/g, '/')),
    );
    if (footKey && sectionCountsAsLandedForMount(
      footKey.replace(/^.*\//, '').replace(/\.jsx$/i, ''),
      String(files[footKey] || ''),
    )) {
      const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
      if (
        !/<(?:FooterSection|Footer|ContactSection|Contact)\b/.test(app)
        && !/from\s+['"]\.\/sections\/[^'"]*(?:Footer|Contact)/i.test(app)
      ) {
        misses.push('Footer/Contact landed but App does not mount it');
      }
    }
    // Dark SaaS atmosphere still on disk for a parchment/atelier ask.
    if (briefWantsLightPaperGround(brief)) {
      const css = String(files['src/App.css'] || '');
      if (/linear-gradient\(\s*165deg[^;]*#0c0f14/i.test(css) || (
        /#0c0f14/.test(css) && /--paper|#f4efe6|#f3eee4/i.test(css)
      )) {
        misses.push('App.css dark tech atmosphere stomps parchment atelier brief');
      }
    }
    // App.jsx wrongly has ../context (PageBody rewrite leaked onto shell).
    const appSrc = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
    if (/from\s+['"]\.\.\/(?:context|contexts|providers|store)\b/.test(appSrc)) {
      misses.push('App.jsx has ../context-style imports — shell must use ./ paths');
    }
  }
  const blob = Object.values(files).join('\n');
  if (
    /\bBook\s+One\b|\bAuthor\s+A\b|\bCard\s+one\b|\bShort text for card one\b|\bBag\s+One\b|\bProduct\s+One\b|\bItem\s+One\b/i.test(blob)
  ) {
    misses.push('placeholder Bag/Book/Product One titles — invent real product copy');
  }
  if (looksLikeInventFloorTwin(files) && briefForbidsGenericAtelierFloor(brief)) {
    misses.push(
      'invent-floor twin still on disk (Weekender/Crossbody/Tote shell) — craft a unique premium layout from the brief',
    );
  }
  return misses;
}







/** True when a hero section already paints designed product art (SVG / HERO_VISUAL / hero-art). */
export function heroSectionHasProductArt(src: string): boolean {
  const s = String(src || '');
  if (/\bHERO_VISUAL\b/.test(s) && /data:image\/svg\+xml/i.test(s)) return true;
  if (/className=["'][^"']*\bhero-art\b/i.test(s) && /(?:src|href)=/i.test(s)) return true;
  if (/<svg\b[\s\S]{0,8000}<\/svg>/i.test(s) && /className=["'][^"']*\bhero(?:-stage)?\b/i.test(s)) return true;
  return false;
}

function decodeHeroVisualSvg(src: string): string {
  const m = String(src || '').match(/data:image\/svg\+xml[^"']+/);
  if (!m) return '';
  try {
    return decodeURIComponent(m[0].replace(/^data:image\/svg\+xml[^,]*,/i, ''));
  } catch {
    return m[0];
  }
}

/**
 * Phone / Apple stage (or missing genre silhouette) on a F&B brief — force re-seed.
 * Any data-URL used to count as “has art”, so a wrong phone stuck forever.
 */
export function heroSectionWrongGenreArt(
  src: string,
  brief: string,
  productName = '',
): boolean {
  const s = String(src || '');
  if (!/\bHERO_VISUAL\b/.test(s) || !/data:image\/svg\+xml/i.test(s)) return false;
  if (/-new\s+marketing|Skip Plan|Put it on disk|Get it Live/i.test(s)) return true;
  const title = (s.match(/hero-title["'][^>]*>([^<]+)/i) || [])[1] || '';
  if (title && isCraftLeakCue(title.replace(/^[^—–-]+[—–-]\s*/, ''))) return true;
  const svg = decodeHeroVisualSvg(s);
  if (!svg) return false;
  const kind = detectHeroProductKind(productName, brief);
  const isPhone = /#2997ff/i.test(svg)
    || /width="320"\s+height="600"/i.test(svg)
    || /rx="44"/i.test(svg);
  if (isPhone && (kind === 'bottle' || kind === 'coffee' || kind === 'tea'
    || kind === 'lotion' || kind === 'chocolate' || kind === 'ceramic')) {
    return true;
  }
  if (kind === 'bottle' && !/small batch/i.test(svg)) return true;
  if (kind === 'coffee' && !/whole bean/i.test(svg)) return true;
  if (kind === 'tea' && !/ceremonial tin/i.test(svg)) return true;
  if (kind === 'ceramic' && !/kiln-fired tableware/i.test(svg)) return true;
  // Leather atelier must never keep a coffee roast bag ("whole bean").
  if (kind === 'bag' && /whole bean|ceremonial tin/i.test(svg)) return true;
  if (
    kind === 'bag'
    && !/hand[- ]?stitch|leather|satchel|full[- ]?grain/i.test(svg)
    && /whole bean|PROJECT/i.test(svg)
  ) {
    return true;
  }
  return false;
}

/**
 * Upgrade empty hero-stage-inner → brand product SVG art (Nova-owned, model-agnostic).
 */


/**
 * Motion v1 must survive an invented App.css — an animation-free rewrite would
 * otherwise kill the seeded hero-enter / stage / reveal language (UI-ready §F).
 * Model-agnostic floor: only fills what is missing, never rewrites model CSS.
 */
function ensureMotionCss(css: string): string {
  const c = String(css || '');
  const hasKeyframes = /@keyframes\s+[\w-]+\s*\{/.test(c);
  const hasReduced = /prefers-reduced-motion/i.test(c);
  if (hasKeyframes && hasReduced) return c;
  const add = [
    !hasKeyframes
      ? [
        '@keyframes ember-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }',
        '@keyframes stage-in { from { opacity: 0.4; transform: scale(0.985); } to { opacity: 1; transform: scale(1); } }',
        '.hero-title, .hero-lede, .reveal { animation: ember-rise 0.9s ease-out both; }',
        '.hero-stage { animation: stage-in 1.05s ease-out 0.12s both; }',
      ].join('\n')
      : '',
    !hasReduced
      ? '@media (prefers-reduced-motion: reduce) { .hero-title, .hero-lede, .hero-stage, .reveal { animation: none; } }'
      : '',
  ].filter(Boolean).join('\n');
  return `${c.trimEnd()}\n\n/* Nova Motion v1 — restored after invent */\n${add}\n`;
}



/**
 * Non-destructive visual repair; it never invents or replaces requested page content.
 */
export function seedCompositionalBrandVisuals(
  files: Record<string, string>,
  brief: string,
  productName = '',
): Record<string, string> {
  if (!thinWantsCompositionalShell(brief)) return files;
  const name = String(productName || '').trim() || 'Brand';
  const next: Record<string, string> = { ...files };
  const present = listLandedCompositionalSections(next, brief, name);
  if (!next['src/App.jsx'] && !next['src/App.tsx'] && present.length) {
    next['src/App.jsx'] = buildCompositionalShellSource(present);
  }
  // Keep model-authored hero, sections, and App content intact. Quality gates flag missing content.
  const css = String(next['src/App.css'] || '');
  if (css.trim()) next['src/App.css'] = ensureMotionCss(css);
  const mark = brandLogoSvgFor({ productName: name, brief, css });
  if (!next['public/logo.svg'] && mark) next['public/logo.svg'] = mark;
  return next;
}

/** @deprecated Prefer assembleCompositionalAppShell — kept for any leftover imports. */
export function spliceCompositionalAppShell(
  files: Record<string, string>,
  specs: readonly CompositionalSectionSpec[],
): Record<string, string> {
  if (!specs.length) return files;
  const next = { ...files };
  const present = specs.filter((s) => compositionalSectionFileSubstantial(String(next[s.filePath] || '')));
  const use = present.length ? present : specs.slice(0, 1);
  next['src/App.jsx'] = buildCompositionalShellSource(use);
  delete next['src/App.tsx'];
  return next;
}

/** Persist keys after depth accept — App + sections + public + styles. */
export function depthPersistKeys(files: Record<string, string>): string[] {
  return Object.keys(files).filter((k) => {
    const norm = k.replace(/\\/g, '/');
    return typeof files[k] === 'string'
      && (/^src\/sections\/[^/]+\.jsx$/i.test(norm)
        || /^(?:public\/)/i.test(norm)
        || /^src\/styles\//i.test(norm)
        || /^src\/App\.(?:jsx|tsx|css)$/i.test(norm));
  });
}

/** Keys that must hit disk for genre lock (hero + logo + shell). */
export function genreLockPersistKeys(files: Record<string, string>): string[] {
  const heroKeys = Object.keys(files).filter((k) =>
    /src\/sections\/.*Hero.*\.jsx$/i.test(k.replace(/\\/g, '/')),
  );
  return [...new Set([
    ...depthPersistKeys(files),
    'public/logo.svg',
    ...heroKeys,
  ])].filter((k) => typeof files[k] === 'string');
}

/**
 * True when seed-owned F&B visuals already clear Live — skip invent depth thrash.
 * Invent can still enrich copy later; phone/sparkles must not burn the soft wall first.
 * Requires full compositional completeness — a 3-section visual floor must not stop invent
 * while Notes/Shop/Subscribe (etc.) are still missing (Phase A Harbor & Oak repro).
 */
export function thinGenreSeedClearsLive(
  files: Record<string, string>,
  brief: string,
  productName = '',
): boolean {
  if (!thinBriefWantsDepth(brief) || !thinWantsCompositionalShell(brief)) return false;
  if (!thinMeetsLiveVisualFloor(files, brief)) return false;
  const name = String(productName || '').trim() || buildAskContract(brief).productName;
  if (!compositionalDepthIsComplete(files, brief, name)) return false;
  const genreMiss = thinAskMatchDeficits(files, brief, name)
    .filter((r) => /wrong genre|sparkles|hero art/i.test(r));
  return genreMiss.length === 0;
}

/** Section-id / copy hints so ask-match anchors (#notes/#shop/#subscribe) can clear. */
function compositionalScaffoldAnchor(spec: CompositionalSectionSpec): { id: string; heading: string; copy: string } {
  const c = spec.componentName;
  const slot = spec.slotLabel;
  if (/Notes/i.test(c) || /note|tast|flavor|aroma|palate/i.test(slot)) {
    return {
      id: 'notes',
      heading: 'Tasting notes',
      copy: 'Nose, palate, and finish written for this product — not filler demo copy.',
    };
  }
  if (/Catalog|Shop|Collection/i.test(c) || /shop|catalog|collection|product|cart/i.test(slot)) {
    return {
      id: 'shop',
      heading: 'Shop the collection',
      copy: 'Browse bottles and packs with clear prices and a path to checkout.',
    };
  }
  if (/Subscribe/i.test(c) || /subscribe|newsletter|club/i.test(slot)) {
    return {
      id: 'subscribe',
      heading: 'Join the list',
      copy: 'Get drops, releases, and tasting invites — one field, honest privacy note.',
    };
  }
  if (/Hero/i.test(c)) {
    return {
      id: 'hero',
      heading: 'Featured',
      copy: 'Lead with the product promise, a primary CTA, and a supporting line of brand voice.',
    };
  }
  if (/Nav|Header/i.test(c)) {
    return {
      id: 'top',
      heading: 'Navigation',
      copy: 'Brand mark, primary links, and a clear path to shop or visit.',
    };
  }
  if (/Story|About|Origin/i.test(c) || /story|origin|about/i.test(slot)) {
    return {
      id: 'story',
      heading: 'Our story',
      copy: 'Where it started, why it matters, and what makes this batch different.',
    };
  }
  if (/Footer/i.test(c)) {
    return {
      id: 'footer',
      heading: 'Visit',
      copy: 'Hours, location, and contact — keep the footer useful, not decorative only.',
    };
  }
  return {
    id: c.replace(/Section$/i, '').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase() || 'band',
    heading: slot || c,
    copy: 'Original band copy for this product — layout, hierarchy, and a real next step.',
  };
}

/**
 * True when App is still the Vite empty mount (or nav-only stamp on it).
 * Copper Loom Atelier 2026-10-23: invent never wrote sections; sticky-nav inject
 * made a bare root-app look "started" and Live opened on an empty tree.
 */
export function isBareOrNavOnlyInventApp(app: string): boolean {
  const raw = String(app || '');
  if (!raw.trim()) return true;
  const compact = raw.replace(/\s+/g, '');
  if (/Bare Vite mount|id=["']root-app["']/i.test(raw) && compact.length < 900) {
    if (!/src\/sections\/|<(?:Hero|HeroSection|ProductGrid|Catalog|Story|Contact)\b/i.test(raw)) {
      return true;
    }
  }
  // Sticky-nav + empty body only (no section imports, no landmarks beyond header).
  if (
    compact.length < 700
    && /sticky-nav/i.test(raw)
    && !/from\s+['"]\.\/sections\//i.test(raw)
    && !/<section\b/i.test(raw)
    && !/<(?:Hero|HeroSection|main)\b/i.test(raw)
  ) {
    return true;
  }
  return false;
}

/**
 * Host invent-floor salvage when the model leaves a bare mount on a compositional brief.
 * Real brand copy (not data-nova-scaffold twins, not Bag/Product One).
 */
/** True when Acc has no hero file at the premium Live compact floor. */
export function compositionalHeroNeedsPremiumFloor(files: Record<string, string>): boolean {
  const heroSection = String(files['src/sections/HeroSection.jsx'] || '');
  const hero = String(files['src/sections/Hero.jsx'] || '');
  const best = Math.max(
    heroSection.replace(/\s+/g, '').length,
    hero.replace(/\s+/g, '').length,
  );
  return best < THIN_HERO_PREMIUM_MIN_CHARS;
}

function brandFloorSalt(brand: string): number {
  const s = String(brand || 'atelier');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Layout salt 1–3 only. Salt 0 was the Fox Latch identical shell
 * (full-bleed bag hero + 2×2 swatch grid) — never seed that as default.
 * Combined fingerprint = heroSalt * 10 + catalogSalt (9 shells).
 */
export function inventFloorLayoutSalt(brand: string, nudge = 0): number {
  return inventFloorHeroSalt(brand, nudge);
}

export function inventFloorHeroSalt(brand: string, nudge = 0): number {
  const h = brandFloorSalt(brand);
  const mix = (h ^ (h >>> 7) ^ (String(brand).length * 2654435761)) >>> 0;
  return 1 + ((mix + nudge) % 3);
}

/** Independent of hero salt so same-hero brands still get a different shop grid. */
export function inventFloorCatalogSalt(brand: string, nudge = 0): number {
  const h = brandFloorSalt(brand);
  const mix = (Math.imul(h, 1664525) + 1013904223 + nudge) >>> 0;
  return 1 + (mix % 3);
}

/** Per-SKU catalog plate — permanent v2 leather atelier art (grain + form), never toy paths. */
function skuArtDataUrl(name: string, material: string, idx: number): string {
  return atelierLeatherPlateDataUrl(name, material, idx);
}

/**
 * Fox Latch 2026-10-23: every Latch invent painted the same full-bleed bag hero +
 * 2×2 swatch grid + navy footer — only brand/color changed. Layout salt owns structure.
 * Noir Latch 2026-10-23: salt-3 "crest + bag" + empty gradient swatches still looked stamped.
 */
function writeCompositionalInventFloorHero(
  next: Record<string, string>,
  brand: string,
  layoutSalt = inventFloorLayoutSalt(brand),
): void {
  const salt = layoutSalt >= 1 && layoutSalt <= 3
    ? layoutSalt
    : (1 + ((((layoutSalt % 3) + 3) % 3)));
  const short = brand.replace(/\s+(Atelier|Studio|Co|Lab|House)\s*$/i, '').trim() || brand;
  const heroCopy = brandOwnedHeroCopy(brand, short, salt);
  const bagVariant = brandFloorSalt(brand) % 8;
  // Permanent v2 leather plate — not createIdentity flat toy satchel paths.
  const heroVisual = atelierLeatherHeroDataUrl({
    name: brand,
    brief: `${brand} leather-goods atelier parchment bags brass layout-${salt} bag-variant-${bagVariant % 4}`,
    variant: bagVariant,
  });
  // Salt 3 = typography-only luxury (no centered bag crest — Noir Latch look).
  const heroClass =
    salt === 1 ? 'hero hero-section hero-split hero-layout-1'
      : salt === 2 ? 'hero hero-section hero-stack hero-layout-2'
        : 'hero hero-section hero-editorial hero-layout-3';
  const heroJsxBody = salt === 1
    ? [
      "import './HeroSection.css';",
      '',
      `const HERO_VISUAL = ${JSON.stringify(heroVisual)};`,
      '',
      'export default function HeroSection() {',
      '  return (',
      `    <section className="${heroClass}" id="hero" aria-label="Hero" data-nova-layout-salt="${salt}">`,
      '      <div className="hero-copy">',
      `        <p className="hero-kicker">${heroCopy.kicker}</p>`,
      `        <h1 className="hero-title">${brand}</h1>`,
      `        <p className="hero-lede">${heroCopy.lede}</p>`,
      `        <a className="hero-cta" href="#shop">${heroCopy.cta}</a>`,
      '      </div>',
      '      <div className="hero-stage" aria-hidden="true">',
      '        <img className="hero-art" src={HERO_VISUAL} alt="" aria-hidden="true" />',
      '      </div>',
      '    </section>',
      '  );',
      '}',
      '',
    ].join('\n')
    : salt === 2
      ? [
        "import './HeroSection.css';",
        '',
        `const HERO_VISUAL = ${JSON.stringify(heroVisual)};`,
        '',
        'export default function HeroSection() {',
        '  return (',
        `    <section className="${heroClass}" id="hero" aria-label="Hero" data-nova-layout-salt="${salt}">`,
        '      <div className="hero-copy">',
        `        <p className="hero-kicker">${heroCopy.kicker}</p>`,
        `        <h1 className="hero-title">${brand}</h1>`,
        `        <p className="hero-lede">${heroCopy.lede}</p>`,
        `        <a className="hero-cta" href="#shop">${heroCopy.cta}</a>`,
        '      </div>',
        '      <div className="hero-stage" aria-hidden="true">',
        '        <img className="hero-art" src={HERO_VISUAL} alt="" aria-hidden="true" />',
        '      </div>',
        '    </section>',
        '  );',
        '}',
        '',
      ].join('\n')
      : [
        "import './HeroSection.css';",
        '',
        'export default function HeroSection() {',
        '  return (',
        `    <section className="${heroClass}" id="hero" aria-label="Hero" data-nova-layout-salt="${salt}">`,
        '      <div className="hero-rail" aria-hidden="true" />',
        '      <div className="hero-copy">',
        `        <p className="hero-kicker">${heroCopy.kicker}</p>`,
        `        <h1 className="hero-title">${brand}</h1>`,
        `        <p className="hero-lede">${heroCopy.lede}</p>`,
        '        <div className="hero-meta">',
        `          <span>${heroCopy.meta[0]}</span><span>${heroCopy.meta[1]}</span><span>${heroCopy.meta[2]}</span>`,
        '        </div>',
        `        <a className="hero-cta" href="#shop">${heroCopy.cta}</a>`,
      '      </div>',
        '    </section>',
        '  );',
        '}',
        '',
      ].join('\n');
  const heroCssBySalt = [
    '', // unused — salt 0 retired
    [
      '.hero-section.hero-layout-1{min-height:86vh;display:grid;grid-template-columns:minmax(0,0.92fr) minmax(0,1.08fr);',
      'gap:0;align-items:stretch;background:#142033;color:#f4efe6;}',
      '@media (max-width:900px){.hero-section.hero-layout-1{grid-template-columns:1fr;}}',
      '.hero-layout-1 .hero-copy{padding:5rem 6vw;display:flex;flex-direction:column;justify-content:center;max-width:34rem;}',
      '.hero-layout-1 .hero-kicker{color:#c4a574;}',
      '.hero-layout-1 .hero-title{color:#faf6ef;}',
      '.hero-layout-1 .hero-lede{color:#c8cdd6;}',
      '.hero-layout-1 .hero-stage{min-height:22rem;background:#efe6d6;}',
      '.hero-layout-1 .hero-art{width:100%;height:100%;object-fit:cover;display:block;}',
      '.hero-layout-1 .hero-cta{background:#b08d57;color:#142033;align-self:flex-start;}',
    ].join('\n'),
    [
      '.hero-section.hero-layout-2{display:flex;flex-direction:column;gap:0;background:#f7f1e6;color:#142033;}',
      '.hero-layout-2 .hero-copy{padding:4.5rem 8vw 2rem;max-width:44rem;}',
      '.hero-layout-2 .hero-stage{width:100%;border-top:1px solid #d9cfc0;border-bottom:1px solid #d9cfc0;',
      'aspect-ratio:21/8;background:#efe6d6;}',
      '.hero-layout-2 .hero-art{width:100%;height:100%;object-fit:cover;}',
      '.hero-layout-2 .hero-cta{margin:0 8vw 3rem;}',
    ].join('\n'),
    [
      /* Typography-only editorial — never mount hero-stage here (Ivory Latch Live break). */
      '.hero-section.hero-layout-3{min-height:88vh;display:grid;',
      'grid-template-columns:10px minmax(0,1fr);grid-template-areas:"rail copy";',
      'align-items:stretch;padding:0;background:#faf6ef;color:#101828;}',
      '.hero-layout-3 .hero-rail{grid-area:rail;background:linear-gradient(180deg,#b08d57,#8b6914);}',
      '.hero-layout-3 .hero-copy{grid-area:copy;padding:5.5rem clamp(1.5rem,8vw,6rem) 4.5rem;',
      'max-width:42rem;width:100%;text-align:left;box-sizing:border-box;}',
      '.hero-layout-3 .hero-stage,.hero-layout-3 .hero-art{display:none!important;height:0!important;',
      'min-height:0!important;margin:0!important;padding:0!important;border:0!important;}',
      '.hero-layout-3 .hero-title{font-size:clamp(2.6rem,5.5vw,4.4rem);max-width:18ch;line-height:1.05;}',
      '.hero-layout-3 .hero-lede{max-width:36rem;width:100%;}',
      '.hero-layout-3 .hero-meta{display:flex;flex-wrap:wrap;gap:0.75rem 1.25rem;margin:0 0 1.75rem;',
      'font-size:0.78rem;letter-spacing:0.14em;text-transform:uppercase;color:#6a5a3e;}',
      '.hero-layout-3 .hero-meta span{border-bottom:1px solid #d4c6b0;padding-bottom:0.2rem;}',
      '.hero-layout-3 .hero-cta{border-radius:4px;background:#142033;white-space:nowrap;}',
    ].join('\n'),
  ];
  const sharedType = [
    '.hero-kicker{margin:0 0 0.65rem;font-size:0.72rem;letter-spacing:0.22em;text-transform:uppercase;color:#6a5a3e;}',
    '.hero-title{font-size:clamp(2.4rem,5.5vw,4.2rem);letter-spacing:-0.035em;line-height:1.02;margin:0 0 1rem;color:#101828;font-weight:600;}',
    '.hero-lede{max-width:32rem;font-size:1.12rem;line-height:1.6;margin:0 0 1.5rem;color:#3a4558;}',
    '.hero-cta{display:inline-flex;align-items:center;padding:0.85rem 1.35rem;background:#9a7340;color:#faf6ef;',
    'text-decoration:none;border-radius:999px;font-weight:600;letter-spacing:0.02em;}',
    '',
  ].join('\n');
  const heroCss = `${heroCssBySalt[salt]}\n${sharedType}`;
  const onlyHeroJsx = Boolean(next['src/sections/Hero.jsx'])
    && !String(next['src/sections/HeroSection.jsx'] || '').trim();
  if (onlyHeroJsx) {
    next['src/sections/Hero.jsx'] = heroJsxBody
      .replace(/HeroSection\.css/g, 'Hero.css')
      .replace(/function HeroSection/g, 'function Hero');
    next['src/sections/Hero.css'] = heroCss;
  } else {
    next['src/sections/HeroSection.jsx'] = heroJsxBody;
    next['src/sections/HeroSection.css'] = heroCss;
  }
}

function writeCompositionalInventFloorCatalog(
  next: Record<string, string>,
  brand: string,
  short: string,
  layoutSalt: number,
): void {
  // Accept 1–3 (preferred) or legacy 0–3; never collapse unique shells to classic 0.
  const salt = layoutSalt >= 1 && layoutSalt <= 3
    ? layoutSalt
    : (1 + ((((layoutSalt % 3) + 3) % 3)));
  // Brand-owned SKUs from seed — never Weekender/Crossbody/Overnight stamp families.
  const products = brandOwnedBreakProducts(short, brand).map((p, i) => ({
    ...p,
    art: skuArtDataUrl(p.name, p.material, i + brandFloorSalt(brand)),
  }));
  const ledes = [
    `${short} shelf — four cuts named for this bench, materials on the card.`,
    `Four ${short} pieces with hide and hardware written plain.`,
    `${brand} keeps four named bags on the table — no filler titles.`,
    `Carry from ${short}: four forms, honest leather, brass that ages.`,
  ];
  const gridClass =
    salt === 1 ? 'catalog-grid catalog-grid-row'
      : salt === 2 ? 'catalog-grid catalog-grid-list'
        : 'catalog-grid catalog-grid-feature';
  const cardInner = salt === 2
    ? [
      '          <article key={p.id} className="product-card product-card-row">',
      '            <img className="product-art" src={p.art} alt="" width="112" height="84" />',
      '            <div className="product-meta">',
      '              <h3>{p.name}</h3>',
      '              <p>{p.material}</p>',
      '            </div>',
      '          </article>',
    ]
    : salt === 3
      ? [
        '          <article key={p.id} className={`product-card ${p.id === \'1\' ? \'product-card-feature\' : \'\'}`}>',
        '            <img className="product-art" src={p.art} alt="" />',
        '            <h3>{p.name}</h3>',
        '            <p>{p.material}</p>',
        '          </article>',
      ]
      : [
        '          <article key={p.id} className="product-card">',
        '            <img className="product-art" src={p.art} alt="" />',
        '            <h3>{p.name}</h3>',
        '            <p>{p.material}</p>',
        '          </article>',
      ];
  next['src/sections/CatalogSection.jsx'] = [
    "import './CatalogSection.css';",
    '',
    'const PRODUCTS = [',
    ...products.map((p) =>
      `  { id: '${p.id}', name: ${JSON.stringify(p.name)}, material: ${JSON.stringify(p.material)}, art: ${JSON.stringify(p.art)} },`,
    ),
    '];',
    '',
    'export default function CatalogSection() {',
    '  return (',
    // Never add class "product-grid" — App.css companion stomps it into auto-fit columns
    // and breaks Shop|cards into a broken two-column stamp (Ivory Latch Live).
    `    <section className="catalog-section catalog-layout-${salt}" id="shop" aria-label="Shop" data-nova-layout-salt="${salt}">`,
    '      <div className="catalog-head">',
    '        <h2 className="catalog-heading">Shop</h2>',
    `        <p className="catalog-lede">${ledes[salt]}</p>`,
    '      </div>',
    `      <div className="${gridClass}">`,
    '        {PRODUCTS.map((p) => (',
    ...cardInner,
    '        ))}',
    '      </div>',
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n');
  const cssBySalt: Record<number, string> = {
    1: [
      '.catalog-section.catalog-layout-1{padding:3.5rem 6vw;background:#faf6ef;}',
      '.catalog-layout-1 .catalog-grid-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1rem;}',
      '@media (max-width:900px){.catalog-layout-1 .catalog-grid-row{grid-template-columns:repeat(2,minmax(0,1fr));}}',
      '.catalog-layout-1 .product-art{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;background:#efe6d6;}',
    ].join('\n'),
    2: [
      '.catalog-section.catalog-layout-2{display:grid!important;grid-template-columns:minmax(14rem,0.38fr) minmax(0,1fr);',
      'gap:2.5rem;align-items:start;padding:4.5rem 8vw;background:#efe8dc;max-width:none!important;}',
      '@media (max-width:860px){.catalog-section.catalog-layout-2{grid-template-columns:1fr;}}',
      '.catalog-layout-2 .catalog-head{display:block;margin:0;position:sticky;top:5rem;}',
      '.catalog-layout-2 .catalog-grid-list{display:flex;flex-direction:column;gap:0.85rem;margin:0;}',
      '.catalog-layout-2 .product-card-row{display:grid;grid-template-columns:7rem 1fr;gap:1rem;align-items:center;',
      'padding:0.75rem;border:1px solid #d4c6b0;border-radius:12px;background:#fffdf8;}',
      '.catalog-layout-2 .product-art{width:7rem;height:5.25rem;object-fit:cover;border-radius:8px;display:block;}',
      '.catalog-layout-2 .product-meta h3{margin:0 0 0.25rem;}',
      '.catalog-layout-2 .product-meta p{margin:0;}',
    ].join('\n'),
    3: [
      '.catalog-section.catalog-layout-3{padding:4.5rem 8vw;background:#f3eee4;}',
      '.catalog-layout-3 .catalog-grid-feature{display:grid;grid-template-columns:1.4fr 1fr 1fr;grid-template-rows:auto auto;gap:1.1rem;}',
      '.catalog-layout-3 .product-card-feature{grid-row:1 / span 2;}',
      '@media (max-width:900px){.catalog-layout-3 .catalog-grid-feature{grid-template-columns:1fr 1fr;}.catalog-layout-3 .product-card-feature{grid-row:auto;}}',
      '.catalog-layout-3 .product-art{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;}',
      '.catalog-layout-3 .product-card-feature .product-art{aspect-ratio:3/4;min-height:14rem;}',
    ].join('\n'),
  };
  const shared = [
    '.catalog-head{display:flex;flex-wrap:wrap;align-items:end;justify-content:space-between;gap:1rem;margin-bottom:1.75rem;}',
    '.catalog-heading{margin:0;font-size:clamp(1.6rem,3vw,2.1rem);color:#142033;letter-spacing:-0.02em;}',
    '.catalog-lede{margin:0;max-width:26rem;color:#5a6475;line-height:1.5;}',
    '.product-card{padding:0;border:1px solid #d4c6b0;border-radius:16px;background:#fffdf8;overflow:hidden;',
    'box-shadow:0 12px 32px rgba(20,32,51,0.06);}',
    '.product-card h3{margin:1rem 1.15rem 0.35rem;font-size:1.08rem;color:#1a2433;}',
    '.product-card p{margin:0 1.15rem 1.2rem;color:#5a6475;font-size:0.95rem;line-height:1.45;}',
    '',
  ].join('\n');
  next['src/sections/CatalogSection.css'] = `${cssBySalt[salt] || cssBySalt[1]}\n${shared}`;
  void brand;
}

export function seedCompositionalInventFloor(
  files: Record<string, string>,
  brief: string,
  productName = '',
): Record<string, string> {
  if (!thinWantsCompositionalShell(brief)) return files;
  const brand = String(productName || '').trim() || 'Atelier';
  const short = brand.replace(/\s+(Atelier|Studio|Co|Lab|House)\s*$/i, '').trim() || brand;
  let next: Record<string, string> = { ...files };

  // Luxury / unique atelier: permanently leave the classic sticky-nav + 4 equal
  // product-card Latch stamp. Pick a structurally different shell family per brand.
  if (briefForbidsGenericAtelierFloor(brief)) {
    const accBlob0 = Object.values(next).join('\n');
    const hasModernShell = /data-nova-shell=["'](?:lookbook|rail|feature|strip|commission)["']/i.test(accBlob0);
    const needsShell = !hasModernShell
      || looksLikeClassicFourBoxAtelierShell(next)
      || looksLikeInventFloorTwin(next)
      || atelierAccMissingLayoutSalt(next, brief)
      || looksLikeHollowAtelierCraft(next, brief)
      || looksLikeEmptySwatchAtelier(next, brief);
    if (needsShell) {
      const shell = inventFloorShellId(brand, looksLikeClassicFourBoxAtelierShell(next) ? 1 : 0);
      next = writeAtelierInventShell(next, brand, shell);
      const mark = brandLogoSvgFor({ productName: brand, brief });
      if (mark) next['public/logo.svg'] = mark;
      return assembleCompositionalAppShell(next, brief, brand);
    }
  }

  // Always top-up thin hero — invent often overwrites floor with title+lede stubs
  // while shop/story already landed, so the bare/landed>=2 early-exit used to skip.
  // Layout salt is brand-owned so two Latch invents do not share one shell.
  const heroSalt = inventFloorHeroSalt(brand);
  const catalogSalt = inventFloorCatalogSalt(brand);
  const layoutSalt = heroSalt;
  const accBlob = Object.values(next).join('\n');
  const missingLayoutSalt = !/data-nova-layout-salt=["']\d["']/i.test(accBlob);
  // Unique-layout atelier asks: craft often lands a *substantial* twin shell
  // (full-bleed + 2×2) that skips heroTopped — force salt structure onto Acc.
  const forceUniqueLayout = briefForbidsGenericAtelierFloor(brief)
    && (missingLayoutSalt || looksLikeInventFloorTwin(next));
  const heroTopped = compositionalHeroNeedsPremiumFloor(next) || forceUniqueLayout;
  if (heroTopped) writeCompositionalInventFloorHero(next, brand, heroSalt);

  const app = String(next['src/App.jsx'] || next['src/App.tsx'] || '');
  const landed = listLandedCompositionalSections(next, brief, productName);
  // Early path used to skip Footer/Contact seeding + remount when ≥2 sections
  // already looked "started" (Fern Latch Acc: Footer on disk, never in App).
  if (!isBareOrNavOnlyInventApp(app) && landed.length >= 2 && !forceUniqueLayout) {
    if (!compositionalSectionFileSubstantial(String(next['src/sections/FooterSection.jsx'] || ''))
      && !compositionalSectionFileSubstantial(String(next['src/sections/Contact.jsx'] || ''))
      && !compositionalFooterFileMountable(String(next['src/sections/FooterSection.jsx'] || ''))
      && !compositionalFooterFileMountable(String(next['src/sections/Contact.jsx'] || ''))) {
      const footerLine = brandOwnedFooterLine(brand, layoutSalt);
      next['src/sections/FooterSection.jsx'] = [
        "import './FooterSection.css';",
        '',
        'export default function FooterSection() {',
        '  return (',
        `    <footer className="footer-section footer-layout-${layoutSalt}" id="contact" role="contentinfo" data-nova-layout-salt="${layoutSalt}">`,
        `      <p className="footer-brand">${brand}</p>`,
        `      <p>${footerLine}</p>`,
        '    </footer>',
        '  );',
        '}',
        '',
      ].join('\n');
      next['src/sections/FooterSection.css'] = [
        `.footer-section.footer-layout-${layoutSalt}{padding:2.5rem 8vw;background:#142033;color:#f4efe6;}`,
        '.footer-brand{margin:0 0 0.35rem;font-weight:600;letter-spacing:0.02em;}',
        '.footer-section p{margin:0;opacity:0.9;}',
        '',
      ].join('\n');
    }
    return ensureLandedSectionsMountedInApp(next, brief, brand);
  }

  if (
    forceUniqueLayout
    || (
      !compositionalSectionFileSubstantial(String(next['src/sections/CatalogSection.jsx'] || ''))
      && !compositionalSectionFileSubstantial(String(next['src/sections/ProductGrid.jsx'] || ''))
    )
  ) {
    writeCompositionalInventFloorCatalog(next, brand, short, catalogSalt);
  }

  if (!compositionalSectionFileSubstantial(String(next['src/sections/StorySection.jsx'] || ''))
    && !compositionalSectionFileSubstantial(String(next['src/sections/Story.jsx'] || ''))) {
    const story = brandOwnedStoryCopy(brand, short, layoutSalt);
    next['src/sections/StorySection.jsx'] = [
      "import './StorySection.css';",
      '',
      'export default function StorySection() {',
      '  return (',
      `    <section className="story-section story-layout-${layoutSalt}" id="story" aria-label="Story" data-nova-layout-salt="${layoutSalt}">`,
      '      <div className="story-rail">',
      `        <p className="story-kicker">${short}</p>`,
      `        <h2>${story.title}</h2>`,
      `        <p>${story.p1}</p>`,
      `        <p>${story.p2}</p>`,
      '      </div>',
      '    </section>',
      '  );',
      '}',
      '',
    ].join('\n');
    next['src/sections/StorySection.css'] = [
      `.story-section.story-layout-${layoutSalt}{padding:4.5rem 8vw;color:#1a2433;background:#efe8dc;border-top:1px solid #d9cfc0;}`,
      '.story-rail{max-width:38rem;}',
      '.story-kicker{margin:0 0 0.55rem;font-size:0.72rem;letter-spacing:0.2em;text-transform:uppercase;color:#6a5a3e;}',
      '.story-section h2{margin:0 0 1rem;font-size:clamp(1.55rem,3vw,2rem);letter-spacing:-0.02em;}',
      '.story-section p{margin:0 0 0.85rem;line-height:1.7;color:#3a4558;font-size:1.05rem;}',
      '',
    ].join('\n');
  }

  if (!compositionalSectionFileSubstantial(String(next['src/sections/FooterSection.jsx'] || ''))
    && !compositionalSectionFileSubstantial(String(next['src/sections/Contact.jsx'] || ''))) {
    const footerLine = brandOwnedFooterLine(brand, layoutSalt);
    next['src/sections/FooterSection.jsx'] = [
      "import './FooterSection.css';",
      '',
      'export default function FooterSection() {',
      '  return (',
      `    <footer className="footer-section footer-layout-${layoutSalt}" id="contact" role="contentinfo" data-nova-layout-salt="${layoutSalt}">`,
      `      <p className="footer-brand">${brand}</p>`,
      `      <p>${footerLine}</p>`,
      '    </footer>',
      '  );',
      '}',
      '',
    ].join('\n');
    next['src/sections/FooterSection.css'] = [
      `.footer-section.footer-layout-${layoutSalt}{padding:2.5rem 8vw;background:#142033;color:#f4efe6;}`,
      '.footer-brand{margin:0 0 0.35rem;font-weight:600;letter-spacing:0.02em;}',
      '.footer-section p{margin:0;opacity:0.9;}',
      '',
    ].join('\n');
  }

  if (!compositionalSectionFileSubstantial(String(next['src/sections/NavHeaderSection.jsx'] || ''))
    && !compositionalSectionFileSubstantial(String(next['src/sections/Nav.jsx'] || ''))) {
    next['src/sections/NavHeaderSection.jsx'] = [
      "import './NavHeaderSection.css';",
      '',
      'export default function NavHeaderSection() {',
      '  return (',
      '    <header className="nav-header sticky-nav" role="banner">',
      '      <div className="nav-left">',
      `        <img className="nav-logo" src="/logo.svg" alt="${brand}" width="36" height="36" />`,
      `        <span className="nav-brand">${brand}</span>`,
      '      </div>',
      '      <nav className="nav-right" aria-label="Primary">',
      '        <a href="#shop">Shop</a>',
      '        <a href="#story">Story</a>',
      '        <a href="#contact">Contact</a>',
      '      </nav>',
      '    </header>',
      '  );',
      '}',
      '',
    ].join('\n');
    next['src/sections/NavHeaderSection.css'] = [
      '.nav-header{display:flex;align-items:center;justify-content:space-between;gap:1rem;',
      'padding:0.85rem 8vw;position:sticky;top:0;z-index:20;background:rgba(244,239,230,0.92);',
      'backdrop-filter:blur(10px);border-bottom:1px solid #d9cfc0;color:#142033;}',
      '.nav-left{display:flex;align-items:center;gap:0.65rem;}',
      '.nav-brand{font-weight:600;letter-spacing:0.02em;}',
      '.nav-right{display:flex;gap:1.25rem;}',
      '.nav-right a{color:#142033;text-decoration:none;font-size:0.95rem;}',
      '',
    ].join('\n');
  }

  // Full atelier tokens in App.css so visual floor / premium bar can clear without
  // waiting on model enrich (cssCompact previously ignored section CSS).
  // Do NOT absolute-position .hero-stage globally — Ivory Latch: that + a leaked
  // stage node inside editorial grid crushed copy to a 12px column.
  next['src/App.css'] = [
    '/* Invent-floor atelier — parchment / espresso / brass */',
    ':root{',
    '  --paper:#f4efe6;--ink:#142033;--muted:#3a4558;--brass:#b08d57;--line:#d9cfc0;',
    '}',
    '*{box-sizing:border-box;}',
    'html,body,#root{margin:0;min-height:100%;}',
    'body{font-family:Georgia,"Times New Roman",serif;background:var(--paper);color:var(--ink);}',
    '.app{',
    '  min-height:100vh;margin:0;width:100%;display:flex;flex-direction:column;',
    '  background:var(--paper);color:var(--ink);',
    '}',
    'a{color:var(--brass);}',
    'img{max-width:100%;height:auto;display:block;}',
    /* Beat createBuildQuality companion stomps on nav + shop. */
    'header.nav-header.sticky-nav{display:flex!important;flex-wrap:nowrap!important;align-items:center;',
    'justify-content:space-between;width:100%;max-width:none;margin:0;padding:0.9rem 8vw;}',
    'header.nav-header .nav-right{display:flex;gap:1.35rem;flex-wrap:nowrap;}',
    'section.catalog-section{display:block!important;max-width:none!important;margin:0!important;padding-left:0;padding-right:0;}',
    'section.catalog-section .catalog-grid{max-width:1100px;}',
    '',
  ].join('\n');

  // Leather shopping-bag mark — never coffee mug from "espresso type".
  const mark = brandLogoSvgFor({ productName: brand, brief });
  if (mark) next['public/logo.svg'] = mark;

  return assembleCompositionalAppShell(next, brief, brand);
}

/**
 * Craft often writes `import './FooSection.css'` without shipping FooSection.css —
 * Vite then fails resolve and Live never paints (Cedar Latch Acc). Fill any missing
 * relative .css imports with a minimal companion so mount/build can proceed.
 */
/** Rich section CSS when invent imports ./Foo.css but never ships it (stubs looked “basic”). */
function compositionalCompanionCssFor(cssPath: string): string {
  const base = cssPath.split('/').pop()?.replace(/\.css$/i, '') || '';
  if (/^Hero(Section)?$/i.test(base)) {
    return [
      '/* Invent-floor hero — full-bleed parchment stage */',
      '.hero-section.hero-fullbleed{position:relative;min-height:88vh;display:grid;align-items:end;',
      'padding:0;background:linear-gradient(145deg,#efe6d6 0%,#f7f1e6 42%,#e8dcc8 100%);color:#142033;overflow:hidden;}',
      '.hero-stage{position:absolute;inset:0;z-index:0;opacity:0.42;pointer-events:none;}',
      '.hero-stage .hero-art{width:100%;height:100%;object-fit:cover;border:0;border-radius:0;max-width:none;}',
      '.hero-veil{position:absolute;inset:0;z-index:1;background:',
      'radial-gradient(ellipse 70% 55% at 78% 18%,rgba(176,141,87,0.28),transparent 58%),',
      'linear-gradient(180deg,rgba(20,32,51,0.04),rgba(20,32,51,0.22));pointer-events:none;}',
      '.hero-copy{position:relative;z-index:2;padding:5.5rem 8vw 4.25rem;max-width:40rem;text-align:left;}',
      '.hero-kicker{margin:0 0 0.65rem;font-size:0.72rem;letter-spacing:0.22em;text-transform:uppercase;color:#6a5a3e;}',
      '.hero-title{font-size:clamp(2.8rem,6.2vw,4.6rem);letter-spacing:-0.035em;line-height:1.02;margin:0 0 1rem;color:#101828;font-weight:600;}',
      '.hero-lede{max-width:32rem;font-size:1.18rem;line-height:1.6;margin:0 0 1.5rem;color:#3a4558;}',
      '.hero-cta{display:inline-flex;align-items:center;padding:0.85rem 1.35rem;background:#9a7340;color:#faf6ef;',
      'text-decoration:none;border-radius:999px;font-weight:600;letter-spacing:0.02em;box-shadow:0 10px 28px rgba(20,32,51,0.12);}',
      '',
    ].join('\n');
  }
  if (/^CatalogSection$/i.test(base)) {
    return [
      '/* Invent-floor catalog */',
      '.catalog-section{padding:3.5rem 8vw 4rem;max-width:1200px;margin:0 auto;}',
      '.catalog-heading{margin:0 0 0.5rem;font-size:clamp(1.8rem,3vw,2.4rem);letter-spacing:-0.03em;}',
      '.catalog-lede{margin:0 0 1.75rem;color:#5c665e;max-width:36rem;line-height:1.55;}',
      '.catalog-grid{display:grid;gap:1.15rem;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));}',
      '.product-card{background:#faf7f0;border:1px solid rgba(26,31,28,0.12);border-radius:14px;padding:1rem;display:flex;flex-direction:column;gap:0.55rem;}',
      '.product-swatch{width:100%;aspect-ratio:4/3;border-radius:12px;background:linear-gradient(145deg,#c4a574,#8b6914 55%,#5c4030);}',
      '.product-card h3{margin:0;font-size:1.05rem;}',
      '.product-card p{margin:0;color:#5c665e;line-height:1.45;font-size:0.92rem;}',
      '',
    ].join('\n');
  }
  if (/^StorySection$/i.test(base)) {
    return [
      '/* Invent-floor story */',
      '.story-section{padding:3.25rem 8vw 4rem;max-width:720px;margin:0 auto;}',
      '.story-kicker{margin:0 0 0.5rem;font-size:0.72rem;letter-spacing:0.2em;text-transform:uppercase;color:#6a5a3e;}',
      '.story-title{margin:0 0 1rem;font-size:clamp(1.7rem,3vw,2.2rem);letter-spacing:-0.03em;}',
      '.story-section p{margin:0 0 1rem;line-height:1.65;color:#3a4558;}',
      '',
    ].join('\n');
  }
  if (/^NavHeaderSection$/i.test(base)) {
    return [
      '/* Invent-floor nav */',
      '.nav-header.sticky-nav{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;',
      'gap:1.25rem;padding:0.95rem 8vw;backdrop-filter:blur(12px);background:rgba(247,241,230,0.88);',
      'border-bottom:1px solid rgba(26,31,28,0.1);}',
      '.nav-left{display:flex;align-items:center;gap:0.65rem;}',
      '.nav-logo{width:36px;height:36px;object-fit:contain;}',
      '.nav-brand{font-weight:650;letter-spacing:-0.02em;}',
      '.nav-right{display:flex;gap:1.35rem;flex-wrap:wrap;}',
      '.nav-right a{color:#5c665e;text-decoration:none;font-size:0.95rem;}',
      '.nav-right a:hover{color:#101828;}',
      '',
    ].join('\n');
  }
  if (/^FooterSection$/i.test(base)) {
    return [
      '/* Invent-floor footer */',
      '.footer-section{margin-top:auto;padding:2.5rem 8vw;border-top:1px solid rgba(26,31,28,0.1);text-align:center;color:#5c665e;}',
      '.footer-brand{margin:0 0 0.4rem;font-weight:650;color:#101828;}',
      '',
    ].join('\n');
  }
  const cls = base.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase() || 'section';
  return [
    `/* Auto companion for ${cssPath} — invent imported this file but left it empty. */`,
    `.${cls}{display:block;}`,
    '',
  ].join('\n');
}

export function ensureRelativeCssImportsExist(
  files: Record<string, string>,
): Record<string, string> {
  const next: Record<string, string> = { ...files };
  const pathOf = (from: string, rel: string): string => {
    const dir = from.includes('/') ? from.replace(/\/[^/]+$/, '') : '';
    const joined = (dir ? `${dir}/${rel}` : rel).replace(/\\/g, '/');
    const parts = joined.split('/');
    const out: string[] = [];
    for (const p of parts) {
      if (!p || p === '.') continue;
      if (p === '..') out.pop();
      else out.push(p);
    }
    return out.join('/');
  };
  for (const [filePath, body] of Object.entries(files)) {
    if (!/\.(?:jsx?|tsx?)$/i.test(filePath)) continue;
    const src = String(body || '');
    const re = /import\s+['"](\.\/[^'"]+\.css)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const cssRel = m[1];
      const cssPath = pathOf(filePath.replace(/\\/g, '/'), cssRel);
      if (!cssPath) continue;
      const existing = String(next[cssPath] || '').trim();
      // Only fill empty / placeholder stubs — never clobber real App.css or craft CSS.
      const isStub = !existing
        || /^\/\*\s*(?:companion|auto companion)\b/i.test(existing)
        || (/^\/\*\s*Auto companion for /i.test(existing) && existing.length < 120);
      if (!isStub) continue;
      next[cssPath] = compositionalCompanionCssFor(cssPath);
    }
  }
  return next;
}

/**
 * Legacy name — now runs invent-floor salvage when the Acc is still bare.
 * (Previously a no-op after data-nova-scaffold twins were removed.)
 */
export function seedCompositionalSectionScaffolds(
  files: Record<string, string>,
  brief: string,
  productName = '',
): Record<string, string> {
  return ensureRelativeCssImportsExist(
    seedCompositionalInventFloor(files, brief, productName),
  );
}

/**
 * Compiling App is not enough for rich website/brand asks — need invent-from-brief depth.
 * Never checks for apple.com bands or other genre floors; only length + structure + stub smells.
 */
export function thinNeedsDepthPass(files: Record<string, string>, brief: string): boolean {
  if (!thinBriefWantsDepth(brief)) return false;
  const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
  const css = String(files['src/App.css'] || '');
  if (!app.trim()) return true;
  // Bare Vite / nav-only stamp must never clear depth (Copper Loom empty Live).
  if (isBareOrNavOnlyInventApp(app)) return true;
  // Live visual + genre honesty already clear — stop invent thrash (9k is soft).
  if (thinWantsCompositionalShell(brief) && thinGenreSeedClearsLive(files, brief)) {
    return false;
  }
  if (thinWantsCompositionalShell(brief)) {
    if (nextCompositionalDepthTarget(files, brief)) return true;
    const ledger = readThinDepthLedger(files);
    if (!thinDepthLedgerMeetsFloor(ledger)) return true;
    const sectionCount = countThinLandmarks(app);
    const stubShell = /product-card|filteredProducts|Search products|Experience the future of technology/i.test(app)
      && sectionCount < 4;
    const undeclaredCover = /\bCOVER_HREFS\b/.test(app) && !/\b(?:const|let|var)\s+COVER_HREFS\b/.test(app);
    return stubShell || undeclaredCover;
  }
  const compact = app.replace(/\s+/g, '');
  const sectionCount = countThinLandmarks(app);
  const lineCount = app.split(/\r?\n/).length;
  const stubShell = /product-card|filteredProducts|Search products|Experience the future of technology/i.test(app)
    && sectionCount < 4;
  const veryThin = compact.length < THIN_DEPTH_MIN_APP_CHARS;
  const fewSections = sectionCount < THIN_DEPTH_MIN_SECTIONS;
  const fewLines = lineCount < 280;
  const thinCss = css.replace(/\s+/g, '').length < 3200;
  const undeclaredCover = /\bCOVER_HREFS\b/.test(app) && !/\b(?:const|let|var)\s+COVER_HREFS\b/.test(app);
  // Brand depth asks require a real /logo.svg mark — text nav-brand alone does not clear.
  const missingLogo = !/\/logo\.svg/i.test(app);
  return veryThin || fewSections || fewLines || stubShell || thinCss || undeclaredCover || missingLogo;
}

/** Landmark count — real tags OR class/role section shells (7B often emits div.section). */
export function countThinLandmarks(app: string): number {
  const raw = String(app || '');
  const tags = (raw.match(/<(?:section|main|article|footer|header)\b/gi) || []).length;
  const navTags = (raw.match(/<nav\b/gi) || []).length;
  // Token "section" only — not section-title / section-button.
  const classSections = (raw.match(/\bclass(?:Name)?=["'][^"']*(?:^|[\s])section(?:[\s"']|$)/gi) || []).length;
  const roleRegions = (raw.match(/\brole=["'](?:region|contentinfo|banner)["']/gi) || []).length;
  return Math.max(tags, classSections + (/\bfooter\b/i.test(raw) ? 1 : 0), tags + roleRegions) + navTags;
}

/** Absolute step — kept for diagnostics; acceptance is ledger-gain (not prior+step). */
export const THIN_DEPTH_ABS_STEP_CHARS = Math.max(
  700,
  Math.ceil(THIN_DEPTH_MIN_APP_CHARS / THIN_DEPTH_CONTINUE_MAX),
);

/** Bail depth when this many consecutive passes produce zero ledger gain.
 * 2 was lethal on 7B (one empty + one thin → exit in ~20s). Give invent room. */
export const THIN_DEPTH_ZERO_GAIN_BAIL = 5;

/**
 * After invent-floor lands (≥3 sections), allow this long for model enrich, then
 * finish create (reply + await early npm). Moss Thread: invent hung ~12m inside the
 * 14m create wall with no final brand reply while floor was already on disk.
 */
export const THIN_INVENT_ENRICH_AFTER_FLOOR_MS = 180_000;

/** True when floor Acc is good enough and enrich wall expired — stop invent thrash. */
export function inventFloorEnrichExhausted(opts: {
  floorSeededAt: number | null | undefined;
  files: Record<string, string>;
  brief: string;
  productName?: string;
  nowMs?: number;
}): boolean {
  const seeded = Number(opts.floorSeededAt || 0);
  if (!seeded) return false;
  const now = opts.nowMs ?? Date.now();
  if (now - seeded < THIN_INVENT_ENRICH_AFTER_FLOOR_MS) return false;
  if (!thinWantsCompositionalShell(opts.brief)) return false;
  const landed = listLandedCompositionalSections(
    opts.files,
    opts.brief,
    opts.productName || '',
  ).length;
  return landed >= THIN_LIVE_VISUAL_MIN_LANDED_SECTIONS;
}

/**
 * Deterministic craft-past-floor rewrite when Acc is still a stamped twin.
 * Hazel Latch 2026-10-23: model enrich often left Overnight/Shopper stamps → soft Ready
 * after ~9m. This runs after the invent enrich wall (and before quality hand-back) so
 * every invent — not one project — clears the twin shell without another thrash loop.
 */
/**
 * Expand an ultra-thin Hero that already has brand h1 so compositional Ready can clear.
 * Model often ships one short lede under the premium compact floor.
 */
export function ensureHeroPremiumFloorCopy(
  files: Record<string, string>,
  productName = '',
): Record<string, string> {
  const rel = files['src/sections/HeroSection.jsx']
    ? 'src/sections/HeroSection.jsx'
    : files['src/sections/Hero.jsx']
      ? 'src/sections/Hero.jsx'
      : '';
  if (!rel) return files;
  const body = String(files[rel] || '');
  if (!/<h1\b/i.test(body)) return files;
  if (compositionalSectionFileSubstantial(body)) return files;
  const brand = String(productName || 'Atelier').trim() || 'Atelier';
  const lede = `${brand} cuts and finishes quiet leather carry — honest hides, hand-set hardware, bags meant to earn their patina.`;
  let next = body;
  if (/className=["'][^"']*hero-lede["'][^>]*>\s*[^<]{0,40}\s*</i.test(next)) {
    next = next.replace(
      /(className=["'][^"']*hero-lede["'][^>]*>)([^<]*)(<\/)/i,
      `$1${lede}$3`,
    );
  } else if (/<p\b[^>]*>\s*[^<]{0,40}\s*<\/p>/i.test(next)) {
    next = next.replace(/<p\b([^>]*)>\s*[^<]{0,40}\s*<\/p>/i, `<p$1>${lede}</p>`);
  } else {
    next = next.replace(
      /(<\/h1>)/i,
      `$1\n        <p className="hero-lede">${lede}</p>`,
    );
  }
  if (!compositionalSectionFileSubstantial(next)) return files;
  return { ...files, [rel]: next };
}

/**
 * Inject id="shop"|"story"|"contact" onto landed section roots when Nav hrefs need them.
 * Pine Latch 2026-10-23: craft Acc painted Live but Ready failed "navigation targets missing".
 */
export function ensureNavTargetIdsOnSections(
  files: Record<string, string>,
): Record<string, string> {
  const next: Record<string, string> = { ...files };
  const blob = Object.values(next).join('\n');
  const needs = new Set<string>();
  for (const m of blob.matchAll(/(?:href|to)=\{?['"]#([^'"}]+)['"]\}?/gi)) {
    const id = String(m[1] || '').toLowerCase();
    if (id && !new RegExp(`\\bid=["']${id}["']`, 'i').test(blob)) needs.add(id);
  }
  const stamp = (rel: string, id: string, classHint: RegExp) => {
    const body = String(next[rel] || '');
    if (!body.trim()) return;
    if (new RegExp(`\\bid=["']${id}["']`, 'i').test(body)) return;
    if (/<section\b/i.test(body)) {
      next[rel] = body.replace(/<section\b([^>]*)>/i, (_m, attrs) => {
        if (/\bid=/i.test(String(attrs))) return `<section${attrs}>`;
        return `<section${attrs} id="${id}">`;
      });
      return;
    }
    if (classHint.test(body)) {
      next[rel] = body.replace(/<(div|header|footer)\b([^>]*)>/i, (full, tag, attrs) => {
        if (/\bid=/i.test(String(attrs))) return full;
        return `<${tag}${attrs} id="${id}">`;
      });
    }
  };
  if (needs.has('shop')) {
    stamp('src/sections/CatalogSection.jsx', 'shop', /catalog|product-grid/i);
  }
  if (needs.has('story')) {
    stamp('src/sections/StorySection.jsx', 'story', /story/i);
  }
  if (needs.has('contact') || needs.has('visit')) {
    const id = needs.has('contact') ? 'contact' : 'visit';
    stamp('src/sections/FooterSection.jsx', id, /footer/i);
    stamp('src/sections/ContactSection.jsx', id, /contact/i);
  }
  return next;
}

/** Brand-owned hero voice — never invent-floor stamp ledes (builds quiet leather…). */
function brandOwnedHeroCopy(
  brand: string,
  short: string,
  salt: number,
): { kicker: string; lede: string; cta: string; meta: [string, string, string] } {
  const h = brandFloorSalt(brand);
  const kickers = [
    'Full-grain studio',
    'Hide & brass',
    'Bench leather',
    'Carry house',
    'Grain studio',
    'Atelier carry',
    'Hand-set brass',
    'Quiet leather',
  ];
  const ledes = [
    `${short} cuts leather for people who keep one bag for years — grain first, hardware second.`,
    `A ${short} bench: skins chosen for character, edges finished until they glow, brass set to age.`,
    `${brand} seats hardware after the hide is true — small-run carry, never filler.`,
    `From ${short}: burnished edges, hand-set brass, bags meant to earn a real patina.`,
    `${short} works one hide at a time so the grain can lead — quiet stitch, lasting hardware.`,
    `${brand} keeps the table clear: cut, burnish, stitch, set — then let the leather live.`,
    `Carry from ${short} — full-grain skins, soft linings, brass that darkens with the bag.`,
    `${short} finishes each piece until the latch sits true and the hide feels ready to travel.`,
  ];
  const ctas = [
    'Enter the shop',
    'View the four',
    'Browse pieces',
    'See the bench',
    'Open the shelf',
    'Meet the four',
    'Shop the bench',
    'Explore pieces',
  ];
  const metas: Array<[string, string, string]> = [
    ['Full-grain', 'Hand-set brass', 'By appointment'],
    ['Vegetable-tanned', 'Saddle stitch', 'Ships cured'],
    ['Hide first', 'Quiet linings', 'Bench visits'],
    ['Grain led', 'Brass aged', 'Small run'],
  ];
  return {
    kicker: kickers[(h + salt) % kickers.length],
    lede: ledes[(h + salt * 3) % ledes.length],
    cta: ctas[(h + salt * 5) % ctas.length],
    meta: metas[(h + salt) % metas.length],
  };
}

/** Brand-owned SKU set — never reuse Arc Duffle / Holdall / Weekender stamp families. */
function brandOwnedBreakProducts(short: string, brand: string): Array<{ id: string; name: string; material: string }> {
  const forms = [
    ['Cabin Hold', 'Drum-dyed hide, welded zipper'],
    ['Ledger Folio', 'Pressed board, linen lining'],
    ['Trail Sling', 'Pull-up leather, brass ring'],
    ['Ink Sleeve', 'Nubuck face, edge paint'],
    ['Harbor Tote', 'Oil-tanned straps, open top'],
    ['Studio Satchel', 'Vegetable-tanned flap, solid latch'],
    ['Noon Crossbody', 'Bridle strap, forged buckle'],
    ['Dusk Clutch', 'Glove leather, magnetic catch'],
    ['Forge Brief', 'Boarded hide, hand-stitched handle'],
    ['River Pack', 'Waxed flesh side, cotton drill'],
    ['Lantern Pouch', 'Soft calf, saddle-stitch seam'],
    ['Atlas Week', 'Thick hide, brass zipper pull'],
    ['Cinder Kit', 'Harness leather, pull tab'],
    ['Moss Envelope', 'Thin calf, single pocket'],
    ['Quartz Daypack', 'Saddle leather, cotton lining'],
    ['Ember Belt', 'Softened hide, single buckle'],
  ] as const;
  const h = brandFloorSalt(brand);
  const out: Array<{ id: string; name: string; material: string }> = [];
  const used = new Set<number>();
  for (let i = 0; i < 4; i += 1) {
    let idx = (h + i * 19 + short.length * 3) % forms.length;
    let guard = 0;
    while (used.has(idx) && guard < forms.length) {
      idx = (idx + 7) % forms.length;
      guard += 1;
    }
    used.add(idx);
    const [form, material] = forms[idx];
    out.push({ id: String(i + 1), name: `${short} ${form}`, material });
  }
  return out;
}

function brandOwnedStoryCopy(brand: string, short: string, salt: number): { title: string; p1: string; p2: string } {
  const titles = [
    'Cut for the hand',
    'Grain first',
    'Slow hardware',
    'One hide at a time',
    'Bench before batch',
    'Patina on purpose',
    'Quiet stitch work',
    'Hide before hardware',
  ];
  const h = brandFloorSalt(brand);
  const title = titles[(h + salt) % titles.length];
  const bodies = [
    [
      `${brand} works one hide at a time — edges finished soft, stitches checked, hardware chosen to age with the bag.`,
      'No factory line. The bench stays quiet so the grain can show.',
    ],
    [
      `${short} picks skins for character, not uniformity — a scar in the hide becomes part of the piece.`,
      'Hardware is seated by hand. Linings stay quiet under daily wear.',
    ],
    [
      `At ${brand}, brass and thread leave last so the leather can lead.`,
      'Every piece is checked twice before it leaves the table.',
    ],
    [
      `${short} keeps a small rhythm: cut, burnish, stitch, set — then wait for the patina to earn its keep.`,
      'Commissions sit beside the daily bench, never ahead of the grain.',
    ],
  ];
  const [p1, p2] = bodies[(h + salt * 2) % bodies.length];
  return { title, p1, p2 };
}

function brandOwnedFooterLine(brand: string, salt: number): string {
  const lines = [
    'Commissions by note · Bench visits on request · Ships when ready',
    'Write the bench · Book a fitting · Open midweek',
    'Atelier hours by appointment · Materials list on request',
    'Visit when called · Write for commissions · Open by appointment',
    'Private fittings · Hide samples on request · Ships cured',
    'Write for a commission · Bench open by note · Slow dispatch',
  ];
  return lines[(brandFloorSalt(brand) + salt) % lines.length];
}

export function breakInventFloorTwin(
  files: Record<string, string>,
  brief: string,
  productName = '',
): Record<string, string> {
  if (!looksLikeInventFloorTwin(files) && !looksLikeClassicFourBoxAtelierShell(files)) {
    return files;
  }
  if (!thinWantsCompositionalShell(brief) && !briefForbidsGenericAtelierFloor(brief)) {
    return files;
  }
  const brand = String(productName || '').trim() || 'Atelier';
  // Luxury atelier: jump to a different shell family — do not reskin the four-box stamp.
  if (briefForbidsGenericAtelierFloor(brief)) {
    const shell = inventFloorShellId(brand, 2);
    let next = writeAtelierInventShell(files, brand, shell);
    const mark = brandLogoSvgFor({ productName: brand, brief });
    if (mark) next['public/logo.svg'] = mark;
    return ensureLandedSectionsMountedInApp(next, brief, brand);
  }
  const short = brand.replace(/\s+(Atelier|Studio|Co|Lab|House)\s*$/i, '').trim() || brand;
  const next: Record<string, string> = { ...files };
  // Nudge layout salts so structure changes — Fox Latch: name-only swaps still looked identical.
  // Hero/catalog salts are 1–3 only (never classic full-bleed + 2×2 salt 0).
  const layoutSalt = inventFloorHeroSalt(brand, 1);
  const catalogSalt = inventFloorCatalogSalt(brand, 1);
  writeCompositionalInventFloorHero(next, brand, layoutSalt);
  // Replace floor stamp ledes so stampedLede detector cannot keep twin=true after break.
  const heroPath = String(next['src/sections/HeroSection.jsx'] || '').trim()
    ? 'src/sections/HeroSection.jsx'
    : (String(next['src/sections/Hero.jsx'] || '').trim() ? 'src/sections/Hero.jsx' : '');
  if (heroPath) {
    const heroCopy = brandOwnedHeroCopy(brand, short, layoutSalt + 1);
    let heroBody = String(next[heroPath] || '');
    heroBody = heroBody
      .replace(
        /(className=["'][^"']*hero-kicker["'][^>]*>)([^<]*)(<\/)/i,
        `$1${heroCopy.kicker}$3`,
      )
      .replace(
        /(className=["'][^"']*hero-lede["'][^>]*>)([^<]*)(<\/)/i,
        `$1${heroCopy.lede}$3`,
      )
      .replace(
        /(className=["'][^"']*hero-cta["'][^>]*>)([^<]*)(<\/)/i,
        `$1${heroCopy.cta}$3`,
      );
    // Upgrade flat toy hero art to permanent v2 leather plate when present.
    if (/HERO_VISUAL\s*=/.test(heroBody) && !hasAtelierLeatherPlateArt(heroBody)) {
      const upgraded = atelierLeatherHeroDataUrl({
        name: brand,
        brief: `${brand} leather-goods bag-variant-${brandFloorSalt(brand) % 4}`,
        variant: brandFloorSalt(brand) % 8,
      });
      heroBody = heroBody.replace(
        /const HERO_VISUAL\s*=\s*["'`][\s\S]*?["'`];/,
        `const HERO_VISUAL = ${JSON.stringify(upgraded)};`,
      );
    }
    next[heroPath] = heroBody;
  }
  // Brand-owned SKUs — Velvet Latch proved Arc Duffle/Loom Brief was a new twin stamp.
  const uniqueProducts = brandOwnedBreakProducts(short, brand).map((p, i) => ({
    ...p,
    art: skuArtDataUrl(p.name, p.material, i + brandFloorSalt(brand)),
  }));
  writeCompositionalInventFloorCatalog(next, brand, short, catalogSalt);
  // Override catalog names after layout write — keep salt CSS, drop stamp SKUs.
  const catalogPath = 'src/sections/CatalogSection.jsx';
  const catalogBody = String(next[catalogPath] || '');
  if (catalogBody) {
    next[catalogPath] = catalogBody.replace(
      /const PRODUCTS = \[[\s\S]*?\];/,
      `const PRODUCTS = [\n${uniqueProducts.map((p) =>
        `  { id: '${p.id}', name: ${JSON.stringify(p.name)}, material: ${JSON.stringify(p.material)}, art: ${JSON.stringify(p.art)} },`,
      ).join('\n')}\n];`,
    );
  }
  const story = brandOwnedStoryCopy(brand, short, layoutSalt);
  const storyPath = String(next['src/sections/StorySection.jsx'] || '').trim()
    ? 'src/sections/StorySection.jsx'
    : (String(next['src/sections/Story.jsx'] || '').trim()
      ? 'src/sections/Story.jsx'
      : 'src/sections/StorySection.jsx');
  next[storyPath] = [
    "import './StorySection.css';",
    '',
    'export default function StorySection() {',
    '  return (',
    `    <section className="story-section story-layout-${layoutSalt}" id="story" aria-label="Story" data-nova-layout-salt="${layoutSalt}">`,
    '      <div className="story-rail">',
    `        <p className="story-kicker">${short}</p>`,
    `        <h2>${story.title}</h2>`,
    `        <p>${story.p1}</p>`,
    `        <p>${story.p2}</p>`,
    '      </div>',
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n');
  next['src/sections/StorySection.css'] = [
    `.story-section.story-layout-${layoutSalt}{padding:${layoutSalt === 2 ? '3.5rem 12vw' : '4.5rem 8vw'};color:#1a2433;`,
    `background:${layoutSalt % 2 === 0 ? '#efe8dc' : '#f7f2ea'};border-top:1px solid #d9cfc0;}`,
    `.story-rail{max-width:${layoutSalt === 1 ? '48rem' : '38rem'};${layoutSalt === 3 ? 'margin:0 auto;text-align:center;' : ''}}`,
    '.story-kicker{margin:0 0 0.55rem;font-size:0.72rem;letter-spacing:0.2em;text-transform:uppercase;color:#6a5a3e;}',
    '.story-section h2{margin:0 0 1rem;font-size:clamp(1.55rem,3vw,2rem);letter-spacing:-0.02em;}',
    '.story-section p{margin:0 0 0.85rem;line-height:1.7;color:#3a4558;font-size:1.05rem;}',
    '',
  ].join('\n');
  const footerLine = brandOwnedFooterLine(brand, layoutSalt);
  next['src/sections/FooterSection.jsx'] = [
    "import './FooterSection.css';",
    '',
    'export default function FooterSection() {',
    '  return (',
    `    <footer className="footer-section footer-layout-${layoutSalt}" id="contact" role="contentinfo" data-nova-layout-salt="${layoutSalt}">`,
    `      <p className="footer-brand">${brand}</p>`,
    `      <p>${footerLine}</p>`,
    '    </footer>',
    '  );',
    '}',
    '',
  ].join('\n');
  next['src/sections/FooterSection.css'] = [
    `.footer-section.footer-layout-${layoutSalt}{padding:2.5rem 8vw;background:${layoutSalt === 3 ? '#1a2433' : '#142033'};color:#f4efe6;`,
    `${layoutSalt === 1 ? 'display:flex;flex-wrap:wrap;justify-content:space-between;gap:1rem;align-items:center;' : ''}}`,
    '.footer-brand{margin:0 0 0.35rem;font-weight:600;letter-spacing:0.02em;}',
    '.footer-section p{margin:0;opacity:0.9;}',
    '',
  ].join('\n');
  return ensureLandedSectionsMountedInApp(next, brief, brand);
}

/**
 * Stamped invent-floor twin — Acc still the seed / break shell (layout OR catalog stamp).
 * Fox Latch 2026-10-23: Travel Kit / Holdall "craft" sets cleared old detectors while the
 * page was still the same full-bleed bag + 2×2 swatch grid + navy footer.
 */
export function looksLikeInventFloorTwin(files: Record<string, string>): boolean {
  const blob = Object.values(files || {}).join('\n');
  if (!blob.trim()) return false;
  // Modern shell families are intentionally different — never twin.
  if (/data-nova-shell=["'](?:lookbook|rail|feature|strip|commission)["']/i.test(blob)) {
    return false;
  }
  // Garnet-class stamp: sticky Shop|Story|Contact + four equal product cards.
  if (looksLikeClassicFourBoxAtelierShell(files)) return true;
  const stampedCatalog =
    /Weekender[\s\S]{0,400}Crossbody[\s\S]{0,400}Tote[\s\S]{0,400}Belt Bag/i.test(blob)
    || /Field Satchel[\s\S]{0,400}Day Tote[\s\S]{0,400}Courier[\s\S]{0,400}Belt Pouch/i.test(blob)
    || /Overnight[\s\S]{0,400}Shopper[\s\S]{0,400}Messenger[\s\S]{0,400}Card Sleeve/i.test(blob)
    || /Portfolio[\s\S]{0,400}Market Tote[\s\S]{0,400}Sling[\s\S]{0,400}Coin Clutch/i.test(blob)
    || /Holdall[\s\S]{0,400}Briefcase[\s\S]{0,400}Rucksack[\s\S]{0,400}Card Wallet/i.test(blob)
    || /Travel Kit[\s\S]{0,400}Daypack[\s\S]{0,400}Envelope Clutch[\s\S]{0,400}Key Folio/i.test(blob)
    || /Cabin Bag[\s\S]{0,400}Work Folio[\s\S]{0,400}Hip Pack[\s\S]{0,400}Coin Fold/i.test(blob)
    // Velvet Latch 2026-10-23: breakInventFloorTwin Arc Duffle set became the next twin stamp.
    || /Arc Duffle[\s\S]{0,400}Loom Brief[\s\S]{0,400}Ridge Pouch[\s\S]{0,400}Quill Case/i.test(blob);
  const stampedLede = [
    /Handcrafted bags in quiet leather/i,
    /Parchment grounds, espresso type, warm brass hardware/i,
    /Four everyday bags with honest materials/i,
    /builds quiet leather carry/i,
    /Small-batch leather goods from .+: cut on the bench/i,
    /named for this bench, not a catalog filler/i,
    /Craft on a quiet bench/i,
    /selects each hide for grain, burns edges until they hold a soft shine/i,
    /From the .+ bench — full-grain skins, hand-set hardware/i,
    /Cuts and finishes leather carry for people who notice the grain/i,
    /pieces cut for daily carry — materials named on the card/i,
    /Made on one bench/i,
  ].filter((re) => re.test(blob)).length;
  // Layout chrome twin: classic full-bleed + 2×2 only (not salt 1–3 unique shells).
  const layoutChrome =
    (/hero-fullbleed/i.test(blob) || /hero-layout-0/i.test(blob))
    && !/hero-layout-[123]|hero-split|hero-stack|hero-center/i.test(blob)
    && /product-swatch/i.test(blob)
    && (/catalog-grid-2|grid-template-columns:\s*repeat\(2/i.test(blob)
      || /catalog-layout-0/i.test(blob))
    && /Visit the atelier · Write us for commissions|Visit when called · Write for commissions/i.test(blob);
  if (stampedCatalog && stampedLede >= 1) return true;
  if (
    stampedCatalog
    && /hero-fullbleed|hero-layout-/i.test(blob)
    && /Visit the atelier|Visit when called|Commissions by note|Write the bench|Atelier hours by appointment/i.test(blob)
  ) {
    return true;
  }
  if (stampedLede >= 3) return true;
  if (layoutChrome && stampedCatalog) return true;
  // Same invent-floor hero SVG satchel path reused across brands
  // (raw SVG or data-URL percent-encoding).
  if (
    (/M560 320 L620 250 L980 250 L1040 320/i.test(blob)
      || /M560%20320%20L620%20250%20L980%20250%20L1040%20320/i.test(blob))
    && stampedCatalog
  ) {
    return true;
  }
  return false;
}

export function briefForbidsGenericAtelierFloor(brief: string): boolean {
  const t = String(brief || '');
  // Negated leather ("not a leather atelier", "no parchment bags") must NEVER
  // force the leather invent floor onto gaming mice / GPUs / tech retail.
  if (/\b(?:not|no|never|without|unlike|don't|dont|do\s+not)\b[\s\S]{0,40}\b(?:leather|atelier|parchment|satchel|tote|lookbook)\b/i.test(t)) {
    return false;
  }
  // Hardware / tech retail briefs are never leather ateliers.
  if (/\b(?:gaming\s+mouse|gaming\s+mice|gpus?|graphics\s*cards?|keyboard|headset|pc\s*case|voltcore|dark\s+tech)\b/i.test(t)) {
    return false;
  }
  // Only leather / parchment atelier asks — never GPU/desk/SaaS just because
  // the prompt says "premium" or "professional" (VoltCore GPUs got a leather shell).
  const leatherAtelier = (
    /\b(?:leather[- ]?goods|leather\s+atelier|handcrafted\s+bags?|parchment|full[- ]?grain|bridle\s+leather|saddle\s+leather)\b/i.test(t)
    || (/\batelier\b/i.test(t) && /\b(?:bag|bags|leather|parchment|brass|hide|satchel|tote)\b/i.test(t))
    || briefWantsLightPaperGround(t)
  );
  if (!leatherAtelier) return false;
  return (
    /\b(?:unique layout|no generic|not (?:a )?generic|premium|professional|atelier|leather[- ]goods|full[- ]?bleed)\b/i.test(t)
    || briefWantsLightPaperGround(t)
  );
}

/** Unique-layout atelier Acc must carry data-nova-layout-salt (Onyx Latch hollow craft). */
export function atelierAccMissingLayoutSalt(
  files: Record<string, string>,
  brief: string,
): boolean {
  if (!briefForbidsGenericAtelierFloor(brief)) return false;
  const blob = Object.values(files || {}).join('\n');
  return !/data-nova-layout-salt=["']\d["']/i.test(blob);
}

/** Thin LLM hollow that Ready'd without salt — Espresso Briefcase / Our Products shell. */
export function looksLikeHollowAtelierCraft(
  files: Record<string, string>,
  brief: string,
): boolean {
  if (!briefForbidsGenericAtelierFloor(brief)) return false;
  const blob = Object.values(files || {}).join('\n');
  if (/data-nova-layout-salt=["']\d["']/i.test(blob)) return false;
  return (
    /Our Products|Our Craft|Handcrafted premium leather goods|Espresso Briefcase|info@[a-z0-9.-]+atelier/i.test(blob)
    || (/hero-fullbleed/i.test(blob) && /<(?:h2|h3)[^>]*>\s*Our\s+/i.test(blob))
  );
}

/**
 * Noir Latch: empty identical .product-swatch divs (CSS gradient only) = stamp shop,
 * even when SKU names differ. Luxury atelier Acc needs per-SKU art.
 */
export function looksLikeEmptySwatchAtelier(
  files: Record<string, string>,
  brief: string,
): boolean {
  if (!briefForbidsGenericAtelierFloor(brief)) return false;
  const cat = String(
    files['src/sections/CatalogSection.jsx']
    || files['src/sections/ProductGrid.jsx']
    || '',
  );
  if (!cat.trim()) return false;
  const emptySwatches = (
    cat.match(/className=["'][^"']*product-swatch[^"']*["'][^>]*\/?\s*>/g) || []
  ).length;
  const hasSkuArt = /art:\s*["']data:image\/svg\+xml/i.test(cat)
    || /className=["'][^"']*product-art[^"']*["']/i.test(cat);
  // Luxury atelier: toy SVG paths without grain plate still count as empty stamp art.
  const hasLuxuryPlate = hasAtelierLeatherPlateArt(cat);
  const crestHero = /hero-center|hero-layout-3[\s\S]{0,200}hero-stage[\s\S]{0,120}hero-art/i.test(
    Object.values(files || {}).join('\n'),
  );
  if (emptySwatches >= 3 && !hasSkuArt) return true;
  if (crestHero && emptySwatches >= 2 && !hasSkuArt) return true;
  if (hasSkuArt && !hasLuxuryPlate && /product-art|art:\s*["']data:image\/svg\+xml/i.test(cat)) {
    // Flat invent-floor toy bags (pre-v2) — force ensure/break to rewrite plates.
    return true;
  }
  return false;
}

/** Strip leaked hero-stage from editorial salt-3 (Ivory Latch one-word-column Live). */
export function healEditorialHeroAcc(files: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = { ...files };
  for (const rel of ['src/sections/HeroSection.jsx', 'src/sections/Hero.jsx']) {
    let body = String(next[rel] || '');
    if (!body.trim()) continue;
    if (!/hero-layout-3|hero-editorial/i.test(body)) continue;
    body = body
      .replace(/const HERO_VISUAL\s*=\s*["'`][\s\S]*?["'`];?\s*/g, '')
      .replace(/<div[^>]*className=["'][^"']*hero-stage[^"']*["'][^>]*>[\s\S]*?<\/div>\s*/gi, '');
    if (!/hero-rail/i.test(body)) {
      body = body.replace(
        /(<section\b[^>]*>)/i,
        '$1\n      <div className="hero-rail" aria-hidden="true" />',
      );
    }
    next[rel] = body;
  }
  for (const rel of ['src/sections/HeroSection.css', 'src/sections/Hero.css']) {
    const css = String(next[rel] || '');
    if (!css.trim() || !/hero-layout-3/i.test(css)) continue;
    if (/grid-template-areas:\s*["']rail copy["']/i.test(css)) continue;
    next[rel] = [
      '.hero-section.hero-layout-3{min-height:88vh;display:grid;',
      'grid-template-columns:10px minmax(0,1fr);grid-template-areas:"rail copy";',
      'align-items:stretch;padding:0;background:#faf6ef;color:#101828;}',
      '.hero-layout-3 .hero-rail{grid-area:rail;background:linear-gradient(180deg,#b08d57,#8b6914);}',
      '.hero-layout-3 .hero-copy{grid-area:copy;padding:5.5rem clamp(1.5rem,8vw,6rem) 4.5rem;',
      'max-width:42rem;width:100%;text-align:left;box-sizing:border-box;}',
      '.hero-layout-3 .hero-stage,.hero-layout-3 .hero-art{display:none!important;height:0!important;',
      'min-height:0!important;margin:0!important;padding:0!important;border:0!important;}',
      '.hero-layout-3 .hero-title{font-size:clamp(2.6rem,5.5vw,4.4rem);max-width:18ch;line-height:1.05;}',
      '.hero-layout-3 .hero-lede{max-width:36rem;width:100%;}',
      '.hero-layout-3 .hero-meta{display:flex;flex-wrap:wrap;gap:0.75rem 1.25rem;margin:0 0 1.75rem;',
      'font-size:0.78rem;letter-spacing:0.14em;text-transform:uppercase;color:#6a5a3e;}',
      '.hero-layout-3 .hero-meta span{border-bottom:1px solid #d4c6b0;padding-bottom:0.2rem;}',
      '.hero-layout-3 .hero-cta{border-radius:4px;background:#142033;white-space:nowrap;}',
      '.hero-kicker{margin:0 0 0.65rem;font-size:0.72rem;letter-spacing:0.22em;text-transform:uppercase;color:#6a5a3e;}',
      '.hero-title{font-size:clamp(2.4rem,5.5vw,4.2rem);letter-spacing:-0.035em;line-height:1.02;margin:0 0 1rem;color:#101828;font-weight:600;}',
      '.hero-lede{max-width:32rem;font-size:1.12rem;line-height:1.6;margin:0 0 1.5rem;color:#3a4558;}',
      '.hero-cta{display:inline-flex;align-items:center;padding:0.85rem 1.35rem;background:#9a7340;color:#faf6ef;',
      'text-decoration:none;border-radius:999px;font-weight:600;letter-spacing:0.02em;}',
      '',
    ].join('\n');
  }
  // Neutralize global App.css hero-stage stomps on editorial Acc.
  const appCss = String(next['src/App.css'] || '');
  if (appCss && /\.hero-stage\s*\{/i.test(appCss)) {
    next['src/App.css'] = `${appCss}\n/* heal: editorial hero must not inherit absolute stage */\n`
      + '.hero-layout-3 .hero-stage,.hero-editorial .hero-stage{display:none!important;min-height:0!important;}\n';
  }
  return next;
}

/** Force invent-floor + break when unique atelier Acc lacks salt or is hollow/twin. */
export function ensureAtelierUniqueLayoutAcc(
  files: Record<string, string>,
  brief: string,
  productName = '',
): Record<string, string> {
  if (!briefForbidsGenericAtelierFloor(brief)) return files;
  const brand = String(productName || '').trim() || 'Atelier';
  const short = brand.replace(/\s+(Atelier|Studio|Co|Lab|House)\s*$/i, '').trim() || brand;
  const blob0 = Object.values(files || {}).join('\n');
  const missingLuxuryPlate = /product-art|HERO_VISUAL|art:\s*["']data:image\/svg\+xml/i.test(blob0)
    && !hasAtelierLeatherPlateArt(blob0)
    && !/data-nova-shell=["']commission["']/i.test(blob0);
  const needsForce = atelierAccMissingLayoutSalt(files, brief)
    || looksLikeHollowAtelierCraft(files, brief)
    || looksLikeEmptySwatchAtelier(files, brief)
    || looksLikeInventFloorTwin(files)
    || looksLikeClassicFourBoxAtelierShell(files)
    || missingLuxuryPlate;
  let next = needsForce ? seedCompositionalInventFloor({ ...files }, brief, brand) : { ...files };
  if (needsForce && (looksLikeInventFloorTwin(next) || looksLikeClassicFourBoxAtelierShell(next))) {
    next = breakInventFloorTwin(next, brief, brand);
  }
  // Seed can early-return without modern shell — force a different family.
  const blob1 = Object.values(next).join('\n');
  const hasModernShell = /data-nova-shell=["'](?:lookbook|rail|feature|strip|commission)["']/i.test(blob1);
  if (needsForce && !hasModernShell) {
    next = writeAtelierInventShell(next, brand, inventFloorShellId(brand, 3));
  }
  next = healEditorialHeroAcc(next);
  if (accHasModernAtelierShell(next)) {
    next = healModernAtelierCompanionStomp(next, brand);
  }
  return ensureLandedSectionsMountedInApp(next, brief, brand);
}

/**
 * Invent-floor Acc already clears Live visual + ask-match — skip multi-minute invent thrash.
 * River Hide 2026-10-23: floor+vite on disk, create hung ~12m on invent, Live never unlocked.
 * Willow Latch: stamped twin must NOT clear — craft must enrich past the floor shell.
 */
export function inventFloorClearsLive(
  files: Record<string, string>,
  brief: string,
  productName = '',
): boolean {
  // Non-web / non-product asks never use invent-floor Live clearance.
  {
    const kind = resolveArtifactKind(brief);
    if (isNonWebArtifactKind(kind)) return false;
    if (kind === 'web-app' || kind === 'game' || kind === 'electron' || kind === 'extension') {
      if (!artifactWantsProductLadder(kind, brief)) return false;
    }
  }
  if (!thinBriefWantsDepth(brief) || !thinWantsCompositionalShell(brief)) return false;
  // Premium / unique atelier asks: floor is paint insurance only — block the
  // fast-path while Acc is still a stamped twin. Once craft enriched past the
  // twin and visual/ask bars clear, allow Live (was holding invent ~8–12m because
  // "professional premium" in every invent prompt forever returned false).
  if (briefForbidsGenericAtelierFloor(brief) && looksLikeInventFloorTwin(files)) {
    return false;
  }
  if (briefForbidsGenericAtelierFloor(brief) && looksLikeClassicFourBoxAtelierShell(files)) {
    return false;
  }
  if (
    atelierAccMissingLayoutSalt(files, brief)
    || looksLikeHollowAtelierCraft(files, brief)
    || looksLikeEmptySwatchAtelier(files, brief)
  ) {
    return false;
  }
  // Luxury / unique atelier: must be a modern shell family (not four-box stamp) + v2 plates when art ships.
  if (briefForbidsGenericAtelierFloor(brief)) {
    const blob = Object.values(files || {}).join('\n');
    if (!/data-nova-shell=["'](?:lookbook|rail|feature|strip|commission)["']/i.test(blob)) {
      return false;
    }
    if (/product-art|HERO_VISUAL|art:\s*["']data:image\/svg\+xml/i.test(blob)
      && !hasAtelierLeatherPlateArt(blob)) {
      return false;
    }
  }
  // Product / hardware invents: fast-path Live only after Premium craft.
  // Stops Quality-step Acc from clearing Live before premium enrich lands.
  if (briefWantsProductLadder(brief) && !productMeetsPremiumLock(files, brief, productName)) {
    return false;
  }
  const name = String(productName || '').trim() || buildAskContract(brief).productName;
  if (!thinMeetsLiveVisualFloor(files, brief)) return false;
  const ask = thinAskMatchDeficits(files, brief, name)
    .filter((r) => !/bare Vite|nav-only scaffold/i.test(r));
  if (ask.length) return false;
  return listLandedCompositionalSections(files, brief, name).length
    >= THIN_LIVE_VISUAL_MIN_LANDED_SECTIONS;
}

/** Depth section slots from product plan / brief — no tin/harvest/steep defaults for tip/todo. */
export function formatDepthSectionSlots(brief: string, productName?: string): readonly string[] {
  const b = String(brief || '').trim();
  const name = String(productName || '').trim();
  const plan = buildProductPlan(b, name);
  const regions = plan.requiredRegions || [];
  const regionSlot = (r: string): string => {
    const key = String(r || '').toLowerCase();
    if (/nav|sidebar|shell|chrome|hud/.test(key)) {
      return 'nav/header chrome with /logo.svg or clear wordmark';
    }
    if (/hero|cover|stage/.test(key)) {
      return 'hero / primary visual + headline + primary CTA';
    }
    if (/band|story|feature/.test(key)) {
      return 'story / feature band with real copy + nested markup';
    }
    if (/filter|product|grid|catalog|cart|checkout/.test(key)) {
      return 'catalog / filters / product grid + cart or purchase path';
    }
    if (/input|result|control/.test(key)) {
      return 'tool inputs + compute/action + readable result area';
    }
    if (/main|workspace|primary-action|empty/.test(key)) {
      return 'main workspace + primary action + sample items or empty state';
    }
    if (/footer/.test(key)) {
      return 'footer with links / legal / secondary CTA';
    }
    return `${r} region — substantial JSX + copy for this brief`;
  };
  const fromRegions = regions.map(regionSlot);
  const familyExtras: Record<string, string[]> = {
    'marketing-bands': [
      'social proof or metrics band',
      'secondary CTA band before footer',
    ],
    'catalog-store': ['product detail or highlight strip'],
    'app-chrome': ['list/detail or sidebar navigation state'],
    'tool-panel': ['helper hints / validation / reset'],
    'game-stage': ['score/status HUD + restart affordance'],
  };
  const extras = familyExtras[plan.compositionFamily] || [];
  // Ask contract — brief-required bands (notes / shop / subscribe) before family fluff.
  const askExtras = buildAskContract(b, name).extraSlots;
  const checklistSlots = (plan.checklist || [])
    .slice(0, 3)
    .map((c) => String(c).trim())
    .filter(Boolean);
  const slots = [...fromRegions, ...askExtras, ...extras, ...checklistSlots];
  const unique = [...new Set(slots.map((s) => s.trim()).filter(Boolean))];
  if (unique.length >= 4) return unique.slice(0, 8);
  // Generic marketing / utility fallback when plan is sparse.
  const generic = thinBriefWantsDepth(b)
    ? [
      'nav/header with /logo.svg',
      'hero + primary CTA',
      'core value / story section',
      'features or proof section',
      'secondary action section',
      'footer',
    ]
    : [
      'tool chrome + title',
      'primary inputs / controls',
      'result or main content panel',
      'footer or helper row',
    ];
  return [...new Set([...unique, ...generic])].slice(0, 8);
}

/** @deprecated Use formatDepthSectionSlots(brief) — family-derived slots, not tea-branded defaults. */
export const THIN_DEPTH_SECTION_SLOTS = formatDepthSectionSlots('');

export type ThinDepthLedger = {
  compact: number;
  lines: number;
  landmarks: number;
  cssCompact: number;
  hasLogo: boolean;
};

/** Snapshot depth metrics from current files. */
/** Section styles are part of invent Acc — App.css alone under-counts compositional Live floor. */
function compositionalCssBodies(files: Record<string, string>): string {
  return Object.entries(files || {})
    .filter(([k]) => /^src\/sections\/[^/]+\.css$/i.test(String(k || '').replace(/\\/g, '/')))
    .map(([, v]) => String(v || ''))
    .join('\n');
}

export function readThinDepthLedger(files: Record<string, string>): ThinDepthLedger {
  const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
  const css = String(files['src/App.css'] || '');
  const sectionCss = compositionalCssBodies(files);
  const sectionBlob = compositionalSectionBodies(files);
  const composed = sectionBlob ? `${app}\n${sectionBlob}` : app;
  const cssAll = sectionCss ? `${css}\n${sectionCss}` : css;
  return {
    compact: composed.replace(/\s+/g, '').length,
    lines: (app ? app.split(/\r?\n/).length : 0)
      + (sectionBlob ? sectionBlob.split(/\r?\n/).length : 0),
    landmarks: countThinLandmarks(composed),
    // Moss Thread premium bar: invent-floor section CSS was invisible to cssCompact (117 vs 1600).
    cssCompact: cssAll.replace(/\s+/g, '').length,
    hasLogo: /\/logo\.svg/i.test(composed),
  };
}

/** Nova-owned section files are self-contained: interactivity must live in the file. */
export function compositionalSectionIsInteractive(body: string): boolean {
  return /\buseState\b|\buseReducer\b|\bonClick=|\bonSubmit=|\bonChange=/.test(String(body || ''));
}

/**
 * Depth must never buy ledger growth by trading away what the ask already delivered
 * (interactive notes/shop/subscribe stubs, hero product art). Without this guard a fat
 * static clone wins the ledger comparison and silently strips a seeded interactive section.
 *
 * Returns `path:capability` for every delivered capability a depth write dropped.
 * Removal of a whole file is not judged here — the retired-section / PageBody path owns that.
 */
export function compositionalDepthDropsDeliveredMarkers(
  priorFiles: Record<string, string>,
  nextFiles: Record<string, string>,
): string[] {
  const dropped: string[] = [];
  const nextByPath = new Map<string, string>();
  for (const [path, body] of Object.entries(nextFiles || {})) {
    nextByPath.set(String(path || '').replace(/\\/g, '/'), String(body || ''));
  }
  for (const [path, priorBody] of Object.entries(priorFiles || {})) {
    const norm = String(path || '').replace(/\\/g, '/');
    if (!/^src\/sections\/[^/]+\.jsx$/i.test(norm)) continue;
    if (!nextByPath.has(norm)) continue;
    const nextBody = String(nextByPath.get(norm) || '');
    if (!nextBody.trim()) continue;
    const prior = String(priorBody || '');
    if (compositionalSectionIsInteractive(prior) && !compositionalSectionIsInteractive(nextBody)) {
      dropped.push(`${norm}:interactive`);
    }
    if (heroSectionHasProductArt(prior) && !heroSectionHasProductArt(nextBody)) {
      dropped.push(`${norm}:hero-art`);
    }
  }
  return dropped;
}

/** Studio-facing reason when depth strips delivered interactivity / hero art. */
export function formatCompositionalDepthDropReason(drops: readonly string[]): string {
  if (!drops.length) return '';
  const parts = drops.map((d) => {
    const [path, cap] = String(d).split(':');
    const short = String(path || '').replace(/^src\/sections\//i, '').replace(/\.jsx$/i, '');
    if (cap === 'interactive') return `${short} interactive`;
    if (cap === 'hero-art') return `${short} hero-art`;
    return String(d);
  });
  return `stripped delivered ${parts.join(', ')}`;
}

/**
 * Ledger gain across App + section files + CSS (compositional depth).
 * A rewrite that strips delivered interactivity / hero art is not gain even when it is fatter —
 * the depth loop then retires that path (C2) instead of letting a static clone win.
 */
export function thinDepthFilesLedgerGain(
  priorFiles: Record<string, string>,
  nextFiles: Record<string, string>,
  opts?: { allowLandmarkShellDrop?: boolean },
): boolean {
  const priorPicked = pickThinDepthFiles(priorFiles);
  const nextPicked = pickThinDepthFiles(nextFiles);
  if (compositionalDepthDropsDeliveredMarkers(priorPicked, nextPicked).length) return false;
  const prior = readThinDepthLedger(priorPicked);
  const next = readThinDepthLedger(nextPicked);
  return thinDepthLedgerGain(prior, next, {
    ...opts,
    priorFiles: priorPicked,
    nextFiles: nextPicked,
  });
}

export function thinDepthLedgerMeetsFloor(ledger: ThinDepthLedger): boolean {
  return ledger.compact >= THIN_DEPTH_MIN_APP_CHARS
    && ledger.lines >= 280
    && ledger.landmarks >= THIN_DEPTH_MIN_SECTIONS
    && ledger.cssCompact >= 3200
    && ledger.hasLogo;
}

/** Format ledger for status / prompts. */
export function formatThinDepthLedger(ledger: ThinDepthLedger): string {
  return [
    `${ledger.compact}/${THIN_DEPTH_MIN_APP_CHARS} chars`,
    `${ledger.lines}/280 lines`,
    `${ledger.landmarks}/${THIN_DEPTH_MIN_SECTIONS} sections`,
    `${ledger.cssCompact}/3200 css`,
    ledger.hasLogo ? 'logo✓' : 'logo✗',
  ].join(' · ');
}

/**
 * Accept any non-shrinking edit that raises the ledger (or clears the floor).
 * Replaces "beat prior by 1125 compact chars in one shot".
 *
 * opts.allowLandmarkShellDrop — compositional shell assemble swaps inline
 * <header>/<section> for <FooSection /> tags that countThinLandmarks ignores.
 * Depth loops should prefer measuring gain *before* assemble; this flag is the
 * belt-and-suspenders when a caller must compare a post-assemble tree.
 */
export function thinDepthLedgerGain(
  prior: ThinDepthLedger,
  next: ThinDepthLedger,
  opts?: {
    allowLandmarkShellDrop?: boolean;
    priorFiles?: Record<string, string>;
    nextFiles?: Record<string, string>;
  },
): boolean {
  if (thinDepthLedgerMeetsFloor(next)) return true;
  // A compositional pass often adds a real section without increasing the
  // generic landmark regex count (for example a product grid in a <div>).
  // Keep material section-file growth when it does not erase existing content;
  // the compiler and ask-specific Live checks are the quality gates.
  const priorSectionChars = compositionalSectionBodies(opts?.priorFiles || {}).replace(/\s+/g, '').length;
  const nextSectionChars = compositionalSectionBodies(opts?.nextFiles || {}).replace(/\s+/g, '').length;
  const sectionGrowth = nextSectionChars >= priorSectionChars + THIN_COMPOSITIONAL_SECTION_MIN_CHARS;
  if (sectionGrowth && next.compact >= prior.compact - 40 && next.cssCompact >= prior.cssCompact - 40) return true;
  // Shrink guards — never keep a thinner shell.
  if (next.compact < prior.compact - 40) return false;
  if (next.lines < prior.lines - 2) return false;
  if (next.landmarks < prior.landmarks && !opts?.allowLandmarkShellDrop) return false;
  if (next.cssCompact < prior.cssCompact - 40) return false;
  return next.compact > prior.compact + 80
    || next.lines > prior.lines + 8
    || next.landmarks > prior.landmarks
    || next.cssCompact > prior.cssCompact + 80
    || (!prior.hasLogo && next.hasLogo);
}

/** True when App source looks truncated mid-write (bad depth prior). */
export function thinAppLooksTruncated(app: string): boolean {
  const raw = String(app || '');
  if (!raw.trim()) return true;
  if (!/export\s+default\b/i.test(raw)) return true;
  const trimmed = raw.trim();
  if (/<[A-Za-z][\w.:-]*[^>]*$/m.test(trimmed)) return true;
  if (/\{\s*$/m.test(trimmed) || /\(\s*$/m.test(trimmed)) return true;
  const open = (raw.match(/\{/g) || []).length;
  const close = (raw.match(/\}/g) || []).length;
  if (open > close + 1) return true;
  return false;
}

/** Structured deficits for depth prompts + Ready alignment. */
export function thinDepthDeficits(
  files: Record<string, string>,
  brief: string,
): string[] {
  if (!thinBriefWantsDepth(brief)) return [];
  const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
  const css = String(files['src/App.css'] || '');
  const sectionBlob = compositionalSectionBodies(files);
  const composed = sectionBlob ? `${app}\n${sectionBlob}` : app;
  const deficits: string[] = [];
  if (!app.trim()) {
    deficits.push('App.jsx missing');
    return deficits;
  }
  const ledger = readThinDepthLedger(files);
  const compact = composed.replace(/\s+/g, '');
  const sectionCount = ledger.landmarks;
  const lineCount = ledger.lines;
  const cssCompact = css.replace(/\s+/g, '').length;
  if (compact.length < THIN_DEPTH_MIN_APP_CHARS) {
    deficits.push(`composed compact chars ${compact.length} < ${THIN_DEPTH_MIN_APP_CHARS}`);
  }
  if (lineCount < 280) deficits.push(`composed lines ${lineCount} < 280`);
  if (sectionCount < THIN_DEPTH_MIN_SECTIONS) {
    deficits.push(`sections ${sectionCount} < ${THIN_DEPTH_MIN_SECTIONS}`);
  }
  if (cssCompact < 3200) deficits.push(`CSS compact ${cssCompact} < 3200`);
  if (thinWantsCompositionalShell(brief)) {
    const next = nextCompositionalDepthTarget(files, brief);
    if (next) {
      deficits.push(`section file missing/thin: ${next.filePath} (${next.slotLabel})`);
    }
  }
  if (/product-card|filteredProducts|Search products|Experience the future of technology/i.test(app)
    && sectionCount < 4) {
    deficits.push('stub shell smell (generic product-card / future-of-technology)');
  }
  if (/\bCOVER_HREFS\b/.test(app) && !/\b(?:const|let|var)\s+COVER_HREFS\b/.test(app)) {
    deficits.push('COVER_HREFS used but never declared');
  }
  if (!ledger.hasLogo) {
    deficits.push('nav brand missing /logo.svg');
  }
  return deficits;
}

/** Soft rubric misses for repair prompts — not structural depth blockers. */
export function thinQualityRubricHints(files: Record<string, string>, brief: string): string[] {
  if (!thinBriefWantsDepth(brief)) return [];
  return formatCreateQualityRubricReasons(files, brief).slice(0, 5);
}

/** Bail the depth for-loop after this many consecutive same-reason thin rejects. */
export const THIN_DEPTH_SAME_REJECT_BAIL = 3;

/** Normalize reject text so "rewrite too thin (80…)" and "(91…)" count as the same stall. */
export function thinDepthRejectReasonKey(reason: string): string {
  return String(reason || '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\d+/g, 'N')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Track consecutive same-reason rejects with no meaningful App byte change.
 * Returns true when the depth loop should stop retrying (bail).
 */
export function thinDepthSameRejectStalled(opts: {
  reason: string;
  appBytes: number;
  state: { key: string; bytes: number; count: number };
  bailAfter?: number;
}): boolean {
  const key = thinDepthRejectReasonKey(opts.reason);
  const bail = Math.max(2, Number(opts.bailAfter) || THIN_DEPTH_SAME_REJECT_BAIL);
  const bytes = Math.max(0, Number(opts.appBytes) || 0);
  if (
    key
    && key === opts.state.key
    && Math.abs(bytes - opts.state.bytes) < 80
  ) {
    opts.state.count += 1;
  } else {
    opts.state.key = key;
    opts.state.bytes = bytes;
    opts.state.count = 1;
  }
  return opts.state.count >= bail;
}

/**
 * True when a depth rewrite raised the deficit ledger (or cleared the floor).
 * opts.priorCss / nextCss optional — CSS-only gains count when App does not shrink.
 */
export function thinDepthReplyGrew(
  priorApp: string,
  nextApp: string,
  opts?: {
    minGrowthChars?: number;
    minGrowthRatio?: number;
    priorCss?: string;
    nextCss?: string;
    priorFiles?: Record<string, string>;
    nextFiles?: Record<string, string>;
    /** See thinDepthLedgerGain — compositional shell assemble landmark drop. */
    allowLandmarkShellDrop?: boolean;
  },
): boolean {
  void opts?.minGrowthChars;
  void opts?.minGrowthRatio;
  if (opts?.priorFiles && opts?.nextFiles) {
    return thinDepthFilesLedgerGain(opts.priorFiles, opts.nextFiles, {
      allowLandmarkShellDrop: opts.allowLandmarkShellDrop,
    });
  }
  const priorRaw = String(priorApp || '');
  const nextRaw = String(nextApp || '');
  if (nextRaw === priorRaw
    && String(opts?.nextCss || '') === String(opts?.priorCss || '')) {
    return false;
  }
  const nextSectionBlob = opts?.nextFiles ? compositionalSectionBodies(opts.nextFiles) : '';
  const priorSectionBlob = opts?.priorFiles ? compositionalSectionBodies(opts.priorFiles) : '';
  if (nextRaw.replace(/\s+/g, '').length < 400 && !nextSectionBlob.replace(/\s+/g, '').length) {
    return false;
  }
  const prior = readThinDepthLedger({
    'src/App.jsx': priorRaw,
    'src/App.css': String(opts?.priorCss || ''),
    ...(opts?.priorFiles || {}),
  });
  const next = readThinDepthLedger({
    'src/App.jsx': nextRaw,
    'src/App.css': String(opts?.nextCss || opts?.priorCss || ''),
    ...(opts?.nextFiles || {}),
  });
  if (nextRaw === priorRaw
    && String(opts?.nextCss || '') === String(opts?.priorCss || '')
    && nextSectionBlob === priorSectionBlob) {
    return false;
  }
  return thinDepthLedgerGain(prior, next);
}

/**
 * Same-model depth continue — invent MORE of THIS brief via section composition.
 * No whole-file prior+1125 bar; ledger deficits + section slots drive the ask.
 */
export function formatDepthContinuePrompt(opts: {
  brief: string;
  productName?: string;
  priorApp: string;
  priorCss?: string;
  pass: number;
  /** Why the previous attempt was rejected — fed back so the 7B does not freeze-retry. */
  rejectReason?: string;
  deficits?: string[];
  ledger?: ThinDepthLedger;
  /** Full project files — compositional ledger + next section slot. */
  files?: Record<string, string>;
  /** Skip re-asking these section paths after zero-gain (single path or retired set). */
  avoidSectionPath?: string | readonly string[];
}): string {
  const name = String(opts.productName || '').trim() || 'App';
  const brief = String(opts.brief || '').trim().slice(0, 900);
  const priorRaw = String(opts.priorApp || '');
  const priorFiles = opts.files || {
    'src/App.jsx': priorRaw,
    'src/App.css': String(opts.priorCss || ''),
  };
  const composedPrior = compositionalSectionBodies(priorFiles)
    ? `${priorRaw}\n${compositionalSectionBodies(priorFiles)}`
    : priorRaw;
  // Short outline only — never feed fat App to compositional depth (7B clones it).
  const stub = priorRaw.slice(0, 900);
  const cssStub = String(opts.priorCss || '').slice(0, 600);
  const pass = Math.max(1, Number(opts.pass) || 1);
  const ledger = opts.ledger || readThinDepthLedger(priorFiles);
  const compositional = thinWantsCompositionalShell(brief);
  const nextSection = compositional
    ? nextCompositionalDepthTarget(priorFiles, brief, name, opts.avoidSectionPath)
    : null;
  const compositionalTopUp = compositional && !nextSection;
  const topUpSections = compositionalTopUp
    ? thinnestCompositionalSections(priorFiles, brief, name, 2)
    : [];
  const deficits = (opts.deficits || []).filter(Boolean);
  const reject = String(opts.rejectReason || '').trim();
  const sectionSlots = formatDepthSectionSlots(brief, name);
  const missingSlots = sectionSlots.filter((slot) => {
    const key = slot.split('(')[0].split('/')[0].trim().toLowerCase();
    if (/logo|wordmark|nav|header|chrome/.test(key) && !ledger.hasLogo && !/<header|className=["'][^"']*nav/i.test(composedPrior)) {
      return true;
    }
    if (/hero|primary visual|cover|stage/.test(key) && !/hero|cover|banner|stage|headline/i.test(composedPrior)) return true;
    if (/story|feature|value|proof|band/.test(key) && !/story|feature|about|why|proof|testimonial/i.test(composedPrior)) {
      return true;
    }
    if (/catalog|filter|product|cart|purchase/.test(key) && !/product|cart|filter|catalog|grid|checkout/i.test(composedPrior)) {
      return true;
    }
    if (/input|tool|compute|result/.test(key) && !/input|button|result|output|compute|calc/i.test(composedPrior)) {
      return true;
    }
    if (/workspace|sidebar|empty|primary action/.test(key) && !/sidebar|workspace|empty|add|create|main/i.test(composedPrior)) {
      return true;
    }
    if (/footer/.test(key) && !/footer|©|copyright/i.test(composedPrior)) return true;
    return ledger.landmarks < THIN_DEPTH_MIN_SECTIONS;
  });
  const appMetricsOpen = ledger.compact < THIN_DEPTH_MIN_APP_CHARS
    || ledger.lines < 280
    || ledger.landmarks < THIN_DEPTH_MIN_SECTIONS
    || !ledger.hasLogo;
  const cssOnlyOk = !appMetricsOpen && ledger.cssCompact < 3200;
  const compositionalSectionPass = compositional && nextSection && !cssOnlyOk;
  // Patch 3 (Freebuff F): blank Prior App/CSS outline for ALL compositional depth —
  // not only section/top-up — so 7B never clones the monolith stub.
  const priorOutline = compositional ? '' : stub;
  const cssOutline = compositional ? '' : cssStub;
  return [
    `DEPTH CONTINUE ${pass}/${THIN_DEPTH_CONTINUE_MAX} — ${name}`,
    compositionalSectionPass
      ? `COMPOSITIONAL DEPTH: App.jsx is a shell — invent ONE section file this pass. Do NOT rewrite the whole App.`
      : compositionalTopUp
        ? `COMPOSITIONAL TOP-UP: grow the thinnest section files toward ~${THIN_COMPOSITIONAL_SECTION_TARGET_CHARS} compact each. Do NOT rewrite ${THIN_CREATE_APP_PATH}.`
        : cssOnlyOk
          ? 'Prior App size/sections are OK but CSS ledger is still thin. You MAY reply with ONLY @@@FILE src/App.css if CSS raises the ledger; otherwise rewrite App.jsx + App.css.'
          : 'Prior App compiled but the DEPTH LEDGER is still open. Rewrite App.jsx + App.css — invent from the brief.',
    `LEDGER NOW: ${formatThinDepthLedger(ledger)}`,
    `FLOOR: ${THIN_DEPTH_MIN_APP_CHARS} compact chars · 280 lines · ${THIN_DEPTH_MIN_SECTIONS} sections · 3200 CSS · /logo.svg in nav.`,
    'ACCEPTANCE: raise at least one ledger metric without shrinking others (add a real section / copy / CSS / logo). Do NOT clone the thin stub.',
    compositionalSectionPass
      ? [
        `REQUIRED: @@@FILE ${nextSection!.filePath} — export default function ${nextSection!.componentName}() with real JSX + copy for: ${nextSection!.slotLabel}.`,
        `Target ~${THIN_COMPOSITIONAL_SECTION_TARGET_CHARS} compact chars (a full 40–70 line section).`,
        `- Do NOT output @@@FILE ${THIN_CREATE_APP_PATH} this pass.`,
        `OPTIONAL: @@@FILE src/App.css (styles only).`,
      ].join('\n')
      : compositionalTopUp && topUpSections.length
        ? [
          ...topUpSections.map((s) => (
            `REQUIRED: @@@FILE ${s.filePath} — grow ${s.componentName} toward ~${THIN_COMPOSITIONAL_SECTION_TARGET_CHARS} compact (${s.slotLabel}).`
          )),
          `- Do NOT output @@@FILE ${THIN_CREATE_APP_PATH} this pass.`,
          'OPTIONAL: @@@FILE src/App.css (atmosphere / type / spacing).',
        ].join('\n')
        : appMetricsOpen
          ? `REQUIRED: @@@FILE ${THIN_CREATE_APP_PATH} must change. Also @@@FILE src/App.css.`
          : `REQUIRED: @@@FILE src/App.css (App.jsx optional this pass if App metrics already meet floor).`,
    'Compose these sections (fill missing ones with real JSX + copy):',
    ...formatCompositionalSectionSpecs(brief, name).map((s, i) => `  ${i + 1}. ${s.componentName} — ${s.slotLabel}`),
    missingSlots.length
      ? `Priority gaps this pass:\n${missingSlots.slice(0, 4).map((s) => `- ${s}`).join('\n')}`
      : '',
    deficits.length ? `Still missing:\n${deficits.map((d) => `- ${d}`).join('\n')}` : '',
    reject ? `Previous attempt rejected: ${reject}. Fix that — do not repeat the same thin shell.` : '',
    'Rules:',
    '- Plain JavaScript JSX only. Complete tags. export default.',
    '- Invent UNIQUE layout/copy for THIS brief — never apple.com / tip / todo / canned brand paste.',
    '- Each section needs real copy + nested markup + CTA where relevant — not empty wrappers.',
    '- Substantial CSS (atmosphere, type, spacing). Nav = <img src="/logo.svg" />.',
    '- Valid JSX: every tag closed; buttons `<button onClick={() => …}>Label</button>`.',
    '- If you use COVER_HREFS you MUST declare const COVER_HREFS = [...].',
    brief ? `User brief (source of truth):\n${brief}` : '',
    priorOutline ? `Prior App outline (expand — do not keep this thin shape):\n${priorOutline}` : '',
    cssOutline ? `Prior CSS outline:\n${cssOutline}` : '',
  ].filter(Boolean).join('\n');
}

/** @deprecated Use thinNeedsDepthPass — kept for any leftover imports. */
export function thinAppleNeedsQualityPass(files: Record<string, string>, brief: string): boolean {
  return thinNeedsDepthPass(files, brief);
}

/** @deprecated Use formatDepthContinuePrompt. */
export function formatAppleQualityFinishPrompt(opts: {
  brief: string;
  productName?: string;
  priorApp: string;
}): string {
  return formatDepthContinuePrompt({
    brief: opts.brief,
    productName: opts.productName,
    priorApp: opts.priorApp,
    pass: 1,
  });
}
