/**
 * Strip unexpected non-English script runs from assistant replies when the
 * user is chatting in English — unless they clearly asked for a translation
 * or foreign-language sample (e.g. "how do you say hello in Chinese").
 *
 * Multilingual GGUFs (Qwen etc.) often open in English then dump CJK mid-story.
 * Never keep that dump just because it is longer than the English remnant.
 */

const TRANSLATION_OR_SAMPLE_ASK =
  /\b(?:how\s+do\s+(?:you|i)\s+say|how\s+to\s+say|translate(?:\s+(?:this|to|into|from))?\b|in\s+(?:chinese|mandarin|japanese|korean|spanish|french|german|arabic|hindi|russian|portuguese|italian|hebrew|thai|vietnamese)\b|what(?:'s|\s+is)\s+[\s\S]{0,40}\s+in\s+(?:chinese|mandarin|japanese|korean|spanish|french|german|arabic|hindi|russian|portuguese|italian)|say\s+[\s\S]{0,40}\s+in\s+(?:chinese|mandarin|japanese|korean|spanish)|write\s+(?:that|it|this)\s+in\s+(?:chinese|japanese|korean|spanish)|中文|翻译|日本語|한국어)\b/i;

/** CJK / Hangul / Arabic / Hebrew / Thai / Cyrillic blocks that often leak mid-English. */
const FOREIGN_SCRIPT_RUN =
  /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af\u0600-\u06ff\u0750-\u077f\u0590-\u05ff\u0e00-\u0e7f\u0400-\u04ff]{2,}/gu;

const FOREIGN_LETTER =
  /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af\u0600-\u06ff\u0750-\u077f\u0590-\u05ff\u0e00-\u0e7f\u0400-\u04ff]/u;

function letterStats(text: string): { total: number; latin: number; foreign: number } {
  const letters = String(text || '').match(/\p{L}/gu) || [];
  let latin = 0;
  let foreign = 0;
  for (const c of letters) {
    if (/[A-Za-z\u00C0-\u024F]/.test(c)) latin += 1;
    else if (FOREIGN_LETTER.test(c)) foreign += 1;
  }
  return { total: letters.length, latin, foreign };
}

