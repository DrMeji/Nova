#!/usr/bin/env node
/**
 * Minimal Lindsay client for ARK’s brain API (http://127.0.0.1:8787).
 * Usage:
 *   node chat.mjs "Hello from Lindsay"
 *   node chat.mjs --stream "Count to five"
 * Optional: ARK_BRAIN_TOKEN=... ARK_BRAIN_URL=http://127.0.0.1:8787
 */

const BRAIN = process.env.ARK_BRAIN_URL || 'http://127.0.0.1:8787';
const TOKEN = process.env.ARK_BRAIN_TOKEN || '';

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}

async function chat(message) {
  const res = await fetch(`${BRAIN}/v1/chat`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ message, kind: 'chat' }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function chatStream(message, onDelta) {
  const res = await fetch(`${BRAIN}/v1/chat/stream`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ message, kind: 'chat' }),
  });
  if (!res.ok || !res.body) throw new Error(await res.text());
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let donePayload = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const chunks = buf.split('\n\n');
    buf = chunks.pop() || '';
    for (const block of chunks) {
      const ev = /event:\s*(\w+)/.exec(block)?.[1];
      const dataLine = block.split('\n').find((l) => l.startsWith('data:'));
      if (!dataLine) continue;
      let data = {};
      try {
        data = JSON.parse(dataLine.slice(5).trim() || '{}');
      } catch {
        continue;
      }
      if (ev === 'delta' && data.text) onDelta(data.text);
      if (ev === 'done') donePayload = data;
      if (ev === 'error') throw new Error(data.error || 'stream error');
    }
  }
  return donePayload;
}

async function main() {
  const args = process.argv.slice(2);
  const stream = args.includes('--stream');
  const message = args.filter((a) => a !== '--stream').join(' ') || 'Say hello from ARK Engine';

  const health = await fetch(`${BRAIN}/health`).then((r) => r.json()).catch(() => null);
  if (!health?.ok) {
    console.error('ARK brain not reachable at', BRAIN, '— start the desktop app first.');
    process.exit(1);
  }
  console.error('brain ok ·', health.contractVersion || health.version || '');

  if (stream) {
    process.stdout.write('assistant: ');
    const done = await chatStream(message, (t) => process.stdout.write(t));
    process.stdout.write('\n');
    if (done?.modelName) console.error('model:', done.modelName);
    return;
  }

  const out = await chat(message);
  console.log(out.reply || JSON.stringify(out, null, 2));
  if (out.modelName) console.error('model:', out.modelName);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
