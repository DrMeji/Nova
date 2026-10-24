/**
 * Wave 4 research pack — gaps found beyond the original 45 Strong matrix.
 * Direct visual props, @-mentions, brain/ memory, invent A/B directions,
 * slash skills, Live annotations, session-start context load.
 */

export type InventDirection = {
  id: string;
  salt: number;
  label: string;
  note: string;
};

/** Lovable-style parallel invent directions (3 layout salts) before hard-go. */
export function inventDirectionOptions(brand: string, brief: string): InventDirection[] {
  const h = [...`${brand}\n${brief}`].reduce((a, c) => a + c.charCodeAt(0), 0);
  const base = Math.abs(h) % 4;
  const labels = ['Compact grid', 'Hero-forward', 'Editorial split', 'Dense catalog'];
  return [0, 1, 2].map((i) => {
    const salt = (base + i) % 4;
    return {
      id: `dir-${salt}`,
      salt,
      label: labels[salt],
      note: `Layout salt ${salt} — ${labels[salt]} composition for ${brand}`,
    };
  });
}

export function inventDirectionsFiles(opts: {
  brand: string;
  brief: string;
  chosenSalt?: number;
}): Record<string, string> {
  const dirs = inventDirectionOptions(opts.brand, opts.brief);
  const chosen = opts.chosenSalt ?? dirs[0]?.salt ?? 0;
  return {
    '.nova/invent-directions.json': `${JSON.stringify({
      version: 1,
      brand: opts.brand,
      chosenSalt: chosen,
      directions: dirs,
      updatedAt: new Date().toISOString(),
      note: 'Pick a direction before invent hard-go, or keep chosenSalt default.',
    }, null, 2)}\n`,
  };
}

/** Claude-style brain/ long-term memory skeleton. */
export function brainDirectoryFiles(brand: string): Record<string, string> {
  const b = String(brand || 'Project').trim() || 'Project';
  return {
    '.nova/brain/README.md': `# Brain — ${b}

Long-term invent memory (Wave 4). Agents append decisions here; session-start loads summaries.
`,
    '.nova/brain/decisions.md': `# Decisions
- Invent logo lock active
- Prefer layout salt uniqueness over template reuse
`,
    '.nova/brain/session-notes.md': `# Session notes
- (auto) Wave 4 brain seeded for ${b}
`,
    '.nova/brain/priorities.md': `# Priorities
1. Keep Live Ready after invent
2. Never overwrite invent logo with Lucide
3. Respect brand kit tokens
`,
  };
}

/** Slash skills / prompt files (Claude skills + Copilot prompt files). */
export function inventSkillFiles(): Record<string, string> {
  return {
    '.nova/skills/premium-pass/SKILL.md': `---
name: premium-pass
description: Force invent premium craft polish before Live Ready
---
# /premium-pass
Re-run invent premium polish. Keep logo lock. Prefer denser type + layout salt uniqueness.
`,
    '.nova/skills/redesign/SKILL.md': `---
name: redesign
description: Redesign Live without wiping invent logo or rescaffolding
---
# /redesign
Surgical redesign of composition and CSS. Do not replace public/logo.svg. Do not wipe catalog.
`,
    '.nova/skills/code-review/SKILL.md': `---
name: code-review
description: Review invent Acc diffs without writing files
---
# /code-review
Read src/App.jsx + App.css + brand kit. Report invent gaps (logo, salt, SKU glyphs, Ready risks). No file writes.
`,
    '.nova/prompts/invent.md': `# Invent prompt file
Create a one-of-one site from the brief. Attach brand kit. Use layout salt. Lock invent logo.
`,
  };
}

export type SlashSkill = { name: string; body: string };

/** Parse leading /skill-name from user ask. */
export function parseSlashSkill(ask: string): { skill: string; rest: string } | null {
  const m = String(ask || '').match(/^\s*\/([a-z0-9][\w-]*)\b([\s\S]*)$/i);
  if (!m) return null;
  return { skill: m[1].toLowerCase(), rest: String(m[2] || '').trim() };
}

