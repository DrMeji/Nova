/**
 * #7 Mid-build chat switch safety.
 * Live studio / Preview chrome must only paint when the user is still viewing the
 * chat that owns the in-flight create. Background builds keep writing that chat’s
 * snapshot — never the blank starter or another Recent thread.
 */

/** True when the on-screen route is the same chat that started this turn. */
export function shouldPaintStudioLive(
  routeChatId: string | null | undefined,
  originChatId: string | null | undefined,
): boolean {
  const route = String(routeChatId || '').trim();
  const origin = String(originChatId || '').trim();
  if (!origin) return false;
  // Blank New Chat / Image starter has no chatId — never inherit mid-build studio.
  if (!route) return false;
  return route === origin;
}

/** True when a background create/edit should keep going after the user left the chat. */
export function shouldKeepBackgroundTurn(
  routeChatId: string | null | undefined,
  originChatId: string | null | undefined,
  genStillActive: boolean,
): boolean {
  if (!genStillActive) return false;
  const origin = String(originChatId || '').trim();
  if (!origin) return false;
  return !shouldPaintStudioLive(routeChatId, origin);
}
