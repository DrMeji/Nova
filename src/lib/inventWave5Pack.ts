/**
 * Wave 5 — fresh rescan vs Claude Code / Cursor / Copilot / Aider / Lovable / Bolt / Replit
 * against post-W4 Nova. Critical gaps: path rules, permission modes, instant grep,
 * architect dual-model, output styles, stylelock, dual-live Acc, /rewind+/undo, advisor.
 */

export type PermissionMode = 'default' | 'plan' | 'auto' | 'brave';

export function permissionModeFiles(mode: PermissionMode = 'auto'): Record<string, string> {
  const modes: Record<PermissionMode, { edit: boolean; shell: boolean; invent: boolean; note: string }> = {
    default: { edit: false, shell: false, invent: false, note: 'Ask before edits/shell/invent hard-go' },
    plan: { edit: false, shell: false, invent: false, note: 'Plan only — no disk writes until approve' },
    auto: { edit: true, shell: true, invent: true, note: 'Common craft commands allowed; review recommended' },
    brave: { edit: true, shell: true, invent: true, note: 'Minimal prompts — use with care' },
  };
  return {
    '.nova/permission-mode.json': `${JSON.stringify({
      version: 1,
      mode,
      ...modes[mode],
      updatedAt: new Date().toISOString(),
    }, null, 2)}\n`,
  };
}

export function parsePermissionMode(ask: string): PermissionMode | null {
  const m = String(ask || '').match(/\bpermission\s+mode\s+(default|plan|auto|brave)\b/i)
    || String(ask || '').match(/^\/(default|plan|auto|brave)\b/i);
  return m ? (m[1].toLowerCase() as PermissionMode) : null;
}

export function inventAllowedInMode(mode: PermissionMode): boolean {
  return mode === 'auto' || mode === 'brave';
}

/** Path-scoped rules (Claude .claude/rules/ analogue). */
export function pathScopedRulesFiles(): Record<string, string> {
  return {
    '.nova/rules/invent-jsx.md': `---
paths: src/App.jsx, src/**/*.jsx
---
# Invent JSX rules
- Keep data-nova-invent-demo="1" and layout salt.
- Never strip catalog / SKU list on color renames.
- Prefer surgical class edits over full App rewrite.
`,
    '.nova/rules/invent-css.md': `---
paths: src/App.css, **/*.css
---
# Invent CSS rules
- Respect brand kit CSS variables (--bg, --fg, --accent).
- Direct visual patches append under /* nova-direct-visual */.
`,
    '.nova/rules/logo-lock.md': `---
paths: public/logo.svg
---
# Logo lock
- Refuse Lucide 24×24 overwrites when data-nova-invent-logo="1".
`,
  };
}

export function loadPathScopedRules(
  files: Record<string, string>,
  openPaths: string[],
): string {
  const chunks: string[] = [];
  for (const [k, body] of Object.entries(files)) {
    if (!k.startsWith('.nova/rules/') || !k.endsWith('.md')) continue;
    const fm = String(body || '').match(/^---\n([\s\S]*?)\n---/);
    const pathsLine = fm?.[1]?.match(/paths:\s*(.+)/i)?.[1] || '';
    const globs = pathsLine.split(',').map((s) => s.trim()).filter(Boolean);
    const hit = !globs.length || openPaths.some((p) => globs.some((g) => pathGlobHit(p, g)));
    if (hit) chunks.push(`### ${k}\n${String(body).replace(/^---[\s\S]*?---\n?/, '').slice(0, 800)}`);
  }
  return chunks.length ? `## Path-scoped rules\n${chunks.join('\n\n')}` : '';
}

function pathGlobHit(path: string, glob: string): boolean {
  const p = path.replace(/\\/g, '/');
  const g = glob.replace(/\\/g, '/');
  if (g.includes('**')) {
    const re = new RegExp('^' + g.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\./g, '\\.') + '$', 'i');
    return re.test(p);
  }
  if (g.includes('*')) {
    const re = new RegExp('^' + g.replace(/\*/g, '[^/]*').replace(/\./g, '\\.') + '$', 'i');
    return re.test(p) || p.endsWith(g.replace(/^\*\//, ''));
  }
  return p === g || p.endsWith('/' + g) || p.includes(g);
}

/** Instant Grep — Acc symbol/path search (Cursor Instant Grep lite). */
export function instantGrepAcc(
  files: Record<string, string>,
  query: string,
  limit = 24,
): Array<{ path: string; line: number; text: string }> {
  const q = String(query || '').trim();
  if (!q || q.length < 2) return [];
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const hits: Array<{ path: string; line: number; text: string }> = [];
  for (const [path, body] of Object.entries(files)) {
    if (path.startsWith('.__') || path.startsWith('.nova/orb')) continue;
    const lines = String(body || '').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i]) || re.test(path)) {
        hits.push({ path, line: i + 1, text: lines[i].trim().slice(0, 160) });
        if (hits.length >= limit) return hits;
      }
    }
  }
  return hits;
}

