/**
 * Persist project file trees under ARK userData (real disk paths).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { app } = require('electron');
const arkSelfGuard = require('./arkSelfGuard.cjs');

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', 'coverage',
  '.cache', '.turbo', '.venv', 'venv', '__pycache__', 'target', 'vendor',
  '.ark', '.idea', '.vscode', 'Pods', '.gradle',
]);

const SKIP_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'icns', 'bmp', 'psd',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'mp4', 'webm', 'mp3', 'wav', 'ogg',
  'zip', 'gz', '7z', 'rar', 'exe', 'dll', 'so', 'dylib', 'wasm',
  'bin', 'lock',
]);

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);

/** Soft cap — large trees still import; UI shows Uploading… while this runs. */
const MAX_FILE_BYTES = 1_500_000;
const MAX_IMPORT_FILES = 8_000;

const { execFileSync } = require('child_process');

/** lstat (no follow) — for detecting links. */
function safeLstat(full) {
  try {
    return fs.lstatSync(full);
  } catch {
    return null;
  }
}

/** stat (follow junctions/symlinks). */
function safeStatFollow(full) {
  try {
    return fs.statSync(full);
  } catch {
    return null;
  }
}

function resolveWindowsShortcut(lnkPath) {
  if (process.platform !== 'win32' || !/\.lnk$/i.test(String(lnkPath || ''))) return null;
  try {
    const script = [
      `$s = (New-Object -ComObject WScript.Shell).CreateShortcut(${JSON.stringify(String(lnkPath))})`,
      'if ($s.TargetPath) { Write-Output $s.TargetPath }',
    ].join('; ');
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { encoding: 'utf8', timeout: 8000, windowsHide: true },
    ).trim();
    return out || null;
  } catch {
    return null;
  }
}

/**
 * Resolve to a real folder path (follows junctions, symlinks, and .lnk shortcuts).
 * This is what broke DeBloat — Windows folder shortcuts looked like “not a directory”.
 */
function resolveFolderRoot(sourceDir) {
  let p = path.resolve(String(sourceDir || ''));
  if (!p) return { ok: false, error: 'No folder path.' };

  if (/\.lnk$/i.test(p)) {
    const target = resolveWindowsShortcut(p);
    if (!target) return { ok: false, error: 'Could not open that Windows shortcut.' };
    p = path.resolve(target);
  }

  try {
    p = fs.realpathSync(p);
  } catch {
    /* keep unresolved path */
  }

  const st = safeStatFollow(p);
  if (!st) return { ok: false, error: 'That folder could not be opened.' };
  if (st.isDirectory()) return { ok: true, path: p, name: path.basename(p) };
  if (st.isFile()) {
    return { ok: false, error: 'file', path: p, name: path.basename(p) };
  }
  return { ok: false, error: 'That path is not a folder or file.' };
}

function safeReaddir(dir) {
  try {
    const st = safeStatFollow(dir);
    if (!st || !st.isDirectory()) return [];
    return fs.readdirSync(dir);
  } catch (err) {
    if (err && (err.code === 'ENOTDIR' || err.code === 'ENOENT')) return [];
    return [];
  }
}

/** Walk a source tree; follows directory junctions/symlinks (with cycle guard). */
function listTreeFiles(srcRoot, limit = MAX_IMPORT_FILES) {
  const found = [];
  const seen = new Set();
  function walk(dir, prefix) {
    if (found.length >= limit) return;
    let real = dir;
    try {
      real = fs.realpathSync(dir);
    } catch {
      /* keep */
    }
    if (seen.has(real)) return;
    seen.add(real);

    const entries = safeReaddir(dir);
    for (const name of entries) {
      if (found.length >= limit) return;
      if (shouldSkipDir(name)) continue;
      const from = path.join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      const st = safeStatFollow(from);
      if (!st) continue;
      if (st.isDirectory()) {
        walk(from, rel);
        continue;
      }
      if (!st.isFile()) continue;
      found.push({
        path: rel.replace(/\\/g, '/'),
        size: st.size,
        name,
        abs: from,
      });
    }
  }
  walk(srcRoot, '');
  return found;
}

function projectsRoot() {
  const root = path.join(app.getPath('userData'), 'ark-projects');
  fs.mkdirSync(root, { recursive: true });
  for (const cat of ['code', 'uploads']) {
    fs.mkdirSync(path.join(root, cat), { recursive: true });
  }
  return root;
}

