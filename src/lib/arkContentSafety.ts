/**
 * Refuse illegal / violent / weapons asks with a clear, professional answer.
 * Hard refuse stays — never route these through a model that might lecture about coding.
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

/** Professional refusal — no programming / positive-project pivot. */
export function harmfulContentBlockedReply(spoken = false): string {
  if (spoken) {
    return [
      "I understand what you're asking for, but I can't help with that.",
      'Providing guidance on weapons, explosives, or violence is illegal and could seriously harm people.',
      "I'm happy to help with safe, legal topics instead — what else can I assist with?",
    ].join(' ');
  }
  return [
    "I understand what you're asking for, but I can't help with that.",
    '',
    'Providing guidance on weapons, explosives, or violence is illegal and could seriously harm people. I have to decline requests like this.',
    '',
    "I'm happy to help with safe, legal topics instead — what else can I assist with?",
  ].join('\n');
}
