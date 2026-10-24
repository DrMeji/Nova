/**
 * Coding-system research pack — how Nova runs code craft vs the field.
 * Orchestra: roles, routing, verify loop, subagent DAG, build/test gates.
 * Attached onto invent Acc; does not replace prior field/wave packs.
 */

export type CodingRole =
  | 'orchestrator'
  | 'planner'
  | 'explorer'
  | 'implementor'
  | 'verifier'
  | 'reviewer'
  | 'healer';

/** Role → model seat map (static routing analogue; dynamic TBD). */
export function codingRoleRosterFiles(brand: string): Record<string, string> {
  return {
    '.nova/coding-roles.json': `${JSON.stringify({
      version: 1,
      brand,
      note: 'Static role routing for invent/edit coding. Seats swap via engineSeatSwap (one GGUF at a time).',
      roles: {
        orchestrator: { seat: 'chat', job: 'Decompose task; assign; synthesize' },
        planner: { seat: 'chat', job: 'Plan/Act invent — no disk until approve' },
        explorer: { seat: 'coder', job: 'Repo map + grep + read-before-edit' },
        implementor: { seat: 'coder', job: 'Multi-file Acc write / surgical patch' },
        verifier: { seat: 'coder', job: 'Build/syntax/Live grade — binary evidence' },
        reviewer: { seat: 'chat', job: 'Different-family critique when available' },
        healer: { seat: 'coder', job: 'Repair from verifier failures' },
      },
      ensembleParkedDefault: true,
      sequentialSeatSwap: true,
      concurrentMultiModel: false,
    }, null, 2)}\n`,
    '.nova/coding-roles.md': `# Coding roles — ${brand}

| Role | Seat | Job |
|------|------|-----|
| Orchestrator | chat | Decompose + synthesize |
| Planner | chat | Plan before write |
| Explorer | coder | Map / grep / read |
| Implementor | coder | Acc writes |
| Verifier | coder | Build / Live / syntax |
| Reviewer | chat | Independent critique |
| Healer | coder | Fix from evidence |

Nova default: **one model loaded at a time** (seat swap). Ensemble multi-hop exists but Auto is parked.
`,
  };
}

/** Plan → execute → verify → repair coding loop descriptor. */
export function codingLoopFiles(brand: string): Record<string, string> {
  return {
    '.nova/coding-loop.json': `${JSON.stringify({
      version: 1,
      brand,
      loop: ['plan', 'explore', 'implement', 'verify', 'review', 'heal', 'done'],
      doneRequires: ['syntax-ok', 'live-grade-or-syntax-gate', 'secret-preflight'],
      caps: { maxHealRounds: 3, maxToolStreak: 8 },
      evidenceOverClaims: true,
      note: 'Industry orchestra: exit codes and Live/tests override model self-grades.',
    }, null, 2)}\n`,
    '.nova/coding-loop.md': `# Coding loop — ${brand}

1. **Plan** — inventNeedsPlanApprove / Plan mode
2. **Explore** — repo map + instant grep + read-before-edit
3. **Implement** — Acc multi-file or surgical patch
4. **Verify** — syntax gate · Live grade · secret preflight
5. **Review** — pr-review / oracle orb (prefer different seat)
6. **Heal** — repair from evidence (max 3)
7. **Done** — Ready only with evidence
`,
  };
}

/** Subagent DAG + file-lock notes (Addy orchestra / Claude coordinator). */
export function codingOrchestraFiles(brand: string): Record<string, string> {
  return {
    '.nova/coding-orchestra.json': `${JSON.stringify({
      version: 1,
      brand,
      pattern: 'coordinator-worker',
      parallelIndependent: false,
      peerMessaging: false,
      sharedTaskList: true,
      fileLocks: 'soft-dont-touch',
      worktreeIsolation: 'worktree.json + worktreeinclude',
      workers: [
        { id: 'data-layer', dependsOn: [], report: '.nova/agent-memory/oracle/MEMORY.md' },
        { id: 'ui-craft', dependsOn: ['data-layer'], report: '.nova/seo-audit.md' },
        { id: 'verify', dependsOn: ['ui-craft'], report: '.nova/secret-preflight.md' },
      ],
      missingVsField: [
        'true parallel workers',
        'typed mailbox between agents',
        'dynamic model router with outcome memory',
        'LSP diagnostics streamed into every edit',
      ],
    }, null, 2)}\n`,
  };
}

/** Build / test / lint invent verify toolkit (what runs after code edits). */
export function codingVerifyToolkitFiles(brand: string): Record<string, string> {
  return {
    '.nova/coding-verify.json': `${JSON.stringify({
      version: 1,
      brand,
      tools: {
        syntaxGate: true,
        liveGrade: true,
        secretPreflight: true,
        seoAudit: true,
        typecheck: 'partial',
        eslint: 'partial',
        unitTests: 'weak',
        e2ePlaywright: 'partial-smoke',
        lspStream: 'missing',
      },
      binaryEvidence: ['syntaxGate', 'liveGrade', 'secretPreflight'],
    }, null, 2)}\n`,
  };
}