function resolveProjectDir(projectId) {
  const safe = String(projectId || 'default').replace(/[<>:"/\\|?*]/g, '_');
  const root = projectsRoot();
  const candidates = [
    path.join(root, 'code', safe),
    path.join(root, safe),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return path.join(root, 'code', safe);
}

function projectDir(projectId) {
  const dir = resolveProjectDir(projectId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function metaPath(projectId) {
  return path.join(projectDir(projectId), 'ark-meta.json');
}

function approvedRootsPath() {
  return path.join(app.getPath('userData'), 'ark-workspace-roots.json');
}

function workspaceGrantsPath() {
  return path.join(app.getPath('userData'), 'ark-workspace-grants.json');
}

function loadWorkspaceGrants() {
  try {
    const raw = fs.readFileSync(workspaceGrantsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      desktop: Boolean(parsed.desktop),
      documents: Boolean(parsed.documents),
      fullPc: Boolean(parsed.fullPc),
      executionMode: parsed.executionMode === 'run_all' || parsed.executionMode === 'auto_review'
        ? parsed.executionMode
        : 'allowlist',
    };
  } catch {
    return { desktop: false, documents: false, fullPc: false, executionMode: 'allowlist' };
  }
}

function setWorkspaceGrants(grants) {
  const prev = loadWorkspaceGrants();
  const next = {
    desktop: grants?.desktop != null ? Boolean(grants.desktop) : prev.desktop,
    documents: grants?.documents != null ? Boolean(grants.documents) : prev.documents,
    fullPc: grants?.fullPc != null ? Boolean(grants.fullPc) : prev.fullPc,
    executionMode: grants?.executionMode != null
      ? (grants.executionMode === 'run_all' || grants.executionMode === 'auto_review'
        ? grants.executionMode
        : 'allowlist')
      : prev.executionMode,
    updatedAt: Date.now(),
  };
  fs.mkdirSync(path.dirname(workspaceGrantsPath()), { recursive: true });
  fs.writeFileSync(workspaceGrantsPath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function isUnderFullPcGrant(absPath) {
  const grants = loadWorkspaceGrants();
  if (!grants.fullPc) return false;
  const p = path.resolve(String(absPath || ''));
  const home = path.resolve(os.homedir());
  // Full PC = the signed-in Windows user profile only (not the whole disk).
  if (!isPathUnderRoot(p, home)) return false;
  const blockedInsideHome = [
    path.resolve('C:\\Windows'),
    path.resolve('C:\\Program Files'),
    path.resolve('C:\\Program Files (x86)'),
  ];
  for (const br of blockedInsideHome) {
    if (isPathUnderRoot(p, br)) return false;
  }
  return true;
}

function isUnderGrantedScope(absPath) {
  const grants = loadWorkspaceGrants();
  if (!grants.desktop && !grants.documents) return false;
  const home = os.homedir();
  const p = path.resolve(String(absPath || ''));
  if (grants.desktop) {
    const desk = path.resolve(path.join(home, 'Desktop'));
    if (isPathUnderRoot(p, desk)) return true;
    const pictures = path.resolve(path.join(home, 'Pictures'));
    if (isPathUnderRoot(p, pictures)) return true;
  }
  if (grants.documents) {
    const docs = path.resolve(path.join(home, 'Documents'));
    if (isPathUnderRoot(p, docs)) return true;
  }
  return false;
}

function loadApprovedRoots() {
  try {
    const raw = fs.readFileSync(approvedRootsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.roots) ? parsed.roots : [];
  } catch {
    return [];
  }
}

function saveApprovedRoot(entry) {
  const roots = loadApprovedRoots().filter(r => r.id !== entry.id);
  roots.unshift(entry);
  fs.mkdirSync(path.dirname(approvedRootsPath()), { recursive: true });
  fs.writeFileSync(approvedRootsPath(), JSON.stringify({ roots: roots.slice(0, 48) }, null, 2), 'utf8');
}

/** True when child is inside root (no .. escape). */
function isPathUnderRoot(child, root) {
  const c = path.resolve(String(child || ''));
  const r = path.resolve(String(root || ''));
  if (!c || !r) return false;
  if (c === r) return true;
  const rel = path.relative(r, c);
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function readMeta(projectId) {
  try {
    const mp = metaPath(projectId);
    if (!fs.existsSync(mp)) return null;
    return JSON.parse(fs.readFileSync(mp, 'utf8'));
  } catch {
    return null;
  }
}

/** Disk root for reads/writes — in-place workspace or copied project dir. */
function resolveProjectRoot(projectId) {
  const meta = readMeta(projectId);
  if (meta?.inPlace && meta?.root) {
    const root = path.resolve(String(meta.root));
    if (fs.existsSync(root)) return root;
  }
  return resolveProjectDir(projectId);
}

function blockArkSelfPath(absPath) {
  if (arkSelfGuard.isArkProtectedPath(absPath)) {
    return { ok: false, error: arkSelfGuard.protectedPathError() };
  }
  return null;
}

function isAllowedExternalPath(absPath) {
  const p = path.resolve(String(absPath || ''));
  if (!p) return false;
  if (arkSelfGuard.isArkProtectedPath(p)) return false;
  const pr = path.resolve(projectsRoot());
  if (isPathUnderRoot(p, pr)) return true;
  if (isUnderFullPcGrant(p)) return true;
  if (isUnderGrantedScope(p)) return true;
  return loadApprovedRoots().some(r => isPathUnderRoot(p, path.resolve(String(r.path || ''))));
}

function shouldSkipDir(name) {
  const n = String(name || '');
  if (n === '.' || n === '..') return true;
  return SKIP_DIRS.has(n.toLowerCase());
}

function shouldSkipFile(name, size) {
  const base = String(name || '');
  if (/^\.env($|\.)/i.test(base) && !/\.example$/i.test(base)) return true;
  const ext = base.split('.').pop()?.toLowerCase() || '';
  if (SKIP_EXT.has(ext)) return true;
  if (/^(package-lock|yarn\.lock|pnpm-lock)/i.test(base)) return true;
  if (size > MAX_FILE_BYTES) return true;
  return false;
}

function isProbablyBinary(buf) {
  const n = Math.min(buf.length, 800);
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

function isSandboxBlockedPath(rel) {
  const safe = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, '');
  if (!safe || safe.includes('..')) return true;
  if (/^[a-zA-Z]:[/\\]/.test(safe) || safe.startsWith('//')) return true;
  const base = safe.split('/').pop() || safe;
  if (/^\.env($|\.)/i.test(base) && !/\.example$/i.test(base)) return true;
  if (/^(package-lock|yarn\.lock|pnpm-lock)/i.test(base)) return true;
  const blocked = new Set([
    'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out', '.next', 'coverage',
    '.cache', '.turbo', '.venv', 'venv', '__pycache__', 'target', 'vendor', 'Pods',
    '.gradle', '.idea', '.vscode',
  ]);
  return safe.split('/').some(part => blocked.has(String(part || '').toLowerCase()));
}

function writeProjectFiles(projectId, projectName, files, sandbox) {
  const root = resolveProjectRoot(projectId);
  const rootResolved = path.resolve(root);
  const prior = readMeta(projectId);
  const written = [];
  const blocked = [];
  for (const [rel, content] of Object.entries(files || {})) {
    const safe = String(rel).replace(/\\/g, '/').replace(/^\/+/, '');
    if (!safe || safe.includes('..')) {
      if (sandbox) blocked.push(safe || rel);
      continue;
    }
    if (sandbox && isSandboxBlockedPath(safe)) {
      blocked.push(safe);
      continue;
    }
    const full = path.join(root, ...safe.split('/'));
    const resolved = path.resolve(full);
    if (!isPathUnderRoot(resolved, rootResolved)) {
      blocked.push(safe);
      continue;
    }
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, typeof content === 'string' ? content : String(content ?? ''), 'utf8');
    written.push(safe);
  }
  if (sandbox && blocked.length && written.length === 0) {
    return {
      ok: false,
      error: `Sandbox blocked ${blocked.length} path(s): ${blocked.slice(0, 3).join(', ')}`,
      sandboxBlocked: blocked,
      root,
      files: written,
    };
  }
  if (blocked.length && written.length === 0) {
    return {
      ok: false,
      error: `Refused to write outside approved folder: ${blocked.slice(0, 3).join(', ')}`,
      root,
      files: written,
    };
  }
  const meta = {
    ...(prior || {}),
    id: projectId,
    name: projectName || prior?.name || projectId,
    category: 'code',
    kind: prior?.kind || (prior?.inPlace ? 'disk' : 'ark-project'),
    inPlace: Boolean(prior?.inPlace),
    root,
    updatedAt: new Date().toISOString(),
    files: written,
  };
  fs.mkdirSync(projectDir(projectId), { recursive: true });
  fs.writeFileSync(metaPath(projectId), JSON.stringify(meta, null, 2), 'utf8');
  return { ok: true, root, files: written, inPlace: Boolean(meta.inPlace) };
}

function walkProjectFiles(root) {
  const files = {};
  const seen = new Set();
  function walk(dir, prefix) {
    if (!fs.existsSync(dir)) return;
    let real = dir;
    try {
      real = fs.realpathSync(dir);
    } catch {
      /* keep */
    }
    if (seen.has(real)) return;
    seen.add(real);
    const entries = safeReaddir(dir);
    for (const name of entries) {
      if (name === 'ark-meta.json' || name === 'ark-chat.json') continue;
      if (shouldSkipDir(name)) continue;
      const full = path.join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      const st = safeStatFollow(full);
      if (!st) continue;
      if (st.isDirectory()) {
        walk(full, rel);
        continue;
      }
      if (!st.isFile()) continue;
      if (shouldSkipFile(name, st.size)) continue;
      if (Object.keys(files).length >= MAX_IMPORT_FILES) return;
      try {
        const buf = fs.readFileSync(full);
        if (isProbablyBinary(buf)) continue;
        files[rel] = buf.toString('utf8');
      } catch {
        /* skip unreadable */
      }
    }
  }
  walk(root, '');
  return files;
}

function listReadableProjectFiles(root) {
  const out = [];
  const seen = new Set();
  function walk(dir, prefix) {
    if (!fs.existsSync(dir)) return;
    let real = dir;
    try {
      real = fs.realpathSync(dir);
    } catch {
      /* keep */
    }
    if (seen.has(real)) return;
    seen.add(real);
    const entries = safeReaddir(dir);
    for (const name of entries) {
      if (name === 'ark-meta.json' || name === 'ark-chat.json') continue;
      if (shouldSkipDir(name)) continue;
      const full = path.join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      const st = safeStatFollow(full);
      if (!st) continue;
      if (st.isDirectory()) {
        walk(full, rel);
        continue;
      }
      if (!st.isFile()) continue;
      if (shouldSkipFile(name, st.size)) continue;
      if (out.length >= MAX_IMPORT_FILES) return;
      out.push({ full, rel, size: st.size });
    }
  }
  walk(root, '');
  return out;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Read project text files in paced batches so the UI / OS stay responsive.
 * onProgress({ phase, done, total, label })
 */
async function walkProjectFilesPaced(root, onProgress) {
  const listed = listReadableProjectFiles(root);
  const total = listed.length;
  const files = {};
  const batch = total > 200 ? 10 : total > 80 ? 14 : 20;
  const pauseMs = total > 200 ? 16 : total > 80 ? 10 : 4;

  onProgress?.({ phase: 'read', done: 0, total, label: `Reading 0/${total}` });

  for (let i = 0; i < listed.length; i++) {
    const item = listed[i];
    try {
      const buf = fs.readFileSync(item.full);
      if (!isProbablyBinary(buf)) {
        files[item.rel] = buf.toString('utf8');
      }
    } catch {
      /* skip */
    }
    const done = i + 1;
    if (done % batch === 0 || done === total) {
      onProgress?.({
        phase: 'read',
        done,
        total,
        label: `Reading files ${done}/${total}`,
      });
      await sleep(pauseMs);
    }
  }
  return files;
}

function readProjectFiles(projectId) {
  const meta = readMeta(projectId);
  const root = resolveProjectRoot(projectId);
  const files = walkProjectFiles(root);
  return { ok: true, root, files, meta };
}

function copyTree(srcRoot, destRoot) {
  const copied = [];
  let skippedEnv = 0;
  let skippedLarge = 0;
  let skippedBinary = 0;
  let skippedLimit = 0;
  const seen = new Set();
  function walk(dir, prefix) {
    if (copied.length >= MAX_IMPORT_FILES) {
      skippedLimit += 1;
      return;
    }
    let real = dir;
    try {
      real = fs.realpathSync(dir);
    } catch {
      /* keep */
    }
    if (seen.has(real)) return;
    seen.add(real);

    const entries = safeReaddir(dir);
    for (const name of entries) {
      if (copied.length >= MAX_IMPORT_FILES) return;
      if (shouldSkipDir(name)) continue;
      const from = path.join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      const st = safeStatFollow(from);
      if (!st) continue;
      const to = path.join(destRoot, ...rel.split('/'));
      if (st.isDirectory()) {
        try {
          fs.mkdirSync(to, { recursive: true });
        } catch {
          continue;
        }
        walk(from, rel);
        continue;
      }
      if (!st.isFile()) continue;
      if (shouldSkipFile(name, st.size)) {
        if (/^\.env($|\.)/i.test(name) && !/\.example$/i.test(name)) skippedEnv += 1;
        else if (st.size > MAX_FILE_BYTES) skippedLarge += 1;
        continue;
      }
      try {
        const buf = fs.readFileSync(from);
        if (isProbablyBinary(buf)) {
          skippedBinary += 1;
          continue;
        }
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.writeFileSync(to, buf);
        copied.push(rel.replace(/\\/g, '/'));
      } catch {
        /* skip */
      }
    }
  }
  fs.mkdirSync(destRoot, { recursive: true });
  walk(srcRoot, '');
  const gitSrc = path.join(srcRoot, '.git');
  const gitDest = path.join(destRoot, '.git');
  if (fs.existsSync(gitSrc) && !fs.existsSync(gitDest)) {
    try {
      const gst = safeStatFollow(gitSrc);
      if (gst && gst.isDirectory()) {
        fs.cpSync(gitSrc, gitDest, { recursive: true });
      }
    } catch {
      /* Explorer still works without history */
    }
  }
  return {
    copied,
    skipped: {
      env: skippedEnv,
      large: skippedLarge,
      binary: skippedBinary,
      limit: skippedLimit,
    },
  };
}

/** Open a folder in-place — no copy into userData. User approved this root. */
async function openWorkspaceRoot(projectId, projectName, sourceDir, onProgress, options = {}) {
  try {
    const resolved = resolveFolderRoot(sourceDir);
    if (!resolved.ok) {
      if (resolved.error === 'file') {
        return { ok: false, error: 'file', path: resolved.path, name: resolved.name };
      }
      return { ok: false, error: resolved.error || 'That folder could not be opened.' };
    }
    const src = resolved.path;
    const selfBlock = blockArkSelfPath(src);
    if (selfBlock) return selfBlock;
    const folderName = resolved.name || path.basename(src);
    const hint = String(projectName || '').trim();
    const placeholder = /^(inspect|opened folder|new project|code project|code)$/i.test(hint);
    const name = (!hint || placeholder) ? folderName : hint;

    saveApprovedRoot({
      id: projectId,
      path: src,
      name,
      kind: 'disk',
      approvedAt: Date.now(),
    });

    const meta = {
      id: projectId,
      name,
      category: 'code',
      kind: 'disk',
      inPlace: true,
      root: src,
      approvedAt: Date.now(),
      updatedAt: new Date().toISOString(),
    };
    fs.mkdirSync(projectDir(projectId), { recursive: true });
    fs.writeFileSync(metaPath(projectId), JSON.stringify(meta, null, 2), 'utf8');

    if (options.catalogOnly) {
      const entries = safeReaddir(src).filter((name) => !shouldSkipDir(name));
      onProgress?.({
        phase: 'done',
        done: 0,
        total: 0,
        label: 'Ready',
      });
      return {
        ok: true,
        root: src,
        files: {},
        listed: entries.length,
        name,
        inPlace: true,
        catalogOnly: true,
      };
    }

    const files = await walkProjectFilesPaced(src, onProgress);
    const inventory = listTreeFiles(src);
    for (const item of inventory) {
      if (files[item.path] != null) continue;
      const ext = (item.name.split('.').pop() || '').toLowerCase();
      let kind = 'file';
      if (IMAGE_EXT.has(ext)) kind = 'image';
      else if (SKIP_EXT.has(ext) || item.size > MAX_FILE_BYTES) kind = ext || 'binary';
      files[item.path] = `[${kind} · ${item.size} bytes · ${item.path}]`;
    }
    onProgress?.({
      phase: 'done',
      done: Object.keys(files).length,
      total: Object.keys(files).length,
      label: 'Ready',
    });
    return {
      ok: true,
      root: src,
      files,
      listed: inventory.length,
      name,
      inPlace: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg || 'open failed' };
  }
}

async function importFolder(projectId, projectName, sourceDir, onProgress) {
  try {
    const resolved = resolveFolderRoot(sourceDir);
    if (!resolved.ok) {
      if (resolved.error === 'file') {
        return {
          ok: false,
          error: 'file',
          path: resolved.path,
          name: resolved.name,
        };
      }
      return { ok: false, error: resolved.error || 'That folder could not be opened.' };
    }
    const src = resolved.path;
    const root = projectDir(projectId);
    onProgress?.({ phase: 'copy', done: 0, total: 1, label: 'Copying folder…' });
    const tree = copyTree(src, root);
    onProgress?.({ phase: 'copy', done: 1, total: 1, label: 'Copied' });
    const copied = tree.copied || [];
    const folderName = resolved.name || path.basename(src);
    const hint = String(projectName || '').trim();
    const placeholder = /^(inspect|opened folder|new project|code project|code)$/i.test(hint);
    const meta = {
      id: projectId,
      name: (!hint || placeholder) ? folderName : hint,
      category: 'code',
      kind: 'ark-project',
      inPlace: false,
      root,
      importedFrom: src,
      updatedAt: new Date().toISOString(),
      files: copied,
    };
    fs.writeFileSync(metaPath(projectId), JSON.stringify(meta, null, 2), 'utf8');
    const files = await walkProjectFilesPaced(root, onProgress);
    const inventory = listTreeFiles(src);
    for (const item of inventory) {
      if (files[item.path] != null) continue;
      const ext = (item.name.split('.').pop() || '').toLowerCase();
      let kind = 'file';
      if (IMAGE_EXT.has(ext)) kind = 'image';
      else if (SKIP_EXT.has(ext) || item.size > MAX_FILE_BYTES) kind = ext || 'binary';
      files[item.path] = `[${kind} · ${item.size} bytes · ${item.path}]`;
    }
    onProgress?.({ phase: 'done', done: Object.keys(files).length, total: Object.keys(files).length, label: 'Ready' });
    return {
      ok: true,
      root,
      files,
      copied: copied.length,
      listed: inventory.length,
      skipped: tree.skipped || {},
      name: meta.name,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/ENOTDIR/i.test(msg)) {
      return { ok: false, error: 'Could not open that folder. If it is a Windows shortcut, try the real folder path.' };
    }
    return { ok: false, error: msg || 'import failed' };
  }
}

function readDataUrl(targetPath, maxBytes = 6_000_000) {
  const p = path.resolve(String(targetPath || ''));
  if (!p || !fs.existsSync(p)) return { ok: false, error: 'File not found' };
  const st = safeStatFollow(p);
  if (!st || !st.isFile()) return { ok: false, error: 'Not a file' };
  if (st.size > maxBytes) return { ok: false, error: 'Image too large' };
  try {
    const buf = fs.readFileSync(p);
    const ext = (path.extname(p).slice(1) || 'png').toLowerCase();
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
      : ext === 'gif' ? 'image/gif'
        : ext === 'webp' ? 'image/webp'
          : ext === 'bmp' ? 'image/bmp'
            : ext === 'svg' ? 'image/svg+xml'
              : 'image/png';
    return {
      ok: true,
      path: p,
      name: path.basename(p),
      dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'read failed' };
  }
}

function searchProjectFiles(projectId, query, limit = 50) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { ok: true, hits: [], total: 0 };
  const root = resolveProjectRoot(projectId);
  const files = walkProjectFiles(root);
  const hits = [];
  let total = 0;
  for (const [rel, content] of Object.entries(files)) {
    const lines = String(content || '').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].toLowerCase().includes(q)) continue;
      total += 1;
      if (hits.length < limit) {
        hits.push({
          path: rel,
          line: i + 1,
          text: lines[i].trim().slice(0, 220),
        });
      }
    }
  }
  return { ok: true, hits, total };
}

function deleteProjectFiles(projectId) {
  const root = path.resolve(projectsRoot());
  const dir = path.resolve(resolveProjectDir(projectId));
  const rel = path.relative(root, dir);
  if (!dir.startsWith(root) || rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, error: 'Refusing to delete a path outside ARK projects' };
  }
  if (!fs.existsSync(dir)) return { ok: true };
  fs.rmSync(dir, { recursive: true, force: true });
  return { ok: true };
}

function getProjectPath(projectId) {
  const meta = readMeta(projectId);
  const root = resolveProjectRoot(projectId);
  return { ok: true, root, inPlace: Boolean(meta?.inPlace), kind: meta?.kind || 'ark-project' };
}

function deleteGrantedFolder(targetPath) {
  const full = path.resolve(String(targetPath || ''));
  if (!full || !fs.existsSync(full)) return { ok: false, error: 'Folder not found' };
  if (!isAllowedExternalPath(full)) {
    return { ok: false, error: 'Path is outside an approved ARK workspace.' };
  }
  try {
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      fs.rmSync(full, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 });
    } else {
      fs.unlinkSync(full);
    }
    return { ok: true, path: full };
  } catch (err) {
    if (process.platform === 'win32') {
      const fallback = deleteGrantedFolderWindows(full);
      if (fallback.ok) return fallback;
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Delete failed' };
  }
}

function writeGrantedFile(targetPath, content = '') {
  const full = path.resolve(String(targetPath || ''));
  if (!full) return { ok: false, error: 'Invalid path' };
  if (!isAllowedExternalPath(full)) {
    return { ok: false, error: 'Path is outside an approved ARK workspace.' };
  }
  try {
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, typeof content === 'string' ? content : String(content ?? ''), 'utf8');
    return { ok: true, path: full };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Write failed' };
  }
}

function renameGrantedPath(fromPath, toPath) {
  const from = path.resolve(String(fromPath || ''));
  const to = path.resolve(String(toPath || ''));
  if (!from || !to) return { ok: false, error: 'Invalid path' };
  if (!isAllowedExternalPath(from) || !isAllowedExternalPath(to)) {
    return { ok: false, error: 'Path is outside an approved ARK workspace.' };
  }
  if (!fs.existsSync(from)) return { ok: false, error: 'Source file not found.' };
  if (fs.existsSync(to)) return { ok: false, error: 'A file with that name already exists.' };
  try {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
    return { ok: true, path: to, from };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Rename failed' };
  }
}

function deleteGrantedFolderWindows(full) {
  const { execFileSync } = require('child_process');
  try {
    const escaped = String(full).replace(/'/g, "''");
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', `Remove-Item -LiteralPath '${escaped}' -Recurse -Force -ErrorAction Stop`],
      { windowsHide: true, timeout: 120_000 },
    );
    if (!fs.existsSync(full)) return { ok: true, path: full };
    return { ok: false, error: 'Folder still exists after delete.' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Delete failed' };
  }
}

function deleteWorkspaceRoot(projectId) {
  const root = path.resolve(resolveProjectRoot(projectId));
  if (!fs.existsSync(root)) return { ok: false, error: 'Project folder not found' };
  if (!isAllowedExternalPath(root)) {
    return { ok: false, error: 'Path is outside an approved ARK workspace.' };
  }
  try {
    fs.rmSync(root, { recursive: true, force: true });
    return { ok: true, path: root };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Delete failed' };
  }
}

function deleteWorkspaceRelPath(projectId, relPath) {
  const root = resolveProjectRoot(projectId);
  const rootResolved = path.resolve(root);
  const safe = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, '');
  if (!safe || safe.includes('..')) return { ok: false, error: 'Invalid path' };
  const full = path.resolve(path.join(root, ...safe.split('/')));
  if (!isPathUnderRoot(full, rootResolved)) {
    return { ok: false, error: 'Path is outside the workspace folder.' };
  }
  if (!isAllowedExternalPath(full)) {
    return { ok: false, error: 'Path is outside an approved ARK workspace.' };
  }
  if (!fs.existsSync(full)) return { ok: false, error: 'Path not found' };
  try {
    const st = fs.statSync(full);
    if (st.isDirectory()) fs.rmSync(full, { recursive: true, force: true });
    else fs.unlinkSync(full);
    return { ok: true, path: full };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Delete failed' };
  }
}

function pathStat(targetPath) {
  let p = path.resolve(String(targetPath || ''));
  if (!p || !fs.existsSync(p)) return { ok: false, error: 'Path not found' };
  if (!isAllowedExternalPath(p)) {
    return { ok: false, error: 'Path is outside ARK access. Enable Desktop, Documents, or Full PC in Settings → Security.' };
  }
  if (/\.lnk$/i.test(p)) {
    const target = resolveWindowsShortcut(p);
    if (target) p = path.resolve(target);
  }
  try {
    p = fs.realpathSync(p);
  } catch {
    /* keep */
  }
  if (!isAllowedExternalPath(p)) {
    return { ok: false, error: 'Path is outside ARK access. Enable Desktop, Documents, or Full PC in Settings → Security.' };
  }
  const st = safeStatFollow(p);
  if (!st) return { ok: false, error: 'stat failed' };
  return {
    ok: true,
    path: p,
    name: path.basename(p),
    isDirectory: st.isDirectory(),
    isFile: st.isFile(),
    size: st.size,
  };
}

/** List folders + files so the UI can show images inside a folder (Windows folder dialog cannot). */
function listDir(dirPath) {
  let p = path.resolve(String(dirPath || ''));
  if (!p || !fs.existsSync(p)) return { ok: false, error: 'Folder not found', items: [] };
  if (!isAllowedExternalPath(p)) {
    return { ok: false, error: 'Folder is outside an approved ARK workspace.', items: [] };
  }
  if (/\.lnk$/i.test(p)) {
    const target = resolveWindowsShortcut(p);
    if (target) p = path.resolve(target);
  }
  try {
    p = fs.realpathSync(p);
  } catch {
    /* keep */
  }
  const st = safeStatFollow(p);
  if (!st || !st.isDirectory()) {
    return { ok: false, error: 'Not a folder', items: [] };
  }
  let entries;
  try {
    entries = fs.readdirSync(p, { withFileTypes: true });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Cannot read folder', items: [] };
  }
  const items = [];
  for (const entry of entries) {
    if (!entry.name || entry.name.startsWith('.')) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    let full = path.join(p, entry.name);
    if (/\.lnk$/i.test(entry.name)) {
      const target = resolveWindowsShortcut(full);
      if (target) full = path.resolve(target);
    }
    let isDir = false;
    let isFile = false;
    let size = 0;
    try {
      const lst = safeLstat(full) || safeStatFollow(full);
      if (!lst) continue;
      if (lst.isSymbolicLink() || lst.isDirectory()) {
        const followed = safeStatFollow(full);
        if (followed?.isDirectory()) {
          isDir = true;
        } else if (followed?.isFile()) {
          isFile = true;
          size = followed.size;
        } else continue;
      } else if (lst.isFile()) {
        isFile = true;
        size = lst.size;
      } else continue;
    } catch {
      continue;
    }
    const ext = (path.extname(entry.name).slice(1) || '').toLowerCase();
    const isImage = isFile && IMAGE_EXT.has(ext);
    items.push({
      name: entry.name.replace(/\.lnk$/i, ''),
      path: full,
      kind: isDir ? 'dir' : 'file',
      isImage,
      size,
    });
  }
  items.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
  const parent = path.dirname(p);
  return {
    ok: true,
    path: p,
    name: path.basename(p) || p,
    parent: parent && parent !== p ? parent : null,
    items,
  };
}

function browseRoots() {
  const os = require('os');
  const home = os.homedir();
  const candidates = [
    { id: 'pictures', label: 'Pictures', path: path.join(home, 'Pictures') },
    { id: 'desktop', label: 'Desktop', path: path.join(home, 'Desktop') },
    { id: 'documents', label: 'Documents', path: path.join(home, 'Documents') },
    { id: 'downloads', label: 'Downloads', path: path.join(home, 'Downloads') },
    { id: 'home', label: 'Home', path: home },
  ];
  return {
    ok: true,
    roots: candidates.filter(c => {
      try {
        return fs.existsSync(c.path) && safeStatFollow(c.path)?.isDirectory();
      } catch {
        return false;
      }
    }),
  };
}

function readTextFile(targetPath, maxBytes = 2_000_000) {
  const p = path.resolve(String(targetPath || ''));
  if (!p || !fs.existsSync(p)) return { ok: false, error: 'File not found' };
  const selfBlock = blockArkSelfPath(p);
  if (selfBlock) return selfBlock;
  if (!isAllowedExternalPath(p)) {
    return { ok: false, error: 'Path is outside an approved ARK workspace folder.' };
  }
  let st;
  try {
    st = fs.statSync(p);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'stat failed' };
  }
  if (!st.isFile()) return { ok: false, error: 'Not a file' };
  if (st.size > maxBytes) {
    return { ok: false, error: `File too large (${Math.round(st.size / 1024)} KB)` };
  }
  try {
    const buf = fs.readFileSync(p);
    if (isProbablyBinary(buf)) {
      return {
        ok: true,
        path: p,
        name: path.basename(p),
        binary: true,
        size: st.size,
        text: `[Binary file: ${path.basename(p)}, ${st.size} bytes. Describe or recreate from the filename and type if asked.]`,
      };
    }
    return {
      ok: true,
      path: p,
      name: path.basename(p),
      binary: false,
      size: st.size,
      text: buf.toString('utf8'),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'read failed' };
  }
}

