/**
 * Lightweight inverted index for agent grep on a bound project.
 */

import { filterAgentFiles, isAgentIgnoredPath } from '@/lib/arkAgentRepo';

export type AgentRepoIndex = {
  builtAt: number;
  fileCount: number;
  /** token → relative paths */
  tokens: Map<string, Set<string>>;
  /** path → lowercase content (capped) */
  contents: Map<string, string>;
};

const TOKEN_RE = /[a-zA-Z_][a-zA-Z0-9_]{2,}|[a-zA-Z0-9]{3,}/g;
const MAX_FILE_CHARS = 80_000;

function tokenize(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const m = String(text || '').toLowerCase().match(TOKEN_RE) || [];
  for (const t of m) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length > 2_000) break;
  }
  return out;
}

export function buildAgentRepoIndex(files: Record<string, string>): AgentRepoIndex {
  const flat = filterAgentFiles(files);
  const tokens = new Map<string, Set<string>>();
  const contents = new Map<string, string>();
  for (const [path, body] of Object.entries(flat)) {
    if (isAgentIgnoredPath(path)) continue;
    const text = String(body || '').slice(0, MAX_FILE_CHARS);
    contents.set(path, text.toLowerCase());
    for (const tok of tokenize(text)) {
      let set = tokens.get(tok);
      if (!set) {
        set = new Set();
        tokens.set(tok, set);
      }
      set.add(path);
    }
  }
  return {
    builtAt: Date.now(),
    fileCount: contents.size,
    tokens,
    contents,
  };
}

export type IndexedHit = { path: string; line: number; text: string };

/** Fast path: narrow candidate files via index, then line scan. */
export function searchAgentIndex(
  index: AgentRepoIndex,
  query: string,
  limit = 40,
): { hits: IndexedHit[]; total: number; candidateFiles: number } {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { hits: [], total: 0, candidateFiles: 0 };

  const words = q.split(/\s+/).filter(w => w.length >= 2).slice(0, 6);
  let candidates: Set<string> | null = null;
  for (const w of words) {
    const set = index.tokens.get(w);
    if (!set) {
      candidates = new Set();
      break;
    }
    if (!candidates) candidates = new Set(set);
    else {
      for (const p of [...candidates]) {
        if (!set.has(p)) candidates.delete(p);
      }
    }
  }

  const paths = candidates
    ? [...candidates]
    : [...index.contents.keys()].filter(p => (index.contents.get(p) || '').includes(q));

  const hits: IndexedHit[] = [];
  let total = 0;
  for (const path of paths.sort()) {
    const lower = index.contents.get(path) || '';
    if (!lower.includes(q) && words.some(w => !lower.includes(w))) continue;
    // Need original line text — store only lowercased; re-split lower for line nums
    const lines = lower.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.includes(q) || (words.length > 1 && words.every(w => line.includes(w)));
      if (!match) continue;
      total += 1;
      if (hits.length < limit) {
        hits.push({ path, line: i + 1, text: line.trim().slice(0, 220) });
      }
    }
  }
  return { hits, total, candidateFiles: paths.length };
}

/** Refresh index after file writes. */
export function updateAgentRepoIndex(
  index: AgentRepoIndex,
  path: string,
  content: string,
): AgentRepoIndex {
  const rel = path.replace(/\\/g, '/');
  // Drop old token memberships for this path
  for (const [, set] of index.tokens) set.delete(rel);
  index.contents.delete(rel);
  if (isAgentIgnoredPath(rel)) {
    return { ...index, fileCount: index.contents.size, builtAt: Date.now() };
  }
  const text = String(content || '').slice(0, MAX_FILE_CHARS);
  index.contents.set(rel, text.toLowerCase());
  for (const tok of tokenize(text)) {
    let set = index.tokens.get(tok);
    if (!set) {
      set = new Set();
      index.tokens.set(tok, set);
    }
    set.add(rel);
  }
  return { ...index, fileCount: index.contents.size, builtAt: Date.now() };
}

function indexCacheKey(scope: string): string {
  const s = String(scope || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 120);
  return `NOVA:agent-index:v1:${s || 'default'}`;
}

/** Persist index contents (tokens rebuilt on load). Survives chat reloads. */
export function persistAgentRepoIndex(scope: string, index: AgentRepoIndex): void {
  if (!scope || typeof localStorage === 'undefined') return;
  try {
    const contents: Record<string, string> = {};
    for (const [path, body] of index.contents) {
      contents[path] = body;
      if (Object.keys(contents).length >= 400) break;
    }
    localStorage.setItem(
      indexCacheKey(scope),
      JSON.stringify({ builtAt: index.builtAt, fileCount: index.fileCount, contents }),
    );
  } catch {
    /* quota / private mode */
  }
}

/** Load cached index if it still matches roughly the same file count. */
export function loadPersistedAgentRepoIndex(
  scope: string,
  files: Record<string, string>,
): AgentRepoIndex | null {
  if (!scope || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(indexCacheKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      builtAt?: number;
      fileCount?: number;
      contents?: Record<string, string>;
    };
    if (!parsed?.contents || typeof parsed.contents !== 'object') return null;
    const liveCount = Object.keys(files || {}).length;
    if (typeof parsed.fileCount === 'number' && Math.abs(parsed.fileCount - liveCount) > 40) {
      return null;
    }
    // Rebuild from live files when possible (fresher); else from cache bodies.
    const merged: Record<string, string> = { ...parsed.contents };
    for (const [path, body] of Object.entries(files || {})) {
      if (typeof body === 'string') merged[path] = body;
    }
    return buildAgentRepoIndex(merged);
  } catch {
    return null;
  }
}
