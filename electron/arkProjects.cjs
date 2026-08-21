/**
 * Persist project file trees under ARK userData (real disk paths).
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

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
  const root = projectDir(projectId);
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
    if (sandbox) {
      const resolved = path.resolve(full);
      const rootResolved = path.resolve(root);
      if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved) {
        blocked.push(safe);
        continue;
      }
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
  const meta = {
    id: projectId,
    name: projectName || projectId,
    category: 'code',
    root,
    updatedAt: new Date().toISOString(),
    files: written,
  };
  fs.writeFileSync(metaPath(projectId), JSON.stringify(meta, null, 2), 'utf8');
  return { ok: true, root, files: written };
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

function readProjectFiles(projectId) {
  const root = projectDir(projectId);
  const files = walkProjectFiles(root);
  let meta = null;
  try {
    if (fs.existsSync(metaPath(projectId))) {
      meta = JSON.parse(fs.readFileSync(metaPath(projectId), 'utf8'));
    }
  } catch {
    meta = null;
  }
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

function importFolder(projectId, projectName, sourceDir) {
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
    const tree = copyTree(src, root);
    const copied = tree.copied || [];
    const folderName = resolved.name || path.basename(src);
    const hint = String(projectName || '').trim();
    const placeholder = /^(inspect|opened folder|new project|code project|code)$/i.test(hint);
    const meta = {
      id: projectId,
      name: (!hint || placeholder) ? folderName : hint,
      category: 'code',
      root,
      importedFrom: src,
      updatedAt: new Date().toISOString(),
      files: copied,
    };
    fs.writeFileSync(metaPath(projectId), JSON.stringify(meta, null, 2), 'utf8');
    const files = walkProjectFiles(root);
    const inventory = listTreeFiles(src);
    for (const item of inventory) {
      if (files[item.path] != null) continue;
      const ext = (item.name.split('.').pop() || '').toLowerCase();
      let kind = 'file';
      if (IMAGE_EXT.has(ext)) kind = 'image';
      else if (SKIP_EXT.has(ext) || item.size > MAX_FILE_BYTES) kind = ext || 'binary';
      files[item.path] = `[${kind} · ${item.size} bytes · ${item.path}]`;
    }
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
  const { files } = readProjectFiles(projectId);
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
  return { ok: true, root: projectDir(projectId) };
}

function pathStat(targetPath) {
  let p = path.resolve(String(targetPath || ''));
  if (!p || !fs.existsSync(p)) return { ok: false, error: 'Path not found' };
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

module.exports = {
  projectsRoot,
  projectDir,
  writeProjectFiles,
  pathStat,
  listDir,
  browseRoots,
  readTextFile,
  readDataUrl,
  readProjectFiles,
  importFolder,
  searchProjectFiles,
  deleteProjectFiles,
  getProjectPath,
  walkProjectFiles,
};
