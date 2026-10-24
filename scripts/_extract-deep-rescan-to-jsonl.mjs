/**
 * One-shot: pull RAW rows out of the bloated canvas into JSONL.
 * Canvas was ~10MB / 320k lines — IDE can't open it.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const canvasPath =
  'C:/Users/thoma/.cursor/projects/c-Users-thoma-Desktop-Projects-Nova/canvases/nova-deep-rescan.canvas.tsx';
const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const outPath = path.join(outDir, 'nova-deep-rescan.jsonl');

fs.mkdirSync(outDir, { recursive: true });

const t = fs.readFileSync(canvasPath, 'utf8');
const re =
  /capability: '([^']*)',\s*lane: '([^']*)',\s*nova: '([^']*)',\s*leader: '([^']*)',\s*howTheyDoIt: '([^']*)',\s*novaNow: '([^']*)'/g;

const seen = new Set();
let n = 0;
const ws = fs.createWriteStream(outPath, { encoding: 'utf8' });
let m;
while ((m = re.exec(t))) {
  const cap = m[1];
  const key = cap.toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);
  ws.write(
    `${JSON.stringify({
      capability: cap,
      lane: m[2],
      nova: m[3],
      leader: m[4],
      howTheyDoIt: m[5],
      novaNow: m[6],
    })}\n`,
  );
  n += 1;
}
await new Promise((resolve, reject) => {
  ws.end(() => resolve());
  ws.on('error', reject);
});

console.log({ extracted: n, outPath, bytes: fs.statSync(outPath).size });
