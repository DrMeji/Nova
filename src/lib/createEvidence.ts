/**
 * Create evidence bundle — success is proven, not claimed.
 * Static Preview Ready is preflight only; Live mount + console gate completion.
 */

export type CreateEvidence = {
  staticReady: boolean;
  staticReasons: string[];
  npmInstalled: boolean;
  liveUrl: string | null;
  httpOk: boolean;
  mounted: boolean;
  consoleClean: boolean;
  consoleErrors: string[];
  /** Visible text sampled from the actual Live DOM when the desktop probe is available. */
  renderedSample?: string;
  smokeOk: boolean | null;
  smokeDetail: string;
  /** Last real package build result when a local build command was available. */
  buildOk?: boolean | null;
  buildErrors?: string[];
  /** Live unlock — HTTP + mount (user can open Live). */
  pass: boolean;
  /** Quality badge — static Ready + clean console + smoke (soft; does not block Live). */
  qualityOk?: boolean;
  stage: string;
};

export type CreateEvidenceProbe = {
  ok?: boolean;
  mounted?: boolean;
  fail?: boolean;
  viteErr?: boolean;
  sample?: string;
  consoleErrors?: string[];
  error?: string;
};

import { scoreAskMatch as scoreCreateAskMatch } from '@/lib/createAskContract';

export type CreateRenderedQuality = {
  ok: boolean;
  reasons: string[];
  askScore: number;
  askReasons: string[];
};

