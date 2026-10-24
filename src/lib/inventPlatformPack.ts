/**
 * Wave 3 platform pack — sandbox presets, terminal allow/deny, ACP registry,
 * ghost autocomplete hints, remote continue marker, orb/daemon stub, CI auto,
 * local full-stack scaffold, Figma import brief.
 */

export type SandboxPreset = 'safe' | 'auto' | 'brave';

export type TerminalPolicy = {
  preset: SandboxPreset;
  allow: string[];
  deny: string[];
};

const DEFAULT_DENY = [
  'rm -rf /',
  'format ',
  'mkfs',
  'del /f /s /q',
  'Shutdown',
  'reg delete',
];

const DEFAULT_ALLOW = [
  'npm ',
  'npx ',
  'node ',
  'git ',
  'vite',
  'eslint',
  'tsc',
];

export function defaultTerminalPolicy(preset: SandboxPreset = 'auto'): TerminalPolicy {
  return {
    preset,
    allow: [...DEFAULT_ALLOW],
    deny: [...DEFAULT_DENY],
  };
}

export function terminalPolicyFiles(policy: TerminalPolicy): Record<string, string> {
  return {
    '.nova/sandbox.json': `${JSON.stringify({
      version: 1,
      preset: policy.preset,
      network: policy.preset === 'brave',
      workspaceWrite: policy.preset !== 'safe',
    }, null, 2)}\n`,
    '.nova/terminal-policy.json': `${JSON.stringify(policy, null, 2)}\n`,
  };
}

/** Enforce allow/deny before shell runs. */
export function shellCommandAllowed(
  command: string,
  policy: TerminalPolicy = defaultTerminalPolicy(),
): { ok: boolean; reason: string } {
  const c = String(command || '').trim();
  if (!c) return { ok: false, reason: 'empty command' };
  const low = c.toLowerCase();
  for (const d of policy.deny) {
    if (low.includes(String(d).toLowerCase())) {
      return { ok: false, reason: `denied by policy: ${d}` };
    }
  }
  if (policy.preset === 'brave') return { ok: true, reason: 'brave' };
  if (policy.preset === 'safe') {
    const hit = policy.allow.some((a) => low.startsWith(String(a).toLowerCase()) || low.includes(String(a).toLowerCase()));
    return hit ? { ok: true, reason: 'safe allow' } : { ok: false, reason: 'safe preset — command not allowlisted' };
  }
  // auto: allow common craft commands; ask conceptually for others (caller may prompt)
  const hit = policy.allow.some((a) => low.includes(String(a).toLowerCase()));
  return hit ? { ok: true, reason: 'auto allow' } : { ok: true, reason: 'auto (review recommended)' };
}

export type AcpAgentEntry = {
  id: string;
  name: string;
  command: string;
  args: string[];
};

/** Nova ACP host registry — external agents that can be spawned. */
export function defaultAcpRegistry(): AcpAgentEntry[] {
  return [
    { id: 'opencode', name: 'OpenCode', command: 'opencode', args: ['acp'] },
    { id: 'codex', name: 'Codex CLI', command: 'codex', args: ['acp'] },
    { id: 'claude', name: 'Claude Agent', command: 'claude-agent-acp', args: [] },
    { id: 'poolside', name: 'Poolside', command: 'pool', args: ['acp'] },
  ];
}

export function acpRegistryFiles(): Record<string, string> {
  return {
    '.nova/acp-registry.json': `${JSON.stringify({ version: 1, agents: defaultAcpRegistry() }, null, 2)}\n`,
  };
}

/** Ghost autocomplete context — recent symbols from App for Code editor. */
export function ghostAutocompleteHints(appSrc: string, limit = 40): string[] {
  const src = String(appSrc || '');
  const hints = new Set<string>();
  for (const m of src.matchAll(/\b(?:const|let|function|class)\s+([A-Za-z_][A-Za-z0-9_]*)/g)) {
    hints.add(m[1]);
  }
  for (const m of src.matchAll(/className=["']([^"']+)["']/g)) {
    for (const part of m[1].split(/\s+/)) if (part.length > 2) hints.add(part);
  }
  return [...hints].slice(0, limit);
}

export function ghostHintsFile(hints: string[]): Record<string, string> {
  return {
    '.nova/ghost-hints.json': `${JSON.stringify({ version: 1, hints }, null, 2)}\n`,
  };
}

/** Remote continue — persist session handoff marker for phone/web resume. */
export function remoteContinueFiles(opts: {
  chatId: string;
  brand: string;
  diskRoot: string;
}): Record<string, string> {
  return {
    '.nova/remote-continue.json': `${JSON.stringify({
      version: 1,
      chatId: opts.chatId,
      brand: opts.brand,
      diskRoot: opts.diskRoot,
      updatedAt: new Date().toISOString(),
      note: 'Open Nova on another device signed into the same account to resume this invent session.',
    }, null, 2)}\n`,
  };
}

