/**
 * Smoke packaged NOVA.exe — must show Auth UI, not blank root.
 *
 * Resolution order:
 *   1) NOVA_SMOKE_EXE env (installed Start Menu path or custom)
 *   2) release/win-unpacked/NOVA.exe (dir build)
 *   3) Common installed paths after Setup.exe
 *
 * Installer itself is not silent-automated here; after you run NOVA-Setup.exe once,
 * point this smoke at the installed exe via NOVA_SMOKE_EXE or let path #3 find it.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');

const root = path.join(__dirname, '..');
const port = 9444;
const logFile = path.join(process.env.TEMP || root, 'NOVA-smoke-packaged.log');

function resolveExe() {
  const fromEnv = (process.env.NOVA_SMOKE_EXE || '').trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  const candidates = [
    path.join(root, 'release', 'win-unpacked', 'NOVA.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'NOVA', 'NOVA.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nova', 'NOVA.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'NOVA', 'NOVA.exe'),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

const exe = resolveExe();

fs.writeFileSync(logFile, '');
function log(msg) {
  fs.appendFileSync(logFile, msg + '\n');
  console.log(msg);
}

if (!exe) {
  console.error(
    'Missing packaged NOVA.exe. Build with `npm run electron:build:dir`, install NOVA-Setup.exe, or set NOVA_SMOKE_EXE.',
  );
  process.exit(1);
}

log('using exe ' + exe);

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function evaluate(wsUrl, expression) {
  const WebSocket = require('ws');
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const waiters = new Map();
    const send = (method, params) =>
      new Promise((res, rej) => {
        const id = nextId++;
        waiters.set(id, { res, rej });
        ws.send(JSON.stringify({ id, method, params }));
      });
    ws.on('open', async () => {
      try {
        await send('Runtime.enable', {});
        const result = await send('Runtime.evaluate', {
          expression,
          returnByValue: true,
          awaitPromise: true,
        });
        resolve(result);
        ws.close();
      } catch (e) {
        reject(e);
        try {
          ws.close();
        } catch {}
      }
    });
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id && waiters.has(msg.id)) {
        const w = waiters.get(msg.id);
        waiters.delete(msg.id);
        if (msg.error) w.rej(new Error(JSON.stringify(msg.error)));
        else w.res(msg.result);
      }
    });
    ws.on('error', reject);
    setTimeout(() => reject(new Error('evaluate timeout')), 12000);
  });
}

log('launching ' + exe);
const child = spawn(exe, [`--remote-debugging-port=${port}`], {
  cwd: path.dirname(exe),
  env: { ...process.env },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stderr.on('data', (d) => log('ERR ' + d.toString().trim()));
child.stdout.on('data', (d) => log('OUT ' + d.toString().trim()));

(async () => {
  let code = 1;
  try {
    await new Promise((r) => setTimeout(r, 7000));
    let targets;
    for (let i = 0; i < 25; i++) {
      try {
        targets = await fetchJson(`http://127.0.0.1:${port}/json`);
        if (targets?.length) break;
      } catch {
        /* retry */
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    if (!targets?.length) throw new Error('no CDP targets');
    const page = targets.find((t) => t.type === 'page') || targets[0];
    log('page ' + page.url);
    const result = await evaluate(
      page.webSocketDebuggerUrl,
      `(() => {
        const root = document.getElementById('root');
        return {
          url: location.href,
          rootLen: (root?.innerHTML || '').length,
          text: (root?.innerText || '').slice(0, 400),
          hasArkDesktop: typeof window.arkDesktop !== 'undefined',
          readyState: document.readyState,
          title: document.title,
        };
      })()`,
    );
    const value = result?.result?.value ?? result;
    log(JSON.stringify(value, null, 2));
    const text = String(value?.text || '');
    const fatal = /could not start|fatal error|configuration error/i.test(text);
    const ok =
      value &&
      value.readyState === 'complete' &&
      value.hasArkDesktop === true &&
      value.rootLen > 50 &&
      !fatal &&
      /Sign in|Welcome|NOVA|BUILD/i.test(text);
    log(ok ? 'PACKAGED SMOKE PASS' : 'PACKAGED SMOKE FAIL');
    code = ok ? 0 : 1;
  } catch (e) {
    log('ERROR ' + (e.stack || e.message));
    code = 1;
  } finally {
    try {
      child.kill();
    } catch {}
    try {
      require('child_process').execSync('taskkill /F /IM NOVA.exe', { stdio: 'ignore' });
    } catch {}
    try {
      require('child_process').execSync('taskkill /F /IM electron.exe', { stdio: 'ignore' });
    } catch {}
    process.exit(code);
  }
})();
