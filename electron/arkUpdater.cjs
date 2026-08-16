/**
 * In-app updates via public DrMeji/ark-dist Releases.
 *
 * Flow:
 * 1) Download inside ARK (progress in Settings / overlay)
 * 2) Main app closes
 * 3) Small external Updating splash (logo + bar + %) opens
 * 4) Silent install finishes → splash closes → ARK reopens
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

function resolveUpdateIcon(tempDir) {
  const dest = path.join(tempDir, 'ark-update-icon.png');
  const candidates = [
    path.join(app.getAppPath(), 'dist', 'ark-icon.png'),
    path.join(__dirname, '..', 'dist', 'ark-icon.png'),
    path.join(__dirname, '..', 'public', 'ark-icon.png'),
    path.join(__dirname, '..', 'build', 'icon.png'),
  ];
  for (const src of candidates) {
    try {
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        return dest;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Spawns a small Discord-style Updating splash (compact box, not fullscreen).
 * Waits for ARK to quit, silently installs, relaunches ARK immediately, closes splash.
 */
function launchInstallerThenRelaunch(setupPath) {
  const appExe = process.execPath;
  const temp = app.getPath('temp');
  const stamp = Date.now();
  const helperPs1 = path.join(temp, `ark-update-${stamp}.ps1`);
  const logFile = path.join(temp, `ark-update-${stamp}.log`);
  const iconPath = resolveUpdateIcon(temp);

  const localPrograms = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'ARK', 'ARK.exe');
  const programFiles = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'ARK', 'ARK.exe');

  const ps = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$log = ${psSingleQuote(logFile)}
function Write-Log($m) { Add-Content -Path $log -Value ("[{0}] {1}" -f (Get-Date -Format o), $m) }
Write-Log 'splash helper start'

$setup = ${psSingleQuote(setupPath)}
$exe = ${psSingleQuote(appExe)}
$local = ${psSingleQuote(localPrograms)}
$pf = ${psSingleQuote(programFiles)}
$icon = ${iconPath ? psSingleQuote(iconPath) : "''"}

# Compact Discord-style box — locked pixel size (no DPI stretch to fullscreen)
$boxW = 320
$boxH = 200
$form = New-Object System.Windows.Forms.Form
$form.Text = 'ARK'
$form.FormBorderStyle = 'None'
$form.StartPosition = 'Manual'
$form.AutoScaleMode = 'None'
$form.Size = New-Object System.Drawing.Size($boxW, $boxH)
$form.MinimumSize = $form.Size
$form.MaximumSize = $form.Size
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.ControlBox = $false
$form.TopMost = $true
$form.ShowInTaskbar = $true
$form.BackColor = [System.Drawing.Color]::FromArgb(35, 36, 40)
$wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$form.Location = New-Object System.Drawing.Point(
  [int]($wa.Left + ($wa.Width - $boxW) / 2),
  [int]($wa.Top + ($wa.Height - $boxH) / 2)
)

$pic = New-Object System.Windows.Forms.PictureBox
$pic.Size = New-Object System.Drawing.Size(52, 64)
$pic.Location = New-Object System.Drawing.Point([int](($boxW - 52) / 2), 28)
$pic.SizeMode = 'Zoom'
if ($icon -and (Test-Path -LiteralPath $icon)) {
  try { $pic.Image = [System.Drawing.Image]::FromFile($icon) } catch {}
}
$form.Controls.Add($pic)

$title = New-Object System.Windows.Forms.Label
$title.Text = 'Updating…'
$title.ForeColor = [System.Drawing.Color]::White
$title.Font = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Bold)
$title.AutoSize = $false
$title.Size = New-Object System.Drawing.Size($boxW, 24)
$title.Location = New-Object System.Drawing.Point(0, 108)
$title.TextAlign = 'MiddleCenter'
$form.Controls.Add($title)

$track = New-Object System.Windows.Forms.Panel
$track.Size = New-Object System.Drawing.Size(200, 5)
$track.Location = New-Object System.Drawing.Point([int](($boxW - 200) / 2), 152)
$track.BackColor = [System.Drawing.Color]::FromArgb(50, 51, 56)
$form.Controls.Add($track)

$fill = New-Object System.Windows.Forms.Panel
$fill.Size = New-Object System.Drawing.Size(6, 5)
$fill.Location = New-Object System.Drawing.Point(0, 0)
$fill.BackColor = [System.Drawing.Color]::FromArgb(176, 180, 188)
$track.Controls.Add($fill)