export function resolveSlashSkillBody(
  files: Record<string, string>,
  skillName: string,
): string | null {
  const key = `.nova/skills/${skillName}/SKILL.md`;
  const body = files[key];
  if (body) return body;
  // Built-in fallbacks when Acc not yet on disk.
  const builtins = inventSkillFiles();
  return builtins[key] || null;
}

/** Expand @path and @"path with spaces" mentions into attached context. */
export function expandAtMentions(
  ask: string,
  files: Record<string, string>,
  maxFiles = 6,
  maxCharsEach = 4000,
): { text: string; attached: string[] } {
  const attached: string[] = [];
  let text = String(ask || '');
  const re = /@(?:"([^"]+)"|([\w./\\-]+(?:\.\w+)?))/g;
  const hits: Array<{ raw: string; path: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) != null) {
    const path = String(m[1] || m[2] || '').replace(/\\/g, '/');
    if (!path || path.startsWith('http')) continue;
    hits.push({ raw: m[0], path });
  }
  const blocks: string[] = [];
  for (const hit of hits.slice(0, maxFiles)) {
    const key = Object.keys(files).find(
      (k) => k === hit.path || k.endsWith(`/${hit.path}`) || k.replace(/\\/g, '/') === hit.path,
    );
    if (!key) continue;
    attached.push(key);
    const body = String(files[key] || '').slice(0, maxCharsEach);
    blocks.push(`### @${key}\n\`\`\`\n${body}\n\`\`\``);
  }
  if (!blocks.length) return { text, attached };
  return {
    text: `${text}\n\n## Attached via @mention\n${blocks.join('\n\n')}`,
    attached,
  };
}

export type VisualPropPatch = {
  selector: string;
  props: Partial<{
    color: string;
    background: string;
    fontSize: string;
    fontWeight: string;
    padding: string;
    margin: string;
    borderRadius: string;
    opacity: string;
    text: string;
  }>;
};

/**
 * Direct visual edit (v0/Blink-style) — apply CSS props to App.css without a full agent turn.
 * Matches class from selector when possible.
 */
export function applyDirectVisualProps(
  files: Record<string, string>,
  patch: VisualPropPatch,
): { files: Record<string, string>; applied: boolean; note: string } {
  const next = { ...files };
  let css = String(next['src/App.css'] || '');
  const sel = String(patch.selector || '');
  const classMatch = sel.match(/\.([A-Za-z_][\w-]*)/);
  const target = classMatch ? `.${classMatch[1]}` : sel.split('>').pop()?.trim() || '';
  if (!target || target.length < 2) {
    return { files, applied: false, note: 'no CSS target from selector' };
  }
  const decls = Object.entries(patch.props)
    .filter(([, v]) => v != null && String(v).trim())
    .map(([k, v]) => {
      const cssKey = k.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
      return `  ${cssKey}: ${v};`;
    });
  if (!decls.length && !patch.props.text) {
    return { files, applied: false, note: 'empty props' };
  }
  if (decls.length) {
    const block = `\n/* nova-direct-visual */\n${target} {\n${decls.join('\n')}\n}\n`;
    css += block;
    next['src/App.css'] = css;
  }
  if (patch.props.text) {
    let app = String(next['src/App.jsx'] || next['src/App.tsx'] || '');
    // Best-effort: replace first substantial text node-ish string near class.
    const cls = classMatch?.[1];
    if (cls && app.includes(cls)) {
      // Leave JSX structure; stash annotation for edit ask instead of risky replace.
      next['.__novaVisualText'] = JSON.stringify({
        className: cls,
        text: patch.props.text,
      });
    }
  }
  return {
    files: next,
    applied: true,
    note: `direct-visual · ${target} (${decls.length} decls)`,
  };
}

export type LiveAnnotation = {
  id: string;
  selector: string;
  note: string;
  at: number;
};

const ANNOTATIONS = new Map<string, LiveAnnotation[]>();

export function addLiveAnnotation(
  projectKey: string,
  opts: { selector: string; note: string },
): LiveAnnotation {
  const key = String(projectKey || 'default');
  const item: LiveAnnotation = {
    id: `ann-${Date.now().toString(36)}`,
    selector: String(opts.selector || '').slice(0, 200),
    note: String(opts.note || '').slice(0, 500),
    at: Date.now(),
  };
  const list = ANNOTATIONS.get(key) || [];
  list.push(item);
  ANNOTATIONS.set(key, list.slice(-24));
  return item;
}

