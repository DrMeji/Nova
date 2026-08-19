/**
 * Generate single-file Grok review bundle on Desktop.
 * node scripts/generate-grok-bundle.cjs
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(require('os').homedir(), 'Desktop', 'ARK-Grok-Review.txt');
const excludeDirs = new Set(['node_modules', 'dist', 'release', '.git', '.cursor']);
const excludeFiles = new Set(['.env', '.env.production', 'package-lock.json']);
const exts = new Set(['.tsx', '.ts', '.cjs', '.js', '.jsx', '.json', '.md', '.html', '.css', '.sql', '.bat', '.yml', '.yaml', '.mdc']);

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(root, full).replace(/\\/g, '/');
    if (excludeDirs.has(name) && dir === root) continue;
    let skip = false;
    for (const d of excludeDirs) {
      if (rel.startsWith(`${d}/`) || rel === d) {
        skip = true;
        break;
      }
    }
    if (skip) continue;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
      continue;
    }
    if (excludeFiles.has(name)) continue;
    if (!exts.has(path.extname(name).toLowerCase())) continue;
    files.push(full);
  }
  return files;
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const files = walk(root).sort();
const lines = [
  'ARK FULL SOURCE BUNDLE FOR CODE REVIEW',
  `Version: ${pkg.version}`,
  `Generated: ${new Date().toISOString()}`,
  `Files: ${files.length}`,
  '',
];

for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  lines.push(`===== ${rel} =====`);
  lines.push(fs.readFileSync(file, 'utf8'));
  lines.push('');
}

fs.writeFileSync(out, lines.join('\n'), 'utf8');
console.log(`Wrote ${out} (${files.length} files, ${(fs.statSync(out).size / 1024 / 1024).toFixed(2)} MB)`);
