/** Safe external URL opener — http(s) only. Opens in the system browser. */

const { shell } = require('electron');

/** Hosts ARK intentionally opens (Connect, docs, updates, OAuth). */
const ALLOWED_EXTERNAL_HOST_SUFFIXES = [
  'github.com',
  'githubusercontent.com',
  'openai.com',
  'platform.openai.com',
  'huggingface.co',
  'nvidia.com',
  'nvcf.nvidia.com',
  'build.nvidia.com',
  'google.com',
  'accounts.google.com',
  'googleapis.com',
  'aistudio.google.com',
  'console.cloud.google.com',
  'anthropic.com',
  'console.anthropic.com',
  'supabase.co',
  'supabase.com',
  'discord.com',
  'discord.gg',
  'vercel.com',
  'together.ai',
  'fireworks.ai',
  'deepseek.com',
  'mistral.ai',
  'cerebras.ai',
  'cloud.cerebras.ai',
  'sambanova.ai',
  'cloud.sambanova.ai',
  'groq.com',
  'console.groq.com',
  'openrouter.ai',
  'cloudflare.com',
  'pollinations.ai',
  'aihorde.net',
  'cursor.com',
  'notion.so',
  'notion.com',
];

function hostAllowed(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!host) return false;
  // Never open bare IPs (SSRF / phishing via numeric hosts).
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  if (host === 'localhost') return false;
  return ALLOWED_EXTERNAL_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

async function openExternal(url) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    throw new Error('Only http(s) URLs can be opened externally');
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) URLs can be opened externally');
  }
  // Packaged app: HTTPS only (no cleartext remote opens).
  if (parsed.protocol !== 'https:') {
    throw new Error('Only https URLs can be opened externally');
  }
  if (parsed.username || parsed.password) {
    throw new Error('URLs with credentials are not allowed');
  }
  if (!hostAllowed(parsed.hostname)) {
    throw new Error(`Host not allowed for external open: ${parsed.hostname}`);
  }
  await shell.openExternal(parsed.toString());
  return { ok: true };
}

module.exports = {
  openExternal,
  hostAllowed,
};
