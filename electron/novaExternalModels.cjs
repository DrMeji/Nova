/**
 * Discover GGUFs downloaded outside NOVA (LM Studio, Hugging Face cache,
 * Desktop/Downloads, etc.) so they can be imported into the Engine folder.
 * Ollama uses opaque blobs — those stay via the optional Ollama connect path.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const novaPaths = require('./novaPaths.cjs');

const MIN_BYTES = 80 * 1024 * 1024; // ignore tiny / mmproj-only probes under ~80 MB for listing primary brains
const MMPROJ_RE = /mmproj|projector/i;

/** Map common filenames → Engine catalog ids. */
function guessCatalogId(fileName) {
  const n = String(fileName || '').toLowerCase().replace(/\.gguf$/i, '');
  const compact = n.replace(/[-_.\s]/g, '');
  const rules = [
    [/uigen|uigenfx/, 'uigen-fx-4b'],
    [/qwen2.?vl.*7b|qwen2vl7b/, 'qwen2-vl-7b'],
    [/qwen2\.?5.?coder.*14b|qwen25coder14b|coder14b/, 'qwen25-coder-14b'],
    [/qwen2\.?5.?coder.*7b|qwen25coder7b|coder7b/, 'qwen25-coder-7b'],
    [/deepseek.?coder.?v2.?lite|deepseekcoderv2lite/, 'deepseek-coder-v2-lite'],
    [/starcoder2.?7b|starcoder27b/, 'starcoder2-7b'],
    [/qwen2\.?5.?14b|qwen2514b/, 'qwen25-14b'],
    [/qwen2\.?5.?7b|qwen257b/, 'qwen25-7b'],
    [/qwen2\.?5.?1\.?5b|qwen2515b/, 'qwen25-15b'],
    [/llama.?3\.?1.?8b|llama318b/, 'llama31-8b'],
    [/llama.?3\.?2.?3b|llama323b/, 'llama32-3b'],
    [/mistral.?7b|mistral7b/, 'mistral-7b'],
    [/gemma.?2.?2b|gemma22b/, 'gemma2-2b'],
    [/phi.?3.?mini|phi3mini/, 'phi3-mini'],
    [/deepseek.?r1.?distill.?8b|deepseekr1distill8b/, 'deepseek-r1-distill-8b'],
  ];
  for (const [re, id] of rules) {
    if (re.test(n) || re.test(compact)) return id;
  }
  return null;
}

function sourceLabel(absPath) {
  const p = absPath.toLowerCase();
  if (p.includes(`${path.sep}.lmstudio${path.sep}`) || p.includes('lm-studio') || p.includes('lm studio')) {
    return 'LM Studio';
  }
  if (p.includes(`${path.sep}.cache${path.sep}huggingface`) || p.includes('huggingface')) {
    return 'Hugging Face cache';
  }
  if (p.includes(`${path.sep}.ollama${path.sep}`)) return 'Ollama';
  if (p.includes(`${path.sep}downloads${path.sep}`)) return 'Downloads';
  if (p.includes(`${path.sep}desktop${path.sep}`)) return 'Desktop';
  if (p.includes(`${path.sep}documents${path.sep}`)) return 'Documents';
  return 'This PC';
}

function candidateRoots() {
  const home = os.homedir();
  const roots = [
    path.join(home, '.lmstudio', 'models'),
    path.join(home, '.cache', 'lm-studio', 'models'),
    path.join(home, '.cache', 'huggingface', 'hub'),
    path.join(process.env.LOCALAPPDATA || '', 'LM-Studio'),
    path.join(process.env.APPDATA || '', 'LM Studio'),
    path.join(home, 'Downloads'),
    path.join(home, 'Desktop'),
    path.join(home, 'Documents'),
    path.join(home, 'Documents', 'LM Studio'),
  ];
  // Extra common Windows drive roots (shallow only later).
  for (const drive of ['D:\\', 'E:\\']) {
    try {
      if (fs.existsSync(drive)) {
        roots.push(path.join(drive, 'LM Studio'));
        roots.push(path.join(drive, 'models'));
        roots.push(path.join(drive, 'GGUF'));
      }
    } catch { /* ignore */ }
  }
  return [...new Set(roots.filter((r) => r && fs.existsSync(r)))];
}

