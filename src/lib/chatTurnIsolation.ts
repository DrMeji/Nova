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

/** Cooperative cancellation for a turn: stopped, superseded, or detached by route change. */
export function isChatTurnDead(opts: {
  originChatId: string | null | undefined;
  routeChatId: string | null | undefined;
  sequence: number;
  currentSequence: number;
  stopped?: boolean;
  /** Route-change snapshot taken when turn started; distinguishes switching away from starting elsewhere. */
  routeAtStartChatId?: string | null;
  /** Allow background continuation only when caller explicitly opts in. */
  keepBackground?: boolean;
}): boolean {
  if (opts.stopped || opts.sequence !== opts.currentSequence) return true;
  const origin = String(opts.originChatId || '').trim();
  const route = String(opts.routeChatId || '').trim();
  const startedOn = String(opts.routeAtStartChatId || '').trim();
  if (!origin) return true;
  if (!route) return !opts.keepBackground;
  if (route !== origin && startedOn === origin) return !opts.keepBackground;
  return false;
}

