/**
 * Strip accidental NOVA self-leaks from model replies on packaged installs.
 */

import { isArkDevSession, isArkPackagedApp } from '@/lib/arkRuntime';
import { arkSelfHarmBlockedReply } from '@/lib/arkSelfGuard';

const LEAK_PATTERNS: RegExp[] = [
  /require\s*\(\s*['"]electron['"]\s*\)/,
  /electron[/\\]main\.cjs/,
  /electron[/\\]preload\.cjs/,
  /app\.asar(?:[/\\]|$)/i,
  /DrMeji[/\\]NOVA-Source/i,
];

export function redactArkSelfLeak(text: string): string {
  let raw = String(text || '');
  if (!raw) return raw;
  // Always normalize fancy dashes in chat bubbles (model + safety copy).
  raw = raw
    .replace(/\u2014|\u2013|\u2212/g, '. ')
    .replace(/\s+\.\s+/g, '. ')
    .replace(/([.!?])\s*\./g, '$1')
    .replace(/\.\s*\./g, '.')
    .replace(/ {2,}/g, ' ');

  if (isArkDevSession() || !isArkPackagedApp()) return raw.trim();

  let hit = false;
  for (const re of LEAK_PATTERNS) {
    if (re.test(raw)) {
      hit = true;
      break;
    }
  }
  if (!hit) return raw.trim();

  if (/require\s*\(\s*['"]electron['"]\s*\)/.test(raw) && raw.length > 400) {
    return arkSelfHarmBlockedReply();
  }

  return raw
    .replace(/[^\s'"]*app\.asar[^\s'"]*/gi, '[NOVA internal path]')
    .replace(/electron[/\\](?:main|preload)\.cjs/gi, '[NOVA internal file]')
    .trim();
}
