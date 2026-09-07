/**
 * In-app updates via public DrMeji/Ark (installer feed only).
 * Source stays private in DrMeji/Ark-Source — never publish app source to the public repo.
 *
 * 1) Download installer inside the main ARK app
 * 2) Breakaway-launch ARK.exe --ark-updater (survives parent quit; no PowerShell UI)
 * 3) Updater splash waits for parent → silent install → relaunch ARK
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');
const { app, BrowserWindow } = require('electron');

/** Public installer feed (no source). */
const UPDATE_REPO = 'DrMeji/Ark';
/** Private source — never use as anonymous download target in production. */
const UPDATE_REPO_FALLBACK = '';

const TRUSTED_SETUP_HOSTS = new Set([
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
]);

/** Only ARK installers from the public DrMeji/Ark Releases feed (canonical GitHub download URL). */
function isTrustedSetupUrl(url) {
  try {
    const u = new URL(String(url || ''));
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (host !== 'github.com') return false;
    return /^\/DrMeji\/Ark\/releases\/download\/v[\w.-]+\/ARK-Setup[^/]*\.exe$/i.test(u.pathname);
  } catch {
    return false;
  }
}

function isTrustedDownloadHost(url) {
  try {
    const u = new URL(String(url || ''));
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return host === 'github.com'
      || TRUSTED_SETUP_HOSTS.has(host)
      || host.endsWith('.githubusercontent.com');
  } catch {
    return false;
  }
}
const POST_UPDATE_FLAG = 'ark-post-update.json';
const UI_SHOWN_FLAG = 'ark-ui-shown.flag';
const SPLASH_ALIVE_FLAG = 'ark-update-splash-alive.flag';

function uiShownFlagPath() {
  return path.join(app.getPath('temp'), UI_SHOWN_FLAG);
}

function splashAliveFlagPath() {
  return path.join(app.getPath('temp'), SPLASH_ALIVE_FLAG);
}

function markUiShown() {
  try {
    fs.writeFileSync(uiShownFlagPath(), `${Date.now()}\n`, 'utf8');
  } catch {
    /* ignore */
  }
}

function clearUiShown() {
  try {
    fs.unlinkSync(uiShownFlagPath());
  } catch {
    /* ignore */
  }
}

function clearSplashAlive() {
  try {
    fs.unlinkSync(splashAliveFlagPath());
  } catch {
    /* ignore */
  }
}

async function waitForFile(filePath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (filePath && fs.existsSync(filePath)) return true;
    } catch {
      /* ignore */
    }
    await sleep(80);
  }
  return false;
}

function tryElectronUpdater() {
  try {
    // Optional delta path — requires latest.yml from electron-builder publish.

    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowDowngrade = false;
    return autoUpdater;
  } catch {
    return null;
  }
}

/** @type {{ status: string, percent: number, message: string, version?: string, error?: string } | null} */
let state = null;

/** @type {null | (() => void)} */
let onBeforeForceExit = null;

function setForceExitHook(fn) {
  onBeforeForceExit = typeof fn === 'function' ? fn : null;
}

/** Hard exit so the Updating splash is not stuck on “Waiting for ARK to close”. */
function forceExitForUpdate() {
  try {
    onBeforeForceExit?.();
  } catch {
    /* ignore */
  }
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        win.destroy();
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  // app.quit() can hang with tray/brain; Lyndsey uses exit after handoff.
  setTimeout(() => {
    try {
      app.exit(0);
    } catch {
      process.exit(0);
    }
  }, 120);
}

function sendProgress(payload) {
  state = { ...(state || {}), ...payload };
  if (payload?.status === 'error') {
    try {
      const arkCrashLog = require('./arkCrashLog.cjs');
      arkCrashLog.appendReport('update-error', {
        message: payload.message,
        error: payload.error,
        version: payload.version,
      });
    } catch {
      /* ignore */
    }
  }
  const pct = Number(payload?.percent);
  if (Number.isFinite(pct)) {
    void setUpdateSplashPercent(pct);
  }
  if (payload?.status === 'error') {
    closeUpdateSplash();
  }
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      // Don't push progress IPC into the splash window itself.
      if (updateSplashWin && !updateSplashWin.isDestroyed() && win.id === updateSplashWin.id) continue;
      win.webContents.send('ark:update-progress', state);
    } catch {
      /* ignore */
    }
  }
}

function getState() {
  return state || { status: 'idle', percent: 0, message: 'Ready' };
}

function postUpdatePath() {
  return path.join(app.getPath('userData'), POST_UPDATE_FLAG);
}

function markPostUpdateLandChat() {
  try {
    fs.writeFileSync(
      postUpdatePath(),
      JSON.stringify({ land: 'chat', at: new Date().toISOString(), keepSession: true }),
      'utf8',
    );
  } catch {
    /* ignore */
  }
}

function consumePostUpdate() {
  const p = postUpdatePath();
  try {
    if (!fs.existsSync(p)) return { ok: true, land: null };
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    fs.unlinkSync(p);
    return { ok: true, land: raw?.land === 'chat' ? 'chat' : null };
  } catch {
    try {
      fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
    return { ok: true, land: null };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientHttpStatus(status) {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function githubHttpHint(status) {
  if (isTransientHttpStatus(status)) {
    return ' GitHub is temporarily unavailable — try again in a moment.';
  }
  if (status === 404) {
    return ` GitHub returned 404 for ${UPDATE_REPO} (private or missing). Updates need a public release feed.`;
  }
  return ` HTTP ${status}.`;
}

function httpsJsonOnce(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'ARK-Desktop',
          Accept: 'application/vnd.github+json',
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => {
          body += c;
        });
        res.on('end', () => {
          let data = null;
          try {
            data = body ? JSON.parse(body) : null;
          } catch {
            data = null;
          }
          resolve({ status: res.statusCode || 0, data });
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(45_000, () => req.destroy(new Error('Timeout')));
  });
}

/** GitHub JSON GET with retries on 429/502/503/504 and timeouts. */
async function httpsJson(url, { retries = 3 } = {}) {
  let last = { status: 0, data: null };
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await httpsJsonOnce(url);
      last = res;
      if (res.status === 200 || !isTransientHttpStatus(res.status)) return res;
    } catch (err) {
      last = { status: 0, data: null, error: err };
      if (attempt === retries - 1) throw err;
    }
    await sleep(700 * (attempt + 1));
  }
  return last;
}

function normalizeVersion(v) {
  return String(v || '')
    .trim()
    .replace(/^v/i, '');
}

function isNewer(latest, current) {
  const a = normalizeVersion(latest)
    .split(/[.+-]/)
    .map((p) => parseInt(p.replace(/\D/g, ''), 10) || 0);
  const b = normalizeVersion(current)
    .split(/[.+-]/)
    .map((p) => parseInt(p.replace(/\D/g, ''), 10) || 0);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

function downloadFileOnce(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    if (!isTrustedSetupUrl(url) && !isTrustedDownloadHost(url)) {
      reject(new Error('Installer URL is not from the trusted ARK releases feed.'));
      return;
    }
    const follow = (currentUrl, redirectsLeft) => {
      if (!/^https:\/\//i.test(currentUrl) || !isTrustedDownloadHost(currentUrl)) {
        reject(new Error('Blocked untrusted download redirect.'));
        return;
      }
      const req = https.get(
        currentUrl,
        { headers: { 'User-Agent': 'ARK-Desktop', Accept: '*/*' } },
        (res) => {
          const code = res.statusCode || 0;
          if ([301, 302, 303, 307, 308].includes(code) && res.headers.location) {
            if (redirectsLeft <= 0) {
              reject(new Error('Too many redirects'));
              return;
            }
            res.resume();
            let next = res.headers.location;
            try {
              next = new URL(next, currentUrl).href;
            } catch {
              reject(new Error('Invalid redirect'));
              return;
            }
            follow(next, redirectsLeft - 1);
            return;
          }
          if (code !== 200) {
            res.resume();
            reject(new Error(`Download failed (${code})`));
            return;
          }
          const total = parseInt(res.headers['content-length'] || '0', 10) || 0;
          let received = 0;
          const out = fs.createWriteStream(dest);
          res.on('data', (chunk) => {
            received += chunk.length;
            if (total > 0 && onProgress) {
              onProgress(Math.min(99, Math.round((received / total) * 100)));
            }
          });
          res.pipe(out);
          out.on('finish', () => out.close(() => {
            if (onProgress) onProgress(100);
            resolve({ bytes: received });
          }));
          out.on('error', reject);
        },
      );
      req.on('error', reject);
      req.setTimeout(10 * 60_000, () => req.destroy(new Error('Download timeout')));
    };
    follow(url, 8);
  });
}