/** Model routing policy — static vs dynamic vs hybrid (field research). */
export function codingModelRoutingFiles(brand: string): Record<string, string> {
  return {
    '.nova/coding-routing.json': `${JSON.stringify({
      version: 1,
      brand,
      approach: 'static-role + sequential seat swap',
      fieldApproaches: {
        static: 'Claude subagent model field; Nova coding-roles.json',
        dynamic: 'RouteLLM / ACRouter complexity — Nova missing',
        hybrid: 'Frontier plan → cheap implement — Nova ensemble when unparked',
      },
      nova: {
        engineSeatSwap: true,
        createEnsemble: true,
        ensembleAutoParkedDefault: true,
        concurrentLoad: false,
        outcomeMemoryRouter: true,
        outcomeMemoryNote: 'coding-outcomes.json + suggestCodingSeat',
        diagnosticsLite: true,
        editPolicyAcc: true,
      },
      nextGaps: [
        'Per-role model id in coding-roles (user-assignable)',
        'Wire suggestCodingSeat into every ensemble hop',
        'Optional unpark ensemble for plan→craft→critic',
        'Reviewer seat forced different family when 2+ Ready',
        'True LSP stream (not Acc diagnostics lite)',
      ],
    }, null, 2)}\n`,
    '.nova/coding-routing.md': `# Coding model routing — ${brand}

**Field:** static (role→model), dynamic (complexity router), hybrid (frontier plan + cheap doer).

**Nova today:** sequential specialty seat swap; createEnsemble multi-hop exists but Auto parked; no ACRouter-style outcome memory.

**Missing:** parallel agents, dynamic router, LSP-in-loop, peer agent mailbox.
`,
  };
}

/** Edit-format policy (Codex patch / Claude Edit / Aider SEARCH_REPLACE / Acc write). */
export function codingEditPolicyFiles(brand: string): Record<string, string> {
  return {
    '.nova/coding-edit-policy.json': `${JSON.stringify({
      version: 1,
      brand,
      preferred: ['surgical-patch', 'acc-path-write'],
      formats: {
        accWrite: { status: 'strong', note: '@@@FILE / create Acc' },
        surgicalPatch: { status: 'strong', note: 'novaAgentPatch' },
        searchReplace: { status: 'partial', note: 'not first-class Aider blocks' },
        applyPatchDsl: { status: 'missing', note: 'Codex apply_patch DSL not ported' },
        wholeFileRewrite: { status: 'strong', note: 'invent Acc rewrite when needed' },
      },
      rules: [
        'Prefer surgical patch over whole-file when Live mounted',
        'Read-before-edit required for patches',
        'No shell sed/echo for file edits — Acc/patch only',
      ],
    }, null, 2)}\n`,
  };
}

/** Typed coding tool catalog (Claude tools-reference analogue). */
export function codingToolCatalogFiles(brand: string): Record<string, string> {
  return {
    '.nova/coding-tools.json': `${JSON.stringify({
      version: 1,
      brand,
      tools: [
        { id: 'Read', permission: 'free', status: 'strong' },
        { id: 'Grep', permission: 'free', status: 'strong' },
        { id: 'Glob', permission: 'free', status: 'partial' },
        { id: 'WriteAcc', permission: 'auto-root', status: 'strong' },
        { id: 'Patch', permission: 'auto-root', status: 'strong' },
        { id: 'Shell', permission: 'ask', status: 'strong' },
        { id: 'Verify', permission: 'free', status: 'partial' },
        { id: 'Symbols', permission: 'free', status: 'missing' },
        { id: 'LSP', permission: 'free', status: 'missing' },
        { id: 'Subagent', permission: 'ask', status: 'partial' },
      ],
    }, null, 2)}\n`,
  };
}

export type CodingSeatOutcome = {
  role: CodingRole | string;
  modelId: string;
  ok: boolean;
  evidence?: string;
  at?: string;
};

/** Outcome memory for seat routing (ACRouter-lite). */
export function loadCodingOutcomes(files: Record<string, string>): CodingSeatOutcome[] {
  try {
    const raw = JSON.parse(String(files['.nova/coding-outcomes.json'] || '{}')) as {
      outcomes?: CodingSeatOutcome[];
    };
    return Array.isArray(raw.outcomes) ? raw.outcomes : [];
  } catch {
    return [];
  }
}

export function recordCodingSeatOutcome(
  files: Record<string, string>,
  outcome: CodingSeatOutcome,
): Record<string, string> {
  const prev = loadCodingOutcomes(files);
  const nextOutcomes = [
    ...prev,
    {
      ...outcome,
      at: outcome.at || new Date().toISOString(),
    },
  ].slice(-40);
  return {
    '.nova/coding-outcomes.json': `${JSON.stringify({
      version: 1,
      outcomes: nextOutcomes,
      note: 'ACRouter-lite — verified seat outcomes for future routing',
    }, null, 2)}\n`,
  };
}

