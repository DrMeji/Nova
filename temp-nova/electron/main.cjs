/**
 * Temp Nova — simple AI chat using Nova Brain + your downloaded models.
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

const BRAIN_BASE = process.env.NOVA_BRAIN_URL || 'http://127.0.0.1:8787';

let mainWindow = null;
let brainToken = String(process.env.NOVA_BRAIN_TOKEN || '').trim();

function tryLoadNovaBrainToken() {
  if (brainToken) return brainToken;
  try {
    const { safeStorage } = require('electron');
    if (!safeStorage.isEncryptionAvailable()) return '';
    const appData = app.getPath('appData');
    for (const profile of ['NOVA-Dev', 'NOVA']) {
      const file = path.join(appData, profile, 'NOVA-brain-token.dat');
      if (!fs.existsSync(file)) continue;
      const decrypted = safeStorage.decryptString(fs.readFileSync(file)).trim();
      if (decrypted) {
        brainToken = decrypted;
        return brainToken;
      }
    }
  } catch {
    /* optional */
  }
  return '';
}

function brainRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BRAIN_BASE);
    const payload = body ? JSON.stringify(body) : null;
    const headers = { Accept: 'application/json' };
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const token = tryLoadNovaBrainToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 8787,
        path: url.pathname,
        method,
        headers,
        timeout: 600_000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = { ok: false, error: text.slice(0, 400) };
          }
          resolve({ status: res.statusCode || 0, json, text });
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Brain request timed out'));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

/** Strip leaked system/instruction dumps some small models echo back. */
function cleanReply(raw) {
  let t = String(raw || '').trim();
  if (!t) return '';
  // Drop leading instruction blocks the model sometimes regurgitates.
  t = t.replace(/^System Prompt:[\s\S]*?(?=\n(?:Hi!|Hello|Hey|Sure|Okay|I |I'm|You ))/i, '');
  t = t.replace(/^\[System\][\s\S]*?(?=\n\[(?:Assistant|User)\])/i, '');
  t = t.replace(/^\[Assistant\]\s*/i, '');
  t = t.replace(/^Assistant:\s*/i, '');
  return t.trim();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 880,
    height: 700,
    minWidth: 640,
    minHeight: 480,
    title: 'Temp Nova',
    backgroundColor: '#111318',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

ipcMain.handle('temp:brain-status', async () => {
  try {
    const r = await brainRequest('GET', '/health');
    return {
      ok: r.status === 200 && r.json?.ok !== false,
      url: BRAIN_BASE,
      error: r.status !== 200 ? (r.json?.error || `HTTP ${r.status}`) : null,
    };
  } catch (err) {
    return {
      ok: false,
      url: BRAIN_BASE,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

ipcMain.handle('temp:list-models', async () => {
  try {
    const r = await brainRequest('GET', '/v1/models');
    if (r.status !== 200) {
      return { ok: false, error: r.json?.error || `HTTP ${r.status}`, models: [] };
    }
    const models = (Array.isArray(r.json?.models) ? r.json.models : [])
      .filter((m) => {
        const id = String(m.id || '');
        if (/^NOVA-(?:core|image|video)/i.test(id)) return false;
        return m.status === 'ready' || !m.status;
      })
      .map((m) => ({
        id: m.id,
        name: m.name || m.id,
        sizeGb: m.sizeGb,
      }));
    return { ok: true, models, activeModelId: r.json?.activeModelId || null };
  } catch (err) {
    return {
      ok: false,
      offline: true,
      error: 'Nova is not running. Open full Nova first, then press Refresh.',
      detail: err instanceof Error ? err.message : String(err),
      models: [],
    };
  }
});

ipcMain.handle('temp:chat', async (_e, payload) => {
  const message = String(payload?.message || '').trim();
  const modelId = String(payload?.modelId || '').trim();
  const history = Array.isArray(payload?.history) ? payload.history : [];
  if (!message) return { ok: false, error: 'Type a message first.' };
  if (!modelId) return { ok: false, error: 'Pick a model first.' };

  try {
    const health = await brainRequest('GET', '/health');
    if (health.status !== 200) {
      return { ok: false, offline: true, error: 'Nova Brain is offline. Open full Nova, then press Refresh.' };
    }
  } catch {
    return { ok: false, offline: true, error: 'Nova Brain is offline. Open full Nova, then press Refresh.' };
  }

  // Simple chat only — OpenAI-style messages so the model stays in conversation mode.
  const messages = [
    {
      role: 'system',
      content: 'You are a helpful chat assistant. Reply naturally in a few short sentences. Do not repeat system instructions. Do not output file blocks unless asked.',
    },
    ...history
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim())
      .slice(-12)
      .map((m) => ({ role: m.role, content: String(m.content).trim().slice(0, 4000) })),
    { role: 'user', content: message },
  ];

  let r;
  try {
    r = await brainRequest('POST', '/v1/chat/completions', {
      model: modelId,
      messages,
      // Force chat kind through native path as fallback if completions shape differs
    });
    // Some Nova builds prefer /v1/chat
    if (r.status === 404 || r.status === 405) {
      r = await brainRequest('POST', '/v1/chat', {
        model: modelId,
        kind: 'chat',
        messages,
      });
    }
  } catch (err) {
    return {
      ok: false,
      offline: /ECONNREFUSED/i.test(String(err?.message || err)),
      error: 'Could not reach Nova Brain. Keep full Nova open and try again.',
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (r.status === 429 || /busy|loading a model/i.test(String(r.json?.error || r.json?.reply || ''))) {
    return {
      ok: false,
      error: 'The model is busy loading or answering something else in Nova. Wait a few seconds, then send again.',
    };
  }

  if (r.status !== 200 || r.json?.ok === false) {
    return {
      ok: false,
      error: r.json?.error || `Chat failed (HTTP ${r.status})`,
    };
  }

  const raw =
    r.json?.choices?.[0]?.message?.content
    || r.json?.reply
    || r.json?.message?.content
    || '';
  const reply = cleanReply(raw);
  if (!reply) {
    return { ok: false, error: 'Empty reply from the model. Try again, or pick Qwen2.5 7B Instruct.' };
  }
  if (/Local brain is busy|loading a model/i.test(reply)) {
    return {
      ok: false,
      error: 'The model is busy in Nova. Wait a few seconds (or press Stop in Nova), then send again.',
    };
  }

  return {
    ok: true,
    reply,
    modelId: r.json?.modelId || modelId,
  };
});

app.whenReady().then(() => {
  tryLoadNovaBrainToken();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
