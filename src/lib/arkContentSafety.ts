/**
 * Refuse illegal / violent / weapons asks with a direct answer — no coding pivots.
 */

const HARM_PATTERNS: RegExp[] = [
  /\b(?:build|make|create|assemble|construct|design)\b[\s\S]{0,40}\b(?:bomb|explosive|ied|detonator|molotov|pipe\s*bomb)\b/i,
  /\b(?:build|make|create|get|obtain)\b[\s\S]{0,40}\b(?:gun|firearm|weapon|silencer)\b/i,
  /\bhow\s+(?:to|do\s+i|can\s+i)\b[\s\S]{0,48}\b(?:bomb|explosive|weapon|kill|murder|harm|hurt|poison)\b/i,
  /\b(?:help|teach|show)\s+me\b[\s\S]{0,40}\b(?:bomb|explosive|weapon|kill|murder)\b/i,
  /\b(?:instructions?|steps?|guide|recipe)\b[\s\S]{0,32}\b(?:bomb|explosive|weapon|poison)\b/i,
];

export function looksLikeHarmfulContentAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  return HARM_PATTERNS.some(re => re.test(t));
}

/** Direct refusal — no programming / positive-project pivot. */
export function harmfulContentBlockedReply(spoken = false): string {
  if (spoken) {
    return [
      "I understand what you're asking for, but I can't help with that.",
      "It's illegal, dangerous, and could seriously hurt someone.",
      "I won't provide instructions for weapons, explosives, or violence.",
    ].join(' ');
  }
  return [
    "I understand what you're asking for, but I can't help with that.",
    '',
    "It's illegal, dangerous, and could seriously hurt someone. I won't provide instructions for weapons, explosives, or violence.",
  ].join('\n');
}