/** Local orb/daemon job stub — background invent runner descriptor. */
export function inventOrbJobFiles(opts: {
  brand: string;
  brief: string;
}): Record<string, string> {
  return {
    '.nova/orb-job.json': `${JSON.stringify({
      version: 1,
      kind: 'invent-background',
      brand: opts.brand,
      brief: String(opts.brief || '').slice(0, 2000),
      status: 'ready',
      runner: 'local-daemon',
      createdAt: new Date().toISOString(),
    }, null, 2)}\n`,
  };
}

/** CI / headless auto path descriptor. */
export function ciAutoFiles(): Record<string, string> {
  return {
    '.nova/ci-auto.md': `# Nova CI auto

Run headless invent/repair:

\`\`\`bash
npx --yes nova-ci-auto --auto "run tests and heal Live"
\`\`\`

Or from repo scripts when wired: \`npm run nova:auto\`.
`,
    'scripts/nova-auto.mjs': `#!/usr/bin/env node
/**
 * Nova headless auto — non-interactive craft driver stub.
 * Exit 0 when project has invent-demo + logo lock; else exit 1.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const app = [path.join(root, 'src/App.jsx'), path.join(root, 'src/App.tsx')]
  .map((p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''))
  .join('\\n');
const logo = path.join(root, 'public/logo.svg');
const ok = /data-nova-invent-demo\\s*=\\s*["']1["']/.test(app)
  && fs.existsSync(logo)
  && /data-nova-invent-logo\\s*=\\s*["']1["']/.test(fs.readFileSync(logo, 'utf8'));
console.log(ok ? 'nova-auto: invent Ready signals present' : 'nova-auto: invent signals missing');
process.exit(ok ? 0 : 1);
`,
  };
}

/** Local full-stack scaffold (auth/DB lane without hosted lock-in). */
export function localFullstackScaffoldFiles(brand: string): Record<string, string> {
  return {
    '.nova/fullstack.md': `# Full-stack lane — ${brand}

Nova stays local-first. Optional scaffold:

1. \`npm i firebase\` or \`npm i @supabase/supabase-js\`
2. Copy \`.nova/env.example\` to \`.env.local\`
3. Wire Auth + Firestore/Postgres from invent chat: "add local supabase auth"

This marks the deploy/auth capability as first-class without forcing a hosted SaaS.
`,
    '.nova/env.example': `VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_PROJECT_ID=
`,
  };
}

/** Figma / design import → invent brief adapter. */
export function figmaImportBrief(opts: {
  frameName?: string;
  notes?: string;
  tokens?: Record<string, string>;
}): string {
  const frame = String(opts.frameName || 'Frame').trim();
  const notes = String(opts.notes || '').trim();
  const tokenLines = Object.entries(opts.tokens || {})
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');
  return [
    `Invent from design import: ${frame}`,
    notes && `Designer notes: ${notes}`,
    tokenLines && `Design tokens:\n${tokenLines}`,
    'Respect .nova/brand-kit.json. Keep invent logo lock. Prefer layout salt uniqueness.',
  ].filter(Boolean).join('\n\n');
}

export function figmaImportFiles(brief: string): Record<string, string> {
  return {
    '.nova/figma-import.md': `# Figma / design import\n\n${brief}\n`,
  };
}

/** Bundle platform files onto invent Acc. */
export function attachPlatformPackFiles(
  files: Record<string, string>,
  opts: { brand: string; brief: string; chatId?: string; diskRoot?: string; appSrc?: string },
): Record<string, string> {
  const next = { ...files };
  Object.assign(next, terminalPolicyFiles(defaultTerminalPolicy('auto')));
  Object.assign(next, acpRegistryFiles());
  Object.assign(next, ghostHintsFile(ghostAutocompleteHints(opts.appSrc || String(files['src/App.jsx'] || ''))));
  Object.assign(next, remoteContinueFiles({
    chatId: opts.chatId || 'local',
    brand: opts.brand,
    diskRoot: opts.diskRoot || '',
  }));
  Object.assign(next, inventOrbJobFiles({ brand: opts.brand, brief: opts.brief }));
  Object.assign(next, ciAutoFiles());
  Object.assign(next, localFullstackScaffoldFiles(opts.brand));
  Object.assign(next, figmaImportFiles(figmaImportBrief({ frameName: opts.brand, notes: opts.brief.slice(0, 400) })));
  return next;
}
