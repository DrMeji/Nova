/** Request the in-chat Code pill overlay (folders left, editor right). */

export type OpenChatCodeDetail = {
  projectId?: string;
  diskPath?: string;
  name?: string;
  /** When false, bind studio/files only — do not open the overlay. Default true for explicit opens. */
  openOverlay?: boolean;
};

export const OPEN_CHAT_CODE_EVENT = 'NOVA:open-code-overlay';

export function requestOpenChatCode(detail?: OpenChatCodeDetail): void {
  try {
    window.dispatchEvent(new CustomEvent(OPEN_CHAT_CODE_EVENT, { detail: detail || {} }));
  } catch {
    /* ignore */
  }
}
