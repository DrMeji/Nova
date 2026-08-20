/**
 * Generate a Grok upload pack on the Desktop.
 *   npm run grok:bundle
 *
 * Writes:
 *   Desktop/ARK-Grok-Review.txt   — brief + full source
 *   Desktop/ARK-Grok-Brief.md     — short handoff (upload this if the big file is too large)
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const desktop = path.join(os.homedir(), 'Desktop');
const outFull = path.join(desktop, 'ARK-Grok-Review.txt');
const outBrief = path.join(desktop, 'ARK-Grok-Brief.md');
const handoffSrc = path.join(root, 'docs', 'GROK-HANDOFF.md');

const excludeDirs = new Set([
  'node_modules',
  'dist',
  'release',
  '.git',
  '.cursor',
  'coverage',
]);
const excludeFiles = new Set([
  '.env',
  '.env.production',
  '.env.local',
  'package-lock.json',
]);
const secretName = /(\.pem$|\.p12$|\.pfx$|credentials\.json$|signing\.env$)/i;
const exts = new Set([
  '.tsx', '.ts', '.cjs', '.js', '.jsx', '.json', '.md', '.html', '.css',
  '.sql', '.bat', '.yml', '.yaml', '.mdc',
]);

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(root, full).replace(/\\/g, '/');
    let skip = false;
    for (const d of excludeDirs) {
      if (rel === d || rel.startsWith(`${d}/`)) {
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
    if (excludeFiles.has(name) || secretName.test(name)) continue;
    if (!exts.has(path.extname(name).toLowerCase())) continue;
    files.push(full);
  }
  return files;
}

function git(cmd) {
  try {
    return execSync(cmd, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const files = walk(root).sort();
const log = git('git log -20 --oneline');
const status = git('git status --short');
const head = git('git rev-parse --short HEAD');

const brief = fs.existsSync(handoffSrc)
  ? fs.readFileSync(handoffSrc, 'utf8')
  : `# ARK Grok brief\nVersion ${pkg.version}\n`;

const header = [
  'ARK FULL SOURCE BUNDLE FOR GROK REVIEW',
  `Version: ${pkg.version}`,
  `HEAD: ${head}`,
  `Generated: ${new Date().toISOString()}`,
  `Files: ${files.length}`,
  '',
  '=== GIT LOG (recent) ===',
  log || '(unavailable)',
  '',
  '=== GIT STATUS ===',
  status || '(clean)',
  '',
  '=== HANDOFF BRIEF ===',
  brief.trim(),
  '',
  '=== FILE INDEX ===',
  ...files.map((f) => path.relative(root, f).replace(/\\/g, '/')),
  '',
  '=== SOURCE ===',
  '',
];

const chunks = [...header];
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  chunks.push(`===== ${rel} =====`);
  chunks.push(fs.readFileSync(file, 'utf8'));
  chunks.push('');
}

fs.mkdirSync(desktop, { recursive: true });
fs.writeFileSync(outFull, chunks.join('\n'), 'utf8');
fs.writeFileSync(outBrief, `${brief.trim()}\n\n---\nGenerated ${new Date().toISOString()} from ARK ${pkg.version} (${head})\n`, 'utf8');

const mb = (fs.statSync(outFull).size / 1024 / 1024).toFixed(2);
console.log(`Wrote ${outBrief}`);
console.log(`Wrote ${outFull} (${files.length} files, ${mb} MB)`);
console.log('Upload ARK-Grok-Review.txt to Grok. If it is too large, upload ARK-Grok-Brief.md instead.');
