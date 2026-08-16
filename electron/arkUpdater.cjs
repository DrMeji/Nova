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
 * Spawns a small WinForms "Updating" splash (separate from ARK), waits for ARK
 * to quit, silently installs, then relaunches ARK and closes the splash.
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

$log = ${psSingleQuote(logFile)}
function Write-Log($m) { Add-Content -Path $log -Value ("[{0}] {1}" -f (Get-Date -Format o), $m) }
Write-Log 'splash helper start'

$setup = ${psSingleQuote(setupPath)}
$exe = ${psSingleQuote(appExe)}
$local = ${psSingleQuote(localPrograms)}
$pf = ${psSingleQuote(programFiles)}
$icon = ${iconPath ? psSingleQuote(iconPath) : "''"}

$form = New-Object System.Windows.Forms.Form
$form.Text = 'ARK'
$form.Width = 380
$form.Height = 300
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.ControlBox = $false
$form.TopMost = $true
$form.BackColor = [System.Drawing.Color]::FromArgb(12, 12, 12)
$form.ShowInTaskbar = $true

$pic = New-Object System.Windows.Forms.PictureBox
$pic.Width = 72
$pic.Height = 72
$pic.Left = [int](($form.ClientSize.Width - 72) / 2)
$pic.Top = 36
$pic.SizeMode = 'Zoom'
if ($icon -and (Test-Path -LiteralPath $icon)) {
  try { $pic.Image = [System.Drawing.Image]::FromFile($icon) } catch {}
}
$form.Controls.Add($pic)

$title = New-Object System.Windows.Forms.Label
$title.Text = 'Updating'
$title.ForeColor = [System.Drawing.Color]::FromArgb(245, 245, 245)
$title.Font = New-Object System.Drawing.Font('Segoe UI', 12, [System.Drawing.FontStyle]::Bold)
$title.AutoSize = $false
$title.Width = $form.ClientSize.Width
$title.Height = 28
$title.Top = 122
$title.Left = 0
$title.TextAlign = 'MiddleCenter'
$form.Controls.Add($title)

$pct = New-Object System.Windows.Forms.Label
$pct.Text = '0%'
$pct.ForeColor = [System.Drawing.Color]::FromArgb(160, 160, 160)
$pct.Font = New-Object System.Drawing.Font('Segoe UI', 10)
$pct.AutoSize = $false
$pct.Width = $form.ClientSize.Width
$pct.Height = 22
$pct.Top = 150
$pct.Left = 0
$pct.TextAlign = 'MiddleCenter'
$form.Controls.Add($pct)

$bar = New-Object System.Windows.Forms.ProgressBar
$bar.Minimum = 0
$bar.Maximum = 100
$bar.Value = 0
$bar.Width = 260
$bar.Height = 12
$bar.Left = [int](($form.ClientSize.Width - 260) / 2)
$bar.Top = 186
$bar.Style = 'Continuous'
$form.Controls.Add($bar)

function Set-Progress([int]$value) {
  if ($value -lt 0) { $value = 0 }
  if ($value -gt 100) { $value = 100 }
  $bar.Value = $value
  $pct.Text = ("{0}%" -f $value)
  [System.Windows.Forms.Application]::DoEvents()
}

$form.Show()
$form.Activate()
[System.Windows.Forms.Application]::DoEvents()
Set-Progress 5
Write-Log 'splash visible; waiting for ARK exit'

$tries = 0
while ($tries -lt 120) {
  $alive = Get-Process -Name 'ARK' -ErrorAction SilentlyContinue
  if (-not $alive) { break }
  $v = [Math]::Min(18, 5 + [int]($tries / 4))
  Set-Progress $v
  Start-Sleep -Milliseconds 250
  $tries++
}
Start-Sleep -Milliseconds 800
Set-Progress 22
Write-Log 'ARK exited; starting silent install'

if (Test-Path -LiteralPath $setup) {
  $p = Start-Process -FilePath $setup -ArgumentList @('/S','--updated') -PassThru -WindowStyle Hidden
  $tick = 22
  while ($p -and -not $p.HasExited) {
    $tick = [Math]::Min(90, $tick + 1)
    Set-Progress $tick
    Start-Sleep -Milliseconds 350
    try { $p.Refresh() } catch { break }
  }
  Write-Log ("installer exit=" + $(if ($p) { $p.ExitCode } else { 'n/a' }))
} else {
  Write-Log 'setup missing'
  Set-Progress 90
}

Start-Sleep -Milliseconds 600
Set-Progress 96

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

Set-Progress 100
$title.Text = 'Done'
[System.Windows.Forms.Application]::DoEvents()
Start-Sleep -Milliseconds 700
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

  // -STA required for WinForms. Console stays hidden; only the splash form is visible.
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
    setTimeout(() => app.quit(), 500);
  }, 900);

  return { ok: true, message: 'Download complete. Closing ARK to finish updating…' };
}

module.exports = {
  checkForUpdate,
  downloadAndInstall,
  getState,
  consumePostUpdate,
  UPDATE_REPO,
};
