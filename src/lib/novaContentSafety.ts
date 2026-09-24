/**
 * Refuse harmful / weapons / violence asks with a clear, professional answer.
 * Hard refuse stays. never route these through a model that might lecture about coding.
 */

const HARM_PATTERNS: RegExp[] = [
  /\b(?:build|make|create|assemble|construct|design|cook|craft)\b[\s\S]{0,48}\b(?:bombs?|explosives?|ied|detonators?|molotov|pipe\s*bombs?)\b/i,
  /\b(?:build|make|create|get|obtain)\b[\s\S]{0,40}\b(?:guns?|firearms?|weapons?|silencers?)\b/i,
  /\bhow\s+(?:to|do\s+i|can\s+i)\b[\s\S]{0,64}\b(?:bombs?|explosives?|weapons?|kill|murder|harm|hurt|poison)\b/i,
  /\b(?:help|teach|show|instruct)\s+me\b[\s\S]{0,64}\b(?:bombs?|explosives?|weapons?|kill|murder)\b/i,
  /\b(?:instructions?|steps?|guide|recipe|tutorial)\b[\s\S]{0,40}\b(?:bombs?|explosives?|weapons?|poison)\b/i,
  /\b(?:making|building|creating)\s+(?:a\s+)?(?:bombs?|explosives?)\b/i,
  /\b(?:can\s+you|could\s+you|will\s+you)\b[\s\S]{0,40}\b(?:help\s+(?:me\s+)?(?:build|make)|build|make)\b[\s\S]{0,40}\b(?:bombs?|explosives?|weapons?)\b/i,
];

export function looksLikeHarmfulContentAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  return HARM_PATTERNS.some(re => re.test(t));
}

/**
 * Standard professional refusal.
 * No "I have to decline…" lecture, no coding pivot, no fancy dashes.
 */
export function harmfulContentBlockedReply(spoken = false): string {
  const body =
    "I understand what you're asking, but I can't provide instructions, materials, methods, or other assistance that could be used to cause harm or put someone or something at risk. I can help with a safe alternative instead.";
  if (spoken) return body;
  return body;
}
