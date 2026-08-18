/**
 * Streaming HTTPS downloads for ARK Engine (GGUF weights + llama.cpp binary).
 * Runs in Electron main — not subject to renderer host allowlist.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const arkHostPick = require('./arkHostPick.cjs');

function requestOnce(url, redirectsLeft = 8) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'http:' ? http : https;
    const req = lib.get(
      url,
      {
        headers: {
          'User-Agent': 'ARK-Engine/0.3',
          Accept: '*/*',
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) {
            reject(new Error('Too many redirects'));
            return;
          }
          const next = new URL(res.headers.location, url).toString();
          resolve(requestOnce(next, redirectsLeft - 1));
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`Download failed (${status})`));
          return;
        }
        resolve(res);
      },
    );
    req.on('error', reject);
  });
}

/**
 * @param {string} url
 * @param {string} destPath
 * @param {(pct: number, received: number, total: number) => void} [onProgress]
 */
async function downloadOnce(url, destPath, onProgress) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const partial = `${destPath}.partial`;
  try {
    if (fs.existsSync(partial)) fs.unlinkSync(partial);
  } catch {
    /* ignore */
  }

  const res = await requestOnce(url);
  const total = Number(res.headers['content-length'] || 0);
  let received = 0;

  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(partial);
    res.on('data', (chunk) => {
      received += chunk.length;
      if (onProgress) {
        const pct = total > 0 ? Math.min(99, Math.round((received / total) * 100)) : 0;
        onProgress(pct, received, total);
      }
    });
    res.on('error', reject);
    out.on('error', reject);
    out.on('finish', resolve);
    res.pipe(out);
  });

  fs.renameSync(partial, destPath);
  if (onProgress) onProgress(100, received, total || received);
  return { path: destPath, bytes: received };
}

async function downloadToFile(url, destPath, onProgress) {
  const urls = arkHostPick.candidateUrls(url);
  let lastErr = new Error('Download failed');
  for (const candidate of urls) {
    try {
      return await downloadOnce(candidate, destPath, onProgress);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastErr;
}

module.exports = {
  downloadToFile,
};
