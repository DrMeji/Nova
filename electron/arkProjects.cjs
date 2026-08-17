/**
 * Persist project file trees under ARK userData (real disk paths).
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function projectsRoot() {
  const root = path.join(app.getPath('userData'), 'ark-projects');
  fs.mkdirSync(root, { recursive: true });
  // Category folders — code builds land under ark-projects/code/
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

function writeProjectFiles(projectId, projectName, files) {
  const root = projectDir(projectId);
  const written = [];
  for (const [rel, content] of Object.entries(files || {})) {
    const safe = String(rel).replace(/\\/g, '/').replace(/^\/+/, '');
    if (!safe || safe.includes('..')) continue;
    const full = path.join(root, ...safe.split('/'));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, typeof content === 'string' ? content : String(content ?? ''), 'utf8');
    written.push(safe);
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

function readProjectFiles(projectId) {
  const root = projectDir(projectId);
  const files = {};
  function walk(dir, prefix) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (name === 'ark-meta.json') continue;
      const full = path.join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full, rel);
      else files[rel] = fs.readFileSync(full, 'utf8');
    }
  }
  walk(root, '');
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

function getProjectPath(projectId) {
  return { ok: true, root: projectDir(projectId) };
}

module.exports = {
  projectsRoot,
  projectDir,
  writeProjectFiles,
  readProjectFiles,
  getProjectPath,
};
