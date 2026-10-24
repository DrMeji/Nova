/**
 * Round 7–10 harness finds — implement now, map on canvas.
 * Sources: harness design empirics (elision→summarize), HAR isolate/verify,
 * SWE-Bench Pro V2 network-restricted grading, skills>MCP adoption,
 * Omnigent meta-harness, rule-based context staging.
 */

/** R7: Stage rule-based context elision BEFORE LLM summarization. */
export function stageContextElision(
  chunks: { id: string; text: string; keep?: boolean }[],
  budgetChars: number,
): { kept: string[]; elided: string[]; summaryHint: string } {
  const ranked = [...chunks].sort((a, b) => {
    const ak = a.keep ? 1 : 0;
    const bk = b.keep ? 1 : 0;
    return bk - ak || b.text.length - a.text.length;
  });
  const kept: string[] = [];
  const elided: string[] = [];
  let used = 0;
  for (const c of ranked) {
    if (c.keep || used + c.text.length <= budgetChars) {
      kept.push(c.text);
      used += c.text.length;
    } else {
      elided.push(`[elided:${c.id} ${c.text.length}B]`);
    }
  }
  return {
    kept,
    elided,
    summaryHint: elided.length
      ? `Elided ${elided.length} chunks before any LLM summarize. Do not re-expand unless asked.`
      : 'Within budget — no elision',
  };
}

/** R7: HAR-style discover → isolate → verify contract for a project. */
export type HarContract = {
  stack: string;
  scripts: string[];
  checks: string[];
  isolateHint: string;
};

export function discoverHarContract(files: Record<string, string>): HarContract {
  const pkg = String(files['package.json'] || '');
  let scripts: string[] = [];
  try {
    const j = JSON.parse(pkg || '{}') as { scripts?: Record<string, string> };
    scripts = Object.keys(j.scripts || {}).slice(0, 12);
  } catch {
    scripts = [];
  }
  const stack = /react/i.test(pkg) ? 'react-vite' : /next/i.test(pkg) ? 'next' : 'web';
  const checks = [
    scripts.includes('build') ? 'npm run build' : '',
    scripts.includes('test') ? 'npm test' : '',
    scripts.includes('lint') ? 'npm run lint' : '',
    'Live mount + console clean',
    'binary rubric Accept',
  ].filter(Boolean);
  return {
    stack,
    scripts,
    checks,
    isolateHint: '.nova/worktrees/<agentId>',
  };
}

export function formatHarContract(c: HarContract): string {
  return [
    '## HAR contract (discover)',
    `- stack: ${c.stack}`,
    `- scripts: ${c.scripts.join(', ') || '(none)'}`,
    `- checks: ${c.checks.join(' · ')}`,
    `- isolate: ${c.isolateHint}`,
  ].join('\n');
}

/** R8: Network-restricted verify — only model endpoint + allowlist (SWE-Bench Pro V2 lesson). */
export function verifyNetworkPolicy(
  attemptedHosts: string[],
  allowlist: string[],
): { ok: boolean; blocked: string[] } {
  const blocked = attemptedHosts.filter((h) => {
    const host = h.toLowerCase();
    return !allowlist.some((a) => host === a || host.endsWith(`.${a}`));
  });
  return { ok: blocked.length === 0, blocked };
}

/** R8: Empty patch must fail; reference-shaped invent must pass (grader sanity). */
export function emptyPatchMustFail(files: Record<string, string>): boolean {
  const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '').trim();
  return app.length < 200;
}

/** R9: Skills-first over dumping full MCP schemas (harness engineering paper). */
export function formatSkillsFirstToolSurface(opts: {
  skills: string[];
  mcpNames: string[];
}): string {
  return [
    '## Skills (load on demand)',
    ...(opts.skills.slice(0, 12).map((s) => `- SKILL: ${s}`)),
    '',
    '## MCP (names only — fetch schema when calling)',
    ...(opts.mcpNames.slice(0, 16).map((n) => `- MCP: ${n}`)),
    opts.mcpNames.length ? '' : '- (none)',
  ].join('\n');
}

/** R9: Meta-harness router — pick backend by task class. */
export type MetaBackend = 'nova-loop' | 'invent-first' | 'surgical-edit' | 'verify-only';

export function routeMetaHarness(ask: string): MetaBackend {
  const t = String(ask || '');
  if (/\b(?:background|bg|color|colour|rename|font)\b/i.test(t) && t.length < 220) return 'surgical-edit';
  if (/\b(?:create|build|scaffold|new\s+website)\b/i.test(t)) return 'invent-first';
  if (/\b(?:verify|ready|live|smoke|fix)\b/i.test(t) && !/\bcreate\b/i.test(t)) return 'verify-only';
  return 'nova-loop';
}

/** R10: Deterministic retrieval only — no vector embeddings required. */
export function deterministicRepoHits(
  files: Record<string, string>,
  query: string,
  limit = 8,
): { path: string; snippet: string }[] {
  const q = String(query || '').toLowerCase().split(/\s+/).filter((w) => w.length > 2).slice(0, 6);
  if (!q.length) return [];
  const hits: { path: string; score: number; snippet: string }[] = [];
  for (const [path, body] of Object.entries(files || {})) {
    if (!/\.(jsx?|tsx?|css|md|json)$/i.test(path)) continue;
    const lower = body.toLowerCase();
    let score = 0;
    for (const term of q) {
      if (path.toLowerCase().includes(term)) score += 3;
      const n = lower.split(term).length - 1;
      score += Math.min(5, n);
    }
    if (score > 0) {
      const idx = lower.indexOf(q[0]);
      const snippet = body.slice(Math.max(0, idx - 40), idx + 120).replace(/\s+/g, ' ');
      hits.push({ path, score, snippet });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit).map(({ path, snippet }) => ({ path, snippet }));
}

/** R10: Trajectory stop policy — planning saves cost for strong models. */
export function shouldStopTrajectory(opts: {
  steps: number;
  maxSteps: number;
  verifyPass: boolean;
  idleSteps: number;
}): { stop: boolean; reason: string } {
  if (opts.verifyPass) return { stop: true, reason: 'verify pass' };
  if (opts.idleSteps >= 3) return { stop: true, reason: 'idle doom' };
  if (opts.steps >= opts.maxSteps) return { stop: true, reason: 'max steps' };
  return { stop: false, reason: 'continue' };
}

export const R7R10_PACK = {
  contextElisionStaging: true,
  harDiscoverIsolateVerify: true,
  networkRestrictedVerify: true,
  emptyPatchMustFail: true,
  skillsFirstToolSurface: true,
  metaHarnessRouter: true,
  deterministicRetrieval: true,
  trajectoryStopPolicy: true,
} as const;

export function r7r10GapStatus(): Record<keyof typeof R7R10_PACK, 'Have'> {
  const out = {} as Record<keyof typeof R7R10_PACK, 'Have'>;
  for (const k of Object.keys(R7R10_PACK) as (keyof typeof R7R10_PACK)[]) out[k] = 'Have';
  return out;
}

export function r7r10Enabled(): boolean {
  return R7R10_PACK.contextElisionStaging === true;
}