function Set-Progress([int]$value) {
  if ($value -lt 0) { $value = 0 }
  if ($value -gt 100) { $value = 100 }
  $w = [Math]::Max(6, [int](200 * ($value / 100.0)))
  $fill.Width = $w
  [System.Windows.Forms.Application]::DoEvents()
}

function Get-ArkTarget {
  foreach ($c in @($exe, $local, $pf)) {
    if ($c -and (Test-Path -LiteralPath $c)) { return $c }
  }
  return $null
}

function Start-ArkNow {
  $target = Get-ArkTarget
  if (-not $target) { Write-Log 'ARK.exe not found for relaunch'; return $false }
  for ($i = 0; $i -lt 20; $i++) {
    try {
      Start-Process -FilePath $target -WindowStyle Normal -ErrorAction Stop
      Write-Log ("started " + $target)
      return $true
    } catch {
      Start-Sleep -Milliseconds 100
    }
  }
  Write-Log 'Start-Process retries exhausted'
  return $false
}

$form.Show()
$form.Activate()
[System.Windows.Forms.Application]::DoEvents()
Set-Progress 4
Write-Log 'splash visible; waiting for ARK exit'

# Fast poll until ARK.exe is gone (ignore this helper — we are powershell)
$deadline = (Get-Date).AddSeconds(20)
while ((Get-Date) -lt $deadline) {
  $alive = @(Get-Process -Name 'ARK' -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $PID })
  if ($alive.Count -eq 0) { break }
  Set-Progress 8
  [System.Windows.Forms.Application]::DoEvents()
  Start-Sleep -Milliseconds 50
}
Set-Progress 12
Write-Log 'ARK exited; starting silent install'

$launched = $false
if (Test-Path -LiteralPath $setup) {
  $p = Start-Process -FilePath $setup -ArgumentList @('/S','--updated') -PassThru -WindowStyle Hidden
  $tick = 15
  while ($p -and -not $p.HasExited) {
    # If NSIS already opened ARK, close splash immediately — do not wait for installer cleanup
    $running = @(Get-Process -Name 'ARK' -ErrorAction SilentlyContinue)
    if ($running.Count -gt 0) {
      Write-Log 'ARK process appeared during install; closing splash'
      $launched = $true
      break
    }
    $tick = [Math]::Min(90, $tick + 3)
    Set-Progress $tick
    Start-Sleep -Milliseconds 60
    try { $p.Refresh() } catch { break }
  }
  Write-Log ("installer exit=" + $(if ($p -and $p.HasExited) { $p.ExitCode } else { 'still-running-or-n/a' }))
} else {
  Write-Log 'setup missing'
}

if (-not $launched) {
  Set-Progress 96
  $launched = Start-ArkNow
}

Set-Progress 100
[System.Windows.Forms.Application]::DoEvents()
$form.Close()
$form.Dispose()

Remove-Item -LiteralPath ${psSingleQuote(helperPs1)} -Force -ErrorAction SilentlyContinue
if ($icon) { Remove-Item -LiteralPath $icon -Force -ErrorAction SilentlyContinue }
Write-Log 'splash helper done'
`;

  fs.writeFileSync(helperPs1, ps, 'utf8');

  const powershell = path.join(
    process.env.SystemRoot || 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );

  const child = spawn(
    powershell,
    [
      '-NoProfile',
      '-STA',
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
    message: 'Downloading update…',
    version: normalizeVersion(latestTag || ''),
  });

  try {
    await downloadFile(setupUrl, dest, (percent) => {
      sendProgress({
        status: 'downloading',
        percent,
        message: `Downloading update… ${percent}%`,
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
    message: 'Download complete. Closing ARK to finish updating…',
    version: normalizeVersion(latestTag || ''),
  });

  // Start the external Updating splash, then quit so the installer can replace files.
  setTimeout(() => {
    try {
      launchInstallerThenRelaunch(dest);
    } catch (err) {
      console.error('[ark] failed to launch update splash', err);
      sendProgress({
        status: 'error',
        percent: 100,
        message: 'Could not start the updater. Try again.',
        error: err instanceof Error ? err.message : 'spawn failed',
      });
      return;
    }
    setTimeout(() => app.quit(), 150);
  }, 350);

  return { ok: true, message: 'Download complete. Closing ARK to finish updating…' };
}

module.exports = {
  checkForUpdate,
  downloadAndInstall,
  getState,
  consumePostUpdate,
  UPDATE_REPO,
};
