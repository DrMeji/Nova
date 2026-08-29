/**
 * Launch Electron for npm run electron:dev (Windows-safe ARK_DEV=1).
 * Avoids `set VAR=1 && ...` which breaks under PowerShell / concurrently.
 */
const { spawn } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const electronBin = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const child = spawn(electronBin, ['.'], {
  cwd: root,
  env: { ...process.env, ARK_DEV: '1' },
  stdio: 'inherit',
  windowsHide: false,
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