/** Installer download with retries on gateway errors / timeouts. */
async function downloadFile(url, dest, onProgress) {
  const retries = 3;
  let lastErr = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await downloadFileOnce(url, dest, onProgress);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err || '');
      const transient = /\(429\)|\(502\)|\(503\)|\(504\)|timeout/i.test(msg);
      try {
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
      } catch {
        /* ignore */
      }
      if (!transient || attempt === retries - 1) {
        if (/\(429\)|\(502\)|\(503\)|\(504\)/.test(msg)) {
          throw new Error('GitHub is temporarily unavailable — try the update again in a moment.');
        }
        throw err;
      }
      await sleep(1000 * (attempt + 1));
    }
  }
  throw lastErr || new Error('Download failed');
}

function fileSha512Base64(filePath) {
  const hash = crypto.createHash('sha512');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('base64');
}

function parseLatestYmlSha512(ymlText) {
  const text = String(ymlText || '');
  // Prefer top-level sha512 (electron-builder), then first files[].sha512.
  const top = text.match(/^\s*sha512:\s*([A-Za-z0-9+/=]+)\s*$/m);
  if (top?.[1]) return top[1].trim();
  const nested = text.match(/^\s*-\s*url:.*\n(?:.*\n)*?\s*sha512:\s*([A-Za-z0-9+/=]+)/m);
  return nested?.[1]?.trim() || '';
}

function fetchTrustedText(url) {
  return new Promise((resolve, reject) => {
    if (!/^https:\/\/github\.com\/DrMeji\/Ark\/releases\/download\//i.test(url)
      && !isTrustedDownloadHost(url)) {
      reject(new Error('Untrusted metadata URL'));
      return;
    }
    const follow = (currentUrl, redirectsLeft) => {
      if (!/^https:\/\//i.test(currentUrl) || !isTrustedDownloadHost(currentUrl)) {
        reject(new Error('Blocked untrusted metadata redirect'));
        return;
      }
      const req = https.get(
        currentUrl,
        { headers: { 'User-Agent': 'ARK-Desktop', Accept: '*/*' } },
        (res) => {
          const code = res.statusCode || 0;
          if ([301, 302, 303, 307, 308].includes(code) && res.headers.location) {
            if (redirectsLeft <= 0) {
              reject(new Error('Too many redirects'));
              return;
            }
            res.resume();
            let next = res.headers.location;
            try {
              next = new URL(next, currentUrl).href;
            } catch {
              reject(new Error('Invalid redirect'));
              return;
            }
            follow(next, redirectsLeft - 1);
            return;
          }
          if (code !== 200) {
            res.resume();
            reject(new Error(`Metadata fetch failed (${code})`));
            return;
          }
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        },
      );
      req.on('error', reject);
      req.setTimeout(60_000, () => req.destroy(new Error('Metadata timeout')));
    };
    follow(url, 8);
  });
}

/** Verify downloaded Setup.exe against latest.yml sha512 when the asset exists. */
async function verifyDownloadedSetup(dest, versionTag) {
  const ver = normalizeVersion(versionTag);
  if (!ver) return { ok: true, skipped: true };
  const ymlUrl = `https://github.com/${UPDATE_REPO}/releases/download/v${ver}/latest.yml`;
  let yml;
  try {
    yml = await fetchTrustedText(ymlUrl);
  } catch {
    // Older releases may lack latest.yml — size gate still applies.
    return { ok: true, skipped: true };
  }
  const expected = parseLatestYmlSha512(yml);
  if (!expected) return { ok: true, skipped: true };
  const actual = fileSha512Base64(dest);
  if (actual !== expected) {
    return { ok: false, error: 'Installer hash mismatch. Update aborted.' };
  }
  return { ok: true, skipped: false };
}

function resolveUpdateIcon() {
  const candidates = [
    path.join(__dirname, '..', 'build', 'icon.png'),
    path.join(__dirname, '..', 'public', 'ark-icon.png'),
    path.join(app.getAppPath(), 'build', 'icon.png'),
    path.join(app.getAppPath(), 'dist', 'ark-icon.png'),
    path.join(process.resourcesPath || '', 'app.asar', 'dist', 'ark-icon.png'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'build', 'icon.png'),
  ];
  for (const src of candidates) {
    try {
      if (src && fs.existsSync(src)) return src;
    } catch {
      /* try next */
    }
  }
  return null;
}

function resolveUpdateIco() {
  const candidates = [
    path.join(__dirname, '..', 'build', 'icon.ico'),
    path.join(app.getAppPath(), 'build', 'icon.ico'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'build', 'icon.ico'),
    path.join(process.resourcesPath || '', 'icon.ico'),
  ];
  for (const src of candidates) {
    try {
      if (src && fs.existsSync(src)) return src;
    } catch {
      /* try next */
    }
  }
  return null;
}

const SPLASH_W = 480;
const SPLASH_H = 320;
const SPLASH_ICON_PX = 120;
const SPLASH_ICON_GAP = 28;
const SPLASH_TRACK_W = 280;
const SPLASH_TRACK_H = 10;
/** Panel + slightly darker outer so HTA can show a rounded inset box. */
const SPLASH_BG = '#161618';
const SPLASH_OUTER_BG = '#0c0c0e';
const SPLASH_CARD_BG = SPLASH_BG;
/** Rounded box on all four corners. */
const SPLASH_RADIUS = 28;

function splashRobotSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="${SPLASH_ICON_PX}" height="${SPLASH_ICON_PX}" aria-hidden="true" class="splash-ark-icon" style="display:block;margin:0 auto;">
    <defs>
      <clipPath id="splash-inner-clip">
        <rect x="14" y="14" width="52" height="52" rx="16"/>
      </clipPath>
      <linearGradient id="splash-shimmer-grad" gradientUnits="userSpaceOnUse" x1="12" y1="12" x2="68" y2="68">
        <stop offset="0%" stop-color="rgb(56 189 248)" stop-opacity="0.22"/>
        <stop offset="45%" stop-color="rgb(129 140 248)" stop-opacity="0.16"/>
        <stop offset="100%" stop-color="rgb(52 211 153)" stop-opacity="0.14"/>
      </linearGradient>
    </defs>
    <rect x="14" y="14" width="52" height="52" rx="16" fill="none" stroke="#f4f4f5" stroke-width="2.2"/>
    <g clip-path="url(#splash-inner-clip)">
      <rect x="6" y="6" width="68" height="68" fill="url(#splash-shimmer-grad)" class="splash-shimmer"/>
    </g>
    <line x1="31" y1="32" x2="31" y2="48" stroke="#f4f4f5" stroke-width="3.4" stroke-linecap="round"/>
    <line x1="49" y1="32" x2="49" y2="48" stroke="#f4f4f5" stroke-width="3.4" stroke-linecap="round"/>
  </svg>`;
}

/** Updating splash always uses inline SVG. build/icon.png still has legacy ears/antenna art. */
function splashIconMarkup() {
  return splashRobotSvg();
}

/** One solid rounded box: icon centered, progress bar directly under it. */
function splashShellCss(opts = {}) {
  const hta = Boolean(opts.hta);
  if (hta) {
    // mshta = IE engine: no flex. One centered cell so the bar sits under the icon
    // (not glued to the window bottom). Inset card + darker outer shows rounded corners.
    return `
  html,body{margin:0;width:100%;height:100%;background:${SPLASH_OUTER_BG};overflow:hidden;user-select:none;}
  table.shell{width:100%;height:100%;border-collapse:collapse;background:${SPLASH_OUTER_BG};}
  td.shell-pad{padding:14px;}
  .card{width:100%;height:100%;background:${SPLASH_CARD_BG};border-radius:${SPLASH_RADIUS}px;overflow:hidden;}
  table.layout{width:100%;height:100%;border-collapse:collapse;background:${SPLASH_CARD_BG};}
  td.center{padding:0;text-align:center;vertical-align:middle;}
  .stack{width:100%;text-align:center;}
  .logo-wrap{width:${SPLASH_ICON_PX}px;height:${SPLASH_ICON_PX}px;margin:0 auto ${SPLASH_ICON_GAP}px auto;}
  .logo-wrap img{width:${SPLASH_ICON_PX}px;height:${SPLASH_ICON_PX}px;display:block;border:0;background:transparent;margin:0 auto;}
  .track{position:relative;width:${SPLASH_TRACK_W}px;height:${SPLASH_TRACK_H}px;margin:0 auto;border:1px solid #a1a1aa;background:transparent;overflow:hidden;text-align:left;border-radius:999px;}
  #fill{position:absolute;left:0;top:0;bottom:0;width:0;height:100%;background:#f4f4f5;font-size:0;line-height:0;border-radius:999px;}
`;
  }
  return `
  html,body{margin:0;width:100%;height:100%;background:transparent;color:#f4f4f5;font-family:"Segoe UI",system-ui,sans-serif;overflow:hidden;user-select:none;}
  .wrap{box-sizing:border-box;width:100%;height:100%;margin:0;padding:10px;display:flex;align-items:center;justify-content:center;background:transparent;}
  .card{box-sizing:border-box;width:100%;height:100%;max-width:100%;background:${SPLASH_CARD_BG};border-radius:${SPLASH_RADIUS}px;padding:36px 32px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${SPLASH_ICON_GAP}px;overflow:hidden;}
  .logo-wrap{margin:0 auto;width:${SPLASH_ICON_PX}px;height:${SPLASH_ICON_PX}px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
  .logo-wrap img,.logo-wrap svg{width:${SPLASH_ICON_PX}px;height:${SPLASH_ICON_PX}px;object-fit:contain;display:block;margin:0 auto;border:0;background:transparent;}
  @keyframes splashHeadShimmer{0%{transform:translate(0,0) rotate(0deg);}50%{transform:translate(6px,-4px) rotate(180deg);}100%{transform:translate(0,0) rotate(360deg);}}
  .splash-shimmer{transform-box:fill-box;transform-origin:center;animation:splashHeadShimmer 14s ease-in-out infinite;}
  .track{position:relative;width:${SPLASH_TRACK_W}px;max-width:100%;height:${SPLASH_TRACK_H}px;margin:0 auto;border-radius:999px;border:1.5px solid #a1a1aa;background:transparent;overflow:hidden;box-sizing:border-box;flex-shrink:0;text-align:left;}
  #fill{position:absolute;left:0;top:0;bottom:0;width:0%;min-width:0;height:100%;border-radius:999px;background:#f4f4f5;transition:width 140ms ease;}
`;
}

/** Inline PNG for mshta (IE). Prefer data URI so the mark never depends on a sidecar file. */
function splashMarkDataUri() {
  const src = resolveUpdateIcon();
  if (!src) return '';
  try {
    return `data:image/png;base64,${fs.readFileSync(src).toString('base64')}`;
  } catch {
    return '';
  }
}

/** CSS pause-mark for HTA when no PNG is available (IE-safe, no SVG). */
function splashHtaFallbackMark() {
  const half = Math.round(SPLASH_ICON_PX / 2);
  const barH = Math.round(SPLASH_ICON_PX * 0.22);
  const barW = Math.max(4, Math.round(SPLASH_ICON_PX * 0.045));
  return `<div style="position:relative;width:${SPLASH_ICON_PX}px;height:${SPLASH_ICON_PX}px;margin:0 auto;">
    <div style="position:absolute;left:18%;top:18%;width:64%;height:64%;border:2px solid #f4f4f5;border-radius:22%;box-sizing:border-box;"></div>
    <div style="position:absolute;left:38%;top:39%;width:${barW}px;height:${barH}px;background:#f4f4f5;border-radius:2px;"></div>
    <div style="position:absolute;left:58%;top:39%;width:${barW}px;height:${barH}px;background:#f4f4f5;border-radius:2px;"></div>
  </div>`;
}

function splashBodyMarkup(opts = {}) {
  const hta = Boolean(opts.hta);
  let icon;
  if (hta) {
    if (opts.pngDataUri) {
      icon = `<img src="${opts.pngDataUri}" width="${SPLASH_ICON_PX}" height="${SPLASH_ICON_PX}" alt="" />`;
    } else if (opts.pngName) {
      icon = `<img src="${opts.pngName}" width="${SPLASH_ICON_PX}" height="${SPLASH_ICON_PX}" alt="" />`;
    } else {
      icon = splashHtaFallbackMark();
    }
  } else {
    icon = splashIconMarkup();
  }
  if (hta) {
    return `
  <table class="shell" role="presentation"><tr><td class="shell-pad">
    <div class="card">
      <table class="layout" role="presentation"><tr><td class="center">
        <div class="stack">
          <div class="logo-wrap">${icon}</div>
          <div class="track"><div id="fill"></div></div>
        </div>
      </td></tr></table>
    </div>
  </td></tr></table>`;
  }
  return `
  <div class="card">
    <div class="logo-wrap">${icon}</div>
    <div class="track"><div id="fill"></div></div>
  </div>`;
}

function pidAlive(pid) {
  if (!pid || !Number.isFinite(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForNoOtherArkExe(exceptPid, timeoutMs, writeLog) {
  if (process.platform !== 'win32') return true;
  const keep = Number(exceptPid);
  const deadline = Date.now() + timeoutMs;

  const otherArkPids = () => {
    try {
      // CSV output: "Image Name","PID",...
      const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq ARK.exe', '/FO', 'CSV', '/NH'], {
        encoding: 'utf8',
        windowsHide: true,
      });
      const lines = String(out || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const pids = [];
      for (const line of lines) {
        const m = line.match(/"ARK\.exe"\s*,\s*"(\d+)"/i);
        if (m) pids.push(Number(m[1]));
      }
      return pids;
    } catch {
      return [];
    }
  };

  while (Date.now() < deadline) {
    const pids = otherArkPids().filter(p => Number.isFinite(p) && p > 0 && p !== keep);
    if (pids.length === 0) return true;
    writeLog?.(`waitForNoOtherArkExe still running=${pids.join(',')}`);
    await sleep(200);
  }

  return false;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * NEVER mass-kill ARK.exe by image name.
 * Electron’s GPU/renderer helpers are also named ARK.exe — killing them blanks the
 * Updating window and hangs forever on executeJavaScript (blank splash, 0% CPU).
 * Only kill the known parent PID tree.
 */
function killParentTree(parentPid, writeLog) {
  if (process.platform !== 'win32') return;
  const pid = Number(parentPid);
  if (!Number.isFinite(pid) || pid <= 0) return;
  if (pid === process.pid) return;
  try {
    spawn('taskkill', ['/F', '/PID', String(pid), '/T'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    writeLog?.(`taskkill parent tree pid=${pid}`);
  } catch (err) {
    writeLog?.(`taskkill parent failed: ${err}`);
  }
}

/** Small centered splash — robot icon + progress bar only. */
function splashHtml() {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>
${splashShellCss()}
  html,body{-webkit-app-region:drag;}
</style></head>
<body>
  <div class="wrap">
    ${splashBodyMarkup()}
  </div>
  <script>
    window.__arkSet = function(pct) {
      var n = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
      var f = document.getElementById('fill');
      if (f) f.style.width = n + '%';
    };
  </script>
</body></html>`;
}

/**
 * Independent HTML splash via mshta — not ARK.exe, so NSIS can replace the install
 * without killing this window. Stays up until main.cjs writes ark-ui-shown.flag.
 */
function splashHtaHtml({ statusPath, shownPath, alivePath, icoName, pngDataUri, pngName }) {
  const jsStr = (s) => JSON.stringify(String(s || ''));
  const icoAttr = icoName ? `\n  icon="${icoName}"` : '';
  const markData = pngDataUri || splashMarkDataUri();
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<hta:application
  id="ArkUpdateSplash"
  applicationname="ARK"
  border="none"
  caption="no"
  showintaskbar="yes"
  sysmenu="no"
  scroll="no"
  innerborder="no"
  selection="no"
  contextmenu="no"${icoAttr}
/>
<title>ARK</title>
<style>
${splashShellCss({ hta: true })}
</style>
</head>
<body>
  ${splashBodyMarkup({ hta: true, pngDataUri: markData, pngName })}
  <script language="JScript">
    var STATUS = ${jsStr(statusPath)};
    var SHOWN = ${jsStr(shownPath)};
    var ALIVE = ${jsStr(alivePath)};
    var started = (new Date()).getTime();
    var closing = false;

    function fso() { return new ActiveXObject("Scripting.FileSystemObject"); }
    function writeAlive() {
      try {
        var f = fso().CreateTextFile(ALIVE, true);
        f.WriteLine("ok");
        f.Close();
      } catch (e) {}
    }
    function readText(p) {
      try {
        if (!fso().FileExists(p)) return "";
        var t = fso().OpenTextFile(p, 1);
        var s = t.ReadAll();
        t.Close();
        return s;
      } catch (e) { return ""; }
    }
    function setUi(n) {
      n = Math.max(0, Math.min(100, Math.round(n || 0)));
      var fill = document.getElementById("fill");
      if (fill) fill.style.width = n + "%";
    }
    function parseStatus(raw) {
      var map = {};
      var lines = String(raw || "").split("\\n");
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].replace("\\r", "");
        var eq = line.indexOf("=");
        if (eq < 1) continue;
        map[line.substring(0, eq)] = line.substring(eq + 1);
      }
      return map;
    }
    function tick() {
      if (closing) return;
      if ((new Date()).getTime() - started > 600000) { window.close(); return; }
      var map = parseStatus(readText(STATUS));
      if (map.pct) setUi(parseInt(map.pct, 10) || 0);
      try { window.focus(); } catch (e2) {}
      if (readText(SHOWN)) {
        closing = true;
        setUi(100);
        setTimeout(function () { window.close(); }, 450);
      }
    }
    window.resizeTo(${SPLASH_W}, ${SPLASH_H});
    try {
      window.moveTo(Math.max(0, (screen.width - ${SPLASH_W}) / 2), Math.max(0, (screen.height - ${SPLASH_H}) / 2));
    } catch (e) {}
    writeAlive();
    setInterval(tick, 350);
    tick();
  </script>
</body>
</html>`;
}

function copySplashIcoToTemp(tempDir, destName = 'ark-update.ico') {
  const dest = path.join(tempDir, destName);
  const candidates = [
    resolveUpdateIco(),
    path.join(process.resourcesPath || '', 'icon.ico'),
    process.execPath,
  ].filter(Boolean);
  for (const src of candidates) {
    try {
      if (!src || src === dest) continue;
      if (!fs.existsSync(src)) continue;
      if (/\.exe$/i.test(src)) continue;
      fs.copyFileSync(src, dest);
      if (fs.existsSync(dest)) return dest;
    } catch {
      /* try next */
    }
  }
  return fs.existsSync(dest) ? dest : null;
}

function launchHtaSplash({ statusPath, shownPath }) {
  const temp = app.getPath('temp');
  const stamp = Date.now();
  const base = `ark-update-splash-${stamp}`;
  const htaPath = path.join(temp, `${base}.hta`);
  const alivePath = splashAliveFlagPath();
  const icoPath = copySplashIcoToTemp(temp, `${base}.ico`);
  const pngDataUri = splashMarkDataUri();
  try {
    fs.writeFileSync(
      htaPath,
      splashHtaHtml({
        statusPath,
        shownPath,
        alivePath,
        icoName: icoPath ? `${base}.ico` : '',
        pngDataUri,
      }),
      'utf8',
    );
  } catch (err) {
    return { ok: false, error: String(err), htaPath, alivePath };
  }

  const mshta = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'mshta.exe');
  try {
    spawn(mshta, [htaPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      cwd: temp,
    }).unref();
  } catch (err) {
    return { ok: false, error: String(err), htaPath, alivePath };
  }

  setTimeout(() => {
    try {
      fs.unlinkSync(htaPath);
    } catch {
      /* ignore */
    }
  }, 600_000);

  return { ok: true, htaPath, alivePath };
}

async function setSplash(win, pct) {
  if (!win || win.isDestroyed()) return;
  try {
    await Promise.race([
      win.webContents.executeJavaScript(
        `window.__arkSet && window.__arkSet(${Number(pct) || 0})`,
      ),
      sleep(600),
    ]);
  } catch {
    /* ignore */
  }
}

function runInstaller(setupPath, installDir) {
  return new Promise((resolve) => {
    const args = ['/S', '--updated', `/D=${installDir}`];
    const child = spawn(setupPath, args, {
      windowsHide: true,
      stdio: 'ignore',
      detached: false,
    });
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      resolve(124);
    }, 8 * 60_000);
    child.on('error', () => {
      clearTimeout(timer);
      resolve(1);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
  });
}

function startArk(exePath) {
  const dir = path.dirname(exePath);
  // shell:true + start helps avoid console inheritance on Windows
  if (process.platform === 'win32') {
    spawn(`"${exePath}"`, [], {
      detached: true,
      stdio: 'ignore',
      cwd: dir,
      shell: true,
      windowsHide: false,
    }).unref();
    return;
  }
  spawn(exePath, [], {
    detached: true,
    stdio: 'ignore',
    cwd: dir,
  }).unref();
}

/**
 * Standalone updater: ARK.exe --ark-updater <setupPathOrUrl> <version> <parentPid>
 */
async function runStandaloneSplash(argv) {
  const logFile = path.join(app.getPath('temp'), `ark-updater-run-${Date.now()}.log`);
  const writeLog = (m) => {
    try {
      fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${m}\n`, 'utf8');
    } catch {
      /* ignore */
    }
  };
  writeLog(`argv=${JSON.stringify(argv)}`);
  writeLog(`pid=${process.pid} exec=${process.execPath}`);
  try {
    app.setAppUserModelId('com.ark.studio');
  } catch {
    /* ignore */
  }

  const idx = argv.indexOf('--ark-updater');
  const payload = argv[idx + 1];
  const expectedVersion = normalizeVersion(argv[idx + 2] || '');
  const parentPid = parseInt(argv[idx + 3] || '', 10);

  if (!payload) {
    writeLog('missing payload');
    app.quit();
    return;
  }

  const isUrl = /^https:\/\//i.test(payload);
  const localSetup = !isUrl
    ? payload
    : path.join(app.getPath('temp'), `ARK-Setup-${expectedVersion || 'update'}.exe`);

  const iconPath = resolveUpdateIco() || resolveUpdateIcon();

  const splashPath = path.join(app.getPath('temp'), `ark-update-splash-${process.pid}.html`);
  try {
    fs.writeFileSync(splashPath, splashHtml(), 'utf8');
  } catch (err) {
    writeLog(`splash write failed: ${err}`);
  }

  clearUiShown();
  clearSplashAlive();
  const statusPath = path.join(
    app.getPath('temp'),
    `ark-update-status-${process.pid}-${Date.now()}.txt`,
  );
  const shownPath = uiShownFlagPath();
  writeUpdateStatus(statusPath, 'waiting', 8, 'Installing update', 'Installing update');

  const win = new BrowserWindow({
    width: SPLASH_W,
    height: SPLASH_H,
    frame: false,
    thickFrame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    // Transparent host so the inner card can show rounded corners (card paints the panel).
    transparent: true,
    backgroundColor: '#00000000',
    roundedCorners: true,
    hasShadow: true,
    show: false,
    alwaysOnTop: true,
    center: true,
    autoHideMenuBar: true,
    title: 'ARK',
    icon: iconPath || undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);
  try {
    win.removeMenu();
  } catch {
    /* ignore */
  }

  try {
    await win.loadFile(splashPath);
  } catch (err) {
    writeLog(`loadFile failed: ${err}; falling back to data URL`);
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml())}`);
  }

  const showElectronSplash = () => {
    try {
      if (win.isDestroyed()) return;
      win.show();
      win.center();
      win.focus();
    } catch {
      /* ignore */
    }
  };

  // ONE splash only: official HTML (HTA survives NSIS replacing ARK.exe).
  const alivePath = splashAliveFlagPath();
  try {
    if (fs.existsSync(alivePath)) fs.unlinkSync(alivePath);
  } catch {
    /* ignore */
  }
  const hta = launchHtaSplash({ statusPath, shownPath });
  writeLog(`hta splash launched ok=${hta.ok} path=${hta.htaPath || ''} err=${hta.error || ''}`);
  const htaAlive = await waitForFile(hta.alivePath || alivePath, 4500);
  writeLog(`hta alive=${htaAlive}`);
  if (!htaAlive) {
    writeLog('HTA splash did not paint; showing Electron HTML splash');
    showElectronSplash();
    await setSplash(win, 4, 'Installing update');
  } else {
    writeLog('HTA splash is up; Electron window stays hidden');
  }

  // Only then tell the parent it can quit — splash is already on screen.
  try {
    const readyPath = path.join(app.getPath('temp'), `ark-update-helper-${parentPid || '0'}.ready`);
    fs.writeFileSync(readyPath, `ok ${new Date().toISOString()}\n`, 'utf8');
    writeLog(`ready ${readyPath}`);
  } catch (err) {
    writeLog(`ready write failed: ${err}`);
  }

  const installDir = path.dirname(process.execPath);
  const arkExeTarget = path.join(
    process.env.LOCALAPPDATA || '',
    'Programs',
    'ARK',
    'ARK.exe',
  );
  const reopenExe = (arkExeTarget && fs.existsSync(arkExeTarget))
    ? arkExeTarget
    : path.join(installDir, 'ARK.exe');

  try {
    await setSplash(win, 8, 'Closing ARK');
    writeUpdateStatus(statusPath, 'waiting', 12, 'Closing ARK', 'Closing ARK');
    // Give the parent a few seconds to exit on its own, then force-kill that PID tree only.
    const softDeadline = Date.now() + 8_000;
    while (pidAlive(parentPid) && Date.now() < softDeadline) {
      await sleep(150);
    }
    if (pidAlive(parentPid) && parentPid > 0) {
      writeLog(`parent still alive after soft wait; force-killing tree pid=${parentPid}`);
      killParentTree(parentPid, writeLog);
      await sleep(1200);
    }
    writeLog(`parent exited alive=${pidAlive(parentPid)}`);
    // NSIS fails with: "Failed to uninstall old application files"
    // when any lingering ARK.exe process still holds file locks.
    // So wait until no ARK.exe remains besides this updater.
    const noOtherArk = await waitForNoOtherArkExe(process.pid, 8000, writeLog);
    writeLog(`noOtherArk exe except updater=${noOtherArk}`);
    await sleep(400);

    await setSplash(win, 18, 'Installing update');
    writeUpdateStatus(statusPath, 'waiting', 18, 'Installing update', 'Installing update');
    writeLog('past waiting — starting install prep');

    if (isUrl) {
      await setSplash(win, 12, 'Downloading update');
      writeUpdateStatus(statusPath, 'downloading', 12, 'Downloading update', 'Downloading update');
      try {
        if (fs.existsSync(localSetup)) fs.unlinkSync(localSetup);
      } catch {
        /* ignore */
      }
      await downloadFile(payload, localSetup, async (pct) => {
        const n = Math.round((pct / 100) * 40);
        await setSplash(win, n, 'Downloading update');
        writeUpdateStatus(statusPath, 'downloading', n, 'Downloading update', 'Downloading update');
      });
      writeLog('download done');
    } else {
      await setSplash(win, 24, 'Installing update');
      writeUpdateStatus(statusPath, 'waiting', 24, 'Installing update', 'Installing update');
      const exists = fs.existsSync(localSetup);
      let size = 0;
      try {
        size = exists ? fs.statSync(localSetup).size : 0;
      } catch {
        /* ignore */
      }
      writeLog(`local setup exists=${exists} size=${size} path=${localSetup}`);
      if (!exists || size < 1_000_000) throw new Error('Installer file missing or incomplete');
    }

    const installCopy = path.join(
      app.getPath('temp'),
      `ARK-Setup-install-${expectedVersion || 'update'}-${process.pid}.exe`,
    );
    try {
      fs.copyFileSync(localSetup, installCopy);
      writeLog(`copied installer to ${installCopy}`);
    } catch (err) {
      writeLog(`copy failed (${err}); installing from original path`);
    }
    const setupToRun = fs.existsSync(installCopy) ? installCopy : localSetup;

    /**
     * Do NOT run NSIS while this process still holds ARK.exe open.
     * Independent HTA splash stays until the new ARK window is shown.
     */
    writeUpdateStatus(statusPath, 'waiting', 40, 'Installing update', 'Installing update');
    await setSplash(win, 40, 'Installing update');
    writeLog(`delegate install ${setupToRun} → ${installDir}; reopen=${reopenExe}`);
    launchCmdApplyUpdate({
      setupPath: setupToRun,
      installDir,
      expectedVersion,
      parentPid: process.pid,
      arkExe: reopenExe,
      statusPath,
    });

    writeUpdateStatus(statusPath, 'waiting', 48, 'Installing update', 'Installing update');
    await setSplash(win, 48, 'Installing update');

    // Independent splash already painted — close this ARK.exe window so NSIS can replace the binary.
    try {
      if (!win.isDestroyed()) win.close();
    } catch {
      /* ignore */
    }

    writeLog('electron splash closed; independent splash stays until ARK window opens');
    await sleep(400);
  } catch (err) {
    writeLog(`error ${err instanceof Error ? err.stack || err.message : err}`);
    try {
      await setSplash(win, 100, 'Update failed');
      await sleep(3200);
    } catch {
      /* ignore */
    }
  } finally {
    writeLog('updater done');
    try {
      fs.unlinkSync(splashPath);
    } catch {
      /* ignore */
    }
    // Small delay so the apply script observes this PID as gone, then installs.
    setTimeout(() => {
      try {
        app.exit(0);
      } catch {
        process.exit(0);
      }
    }, 200);
  }
}

async function fetchReleases(repo) {
  return httpsJson(`https://api.github.com/repos/${repo}/releases?per_page=30`);
}