export function formatInstantGrep(hits: Array<{ path: string; line: number; text: string }>): string {
  if (!hits.length) return 'Instant grep: no hits.';
  return ['Instant grep:', ...hits.map((h) => `- ${h.path}:${h.line} · ${h.text}`)].join('\n');
}

/** Architect dual-model (Aider) — plan then edit prompts. */
export function formatArchitectPair(ask: string, brand: string): { architect: string; editor: string } {
  const a = String(ask || '').trim();
  return {
    architect: [
      `You are the architect for ${brand}. Describe HOW to modify the invent Acc to satisfy the ask.`,
      'Do not write file fences. Numbered steps only. Respect logo lock and brand kit.',
      '',
      a,
    ].join('\n'),
    editor: [
      `You are the editor for ${brand}. Apply the architect plan as surgical file edits.`,
      'Keep data-nova-invent-demo, layout salt, invent logo. Prefer App.css / class edits.',
      '',
      a,
    ].join('\n'),
  };
}

/** Output styles (Claude analogue). */
export type OutputStyle = 'concise' | 'teach' | 'craft' | 'diagram';

export function outputStyleFiles(style: OutputStyle = 'craft'): Record<string, string> {
  const styles: Record<OutputStyle, string> = {
    concise: 'Short replies. Bullets. No preamble.',
    teach: 'Explain why each invent/edit choice matters. Keep brand voice.',
    craft: 'Invent craft voice — decisive, visual, Ready-focused.',
    diagram: 'Lead with a short ASCII structure of the page, then actions.',
  };
  return {
    '.nova/output-style.json': `${JSON.stringify({
      version: 1,
      style,
      instruction: styles[style],
    }, null, 2)}\n`,
  };
}

export function parseOutputStyle(ask: string): OutputStyle | null {
  const m = String(ask || '').match(/\b(?:output\s+style|style)\s+(concise|teach|craft|diagram)\b/i)
    || String(ask || '').match(/^\/style\s+(concise|teach|craft|diagram)\b/i);
  return m ? (m[1].toLowerCase() as OutputStyle) : null;
}

