/**
 * Thin create path — Temp Nova shape inside Nova (approach only; apps stay separate).
 *
 * Ask → sticky model craft → syntax → npm → honest Live.
 * App.jsx is the product: lock one target, finish truncations, strip TS — never floor paste.
 * Rich website / brand asks get invent-from-brief depth continues (still no floors).
 */
import { buildProductPlan } from '@/lib/createProductPlan';
import { formatCreateQualityRubricReasons } from '@/lib/createQualityRubric';
import { createIdentityFromBrief, detectHeroProductKind, svgHeroDataUrl } from '@/lib/createIdentity';
import {
  askMatchDeficits,
  buildAskContract,
  isCraftLeakCue,
  type AskContract,
} from '@/lib/createAskContract';
import { brandLogoSvgFor } from '@/lib/brandAssets';

/** Always on for create turns. Edit path unchanged. */
export const THIN_CREATE = true;

/** Thin create always targets plain JSX (no .tsx flip-flop). */
export const THIN_CREATE_APP_PATH = 'src/App.jsx';

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

export function makeThinDepthStreamGuards(hostShouldAbort?: () => boolean): {
  onDelta: (text: string) => void;
  shouldAbort: () => boolean;
} {
  const attemptStarted = Date.now();
  let sawStreamToken = false;
  return {
    onDelta(text: string) {
      if (String(text || '').trim().length >= 2) sawStreamToken = true;
    },
    shouldAbort() {
      if (hostShouldAbort?.()) return true;
      if (!sawStreamToken && Date.now() - attemptStarted > THIN_DEPTH_FIRST_TOKEN_MS) return true;
      return false;
    },
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
}): string[] {
  void opts.preferTs;
  const name = String(opts.productName || '').trim();
  const brief = String(opts.brief || '').trim().slice(0, 900);
  const jsxLock = thinCreateLocksAppJsx(brief, name);
  const app = jsxLock ? THIN_CREATE_APP_PATH : 'src/App.tsx or src/App.jsx';
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
  const planLines = [
    `## Thin product plan (REQUIRED shape hint — invent THIS ask)`,
    `- Family: **${plan.compositionFamily}** · Genre: ${plan.genre}`,
    `- Required regions: ${plan.requiredRegions.join(', ')}`,
    `- Required interactions: ${plan.requiredInteractions.join(', ') || 'none'}`,
    `- REQUIRED @@@FILE: ${mustHaveUnique.join(', ')}`,
    '- Checklist:',
    ...plan.checklist.slice(0, 6).map((c) => `  - ${c}`),
  ];
  return [
    'THIN CREATE — invent THIS ask. Output ONLY @@@FILE blocks. No preface.',
    `- Minimum: @@@FILE ${jsxLock ? THIN_CREATE_APP_PATH : 'src/App.tsx or src/App.jsx'} and @@@FILE src/App.css (complete, mountable React).`,
    jsxLock
      ? `- ALWAYS write ${THIN_CREATE_APP_PATH} — plain JavaScript JSX. NO TypeScript (no generics, no type annotations, no .tsx). Never emit src/App.tsx.`
      : `- Game/simulation: prefer src/App.tsx when using TypeScript; src/App.jsx is OK for plain JS. Do not flip extensions mid-reply.`,
    name ? `- Product name: ${name}` : '- Invent a fitting product name from the brief when none is given.',
    brief ? `- User brief (source of truth):\n${brief}` : '- Follow the user brief in the messages.',
    ...planLines,
    '- Build a unique working UI for THIS brief — never a tip/todo/notes/shop/apple.com preset or floor paste.',
    '- Do not copy apple.com bands, Pond\'s layouts, SoftPalm, or any canned brand template. Invent original structure and copy.',
    '- Finish every tag and brace. The file must end with a complete component + export default.',
    '- Do not invent COVER_HREFS / marketing heroes unless the brief asks for a marketing/brand site.',
    '- Do not wrap the page in a centered phone-column stub.',
    ...(rich ? formatCompositionalShellPrompt({ brief, productName: name }) : []),
    rich
      ? `- This ask needs a FULL page: at least ${THIN_DEPTH_MIN_SECTIONS} sections, real copy from the brief, substantial CSS, and depth-filled section files (~${THIN_COMPOSITIONAL_SECTION_TARGET_CHARS} compact chars each × ≤${THIN_COMPOSITIONAL_SECTION_MAX} files → composed ledger ≥ ${THIN_DEPTH_MIN_APP_CHARS}).`
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
  // Micro toys stay on the fast thin path.
  if (/\b(?:tip\s*calc|tipjar|todo(?:s)?|to-?do|checklist|counter|timer|stopwatch|pomodoro|click\s*count)\b/i.test(t)
    && !/\b(?:website|landing|homepage|marketing|brand|store|shop)\b/i.test(t)) {
    return false;
  }
  if (/\bcalculator\b/i.test(t) && !/\b(?:website|landing|marketing|brand)\b/i.test(t)) {
    return false;
  }
  return (
    /\b(?:website|web\s*site|landing|homepage|home\s*page|marketing|brand(?:ed)?|storefront|product\s+page)\b/i.test(t)
    || /\b(?:looks?\s+like|inspired\s+by|in\s+the\s+style\s+of)\b/i.test(t)
    || /\b(?:lotion|skincare|beauty|cosmetic|restaurant|cafe|café|portfolio|festival|boutique)\b/i.test(t)
    || /\b(?:matcha|tea\s+brand|coffee\s+brand|tin\s+hero|tasting\s+notes)\b/i.test(t)
    || /\b(?:ceramic|pottery|porcelain|stoneware|tableware|kiln|dinnerware|chocolate|cacao)\b/i.test(t)
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

/** Craft / shell prompt lines — App.jsx imports every section file; depth fills sections. */
export function formatCompositionalShellPrompt(opts: {
  brief: string;
  productName?: string;
}): string[] {
  if (!thinWantsCompositionalShell(opts.brief)) return [];
  const specs = formatCompositionalSectionSpecs(opts.brief, opts.productName);
  return [
    'COMPOSITIONAL SHELL (marketing/brand depth path):',
    `- Write @@@FILE ${THIN_CREATE_APP_PATH} as a thin shell only: import './App.css', import each section below, export default that renders <Component /> placeholders in order inside a root .app wrapper.`,
    '- Do NOT put full page copy in App.jsx — depth passes write one section file at a time.',
    `- Each section file should grow toward ~${THIN_COMPOSITIONAL_SECTION_TARGET_CHARS} compact chars (a full 40–70 line section).`,
    '- Section files may be omitted on first craft (Nova assembles the App shell); if you emit them, keep each minimal.',
    'Required section files (depth will fill these):',
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

export function compositionalSectionFileSubstantial(body: string): boolean {
  const raw = String(body || '');
  // 7B often ships `const X = () => …` without export default — still real work.
  if (!/export\s+default\b/i.test(raw) && !/^\s*(?:export\s+)?(?:default\s+)?function\s+\w+/m.test(raw)
    && !/^\s*(?:export\s+)?const\s+\w+\s*=/m.test(raw)) {
    return false;
  }
  return raw.replace(/\s+/g, '').length >= THIN_COMPOSITIONAL_SECTION_MIN_CHARS;
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
  // Prefer never-rejected targets; only fall back to a retired path when nothing else is open.
  return fresh[0] || thin[0];
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
export function buildCompositionalShellSource(
  present: readonly CompositionalSectionSpec[],
): string {
  return [
    "import './App.css';",
    ...present.map((s) => `import ${s.componentName} from './sections/${s.componentName}.jsx';`),
    '',
    'export default function App() {',
    '  return (',
    '    <div className="app">',
    ...present.map((s) => `      <${s.componentName} />`),
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

/** Spec targets plus any other substantial src/sections/*.jsx the model invented. */
export function listLandedCompositionalSections(
  files: Record<string, string>,
  brief: string,
  productName = '',
): CompositionalSectionSpec[] {
  const specs = formatCompositionalSectionSpecs(brief, productName);
  const present = specs.filter((s) => compositionalSectionFileSubstantial(String(files[s.filePath] || '')));
  const seen = new Set(present.map((s) => s.filePath.replace(/\\/g, '/')));
  for (const [k, v] of Object.entries(files)) {
    const norm = k.replace(/\\/g, '/');
    const m = norm.match(/^src\/sections\/([^/]+)\.jsx$/i);
    if (!m) continue;
    if (/^PageBodySection$/i.test(m[1])) continue;
    if (seen.has(norm)) continue;
    if (!compositionalSectionFileSubstantial(String(v || ''))) continue;
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
  const next = { ...files };
  const app = String(next['src/App.jsx'] || next['src/App.tsx'] || '');
  const present = listLandedCompositionalSections(next, brief, productName);

  if (!next[bodyKey] && app.trim() && !appLooksLikeCompositionalShell(app)) {
    const carved = app
      .replace(/^\s*import\s+['"]\.\/App\.css['"];?\s*$/m, '')
      .replace(/(export\s+default\s+)?function\s+App\s*\(/, 'export default function PageBodySection(')
      .replace(/^\s*export\s+default\s+App\s*;?\s*$/m, '');
    if (!/export\s+default\s+function\s+PageBodySection\s*\(/.test(carved)) return files;
    if (/export\s+default\s+App\b/.test(carved)) return files;
    next[bodyKey] = carved;
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
  const dropBody = Boolean(next[bodyKey]) && (
    thinDepthLedgerMeetsFloor(readThinDepthLedger(withoutBody))
    || thinMeetsLiveVisualFloor(withoutBody, brief)
    || richLanded >= 3
  );

  next['src/App.jsx'] = dropBody ? shellWithoutBody : shellWithBody;
  if (dropBody) delete next[bodyKey];
  delete next['src/App.tsx'];
  return next;
}

/** Kept name — call sites unchanged. Safe: no inject-into-return. */
export function applyCompositionalDepthMerge(
  files: Record<string, string>,
  brief: string,
  productName = '',
): Record<string, string> {
  return assembleCompositionalAppShell(files, brief, productName);
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

/** Live gate — blocks when visual floor is open or F&B genre art is still wrong. */
export function thinBlocksLivePreview(
  files: Record<string, string>,
  brief: string,
  productName = '',
): boolean {
  if (!thinBriefWantsDepth(brief)) return false;
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
  const misses = askMatchDeficits(files, brief, productName);
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
  }
  return misses;
}

function seedSectionSource(
  spec: CompositionalSectionSpec,
  brief: string,
  productName: string,
  contract?: AskContract,
): string {
  const ask = contract || buildAskContract(brief, productName);
  const name = ask.productName.replace(/[<>&'"`]/g, '').slice(0, 48) || 'Brand';
  const isNav = /nav|header/i.test(spec.componentName);
  const isHero = /hero/i.test(spec.componentName);
  const isFooter = /footer/i.test(spec.componentName);
  const isNotes = /notes/i.test(spec.componentName) || /note|tast/i.test(spec.slotLabel);
  const isShop = /catalog/i.test(spec.componentName) || /shop|catalog|collection/i.test(spec.slotLabel);
  const isSubscribe = /subscribe/i.test(spec.componentName) || /subscribe|newsletter/i.test(spec.slotLabel);
  const isSecondary = /secondary|cta/i.test(spec.componentName) && !isFooter;

  const navLinks = [
    '<a href="#story">Story</a>',
    ask.wantsNotes ? '<a href="#notes">Notes</a>' : '',
    ask.wantsShop ? '<a href="#shop">Shop</a>' : '',
    ask.wantsVisit ? '<a href="#visit">Visit</a>' : '',
  ].filter(Boolean).join('\n        ');

  if (isNav) {
    return `export default function ${spec.componentName}() {
  return (
    <header className="nav-header" role="banner">
      <a className="nav-brand" href="#top">
        <img className="nav-logo" src="/logo.svg" alt="${name}" width="40" height="40" />
        <span className="nav-wordmark">${name}</span>
      </a>
      <nav className="nav-links" aria-label="Primary">
        ${navLinks}
      </nav>
      <div className="nav-actions">
        ${ask.wantsShop ? '<a className="nav-cta" href="#shop">Shop now</a>' : '<a className="nav-cta" href="#story">Explore</a>'}
        ${ask.wantsSubscribe ? '<a className="btn-ghost" href="#subscribe">Subscribe</a>' : ''}
      </div>
    </header>
  );
}
`;
  }
  if (isHero) {
    const heroUrl = seedHeroDataUrl(name, brief);
    // Brand-first (OpenAI frontend-skill): product name is the loudest text; headline second.
    return `const HERO_VISUAL = ${JSON.stringify(heroUrl)};
export default function ${spec.componentName}() {
  return (
    <section className="hero" id="top">
      <p className="hero-brand">${name}</p>
      <h1 className="hero-title">${ask.headline}</h1>
      <p className="hero-lede">${ask.lede}</p>
      <div className="hero-actions">
        ${ask.wantsShop ? '<a className="btn-primary" href="#shop">Shop the collection</a>' : '<a className="btn-primary" href="#story">Read the story</a>'}
        <a className="btn-ghost" href="#story">Read the origin story</a>
      </div>
      <div className="hero-stage" aria-hidden="true">
        <img className="hero-art" src={HERO_VISUAL} alt="" />
      </div>
      <p className="hero-aside">${ask.genre === 'spirits' ? 'Small-batch spirits · tasting-led · coastal craft' : ask.genre === 'coffee' ? 'Farm origin · careful roast · honest cup' : /ceramic|kiln|tableware|pottery/i.test(brief) ? 'Kiln-fired · hand-trimmed · made for daily use' : 'Small-batch care · honest materials · finished on first glance'}</p>
    </section>
  );
}
`;
  }
  if (isNotes) {
    const items = ask.noteItems.map((n, i) => (
      `{ title: ${JSON.stringify(n.title)}, body: ${JSON.stringify(n.body)}, id: ${i} }`
    )).join(',\n  ');
    return `import { useState } from 'react';
const NOTES = [
  ${items}
];
export default function ${spec.componentName}() {
  const [open, setOpen] = useState(0);
  return (
    <section className="notes-band reveal" id="notes">
      <h2>${ask.genre === 'ceramic' ? 'Clay notes' : 'Tasting notes'}</h2>
      <p className="story-lede">${ask.genre === 'ceramic' ? `What you feel first with ${name} — open each note.` : `What you notice first with ${name} — open each note.`}</p>
      <div className="notes-list">
        {NOTES.map((n) => (
          <button
            key={n.id}
            type="button"
            className={open === n.id ? 'note-card is-open' : 'note-card'}
            onClick={() => setOpen(n.id)}
          >
            <strong>{n.title}</strong>
            {open === n.id ? <span>{n.body}</span> : <span className="note-hint">Open</span>}
          </button>
        ))}
      </div>
    </section>
  );
}
`;
  }
  if (isShop) {
    const items = ask.shopItems.map((p) => (
      `{ name: ${JSON.stringify(p.name)}, price: ${JSON.stringify(p.price)}, blurb: ${JSON.stringify(p.blurb)} }`
    )).join(',\n  ');
    // Interact v2 — bag persists across reloads (localStorage, no checkout).
    const bagKey = `nova.bag.${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'site'}`;
    return `import { useState } from 'react';
const ITEMS = [
  ${items}
];
const BAG_KEY = ${JSON.stringify(bagKey)};
function loadBag() {
  try { return JSON.parse(localStorage.getItem(BAG_KEY) || '[]'); } catch { return []; }
}
function saveBag(bag) {
  try { localStorage.setItem(BAG_KEY, JSON.stringify(bag)); } catch { /* storage unavailable */ }
}
export default function ${spec.componentName}() {
  const [picked, setPicked] = useState(0);
  const [bag, setBag] = useState(loadBag);
  const item = ITEMS[picked] || ITEMS[0];
  return (
    <section className="shop-band reveal" id="shop">
      <h2>Shop the collection</h2>
      <p className="story-lede">Pick a piece of ${name} — prices stay honest, no fake urgency.</p>
      <div className="shop-grid">
        {ITEMS.map((p, i) => (
          <button
            key={p.name}
            type="button"
            className={picked === i ? 'shop-card is-selected' : 'shop-card'}
            onClick={() => setPicked(i)}
          >
            <strong>{p.name}</strong>
            <span className="shop-price">{p.price}</span>
            <span>{p.blurb}</span>
          </button>
        ))}
      </div>
      <div className="shop-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={() => setBag((b) => { const next = [...b, item.name]; saveBag(next); return next; })}
        >
          Add to bag
        </button>
        <span className="shop-bag" aria-live="polite">
          {bag.length ? bag.length + ' in bag · ' + bag[bag.length - 1] : 'Bag is empty'}
        </span>
      </div>
    </section>
  );
}
`;
  }
  if (isSubscribe || isSecondary) {
    // Interact v2 — subscribe state survives reloads (localStorage, no backend).
    const subKey = `nova.subscribed.${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'site'}`;
    return `import { useState } from 'react';
const SUB_KEY = ${JSON.stringify(subKey)};
export default function ${spec.componentName}() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(() => { try { return localStorage.getItem(SUB_KEY) === '1'; } catch { return false; } });
  return (
    <section className="subscribe-band reveal" id="subscribe">
      <h2>Subscribe</h2>
      <p className="story-lede">A quiet rhythm from ${name} — no spam, just the drops that matter.</p>
      {done ? (
        <p className="subscribe-ok" role="status">You are on the list. Welcome.</p>
      ) : (
        <form
          className="subscribe-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) {
              setDone(true);
              try { localStorage.setItem(SUB_KEY, '1'); } catch { /* storage unavailable */ }
            }
          }}
        >
          <label className="sr-only" htmlFor="sub-email">Email</label>
          <input
            id="sub-email"
            type="email"
            required
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" className="btn-primary">Join</button>
        </form>
      )}
    </section>
  );
}
`;
  }
  if (isFooter) {
    return `export default function ${spec.componentName}() {
  return (
    <footer className="site-footer" id="visit">
      <div className="footer-cta">
        <h2>Ready when you are</h2>
        <p>${ask.lede}</p>
        <div className="footer-actions">
          ${ask.wantsShop ? '<a className="btn-primary" href="#shop">Shop</a>' : ''}
          ${ask.wantsSubscribe ? '<a className="btn-ghost" href="#subscribe">Subscribe</a>' : ''}
          ${ask.wantsNotes ? '<a className="btn-ghost" href="#notes">Tasting notes</a>' : ''}
        </div>
      </div>
      <div className="footer-columns">
        <div>
          <h3>Visit</h3>
          <p>Open days and the counter where ${name} started.</p>
        </div>
        <div>
          <h3>Care</h3>
          <p>${ask.genre === 'spirits' ? 'How to store and serve so every pour tastes like the still floor.' : ask.genre === 'coffee' ? 'How to store, brew, and keep every bag tasting like roast day.' : 'How to keep every batch tasting like the day it left the floor.'}</p>
        </div>
      </div>
      <p className="footer-legal">© {new Date().getFullYear()} ${name}. All rights reserved.</p>
    </footer>
  );
}
`;
  }
  const cards = ask.storyCards.map((c) => `        <article className="reveal">
          <h3>${c.title}</h3>
          <p>${c.body}</p>
        </article>`).join('\n');
  return `export default function ${spec.componentName}() {
  return (
    <section className="story-band" id="story">
      <h2>${ask.storyTitle}</h2>
      <p className="story-lede">${ask.lede}</p>
      <div className="story-grid">
${cards}
      </div>
      <a className="btn-primary" href="${ask.wantsShop ? '#shop' : '#subscribe'}">Continue</a>
    </section>
  );
}
`;
}

function seedHeroDataUrl(productName: string, brief: string): string {
  const name = String(productName || 'Brand').trim() || 'Brand';
  try {
    const ident = createIdentityFromBrief(name, brief);
    return svgHeroDataUrl(ident, name);
  } catch {
    return svgHeroDataUrl({ name }, name);
  }
}

function seedBrandCss(productName: string, brief = ''): string {
  const name = String(productName || 'Brand').slice(0, 32);
  let bg = '#0c1210';
  let elev = '#14201a';
  let ink = '#f3f6f1';
  let muted = 'rgba(243, 246, 241, 0.72)';
  let line = 'rgba(243, 246, 241, 0.14)';
  let accent = '#c4a574';
  let accentInk = '#1a140c';
  let glow = 'rgba(196, 165, 116, 0.18)';
  let glow2 = 'rgba(70, 120, 90, 0.16)';
  try {
    const p = createIdentityFromBrief(name, brief).palette;
    bg = p.bg;
    elev = p.panel;
    ink = p.text;
    muted = p.muted;
    line = p.line;
    accent = p.accent;
    accentInk = p.btnInk;
    glow = p.glow;
    glow2 = p.glow;
  } catch { /* keep defaults */ }
  return `
/* Nova visual seed — ${name} (Graphics v1 · genre art) */
:root {
  --bg: ${bg};
  --bg-elev: ${elev};
  --ink: ${ink};
  --muted: ${muted};
  --line: ${line};
  --accent: ${accent};
  --accent-ink: ${accentInk};
  --display: "Fraunces", "Iowan Old Style", Georgia, serif;
  --body: "Source Sans 3", "Segoe UI", sans-serif;
}
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;700&family=Source+Sans+3:wght@400;600&display=swap');
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: var(--body);
  color: var(--ink);
  background:
    radial-gradient(900px 500px at 12% -10%, ${glow}, transparent 55%),
    radial-gradient(700px 420px at 90% 0%, ${glow2}, transparent 50%),
    var(--bg);
}
.app { min-height: 100vh; }
.nav-header {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  padding: 1rem clamp(1rem, 4vw, 2.5rem);
  position: sticky; top: 0; z-index: 20;
  background: color-mix(in srgb, var(--bg) 82%, transparent);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--line);
}
.nav-brand { display: flex; align-items: center; gap: 0.65rem; color: inherit; text-decoration: none; }
.nav-logo { display: block; object-fit: contain; }
.nav-wordmark { font-family: var(--display); font-weight: 600; letter-spacing: 0.02em; }
.nav-links { display: flex; gap: 1.1rem; flex-wrap: wrap; }
.nav-links a, .nav-cta { color: var(--muted); text-decoration: none; font-weight: 600; }
.nav-cta, .btn-primary {
  background: var(--accent); color: var(--accent-ink); padding: 0.65rem 1.1rem;
  border-radius: 999px; text-decoration: none; font-weight: 600; display: inline-flex;
}
.btn-ghost {
  color: var(--ink); border: 1px solid var(--line); padding: 0.65rem 1.1rem;
  border-radius: 999px; text-decoration: none; font-weight: 600; display: inline-flex;
}
.hero {
  padding: clamp(3rem, 10vw, 7rem) clamp(1rem, 4vw, 2.5rem) clamp(2.5rem, 6vw, 4rem);
  max-width: 1100px;
}
.hero-eyebrow { text-transform: uppercase; letter-spacing: 0.14em; font-size: 0.75rem; color: var(--accent); }
/* Brand-first: wordmark is the poster title; headline is secondary. */
.hero-brand {
  font-family: var(--display); font-size: clamp(2.4rem, 6.5vw, 4.2rem);
  font-weight: 700; letter-spacing: -0.03em; line-height: 1.05; margin: 0 0 0.55rem;
}
.hero-title {
  font-family: var(--display); font-size: clamp(1.45rem, 3.2vw, 2.15rem);
  font-weight: 500; line-height: 1.2; margin: 0 0 0.85rem; max-width: 18ch;
}
.hero-lede { max-width: 38rem; color: var(--muted); font-size: 1.1rem; }
.hero-actions, .nav-actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1.5rem; align-items: center; }
.nav-actions { margin-top: 0; }
.hero-stage {
  margin-top: 2.5rem; min-height: min(48vh, 420px); border-radius: 1.25rem;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent) 35%, transparent), transparent 45%),
    linear-gradient(20deg, var(--bg-elev), color-mix(in srgb, var(--bg) 70%, #000));
  border: 1px solid var(--line);
  overflow: hidden;
  position: relative;
}
.hero-stage-inner { display: none; }
.hero-art {
  display: block; width: 100%; height: 100%; min-height: inherit;
  object-fit: cover; object-position: center 40%;
}
.hero-aside { margin-top: 1.25rem; color: var(--muted); font-size: 0.95rem; letter-spacing: 0.01em; }
.story-band { padding: clamp(2.5rem, 6vw, 4.5rem) clamp(1rem, 4vw, 2.5rem); max-width: 1100px; }
.story-band h2 { font-family: var(--display); font-size: clamp(1.8rem, 4vw, 2.8rem); margin: 0 0 0.75rem; }
.story-lede { color: var(--muted); max-width: 42rem; }
.story-grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin: 1.5rem 0; }
.story-grid article {
  padding: 1.1rem; border: 1px solid var(--line); border-radius: 1rem; background: rgba(255,255,255,0.02);
}
.site-footer { padding: clamp(2.5rem, 6vw, 4rem) clamp(1rem, 4vw, 2.5rem) 2rem; border-top: 1px solid var(--line); }
.footer-cta h2 { font-family: var(--display); font-size: clamp(1.6rem, 3.5vw, 2.4rem); }
.footer-actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin: 1rem 0 2rem; }
.footer-columns { display: grid; gap: 1.25rem; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom: 1.5rem; }
.footer-legal { color: var(--muted); font-size: 0.85rem; }
/* Motion v1 — intentional, not spam */
@keyframes ember-rise {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes stage-in {
  from { opacity: 0.4; transform: scale(0.985); }
  to { opacity: 1; transform: scale(1); }
}
.hero-title { animation: ember-rise 0.9s ease-out both; }
.hero-lede { animation: ember-rise 1s ease-out 0.08s both; }
.hero-stage { animation: stage-in 1.05s ease-out 0.12s both; }
.btn-primary, .nav-cta {
  transition: transform 0.18s ease, filter 0.18s ease;
}
.btn-primary:hover, .nav-cta:hover { transform: translateY(-2px); filter: brightness(1.06); }
.btn-ghost { transition: border-color 0.18s ease, color 0.18s ease; }
.btn-ghost:hover { border-color: var(--accent); color: var(--ink); }
.reveal { animation: ember-rise 0.85s ease-out both; }
.notes-band, .shop-band, .subscribe-band {
  padding: clamp(2.5rem, 6vw, 4.5rem) clamp(1rem, 4vw, 2.5rem); max-width: 1100px;
}
.notes-band h2, .shop-band h2, .subscribe-band h2 {
  font-family: var(--display); font-size: clamp(1.8rem, 4vw, 2.8rem); margin: 0 0 0.75rem;
}
.notes-list, .shop-grid { display: grid; gap: 0.85rem; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); margin: 1.25rem 0; }
.note-card, .shop-card {
  text-align: left; cursor: pointer; color: inherit;
  padding: 1.1rem; border: 1px solid var(--line); border-radius: 1rem;
  background: rgba(255,255,255,0.03); display: flex; flex-direction: column; gap: 0.45rem;
  transition: border-color 0.18s ease, transform 0.18s ease;
}
.note-card:hover, .shop-card:hover, .note-card.is-open, .shop-card.is-selected {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--line));
  transform: translateY(-2px);
}
.note-hint, .shop-price { color: var(--accent); font-weight: 600; }
.shop-actions, .subscribe-form { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; }
.subscribe-form input {
  flex: 1 1 220px; min-height: 2.75rem; padding: 0.65rem 0.9rem;
  border-radius: 999px; border: 1px solid var(--line);
  background: rgba(0,0,0,0.25); color: var(--ink);
}
.subscribe-ok { color: var(--accent); font-weight: 600; }
.shop-bag { color: var(--muted); }
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0,0,0,0); border: 0;
}
@media (max-width: 720px) {
  .nav-links { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .hero-title, .hero-lede, .hero-stage, .reveal { animation: none; }
  .btn-primary, .nav-cta, .btn-ghost, .note-card, .shop-card { transition: none; }
}
`;
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
  return false;
}

/**
 * Upgrade empty hero-stage-inner → brand product SVG art (Nova-owned, model-agnostic).
 */
function ensureHeroStageGraphic(
  files: Record<string, string>,
  brief: string,
  productName: string,
): Record<string, string> {
  const next = { ...files };
  const heroKey = Object.keys(next).find((k) => /src\/sections\/.*Hero.*\.jsx$/i.test(k.replace(/\\/g, '/')))
    || Object.keys(next).find((k) => {
      const body = String(next[k] || '');
      return /src\/sections\//i.test(k) && /className=["'][^"']*\bhero\b/i.test(body);
    });
  if (!heroKey) return next;
  let body = String(next[heroKey] || '');
  if (!body.trim() || heroSectionHasProductArt(body)) return next;
  const dataUrl = seedHeroDataUrl(productName, brief);
  if (!dataUrl) return next;
  const decl = `const HERO_VISUAL = ${JSON.stringify(dataUrl)};\n`;
  if (!/\bHERO_VISUAL\b/.test(body)) {
    body = /^export\s+default/m.test(body)
      ? body.replace(/^(export\s+default)/m, `${decl}$1`)
      : `${decl}${body}`;
  }
  const artImg = `<img className="hero-art" src={HERO_VISUAL} alt="" aria-hidden="true" />`;
  if (/<div className="hero-stage-inner"\s*\/>/i.test(body)) {
    body = body.replace(/<div className="hero-stage-inner"\s*\/>/i, artImg);
  } else if (/<div className="hero-stage"[^>]*>\s*<div className="hero-stage-inner"[^>]*>\s*<\/div>\s*<\/div>/i.test(body)) {
    body = body.replace(
      /<div className="hero-stage"[^>]*>\s*<div className="hero-stage-inner"[^>]*>\s*<\/div>\s*<\/div>/i,
      `<div className="hero-stage" aria-hidden="true">${artImg}</div>`,
    );
  } else if (/className=["'][^"']*\bhero-stage\b[^"']*["'][^>]*>/i.test(body)
    && !/hero-art|HERO_VISUAL|<svg\b/i.test(body)) {
    body = body.replace(
      /(className=["'][^"']*\bhero-stage\b[^"']*["'][^>]*>)/i,
      `$1\n        ${artImg}`,
    );
  } else if (/className=["'][^"']*\bhero\b[^"']*["'][^>]*>/i.test(body)) {
    body = body.replace(
      /(className=["'][^"']*\bhero\b[^"']*["'][^>]*>)/i,
      `$1\n      <div className="hero-stage" aria-hidden="true">${artImg}</div>`,
    );
  }
  next[heroKey] = body;
  return next;
}

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

function ensureHeroArtCss(css: string): string {
  const c = String(css || '');
  if (/\.hero-art\b/.test(c) && /\.hero-stage\b/.test(c)) return ensureMotionCss(c);
  return ensureMotionCss(`${c.trimEnd()}

/* Nova Graphics v1 — product stage */
.hero-stage {
  margin-top: 2.5rem; min-height: min(48vh, 420px); border-radius: 1.25rem;
  border: 1px solid var(--line, rgba(255,255,255,0.14));
  overflow: hidden; position: relative;
}
.hero-art {
  display: block; width: 100%; height: 100%; min-height: inherit;
  object-fit: cover; object-position: center 40%;
}
`);
}

/**
 * Nova-owned visual seed — fills thin compositional sections + CSS so Live can
 * unlock without waiting for 7B to invent 9000 compact chars.
 * Graphics v1: genre product SVG in the hero stage + brief palette (model-agnostic).
 */
export function seedCompositionalBrandVisuals(
  files: Record<string, string>,
  brief: string,
  productName = '',
): Record<string, string> {
  if (!thinWantsCompositionalShell(brief)) return files;
  const name = String(productName || '').trim() || 'Brand';
  const ask = buildAskContract(brief, name);
  let next: Record<string, string> = { ...files };
  const specs = formatCompositionalSectionSpecs(brief, name);
  const heroKind = detectHeroProductKind(name, brief);
  const forceGenreHero = heroKind === 'bottle' || heroKind === 'coffee' || heroKind === 'tea'
    || heroKind === 'lotion' || heroKind === 'chocolate' || heroKind === 'ceramic';
  for (const spec of specs) {
    const cur = String(next[spec.filePath] || '');
    const compact = cur.replace(/\s+/g, '').length;
    const wrongGenre = ask.forbidCoffeeCopy && /\bcoffee brand\b|careful roasting|whole bean/i.test(cur);
    const isHero = /hero/i.test(spec.componentName);
    const interactive = /Notes|Catalog|Subscribe/i.test(spec.componentName);
    // F&B briefs: always overwrite hero with Nova genre SVG (bottle/bag/tin).
    // 7B invent pastes Apple phone stages that otherwise stick forever.
    if (isHero && (forceGenreHero
      || !heroSectionHasProductArt(cur)
      || heroSectionWrongGenreArt(cur, brief, name))) {
      next[spec.filePath] = seedSectionSource(spec, brief, name, ask);
      continue;
    }
    // Ask contract: notes/shop/subscribe must be interactive stubs, not empty story clones.
    if (interactive && (!/useState/.test(cur) || wrongGenre)) {
      next[spec.filePath] = seedSectionSource(spec, brief, name, ask);
      continue;
    }
    if (compositionalSectionFileSubstantial(cur) && compact >= 700 && !wrongGenre) continue;
    next[spec.filePath] = seedSectionSource(spec, brief, name, ask);
  }
  // Seed owns the page — drop stub PageBody / fat App carve so Live mounts the shell.
  const bodyKey = `${COMPOSITIONAL_SECTION_DIR}/PageBodySection.jsx`;
  delete next[bodyKey];
  const present = listLandedCompositionalSections(next, brief, name);
  next['src/App.jsx'] = buildCompositionalShellSource(
    present.length ? present : specs.slice(0, Math.max(3, specs.length)),
  );
  delete next['src/App.tsx'];
  const css = String(next['src/App.css'] || '');
  if (css.replace(/\s+/g, '').length < THIN_LIVE_VISUAL_MIN_CSS) {
    next['src/App.css'] = `${css.trimEnd()}\n${seedBrandCss(name, brief)}`;
  } else {
    next['src/App.css'] = ensureHeroArtCss(css);
  }
  next = ensureHeroStageGraphic(next, brief, name);
  let app = String(next['src/App.jsx'] || '');
  const proseCut = app.search(/\n(?:#{1,6}\s*)?(?:How to fix|###\s|Verification:|Ensure that the path|To (?:link|verify))/i);
  if (proseCut >= 0) {
    app = `${app.slice(0, proseCut).trimEnd()}\n`;
    next['src/App.jsx'] = app;
  }
  const sectionBlob = compositionalSectionBodies(next);
  if (!/\/logo\.svg/i.test(app) && !/\/logo\.svg/i.test(sectionBlob)) {
    const navSpec = specs.find((s) => /NavHeader/i.test(s.componentName));
    if (navSpec) {
      next[navSpec.filePath] = seedSectionSource(navSpec, brief, name, ask);
      next['src/App.jsx'] = buildCompositionalShellSource(
        listLandedCompositionalSections(next, brief, name),
      );
    }
  }
  // Genre mark in the files map — wireCreatePublicAssets may miss; seed owns the guarantee.
  // Always overwrite on F&B (forceGenreHero) and whenever the mark is still sparkles.
  const mark = brandLogoSvgFor({
    productName: name,
    brief,
    css: String(next['src/App.css'] || ''),
  });
  if (mark) {
    const prev = String(next['public/logo.svg'] || '');
    const prevSparkles = /M9\.937 15\.5/i.test(prev);
    const markSparkles = /M9\.937 15\.5/i.test(mark);
    if (!prev.trim() || prevSparkles || forceGenreHero || (markSparkles === false && prevSparkles)) {
      next['public/logo.svg'] = mark;
    }
  }
  // Invent often strips Google Fonts / display stacks — reassert frontend-skill typography.
  {
    let css = String(next['src/App.css'] || '');
    if (css.trim() && !/fonts\.googleapis\.com.*Fraunces/i.test(css)) {
      css = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;700&family=Source+Sans+3:wght@400;600&display=swap');\n${css}`;
    }
    if (css.trim() && !/--display\s*:/i.test(css)) {
      css = `${css.trimEnd()}\n:root { --display: "Fraunces", "Iowan Old Style", Georgia, serif; --body: "Source Sans 3", "Segoe UI", sans-serif; }\n.hero-brand, .hero-title, .nav-wordmark, h1, h2 { font-family: var(--display); }\nbody { font-family: var(--body); }\n`;
    } else if (css.trim() && !/font-family:\s*var\(--display\)/i.test(css)) {
      css = `${css.trimEnd()}\n.hero-brand, .hero-title, .nav-wordmark, h1, h2 { font-family: var(--display), Georgia, serif; }\n`;
    }
    next['src/App.css'] = css;
  }
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
 * Only genre + visual floor matter here (not every soft ask-copy cue).
 */
export function thinGenreSeedClearsLive(
  files: Record<string, string>,
  brief: string,
  productName = '',
): boolean {
  if (!thinBriefWantsDepth(brief) || !thinWantsCompositionalShell(brief)) return false;
  if (!thinMeetsLiveVisualFloor(files, brief)) return false;
  const name = String(productName || '').trim() || buildAskContract(brief).productName;
  const genreMiss = thinAskMatchDeficits(files, brief, name)
    .filter((r) => /wrong genre|sparkles|hero art/i.test(r));
  return genreMiss.length === 0;
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
  // Token "section" only — not section-title / section-button.
  const classSections = (raw.match(/\bclass(?:Name)?=["'][^"']*(?:^|[\s])section(?:[\s"']|$)/gi) || []).length;
  const roleRegions = (raw.match(/\brole=["'](?:region|contentinfo|banner)["']/gi) || []).length;
  return Math.max(tags, classSections + (/\bfooter\b/i.test(raw) ? 1 : 0), tags + roleRegions);
}

/** Absolute step — kept for diagnostics; acceptance is ledger-gain (not prior+step). */
export const THIN_DEPTH_ABS_STEP_CHARS = Math.max(
  700,
  Math.ceil(THIN_DEPTH_MIN_APP_CHARS / THIN_DEPTH_CONTINUE_MAX),
);

/** Bail depth when this many consecutive passes produce zero ledger gain.
 * 2 was lethal on 7B (one empty + one thin → exit in ~20s). Give invent room. */
export const THIN_DEPTH_ZERO_GAIN_BAIL = 5;

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
export function readThinDepthLedger(files: Record<string, string>): ThinDepthLedger {
  const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
  const css = String(files['src/App.css'] || '');
  const sectionBlob = compositionalSectionBodies(files);
  const composed = sectionBlob ? `${app}\n${sectionBlob}` : app;
  return {
    compact: composed.replace(/\s+/g, '').length,
    lines: (app ? app.split(/\r?\n/).length : 0)
      + (sectionBlob ? sectionBlob.split(/\r?\n/).length : 0),
    landmarks: countThinLandmarks(composed),
    cssCompact: css.replace(/\s+/g, '').length,
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
  return thinDepthLedgerGain(prior, next, opts);
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
  opts?: { allowLandmarkShellDrop?: boolean },
): boolean {
  if (thinDepthLedgerMeetsFloor(next)) return true;
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
