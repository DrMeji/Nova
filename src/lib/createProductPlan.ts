/**
 * Universal ProductPlan — any create ask gets a structural plan before craft.
 * Generalizes the storefront plan/repair pattern to every composition family.
 */
import { briefLooksLikeStorefront, inferBuildGenre, type BuildGenre } from '@/lib/createLayoutContract';
import type { CompositionFamily } from '@/lib/createDesignSystem';
import { repairStorefrontToContract } from '@/lib/createStorefrontRepair';

/** Sub-kind for tool-panel — tip and todo must not share one tip-math starter. */
export type ToolPanelKind = 'tip' | 'todo' | 'generic';

/** Sub-kind for app-chrome — notes and habit must not share one generic board. */
export type AppChromeKind = 'notes' | 'habit' | 'generic';

export type ProductPlan = {
  productName: string;
  genre: BuildGenre;
  compositionFamily: CompositionFamily;
  /** Set when family is tool-panel. */
  toolKind?: ToolPanelKind | null;
  /** Set when family is app-chrome. */
  appKind?: AppChromeKind | null;
  views: string[];
  requiredRegions: string[];
  requiredInteractions: string[];
  dataObjects: string[];
  mustHaveFiles: string[];
  allowComponents: boolean;
  checklist: string[];
};

type FamilyContract = Omit<ProductPlan, 'productName' | 'genre' | 'compositionFamily' | 'toolKind' | 'appKind'>;

const FAMILY_CONTRACTS: Record<CompositionFamily, FamilyContract> = {
  'marketing-bands': {
    views: ['landing'],
    requiredRegions: ['nav', 'hero', 'band', 'footer'],
    requiredInteractions: ['primary-cta'],
    dataObjects: [],
    mustHaveFiles: ['src/App.tsx', 'src/App.css'],
    allowComponents: false,
    checklist: [
      'Sticky full-width nav with brand',
      'Full-bleed hero with headline + supporting line + CTA',
      '2–4 edge-to-edge story/feature bands',
      'Footer; intentional type + atmosphere — welcoming starting marketing page',
    ],
  },
  'catalog-store': {
    views: ['browse', 'cart', 'checkout'],
    requiredRegions: ['nav', 'hero', 'filters', 'product-grid', 'cart', 'footer'],
    requiredInteractions: ['filter', 'add-to-cart', 'qty-stepper', 'purchase'],
    dataObjects: ['products'],
    mustHaveFiles: ['src/App.tsx', 'src/App.css', 'src/data/products.ts'],
    allowComponents: true,
    checklist: [
      'Sticky nav + cart badge; catalog ≥8 products',
      'Filters + qty cart + purchase; professional retail hierarchy',
    ],
  },
  'app-chrome': {
    views: ['main', 'empty'],
    requiredRegions: ['shell', 'nav-or-sidebar', 'main', 'primary-action'],
    requiredInteractions: ['create-or-add', 'select-or-open', 'empty-state'],
    dataObjects: ['items'],
    mustHaveFiles: ['src/App.tsx', 'src/App.css'],
    allowComponents: true,
    checklist: [
      'App shell with nav/sidebar + main workspace',
      'Primary action visible; sample items OR real empty state',
      'Looks like a usable starting app — not a marketing landing',
    ],
  },
  'tool-panel': {
    views: ['tool'],
    requiredRegions: ['chrome', 'inputs', 'result'],
    requiredInteractions: ['primary-compute', 'editable-inputs'],
    dataObjects: [],
    mustHaveFiles: ['src/App.tsx', 'src/App.css'],
    allowComponents: false,
    checklist: [
      'Clear tool chrome; editable inputs; primary compute control',
      'Result area that updates — complete and usable',
      'NOT a marketing hero / Learn more landing / COVER photo page',
    ],
  },
  'game-stage': {
    views: ['play'],
    requiredRegions: ['hud', 'stage', 'controls'],
    requiredInteractions: ['start-or-restart', 'play-controls', 'score-or-status'],
    dataObjects: [],
    mustHaveFiles: ['src/App.tsx', 'src/App.css'],
    allowComponents: true,
    checklist: [
      'Game stage + HUD score/status + start/restart',
      'Feels like a playable starting game, not a static poster',
    ],
  },
};

