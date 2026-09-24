'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REGISTRY_NOISE = new Set([
  'microsoft edge update',
  'microsoft edge webview2 runtime',
  'windows desktop runtime',
  'windows installer',
  'update for',
  'security update',
  'hotfix',
]);

function readRegistryApps(limit) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ ok: true, apps: [], source: 'none' });
      return;
    }
    const cap = Math.min(Math.max(Number(limit) || 60, 10), 120);
    const ps = [
      '$keys = @(',
      "  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
      "  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
      "  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'",
      ')',
      'Get-ItemProperty $keys -ErrorAction SilentlyContinue |',
      '  Where-Object { $_.DisplayName -and $_.SystemComponent -ne 1 -and -not $_.ParentKeyName } |',
      '  Select-Object -ExpandProperty DisplayName -Unique |',
      '  Sort-Object |',
      `  Select-Object -First ${cap}`,
    ].join('\n');

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      { timeout: 18_000, maxBuffer: 3 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        if (err) {
          resolve({ ok: false, error: err.message || 'Registry read failed', apps: [] });
          return;
        }
        const seen = new Set();
        const apps = [];
        for (const line of String(stdout || '').split(/\r?\n/)) {
          const name = line.trim();
          if (!name || name.length < 2) continue;
          const key = name.toLowerCase();
          if (seen.has(key)) continue;
          if (REGISTRY_NOISE.has(key) || [...REGISTRY_NOISE].some(n => key.startsWith(n))) continue;
          seen.add(key);
          apps.push({ name, source: 'registry' });
          if (apps.length >= cap) break;
        }
        resolve({ ok: true, apps, source: 'registry' });
      },
    );
  });
}

function listShortcutNames(dirPath, limit) {
  const out = [];
  try {
    if (!dirPath || !fs.existsSync(dirPath)) return out;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.name || entry.name.startsWith('.')) continue;
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        out.push(...listShortcutNames(full, limit - out.length));
      } else if (/\.lnk$/i.test(entry.name)) {
        out.push({ name: entry.name.replace(/\.lnk$/i, ''), source: 'shortcut' });
      }
      if (out.length >= limit) break;
    }
  } catch {
    /* ignore */
  }
  return out.slice(0, limit);
}

function listPartialApps(limit = 40) {
  const home = os.homedir();
  const desktop = path.join(home, 'Desktop');
  const startMenu = path.join(home, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  const apps = [];
  const seen = new Set();

  for (const item of listShortcutNames(startMenu, Math.floor(limit * 0.6))) {
    const key = item.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    apps.push(item);
  }

  try {
    const appsDir = path.join(desktop, 'Apps');
    if (fs.existsSync(appsDir) && fs.statSync(appsDir).isDirectory()) {
      for (const entry of fs.readdirSync(appsDir, { withFileTypes: true })) {
        if (!entry.isDirectory() && !/\.lnk$/i.test(entry.name)) continue;
        const name = entry.name.replace(/\.lnk$/i, '');
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        apps.push({ name, source: 'desktop-apps' });
        if (apps.length >= limit) break;
      }
    }
  } catch {
    /* ignore */
  }

  for (const item of listShortcutNames(desktop, limit - apps.length)) {
    const key = item.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    apps.push(item);
  }

  return apps.slice(0, limit);
}

async function listInstalledApps(grants, payload = {}) {
  const limit = Math.min(Math.max(Number(payload.limit) || 60, 10), 120);

  if (grants?.fullPc) {
    const reg = await readRegistryApps(limit);
    if (reg.ok && reg.apps.length) return reg;
    return reg;
  }

  if (grants?.desktop) {
    const apps = listPartialApps(limit);
    return {
      ok: true,
      apps,
      source: 'shortcuts',
      limited: true,
      note: 'Desktop access only shows shortcuts and Desktop folders — enable Full PC access in Settings → Security for the full installed-program list.',
    };
  }

  return {
    ok: false,
    error: 'grant_required',
    apps: [],
    limited: true,
    note: 'Turn on Desktop or Full PC access in Settings → Security to list applications.',
  };
}

module.exports = { listInstalledApps };
