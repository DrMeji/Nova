/** Block agent file writes outside the project sandbox when enabled. */

const BLOCKED_SEGMENTS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'out',
  '.next',
  'coverage',
  '.cache',
  '.turbo',
  '.venv',
  'venv',
  '__pycache__',
  'target',
  'vendor',
  'Pods',
  '.gradle',
  '.idea',
  '.vscode',
]);

function normalizeRel(raw: string): string {
  return String(raw || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^\.\//, '');
}

export function isSandboxBlockedPath(relPath: string): boolean {
  const rel = normalizeRel(relPath);
  if (!rel || rel.includes('..')) return true;
  if (/^[a-zA-Z]:[/\\]/.test(rel) || rel.startsWith('//')) return true;

  const base = rel.split('/').pop() || rel;
  if (/^\.env($|\.)/i.test(base) && !/\.example$/i.test(base)) return true;
  if (/^(package-lock|yarn\.lock|pnpm-lock)/i.test(base)) return true;

  const parts = rel.split('/').filter(Boolean);
  for (const part of parts) {
    if (BLOCKED_SEGMENTS.has(part.toLowerCase())) return true;
  }
  return false;
}

export function filterSandboxWrites(files: Record<string, string>) {
  const allowed: Record<string, string> = {};
  const blocked: string[] = [];
  for (const [path, content] of Object.entries(files || {})) {
    if (isSandboxBlockedPath(path)) blocked.push(path);
    else allowed[path] = content;
  }
  return { allowed, blocked };
}
