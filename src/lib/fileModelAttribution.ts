/**
 * Per-file model attribution — which model wrote which file.
 */
export type FileModelAttr = {
  path: string;
  modelId: string;
  at: string;
  seat?: string;
};

const KEY = 'nova-file-model-attr-v1';
const mem = new Map<string, FileModelAttr>();

export function recordFileModelAttribution(opts: {
  path: string;
  modelId: string;
  seat?: string;
  projectId?: string;
}) {
  const path = String(opts.path || '').replace(/\\/g, '/');
  if (!path || !opts.modelId) return;
  const row: FileModelAttr = {
    path,
    modelId: opts.modelId,
    seat: opts.seat,
    at: new Date().toISOString(),
  };
  const key = `${opts.projectId || 'global'}::${path}`;
  mem.set(key, row);
  try {
    const all = loadAllAttribution();
    all[key] = row;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* */ }
}

function loadAllAttribution(): Record<string, FileModelAttr> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getFileModelAttribution(path: string, projectId?: string): FileModelAttr | null {
  const key = `${projectId || 'global'}::${String(path || '').replace(/\\/g, '/')}`;
  if (mem.has(key)) return mem.get(key) || null;
  const all = loadAllAttribution();
  return all[key] || null;
}

export function formatFileModelChip(path: string, projectId?: string): string {
  const a = getFileModelAttribution(path, projectId);
  if (!a) return 'model: —';
  return `model: ${a.modelId}${a.seat ? ` (${a.seat})` : ''}`;
}