/** Job-shape family — apps/tools/games win over silent marketing default. */
/** True when the brief asks for marketing/landing — ignores “not a marketing landing page” negations. */
function briefWantsMarketingFamily(text: string): boolean {
  const scrubbed = String(text || '')
    .replace(
      /\b(?:not|never|no|without|don'?t|isn'?t|avoid|skip)\s+(?:a\s+|an\s+)?(?:marketing(?:\s+(?:page|site|landing(?:\s+page)?))?|landing(?:\s+page)?|homepage|saas\s+marketing)(?:\s+page)?\b/gi,
      ' ',
    )
    .replace(/\b(?:instead\s+of|rather\s+than)\s+(?:a\s+|an\s+)?(?:marketing|landing(?:\s+page)?)\b/gi, ' ');
  return /\b(?:landing\s+page|marketing\s+(?:page|site)|product\s+homepage|saas\s+marketing|full[- ]?bleed\s+hero)\b/i.test(scrubbed)
    || /\b(?:landing|marketing\s+site|product\s+band|full[- ]?bleed)\b/i.test(scrubbed)
    || (/\b(?:website|homepage)\b/i.test(scrubbed) && /\b(?:brand|marketing|hero|product\s+page)\b/i.test(scrubbed));
}

/** Tip vs todo vs generic tool — drives craft contract + score (not a separate CompositionFamily). */
export function inferToolPanelKind(brief: string, productName = ''): ToolPanelKind {
  const head = String(brief || '').split(/\n## |\nLAYOUT CONTRACT|\nNOVA DESIGN SPINE/i)[0] || '';
  const t = `${head}\n${productName}`;
  if (/\b(?:tip[- ]?(?:calc|calculator|wise|jar)?|split\s+the\s+bill|gratuity|bill\s+amount)\b/i.test(t)
    || /\bTipjar\b|\bTipWise\b/i.test(t)) {
    return 'tip';
  }
  if (/\b(?:todo|to-?do|task\s*list|checklist|tasknest)\b/i.test(t)
    && !/\btip\b/i.test(t)) {
    return 'todo';
  }
  return 'generic';
}

/** Notes vs habit vs generic app — drives craft contract + score. */
export function inferAppChromeKind(brief: string, productName = ''): AppChromeKind {
  const head = String(brief || '').split(/\n## |\nLAYOUT CONTRACT|\nNOVA DESIGN SPINE/i)[0] || '';
  const t = `${head}\n${productName}`;
  if (/\b(?:habit\s+tracker|habit\s+app|daily\s+habit|streak\s+tracker|habit\s+streak)\b/i.test(t)
    || /\b(?:build|create|make)\b[\s\S]{0,40}\bhabit\b/i.test(t)) {
    return 'habit';
  }
  if (
    /\b(?:notes?\s+app|note\s+list|note\s+taking|notebook\s+app|daily\s+journal|journal\s+app|LeafNote)\b/i.test(t)
    || (/\b(?:notes?|journal)\b/i.test(t) && /\b(?:app|application|workspace|sidebar)\b/i.test(t))
  ) {
    return 'notes';
  }
  return 'generic';
}

/** Job-shape family first — apps/tools/games win over silent marketing default. */
export function inferCreateCompositionFamily(brief: string, productName = ''): CompositionFamily {
  const head = String(brief || '').split(/\n## |\nLAYOUT CONTRACT|\nNOVA DESIGN SPINE/i)[0] || '';
  const t = `${head}\n${productName}`;
  const explicitMarketing = briefWantsMarketingFamily(t);

  if (/\b(?:arcade|canvas\s+game|playable|pong|snake|pac-?man|fps|shooter|dino|game\s+loop|mini\s*game)\b/i.test(t)
    && !explicitMarketing) {
    return 'game-stage';
  }
  if (briefLooksLikeStorefront(brief, productName)) return 'catalog-store';
  // Tip / todo / calculator tools — include Tipjar-style names and “tiny tip calculator”.
  if (
    (/\b(?:calculator|converter|tip[- ]?(?:calc|calculator|wise|jar)?|todo|to-?do|task\s*list|checklist|counter|timer|utility|tool\s+ui|split\s+the\s+bill|reminders?|pomodoro|unit\s+convert|gratuity|bill\s+amount)\b/i.test(t)
      || /\bTipjar\b|\bTipWise\b|\bTaskNest\b/i.test(t))
    && !explicitMarketing
    && !/\b(?:habit\s+tracker|habit\s+app|journal\s+app|notes?\s+app|dashboard)\b/i.test(t)
  ) {
    return 'tool-panel';
  }
  // Explicit marketing/landing asks win over “notes app” nouns inside the brief
  // (“SaaS marketing page for a notes app” → marketing-bands, not app-chrome).
  if (explicitMarketing) {
    return 'marketing-bands';
  }
  // App/job signals — negations already scrubbed by briefWantsMarketingFamily.
  if (
    /\b(?:dashboard|sidebar|admin\s+panel|app\s+chrome|settings\s+page|notes?\s+app|note\s+list|habit\s+tracker|habit\s+app|daily\s+journal|journal\s+app|kanban|inbox|workspace|todo\s+app|task\s+app|reminder\s+app|chatgpt|chat\s*gpt|ai\s+chat|chat\s+app|chat\s+(?:website|site|ui)|messenger|conversation\s+(?:app|ui)|message\s+composer)\b/i.test(t)
    || /\b(?:build|create|make)\b[\s\S]{0,40}\b(?:app|application|dashboard|notes?|habit|tracker|workspace|todo|journal)\b/i.test(t)
    || /\b(?:electron|desktop\s+app)\b/i.test(t)
    || /\b(?:web\s*app|application)\b/i.test(t)
  ) {
    return 'app-chrome';
  }
  return 'app-chrome';
}

export function buildProductPlan(brief: string, productName = ''): ProductPlan {
  const name = String(productName || '').trim() || 'Product';
  const { genre } = inferBuildGenre(brief, name);
  const compositionFamily = inferCreateCompositionFamily(brief, name);
  const contract = FAMILY_CONTRACTS[compositionFamily];
  const views = [...contract.views];
  if (compositionFamily === 'catalog-store' && /\b(?:origin|age|notes|browse|explore|detail)\b/i.test(brief)) {
    if (!views.includes('detail')) views.splice(1, 0, 'detail');
  }
  const toolKind = compositionFamily === 'tool-panel' ? inferToolPanelKind(brief, name) : null;
  const appKind = compositionFamily === 'app-chrome' ? inferAppChromeKind(brief, name) : null;
  // Checklist stays family-level + brief — not a tip/todo/notes recipe menu.
  const checklist = [
    ...contract.checklist,
    'Implement exactly what the user brief asks for — invent the UI; do not swap in a preset genre shell',
  ];
  return {
    productName: name,
    genre,
    compositionFamily,
    toolKind,
    appKind,
    views,
    requiredRegions: [...contract.requiredRegions],
    requiredInteractions: [...contract.requiredInteractions],
    dataObjects: [...contract.dataObjects],
    mustHaveFiles: [...contract.mustHaveFiles],
    allowComponents: contract.allowComponents,
    checklist,
  };
}

export function formatProductPlanBlock(plan: ProductPlan): string {
  return [
    '## Product plan (REQUIRED — invent THIS ask; shape hint is not a template)',
    `Shape hint: ${plan.compositionFamily} · Genre: ${plan.genre}${
      plan.toolKind && plan.toolKind !== 'generic' ? ` · hint: ${plan.toolKind}` : ''
    }${
      plan.appKind && plan.appKind !== 'generic' ? ` · hint: ${plan.appKind}` : ''
    }`,
    `Views: ${plan.views.join(' → ')}`,
    `Required regions: ${plan.requiredRegions.join(', ')}`,
    `Required interactions: ${plan.requiredInteractions.join(', ')}`,
    plan.dataObjects.length ? `Data objects: ${plan.dataObjects.join(', ')}` : '',
    `REQUIRED @@@FILE: ${plan.mustHaveFiles.join(', ')}`,
    plan.allowComponents
      ? 'Also allowed: src/components/*.tsx and small src/data/* modules when they keep the UI clear.'
      : 'Prefer a clean App + CSS unless components clearly help.',
    'Checklist:',
    ...plan.checklist.map((c) => `  - ${c}`),
    'Do not finish until the starting product feels complete, welcoming, and professional for this product type.',
  ].filter(Boolean).join('\n');
}

function appBlob(files: Record<string, string>): string {
  return `${files['src/App.tsx'] || files['src/App.jsx'] || ''}\n${files['src/App.css'] || ''}\n${
    Object.entries(files)
      .filter(([k]) => /src\/(?:data|components)\//i.test(k))
      .map(([, v]) => v)
      .join('\n')
  }`;
}

export function scorePlanContract(
  files: Record<string, string>,
  plan: ProductPlan,
): { ok: boolean; score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 100;
  const app = files['src/App.tsx'] || files['src/App.jsx'] || '';
  const css = files['src/App.css'] || '';
  const blob = appBlob(files);
  const compact = app.replace(/\s+/g, '').length;

  if (compact < 500) {
    reasons.push('starting App too thin for a professional first version');
    score -= 30;
  }
  if (css.replace(/\s+/g, '').length < 300) {
    reasons.push('CSS too thin — missing intentional design depth');
    score -= 15;
  }

  for (const path of plan.mustHaveFiles) {
    if (path.includes('App.tsx')) {
      if (!files['src/App.tsx'] && !files['src/App.jsx']) {
        reasons.push(`missing required ${path}`);
        score -= 20;
      }
    } else if (!files[path]) {
      reasons.push(`missing required ${path}`);
      score -= 20;
    }
  }

  const family = plan.compositionFamily;
  if (family === 'marketing-bands') {
    if (!/<(?:nav|header)\b/i.test(app)) { reasons.push('marketing: missing nav'); score -= 15; }
    if (!/className=["'][^"']*\bhero\b|<(?:section)[^>]*hero/i.test(app)) {
      reasons.push('marketing: missing hero');
      score -= 15;
    }
    if ((app.match(/<(?:section|main)\b/gi) || []).length < 2) {
      reasons.push('marketing: need multiple content sections');
      score -= 15;
    }
    if (!/<footer\b|className=["'][^"']*\bfoot/i.test(app)) {
      reasons.push('marketing: missing footer');
      score -= 10;
    }
  } else if (family === 'catalog-store') {
    if (!/product-grid|product-card|Add to cart/i.test(blob)) {
      reasons.push('storefront: missing catalog/cart starting shape');
      score -= 25;
    }
    if (!files['src/data/products.ts']) {
      reasons.push('storefront: missing src/data/products.ts');
      score -= 20;
    }
  } else if (family === 'app-chrome') {
    if (!/sidebar|nav|app-shell|workspace|main/i.test(blob)) {
      reasons.push('app: missing shell / nav / main workspace');
      score -= 20;
    }
    if (!/<button\b|onClick|type=["']submit["']/i.test(app)) {
      reasons.push('app: missing primary interactive control');
      score -= 15;
    }
    // Hard anti-wrong-family: marketing theater fails notes/habit/apps.
    const marketingBleed = /COVER_HREFS|hero-photo|hero full-bleed|full-bleed/i.test(app)
      || (/Learn more|Get started/i.test(app) && /className=["'][^"']*\bhero\b/i.test(app)
        && (app.match(/<(?:section|header)\b[^>]*hero/gi) || []).length >= 1)
      || ((app.match(/className=["'][^"']*\bhero\b/gi) || []).length >= 2);
    if (marketingBleed) {
      reasons.push('app: marketing hero / COVER shell forbidden (fake-marketing-hero)');
      score -= 40;
    }
    // Brief owns notes/habit specifics — score only wrong-family marketing bleed above.
  } else if (family === 'tool-panel') {
    if (!/<input\b|<select\b|<textarea\b/i.test(app)) {
      reasons.push('tool: missing editable inputs');
      score -= 20;
    }
    if (!/<button\b|onClick|useState/i.test(app)) {
      reasons.push('tool: missing primary compute / state');
      score -= 15;
    }
    // Hard anti-wrong-family: marketing hero theater must fail tip/todo tools.
    const marketingBleed = /COVER_HREFS|hero-photo|hero full-bleed|full-bleed/i.test(app)
      || (/Learn more|Start calculating/i.test(app) && /className=["'][^"']*\bhero\b/i.test(app))
      || ((app.match(/className=["'][^"']*\bhero\b/gi) || []).length >= 2);
    if (marketingBleed) {
      reasons.push('tool: marketing hero / COVER / CTA shell forbidden (fake-marketing-hero)');
      score -= 45;
    }
    // Brief owns tip/todo specifics — score only wrong-family marketing bleed above.
  } else if (family === 'game-stage') {
    if (!/<canvas\b|game-stage|playfield|requestAnimationFrame|useEffect/i.test(blob)) {
      reasons.push('game: missing stage / play loop hook');
      score -= 20;
    }
    if (!/score|lives|level|status|hud/i.test(blob)) {
      reasons.push('game: missing HUD / score status');
      score -= 12;
    }
    if (!/start|restart|play|pause/i.test(blob)) {
      reasons.push('game: missing start/restart controls');
      score -= 12;
    }
  }

  if (
    /\.(?:app|site)\b[\s\S]{0,320}\bjustify-content\s*:\s*center\b/i.test(css)
    && /\.(?:app|site)\b[\s\S]{0,320}\balign-items\s*:\s*center\b/i.test(css)
    && family !== 'tool-panel'
  ) {
    reasons.push('phone-column stub — not a professional starting layout');
    score -= 20;
  }
  if (/\blorem\s+ipsum\b|\bSample\b|\bBand-\d+\b|via\.placeholder\.com/i.test(blob)) {
    reasons.push('placeholder copy forbidden on starting build');
    score -= 25;
  }

  score = Math.max(0, score);
  return { ok: reasons.length === 0 && score >= 70, score, reasons };
}

export function scoreStartingDesignQuality(
  files: Record<string, string>,
  plan?: ProductPlan,
): { ok: boolean; score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 100;
  const app = files['src/App.tsx'] || files['src/App.jsx'] || '';
  const css = files['src/App.css'] || '';
  const family = plan?.compositionFamily;

  if (!/@font-face|fonts\.googleapis|font-family\s*:/i.test(css)) {
    reasons.push('design: missing intentional type pairing');
    score -= 12;
  }
  if (!/radial-gradient|linear-gradient|@keyframes|box-shadow/i.test(css)) {
    reasons.push('design: missing atmosphere / depth');
    score -= 10;
  }
  if (app.replace(/\s+/g, '').length < 600) {
    reasons.push('design: App too sparse to feel built');
    score -= 15;
  }
  if ((family === 'marketing-bands' || family === 'catalog-store') && !/<(?:nav|header)\b/i.test(app)) {
    reasons.push('design: missing header hierarchy');
    score -= 12;
  }

  score = Math.max(0, score);
  return { ok: reasons.length === 0 && score >= 70, score, reasons };
}

export type ProductRepairResult = {
  files: Record<string, string>;
  changed: boolean;
  actions: string[];
  needFloor: boolean;
  /** True when repair pasted a starter that became the product UI — never quality Ready. */
  repairOwnedProduct: boolean;
  planOk: boolean;
  reasons: string[];
};

/** Actions that mean repair (not craft) invented the product shell. */
const REPAIR_OWNED_ACTIONS = new Set([
  'inject-app-workspace',
  'inject-tool-panel',
  'inject-tip-panel',
  'inject-todo-panel',
  'inject-notes-workspace',
  'inject-habit-workspace',
  'inject-game-chrome',
  'inject-hero',
]);


/** Remove storefront island state + JSX that leaked into non-shop families (habit/todo/etc). */
export function stripWrongFamilyStorefrontBleed(app: string): string {
  let next = String(app || '');
  next = next.replace(/import\s*\{[^}]*PRODUCTS[^}]*\}\s*from\s*['"]\.\/data\/products['"];?\n?/g, '');
  next = next.replace(/\/\*\s*NOVA_STOREFRONT_ISLAND\s*\*\/[\s\S]*?(?=\n\s*return\s*\()/m, '\n');
  next = next.replace(/\n\s*<section\b[^>]*data-nova=["']storefront-island["'][\s\S]*?<\/section>/gi, '');
  next = next.replace(/\n\s*\{open\s*\?[\s\S]*?:\s*null\}/g, '');
  next = next.replace(/\n\s*<div\b[^>]*className=["']cart-drawer["'][\s\S]*?<\/div>\s*\)\s*:\s*null\}/g, '');
  // Orphan shop/footer siblings left after root </div> before return close.
  next = next.replace(
    /(<\/div>)(\s*)\n(\s*<(?:section|footer)\b[\s\S]*?)(\n\s*\)\s*;)/,
    '$1$4',
  );
  return next;
}

/** Strip marketing COVER/hero theater from tools + apps (edit + create anti-bleed). */
export function stripToolMarketingBleed(app: string): string {
  let next = String(app || '');
  next = next
    .replace(/const\s+COVER_HREFS\s*=\s*\[[^\]]*\];?\s*/g, '')
    .replace(/\n\s*<section\b[^>]*className=["'][^"']*\bhero\b[^"']*full-bleed[^"']*["'][\s\S]*?<\/section>/gi, '\n')
    .replace(/\n\s*<section\b[^>]*className=["'][^"']*full-bleed[^"']*\bhero\b[^"']*["'][\s\S]*?<\/section>/gi, '\n')
    .replace(/\n\s*<header\b[^>]*className=["'][^"']*\bhero\b[^"']*["'][\s\S]*?<\/header>/gi, '\n')
    .replace(/\n\s*<div className=["']hero__cta["'][\s\S]*?<\/div>/gi, '\n');
  return next;
}

/**
 * Edit/create anti-bleed: strip wrong-family junk without inventing a new product UI.
 * Safe after surgical edits — never injects starters.
 */
export function antiBleedForFamily(
  files: Record<string, string>,
  plan: ProductPlan,
): { files: Record<string, string>; changed: boolean; actions: string[] } {
  const next = { ...files };
  const actions: string[] = [];
  const appKey = next['src/App.jsx'] && !next['src/App.tsx'] ? 'src/App.jsx' : 'src/App.tsx';
  let app = String(next[appKey] || next['src/App.jsx'] || next['src/App.tsx'] || '');

  if (plan.compositionFamily !== 'catalog-store') {
    const bled = /NOVA_STOREFRONT_ISLAND/.test(app)
      || /from\s+['"]\.\/data\/products['"]/.test(app)
      || Boolean(next['src/data/products.ts']);
    if (bled) {
      app = stripWrongFamilyStorefrontBleed(app);
      next[appKey] = app;
      delete next['src/data/products.ts'];
      actions.push('strip-wrong-family-storefront');
    }
  }

  if (plan.compositionFamily === 'tool-panel' || plan.compositionFamily === 'app-chrome') {
    const cleaned = stripToolMarketingBleed(app);
    if (cleaned !== app) {
      app = cleaned;
      next[appKey] = app;
      actions.push('strip-tool-marketing-hero');
    }
  }

  return { files: next, changed: actions.length > 0, actions };
}

/** Strip wrong-family bleed only — never paste tip/todo/notes starters as the product. */
export function repairToContract(
  files: Record<string, string>,
  plan: ProductPlan,
  brief = '',
): ProductRepairResult {
  if (plan.compositionFamily === 'catalog-store') {
    const shop = repairStorefrontToContract(files, {
      productName: plan.productName,
      brief: brief || plan.productName,
    });
    return {
      files: shop.files,
      changed: shop.changed,
      actions: shop.actions,
      needFloor: shop.needFloor,
      repairOwnedProduct: Boolean(shop.needFloor),
      planOk: shop.contractOk,
      reasons: shop.reasons,
    };
  }

  const next = { ...files };
  const actions: string[] = [];
  const appKey = next['src/App.jsx'] && !next['src/App.tsx'] ? 'src/App.jsx' : 'src/App.tsx';
  let app = String(next[appKey] || next['src/App.jsx'] || next['src/App.tsx'] || '');
  const css = String(next['src/App.css'] || '');

  // Wrong-family storefront bleed (contaminated chat / prior floor) — strip before app repair.
  // Always drop orphan products.ts on non-shop families (even if App does not import it).
  {
    const bled = /NOVA_STOREFRONT_ISLAND/.test(app)
      || /from\s+['"]\.\/data\/products['"]/.test(app)
      || Boolean(next['src/data/products.ts']);
    if (bled) {
      app = stripWrongFamilyStorefrontBleed(app);
      next[appKey] = app;
      delete next['src/data/products.ts'];
      actions.push('strip-wrong-family-storefront');
    }
  }

  // Tools + apps: strip marketing hero / COVER bleed (never invent product via strip).
  if (plan.compositionFamily === 'tool-panel' || plan.compositionFamily === 'app-chrome') {
    const beforeBleed = app;
    app = stripToolMarketingBleed(app);
    if (app !== beforeBleed) {
      next[appKey] = app;
      actions.push('strip-tool-marketing-hero');
    }
  }

  if (app.replace(/\s+/g, '').length < 120) {
    return {
      files: next,
      changed: false,
      actions: ['unsavageable-thin'],
      needFloor: true,
      repairOwnedProduct: false,
      planOk: false,
      reasons: ['App too thin to repair'],
    };
  }

  // Brief-first: repair only strips wrong-family bleed — never pastes tip/todo/notes/shop starters.
  // If craft is incomplete, fail honestly (needFloor) so the model can retry — do not invent the product.

  next[appKey] = app;
  next['src/App.css'] = css;
  const scored = scorePlanContract(next, plan);
  const design = scoreStartingDesignQuality(next, plan);
  const repairOwnedProduct = actions.some((a) => REPAIR_OWNED_ACTIONS.has(a));
  return {
    files: next,
    changed: actions.length > 0,
    actions,
    // Repair-owned starters unlock Live only via floorFallback — never quality Ready alone.
    needFloor: repairOwnedProduct || (!scored.ok && app.replace(/\s+/g, '').length < 400),
    repairOwnedProduct,
    planOk: scored.ok && !repairOwnedProduct,
    reasons: [
      ...scored.reasons,
      ...design.reasons,
      ...(repairOwnedProduct ? ['repair owned product shell — not original craft'] : []),
    ],
  };
}
