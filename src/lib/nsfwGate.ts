/**
 * NSFW / adult-content gate for image (and optional chat) generation.
 */

const NSFW_RE =
  /\b(nsfw|nude|naked|nudity|porn|pornograph(?:y|ic)|xxx|onlyfans|hentai|erotic|sexual(?:ly)?|sex\b|explicit\s+sex|blowjob|intercourse|genital|penis|vagina|breast(?:s)?\s+exposed|topless|bottomless|undress(?:ed|ing)?|lingerie\s+only|fetish)\b/i;

export function looksLikeNsfwAsk(text: string): boolean {
  return NSFW_RE.test(String(text || ''));
}

/** Extra negative cues appended when NSFW is off. */
export const NSFW_OFF_NEGATIVE =
  'sfw, safe for work, fully clothed, no nudity, no sexual content, no pornography, no explicit anatomy';

export function nsfwBlockedReply(): string {
  return [
    'NSFW is **off** in Settings → AI.',
    '',
    'Turn on **Allow NSFW content** if you want adult / nude generations. With it off, NOVA will not create that kind of image.',
  ].join('\n');
}
