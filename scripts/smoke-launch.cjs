const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const electron = require('electron');
const root = path.join(__dirname, '..');
const logPath = path.join(process.env.TEMP, 'NOVA-smoke.log');
fs.writeFileSync(logPath, '');
function log(m) { fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${m}\n`); console.log(m); }

log('launching electron');
const child = spawn(electron, ['.'], {
  cwd: root,
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1', NOVA_DEV: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let out = '';
child.stdout.on('data', d => { out += d; log('OUT '+d.toString().trim()); });
child.stderr.on('data', d => { out += d; log('ERR '+d.toString().trim()); });
setTimeout(() => {
  const healthy = /\[NOVA-brain\].*127\.0\.0\.1:8787|\[nova-engine\] ready/i.test(out);
  log(healthy ? 'startup healthy; timeout kill' : 'startup markers missing; timeout kill');
  try { child.kill(); } catch {}
  process.exit(healthy ? 0 : 1);
}, 12000);
child.on('exit', (c) => {
  log('exit '+c);
  if (c !== 0) process.exit(c || 1);
});
