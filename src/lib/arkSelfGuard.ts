/**
 * Chat-level guard: refuse jailbreak / self-exfiltration asks (source code, system prompt, clone NOVA).
 */

const SELF_HARM_PATTERNS: RegExp[] = [
  /\b(?:expose|reveal|show|print|dump|leak|give\s+me|share|output|paste|tell\s+me|what\s+is)\b[\s\S]{0,56}\b(?:your|NOVA'?s?|internal|own|hidden)\b[\s\S]{0,40}\b(?:source\s*code|source|implementation|internals?|codebase|architecture|system\s*prompt|prompt|instructions?|files?)\b/i,
  /\b(?:source\s*code|system\s*prompt|internal\s+(?:files?|code|prompt))\b[\s\S]{0,32}\b(?:of\s+)?(?:NOVA|you|this\s+app)\b/i,
  /\b(?:build|clone|copy|fork|recreate|replicate|rebuild|compile|scaffold|download)\b[\s\S]{0,32}\b(?:yourself|your\s+self|NOVA\s+itself|this\s+app|this\s+application|the\s+NOVA\s+app)\b/i,
  /\b(?:ignore|disregard|forget|override|bypass)\b[\s\S]{0,40}\b(?:previous|prior|system|safety|security|rules?|instructions?|restrictions?)\b/i,
  /\b(?:jailbreak|dan\s+mode|developer\s+mode|unrestricted\s+mode|no\s+rules?)\b/i,
  /\b(?:read|open|list|scan|search|grep|cat)\b[\s\S]{0,24}\b(?:your|NOVA'?s?|own)\b[\s\S]{0,24}\b(?:source|codebase|electron|app\.asar|main\.cjs|preload)\b/i,
  /\bapp\.asar\b/i,
  /\bDrMeji\/Ark-Source\b/i,
  /\b(?:git\s+clone|clone\s+(?:the\s+)?(?:repo|repository|source))\b[\s\S]{0,48}\b(?:DrMeji\/Ark|NOVA-Source|NOVA-source)\b/i,
  /\b(?:how\s+are\s+you\s+built|how\s+was\s+NOVA\s+built|what\s+is\s+inside\s+NOVA)\b/i,
];

export function looksLikeArkSelfHarmAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  return SELF_HARM_PATTERNS.some(re => re.test(t));
}

export function arkSelfHarmBlockedReply(): string {
  return [
    "I can't help extract NOVA's own source code, system prompts, or internal application files.",
    '',
    'NOVA is here to work on **your projects** on this PC — open a folder and I can read, debug, and edit those files.',
    '',
    'If you need the NOVA app source, use the official repository or releases from the author — not chat inside NOVA.',
  ].join('\n');
}

/** Renderer-side check via Electron IPC when available. */
export async function isArkProtectedPathOnDisk(targetPath: string): Promise<boolean> {
  const p = String(targetPath || '').trim();
  if (!p) return false;
  if (/app\.asar/i.test(p)) return true;
  try {
    const res = await window.arkDesktop?.isProtectedPath?.(p);
    if (typeof res?.protected === 'boolean') return res.protected;
  } catch {
    /* ignore */
  }
  return false;
}
