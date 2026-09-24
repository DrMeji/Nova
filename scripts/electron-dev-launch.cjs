/**
 * Launch Electron for npm run electron:dev (Windows-safe NOVA_DEV=1).
 * Avoids `set VAR=1 && ...` which breaks under PowerShell / concurrently.
 */
const { spawn } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const electronBin = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const cdpPort = String(process.env.NOVA_CDP_PORT || '').trim();
const args = ['.'];
if (cdpPort) {
  args.push(`--remote-debugging-port=${cdpPort}`);
  args.push('--remote-allow-origins=*');
}
const child = spawn(electronBin, args, {
  cwd: root,
  env: { ...process.env, NOVA_DEV: '1' },
  stdio: 'inherit',
  windowsHide: false,
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
