/**
 * Targeted search/replace patches for the agent loop (prefer over full-file rewrite).
 */

import { agentWritesBlocked } from '@/lib/homeControlRuntime';
import { formatPatchConfidenceChip, scorePatchConfidence } from '@/lib/patchConfidence';

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
  /** 0..100 apply-patch confidence (Missing-tab meter). */
  confidence?: number;
  confidenceLabel?: string;
};

/** Parse TOOL: patch / SEARCH|REPLACE / JSON patch objects. */
export function parseAgentPatches(raw: string, fallbackPath?: string): AgentPatch[] {
  const text = String(raw || '');
  const out: AgentPatch[] = [];

  // JSON patches only from fenced ```json / ``` blocks or TOOL: patch lines — never scrape prose braces.
  const fenceRe = /```(?:json|js|javascript)?\s*\n([\s\S]*?)```/gi;
  let fenceMatch: RegExpExecArray | null;
  while ((fenceMatch = fenceRe.exec(text))) {
    const body = String(fenceMatch[1] || '').trim();
    if (!body.startsWith('{') && !body.startsWith('[')) continue;
    try {
      const obj = JSON.parse(body) as Record<string, unknown>;
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
      if ((obj.tool === 'patch' || obj.search != null || obj.old != null) && (obj.search != null || obj.old != null)) {
        const path = String(obj.path || fallbackPath || '').trim();
        const search = String(obj.search ?? obj.old ?? '');
        const replace = String(obj.replace ?? obj.new ?? '');
        if (path && search) out.push({ path, search, replace });
      }
    } catch {
      /* ignore */
    }
  }

  // Single-line TOOL JSON (no fence)
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!/"tool"\s*:\s*"patch"/i.test(trimmed) || !trimmed.startsWith('{')) continue;
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const path = String(obj.path || fallbackPath || '').trim();
      const search = String(obj.search ?? obj.old ?? '');
      const replace = String(obj.replace ?? obj.new ?? '');
      if (path && search) out.push({ path, search, replace });
    } catch {
      /* ignore */
    }
  }

  // SEARCH / REPLACE blocks — PATH can appear before each pair
  const pairRe = /(?:^\s*PATH:\s*(.+)\s*$\s*)?<<<<<<<\s*SEARCH\s*\n([\s\S]*?)=======\s*\n([\s\S]*?)>>>>>>>\s*REPLACE/gim;
  let m: RegExpExecArray | null;
  let lastPath = text.match(/^\s*PATH:\s*(.+)$/im)?.[1]?.trim() || fallbackPath || '';
  while ((m = pairRe.exec(text))) {
    const pathFromBlock = String(m[1] || '').trim();
    if (pathFromBlock) lastPath = pathFromBlock;
    const path = lastPath || fallbackPath || '';
    if (path) out.push({ path, search: m[2], replace: m[3] });
  }

  // Also accept interleaved PATH: lines before SEARCH:/REPLACE: sections
  const srChunkRe = /(?:PATH:\s*(.+)\s*\n)?SEARCH:\s*\n([\s\S]*?)\nREPLACE:\s*\n([\s\S]*?)(?=\n(?:PATH:|SEARCH:|TOOL:)|$)/gi;
  while ((m = srChunkRe.exec(text))) {
    const pathFromBlock = String(m[1] || '').trim();
    if (pathFromBlock) lastPath = pathFromBlock;
    const path = lastPath || fallbackPath || '';
    if (path && m[2]) {
      out.push({ path, search: m[2].replace(/\n$/, ''), replace: String(m[3] || '').replace(/\n$/, '') });
    }
  }

  // TOOL: patch with fenced old/new
  if (/^\s*TOOL:\s*patch\b/im.test(text) && lastPath) {
    const fences = [...text.matchAll(/```(?:[\w.-]*)?\n([\s\S]*?)```/g)].map(x => x[1]);
    if (fences.length >= 2 && !out.length) {
      out.push({ path: lastPath, search: fences[0], replace: fences[1] });
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
  // Explore / dry-run home controls — no writes while On.
  if (agentWritesBlocked()) {
    return { ok: false, path: String(patch.path || ''), error: 'Writes blocked (Explore / dry-run On)' };
  }
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
  const conf = scorePatchConfidence({
    path,
    search,
    replace: String(patch.replace || ''),
    fileBefore: body,
  });
  const confFields = {
    confidence: conf.score,
    confidenceLabel: formatPatchConfidenceChip(conf),
  };
  if (!search) return { ok: false, path, error: 'Empty search', ...confFields };
  if (!body.includes(search)) {
    // Try normalized line endings
    const normBody = body.replace(/\r\n/g, '\n');
    const normSearch = search.replace(/\r\n/g, '\n');
    if (!normBody.includes(normSearch)) {
      return { ok: false, path, error: 'Search text not found in file', ...confFields };
    }
    const next = (() => {
      const replaceOnce = (hay: string, needle: string, rep: string) => {
        const idx = hay.indexOf(needle);
        if (idx < 0) return hay;
        return hay.slice(0, idx) + rep + hay.slice(idx + needle.length);
      };
      const count = normBody.split(normSearch).length - 1;
      if (count > 1) {
        return null;
      }
      return replaceOnce(normBody, normSearch, String(patch.replace).replace(/\r\n/g, '\n'));
    })();
    if (next == null) {
      return { ok: false, path, error: 'Search text matches multiple places — make the SEARCH block unique', ...confFields };
    }
    return {
      ok: true,
      path,
      content: next,
      diff: buildDiffSnippet(path, normBody, next),
      ...confFields,
    };
  }
  {
    const count = body.split(search).length - 1;
    if (count > 1) {
      return { ok: false, path, error: 'Search text matches multiple places — make the SEARCH block unique', ...confFields };
    }
    const idx = body.indexOf(search);
    const next = body.slice(0, idx) + String(patch.replace) + body.slice(idx + search.length);
    return {
      ok: true,
      path,
      content: next,
      diff: buildDiffSnippet(path, body, next),
      ...confFields,
    };
  }
}

export function applyAgentPatches(
  files: Record<string, string>,
  patches: AgentPatch[],
): { files: Record<string, string>; results: AgentPatchResult[]; updated: string[] } {
  const next = { ...files };
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
