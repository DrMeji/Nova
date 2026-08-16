/**
 * In-app updates via public DrMeji/ark-dist Releases.
 *
 * Discord-style flow:
 * 1) User clicks Update → ARK quits immediately
 * 2) Small external splash (logo + bar) downloads + silent-installs
 * 3) Splash verifies the new build, then starts ARK.exe
 *
 * Critical: the splash helper must break away from Electron's job object,
 * otherwise Windows kills it when ARK exits and the update never installs.
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
 * Discord-style splash: download (if needed) → silent install → relaunch.
 * Spawned via cmd `start` so Electron quitting cannot kill this helper.
 */
function launchUpdateSplash({ setupPath, setupUrl, expectedVersion }) {
  const appExe = process.execPath;
  const installDir = path.dirname(appExe);
  const temp = app.getPath('temp');
  const stamp = Date.now();
  const helperPs1 = path.join(temp, `ark-update-${stamp}.ps1`);
  const logFile = path.join(temp, `ark-update-${stamp}.log`);
  const iconPath = resolveUpdateIcon(temp);
  const dest =
    setupPath ||
    path.join(temp, `ARK-Setup-${normalizeVersion(expectedVersion || 'update')}.exe`);

  const localPrograms = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'ARK', 'ARK.exe');
  const programFiles = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'ARK', 'ARK.exe');

  const ps = `
$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$log = ${psSingleQuote(logFile)}
function Write-Log($m) {
  try { Add-Content -Path $log -Value ("[{0}] {1}" -f (Get-Date -Format o), $m) } catch {}
}
Write-Log 'splash helper start (breakaway)'

$setup = ${psSingleQuote(dest)}
$setupUrl = ${setupUrl ? psSingleQuote(setupUrl) : "''"}
$expected = ${psSingleQuote(normalizeVersion(expectedVersion || ''))}
$exe = ${psSingleQuote(appExe)}
$installDir = ${psSingleQuote(installDir)}
$local = ${psSingleQuote(localPrograms)}
$pf = ${psSingleQuote(programFiles)}
$icon = ${iconPath ? psSingleQuote(iconPath) : "''"}

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

function Set-Progress([int]$value, [string]$label) {
  if ($value -lt 0) { $value = 0 }
  if ($value -gt 100) { $value = 100 }
  $w = [Math]::Max(6, [int](200 * ($value / 100.0)))
  $fill.Width = $w
  if ($label) { $title.Text = $label }
  [System.Windows.Forms.Application]::DoEvents()
}

function Get-ArkTarget {
  foreach ($c in @($exe, $local, $pf)) {
    if ($c -and (Test-Path -LiteralPath $c)) { return $c }
  }
  return $null
}

function Get-FileVersion([string]$path) {
  try {
    if (-not (Test-Path -LiteralPath $path)) { return '' }
    return [string](Get-Item -LiteralPath $path).VersionInfo.FileVersion
  } catch { return '' }
}

function Start-ArkNow {
  $target = Get-ArkTarget
  if (-not $target) { Write-Log 'ARK.exe not found for relaunch'; return $false }
  for ($i = 0; $i -lt 25; $i++) {
    try {
      Start-Process -FilePath $target -WorkingDirectory (Split-Path -Parent $target) -WindowStyle Normal -ErrorAction Stop
      Write-Log ("started " + $target)
      return $true
    } catch {
      Write-Log ("start retry " + $i + ": " + $_.Exception.Message)
      Start-Sleep -Milliseconds 200
    }
  }
  return $false
}

function Wait-ArkExit {
  $deadline = (Get-Date).AddSeconds(45)
  while ((Get-Date) -lt $deadline) {
    $alive = @(Get-Process -Name 'ARK' -ErrorAction SilentlyContinue)
    if ($alive.Count -eq 0) {
      # Extra beat so file locks release
      Start-Sleep -Milliseconds 400
      $alive = @(Get-Process -Name 'ARK' -ErrorAction SilentlyContinue)
      if ($alive.Count -eq 0) { return $true }
    }
    Set-Progress 6 'Waiting to update…'
    Start-Sleep -Milliseconds 80
  }
  Write-Log 'ARK still running after wait; forcing kill'
  Get-Process -Name 'ARK' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500
  return $true
}

function Download-Setup {
  if ($setup -and (Test-Path -LiteralPath $setup) -and ((Get-Item -LiteralPath $setup).Length -gt 1000000)) {
    Write-Log 'setup already on disk'
    return $true
  }
  if (-not $setupUrl) {
    Write-Log 'no setup url and no local file'
    return $false
  }
  Set-Progress 8 'Downloading update…'
  Write-Log ("download " + $setupUrl)
  try {
    $tmp = $setup + '.partial'
    if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
    $req = [System.Net.HttpWebRequest]::Create($setupUrl)
    $req.UserAgent = 'ARK-Desktop'
    $req.AllowAutoRedirect = $true
    $req.Timeout = 600000
    $resp = $req.GetResponse()
    $total = [int64]$resp.ContentLength
    $stream = $resp.GetResponseStream()
    $out = [System.IO.File]::Open($tmp, 'Create')
    $buf = New-Object byte[] 65536
    $got = [int64]0
    while (($n = $stream.Read($buf, 0, $buf.Length)) -gt 0) {
      $out.Write($buf, 0, $n)
      $got += $n
      if ($total -gt 0) {
        $pct = [Math]::Min(55, 8 + [int](47 * ($got / $total)))
        Set-Progress $pct 'Downloading update…'
      }
    }
    $out.Close()
    $stream.Close()
    $resp.Close()
    if (Test-Path -LiteralPath $setup) { Remove-Item -LiteralPath $setup -Force -ErrorAction SilentlyContinue }
    Move-Item -LiteralPath $tmp -Destination $setup -Force
    Write-Log ("download ok bytes=" + $got)
    return $true
  } catch {
    Write-Log ("download failed: " + $_.Exception.Message)
    return $false
  }
}

function Install-Setup {
  if (-not (Test-Path -LiteralPath $setup)) { return $false }
  Set-Progress 60 'Installing…'
  Write-Log ("running installer " + $setup)
  # /D= must be last; no quotes
  $args = @('/S', '--updated', ('/D=' + $installDir))
  $p = Start-Process -FilePath $setup -ArgumentList $args -PassThru -WindowStyle Hidden
  $tick = 62
  while ($p -and -not $p.HasExited) {
    $tick = [Math]::Min(90, $tick + 1)
    Set-Progress $tick 'Installing…'
    Start-Sleep -Milliseconds 100
    try { $p.Refresh() } catch { break }
  }
  $code = if ($p) { $p.ExitCode } else { 'n/a' }
  Write-Log ("installer exit=" + $code)
  return ($p -and $p.ExitCode -eq 0)
}

$form.Show()
$form.Activate()
[System.Windows.Forms.Application]::DoEvents()
Set-Progress 3 'Updating…'
Write-Log 'splash visible'

try {
  Wait-ArkExit | Out-Null
  Set-Progress 10 'Downloading update…'

  if (-not (Download-Setup)) {
    Set-Progress 100 'Update failed'
    Start-Sleep -Seconds 2
    throw 'download failed'
  }

  Set-Progress 58 'Installing…'
  $ok = Install-Setup
  if (-not $ok) {
    Write-Log 'install reported failure; retrying once'
    Start-Sleep -Milliseconds 800
    $ok = Install-Setup
  }

  $target = Get-ArkTarget
  $ver = Get-FileVersion $target
  Write-Log ("post-install version=" + $ver + " expected=" + $expected)
  if ($expected -and $ver -and ($ver -notlike ($expected + '*')) -and ($expected -notlike ($ver + '*'))) {
    Write-Log 'version mismatch after install'
  }

  Set-Progress 96 'Opening ARK…'
  Start-Sleep -Milliseconds 150
  if (-not (Start-ArkNow)) {
    Write-Log 'relaunch failed'
  }
} catch {
  Write-Log ("helper error: " + $_)
  try { Start-ArkNow | Out-Null } catch {}
} finally {
  Set-Progress 100 'Done'
  [System.Windows.Forms.Application]::DoEvents()
  try { $form.Close(); $form.Dispose() } catch {}
  Remove-Item -LiteralPath ${psSingleQuote(helperPs1)} -Force -ErrorAction SilentlyContinue
  if ($icon) { Remove-Item -LiteralPath $icon -Force -ErrorAction SilentlyContinue }
  Write-Log 'splash helper done'
}
`;

  fs.writeFileSync(helperPs1, ps, 'utf8');

  const powershell = path.join(
    process.env.SystemRoot || 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );

  // Break away from Electron's Windows job object via `start /b`.
  // A direct spawn() child is killed when ARK exits — that left users stuck on old builds.
  const helperCmd = path.join(temp, `ark-update-${stamp}.cmd`);
  fs.writeFileSync(
    helperCmd,
    [
      '@echo off',
      `start "ARKUpdate" /b "${powershell}" -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File "${helperPs1}"`,
      'exit /b 0',
    ].join('\r\n'),
    'utf8',
  );

  const child = spawn(helperCmd, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    shell: true,
    cwd: temp,
  });
  child.unref();
  return { helperPs1, logFile, helperCmd };
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

/**
 * Quit ARK and let the external splash download + install + relaunch.
 * (Matches Discord: app closes first, small box does the work.)
 */
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

  const expectedVersion = normalizeVersion(latestTag || '');
  const dest = path.join(app.getPath('temp'), `ARK-Setup-${expectedVersion || 'update'}.exe`);

  markPostUpdateLandChat();
  sendProgress({
    status: 'installing',
    percent: 0,
    message: 'Closing ARK to update…',
    version: expectedVersion,
  });

  setTimeout(() => {
    try {
      launchUpdateSplash({
        setupPath: dest,
        setupUrl,
        expectedVersion,
      });
    } catch (err) {
      console.error('[ark] failed to launch update splash', err);
      sendProgress({
        status: 'error',
        percent: 0,
        message: 'Could not start the updater. Try again.',
        error: err instanceof Error ? err.message : 'spawn failed',
      });
      return;
    }
    // Give the breakaway process a moment to start, then quit.
    setTimeout(() => app.quit(), 400);
  }, 200);

  return { ok: true, message: 'Closing ARK to update…' };
}

module.exports = {
  checkForUpdate,
  downloadAndInstall,
  getState,
  consumePostUpdate,
  UPDATE_REPO,
};
