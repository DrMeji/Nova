/** Transient notices shown above the sidebar profile (messages, jobs, updates). */

export const SIDEBAR_TOAST_EVENT = 'NOVA:sidebar-toast';

export type SidebarToastDetail = {
  message: string;
  /** Auto-hide after ms. Omit for sticky until cleared / replaced by same id. */
  ttlMs?: number;
  id?: string;
};

export function pushSidebarToast(message: string, opts?: { ttlMs?: number; id?: string }) {
  const detail: SidebarToastDetail = {
    message,
    ttlMs: opts?.ttlMs,
    id: opts?.id,
  };
  try {
    window.dispatchEvent(new CustomEvent(SIDEBAR_TOAST_EVENT, { detail }));
  } catch {
    /* ignore */
  }
}