/** Stylelock / brand provenance export pack. */
export function stylelockExportFiles(files: Record<string, string>, brand: string): Record<string, string> {
  let kit: Record<string, unknown> = {};
  try {
    kit = JSON.parse(String(files['.nova/brand-kit.json'] || '{}'));
  } catch { /* empty */ }
  const pack = {
    version: 1,
    brand,
    exportedAt: new Date().toISOString(),
    brandKit: kit,
    logoLocked: /data-nova-invent-logo\s*=\s*["']1["']/i.test(String(files['public/logo.svg'] || '')),
    layoutSalt: String(files['src/App.jsx'] || '').match(/data-nova-layout-salt\s*=\s*["'](\d)["']/)?.[1] || null,
    designSystem: (() => {
      try {
        return JSON.parse(String(files['.nova/design-system.json'] || 'null'));
      } catch {
        return null;
      }
    })(),
  };
  return {
    '.nova/stylelock.json': `${JSON.stringify(pack, null, 2)}\n`,
    '.nova/stylelock.md': `# Stylelock — ${brand}\n\nPortable invent brand provenance. Import into another invent brief to keep look.\n`,
  };
}

/** Dual Live A/B — materialize two direction Acc snapshots (salt N and N+1). */
export function dualLiveAbFiles(opts: {
  brand: string;
  saltA: number;
  saltB: number;
  appA: string;
  appB: string;
}): Record<string, string> {
  return {
    '.nova/dual-live.json': `${JSON.stringify({
      version: 1,
      brand: opts.brand,
      paneA: { salt: opts.saltA, appPath: '.nova/dual-live/A/App.jsx' },
      paneB: { salt: opts.saltB, appPath: '.nova/dual-live/B/App.jsx' },
      note: 'Swap Live to A or B with “show live A” / “show live B” / “use direction”.',
    }, null, 2)}\n`,
    '.nova/dual-live/A/App.jsx': opts.appA,
    '.nova/dual-live/B/App.jsx': opts.appB,
  };
}

/** Advisor — second-model consult prompt (Claude /advisor). */
export function formatAdvisorPrompt(ask: string, context: string): string {
  return [
    'You are the advisor. Do not edit files. Critique the invent plan and list 3 risks + 3 concrete fixes.',
    '',
    `## Ask\n${String(ask || '').slice(0, 1500)}`,
    '',
    `## Context\n${String(context || '').slice(0, 3000)}`,
  ].join('\n');
}

/** Correction → auto-memory line (Claude auto memory). */
export function correctionToMemoryLine(ask: string): string | null {
  const t = String(ask || '');
  if (!/\b(?:don't|dont|never|stop|always|prefer|instead|not\s+that)\b/i.test(t)) return null;
  return t.replace(/\s+/g, ' ').trim().slice(0, 200);
}

/** /map — Aider-style repo map from Acc (signatures lite). */
export function buildRepoMapLite(files: Record<string, string>, limit = 40): string {
  const lines: string[] = ['Repo map:'];
  let n = 0;
  for (const [path, body] of Object.entries(files)) {
    if (!/\.(jsx?|tsx?|css|md|json)$/i.test(path)) continue;
    if (path.startsWith('.nova/dual-live')) continue;
    const sigs = String(body || '').match(
      /\b(?:export\s+(?:default\s+)?(?:function|const|class)|function|const)\s+([A-Za-z_][\w]*)/g,
    ) || [];
    const uniq = [...new Set(sigs.map((s) => s.replace(/^[\s\S]*\s/, '')))].slice(0, 6);
    lines.push(`${path}:`);
    for (const s of uniq) lines.push(`  ${s}`);
    n += 1;
    if (n >= limit) break;
  }
  return lines.join('\n');
}

/** Plugin marketplace manifest for invent genre packs. */
export function inventPluginMarketplaceFiles(): Record<string, string> {
  return {
    '.nova/plugins/marketplace.json': `${JSON.stringify({
      version: 1,
      plugins: [
        { id: 'invent-luggage', name: 'Luggage invent genre', skills: ['premium-pass', 'redesign'] },
        { id: 'invent-speakers', name: 'Speakers invent genre', skills: ['premium-pass'] },
        { id: 'invent-review', name: 'Invent code review', skills: ['code-review'] },
      ],
    }, null, 2)}\n`,
  };
}

/**
 * Subagent fork lite — run explore + review off main turn, return summary only
 * (Claude subagent analogue for invent Acc).
 */
export function runInventSubagentFork(
  files: Record<string, string>,
  brief: string,
  brand: string,
): { summary: string; score: number } {
  // Lazy import avoided — keep self-contained; caller may pass explore/review from wave4.
  const keys = Object.keys(files || {});
  const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
  const logoOk = /data-nova-invent-logo\s*=\s*["']1["']/i.test(String(files['public/logo.svg'] || ''));
  const demoOk = /data-nova-invent-demo\s*=\s*["']1["']/i.test(app);
  let score = 50;
  if (demoOk) score += 20;
  if (logoOk) score += 15;
  if (files['.nova/brand-kit.json']) score += 10;
  if (keys.some((k) => /sku-\d+\.svg$/i.test(k))) score += 5;
  const summary = [
    `Subagent fork · ${keys.length} files`,
    demoOk ? 'invent-demo ok' : 'invent-demo missing',
    logoOk ? 'logo lock ok' : 'logo lock missing',
    `brief ${String(brief || '').slice(0, 40)}…`,
    `brand ${brand}`,
    `score ${score}`,
  ].join(' · ');
  return { summary, score };
}

/** PreToolUse invent gate — block dangerous writes. */
export function preToolUseInventGate(opts: {
  path: string;
  nextContent?: string;
  files: Record<string, string>;
}): { ok: boolean; reason: string } {
  const path = String(opts.path || '').replace(/\\/g, '/');
  if (/public\/logo\.svg$/i.test(path) && opts.nextContent != null) {
    const locked = /data-nova-invent-logo\s*=\s*["']1["']/i.test(String(opts.files['public/logo.svg'] || ''))
      || /data-nova-invent-demo\s*=\s*["']1["']/i.test(String(opts.files['src/App.jsx'] || opts.files['src/App.tsx'] || ''));
    if (locked) {
      const next = String(opts.nextContent);
      if (/viewBox=["']0 0 24 24["']/i.test(next) || /M9\.937 15\.5/i.test(next)) {
        return { ok: false, reason: 'PreToolUse blocked Lucide overwrite of invent logo' };
      }
      if (!/data-nova-invent-logo\s*=\s*["']1["']/i.test(next) && /<svg/i.test(next)) {
        return { ok: false, reason: 'PreToolUse blocked non-invent logo write' };
      }
    }
  }
  return { ok: true, reason: 'allow' };
}

/** Cline-style step approval queue (Plan/Act gate for invent writes). */
export type ApprovalStep = {
  id: string;
  kind: 'write' | 'shell' | 'invent';
  detail: string;
  at: number;
};

const APPROVALS = new Map<string, ApprovalStep[]>();

export function enqueueApproval(
  projectKey: string,
  step: Omit<ApprovalStep, 'id' | 'at'>,
): ApprovalStep {
  const item: ApprovalStep = {
    ...step,
    id: `ap-${Date.now().toString(36)}`,
    at: Date.now(),
  };
  const key = String(projectKey || 'default');
  const list = APPROVALS.get(key) || [];
  list.push(item);
  APPROVALS.set(key, list.slice(-16));
  return item;
}

export function listApprovals(projectKey: string): ApprovalStep[] {
  return [...(APPROVALS.get(String(projectKey || 'default')) || [])];
}

export function approveAll(projectKey: string): number {
  const key = String(projectKey || 'default');
  const n = (APPROVALS.get(key) || []).length;
  APPROVALS.set(key, []);
  return n;
}

/** /diff since last snapshot (Aider analogue). */
const DIFF_SNAP = new Map<string, Record<string, string>>();

export function snapshotForDiff(projectKey: string, files: Record<string, string>): void {
  const slim: Record<string, string> = {};
  for (const [k, v] of Object.entries(files || {})) {
    if (/^src\/|^public\/|^index\.html$|^\.nova\/brand/i.test(k)) {
      slim[k] = String(v || '').slice(0, 80_000);
    }
  }
  DIFF_SNAP.set(String(projectKey || 'default'), slim);
}

export function diffSinceSnapshot(
  projectKey: string,
  files: Record<string, string>,
): string {
  const prev = DIFF_SNAP.get(String(projectKey || 'default')) || {};
  const lines: string[] = ['Diff since last snapshot:'];
  const keys = new Set([...Object.keys(prev), ...Object.keys(files || {})]);
  let n = 0;
  for (const k of keys) {
    if (!/^src\/|^public\/|^index\.html$/i.test(k)) continue;
    const a = prev[k];
    const b = files[k];
    if (a === b) continue;
    if (a == null) lines.push(`+ ${k} (new, ${String(b || '').length} chars)`);
    else if (b == null) lines.push(`- ${k} (removed)`);
    else lines.push(`~ ${k} (${a.length} → ${String(b).length} chars)`);
    n += 1;
    if (n >= 40) break;
  }
  if (n === 0) lines.push('(no changes)');
  return lines.join('\n');
}

/** Share conversation sanitized stub (Devin /share analogue). */
export function shareConversationStub(opts: {
  brand: string;
  turns: Array<{ role: string; text: string }>;
}): Record<string, string> {
  const scrubbed = (opts.turns || []).slice(-12).map((t) => ({
    role: t.role,
    text: String(t.text || '')
      .replace(/(?:sk-|ghp_|xox[baprs]-)[A-Za-z0-9_-]+/g, '[redacted]')
      .slice(0, 1200),
  }));
  return {
    '.nova/share-transcript.json': `${JSON.stringify({
      version: 1,
      brand: opts.brand,
      sharedAt: new Date().toISOString(),
      turns: scrubbed,
      note: 'Sanitized invent transcript — secrets redacted. Attach or export as needed.',
    }, null, 2)}\n`,
  };
}

/** Agents inbox descriptor (Cursor Agents Window / Devin inbox lite). */
export function agentsInboxFiles(brand: string): Record<string, string> {
  return {
    '.nova/agents-inbox.json': `${JSON.stringify({
      version: 1,
      brand,
      agents: [
        { id: 'invent', status: 'ready', kind: 'local' },
        { id: 'review', status: 'idle', kind: 'subagent' },
        { id: 'orb', status: 'ready', kind: 'background' },
      ],
      updatedAt: new Date().toISOString(),
    }, null, 2)}\n`,
  };
}

/** Bundle Wave 5 onto invent Acc. */
export function attachWave5PackFiles(
  files: Record<string, string>,
  opts: { brand: string; brief?: string; permissionMode?: PermissionMode },
): Record<string, string> {
  const next = { ...files };
  Object.assign(next, permissionModeFiles(opts.permissionMode || 'auto'));
  Object.assign(next, pathScopedRulesFiles());
  Object.assign(next, outputStyleFiles('craft'));
  Object.assign(next, stylelockExportFiles(next, opts.brand));
  Object.assign(next, inventPluginMarketplaceFiles());
  Object.assign(next, agentsInboxFiles(opts.brand));

  // Dual Live A/B from current App + salt+1 clone marker.
  const app = String(next['src/App.jsx'] || next['src/App.tsx'] || '');
  const saltA = Number(app.match(/data-nova-layout-salt\s*=\s*["'](\d)["']/)?.[1] || 0) % 4;
  const saltB = (saltA + 1) % 4;
  if (app) {
    const appB = app.replace(
      /data-nova-layout-salt\s*=\s*["']\d["']/,
      `data-nova-layout-salt="${saltB}"`,
    );
    Object.assign(next, dualLiveAbFiles({
      brand: opts.brand,
      saltA,
      saltB,
      appA: app,
      appB: /data-nova-layout-salt/.test(appB) ? appB : app,
    }));
  }
  return next;
}
