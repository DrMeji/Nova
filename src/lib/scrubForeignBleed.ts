/**
 * Strip unexpected non-English script runs from assistant replies when the
 * user is chatting in English — unless they clearly asked for a translation
 * or foreign-language sample (e.g. "how do you say hello in Chinese").
 */

const TRANSLATION_OR_SAMPLE_ASK =
  /\b(?:how\s+do\s+(?:you|i)\s+say|how\s+to\s+say|translate(?:\s+(?:this|to|into|from))?\b|in\s+(?:chinese|mandarin|japanese|korean|spanish|french|german|arabic|hindi|russian|portuguese|italian|hebrew|thai|vietnamese)\b|what(?:'s|\s+is)\s+[\s\S]{0,40}\s+in\s+(?:chinese|mandarin|japanese|korean|spanish|french|german|arabic|hindi|russian|portuguese|italian)|say\s+[\s\S]{0,40}\s+in\s+(?:chinese|mandarin|japanese|korean|spanish)|write\s+(?:that|it|this)\s+in\s+(?:chinese|japanese|korean|spanish)|中文|翻译|日本語|한국어)\b/i;

/** CJK / Hangul / Arabic / Hebrew / Thai / Cyrillic blocks that often leak mid-English. */
const FOREIGN_SCRIPT_RUN =
  /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af\u0600-\u06ff\u0750-\u077f\u0590-\u05ff\u0e00-\u0e7f\u0400-\u04ff]{2,}/gu;

function letterStats(text: string): { total: number; latin: number } {
  const letters = String(text || '').match(/\p{L}/gu) || [];
  let latin = 0;
  for (const c of letters) {
    if (/[A-Za-z\u00C0-\u024F]/.test(c)) latin += 1;
  }
  return { total: letters.length, latin };
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
    // No user context (display-time): only scrub when the reply is mostly Latin
    // and contains a short foreign run (the classic mid-sentence bleed).
    const { total, latin } = letterStats(raw);
    if (total >= 8 && latin / total < 0.65) return raw;
  }

  const fences: string[] = [];
  let out = raw.replace(/```[\s\S]*?```/g, (block) => {
    fences.push(block);
    return `\0FENCE${fences.length - 1}\0`;
  });

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
