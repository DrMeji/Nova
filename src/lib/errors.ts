/** Structured error codes for UI action buttons. */

export type ArkErrorCode =
  | 'NO_MODEL'
  | 'GGUF_TIMEOUT'
  | 'GGUF_FAILED'
  | 'DISK_FULL'
  | 'PORT_IN_USE'
  | 'KEY_MISSING'
  | 'UNAUTHORIZED'
  | 'NO_ENCRYPTION'
  | 'RATE_LIMITED'
  | 'EMPTY_OUTPUT'
  | 'TEMPLATE_ONLY'
  | 'OFFLINE'
  | 'CANCELED'
  | 'UNKNOWN';

export type ArkErrorInfo = {
  code: ArkErrorCode;
  message: string;
  action?: string;
  route?: { name: string; mode?: string };
};

export function classifyErrorMessage(raw: string): ArkErrorInfo {
  const msg = String(raw || '').trim() || 'Something went wrong';
  const lower = msg.toLowerCase();
  if (/no[_ -]?encryption|encryption (?:is )?unavailable|not encrypted|plaintext.*(?:refus|blocked)|safe storage.*unavailable/i.test(lower)) {
    return { code: 'NO_ENCRYPTION', message: msg, action: 'Open Security' };
  }
  if (/rate[_ -]?limit|too many requests|\b429\b|quota (?:exceeded|reached)|capacity limit/i.test(lower)) {
    return { code: 'RATE_LIMITED', message: msg, action: 'Try another model' };
  }
  if (/empty[_ -]?output|returned (?:an? )?empty|no output (?:was )?(?:returned|generated)/i.test(lower)) {
    return { code: 'EMPTY_OUTPUT', message: msg, action: 'Retry' };
  }
  if (/template[_ -]?only|template (?:preview|output)|placeholder (?:only|output)|preview only/i.test(lower)) {
    return { code: 'TEMPLATE_ONLY', message: msg, action: 'Choose a real generation model' };
  }
  if (/no local gguf|not ready in ark engine|no model|install a local brain/i.test(lower)) {
    return { code: 'NO_MODEL', message: msg, action: 'Open Local AI', route: { name: 'local-ai' } };
  }
  if (/timed out|timeout|gguf.*fail/i.test(lower)) {
    return { code: 'GGUF_TIMEOUT', message: msg, action: 'Retry or use cloud key' };
  }
  if (/disk|space|enospc/i.test(lower)) {
    return { code: 'DISK_FULL', message: msg, action: 'Free disk space' };
  }
  if (/port|eaddrinuse|8787|8788/i.test(lower)) {
    return { code: 'PORT_IN_USE', message: msg, action: 'Quit other ARK copies' };
  }
  if (/api key|connect a free key|provider key|unauthorized|401|403/i.test(lower)) {
    return { code: 'KEY_MISSING', message: msg, action: 'Connect free key', route: { name: 'chat' } };
  }
  if (/offline|engine is offline/i.test(lower)) {
    return { code: 'OFFLINE', message: msg, action: 'Start engine', route: { name: 'local-ai' } };
  }
  if (/cancel|stopped|abort/i.test(lower)) {
    return { code: 'CANCELED', message: msg };
  }
  return { code: 'UNKNOWN', message: msg };
}
