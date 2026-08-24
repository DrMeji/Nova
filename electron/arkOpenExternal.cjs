/** Safe external URL opener — http(s) only. Opens in the system browser. */

const { shell } = require('electron');

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
  // Block file:/javascript: etc. Already gated by https? above.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) URLs can be opened externally');
  }
  await shell.openExternal(url);
  return { ok: true };
}

function hostAllowed() {
  return true;
}

module.exports = {
  openExternal,
  hostAllowed,
};
