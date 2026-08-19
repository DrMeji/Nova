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
  'pdf', 'bin', 'lock',
]);

const MAX_FILE_BYTES = 400_000;
const MAX_IMPORT_FILES = 450;

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
  function walk(dir, prefix) {
    if (!fs.existsSync(dir)) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name === 'ark-meta.json' || name === 'ark-chat.json') continue;
      if (shouldSkipDir(name)) continue;
      const full = path.join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      let st;
      try {
        st = fs.statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full, rel);
        continue;
      }
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
  function walk(dir, prefix) {
    if (copied.length >= MAX_IMPORT_FILES) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (copied.length >= MAX_IMPORT_FILES) return;
      if (shouldSkipDir(name)) continue;
      const from = path.join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      let st;
      try {
        st = fs.statSync(from);
      } catch {
        continue;
      }
      const to = path.join(destRoot, ...rel.split('/'));
      if (st.isDirectory()) {
        fs.mkdirSync(to, { recursive: true });
        walk(from, rel);
        continue;
      }
      if (shouldSkipFile(name, st.size)) continue;
      try {
        const buf = fs.readFileSync(from);
        if (isProbablyBinary(buf)) continue;
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
      fs.cpSync(gitSrc, gitDest, { recursive: true });
    } catch {
      /* Explorer still works without history */
    }
  }
  return copied;
}

function importFolder(projectId, projectName, sourceDir) {
  const src = path.resolve(String(sourceDir || ''));
  if (!src || !fs.existsSync(src) || !fs.statSync(src).isDirectory()) {
    return { ok: false, error: 'That folder could not be opened.' };
  }
  const root = projectDir(projectId);
  const copied = copyTree(src, root);
  const meta = {
    id: projectId,
    name: projectName || path.basename(src),
    category: 'code',
    root,
    importedFrom: src,
    updatedAt: new Date().toISOString(),
    files: copied,
  };
  fs.writeFileSync(metaPath(projectId), JSON.stringify(meta, null, 2), 'utf8');
  const files = walkProjectFiles(root);
  return { ok: true, root, files, copied: copied.length, name: meta.name };
}

function searchProjectFiles(projectId, query, limit = 50) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { ok: true, hits: [] };
  const { files } = readProjectFiles(projectId);
  const hits = [];
  for (const [rel, content] of Object.entries(files)) {
    const lines = String(content || '').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].toLowerCase().includes(q)) continue;
      hits.push({
        path: rel,
        line: i + 1,
        text: lines[i].trim().slice(0, 220),
      });
      if (hits.length >= limit) return { ok: true, hits };
    }
  }
  return { ok: true, hits };
}

function getProjectPath(projectId) {
  return { ok: true, root: projectDir(projectId) };
}

module.exports = {
  projectsRoot,
  projectDir,
  writeProjectFiles,
  readProjectFiles,
  importFolder,
  searchProjectFiles,
  getProjectPath,
  walkProjectFiles,
};
