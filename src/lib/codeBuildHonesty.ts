/** Honest copy when Code falls back to offline scaffolds. */

export function scaffoldHonestyNote(): string {
  return '\n\n_Used an offline starter because the brain did not finish in time. Install a local brain in Local AI or add a free cloud key in Settings for custom code._';
}

export function appendScaffoldHonesty(text: string): string {
  const t = String(text || '').trim();
  if (!t) return scaffoldHonestyNote().trim();
  if (/offline starter|did not finish in time|template helper/i.test(t)) return t;
  return `${t}${scaffoldHonestyNote()}`;
}

export function isTemplateEngineReply(reply: string): boolean {
  return /ARK Core is a template helper|not a live LLM/i.test(reply);
}
