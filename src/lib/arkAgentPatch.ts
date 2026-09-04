/**
 * Targeted search/replace patches for the agent loop (prefer over full-file rewrite).
 */

export type AgentPatch = {
  path: string;
  search: string;
  replace: string;
};

export type AgentPatchResult = {
  ok: boolean;
  path: string;
  content?: string;
  error?: string;
  /** Unified-ish diff snippet for UI. */
  diff?: string;
};

/** Parse TOOL: patch / SEARCH|REPLACE / JSON patch objects. */
export function parseAgentPatches(raw: string, fallbackPath?: string): AgentPatch[] {
  const text = String(raw || '');
  const out: AgentPatch[] = [];

  // JSON: {"tool":"patch","path":"...","search":"...","replace":"..."}
  // or {"patches":[{path,search,replace},...]}
  const jsonBlocks = text.match(/\{[\s\S]*?\}/g) || [];
  for (const block of jsonBlocks) {
    try {
      const obj = JSON.parse(block) as Record<string, unknown>;
      if (Array.isArray(obj.patches)) {
        for (const p of obj.patches) {
          if (!p || typeof p !== 'object') continue;
          const row = p as Record<string, unknown>;
          const path = String(row.path || fallbackPath || '').trim();
          const search = String(row.search ?? row.old ?? '');
          const replace = String(row.replace ?? row.new ?? '');
          if (path && search) out.push({ path, search, replace });
        }
      }
      if ((obj.tool === 'patch' || obj.search != null) && (obj.search != null || obj.old != null)) {
        const path = String(obj.path || fallbackPath || '').trim();
        const search = String(obj.search ?? obj.old ?? '');
        const replace = String(obj.replace ?? obj.new ?? '');
        if (path && search) out.push({ path, search, replace });
      }
    } catch {
      /* ignore */
    }
  }

  // SEARCH / REPLACE blocks
  const pathHint = text.match(/^\s*PATH:\s*(.+)$/im)?.[1]?.trim() || fallbackPath || '';
  const pairRe = /<<<<<<<\s*SEARCH\s*\n([\s\S]*?)=======\s*\n([\s\S]*?)>>>>>>>\s*REPLACE/gi;
  let m: RegExpExecArray | null;
  while ((m = pairRe.exec(text))) {
    if (pathHint) out.push({ path: pathHint, search: m[1], replace: m[2] });
  }

  const srRe = /SEARCH:\s*\n([\s\S]*?)\nREPLACE:\s*\n([\s\S]*?)(?=\nSEARCH:|\nTOOL:|\nPATH:|$)/gi;
  while ((m = srRe.exec(text))) {
    if (pathHint) out.push({ path: pathHint, search: m[1].replace(/\n$/, ''), replace: m[2].replace(/\n$/, '') });
  }

  // TOOL: patch with fenced old/new
  if (/^\s*TOOL:\s*patch\b/im.test(text) && pathHint) {
    const fences = [...text.matchAll(/```(?:[\w.-]*)?\n([\s\S]*?)```/g)].map(x => x[1]);
    if (fences.length >= 2 && !out.length) {
      out.push({ path: pathHint, search: fences[0], replace: fences[1] });
    }
  }

  return out;
}

function buildDiffSnippet(path: string, before: string, after: string): string {
  const a = before.split('\n');
  const b = after.split('\n');
  const lines: string[] = [`--- a/${path}`, `+++ b/${path}`];
  const max = Math.min(40, Math.max(a.length, b.length));
  for (let i = 0; i < max; i++) {
    if (a[i] === b[i]) continue;
    if (a[i] != null) lines.push(`- ${a[i]}`);
    if (b[i] != null) lines.push(`+ ${b[i]}`);
    if (lines.length > 36) {
      lines.push('…');
      break;
    }
  }
  if (lines.length <= 2) {
    lines.push(`@@ changed ${before.length} → ${after.length} chars @@`);
  }
  return lines.join('\n');
}

export function applyAgentPatch(
  files: Record<string, string>,
  patch: AgentPatch,
): AgentPatchResult {
  const want = String(patch.path || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!want) return { ok: false, path: want, error: 'Missing path' };
  const flat = { ...files };
  let path = want;
  let body = flat[want];
  if (body == null) {
    const found = Object.keys(flat).find(k => k.endsWith(`/${want}`) || k === want);
    if (found) {
      path = found;
      body = flat[found];
    }
  }
  if (body == null) return { ok: false, path: want, error: 'File not found' };

  const search = String(patch.search);
  if (!search) return { ok: false, path, error: 'Empty search' };
  if (!body.includes(search)) {
    // Try normalized line endings
    const normBody = body.replace(/\r\n/g, '\n');
    const normSearch = search.replace(/\r\n/g, '\n');
    if (!normBody.includes(normSearch)) {
      return { ok: false, path, error: 'Search text not found in file' };
    }
    const next = normBody.replace(normSearch, String(patch.replace).replace(/\r\n/g, '\n'));
    return {
      ok: true,
      path,
      content: next,
      diff: buildDiffSnippet(path, normBody, next),
    };
  }
  const next = body.replace(search, String(patch.replace));
  return {
    ok: true,
    path,
    content: next,
    diff: buildDiffSnippet(path, body, next),
  };
}

export function applyAgentPatches(
  files: Record<string, string>,
  patches: AgentPatch[],
): { files: Record<string, string>; results: AgentPatchResult[]; updated: string[] } {
  let next = { ...files };
  const results: AgentPatchResult[] = [];
  const updated: string[] = [];
  for (const patch of patches) {
    const res = applyAgentPatch(next, patch);
    results.push(res);
    if (res.ok && res.content != null) {
      next[res.path] = res.content;
      if (!updated.includes(res.path)) updated.push(res.path);
    }
  }
  return { files: next, results, updated };
}