export function userMessageLooksEnglish(message: string): boolean {
  const t = String(message || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ');
  const { total, latin } = letterStats(t);
  if (total < 3) return true;
  return latin / total >= 0.72;
}

export function userAskedForOtherLanguage(message: string): boolean {
  return TRANSLATION_OR_SAMPLE_ASK.test(String(message || ''));
}

/** True when a reply still contains unexpected foreign-script runs for an English ask. */
export function replyHasUnexpectedForeignBleed(
  text: string,
  lastUserMessage?: string,
): boolean {
  const raw = String(text || '');
  if (!raw.trim()) return false;
  const user = String(lastUserMessage || '').trim();
  if (user) {
    if (!userMessageLooksEnglish(user)) return false;
    if (userAskedForOtherLanguage(user)) return false;
  }
  FOREIGN_SCRIPT_RUN.lastIndex = 0;
  if (!FOREIGN_SCRIPT_RUN.test(raw)) return false;
  const { total, foreign } = letterStats(raw);
  if (total < 4) return false;
  // Any multi-char foreign run with meaningful density, or any long CJK dump.
  return foreign >= 8 || foreign / total >= 0.12;
}

function scrubForeignRunsOutsideFences(raw: string): string {
  const fences: string[] = [];
  let out = raw.replace(/```[\s\S]*?```/g, (block) => {
    fences.push(block);
    return `\0FENCE${fences.length - 1}\0`;
  });

  // If the model flips language mid-reply, keep the English prefix and drop the dump.
  FOREIGN_SCRIPT_RUN.lastIndex = 0;
  const firstBleed = FOREIGN_SCRIPT_RUN.exec(out);
  if (firstBleed && typeof firstBleed.index === 'number') {
    const before = out.slice(0, firstBleed.index);
    const { total: beforeLetters, latin: beforeLatin } = letterStats(before);
    const after = out.slice(firstBleed.index);
    const { foreign: afterForeign } = letterStats(after);
    // English lead-in + substantial foreign dump → truncate (stories, essays, etc.).
    if (beforeLatin >= 12 && afterForeign >= 24) {
      out = before.replace(/[\s*#_:-]+$/g, '').trim();
      for (let i = 0; i < fences.length; i++) {
        out = out.replace(`\0FENCE${i}\0`, fences[i]);
      }
      return out;
    }
    // Mostly-foreign body with a short English opener — still truncate.
    if (beforeLetters >= 3 && beforeLatin / Math.max(1, beforeLetters) >= 0.8 && afterForeign >= 40) {
      out = before.replace(/[\s*#_:-]+$/g, '').trim();
      for (let i = 0; i < fences.length; i++) {
        out = out.replace(`\0FENCE${i}\0`, fences[i]);
      }
      return out;
    }
  }

  out = out.replace(FOREIGN_SCRIPT_RUN, '');
  // Drop leftover CJK punctuation after a bleed strip.
  out = out.replace(/([A-Za-z0-9])\s*[。！？、；：]+/g, '$1.');
  out = out.replace(/[。！？、；：]+/g, '');
  // Clean glue left by mid-word bleed: "lightingto营造…" → "lightingto" → "lighting"
  out = out.replace(/([A-Za-z])to(?=[.!?,\s]|$)/g, '$1');
  out = out.replace(/\bto\.(?=\s|$)/g, '.');
  out = out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/([.!?]){2,}/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  for (let i = 0; i < fences.length; i++) {
    out = out.replace(`\0FENCE${i}\0`, fences[i]);
  }
  return out;
}

/**
 * Remove glued / stray foreign-script runs from an English chat reply.
 * Keeps fenced code intact. No-ops when the user wrote in another language
 * or explicitly asked for a translation / sample.
 */
export function scrubUnexpectedForeignScript(
  text: string,
  lastUserMessage?: string,
): string {
  const raw = String(text || '');
  if (!raw.trim()) return raw;

  const user = String(lastUserMessage || '').trim();
  if (user) {
    if (!userMessageLooksEnglish(user)) return raw;
    if (userAskedForOtherLanguage(user)) return raw;
  } else {
    // Display-time (no user context): still cut English-lead-in → foreign dump.
    // Only preserve mostly-foreign replies when there is no Latin lead-in at all
    // (user may have asked in that language in a prior turn we cannot see).
    const { total, latin, foreign } = letterStats(raw);
    FOREIGN_SCRIPT_RUN.lastIndex = 0;
    const hasForeign = FOREIGN_SCRIPT_RUN.test(raw);
    if (!hasForeign) return raw;
    // Classic mid-sentence bleed: mostly Latin with a short foreign run.
    if (total >= 8 && latin / total >= 0.65) {
      return scrubForeignRunsOutsideFences(raw);
    }
    // English opener then CJK story body (the Qwen stress-test failure mode).
    if (latin >= 12 && foreign >= 24) {
      return scrubForeignRunsOutsideFences(raw);
    }
    // Mostly foreign with no useful English — leave as-is (likely intentional).
    if (total >= 8 && latin / total < 0.35) return raw;
    return scrubForeignRunsOutsideFences(raw);
  }

  return scrubForeignRunsOutsideFences(raw);
}

/**
 * Prefer the candidate that is safe for an English ask.
 * Never let a longer foreign-bleed draft beat a shorter clean English reply.
 */
export function preferEnglishSafeReply(
  primary: string,
  fallback: string,
  lastUserMessage?: string,
): string {
  const a = String(primary || '').trim();
  const b = String(fallback || '').trim();
  if (!a) return scrubUnexpectedForeignScript(b, lastUserMessage) || b;
  if (!b) return scrubUnexpectedForeignScript(a, lastUserMessage) || a;

  const aBleed = replyHasUnexpectedForeignBleed(a, lastUserMessage);
  const bBleed = replyHasUnexpectedForeignBleed(b, lastUserMessage);
  if (aBleed && !bBleed) return scrubUnexpectedForeignScript(b, lastUserMessage) || b;
  if (bBleed && !aBleed) return scrubUnexpectedForeignScript(a, lastUserMessage) || a;
  if (aBleed && bBleed) {
    const scrubbed = scrubUnexpectedForeignScript(a.length >= b.length ? a : b, lastUserMessage);
    return scrubbed || scrubUnexpectedForeignScript(a, lastUserMessage) || a;
  }
  return a.length >= b.length ? a : b;
}
