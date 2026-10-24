/**
 * P0 harness capabilities — wired into Ready / Done / invent.
 * Over-implement; prune later if unused.
 */

export type BinaryRubricItem = {
  id: string;
  label: string;
  pass: boolean;
  evidence: string;
};

export type CreateArtifacts = {
  screenshots: { viewport: string; note: string; ok: boolean }[];
  consoleLog: string[];
  smokeLog: string;
  axeCritical: number;
  axeNotes: string[];
  writtenAt: number;
};

export type ProgressFeature = {
  id: string;
  title: string;
  status: 'fail' | 'pass' | 'wip';
  notes?: string;
};

export type ProgressMdState = {
  brand: string;
  brief: string;
  features: ProgressFeature[];
  sessions: { at: number; note: string }[];
  updatedAt: number;
};

export type ApprovalPolicy = 'on-request' | 'never' | 'auto';
export type SandboxMode = 'read-only' | 'workspace-write' | 'full-access';

export type ApprovalPrefs = {
  approvalPolicy: ApprovalPolicy;
  sandboxMode: SandboxMode;
  networkDenyByDefault: boolean;
  networkAllowlist: string[];
};

export const DEFAULT_APPROVAL_PREFS: ApprovalPrefs = {
  approvalPolicy: 'on-request',
  sandboxMode: 'workspace-write',
  networkDenyByDefault: true,
  networkAllowlist: ['registry.npmjs.org', 'nodejs.org', 'github.com', 'raw.githubusercontent.com'],
};

