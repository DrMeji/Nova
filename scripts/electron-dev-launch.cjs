/**
 * Launch Electron for npm run electron:dev (Windows-safe NOVA_DEV=1).
 * Avoids `set VAR=1 && ...` which breaks under PowerShell / concurrently.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const electronBin = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const cdpPort = String(process.env.NOVA_CDP_PORT || '').trim();
const logPath = path.join(root, '.tmp-electron-launch.log');
const args = ['.'];
if (cdpPort) {
  args.push(`--remote-debugging-port=${cdpPort}`);
  args.push('--remote-allow-origins=*');
}
const child = spawn(electronBin, args, {
  cwd: root,
  env: { ...process.env, NOVA_DEV: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: false,
});
const log = (line) => {
  try { fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${line}\n`); } catch { /* ignore */ }
  try { process.stderr.write(String(line) + '\n'); } catch { /* ignore */ }
};
log(`spawn pid=${child.pid} cdp=${cdpPort || 'off'} args=${args.join(' ')}`);
child.stdout?.on('data', (c) => log(String(c).trimEnd()));
child.stderr?.on('data', (c) => log(String(c).trimEnd()));
child.on('exit', (code, signal) => {
  log(`exit code=${code} signal=${signal}`);
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
