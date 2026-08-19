/** Safe external URL opener — allowlist + confirm for unknown hosts. */

const { dialog, shell } = require('electron');

const ALLOWED_HOSTS = new Set([
  'github.com',
  'www.github.com',
  'raw.githubusercontent.com',
  'gist.github.com',
  'docs.github.com',
  'huggingface.co',
  'cdn-lfs.huggingface.co',
  'pollinations.ai',
  'image.pollinations.ai',
  'gen.pollinations.ai',
  'groq.com',
  'console.groq.com',
  'aistudio.google.com',
  'ai.google.dev',
  'openrouter.ai',
  'supabase.com',
  'git-scm.com',
  'nodejs.org',
  'npmjs.com',
  'vercel.com',
  'notion.so',
  'slack.com',
  'discord.com',
  'telegram.org',
  'stripe.com',
  'google.com',
  'accounts.google.com',
  'oauth2.googleapis.com',
]);

function hostAllowed(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return false;
  if (ALLOWED_HOSTS.has(host)) return true;
  if (host.endsWith('.github.com') || host.endsWith('.githubusercontent.com')) return true;
  if (host.endsWith('.google.com') || host.endsWith('.googleapis.com')) return true;
  if (host.endsWith('.huggingface.co')) return true;
  return false;
}

async function openExternal(url, win) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    throw new Error('Only http(s) URLs can be opened externally');
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL');
  }
  if (!hostAllowed(parsed.hostname)) {
    const parent = win && !win.isDestroyed() ? win : undefined;
    const { response } = await dialog.showMessageBox(parent, {
      type: 'question',
      buttons: ['Open link', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Open external link?',
      message: `Open this link in your browser?\n\n${parsed.hostname}`,
      detail: url.length > 240 ? `${url.slice(0, 240)}…` : url,
      noLink: true,
    });
    if (response !== 0) {
      return { ok: false, canceled: true };
    }
  }
  await shell.openExternal(url);
  return { ok: true };
}

module.exports = {
  openExternal,
  hostAllowed,
};