async function checkForUpdate() {
  const currentVersion = app.getVersion();
  // Silent check — indicator lives in the sidebar near Search, not the bottom strip.

  try {
    // Prefer the public installer feed. Private DrMeji/Ark returns 404 without a GitHub login.
    let res = await fetchReleases(UPDATE_REPO);
    let usedRepo = UPDATE_REPO;
    if ((res.status !== 200 || !Array.isArray(res.data)) && UPDATE_REPO_FALLBACK) {
      const fallback = await fetchReleases(UPDATE_REPO_FALLBACK);
      if (fallback.status === 200 && Array.isArray(fallback.data)) {
        res = fallback;
        usedRepo = UPDATE_REPO_FALLBACK;
      }
    }
    if (res.status !== 200 || !Array.isArray(res.data)) {
      const privateHint = githubHttpHint(res.status);
      sendProgress({
        status: 'error',
        percent: 0,
        message: 'Could not check for updates right now.',
        error: `HTTP ${res.status}`,
      });
      return {
        ok: false,
        newerAvailable: false,
        currentVersion,
        message: `Could not check for updates right now.${privateHint}`,
      };
    }

    const currentVer = normalizeVersion(currentVersion);

    let bestRelease = null;
    let bestNewerRelease = null;

    for (const r of res.data) {
      const tag = r?.tag_name || '';
      if (!tag) continue;

      // Track absolute max tag so we can emit a helpful "ahead of release" message.
      if (!bestRelease || isNewer(tag, bestRelease.tag_name)) {
        bestRelease = r;
      }

      if (isNewer(tag, currentVersion)) {
        if (!bestNewerRelease || isNewer(tag, bestNewerRelease.tag_name)) {
          bestNewerRelease = r;
        }
      }
    }

    if (!bestNewerRelease) {
      const latestTag = bestRelease?.tag_name || '';
      const latestVer = normalizeVersion(latestTag);
      const aheadOfRelease = Boolean(latestTag) && isNewer(currentVersion, latestTag);

      const message = aheadOfRelease
        ? `This copy is ${currentVer}. GitHub’s latest installer is still ${latestVer} — Check only sees published Releases, not commits on main.`
        : `You are on the latest published release (${currentVer}).`;

      sendProgress({
        status: 'idle',
        percent: 0,
        message,
        version: currentVersion,
      });
      return {
        ok: true,
        newerAvailable: false,
        currentVersion,
        latestTag: latestTag || '',
        message,
      };
    }

    const tag = bestNewerRelease.tag_name || '';
    const assets = Array.isArray(bestNewerRelease.assets) ? bestNewerRelease.assets : [];
    const setup = assets.find((a) => /^ARK-Setup(\.|-).*\.exe$/i.test(a.name || ''))
      || assets.find((a) => /ARK-Setup\.exe$/i.test(a.name || ''));
    const hasLatestYml = assets.some((a) => /^latest\.yml$/i.test(a.name || ''));
    const hasBlockmap = assets.some((a) => /\.blockmap$/i.test(a.name || ''));
    const setupUrl = setup?.browser_download_url || null;

    if (!setupUrl) {
      sendProgress({
        status: 'error',
        percent: 0,
        message: 'Update found but installer asset is missing.',
        version: currentVersion,
      });
      return {
        ok: false,
        newerAvailable: true,
        currentVersion,
        latestTag: tag,
        message: `Update ${tag} is listed on ${usedRepo} but ARK-Setup.exe was not found.`,
      };
    }

    sendProgress({
      status: 'available',
      percent: 0,
      message: `Update available: ${tag}`,
      version: normalizeVersion(tag),
    });

    return {
      ok: true,
      newerAvailable: true,
      currentVersion,
      latestTag: tag,
      latestName: bestNewerRelease.name || tag,
      setupAssetUrl: setupUrl,
      differential: Boolean(hasLatestYml || hasBlockmap),
      message: `Update available: ARK ${normalizeVersion(tag) || tag}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Check failed';
    sendProgress({ status: 'error', percent: 0, message: msg, error: msg });
    return {
      ok: false,
      newerAvailable: false,
      currentVersion,
      message: 'Could not check for updates right now.',
    };
  }
}

/** Status file the install CMD + handoff splash share (survives NSIS killing ARK.exe). */
function writeUpdateStatus(statusPath, stage, pct, label, sub) {
  try {
    fs.writeFileSync(
      statusPath,
      [
        `stage=${String(stage || '')}`,
        `pct=${Math.max(0, Math.min(100, Math.round(Number(pct) || 0)))}`,
        `label=${String(label || 'Installing update')}`,
        `sub=${String(sub || '')}`,
      ].join('\n') + '\n',
      'utf8',
    );
  } catch {
    /* ignore */
  }
}

/**
 * Breakaway launch via wscript + cmd fallback so Electron's job object cannot kill the updater.
 * Prefer a plain CMD apply script (no second Electron) — it cannot blank itself with taskkill.
 * Official HTA splash (launchHtaSplash / runStandaloneSplash) covers the install gap.
 */
function launchCmdApplyUpdate({ setupPath, installDir, expectedVersion, parentPid, arkExe, statusPath }) {
  const temp = app.getPath('temp');
  const stamp = Date.now();
  const cmdPath = path.join(temp, `ark-apply-update-${stamp}.cmd`);
  const vbsPath = path.join(temp, `ark-apply-update-${stamp}.vbs`);
  const logPath = path.join(temp, `ark-apply-update-${stamp}.log`);
  const readyPath = path.join(temp, `ark-update-helper-${parentPid || process.pid}.ready`);
  const statusFile = statusPath || path.join(temp, `ark-update-status-${stamp}.json`);
  const ver = normalizeVersion(expectedVersion);
  const q = (s) => String(s).replace(/"/g, '""');

  try {
    if (fs.existsSync(readyPath)) fs.unlinkSync(readyPath);
  } catch {
    /* ignore */
  }

  try {
    fs.writeFileSync(readyPath, `cmd-ready ${new Date().toISOString()}\n`, 'utf8');
  } catch {
    /* ignore */
  }

  // Plain key=value status — echo-friendly for CMD (no JSON quoting).
  const setStatus = (stage, pct, label, sub) => [
    `> "${statusFile}" echo stage=${stage}`,
    `>> "${statusFile}" echo pct=${pct}`,
    `>> "${statusFile}" echo label=${label}`,
    `>> "${statusFile}" echo sub=${sub}`,
  ].join('\r\n');

  const cmdBody = [
    '@echo off',
    'setlocal',
    `title Updating ARK ${ver}`,
    `echo [%date% %time%] apply begin>> "${logPath}"`,
    `echo Waiting for updater pid ${parentPid} to exit...>> "${logPath}"`,
    setStatus('waiting', 42, 'Closing ARK', 'Closing ARK'),
    'set /a waits=0',
    ':waitparent',
    `tasklist /FI "PID eq ${parentPid}" 2>nul | findstr /C:"${parentPid}" >nul`,
    'if not errorlevel 1 (',
    '  set /a waits+=1',
    '  if %waits% GEQ 90 (',
    `    echo timed out waiting for pid ${parentPid}>> "${logPath}"`,
    '    goto install',
    '  )',
    '  timeout /t 1 /nobreak >nul',
    '  goto waitparent',
    ')',
    ':install',
    'timeout /t 1 /nobreak >nul',
    setStatus('installing', 55, 'Installing update', 'Installing update'),
    `echo Installing ${q(setupPath)} into ${q(installDir)}>> "${logPath}"`,
    `"${setupPath}" /S --updated /D=${installDir}`,
    'set EXITCODE=%ERRORLEVEL%',
    `echo installer exit=%EXITCODE%>> "${logPath}"`,
    'if not "%EXITCODE%"=="0" (',
    '  timeout /t 2 /nobreak >nul',
    setStatus('installing', 68, 'Installing update', 'Installing update'),
    `  "${setupPath}" /S --updated /D=${installDir}`,
    '  set EXITCODE=%ERRORLEVEL%',
    `  echo installer retry exit=%EXITCODE%>> "${logPath}"`,
    ')',
    setStatus('finishing', 85, 'Installing update', 'Installing update'),
    `del /f /q "${q(uiShownFlagPath())}" >nul 2>nul`,
    'timeout /t 1 /nobreak >nul',
    setStatus('opening', 88, 'Opening ARK', 'Opening ARK'),
    `if exist "${arkExe}" (`,
    `  echo Starting ARK ${q(arkExe)}>> "${logPath}"`,
    `  start "" "${arkExe}"`,
    ') else (',
    `  echo missing ${q(arkExe)}, trying install dir>> "${logPath}"`,
    `  start "" "${installDir}\\ARK.exe"`,
    ')',
    setStatus('waiting_reopen', 94, 'Opening ARK', 'Opening ARK'),
    `echo done>> "${logPath}"`,
    'endlocal',
    'exit /b 0',
  ].join('\r\n');
  fs.writeFileSync(cmdPath, cmdBody, 'utf8');

  const vbs = [
    'On Error Resume Next',
    'Dim sh, fso, log',
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    `Set log = fso.OpenTextFile("${q(logPath)}", 8, True)`,
    'log.WriteLine "vbs apply launch"',
    'Set sh = CreateObject("WScript.Shell")',
    // 0 = hidden — never flash a terminal; GUI splash owns the UX
    `sh.Run "cmd.exe /c ""${q(cmdPath)}""", 0, False`,
    'log.WriteLine "vbs Run issued"',
    'log.Close',
  ].join('\r\n');
  fs.writeFileSync(vbsPath, vbs, 'utf8');

  const wscript = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wscript.exe');
  try {
    spawn(wscript, ['//B', '//Nologo', vbsPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      cwd: temp,
    }).unref();
  } catch {
    spawn(cmdPath, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      shell: true,
      cwd: temp,
    }).unref();
  }

  setTimeout(() => {
    for (const p of [vbsPath]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }, 30_000);

  return { logPath, readyPath, cmdPath, statusPath: statusFile };
}

function launchUpdaterBreakaway({ payload, expectedVersion, parentPid }) {
  const temp = app.getPath('temp');
  const stamp = Date.now();
  const vbsPath = path.join(temp, `ark-boot-updater-${stamp}.vbs`);
  const cmdPath = path.join(temp, `ark-boot-updater-${stamp}.cmd`);
  const logPath = path.join(temp, `ark-boot-updater-${stamp}.log`);
  const readyPath = path.join(temp, `ark-update-helper-${parentPid || process.pid}.ready`);
  const exe = process.execPath;
  const cwd = path.dirname(exe);
  const ver = normalizeVersion(expectedVersion);
  const q = (s) => String(s).replace(/"/g, '""');

  try {
    if (fs.existsSync(readyPath)) fs.unlinkSync(readyPath);
  } catch {
    /* ignore */
  }

  const vbs = [
    'On Error Resume Next',
    'Dim sh, fso, log, cmd',
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    `Set log = fso.OpenTextFile("${q(logPath)}", 8, True)`,
    'log.WriteLine "vbs launch begin"',
    'Set sh = CreateObject("WScript.Shell")',
    `sh.CurrentDirectory = "${q(cwd)}"`,
    `cmd = """${q(exe)}"" --ark-updater ""${q(payload)}"" ${ver} ${parentPid}"`,
    'log.WriteLine cmd',
    'sh.Run cmd, 1, False',
    'If Err.Number <> 0 Then log.WriteLine "Run error " & Err.Number & " " & Err.Description',
    'log.WriteLine "vbs Run issued"',
    'log.Close',
  ].join('\r\n');
  fs.writeFileSync(vbsPath, vbs, 'utf8');

  // Fallback if wscript is blocked: start "" breaks away without a lasting console title
  const cmdBody = [
    '@echo off',
    `cd /d "${cwd}"`,
    `start "" "${exe}" --ark-updater "${payload}" ${ver} ${parentPid}`,
    'exit /b 0',
  ].join('\r\n');
  fs.writeFileSync(cmdPath, cmdBody, 'utf8');

  const wscript = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wscript.exe');
  try {
    spawn(wscript, ['//B', '//Nologo', vbsPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      cwd: temp,
    }).unref();
  } catch {
    spawn(cmdPath, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      shell: true,
      cwd: temp,
    }).unref();
  }

  // Secondary delayed fallback if VBS silently failed AND updater never became ready
  setTimeout(() => {
    try {
      if (!fs.existsSync(readyPath) && !fs.existsSync(logPath)) {
        spawn(cmdPath, [], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
          shell: true,
          cwd: temp,
        }).unref();
      }
    } catch {
      /* ignore */
    }
  }, 1200);

  setTimeout(() => {
    for (const p of [vbsPath, cmdPath]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }, 25_000);

  return { logPath, readyPath };
}

async function waitForUpdaterReady(readyPath, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (readyPath && fs.existsSync(readyPath)) return true;
    } catch {
      /* ignore */
    }
    await sleep(100);
  }
  return false;
}

/** Try electron-updater differential download; returns local installer path or null. */
function tryDownloadWithElectronUpdater(expectedVersion) {
  const autoUpdater = tryElectronUpdater();
  if (!autoUpdater || !app.isPackaged) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const timer = setTimeout(() => done(null), 45_000);

    autoUpdater.once('update-downloaded', (info) => {
      clearTimeout(timer);
      try {
        const downloaded = info?.downloadedFile || info?.path;
        if (typeof downloaded === 'string' && fs.existsSync(downloaded)) {
          sendProgress({
            status: 'downloaded',
            percent: 100,
            message: 'Delta update ready',
            version: expectedVersion || info.version,
          });
          done(downloaded);
          return;
        }
      } catch {
        /* fall through */
      }
      done(null);
    });
    autoUpdater.once('error', () => {
      clearTimeout(timer);
      done(null);
    });
    autoUpdater.on('download-progress', (p) => {
      const percent = Math.max(0, Math.min(100, Math.round(p.percent || 0)));
      const display = percent >= 99 && percent < 100 ? 99 : percent;
      sendProgress({
        status: 'downloading',
        percent: display,
        message: percent >= 99 && percent < 100
          ? 'Finalizing download…'
          : `Downloading delta update… ${display}%`,
        version: expectedVersion,
      });
    });

    autoUpdater
      .checkForUpdates()
      .then((result) => {
        if (!result?.updateInfo) {
          clearTimeout(timer);
          done(null);
          return;
        }
        return autoUpdater.downloadUpdate();
      })
      .catch(() => {
        clearTimeout(timer);
        done(null);
      });
  });
}

async function downloadAndInstall(setupUrl, latestTag) {
  if (!app.isPackaged) {
    return {
      ok: false,
      message: 'Updates install only in the packaged ARK app. Use a built installer to test updates.',
    };
  }

  // Re-resolve the installer from GitHub ourselves. Never trust a renderer-supplied URL alone.
  const check = await checkForUpdate();
  if (!check?.newerAvailable || !check.setupAssetUrl) {
    return {
      ok: false,
      message: check?.message || 'No update available to download.',
    };
  }
  const resolvedUrl = String(check.setupAssetUrl);
  if (!isTrustedSetupUrl(resolvedUrl)) {
    return { ok: false, message: 'Installer URL is not from the trusted ARK releases feed.' };
  }
  if (typeof setupUrl === 'string' && setupUrl && setupUrl !== resolvedUrl) {
    return { ok: false, message: 'Installer URL mismatch. Check for updates again.' };
  }
  if (latestTag && check.latestTag && normalizeVersion(latestTag) !== normalizeVersion(check.latestTag)) {
    return { ok: false, message: 'Update tag mismatch. Check for updates again.' };
  }

  const expectedVersion = normalizeVersion(check.latestTag || latestTag || '');
  setupUrl = resolvedUrl;

  // Download stays in Settings. Splash opens only after the installer is staged (handoff).
  closeUpdateSplash();

  const handoffAndExit = async (installerPath) => {
    // Copy out of electron-updater's pending/ folder before the parent exits —
    // that directory can be cleaned or locked when the main app dies.
    const stable = path.join(
      app.getPath('temp'),
      `ARK-Setup-handoff-${expectedVersion || 'update'}.exe`,
    );
    try {
      fs.copyFileSync(installerPath, stable);
    } catch (err) {
      sendProgress({
        status: 'error',
        percent: 100,
        message: 'Could not stage the installer. Try Update again.',
        error: err instanceof Error ? err.message : 'copy failed',
      });
      return { ok: false, message: 'Could not stage the installer.' };
    }

    markPostUpdateLandChat();
    clearUiShown();
    sendProgress({
      status: 'handoff',
      percent: 100,
      message: 'Download complete. Installing…',
      version: expectedVersion,
    });

    const installDir = path.dirname(process.execPath);
    const arkExe = process.execPath;

    try {
      // Breakaway updater owns the official HTML splash (HTA). Do not open a splash
      // in this process during download — that caused a premature + duplicate screen.
      const electronHandoff = launchUpdaterBreakaway({
        payload: stable,
        expectedVersion,
        parentPid: process.pid,
      });
      const electronReady = await waitForUpdaterReady(electronHandoff.readyPath, 14_000);
      if (!electronReady) {
        const statusPath = path.join(
          app.getPath('temp'),
          `ark-update-status-fallback-${process.pid}.txt`,
        );
        launchHtaSplash({ statusPath, shownPath: uiShownFlagPath() });
        const handoff = launchCmdApplyUpdate({
          setupPath: stable,
          installDir,
          expectedVersion,
          parentPid: process.pid,
          arkExe,
          statusPath,
        });
        const ready = await waitForUpdaterReady(handoff.readyPath, 5_000);
        if (!ready) {
          sendProgress({
            status: 'error',
            percent: 100,
            message: 'Updater did not start. Try Update again, or install ARK-Setup.exe from GitHub Releases.',
            error: 'updater-ready-timeout',
          });
          return { ok: false, message: 'Updater did not start.' };
        }
      }
    } catch (err) {
      console.error('[ark] failed to launch updater', err);
      sendProgress({
        status: 'error',
        percent: 100,
        message: 'Could not start the updater. Try again.',
        error: err instanceof Error ? err.message : 'spawn failed',
      });
      return { ok: false, message: 'Could not start the updater.' };
    }

    setTimeout(() => forceExitForUpdate(), 250);
    return { ok: true, message: 'Installing update…' };
  };

  // Prefer a full Setup.exe download. electron-updater deltas previously handed a path
  // into a second Electron process that blanked itself; full download + CMD apply is reliable.
  const deltaPath = null;
  if (deltaPath) {
    return handoffAndExit(deltaPath);
  }

  if (!setupUrl || !isTrustedSetupUrl(setupUrl)) {
    return { ok: false, message: 'Missing trusted installer download URL.' };
  }

  const dest = path.join(app.getPath('temp'), `ARK-Setup-${expectedVersion || 'update'}.exe`);

  sendProgress({
    status: 'downloading',
    percent: 0,
    message: 'Downloading update...',
    version: expectedVersion,
  });

  try {
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
  } catch {
    /* ignore */
  }

  try {
    await downloadFile(setupUrl, dest, (percent) => {
      sendProgress({
        status: 'downloading',
        percent,
        message: `Downloading update... ${percent}%`,
        version: expectedVersion,
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Download failed';
    sendProgress({ status: 'error', percent: 0, message: msg, error: msg });
    return { ok: false, message: msg };
  }

  if (!fs.existsSync(dest) || fs.statSync(dest).size < 1_000_000) {
    sendProgress({
      status: 'error',
      percent: 0,
      message: 'Download looked incomplete. Try again.',
    });
    return { ok: false, message: 'Download incomplete' };
  }

  sendProgress({
    status: 'downloading',
    percent: 99,
    message: 'Verifying installer…',
    version: expectedVersion,
  });
  const verified = await verifyDownloadedSetup(dest, expectedVersion);
  if (!verified.ok) {
    try { fs.unlinkSync(dest); } catch { /* ignore */ }
    const msg = verified.error || 'Installer verification failed.';
    sendProgress({ status: 'error', percent: 0, message: msg, error: msg });
    return { ok: false, message: msg };
  }

  return handoffAndExit(dest);
}

/**
 * Official Updating splash (logo + progress bar). Used for real installs and bat preview.
 */
let updateSplashWin = null;

function closeUpdateSplash() {
  try {
    if (updateSplashWin && !updateSplashWin.isDestroyed()) updateSplashWin.close();
  } catch {
    /* ignore */
  }
  updateSplashWin = null;
}

async function setUpdateSplashPercent(pct) {
  const win = updateSplashWin;
  if (!win || win.isDestroyed()) return;
  const n = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  try {
    await win.webContents.executeJavaScript(
      `typeof window.__arkSet==='function'&&window.__arkSet(${n});`,
      true,
    );
  } catch {
    /* ignore */
  }
}

async function openUpdateSplash() {
  closeUpdateSplash();
  const iconPath = resolveUpdateIco() || resolveUpdateIcon();
  const win = new BrowserWindow({
    width: SPLASH_W,
    height: SPLASH_H,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    frame: false,
    thickFrame: false,
    transparent: true,
    backgroundColor: '#00000000',
    roundedCorners: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: true,
    center: true,
    autoHideMenuBar: true,
    title: 'ARK',
    icon: iconPath || undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  try {
    win.removeMenu();
  } catch {
    /* ignore */
  }
  win.setMenuBarVisibility(false);
  updateSplashWin = win;
  win.on('closed', () => {
    if (updateSplashWin === win) updateSplashWin = null;
  });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml())}`);
  await setUpdateSplashPercent(2);
  return win;
}

/**
 * Dev/bat only: show the official Updating splash for ~2s with a fake progress fill, then close.
 * Packaged installs must never call this — Update uses openUpdateSplash + real download instead.
 */
async function previewSplashDev(durationMs = 2000) {
  if (app.isPackaged) {
    return { ok: false, error: 'Splash preview is only available in bat/dev builds.' };
  }
  const ms = Math.max(800, Math.min(8000, Number(durationMs) || 2000));
  try {
    await openUpdateSplash();
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      if (!updateSplashWin || updateSplashWin.isDestroyed()) break;
      await setUpdateSplashPercent(Math.round((i / steps) * 100));
      await sleep(Math.floor(ms / steps));
    }
  } catch (err) {
    closeUpdateSplash();
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    closeUpdateSplash();
  }
  return { ok: true };
}

module.exports = {
  checkForUpdate,
  downloadAndInstall,
  getState,
  consumePostUpdate,
  runStandaloneSplash,
  setForceExitHook,
  markUiShown,
  clearUiShown,
  previewSplashDev,
  UPDATE_REPO,
};