export function consumeLiveAnnotations(projectKey: string): LiveAnnotation[] {
  const key = String(projectKey || 'default');
  const list = ANNOTATIONS.get(key) || [];
  ANNOTATIONS.set(key, []);
  return list;
}

export function formatAnnotationsAsk(anns: LiveAnnotation[], userAsk: string): string {
  if (!anns.length) return userAsk;
  const lines = anns.map((a) => `- \`${a.selector}\`: ${a.note}`);
  return [
    String(userAsk || '').trim(),
    '',
    '## Live annotations',
    ...lines,
    'Apply these notes surgically to the matching source.',
  ].join('\n');
}

/** Session-start context load (Claude SessionStart hook analogue). */
export function loadSessionStartContext(files: Record<string, string>): string {
  const chunks: string[] = [];
  for (const k of [
    'AGENTS.md',
    'NOVA.md',
    '.nova/steering/product.md',
    '.nova/steering/tech.md',
    '.nova/brain/priorities.md',
    '.nova/brain/decisions.md',
    '.nova/memory.md',
    '.nova/brand-kit.json',
  ]) {
    const v = files[k];
    if (v && String(v).trim()) {
      chunks.push(`### ${k}\n${String(v).slice(0, 1200)}`);
    }
  }
  if (!chunks.length) return '';
  return `## Session start context\n${chunks.join('\n\n')}`;
}