/** Create a directory under grants or ARK projects root. */
function workspaceMkdir(payload = {}) {
  try {
    const targetPath = path.resolve(String(payload.targetPath || ''));
    if (!targetPath) return { ok: false, error: 'No path provided' };

    const parent = path.dirname(targetPath);
    const pr = path.resolve(projectsRoot());
    const parentAllowed = isAllowedExternalPath(parent) || isPathUnderRoot(parent, pr);
    const selfAllowed = isAllowedExternalPath(targetPath) || isPathUnderRoot(targetPath, pr);

    if (!parentAllowed && !selfAllowed) {
      return { ok: false, error: 'Path is outside an approved ARK workspace.' };
    }

    if (fs.existsSync(targetPath)) {
      let entries = [];
      try {
        entries = fs.readdirSync(targetPath).filter(n => n && !n.startsWith('.'));
      } catch {
        /* ignore */
      }
      if (entries.length > 0 && !payload.useExisting) {
        return { ok: false, error: 'exists_nonempty', path: targetPath };
      }
      return { ok: true, path: targetPath, existed: true };
    }

    fs.mkdirSync(targetPath, { recursive: true });
    return { ok: true, path: targetPath, created: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'mkdir failed' };
  }
}

function workspaceSandboxRoot() {
  try {
    const root = path.resolve(projectsRoot());
    fs.mkdirSync(root, { recursive: true });
    return { ok: true, path: root };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'sandbox failed' };
  }
}

module.exports = {
  projectsRoot,
  projectDir,
  resolveProjectRoot,
  readMeta,
  isPathUnderRoot,
  isAllowedExternalPath,
  loadApprovedRoots,
  loadWorkspaceGrants,
  setWorkspaceGrants,
  writeProjectFiles,
  pathStat,
  listDir,
  browseRoots,
  readTextFile,
  readDataUrl,
  readProjectFiles,
  openWorkspaceRoot,
  workspaceMkdir,
  workspaceSandboxRoot,
  importFolder,
  searchProjectFiles,
  deleteProjectFiles,
  getProjectPath,
  deleteWorkspaceRelPath,
  deleteWorkspaceRoot,
  deleteGrantedFolder,
  writeGrantedFile,
  renameGrantedPath,
  walkProjectFiles,
  walkProjectFilesPaced,
};
