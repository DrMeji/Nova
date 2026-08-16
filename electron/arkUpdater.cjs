/**
 * In-app updates via public DrMeji/ark-dist Releases.
 * Fully silent helper (no terminals). Download + install UI stays inside ARK.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');
const { app, BrowserWindow } = require('electron');

const UPDATE_REPO = 'DrMeji/ark-dist';
const POST_UPDATE_FLAG = 'ark-post-update.json';

/** @type {{ status: string, percent: number, message: string, version?: string, error?: string } | null} */
let state = null;

function sendProgress(payload) {
  state = { ...(state || {}), ...payload };
  for (const win of BrowserWindow.getAllWindows()) {
    try {
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

function httpsJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'ARK-Desktop',
          Accept: 'application/vnd.github+json',
          ...headers,
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
          resolve({ status: res.statusCode || 0, data, headers: res.headers });
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(45_000, () => {
      req.destroy(new Error('Timeout'));
    });
  });
}

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const follow = (currentUrl, redirectsLeft) => {
      const mod = currentUrl.startsWith('http://') ? http : https;
      const req = mod.get(
        currentUrl,
        {
          headers: { 'User-Agent': 'ARK-Desktop', Accept: '*/*' },
        },
        (res) => {
          const code = res.statusCode || 0;
          if ([301, 302, 303, 307, 308].includes(code) && res.headers.location) {
            if (redirectsLeft <= 0) {
              reject(new Error('Too many redirects'));
              return;
            }
            res.resume();
            follow(res.headers.location, redirectsLeft - 1);
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
              onProgress(Math.min(99, Math.round((received / total) * 100)), received, total);
            }
          });
          res.pipe(out);
          out.on('finish', () => {
            out.close(() => resolve({ bytes: received }));
          });
          out.on('error', reject);
        },
      );
      req.on('error', reject);
      req.setTimeout(10 * 60_000, () => {
        req.destroy(new Error('Download timeout'));
      });
    };
    follow(url, 8);
  });
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

function psSingleQuote(p) {
  return `'${String(p).replace(/'/g, "''")}'`;
}

/**
 * Fully hidden PowerShell helper — no cmd, no ping, no visible terminals.
 * Waits for ARK to exit, runs silent NSIS, relaunches ARK.
 */
function launchInstallerThenRelaunch(setupPath) {
  const appExe = process.execPath;
  const temp = app.getPath('temp');
  const stamp = Date.now();
  const helperPs1 = path.join(temp, `ark-update-${stamp}.ps1`);
  const logFile = path.join(temp, `ark-update-${stamp}.log`);

  const localPrograms = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'ARK', 'ARK.exe');
  const programFiles = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'ARK', 'ARK.exe');

  const ps = `
$ErrorActionPreference = 'SilentlyContinue'
$log = ${psSingleQuote(logFile)}
function Write-Log($m) { Add-Content -Path $log -Value ("[{0}] {1}" -f (Get-Date -Format o), $m) }
Write-Log 'helper start'
$setup = ${psSingleQuote(setupPath)}
$exe = ${psSingleQuote(appExe)}
$local = ${psSingleQuote(localPrograms)}
$pf = ${psSingleQuote(programFiles)}

# Wait until ARK.exe is gone (file locks released)
$tries = 0
while ($tries -lt 90) {
  $proc = Get-Process -Name 'ARK' -ErrorAction SilentlyContinue
  if (-not $proc) { break }
  Start-Sleep -Seconds 1
  $tries++
}
Start-Sleep -Seconds 2
Write-Log 'ARK exited; starting silent install'

if (Test-Path -LiteralPath $setup) {
  # /S = silent NSIS; --updated marks upgrade so app data is preserved
  $p = Start-Process -FilePath $setup -ArgumentList @('/S','--updated') -Wait -PassThru -WindowStyle Hidden
  Write-Log ("installer exit=" + $p.ExitCode)
} else {
  Write-Log 'setup missing'
}

Start-Sleep -Seconds 2

$target = $null
foreach ($c in @($exe, $local, $pf)) {
  if ($c -and (Test-Path -LiteralPath $c)) { $target = $c; break }
}
if ($target) {
  Write-Log ("starting " + $target)
  Start-Process -FilePath $target -WindowStyle Normal
} else {
  Write-Log 'ARK.exe not found for relaunch'
}

Start-Sleep -Seconds 1
Remove-Item -LiteralPath ${psSingleQuote(helperPs1)} -Force -ErrorAction SilentlyContinue
`;

  fs.writeFileSync(helperPs1, ps, 'utf8');

  // Spawn PowerShell completely hidden. Do NOT use cmd/ping.
  const child = spawn(
    path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-WindowStyle', 'Hidden',
      '-File', helperPs1,
    ],
    {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      cwd: temp,
    },
  );
  child.unref();
}

