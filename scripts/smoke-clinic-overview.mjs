import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDebugClinic } from '../src/lib/debugClinic.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gym = path.resolve(__dirname, '..', '..', 'NovaClinicGym');

function walk(dir, out = [], base = dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'dist') continue;
      walk(p, out, base);
    } else if (/\.(jsx?|tsx?|css|json|md|html)$/i.test(ent.name)) {
      out.push(path.relative(base, p).replace(/\\/g, '/'));
    }
  }
  return out;
}

const files = {};
for (const rel of walk(gym)) {
  files[rel] = fs.readFileSync(path.join(gym, rel), 'utf8');
}

const report = await runDebugClinic({
  files,
  projectName: 'NovaClinicGym',
  diskRoot: gym,
});

const overview = report.brief?.overview || '';
const junk = /[*_`#]|->|→|•/.test(overview);
const ok = !junk && /half-built|demo|Vite|front-end|clinic/i.test(overview);

console.log(JSON.stringify({
  ok,
  junk,
  overview,
  verdictPreview: (report.brief?.verdict || '').slice(0, 140),
}, null, 2));

if (!ok) process.exit(1);
