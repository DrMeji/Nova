import { spawnSync } from 'node:child_process';

const checks = [
  'smoke:create-file-acceptance',
  'smoke:thin-create-path',
  'smoke:create-intent',
  'smoke:create-build-reaches-runtime',
  'smoke:create-evidence',
  'smoke:create-pass-spine',
  'smoke:create-budget-diagnostics',
  'smoke:single-brain-create',
];

for (const check of checks) {
  process.stdout.write(`\n=== ${check} ===\n`);
  const result = spawnSync('npm', ['run', check], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(`Create pipeline check failed: ${check}\n`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write('\nCreate pipeline regression suite: all checks passed.\n');
