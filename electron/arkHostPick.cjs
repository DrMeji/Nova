/**
 * Preferred GGUF file host (Hugging Face, HF Mirror, ModelScope).
 * Speed test writes this; downloads read it so installs use the fastest path.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const HOSTS = [
  { id: 'huggingface', name: 'Hugging Face' },
  { id: 'hf-mirror', name: 'HF Mirror' },
  { id: 'modelscope', name: 'ModelScope' },
];

function pickPath() {
  return path.join(app.getPath('userData'), 'ark-engine', 'host-pick.json');
}

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(pickPath(), 'utf8'));
    if (!parsed || typeof parsed !== 'object') return { preferredId: 'huggingface' };
    return parsed;
  } catch {
    return { preferredId: 'huggingface' };
  }
}

function save(partial) {
  const next = { ...load(), ...partial, updatedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(pickPath()), { recursive: true });
  fs.writeFileSync(pickPath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function preferredId() {
  const id = String(load().preferredId || 'huggingface');
  return HOSTS.some((h) => h.id === id) ? id : 'huggingface';
}

function hostName(id) {
  return HOSTS.find((h) => h.id === id)?.name || id || 'Hugging Face';
}

/** Hugging Face ↔ HF Mirror are the same files. ModelScope URLs stay as-is. */
function candidateUrls(url) {
  const raw = String(url || '').split('?')[0];
  if (!raw) return [];
  if (/huggingface\.co\//i.test(raw)) {
    const mirror = raw.replace(/https:\/\/huggingface\.co/i, 'https://hf-mirror.com');
    return preferredId() === 'hf-mirror' ? [mirror, raw] : [raw, mirror];
  }
  if (/hf-mirror\.com\//i.test(raw)) {
    const hf = raw.replace(/https:\/\/hf-mirror\.com/i, 'https://huggingface.co');
    return preferredId() === 'huggingface' ? [hf, raw] : [raw, hf];
  }
  return [raw];
}

function isAllowedModelUrl(url) {
  const u = String(url || '').split('?')[0];
  if (!u.toLowerCase().endsWith('.gguf')) return false;
  return (
    /^https:\/\/huggingface\.co\/[^/]+\/[^/]+\/resolve\//i.test(u)
    || /^https:\/\/hf-mirror\.com\/[^/]+\/[^/]+\/resolve\//i.test(u)
    || /^https:\/\/(www\.)?modelscope\.(cn|ai)\/models\/[^/]+\/[^/]+\/resolve\//i.test(u)
  );
}

module.exports = {
  HOSTS,
  load,
  save,
  preferredId,
  hostName,
  candidateUrls,
  isAllowedModelUrl,
};