/** Final deterministic surface check used after the same files have mounted in Live. */
export function verifyCreateRenderedQuality(
  files: Record<string, string>,
  brief: string,
  productName = '',
): CreateRenderedQuality {
  const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
  const sections = Object.entries(files || {})
    .filter(([path]) => /^src\/sections\/.*\.jsx?$/i.test(path.replace(/\\/g, '/')))
    .map(([, body]) => String(body || ''));
  const rendered = `${app}\n${sections.join('\n')}`;
  const reasons: string[] = [];
  if (!app.trim()) reasons.push('final App source missing');
  const css = String(files['src/App.css'] || files['src/index.css'] || '');
  // Step-ladder / blank-solid asks: a painted empty shell is the whole deliverable.
  const blankIntent = /\b(?:blank|nothing else|plain\s+white|white\s+(?:blank\s+)?page|empty\s+page)\b/i.test(String(brief || ''));
  if (blankIntent && /className=["']app["']/.test(app) && /background\s*:/.test(css)) {
    return { ok: reasons.length === 0, reasons, askScore: 10, askReasons: ['blank solid page'] };
  }
  if (!css.trim() || css.replace(/\s+/g, '').length < 80) reasons.push('final styling missing or too thin');
  const importsCss = /import\s+['"]\.\/(?:App|index)\.css['"]/.test(app)
    || /import\s+['"]\.\/(?:App|index)\.css['"]/.test(String(files['src/main.jsx'] || files['src/main.tsx'] || ''));
  if (css.trim() && !importsCss) reasons.push('styles are not linked from App or entrypoint');

  const linkTargets = [...rendered.matchAll(/(?:href|to)=\{?['"]#([^'"}]+)['"]\}?/gi)].map((m) => m[1]);
  const ids = new Set([...rendered.matchAll(/\bid=\{?['"]([^'"}]+)['"]\}?/gi)].map((m) => m[1]));
  // Pine Latch 2026-10-23: model Catalog/Story shipped without id="shop"/"story" while
  // Nav hrefs pointed at them — soft-resolve via section landmarks so Ready isn't soft forever.
  const softNavTarget = (id: string): boolean => {
    if (ids.has(id)) return true;
    const key = String(id || '').toLowerCase();
    if (key === 'shop') {
      return /CatalogSection|product-grid|catalog-grid|className=["'][^"']*catalog/i.test(rendered);
    }
    if (key === 'story') {
      return /StorySection|className=["'][^"']*story|Our Story/i.test(rendered);
    }
    if (key === 'contact' || key === 'visit') {
      return /FooterSection|ContactSection|className=["'][^"']*footer|Visit the atelier/i.test(rendered);
    }
    return false;
  };
  const missingTargets = [...new Set(linkTargets.filter((id) => !softNavTarget(id)))];
  if (missingTargets.length) reasons.push(`navigation targets missing: ${missingTargets.slice(0, 4).join(', ')}`);

  const copy = [...rendered.matchAll(/<(?:p|h2|h3)\b[^>]*>([\s\S]*?)<\/(?:p|h2|h3)>/gi)]
    .map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase())
    .filter((s) => s.length >= 28);
  const counts = new Map<string, number>();
  for (const s of copy) counts.set(s, (counts.get(s) || 0) + 1);
  if ([...counts.values()].some((n) => n >= 3)) reasons.push('repeated section copy detected');
  if (/lorem ipsum|sample text|band-\d+|placeholder copy/i.test(rendered)) reasons.push('placeholder copy detected');
  const navTags = [...rendered.matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav>/gi)].map((m) => m[1]);
  for (const nav of navTags) {
    const labels = [...nav.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)]
      .map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (labels.length >= 3 && new Set(labels.map((x) => x.toLowerCase())).size < labels.length) {
      reasons.push('navigation labels are duplicated');
    }
    const cssBlob = `${files['src/App.css'] || ''}\n${files['src/index.css'] || ''}`;
    const navClass = String(rendered.match(/<nav\b[^>]*className=["']([^"']+)/i)?.[1] || '').split(/\s+/)[0];
    if (navClass && new RegExp(`\\.${navClass.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*\\{`, 'i').test(cssBlob)) {
      const rule = cssBlob.match(new RegExp(`\\.${navClass.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*\\{([^}]+)\\}`, 'i'))?.[1] || '';
      if (!/(?:display\s*:\s*(?:flex|grid)|gap\s*:|justify-content\s*:)/i.test(rule)) reasons.push('navigation has no layout spacing rule');
    }
  }

  const briefText = String(brief || '').trim();
  let askScore = 10;
  let askReasons: string[] = [];
  if (briefText && /\b(?:website|site|homepage|landing|brand|shop|store|marketing|product\s+page)\b/i.test(briefText)) {
    try {
      // Import is local and deterministic; keep this boundary independent from the runtime preview bridge.
      const match = scoreCreateAskMatch(files, briefText, productName);
      askScore = match.score;
      askReasons = match.reasons;
      if (!match.ok) reasons.push(`brief match failed (${match.score}/10): ${match.reasons.slice(0, 3).join('; ')}`);
    } catch (err) {
      askScore = 0;
      askReasons = [err instanceof Error ? err.message : 'brief judge failed'];
      reasons.push('brief match judge unavailable');
    }
  }
  if (briefText && /\b(?:reusable\s+workflow|repeatable\s+workflow|workflow\s+for|script\s+that|automate)\b/i.test(briefText)) {
    const actions = [...rendered.matchAll(/\bon(?:Click|Submit|Change)\s*=|<form\b/gi)].length;
    const state = /useState\s*\(|useReducer\s*\(/.test(rendered);
    if (!actions || !state) reasons.push('requested interactions lack state-backed handlers');
  }
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)], askScore, askReasons };
}

export function emptyCreateEvidence(partial?: Partial<CreateEvidence>): CreateEvidence {
  return {
    staticReady: false,
    staticReasons: [],
    npmInstalled: false,
    liveUrl: null,
    httpOk: false,
    mounted: false,
    consoleClean: true,
    consoleErrors: [],
    smokeOk: null,
    smokeDetail: '',
    buildOk: null,
    buildErrors: [],
    pass: false,
    stage: 'init',
    ...partial,
  };
}

/** Host-side smoke for simple create kinds (todo / tip / coffee). No model invention. */
export function smokeCheckCreateFiles(
  files: Record<string, string>,
  brief: string,
): { ok: boolean; detail: string } {
  const app = files['src/App.jsx'] || files['src/App.tsx'] || files['index.html'] || '';
  // Compositional invent: structure lives in sections — smoke the painted surface.
  const sectionBlob = Object.entries(files || {})
    .filter(([k]) => /src\/sections\/.+\.(?:jsx|tsx)$/i.test(String(k).replace(/\\/g, '/')))
    .map(([, v]) => String(v || ''))
    .join('\n');
  const surface = `${app}\n${sectionBlob}`;
  const t = String(brief || '');
  // Blank / step-ladder solid page — thin App is intentional.
  if (/\b(?:blank|nothing else|plain\s+white|white\s+(?:blank\s+)?page|empty\s+page)\b/i.test(t)
    && /className=["']app["']/.test(app)) {
    return { ok: true, detail: 'smoke: blank solid page' };
  }
  // Vacuous guard (verifygate / proof-loop): zero signal never PASSes.
  if (!app || (app.length < 80 && sectionBlob.length < 200)) {
    return { ok: false, detail: 'smoke vacuous: App too thin (collected 0 signals)' };
  }
  const signalCount = [
    /useState|useReducer/.test(surface),
    /on(?:Click|Change|Submit)/.test(surface),
    /<input\b/i.test(surface),
    /<h1\b/i.test(surface),
    /<(?:section|main|header|nav)\b/i.test(surface),
    /from\s+['"]\.\/sections\//i.test(app) && /HeroSection|CatalogSection|StorySection/i.test(surface),
  ].filter(Boolean).length;
  if (signalCount === 0) {
    return { ok: false, detail: 'smoke vacuous: no interactive or structure signals collected' };
  }

  if (/\b(?:todo|to-?do|task\s*list|checklist)\b/i.test(t)) {
    const hasAdd = /\b(?:add|Add)\b/.test(app) && /useState|setTodos|setItems|setList/.test(app);
    const hasDel = /\b(?:delete|Delete|remove|Remove)\b/.test(app);
    const hasInput = /<input\b/i.test(app);
    const ok = hasAdd && hasDel && hasInput;
    return {
      ok,
      detail: ok
        ? 'todo smoke: input + add + delete present'
        : 'todo smoke failed: need input, add handler, and delete',
    };
  }
  if (/\b(?:tip\s*calc|tip\s*calculator|gratuity)\b/i.test(t)) {
    const ok = /useState/.test(app) && /<input\b/i.test(app) && /\btip\b/i.test(app);
    return {
      ok,
      detail: ok ? 'tip smoke: inputs + tip state' : 'tip smoke failed: need tip inputs/state',
    };
  }
  // "espresso navy type" on leather briefs is palette, not a coffee shop ask.
  if (
    (/\b(?:coffee|cafe|latte|roast)\b/i.test(t)
      || (/\bespresso\b/i.test(t) && !/\bespresso\s+(?:navy|type|ink|text|color)\b/i.test(t)))
    && /\b(?:landing|hero|menu|shop)\b/i.test(t)
    && !/\b(?:leather|atelier|parchment|satchel|tote|handcrafted\s+bags?)\b/i.test(t)
  ) {
    const sections = (surface.match(/<(?:section|header|footer|nav|main)\b/gi) || []).length;
    const ok = sections >= 2 && /<h1\b/i.test(surface);
    return {
      ok,
      detail: ok ? 'coffee smoke: multi-section landing' : 'coffee smoke failed: need hero/sections',
    };
  }
  // Atelier / marketing compositional shell — Nav + Hero + Shop/Story on disk is enough.
  if (
    /from\s+['"]\.\/sections\//i.test(app)
    && /<(?:header|nav)\b/i.test(surface)
    && /<h1\b|hero-title/i.test(surface)
    && (/(?:section|CatalogSection|StorySection)/i.test(surface))
  ) {
    return { ok: true, detail: 'compositional smoke: shell + hero + bands' };
  }
  // Generic interactive: state + handler is enough.
  if (/\buse(?:State|Reducer)\s*\(/.test(surface) && /on(?:Click|Change|Submit)/.test(surface)) {
    return { ok: true, detail: 'interactive smoke: state + handlers' };
  }
  if (/<(?:section|main|header|nav)\b/i.test(surface) && /<h1\b/i.test(surface)) {
    return { ok: true, detail: 'structure smoke: sections + title' };
  }
  return { ok: false, detail: 'smoke failed: no interactive or landing structure' };
}

/**
 * Probe Live URL + mount + console. Never marks pass on HTTP alone when Electron probe exists.
 */
export async function collectLiveEvidence(opts: {
  liveUrl: string;
  productName?: string;
  files: Record<string, string>;
  brief: string;
  requireSmoke?: boolean;
  onStatus?: (label: string) => void;
  /** Chat-scoped Live window id (`chat-…`) so evidence never opens another thread's preview. */
  projectId?: string;
}): Promise<Pick<CreateEvidence, 'httpOk' | 'mounted' | 'consoleClean' | 'consoleErrors' | 'renderedSample' | 'smokeOk' | 'smokeDetail' | 'liveUrl'>> {
  const liveUrl = String(opts.liveUrl || '').trim();
  const consoleErrors: string[] = [];
  let httpOk = false;
  let mounted = false;
  let renderedSample = '';

  if (!liveUrl) {
    return {
      liveUrl: null,
      httpOk: false,
      mounted: false,
      consoleClean: true,
      consoleErrors: [],
      renderedSample,
      smokeOk: false,
      smokeDetail: 'no Live URL',
    };
  }

  // Never open the Live probe window against uncompilable App — that paints the fail card.
  try {
    const { runCreateSyntaxGate } = await import('@/lib/createSyntaxGate');
    const syn = runCreateSyntaxGate(opts.files || {});
    if (!syn.ok) {
      return {
        liveUrl,
        httpOk: false,
        mounted: false,
        consoleClean: false,
        consoleErrors: [`syntax gate blocked Live: ${syn.reasons[0] || 'App.jsx will not compile'}`],
        renderedSample,
        smokeOk: false,
        smokeDetail: syn.reasons[0] || 'syntax gate',
      };
    }
  } catch { /* gate best-effort — continue to HTTP */ }

  try {
    const { verifyLivePreviewUrl } = await import('@/lib/projectPreview');
    opts.onStatus?.('Evidence · checking Live HTTP…');
    httpOk = await verifyLivePreviewUrl(liveUrl);
  } catch {
    httpOk = false;
  }

  if (httpOk) {
    const api = (window as unknown as {
      novaDesktop?: {
        previewProbeMounted?: (p: {
          url: string;
          title?: string;
          waitMs?: number;
          hardTimeoutMs?: number;
          projectId?: string;
          show?: boolean;
        }) => Promise<CreateEvidenceProbe>;
      };
    }).novaDesktop;

    if (api?.previewProbeMounted) {
      opts.onStatus?.('Evidence · verifying Live paints UI…');
      try {
        // Renderer-side race — Electron probe can wedge on executeJavaScript with no return.
        const probe: CreateEvidenceProbe = await Promise.race([
          api.previewProbeMounted({
            url: liveUrl,
            title: opts.productName || 'Preview',
            waitMs: 5000,
            hardTimeoutMs: 12_000,
            projectId: opts.projectId || undefined,
            show: false,
          }),
          new Promise<CreateEvidenceProbe>((resolve) => {
            window.setTimeout(
              () => resolve({ ok: false, mounted: false, error: 'preview probe renderer timeout' }),
              14_000,
            );
          }),
        ]);
        mounted = Boolean(probe?.ok && probe?.mounted);
        renderedSample = String(probe?.sample || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
        const errs = Array.isArray(probe?.consoleErrors)
          ? probe.consoleErrors.map((e: string) => String(e || '').trim()).filter(Boolean)
          : [];
        consoleErrors.push(...errs.slice(0, 12));
        if (probe?.viteErr || probe?.fail) {
          consoleErrors.push(probe?.fail ? 'nova-preview-fail overlay' : 'vite error in preview');
        }
        if (!mounted && probe?.error) consoleErrors.push(String(probe.error));
      } catch (err) {
        mounted = false;
        consoleErrors.push(err instanceof Error ? err.message : 'probe failed');
      }
    } else {
      // No Electron probe — cannot honestly claim mount; HTTP only.
      mounted = false;
      consoleErrors.push('no Electron Live probe — mount unverified');
    }
  }

  const consoleClean = consoleErrors.length === 0
    || !consoleErrors.some((e) => {
      const s = String(e || '');
      // Tighten: any real runtime/exception line fails; ignore benign HMR noise.
      if (/\[hmr\]|hot.?update|connected|websocket|devtools/i.test(s)) return false;
      // Soft Live toast while paint already verified — do not block quality Ready.
      if (mounted && /Live can't show the app|something in this file is broken/i.test(s)) {
        return false;
      }
      return /error|exception|failed|vite|overlay|uncaught|rejection|not defined|cannot read|typeerror|referenceerror|syntaxerror/i.test(s)
        || /\bat\s+\S+\s*\(/.test(s); // stack frames
    });
  const smoke = smokeCheckCreateFiles(opts.files, opts.brief);
  const requireSmoke = opts.requireSmoke !== false;
  // Vacuous: requireSmoke with smokeOk null must not pass finalize — force false.
  const smokeOk = requireSmoke ? smoke.ok : (smoke.ok || null);

  return {
    liveUrl,
    httpOk,
    mounted,
    consoleClean: consoleErrors.length === 0 ? true : consoleClean,
    consoleErrors,
    renderedSample,
    smokeOk,
    smokeDetail: smoke.detail,
  };
}

export function finalizeCreateEvidence(base: CreateEvidence): CreateEvidence {
  const consoleOk = base.consoleClean || base.consoleErrors.length === 0;
  // Smoke waived (null) or true. Console errors do not block Live unlock.
  const smokePass = base.smokeOk !== false;
  // Item 4: Live unlock = paint (HTTP + mount). Quality is a separate badge.
  const liveUnlock = Boolean(base.npmInstalled && base.httpOk && base.mounted);
  const qualityOk = Boolean(
    base.staticReady
    && consoleOk
    && smokePass
    && base.buildOk !== false
    && liveUnlock,
  );
  return {
    ...base,
    consoleClean: consoleOk,
    pass: liveUnlock,
    qualityOk,
    stage: liveUnlock ? (qualityOk ? 'verified' : 'live') : (base.httpOk ? 'live' : 'blocked'),
  };
}

export function formatEvidenceForAgent(ev: CreateEvidence): string {
  const lines = [
    '## Create evidence (host)',
    `- staticReady: ${ev.staticReady}`,
    `- npmInstalled: ${ev.npmInstalled}`,
    `- liveUrl: ${ev.liveUrl || '(none)'}`,
    `- httpOk: ${ev.httpOk}`,
    `- mounted: ${ev.mounted}`,
    `- consoleClean: ${ev.consoleClean}`,
    `- smokeOk: ${ev.smokeOk}`,
    `- smoke: ${ev.smokeDetail || '—'}`,
    `- buildOk: ${ev.buildOk === null || ev.buildOk === undefined ? 'not run' : ev.buildOk}`,
    `- pass: ${ev.pass}`,
  ];
  if (ev.buildErrors?.length) {
    lines.push('- buildErrors:');
    for (const e of ev.buildErrors.slice(0, 6)) lines.push(`  - ${e.slice(0, 240)}`);
  }
  if (ev.staticReasons.length) {
    lines.push('- staticReasons:');
    for (const r of ev.staticReasons.slice(0, 8)) lines.push(`  - ${r}`);
  }
  if (ev.consoleErrors.length) {
    lines.push('- consoleErrors:');
    for (const e of ev.consoleErrors.slice(0, 8)) lines.push(`  - ${e.slice(0, 200)}`);
  }
  if (ev.renderedSample) {
    lines.push(`- renderedTextSample: ${ev.renderedSample.slice(0, 600)}`);
  }
  return lines.join('\n');
}

export const CREATE_RUNTIME_STAGES = [
  'plan',
  'scaffold',
  'craft',
  'preflight',
  'install',
  'live',
  'fix',
  'verified',
] as const;

export type CreateRuntimeStage = (typeof CREATE_RUNTIME_STAGES)[number];

export function createRuntimeStageLabel(stage: CreateRuntimeStage, detail?: string): string {
  const base: Record<CreateRuntimeStage, string> = {
    plan: 'Plan',
    scaffold: 'Scaffold',
    craft: 'Craft',
    preflight: 'Preflight (static Ready)',
    install: 'Install',
    live: 'Live verify',
    fix: 'Fix',
    verified: 'Verified',
  };
  const label = base[stage] || stage;
  return detail ? `${label} · ${detail}` : label;
}

/** Short tree + scripts + App peek for craft/fix prompts (not blind generate). */
export function formatCreateProjectMap(files: Record<string, string>): string {
  const keys = Object.keys(files || {})
    .map((p) => p.replace(/\\/g, '/'))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 48);
  let scripts = '';
  try {
    const pkg = files['package.json'];
    if (pkg) {
      const j = JSON.parse(pkg) as { scripts?: Record<string, string> };
      scripts = Object.keys(j.scripts || {}).slice(0, 12).join(', ');
    }
  } catch { /* ignore */ }
  const app = files['src/App.jsx'] || files['src/App.tsx'] || files['index.html'] || '';
  const appPeek = app
    ? app.replace(/\s+/g, ' ').trim().slice(0, 360)
    : '(no App yet)';
  return [
    '## Project map (scaffold)',
    ...keys.map((k) => `- ${k}`),
    scripts ? `package scripts: ${scripts}` : '',
    `App peek: ${appPeek}${app.length > 360 ? '…' : ''}`,
  ].filter(Boolean).join('\n');
}

/** Shared PASS definition for product UI + ladder harness. */
export function createEvidencePassDefinition(): string {
  return [
    'Live unlock = npmInstalled && httpOk && mounted (smoke soft; console advisory).',
    'Quality Ready = Live unlock + console clean + smoke + host judge + ProductPlan score + design score + original-brief ask match + no floor fallback.',
  ].join(' ');
}
