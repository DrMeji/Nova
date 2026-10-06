/**
 * Strip accidental NOVA self-leaks from model replies on packaged installs.
 */

import { isNovaDevSession, isArkPackagedApp } from '@/lib/novaRuntime';
import { arkSelfHarmBlockedReply } from '@/lib/novaSelfGuard';

const LEAK_PATTERNS: RegExp[] = [
  /require\s*\(\s*['"]electron['"]\s*\)/,
  /electron[/\\]main\.cjs/,
  /electron[/\\]preload\.cjs/,
  /app\.asar(?:[/\\]|$)/i,
  /DrMeji[/\\]NOVA-Source/i,
];

/** Mid-write abort often dumps TOOL: write + system prompt into the chat bubble. */
export function looksLikeAgentToolLeak(text: string): boolean {
  const t = String(text || '');
  if (t.length < 40) return false;
  if (/TOOL:\s*write\b/i.test(t) && /PATH:\s*src\/App\./i.test(t) && t.length < 800) return true;
  if (/You are NOVA[\s\S]{0,200}TOOL:\s*(?:write|read|patch|list)\b/i.test(t)) return true;
  if (/^\(stopped\)\s*TOOL/i.test(t.trim())) return true;
  if (/TOOLYou are NOVA/i.test(t)) return true;
  return false;
}

export function scrubAgentToolLeak(text: string, fallback = 'Stopped mid-write — say **keep building** to continue.'): string {
  const raw = String(text || '');
  if (!looksLikeAgentToolLeak(raw)) return raw;
  if (/^\(stopped\)/i.test(raw.trim())) return '(stopped)';
  return fallback;
}

export function redactArkSelfLeak(text: string): string {
  let raw = scrubAgentToolLeak(String(text || ''));
  if (!raw) return raw;
  // Always normalize fancy dashes in chat bubbles (model + safety copy).
  raw = raw
    .replace(/\u2014|\u2013|\u2212/g, '. ')
    .replace(/\s+\.\s+/g, '. ')
    .replace(/([.!?])\s*\./g, '$1')
    .replace(/\.\s*\./g, '.')
    .replace(/ {2,}/g, ' ');

  if (isNovaDevSession() || !isArkPackagedApp()) return raw.trim();

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
