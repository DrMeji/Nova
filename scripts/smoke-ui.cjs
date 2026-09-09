/**
 * Smoke-test: launch Electron, wait for load, dump renderer HTML + console.
 * Exit 0 if #root has substantial UI; exit 1 if blank/black.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const root = path.join(__dirname, '..');
const electronPath = require('electron');
const logFile = path.join(process.env.TEMP || root, 'NOVA-smoke-ui.log');
const resultFile = path.join(process.env.TEMP || root, 'NOVA-smoke-ui-result.json');

fs.writeFileSync(logFile, '');
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  fs.appendFileSync(logFile, line + '\n');
  console.log(msg);
}

// Patch: use a tiny preload probe via env that main already supports —
// instead inject via --require won't work for Electron. Use CDP debugger port.
const port = 9333 + Math.floor(Math.random() * 200);
const args = ['.', `--remote-debugging-port=${port}`, '--remote-allow-origins=*'];

log(`spawning ${electronPath} ${args.join(' ')} debug=${port}`);
const child = spawn(electronPath, args, {
  cwd: root,
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1', ARK_DEV: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stderr = '';
child.stderr.on('data', (d) => {
  const s = d.toString();
  stderr += s;
  for (const line of s.split(/\r?\n/)) {
    if (line.trim()) log('ERR ' + line.trim());
  }
});
child.stdout.on('data', (d) => {
  for (const line of d.toString().split(/\r?\n/)) {
    if (line.trim()) log('OUT ' + line.trim());
  }
});

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

function cdp(wsUrl, method, params = {}) {
  return new Promise((resolve, reject) => {
    const WebSocket = require('ws');
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.on('open', () => {
      id += 1;
      const msg = { id, method, params };
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify(msg));
      // also enable Runtime
    });
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
        else p.resolve(msg.result);
      }
    });
    ws.on('error', reject);
    setTimeout(() => {
      try {
        ws.close();
      } catch {}
      reject(new Error('cdp timeout'));
    }, 8000);
  });
}

async function evaluate(wsUrl, expression) {
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
    setTimeout(() => reject(new Error('evaluate timeout')), 10000);
  });
}

async function probe() {
  let targets;
  for (let i = 0; i < 20; i++) {
    try {
      targets = await fetchJson(`http://127.0.0.1:${port}/json`);
      if (Array.isArray(targets) && targets.length) break;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!targets?.length) throw new Error('no CDP targets');
  const page = targets.find((t) => t.type === 'page') || targets[0];
  log('CDP target: ' + page.url);
  const expr = `(() => {
    const root = document.getElementById('root');
    const text = (root?.innerText || '').slice(0, 500);
    const htmlLen = (root?.innerHTML || '').length;
    const scripts = [...document.scripts].map(s => s.src).filter(Boolean);
    const css = [...document.querySelectorAll('link[rel=stylesheet]')].map(l => l.href);
    return {
      url: location.href,
      readyState: document.readyState,
      rootLen: htmlLen,
      text,
      hasArkDesktop: typeof window.arkDesktop !== 'undefined',
      bodyBg: getComputedStyle(document.body).backgroundColor,
      scripts,
      css,
      title: document.title,
    };
  })()`;
  const result = await evaluate(page.webSocketDebuggerUrl, expr);
  const value = result?.result?.value ?? result;
  fs.writeFileSync(resultFile, JSON.stringify(value, null, 2));
  log('RESULT ' + JSON.stringify(value, null, 2));
  const ok =
    value &&
    typeof value.rootLen === 'number' &&
    value.rootLen > 50 &&
    !/Missing Supabase/i.test(value.text || '');
  return { ok, value };
}

(async () => {
  let code = 1;
  try {
    // wait for app to boot
    await new Promise((r) => setTimeout(r, 5000));
    const { ok, value } = await probe();
    code = ok ? 0 : 1;
    log(ok ? 'SMOKE PASS' : 'SMOKE FAIL');
    if (!ok) log('rootLen=' + value?.rootLen + ' text=' + (value?.text || '').slice(0, 200));
  } catch (e) {
    log('SMOKE ERROR ' + e.stack || e.message);
    code = 1;
  } finally {
    try {
      child.kill();
    } catch {}
    // kill orphans
    try {
      require('child_process').execSync('taskkill /F /IM electron.exe', { stdio: 'ignore' });
    } catch {}
    process.exit(code);
  }
})();
