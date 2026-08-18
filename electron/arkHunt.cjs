/**
 * Hunted GGUF entries ARK Engine can download (internet finds, not the static catalog).
 */

const fs = require('fs');
const path = require('path');
const arkPaths = require('./arkPaths.cjs');
const arkHostPick = require('./arkHostPick.cjs');

function huntPath() {
  return path.join(arkPaths.modelsDir(), 'ark-hunt.json');
}

function list() {
  try {
    const raw = fs.readFileSync(huntPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.models) ? parsed.models : [];
  } catch {
    return [];
  }
}

function save(models) {
  try {
    fs.mkdirSync(arkPaths.modelsDir(), { recursive: true });
    fs.writeFileSync(huntPath(), JSON.stringify({ models, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
  } catch {
    /* ignore */
  }
}

function register(meta) {
  const id = String(meta?.id || '').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 72);
  const url = String(meta?.url || '').split('?')[0];
  if (!id.startsWith('hunt-') || !arkHostPick.isAllowedModelUrl(url)) {
    throw new Error('Invalid hunted model');
  }
  const row = {
    id,
    name: String(meta.name || id).slice(0, 80),
    detail: String(meta.detail || 'Found online · GGUF · ARK Engine'),
    sizeGb: Number(meta.sizeGb) > 0 ? Number(meta.sizeGb) : 1,
    status: 'missing',
    url,
    category: meta.category === 'chat' ? 'chat' : 'coding',
    hunted: true,
  };
  const next = [row, ...list().filter((m) => m.id !== id)].slice(0, 40);
  save(next);
  return row;
}

function find(id) {
  return list().find((m) => m.id === id) || null;
}

module.exports = { list, register, find };