async function checkForUpdate() {
  const currentVersion = app.getVersion();
  sendProgress({ status: 'checking', percent: 0, message: 'Checking for updates…', version: currentVersion });

  try {
    const res = await httpsJson(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`);
    if (res.status !== 200 || !res.data) {
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
        message: 'Could not check for updates right now. Try again in a moment.',
      };
    }

    const tag = res.data.tag_name || '';
    const assets = Array.isArray(res.data.assets) ? res.data.assets : [];
    const setup = assets.find((a) => /^ARK-Setup(\.|-).*\.exe$/i.test(a.name || ''))
      || assets.find((a) => /ARK-Setup\.exe$/i.test(a.name || ''));
    const newer = tag ? isNewer(tag, currentVersion) : false;
    const setupUrl = setup?.browser_download_url || null;

    if (!newer) {
      sendProgress({
        status: 'idle',
        percent: 0,
        message: `You are on the latest release (${currentVersion}).`,
        version: currentVersion,
      });
      return {
        ok: true,
        newerAvailable: false,
        currentVersion,
        latestTag: tag,
        message: `You are on the latest release (${currentVersion}).`,
      };
    }

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
        message: `Update ${tag} is listed but ARK-Setup.exe was not found.`,
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
      latestName: res.data.name || tag,
      setupAssetUrl: setupUrl,
      message: `Update available: ${res.data.name || tag}`,
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

async function downloadAndInstall(setupUrl, latestTag) {
  if (!app.isPackaged) {
    return {
      ok: false,
      message: 'Updates install only in the packaged ARK app (not electron:dev).',
    };
  }
  if (typeof setupUrl !== 'string' || !/^https:\/\//i.test(setupUrl)) {
    return { ok: false, message: 'Missing installer download URL.' };
  }

  const dest = path.join(app.getPath('temp'), `ARK-Setup-${normalizeVersion(latestTag || 'update')}.exe`);
  try {
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
  } catch {
    /* ignore */
  }

  sendProgress({
    status: 'downloading',
    percent: 0,
    message: 'Updating…',
    version: normalizeVersion(latestTag || ''),
  });

  try {
    await downloadFile(setupUrl, dest, (percent) => {
      sendProgress({
        status: 'downloading',
        percent,
        message: 'Updating…',
        version: normalizeVersion(latestTag || ''),
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Download failed';
    sendProgress({ status: 'error', percent: 0, message: msg, error: msg });
    return { ok: false, message: msg };
  }

  markPostUpdateLandChat();
  sendProgress({
    status: 'installing',
    percent: 100,
    message: 'Updating…',
    version: normalizeVersion(latestTag || ''),
  });

  setTimeout(() => {
    try {
      launchInstallerThenRelaunch(dest);
    } catch (err) {
      console.error('[ark] failed to launch installer helper', err);
      sendProgress({
        status: 'error',
        percent: 100,
        message: 'Could not start the installer. Try again.',
        error: err instanceof Error ? err.message : 'spawn failed',
      });
      return;
    }
    setTimeout(() => app.quit(), 800);
  }, 1800);

  return { ok: true, message: 'Updating…' };
}

module.exports = {
  checkForUpdate,
  downloadAndInstall,
  getState,
  consumePostUpdate,
  UPDATE_REPO,
};
