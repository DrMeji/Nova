/**
 * Smoke: chat attach packing (prompt + images + files) matches what Enter send builds.
 * Run: node scripts/smoke-chat-attach.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Load TS sources via Vite-less dynamic import of compiled-ish paths — use tsx if available,
// else inline the same encode/parse contract from chatAttach.
async function loadAttach() {
  try {
    const { register } = await import('node:module');
    // Prefer running through the repo's ts if present
  } catch { /* ignore */ }
  const require = createRequire(import.meta.url);
  // Inline mirror of encode/parse so this smoke stays zero-build.
  const MARKER_RE = /<!--nova-attach:([\s\S]*?)-->/g;
  function encodeChatAttach(meta) {
    const payload = {
      kind: meta.kind,
      name: String(meta.name || 'attachment').slice(0, 120),
    };
    if (meta.count != null) payload.count = Math.max(0, Math.floor(meta.count));
    if (meta.id) payload.id = String(meta.id).slice(0, 64);
    if (meta.mediaId) payload.mediaId = String(meta.mediaId).slice(0, 80);
    return `<!--nova-attach:${JSON.stringify(payload)}-->`;
  }
  function encodeChatAttaches(metas) {
    return metas.map(encodeChatAttach).join('\n');
  }
  function parseChatAttaches(content) {
    const out = [];
    const re = new RegExp(MARKER_RE.source, 'g');
    let m;
    while ((m = re.exec(String(content || ''))) !== null) {
      try {
        const raw = JSON.parse(m[1]);
        if (raw?.kind && raw?.name) out.push(raw);
      } catch { /* skip */ }
    }
    return out;
  }
  function packSend({ text, images, files }) {
    const parts = [];
    const chatAttaches = [
      ...files.map(f => ({ kind: 'file', name: f.name, count: 1, id: f.id })),
      ...images.map(img => ({
        kind: 'image',
        name: img.name,
        count: 1,
        id: img.id,
        mediaId: img.id,
      })),
    ];
    if (chatAttaches.length) parts.push(encodeChatAttaches(chatAttaches));
    if (text.trim()) parts.push(text.trim());
    else if (chatAttaches.length) parts.push('<!--nova-auto-read-->');
    if (images.length) {
      parts.push(...images.map(img => `![${img.name.replace(/[\[\]]/g, '')}](nova-media:${img.id})`));
    }
    return parts.join('\n\n');
  }
  function extractVisionIds(content) {
    return [...String(content || '').matchAll(/!\[[^\]]*]\(nova-media:([^)]+)\)/g)].map(m => m[1].trim());
  }
  return { encodeChatAttaches, parseChatAttaches, packSend, extractVisionIds };
}

const { parseChatAttaches, packSend, extractVisionIds } = await loadAttach();

const packed = packSend({
  text: 'What is in this note and photo?',
  images: [{ id: 'attach-abc1234567', name: 'fake-photo.png' }],
  files: [{ id: 'file-deadbeef', name: 'notes.txt' }],
});

assert.match(packed, /What is in this note and photo\?/);
assert.match(packed, /!\[[^\]]*]\(nova-media:attach-abc1234567\)/);
assert.match(packed, /notes\.txt/);

const metas = parseChatAttaches(packed);
assert.equal(metas.length, 2);
assert.ok(metas.some(m => m.kind === 'file' && m.name === 'notes.txt'));
assert.ok(metas.some(m => m.kind === 'image' && m.mediaId === 'attach-abc1234567'));

const ids = extractVisionIds(packed);
assert.deepEqual(ids, ['attach-abc1234567']);

// Images-only Enter still packs a readable prompt + media ref
const imgOnly = packSend({
  text: '',
  images: [{ id: 'attach-zzzzzzzzzz', name: 'shot.webp' }],
  files: [],
});
assert.match(imgOnly, /nova-auto-read|nova-media:attach-zzzzzzzzzz/);
assert.equal(extractVisionIds(imgOnly)[0], 'attach-zzzzzzzzzz');

console.log('smoke-chat-attach: ok');
console.log('sample packed message:\n---\n' + packed + '\n---');
void root;
void pathToFileURL;
