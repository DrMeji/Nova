/** Transient notices shown above the sidebar profile (messages, jobs, updates). */

export const SIDEBAR_TOAST_EVENT = 'NOVA:sidebar-toast';

export type SidebarToastDetail = {
  message: string;
  /** Auto-hide after ms. Omit for sticky until cleared / replaced by same id. */
  ttlMs?: number;
  id?: string;
  /** download = folder badge; click opens folderPath when set. */
  kind?: 'info' | 'download';
  /** Absolute folder to open when the user clicks a download toast. */
  folderPath?: string;
  fileName?: string;
};

export function pushSidebarToast(
  message: string,
  opts?: {
    ttlMs?: number;
    id?: string;
    kind?: 'info' | 'download';
    folderPath?: string;
    fileName?: string;
  },
) {
  const detail: SidebarToastDetail = {
    message,
    ttlMs: opts?.ttlMs,
    id: opts?.id,
    kind: opts?.kind,
    folderPath: opts?.folderPath,
    fileName: opts?.fileName,
  };
  try {
    window.dispatchEvent(new CustomEvent(SIDEBAR_TOAST_EVENT, { detail }));
  } catch {
    /* ignore */
  }
}

/** Toast after a file lands in the OS Downloads folder. */
export function pushDownloadCompleteToast(opts: {
  fileName: string;
  folderPath: string;
}) {
  const name = String(opts.fileName || 'file').trim() || 'file';
  pushSidebarToast(`Downloaded ${name}`, {
    id: `dl-${Date.now()}`,
    ttlMs: 14_000,
    kind: 'download',
    folderPath: opts.folderPath,
    fileName: name,
  });
}