function walkGgufs(root, out, depth, maxDepth) {
  if (depth > maxDepth || out.length >= 80) return;
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (out.length >= 80) return;
    const full = path.join(root, ent.name);
    if (ent.isDirectory()) {
      // Skip heavy / irrelevant trees
      if (/^node_modules$|^\.git$|^\$recycle/i.test(ent.name)) continue;
      walkGgufs(full, out, depth + 1, maxDepth);
      continue;
    }
    if (!ent.isFile()) continue;
    if (!ent.name.toLowerCase().endsWith('.gguf')) continue;
    let st;
    try { st = fs.statSync(full); } catch { continue; }
    if (st.size < MIN_BYTES && !MMPROJ_RE.test(ent.name)) continue;
    out.push({
      path: full,
      fileName: ent.name,
      sizeGb: Math.round((st.size / (1024 ** 3)) * 100) / 100,
      source: sourceLabel(full),
      catalogId: guessCatalogId(ent.name),
      mmproj: MMPROJ_RE.test(ent.name),
    });
  }
}

function resolveNovaModelsDir() {
  try {
    return novaPaths.modelsDir();
  } catch {
    // Node CLI / tests without Electron app ready
    const base = process.env.APPDATA
      || process.env.HOME
      || os.homedir();
    return path.join(base, 'NOVA-Dev', 'nova-engine', 'models');
  }
}

function alreadyInNova(filePath) {
  const models = resolveNovaModelsDir();
  const base = path.basename(filePath);
  const dest = path.join(models, base);
  try {
    if (path.resolve(filePath) === path.resolve(dest)) return true;
    if (fs.existsSync(dest)) {
      const a = fs.statSync(filePath);
      const b = fs.statSync(dest);
      if (a.size === b.size) return true;
    }
    // Catalog-named copy (import renames to id.gguf)
    const catalogId = guessCatalogId(base);
    if (catalogId) {
      const catalogDest = path.join(models, `${catalogId}.gguf`);
      if (fs.existsSync(catalogDest) && fs.statSync(catalogDest).size === fs.statSync(filePath).size) {
        return true;
      }
    }
  } catch { /* ignore */ }
  return false;
}

/**
 * Scan known external folders for GGUFs not already in NOVA Engine.
 */
function scanExternalGgufs() {
  const found = [];
  const roots = candidateRoots();
  for (const root of roots) {
    // Hugging Face hub can be deep; LM Studio / Downloads shallower.
    const maxDepth = /huggingface/i.test(root) ? 6 : 4;
    walkGgufs(root, found, 0, maxDepth);
  }
  const novaDir = path.resolve(resolveNovaModelsDir());
  const uniq = new Map();
  for (const row of found) {
    const resolved = path.resolve(row.path);
    if (resolved === novaDir || resolved.startsWith(novaDir + path.sep)) {
      continue;
    }
    if (alreadyInNova(row.path)) continue;
    const key = `${row.fileName}:${row.sizeGb}`;
    if (!uniq.has(key)) uniq.set(key, row);
  }
  const list = [...uniq.values()].sort((a, b) => b.sizeGb - a.sizeGb);
  return {
    ok: true,
    scannedRoots: roots,
    count: list.length,
    models: list,
    note:
      'Ollama stores opaque blobs (not .gguf files). Connect Ollama under Models → Cloud / Local providers to use those. LM Studio and Hugging Face GGUFs can be imported here.',
  };
}

module.exports = {
  scanExternalGgufs,
  guessCatalogId,
  alreadyInNova,
};