/** Prefer modelIds that succeeded for role; else first ready. */
export function suggestCodingSeat(
  files: Record<string, string>,
  role: CodingRole | string,
  readyIds: string[],
): string | null {
  const ids = (readyIds || []).map((s) => String(s || '').trim()).filter(Boolean);
  if (!ids.length) return null;
  const outcomes = loadCodingOutcomes(files).filter((o) => o.role === role);
  const scored = new Map<string, number>();
  for (const id of ids) scored.set(id, 0);
  for (const o of outcomes) {
    if (!scored.has(o.modelId)) continue;
    scored.set(o.modelId, (scored.get(o.modelId) || 0) + (o.ok ? 2 : -1));
  }
  let best = ids[0];
  let bestScore = scored.get(best) ?? 0;
  for (const id of ids) {
    const s = scored.get(id) ?? 0;
    if (s > bestScore) {
      best = id;
      bestScore = s;
    }
  }
  return best;
}

/** Static Acc diagnostics lite (LSP stream stand-in). */
export function codingDiagnosticsLite(files: Record<string, string>): {
  issues: Array<{ path: string; severity: 'error' | 'warning'; message: string }>;
  ok: boolean;
} {
  const issues: Array<{ path: string; severity: 'error' | 'warning'; message: string }> = [];
  for (const [path, body] of Object.entries(files || {})) {
    if (!/\.(jsx?|tsx?|css|json)$/i.test(path)) continue;
    if (path.startsWith('.__') || path.startsWith('.nova/')) continue;
    const text = String(body || '');
    if (/\.jsx$/i.test(path) && /:\s*React\.FC\b|as\s+const\b|interface\s+\w+/i.test(text)) {
      issues.push({ path, severity: 'error', message: 'TypeScript syntax in .jsx (Vite Live crash risk)' });
    }
    if (/<<<<<<|>>>>>>|=======/.test(text)) {
      issues.push({ path, severity: 'error', message: 'Merge conflict markers' });
    }
    if (/\bTODO\b|\bFIXME\b/.test(text) && /src\//i.test(path)) {
      issues.push({ path, severity: 'warning', message: 'TODO/FIXME left in source' });
    }
    if (/sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}/.test(text)) {
      issues.push({ path, severity: 'error', message: 'Possible secret in source' });
    }
  }
  return { issues, ok: !issues.some((i) => i.severity === 'error') };
}

export function codingDiagnosticsFiles(
  scan: ReturnType<typeof codingDiagnosticsLite>,
): Record<string, string> {
  return {
    '.nova/coding-diagnostics.json': `${JSON.stringify({
      version: 1,
      ok: scan.ok,
      issues: scan.issues,
      note: 'LSP-lite Acc scan — not a language server stream',
      scannedAt: new Date().toISOString(),
    }, null, 2)}\n`,
  };
}

/** Greenfield coding product kinds Nova invents (websites / apps — games TBD). */
export function codingProductKindsFiles(brand: string): Record<string, string> {
  return {
    '.nova/coding-product-kinds.json': `${JSON.stringify({
      version: 1,
      brand,
      kinds: {
        website: { stack: 'Vite+React', status: 'strong' },
        storefront: { stack: 'Vite+React+SKU Acc', status: 'strong' },
        spaApp: { stack: 'Vite+React', status: 'strong' },
        fullstack: { stack: 'scaffold stub', status: 'partial' },
        game: { stack: 'not productized', status: 'missing' },
        mobileNative: { stack: 'weak Expo path', status: 'weak' },
        cliTool: { status: 'weak' },
        libraryPackage: { status: 'weak' },
      },
    }, null, 2)}\n`,
  };
}

/** Bundle coding research pack onto Acc. */
export function attachCodingPackFiles(
  files: Record<string, string>,
  opts: { brand: string },
): Record<string, string> {
  const next = { ...files };
  Object.assign(next, codingRoleRosterFiles(opts.brand));
  Object.assign(next, codingLoopFiles(opts.brand));
  Object.assign(next, codingOrchestraFiles(opts.brand));
  Object.assign(next, codingVerifyToolkitFiles(opts.brand));
  Object.assign(next, codingModelRoutingFiles(opts.brand));
  Object.assign(next, codingProductKindsFiles(opts.brand));
  Object.assign(next, codingEditPolicyFiles(opts.brand));
  Object.assign(next, codingToolCatalogFiles(opts.brand));
  if (!next['.nova/coding-outcomes.json']) {
    Object.assign(next, {
      '.nova/coding-outcomes.json': `${JSON.stringify({ version: 1, outcomes: [], note: 'Fill via recordCodingSeatOutcome' }, null, 2)}\n`,
    });
  }
  const diag = codingDiagnosticsLite(next);
  Object.assign(next, codingDiagnosticsFiles(diag));
  return next;
}