/** Explore / Librarian peek — research subagent analogue before invent/edit. */
export function exploreInventContext(
  files: Record<string, string>,
  brief: string,
): { summary: string; risks: string[]; anchors: string[] } {
  const keys = Object.keys(files || {});
  const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
  const logo = String(files['public/logo.svg'] || '');
  const kit = String(files['.nova/brand-kit.json'] || '');
  const risks: string[] = [];
  const anchors: string[] = [];
  if (!app) risks.push('no App source');
  else anchors.push(`App ${app.length} chars`);
  if (!logo) risks.push('missing public/logo.svg');
  else if (!/data-nova-invent-logo\s*=\s*["']1["']/i.test(logo)) risks.push('logo not invent-locked');
  else anchors.push('invent logo lock');
  if (!kit) risks.push('no brand kit');
  else anchors.push('brand kit present');
  if (!keys.some((k) => /^public\/products\/sku-/i.test(k))) risks.push('no SKU glyphs');
  else anchors.push('SKU glyphs');
  if (!/data-nova-layout-salt/i.test(app)) risks.push('no layout salt');
  const tokens = String(brief || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 4)
    .slice(0, 8);
  const summary = [
    `Explore · ${keys.length} files`,
    tokens.length ? `brief tokens: ${tokens.join(', ')}` : 'brief thin',
    anchors.length ? `ok: ${anchors.join('; ')}` : 'no anchors',
    risks.length ? `risks: ${risks.join('; ')}` : 'no risks',
  ].join(' · ');
  return { summary, risks, anchors };
}

/** Read-only invent Acc code review (Copilot / Claude /code-review analogue). */
export function reviewInventAcc(files: Record<string, string>, brand: string): {
  score: number;
  findings: string[];
  ok: boolean;
} {
  const findings: string[] = [];
  let score = 100;
  const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
  const css = String(files['src/App.css'] || '');
  const logo = String(files['public/logo.svg'] || '');
  if (!/data-nova-invent-demo\s*=\s*["']1["']/i.test(app)) {
    findings.push('Missing invent-demo marker');
    score -= 25;
  }
  if (!/data-nova-invent-logo\s*=\s*["']1["']/i.test(logo)) {
    findings.push('Logo not invent-locked');
    score -= 20;
  }
  if (!/data-nova-layout-salt/i.test(app)) {
    findings.push('No layout salt');
    score -= 10;
  }
  if (!files['.nova/brand-kit.json']) {
    findings.push('No brand kit');
    score -= 15;
  }
  if (!Object.keys(files).some((k) => /^public\/products\/sku-/i.test(k))) {
    findings.push('No per-SKU glyphs');
    score -= 10;
  }
  if (brand && !new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(app)) {
    findings.push('Brand name missing from App');
    score -= 10;
  }
  if (css.length < 400) {
    findings.push('App.css thin');
    score -= 10;
  }
  if (!findings.length) findings.push('Invent Acc looks Ready-shaped');
  return { score: Math.max(0, score), findings, ok: score >= 70 };
}

/** Batch visual edit queue (Bolt-style accumulate then flush). */
export type BatchedVisualEdit = VisualPropPatch & { id: string; at: number };

const BATCH_VISUAL = new Map<string, BatchedVisualEdit[]>();

export function enqueueVisualEdit(projectKey: string, patch: VisualPropPatch): BatchedVisualEdit {
  const key = String(projectKey || 'default');
  const item: BatchedVisualEdit = {
    ...patch,
    id: `ve-${Date.now().toString(36)}`,
    at: Date.now(),
  };
  const list = BATCH_VISUAL.get(key) || [];
  list.push(item);
  BATCH_VISUAL.set(key, list.slice(-20));
  return item;
}

export function flushVisualEditBatch(
  projectKey: string,
  files: Record<string, string>,
): { files: Record<string, string>; count: number; note: string } {
  const key = String(projectKey || 'default');
  const list = BATCH_VISUAL.get(key) || [];
  BATCH_VISUAL.set(key, []);
  let next = { ...files };
  let count = 0;
  for (const patch of list) {
    const r = applyDirectVisualProps(next, patch);
    if (r.applied) {
      next = r.files;
      count += 1;
    }
  }
  return {
    files: next,
    count,
    note: count ? `flushed ${count} visual edits` : 'visual batch empty',
  };
}

/** Next-edit suggestion — propose follow-up after a successful direct visual. */
export function nextEditSuggestion(after: VisualPropPatch): string {
  const sel = after.selector || 'element';
  if (after.props.color && !after.props.background) {
    return `Next edit: set background on ${sel} for contrast`;
  }
  if (after.props.borderRadius) {
    return `Next edit: match padding on ${sel} to new radius`;
  }
  return `Next edit: verify ${sel} on Live, then adjust typography if needed`;
}

const NES_STORE = new Map<string, VisualPropPatch>();

export function stashNextEditSuggestion(projectKey: string, patch: VisualPropPatch): void {
  NES_STORE.set(String(projectKey || 'default'), patch);
}

export function consumeNextEditSuggestion(projectKey: string): VisualPropPatch | null {
  const key = String(projectKey || 'default');
  const hit = NES_STORE.get(key) || null;
  if (hit) NES_STORE.delete(key);
  return hit;
}

/** Build a VisualPropPatch for the stashed NES follow-up. */
export function buildNesFollowUpPatch(prev: VisualPropPatch): VisualPropPatch {
  const sel = prev.selector;
  if (prev.props.color && !prev.props.background) {
    return { selector: sel, props: { background: 'color-mix(in srgb, var(--bg) 92%, var(--fg))' } };
  }
  if (prev.props.borderRadius) {
    return { selector: sel, props: { padding: '0.75rem 1rem' } };
  }
  if (prev.props.background && !prev.props.color) {
    return { selector: sel, props: { color: 'var(--fg)' } };
  }
  return { selector: sel, props: { opacity: '1' } };
}

/** Design-system ingest from package.json deps (v0 DS 2.0 lite). */
export function ingestDesignSystemFromPackageJson(
  packageJsonText: string,
): { files: Record<string, string>; note: string; system: string | null } {
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(packageJsonText || '{}');
  } catch {
    return { files: {}, note: 'invalid package.json', system: null };
  }
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const known: Array<{ id: string; match: RegExp; tokens: Record<string, string> }> = [
    {
      id: 'shadcn-tailwind',
      match: /@radix-ui|class-variance-authority|tailwindcss/i,
      tokens: { radius: '0.5rem', font: 'Inter', surface: 'hsl(0 0% 100%)' },
    },
    {
      id: 'mui',
      match: /@mui\/material/i,
      tokens: { radius: '4px', font: 'Roboto', surface: '#fff' },
    },
    {
      id: 'chakra',
      match: /@chakra-ui\/react/i,
      tokens: { radius: 'md', font: 'system-ui', surface: 'white' },
    },
  ];
  const hit = known.find((k) => Object.keys(deps).some((d) => k.match.test(d)));
  if (!hit) {
    return {
      files: {
        '.nova/design-system.json': `${JSON.stringify({
          version: 1,
          system: null,
          note: 'No known DS deps; invent brand kit remains source of truth.',
        }, null, 2)}\n`,
      },
      note: 'no known DS',
      system: null,
    };
  }
  return {
    files: {
      '.nova/design-system.json': `${JSON.stringify({
        version: 1,
        system: hit.id,
        tokens: hit.tokens,
        deps: Object.keys(deps).filter((d) => hit.match.test(d)).slice(0, 12),
        updatedAt: new Date().toISOString(),
      }, null, 2)}\n`,
      '.nova/design-system.md': `# Design system — ${hit.id}\n\nIngested from package.json. Prefer these tokens when editing invent CSS.\n\n${Object.entries(hit.tokens).map(([k, v]) => `- ${k}: ${v}`).join('\n')}\n`,
    },
    note: `ingested ${hit.id}`,
    system: hit.id,
  };
}

/** Apply chosen invent direction salt into invent-directions.json + App attr when possible. */
export function applyInventDirection(
  files: Record<string, string>,
  salt: number,
): { files: Record<string, string>; applied: boolean; note: string } {
  const next = { ...files };
  const s = Math.abs(Number(salt) || 0) % 4;
  try {
    const raw = next['.nova/invent-directions.json'];
    if (raw) {
      const doc = JSON.parse(raw) as { chosenSalt?: number; directions?: InventDirection[] };
      doc.chosenSalt = s;
      next['.nova/invent-directions.json'] = `${JSON.stringify(doc, null, 2)}\n`;
    }
  } catch { /* optional */ }
  let app = String(next['src/App.jsx'] || next['src/App.tsx'] || '');
  if (/data-nova-layout-salt\s*=\s*["']\d["']/.test(app)) {
    app = app.replace(/data-nova-layout-salt\s*=\s*["']\d["']/, `data-nova-layout-salt="${s}"`);
  } else if (/data-nova-invent-demo\s*=\s*["']1["']/.test(app)) {
    app = app.replace(
      /data-nova-invent-demo\s*=\s*["']1["']/,
      `data-nova-invent-demo="1" data-nova-layout-salt="${s}"`,
    );
  } else {
    return { files: next, applied: Boolean(next['.nova/invent-directions.json']), note: 'direction JSON only' };
  }
  if (next['src/App.jsx']) next['src/App.jsx'] = app;
  else next['src/App.tsx'] = app;
  return { files: next, applied: true, note: `direction salt ${s} applied` };
}

/** Bundle Wave 4 files onto invent Acc. */
export function attachWave4PackFiles(
  files: Record<string, string>,
  opts: { brand: string; brief: string; layoutSalt?: number },
): Record<string, string> {
  const next = { ...files };
  Object.assign(next, brainDirectoryFiles(opts.brand));
  Object.assign(next, inventSkillFiles());
  Object.assign(next, inventDirectionsFiles({
    brand: opts.brand,
    brief: opts.brief,
    chosenSalt: opts.layoutSalt,
  }));
  next['.nova/hooks.json'] = `${JSON.stringify({
    version: 1,
    SessionStart: [
      { matcher: 'startup', action: 'load-steering-brain' },
      { matcher: 'compact', action: 'reload-priorities' },
    ],
    PostWrite: [
      { matcher: 'public/logo.svg', action: 'assert-invent-logo-lock' },
    ],
  }, null, 2)}\n`;
  // Design-system ingest when package.json present.
  if (next['package.json']) {
    Object.assign(next, ingestDesignSystemFromPackageJson(next['package.json']).files);
  } else {
    next['.nova/design-system.json'] = `${JSON.stringify({
      version: 1,
      system: 'invent-brand-kit',
      note: 'No package.json — brand kit is the design system.',
    }, null, 2)}\n`;
  }
  return next;
}
