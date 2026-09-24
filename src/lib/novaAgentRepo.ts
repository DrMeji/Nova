/**
 * Repo awareness helpers for the Level-B agent loop.
 * Ignore junk, list trees, keep context small.
 */

const IGNORE_DIR_RE = /(^|\/)(node_modules|dist|build|release|\.git|\.next|\.turbo|coverage|out|\.cache|__pycache__|\.venv|venv)(\/|$)/i;
const IGNORE_FILE_RE = /\.(png|jpe?g|gif|webp|ico|bmp|mp4|webm|mov|zip|7z|rar|gz|woff2?|ttf|eot|pdf|exe|dll|so|dylib|map)$/i;
const IGNORE_LOCK_RE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?)(\/|$)/i;

export function isAgentIgnoredPath(rel: string): boolean {
  const p = String(rel || '').replace(/\\/g, '/');
  if (!p || p.endsWith('/')) return true;
  if (IGNORE_DIR_RE.test(p)) return true;
  if (IGNORE_LOCK_RE.test(p)) return true;
  if (IGNORE_FILE_RE.test(p)) return true;
  return false;
}

export function filterAgentFiles(files: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rel, body] of Object.entries(files || {})) {
    if (isAgentIgnoredPath(rel)) continue;
    out[rel.replace(/\\/g, '/')] = body;
  }
  return out;
}

/** Compact tree listing for prompts (paths only). */
export function listAgentTree(
  files: Record<string, string>,
  opts?: { limit?: number; prefix?: string },
): string {
  const limit = opts?.limit ?? 120;
  const prefix = (opts?.prefix || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const paths = Object.keys(filterAgentFiles(files))
    .filter(p => !prefix || p === prefix || p.startsWith(`${prefix}/`))
    .sort((a, b) => a.localeCompare(b));
  if (!paths.length) return '(empty project)';
  const shown = paths.slice(0, limit);
  const extra = paths.length > shown.length ? `\n… +${paths.length - shown.length} more` : '';
  return shown.map(p => `- ${p}`).join('\n') + extra;
}

export function readAgentFile(
  files: Record<string, string>,
  rel: string,
  maxChars = 14_000,
): { ok: boolean; path: string; content?: string; error?: string } {
  const want = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!want) return { ok: false, path: want, error: 'Missing path' };
  if (isAgentIgnoredPath(want)) return { ok: false, path: want, error: 'Path ignored (binary or vendor)' };
  const flat = filterAgentFiles(files);
  let hit = flat[want];
  let path = want;
  if (hit == null) {
    const found = Object.keys(flat).find(k => k.endsWith(`/${want}`) || k === want);
    if (found) {
      hit = flat[found];
      path = found;
    }
  }
  if (hit == null) return { ok: false, path: want, error: 'File not found in workspace' };
  const text = String(hit);
  if (text.length <= maxChars) return { ok: true, path, content: text };
  return {
    ok: true,
    path,
    content: `${text.slice(0, maxChars)}\n\n… [truncated ${text.length - maxChars} chars]`,
  };
}
