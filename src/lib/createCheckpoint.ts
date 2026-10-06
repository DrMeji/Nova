/**
 * Create checkpoints — persist per project so "rollback" works after the turn ends.
 * Shadow-git style snapshots (Cline pattern) without requiring a real git repo.
 */

export type CreateCheckpoint = {
  at: number;
  productName: string;
  label: string;
  diskRoot?: string | null;
  files: Record<string, string>;
};

const KEY_RE = /^(?:src\/App\.(?:jsx|tsx)|src\/App\.css|index\.html|package\.json|src\/main\.(?:jsx|tsx)|src\/index\.css|vite\.config\.(?:js|ts))$/i;
const STORE_PREFIX = 'nova-create-checkpoint:';
const MAX_STACK = 6;

function storageKey(diskRoot: string): string {
  return `${STORE_PREFIX}${diskRoot.replace(/\\/g, '/').toLowerCase()}`;
}

function slimFiles(files: Record<string, string>): Record<string, string> {
  const slim: Record<string, string> = {};
  const entries = Object.entries(files || {});
  for (const [raw, body] of entries) {
    const path = raw.replace(/\\/g, '/');
    if (KEY_RE.test(path) || Object.keys(slim).length < 28) {
      const text = String(body ?? '');
      if (text.length <= 120_000) slim[path] = text;
    }
  }
  return slim;
}

export function snapshotCreateCheckpoint(
  files: Record<string, string>,
  productName: string,
  opts?: { label?: string; diskRoot?: string | null },
): CreateCheckpoint {
  const cp: CreateCheckpoint = {
    at: Date.now(),
    productName: productName || 'project',
    label: opts?.label || 'craft',
    diskRoot: opts?.diskRoot || null,
    files: slimFiles(files),
  };
  const root = String(opts?.diskRoot || '').trim();
  if (root && typeof sessionStorage !== 'undefined') {
    try {
      const key = storageKey(root);
      const prev = loadCheckpointStack(root);
      prev.push(cp);
      while (prev.length > MAX_STACK) prev.shift();
      sessionStorage.setItem(key, JSON.stringify(prev));
    } catch { /* quota */ }
  }
  return cp;
}

export function loadCheckpointStack(diskRoot: string): CreateCheckpoint[] {
  const root = String(diskRoot || '').trim();
  if (!root || typeof sessionStorage === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(storageKey(root));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CreateCheckpoint[];
    return Array.isArray(parsed) ? parsed.filter((c) => c && c.files) : [];
  } catch {
    return [];
  }
}

export function latestCreateCheckpoint(diskRoot: string): CreateCheckpoint | null {
  const stack = loadCheckpointStack(diskRoot);
  return stack.length ? stack[stack.length - 1] : null;
}

export function rollbackCreateCheckpoint(
  current: Record<string, string>,
  checkpoint: CreateCheckpoint | null | undefined,
): { files: Record<string, string>; restored: string[] } {
  if (!checkpoint?.files || !Object.keys(checkpoint.files).length) {
    return { files: { ...current }, restored: [] };
  }
  const files = { ...current };
  const restored: string[] = [];
  for (const [path, body] of Object.entries(checkpoint.files)) {
    files[path] = body;
    restored.push(path);
  }
  return { files, restored };
}

export function looksLikeRollbackAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t || t.length > 220) return false;
  return /\b(?:roll\s*back|rollback|restore\s+(?:scaffold|checkpoint|snapshot)|undo\s+(?:craft|create|build)|revert\s+(?:to\s+)?scaffold)\b/i.test(t);
}
