/**
 * Split full Nova source into uploadable markdown parts for Grok.
 * Usage: node scripts/pack-grok-full-parts.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', 'Nova-Grok-Upload', 'parts');
fs.mkdirSync(outDir, { recursive: true });

const files = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'dist' || ent.name === '.git') continue;
      walk(p);
    } else if (/\.(tsx?|jsx?|cjs|mjs|css|json|html|md|yml|yaml)$/i.test(ent.name)) {
      files.push(p);
    }
  }
}

walk(path.join(root, 'src'));
walk(path.join(root, 'electron'));
walk(path.join(root, 'scripts'));
for (const extra of [
  'package.json',
  'package-lock.json',
  'vite.config.ts',
  'index.html',
  'tsconfig.json',
  'tsconfig.node.json',
  'README.md',
  '.gitignore',
]) {
  const p = path.join(root, extra);
  if (fs.existsSync(p)) files.push(p);
}

files.sort((a, b) => a.localeCompare(b));

const MAX = 850_000; // ~0.85 MiB per part
let part = 1;
let buf = '';
let bytes = 0;

function flush() {
  if (!buf) return;
  const name = path.join(outDir, `Nova-source-part-${String(part).padStart(2, '0')}.md`);
  const header = [
    `# Nova source pack — part ${part}`,
    '',
    'Upload **all** parts to Grok together with `Nova-full-source.zip` if possible.',
    'You are helping debug Nova (Electron AI creation studio) / Nightglass ladder.',
    '',
  ].join('\n');
  fs.writeFileSync(name, header + buf, 'utf8');
  const mb = (Buffer.byteLength(header + buf) / 1024 / 1024).toFixed(2);
  console.log(`wrote ${path.basename(name)} (${mb} MiB)`);
  part += 1;
  buf = '';
  bytes = 0;
}

for (const abs of files) {
  const rel = path.relative(root, abs).replace(/\\/g, '/');
  let text = '';
  try {
    text = fs.readFileSync(abs, 'utf8');
  } catch {
    continue;
  }
  if (text.length > 1_200_000) {
    text = `${text.slice(0, 250_000)}\n\n/* … truncated ${rel} (was ${text.length} chars) … */\n`;
  }
  const block = `\n\n===== FILE: ${rel} =====\n\n\`\`\`\n${text}\n\`\`\`\n`;
  const blockBytes = Buffer.byteLength(block);
  if (bytes + blockBytes > MAX && buf) flush();
  // If a single file is huge, force its own part(s)
  if (blockBytes > MAX) {
    flush();
    const chunks = Math.ceil(text.length / 700_000);
    for (let i = 0; i < chunks; i++) {
      const slice = text.slice(i * 700_000, (i + 1) * 700_000);
      buf = `\n\n===== FILE: ${rel} (chunk ${i + 1}/${chunks}) =====\n\n\`\`\`\n${slice}\n\`\`\`\n`;
      bytes = Buffer.byteLength(buf);
      flush();
    }
    continue;
  }
  buf += block;
  bytes += blockBytes;
}
flush();

const readme = path.join(outDir, '..', 'README-UPLOAD.txt');
fs.writeFileSync(readme, [
  'NOVA → GROK UPLOAD PACK',
  '',
  'BEST OPTION',
  '  Upload Nova-full-source.zip (complete source tree, no node_modules).',
  '',
  'ALTERNATE (if zip not accepted)',
  '  Upload every Nova-source-part-XX.md in the parts\\ folder.',
  '',
  'OPTIONAL CONTEXT',
  '  Also upload Desktop\\GROK-HANDOFF-Nova.md (problem brief + critical slices).',
  '',
  'Tell Grok:',
  '  Help review Nova (Electron AI studio) after Tier A–D coding-brain fixes.',
  '  Do not patch Nightglass / user project folders — only fix Nova itself.',
  '  Focus: create intent → disk write → bound follow-up edit → no UI freeze.',
  '  Acceptance: npm run smoke:classify-turn && npm run smoke:create-reply && npm run smoke:create-intent',
  '  After each Nova fix, test with a NEW natural prompt wording.',
  '',
].join('\n'), 'utf8');

console.log(`done — ${part - 1} parts in ${outDir}`);
