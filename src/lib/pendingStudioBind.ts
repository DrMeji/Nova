/**
 * Pending studio folder bind (Open folder before first send).
 */

export type PendingStudioBind = {
  files?: Record<string, string>;
  projectId?: string | null;
  name?: string;
  diskRoot?: string | null;
};

const PENDING_KEY = 'NOVA:pending-studio-bind';

export function readPendingStudioBind(): PendingStudioBind | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const pending = JSON.parse(raw) as PendingStudioBind;
    if (pending?.diskRoot || (pending?.files && Object.keys(pending.files).length)) {
      return pending;
    }
  } catch { /* ignore */ }
  return null;
}

export function clearPendingStudioBind(): void {
  try { sessionStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
}

export function writePendingStudioBind(pending: PendingStudioBind): void {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch { /* ignore */ }
}

/** Apply pending bind into refs/state; returns diskRoot if applied. */
export function consumePendingStudioBind(apply: {
  setDiskRoot: (root: string) => void;
  setFiles: (files: Record<string, string>) => void;
  setProjectId?: (id: string) => void;
}): { diskRoot: string | null; files: Record<string, string> } {
  const pending = readPendingStudioBind();
  if (!pending) return { diskRoot: null, files: {} };
  const files = { ...(pending.files || {}) };
  if (pending.projectId && apply.setProjectId) apply.setProjectId(pending.projectId);
  if (pending.diskRoot) apply.setDiskRoot(pending.diskRoot);
  if (Object.keys(files).length) apply.setFiles(files);
  clearPendingStudioBind();
  return { diskRoot: pending.diskRoot || null, files };
}
