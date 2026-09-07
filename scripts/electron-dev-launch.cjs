/**
 * Launch Electron for npm run electron:dev (Windows-safe ARK_DEV=1).
 * Avoids `set VAR=1 && ...` which breaks under PowerShell / concurrently.
 */
const { spawn } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const electronBin = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const cdpPort = String(process.env.ARK_CDP_PORT || '').trim();
const args = ['.'];
if (cdpPort) args.push(`--remote-debugging-port=${cdpPort}`);
const child = spawn(electronBin, args, {
  cwd: root,
  env: { ...process.env, ARK_DEV: '1' },
  stdio: 'inherit',
  windowsHide: false,
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
