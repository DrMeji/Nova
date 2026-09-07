/**
 * When local 7B cannot patch large repos, prefer cloud coding models first.
 */

import { hasAnyCloudChatKey } from '@/lib/cloudChat';
import { getLocalPrefs } from '@/lib/localPrefs';
import { looksLikeProjectDebugAsk } from '@/lib/chatProjectDebug';

const LARGE_REPO_FILES = 40;

export function countSourceFiles(files: Record<string, string>): number {
  return Object.keys(files || {}).filter(k =>
    !/(^|\/)(node_modules|dist|build|release|\.git)(\/|$)/i.test(k.replace(/\\/g, '/')),
  ).length;
}

/** True when NOVA Auto should try free/paid cloud before local GGUF for coding. */
export function shouldPreferCloudForCoding(opts: {
  fileCount: number;
  message: string;
  allowFileEdits?: boolean;
  /** Agent tool loop — prefer cloud even on small repos when keyed. */
  agentLoop?: boolean;
}): boolean {
  if (!opts.allowFileEdits && !looksLikeProjectDebugAsk(opts.message) && !opts.agentLoop) return false;
  if (!hasAnyCloudChatKey()) return false;
  const mode = getLocalPrefs().aiMode;
  if (mode === 'local_only') return false;
  if (opts.agentLoop) return true;
  if (opts.allowFileEdits) return true;
  if (opts.fileCount < LARGE_REPO_FILES) return false;
  return /\b(fix|patch|edit|debug|stop|generating|@@@FILE|change|update)\b/i.test(opts.message)
    || looksLikeProjectDebugAsk(opts.message);
}
