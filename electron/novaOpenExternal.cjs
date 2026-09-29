/** Safe external URL opener — http(s) only. Opens in the system browser. */

const { shell } = require('electron');

/**
 * Chat citations and Connect/docs links can point at any public https host.
 * Block only dangerous / local targets (SSRF-style and accidental local opens).
 */
function isBlockedHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host.endsWith('.internal') || host.endsWith('.intranet') || host.endsWith('.lan')) return true;
  if (host === 'metadata.google.internal' || host === 'metadata' || host.startsWith('metadata.')) return true;
  // Bare IPv4 — never open raw IPs via shell (includes cloud metadata 169.254.169.254).
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  // IPv6 / bracket forms
  if (host.includes(':')) return true;
  return false;
}

/** @deprecated kept for callers that expect the old name — now means “safe to open”. */
function hostAllowed(hostname) {
  return !isBlockedHost(hostname);
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
  // Block weird ports that are not standard web (reduce accidental local-service opens).
  const port = parsed.port ? Number(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80);
  if (port !== 443 && port !== 80) {
    throw new Error(`Port not allowed for external open: ${port}`);
  }
  if (isBlockedHost(parsed.hostname)) {
    throw new Error(`Host not allowed for external open: ${parsed.hostname}`);
  }
  await shell.openExternal(parsed.toString());
  return { ok: true };
}

module.exports = {
  openExternal,
  hostAllowed,
  isBlockedHost,
};
