/**
 * Strip accidental ARK self-leaks from model replies on packaged installs.
 */

import { isArkDevSession, isArkPackagedApp } from '@/lib/arkRuntime';
import { arkSelfHarmBlockedReply } from '@/lib/arkSelfGuard';

const LEAK_PATTERNS: RegExp[] = [
  /require\s*\(\s*['"]electron['"]\s*\)/,
  /electron[/\\]main\.cjs/,
  /electron[/\\]preload\.cjs/,
  /app\.asar(?:[/\\]|$)/i,
  /DrMeji[/\\]Ark-Source/i,
];

export function redactArkSelfLeak(text: string): string {
  const raw = String(text || '');
  if (!raw || isArkDevSession() || !isArkPackagedApp()) return raw;

  let hit = false;
  for (const re of LEAK_PATTERNS) {
    if (re.test(raw)) {
      hit = true;
      break;
    }
  }
  if (!hit) return raw;

  if (/require\s*\(\s*['"]electron['"]\s*\)/.test(raw) && raw.length > 400) {
    return arkSelfHarmBlockedReply();
  }

  return raw
    .replace(/[^\s'"]*app\.asar[^\s'"]*/gi, '[ARK internal path]')
    .replace(/electron[/\\](?:main|preload)\.cjs/gi, '[ARK internal file]');
}