/** Binary yes/no rubric — no 1–10 vibe scores. */
export function evaluateBinaryCreateRubric(opts: {
  files: Record<string, string>;
  brief: string;
  brand?: string;
  evidence?: {
    mounted?: boolean;
    consoleClean?: boolean;
    smokeOk?: boolean | null;
    staticReady?: boolean;
    floor?: boolean;
    axeCritical?: number;
  };
}): { ok: boolean; items: BinaryRubricItem[]; failed: string[] } {
  const app = String(opts.files['src/App.jsx'] || opts.files['src/App.tsx'] || '');
  const css = String(opts.files['src/App.css'] || opts.files['src/index.css'] || '');
  const brief = String(opts.brief || '');
  const brand = String(opts.brand || '').trim();
  const ev = opts.evidence || {};

  const items: BinaryRubricItem[] = [
    {
      id: 'has-app',
      label: 'App source exists (>400B)',
      pass: app.trim().length >= 400,
      evidence: `${app.trim().length}B`,
    },
    {
      id: 'has-css',
      label: 'Styles linked and non-thin',
      pass: css.replace(/\s+/g, '').length >= 80 && (
        /import\s+['"]\.\/(?:App|index)\.css['"]/.test(app)
        || /import\s+['"]\.\/(?:App|index)\.css['"]/.test(String(opts.files['src/main.jsx'] || opts.files['src/main.tsx'] || ''))
      ),
      evidence: `css=${css.length}B`,
    },
    {
      id: 'no-placeholder-copy',
      label: 'No lorem / placeholder copy',
      pass: !/lorem ipsum|sample text|placeholder copy|band-\d+/i.test(app),
      evidence: 'scan App',
    },
    {
      id: 'no-floor',
      label: 'Not a placeholder floor twin',
      pass: ev.floor !== true,
      evidence: ev.floor ? 'floor marker' : 'ok',
    },
    {
      id: 'brand-present',
      label: 'Brand appears in UI when known',
      pass: !brand || new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(app),
      evidence: brand || '(no brand)',
    },
    {
      id: 'live-mounted',
      label: 'Live mounted',
      pass: ev.mounted === true,
      evidence: String(ev.mounted),
    },
    {
      id: 'console-clean',
      label: 'Console clean',
      pass: ev.consoleClean !== false,
      evidence: String(ev.consoleClean),
    },
    {
      id: 'smoke-pass',
      label: 'Host smoke pass (or waived)',
      pass: ev.smokeOk !== false,
      evidence: String(ev.smokeOk),
    },
    {
      id: 'axe-critical-zero',
      label: 'axe critical violations = 0',
      pass: (ev.axeCritical ?? 0) === 0,
      evidence: `critical=${ev.axeCritical ?? 0}`,
    },
    {
      id: 'brief-signal',
      label: 'Brief keyword signal in App or CSS',
      pass: !brief.trim() || briefTokenHit(brief, `${app}\n${css}`),
      evidence: 'token overlap',
    },
  ];

  const failed = items.filter((i) => !i.pass).map((i) => i.id);
  return { ok: failed.length === 0, items, failed };
}

function briefTokenHit(brief: string, blob: string): boolean {
  const stop = new Set(['the', 'and', 'for', 'with', 'a', 'an', 'to', 'of', 'in', 'on', 'create', 'build', 'website', 'site', 'page', 'new']);
  const tokens = brief.toLowerCase().match(/[a-z]{4,}/g) || [];
  const keep = tokens.filter((t) => !stop.has(t)).slice(0, 8);
  if (!keep.length) return true;
  const lower = blob.toLowerCase();
  return keep.filter((t) => lower.includes(t)).length >= Math.min(2, keep.length);
}

/** Generator ≠ Evaluator — separate binary judge from invent path. */
export function evaluateCreateAsSeparateJudge(opts: {
  files: Record<string, string>;
  brief: string;
  brand?: string;
  evidence?: Parameters<typeof evaluateBinaryCreateRubric>[0]['evidence'];
}): { accept: boolean; reason: string; rubric: ReturnType<typeof evaluateBinaryCreateRubric> } {
  const rubric = evaluateBinaryCreateRubric(opts);
  if (!rubric.ok) {
    return {
      accept: false,
      reason: `evaluator reject: ${rubric.failed.slice(0, 4).join(', ')}`,
      rubric,
    };
  }
  return { accept: true, reason: 'evaluator accept — all binary items pass', rubric };
}

/** Fail-to-pass smoke contract: empty/scaffold must fail; crafted must pass host smoke. */
export function failToPassSmokeContract(
  files: Record<string, string>,
  brief: string,
  smoke: { ok: boolean; detail: string },
): { ok: boolean; detail: string } {
  const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
  const emptyWouldFail = app.trim().length < 200;
  if (emptyWouldFail) {
    return { ok: false, detail: 'F2P: App still empty/scaffold — must fail before pass' };
  }
  if (!smoke.ok) {
    return { ok: false, detail: `F2P: smoke failed — ${smoke.detail}` };
  }
  return { ok: true, detail: `F2P: empty would fail; current smoke pass (${smoke.detail || 'ok'})` };
}

/** progress.md + feature checklist (initializer → sessions). */
export function initProgressMd(brief: string, brand: string): ProgressMdState {
  const features = extractFeatureChecklist(brief);
  return {
    brand: brand || 'Site',
    brief: String(brief || '').slice(0, 2000),
    features,
    sessions: [{ at: Date.now(), note: 'initializer — all features fail until proven' }],
    updatedAt: Date.now(),
  };
}

export function extractFeatureChecklist(brief: string): ProgressFeature[] {
  const t = String(brief || '');
  const features: ProgressFeature[] = [
    { id: 'hero', title: 'Hero / first viewport', status: 'fail' },
    { id: 'nav', title: 'Navigation', status: 'fail' },
    { id: 'content', title: 'Primary content sections', status: 'fail' },
    { id: 'style', title: 'Unique styling (not floor twin)', status: 'fail' },
    { id: 'live', title: 'Live mount + console clean', status: 'fail' },
  ];
  if (/\b(?:shop|store|cart|product|catalog)\b/i.test(t)) {
    features.push(
      { id: 'catalog', title: 'Product catalog', status: 'fail' },
      { id: 'cart', title: 'Cart interaction', status: 'fail' },
    );
  }
  if (/\b(?:form|contact|newsletter|signup|sign.?up)\b/i.test(t)) {
    features.push({ id: 'form', title: 'Form with state', status: 'fail' });
  }
  if (/\b(?:portfolio|gallery|work|projects)\b/i.test(t)) {
    features.push({ id: 'gallery', title: 'Work / gallery grid', status: 'fail' });
  }
  return features;
}

export function formatProgressMd(state: ProgressMdState): string {
  const lines = [
    `# Progress — ${state.brand}`,
    '',
    `Updated: ${new Date(state.updatedAt).toISOString()}`,
    '',
    '## Brief',
    state.brief.slice(0, 800),
    '',
    '## Features',
    ...state.features.map((f) => `- [${f.status === 'pass' ? 'x' : ' '}] ${f.id}: ${f.title}${f.notes ? ` — ${f.notes}` : ''}`),
    '',
    '## Sessions',
    ...state.sessions.slice(-8).map((s) => `- ${new Date(s.at).toISOString()}: ${s.note}`),
    '',
  ];
  return lines.join('\n');
}

export function syncProgressFeaturesFromFiles(
  state: ProgressMdState,
  files: Record<string, string>,
  evidence?: { mounted?: boolean; consoleClean?: boolean; floor?: boolean },
): ProgressMdState {
  const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
  const css = String(files['src/App.css'] || '');
  const next = { ...state, features: state.features.map((f) => ({ ...f })), updatedAt: Date.now() };
  const set = (id: string, pass: boolean, notes?: string) => {
    const feat = next.features.find((x) => x.id === id);
    if (feat) {
      feat.status = pass ? 'pass' : 'fail';
      if (notes) feat.notes = notes;
    }
  };
  set('hero', /hero|className=["'][^"']*hero|<header\b/i.test(app), 'hero/header scan');
  set('nav', /<nav\b/i.test(app), 'nav tag');
  set('content', (app.match(/<section\b/gi) || []).length >= 1 || app.length > 1200, 'sections');
  set('style', css.replace(/\s+/g, '').length >= 80 && evidence?.floor !== true, 'css + not floor');
  set('live', evidence?.mounted === true && evidence?.consoleClean !== false, 'live evidence');
  set('catalog', /product|catalog|PRODUCTS/i.test(app), 'catalog');
  set('cart', /cart|useState/i.test(app) && /cart/i.test(app), 'cart');
  set('form', /<form\b|onSubmit/i.test(app), 'form');
  set('gallery', /gallery|portfolio|grid/i.test(app), 'gallery');
  next.sessions = [...state.sessions, { at: Date.now(), note: 'sync from files/evidence' }].slice(-12);
  return next;
}

/** Multi-viewport screenshot matrix plan + axe gate (host executes when probe available). */
export const VIEWPORT_MATRIX = [
  { id: 'mobile', width: 375, height: 812 },
  { id: 'tablet', width: 768, height: 1024 },
  { id: 'desktop', width: 1440, height: 900 },
] as const;

export function planVisionLoop(opts?: { maxIters?: number }): {
  viewports: typeof VIEWPORT_MATRIX;
  maxIters: number;
  steps: string[];
} {
  return {
    viewports: VIEWPORT_MATRIX,
    maxIters: opts?.maxIters ?? 3,
    steps: [
      'render Live',
      'capture mobile/tablet/desktop',
      'run axe-core critical = 0',
      'vision critic vs brief (cap 3)',
      'patch → re-capture',
    ],
  };
}

/** Lightweight axe-critical heuristic from App markup (full axe runs in browser probe). */
export function heuristicAxeCritical(files: Record<string, string>): { critical: number; notes: string[] } {
  const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
  const notes: string[] = [];
  let critical = 0;
  const imgs = [...app.matchAll(/<img\b([^>]*)\/?>/gi)];
  for (const m of imgs) {
    if (!/\balt\s*=/i.test(m[1] || '')) {
      critical += 1;
      notes.push('img missing alt');
    }
  }
  const buttons = [...app.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)];
  for (const m of buttons) {
    const inner = (m[2] || '').replace(/<[^>]+>/g, '').trim();
    if (!inner && !/\baria-label\s*=/i.test(m[1] || '')) {
      critical += 1;
      notes.push('button without name');
    }
  }
  if (/onClick\s*=/.test(app) && !/\bonKeyDown\s*=|\btabIndex\b/i.test(app) && /role=["']button["']/i.test(app)) {
    critical += 1;
    notes.push('clickable role=button may lack keyboard');
  }
  return { critical, notes: notes.slice(0, 8) };
}

/** Design vision loop gate — require viewport plan + axe before quality Ready. */
export function visionA11yGate(files: Record<string, string>, artifacts?: CreateArtifacts | null): {
  ok: boolean;
  reason?: string;
  axe: ReturnType<typeof heuristicAxeCritical>;
} {
  const axe = heuristicAxeCritical(files);
  const critical = artifacts?.axeCritical ?? axe.critical;
  if (critical > 0) {
    return { ok: false, reason: `axe critical=${critical}: ${(artifacts?.axeNotes || axe.notes).slice(0, 3).join('; ')}`, axe };
  }
  if (artifacts && artifacts.screenshots.length > 0) {
    const failed = artifacts.screenshots.filter((s) => !s.ok);
    if (failed.length) {
      return { ok: false, reason: `viewport shots failed: ${failed.map((s) => s.viewport).join(',')}`, axe };
    }
  }
  return { ok: true, axe };
}

/** Build create evidence artifacts bundle (shot/video/log). */
export function buildCreateArtifacts(opts: {
  files: Record<string, string>;
  consoleErrors?: string[];
  smokeDetail?: string;
  viewportNotes?: Record<string, string>;
}): CreateArtifacts {
  const axe = heuristicAxeCritical(opts.files);
  return {
    screenshots: VIEWPORT_MATRIX.map((v) => ({
      viewport: v.id,
      note: opts.viewportNotes?.[v.id] || `planned ${v.width}x${v.height}`,
      ok: true, // host probe may flip false later
    })),
    consoleLog: (opts.consoleErrors || []).slice(0, 20),
    smokeLog: String(opts.smokeDetail || ''),
    axeCritical: axe.critical,
    axeNotes: axe.notes,
    writtenAt: Date.now(),
  };
}

/** Browser closed-loop script: click/type/assert plan for Live. */
export type BrowserAction =
  | { type: 'goto'; url?: string }
  | { type: 'click'; selector: string }
  | { type: 'type'; selector: string; text: string }
  | { type: 'assert'; selector: string; contains?: string };

export function planBrowserClosedLoop(brief: string, liveUrl?: string | null): BrowserAction[] {
  const actions: BrowserAction[] = [{ type: 'goto', url: liveUrl || undefined }];
  actions.push({ type: 'assert', selector: 'body', contains: undefined });
  if (/\b(?:cart|add to cart)\b/i.test(brief)) {
    actions.push({ type: 'click', selector: 'button' });
    actions.push({ type: 'assert', selector: 'body', contains: 'cart' });
  }
  if (/\b(?:form|contact|subscribe)\b/i.test(brief)) {
    actions.push({ type: 'type', selector: 'input', text: 'nova@test.local' });
    actions.push({ type: 'click', selector: 'button[type="submit"], button' });
  }
  return actions;
}

export function formatBrowserLoopForAgent(actions: BrowserAction[]): string {
  return [
    'BROWSER CLOSED LOOP (execute on Live, then report):',
    ...actions.map((a, i) => {
      if (a.type === 'goto') return `${i + 1}. goto ${a.url || 'Live'}`;
      if (a.type === 'click') return `${i + 1}. click ${a.selector}`;
      if (a.type === 'type') return `${i + 1}. type ${a.selector} ← ${a.text}`;
      return `${i + 1}. assert ${a.selector}${a.contains ? ` contains "${a.contains}"` : ''}`;
    }),
  ].join('\n');
}

/** Constrained TOOL decode — validate/repair free-text TOOL replies for GGUF. */
export const TOOL_SCHEMA_NAMES = [
  'list', 'read', 'grep', 'git_status', 'patch', 'write', 'run', 'ready', 'live', 'assets', 'mcp', 'done',
] as const;

export type ConstrainedToolCall = {
  tool: (typeof TOOL_SCHEMA_NAMES)[number];
  path?: string;
  query?: string;
  command?: string;
  content?: string;
  answer?: string;
  mcpTool?: string;
  valid: boolean;
  repairs: string[];
};

export function constrainToolDecode(text: string): ConstrainedToolCall | null {
  const raw = String(text || '');
  const repairs: string[] = [];
  let m = raw.match(/^\s*TOOL:\s*([a-zA-Z_]+)\s*$/im);
  if (!m) {
    // Repair: "tool write" / "TOOL write PATH"
    m = raw.match(/^\s*(?:TOOL\s+)([a-zA-Z_]+)\b/im) || raw.match(/^\s*tool["'\s:]+([a-zA-Z_]+)/im);
    if (m) repairs.push('normalized TOOL: line');
  }
  if (!m) return null;
  const name = m[1].toLowerCase();
  const tool = TOOL_SCHEMA_NAMES.find((t) => t === name);
  if (!tool) {
    return { tool: 'list', valid: false, repairs: [`unknown tool ${name}`] };
  }
  const path = raw.match(/^\s*PATH:\s*(.+)$/im)?.[1]?.trim();
  const query = raw.match(/^\s*QUERY:\s*(.+)$/im)?.[1]?.trim();
  const command = raw.match(/^\s*COMMAND:\s*(.+)$/im)?.[1]?.trim();
  const answer = raw.match(/^\s*ANSWER:\s*([\s\S]+)/im)?.[1]?.trim();
  const mcpTool = raw.match(/^\s*NAME:\s*(.+)$/im)?.[1]?.trim();
  const fence = raw.match(/```(?:[\w.-]*)?\n([\s\S]*?)```/);
  let valid = true;
  if ((tool === 'read' || tool === 'patch' || tool === 'write') && tool !== 'write' && !path && !/@@@FILE/i.test(raw)) {
    if (tool === 'read' || tool === 'patch') {
      valid = false;
      repairs.push('PATH required');
    }
  }
  if (tool === 'grep' && !query) {
    valid = false;
    repairs.push('QUERY required');
  }
  if (tool === 'run' && !command) {
    valid = false;
    repairs.push('COMMAND required');
  }
  if (tool === 'write' && !fence && !/@@@FILE/i.test(raw) && !path) {
    valid = false;
    repairs.push('write needs PATH+fence or @@@FILE');
  }
  return {
    tool,
    path,
    query,
    command,
    content: fence?.[1],
    answer,
    mcpTool,
    valid,
    repairs,
  };
}

/** Approval + sandbox policy helpers. */
export function commandNeedsApproval(
  command: string,
  prefs: ApprovalPrefs,
): { needsApproval: boolean; reason: string } {
  const cmd = String(command || '').trim();
  if (!cmd) return { needsApproval: true, reason: 'empty command' };
  if (prefs.approvalPolicy === 'never') return { needsApproval: false, reason: 'policy=never' };
  if (prefs.approvalPolicy === 'auto' && prefs.sandboxMode !== 'full-access') {
    return { needsApproval: false, reason: 'policy=auto workspace' };
  }
  const networked = /\bcurl\b|\bwget\b|\bfetch\b|\bnpm\s+publish\b|\bgit\s+push\b/i.test(cmd);
  if (prefs.networkDenyByDefault && networked) {
    const host = cmd.match(/https?:\/\/([^/\s]+)/i)?.[1] || '';
    if (host && prefs.networkAllowlist.some((h) => host.endsWith(h))) {
      return { needsApproval: prefs.approvalPolicy === 'on-request', reason: 'allowlisted host' };
    }
    return { needsApproval: true, reason: 'network deny-by-default' };
  }
  if (prefs.sandboxMode === 'read-only') {
    return { needsApproval: true, reason: 'read-only sandbox' };
  }
  if (/\brm\s+-rf\b|\bdel\s+\/s\b|\bformat\b|\bshutdown\b/i.test(cmd)) {
    return { needsApproval: true, reason: 'destructive' };
  }
  return {
    needsApproval: prefs.approvalPolicy === 'on-request' && !/^(npm|pnpm|yarn|npx|git\s+status|git\s+diff)\b/i.test(cmd),
    reason: 'on-request',
  };
}

export function isNetworkHostAllowed(urlOrHost: string, prefs: ApprovalPrefs): boolean {
  if (!prefs.networkDenyByDefault) return true;
  const host = String(urlOrHost || '')
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .toLowerCase();
  if (!host) return false;
  return prefs.networkAllowlist.some((h) => host === h || host.endsWith(`.${h}`));
}
