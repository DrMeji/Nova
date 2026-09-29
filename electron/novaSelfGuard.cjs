/**
 * Block chat / disk access to NOVA's own install tree (app.asar, resources, exe dir).
 * Unpackaged source builds (Open-NOVA-Build) allow access so Debug clinic can audit this tree.
 */

const path = require('path');

/** @type {string[]} */
let protectedRoots = [];
let allowDevSelfAccess = false;

function isPathUnderRoot(child, root) {
  const c = path.resolve(String(child || ''));
  const r = path.resolve(String(root || ''));
  if (!c || !r) return false;
  if (c === r) return true;
  const rel = path.relative(r, c);
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function init(opts = {}) {
  allowDevSelfAccess = Boolean(opts.allowDevSelfAccess);
  const roots = [];
  const add = (p) => {
    if (!p) return;
    try {
      roots.push(path.resolve(p));
    } catch {
      /* ignore */
    }
  };
  add(opts.appPath);
  add(opts.resourcesPath);
  if (opts.isPackaged) {
    add(path.dirname(String(opts.execPath || '')));
    if (opts.resourcesPath) {
      add(path.join(opts.resourcesPath, 'app.asar'));
      add(path.join(opts.resourcesPath, 'app.asar.unpacked'));
    }
  }
  protectedRoots = [...new Set(roots.filter(Boolean))];
}

function isArkProtectedPath(absPath) {
  if (allowDevSelfAccess) return false;
  const p = path.resolve(String(absPath || ''));
  if (!p) return false;
  if (/app\.asar(?:$|[\\/])/i.test(p)) return true;
  for (const root of protectedRoots) {
    if (isPathUnderRoot(p, root)) return true;
  }
  return false;
}

function protectedPathError() {
  return "That path is part of NOVA itself. On a source build, relaunch with Open-NOVA-Build.bat so Debug can audit this folder. Packaged installs cannot bind NOVA's own files.";
}

module.exports = {
  init,
  isArkProtectedPath,
  protectedPathError,
  isPathUnderRoot,
};
