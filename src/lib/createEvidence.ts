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
  smokeOk: boolean | null;
  smokeDetail: string;
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
  const t = String(brief || '');
  // Vacuous guard (verifygate / proof-loop): zero signal never PASSes.
  if (!app || app.length < 80) return { ok: false, detail: 'smoke vacuous: App too thin (collected 0 signals)' };
  const signalCount = [
    /useState|useReducer/.test(app),
    /on(?:Click|Change|Submit)/.test(app),
    /<input\b/i.test(app),
    /<h1\b/i.test(app),
    /<(?:section|main|header|nav)\b/i.test(app),
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
  if (/\b(?:coffee|cafe|latte|espresso|roast)\b/i.test(t) && /\b(?:landing|hero|menu|shop)\b/i.test(t)) {
    const sections = (app.match(/<(?:section|header|footer|nav|main)\b/gi) || []).length;
    const ok = sections >= 2 && /<h1\b/i.test(app);
    return {
      ok,
      detail: ok ? 'coffee smoke: multi-section landing' : 'coffee smoke failed: need hero/sections',
    };
  }
  // Generic interactive: state + handler is enough.
  if (/\buse(?:State|Reducer)\s*\(/.test(app) && /on(?:Click|Change|Submit)/.test(app)) {
    return { ok: true, detail: 'interactive smoke: state + handlers' };
  }
  if (/<(?:section|main|header|nav)\b/i.test(app) && /<h1\b/i.test(app)) {
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
}): Promise<Pick<CreateEvidence, 'httpOk' | 'mounted' | 'consoleClean' | 'consoleErrors' | 'smokeOk' | 'smokeDetail' | 'liveUrl'>> {
  const liveUrl = String(opts.liveUrl || '').trim();
  const consoleErrors: string[] = [];
  let httpOk = false;
  let mounted = false;

  if (!liveUrl) {
    return {
      liveUrl: null,
      httpOk: false,
      mounted: false,
      consoleClean: true,
      consoleErrors: [],
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
          }),
          new Promise<CreateEvidenceProbe>((resolve) => {
            window.setTimeout(
              () => resolve({ ok: false, mounted: false, error: 'preview probe renderer timeout' }),
              14_000,
            );
          }),
        ]);
        mounted = Boolean(probe?.ok && probe?.mounted);
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
    `- pass: ${ev.pass}`,
  ];
  if (ev.staticReasons.length) {
    lines.push('- staticReasons:');
    for (const r of ev.staticReasons.slice(0, 8)) lines.push(`  - ${r}`);
  }
  if (ev.consoleErrors.length) {
    lines.push('- consoleErrors:');
    for (const e of ev.consoleErrors.slice(0, 8)) lines.push(`  - ${e.slice(0, 200)}`);
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
    'Quality Ready = Live unlock + console clean + smoke + host judge + ProductPlan score + design score + no floor fallback.',
  ].join(' ');
}
