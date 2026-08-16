const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const electron = require('electron');
const logPath = path.join(process.env.TEMP, 'ark-smoke.log');
fs.writeFileSync(logPath, '');
function log(m) { fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${m}\n`); console.log(m); }

log('launching electron');
const child = spawn(electron, ['.'], {
  cwd: __dirname,
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1', ARK_DEV: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let out = '';
child.stdout.on('data', d => { out += d; log('OUT '+d.toString().trim()); });
child.stderr.on('data', d => { out += d; log('ERR '+d.toString().trim()); });
setTimeout(() => {
  log('timeout kill');
  try { child.kill(); } catch {}
  process.exit(0);
}, 12000);
child.on('exit', (c) => { log('exit '+c); });
