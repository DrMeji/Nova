/**
 * ARK Brain HTTP API — loopback brain for ARK Chat and external apps
 * (Lindsay, custom assistants, etc.). Powered by ARK Engine only.
 *
 * Native:   /health /v1/* @ 8787
 * Compat:   Ollama-shaped /api/* and OpenAI-shaped /v1/chat/completions
 *           so apps that currently speak Ollama can point at ARK instead.
 */

const http = require('http');

const CONTRACT_VERSION = '0.4.0';

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

/** Flatten Ollama/OpenAI-style messages[] into one prompt for Engine. */
function packMessages(parsed) {
  if (typeof parsed.message === 'string' && parsed.message.trim()) {
    return parsed.message.trim();
  }
  const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
  if (messages.length === 0) {
    if (typeof parsed.prompt === 'string') return parsed.prompt.trim();
    return '';
  }
  const lines = [];
  for (const m of messages) {
    const role = String(m?.role || 'user').toLowerCase();
    const content = typeof m?.content === 'string'
      ? m.content
      : Array.isArray(m?.content)
        ? m.content.map((c) => (typeof c === 'string' ? c : c?.text || '')).join('')
        : '';
    if (!content.trim()) continue;
    if (role === 'system') lines.push(`[System]\n${content.trim()}`);
    else if (role === 'assistant') lines.push(`[Assistant]\n${content.trim()}`);
    else lines.push(`[User]\n${content.trim()}`);
  }
  return lines.join('\n\n');
}

function resolveModelId(raw, arkEngine) {
  if (!raw || typeof raw !== 'string') return undefined;
  const id = raw.trim();
  if (!id || id === 'ark-auto') return undefined;
  const status = arkEngine.getStatus();
  const exact = status.models.find((m) => m.id === id || m.name === id);
  if (exact) return exact.id;
  const compact = id.toLowerCase().replace(/[:\s._]/g, '');
  const fuzzy = status.models.find((m) => {
    const mid = String(m.id).toLowerCase().replace(/[-_\s.]/g, '');
    const name = String(m.name).toLowerCase().replace(/[-_\s.]/g, '');
    return mid.includes(compact.slice(0, 12)) || name.includes(compact.slice(0, 12)) || compact.includes(mid);
  });
  return fuzzy?.id;
}

function ollamaModelRows(arkEngine) {
  const status = arkEngine.getStatus();
  return status.models
    .filter((m) => m.status === 'ready' && m.id !== 'ark-core')
    .map((m) => ({
      name: m.id,
      model: m.id,
      modified_at: new Date().toISOString(),
      size: Math.round((m.sizeGb || 0) * 1024 * 1024 * 1024),
      digest: `ark-${m.id}`,
      details: {
        parent_model: '',
        format: m.gguf ? 'gguf' : 'ark',
        family: 'ark-engine',
        families: ['ark-engine'],
        parameter_size: m.detail || '',
        quantization_level: 'Q4_K_M',
      },
      ark: { id: m.id, name: m.name, detail: m.detail },
    }));
}

function ensureOnline(arkEngine) {
  if (arkEngine.getStatus().phase !== 'online') {
    arkEngine.start();
  }
}

/**
 * @param {{ arkEngine: any, port: number, token?: string }} opts
 */
function createBrainServer(opts) {
  const { arkEngine, port, token = '' } = opts;
  const brainToken = String(token || '').trim();
  let listening = false;
  let server = null;

  const publicEndpoints = [
    'GET /health',
    'GET /v1/contract',
    'GET /v1/models',
    'GET /v1/engine',
    'POST /v1/chat',
    'POST /v1/chat/stream',
    'POST /v1/chat/completions',
    'GET /api/tags',
    'POST /api/chat',
    'POST /api/generate',
    'GET /api/version',
  ];

  async function runGenerate(parsed) {
    ensureOnline(arkEngine);
    const message = packMessages(parsed);
    const modelId = resolveModelId(parsed.model, arkEngine);
    const kind = parsed.kind === 'image' || parsed.kind === 'video'
      ? parsed.kind
      : undefined;
    return arkEngine.generate(message, { modelId, kind });
  }

  async function runGenerateStream(parsed, onChunk) {
    ensureOnline(arkEngine);
    const message = packMessages(parsed);
    const modelId = resolveModelId(parsed.model, arkEngine);
    const kind = parsed.kind === 'image' || parsed.kind === 'video'
      ? parsed.kind
      : undefined;
    return arkEngine.generate(message, { modelId, kind, onChunk });
  }

  server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = (req.url || '/').split('?')[0];
    const openPaths = new Set(['/', '/health', '/v1/contract', '/api/version']);

    if (brainToken) {
      const auth = String(req.headers.authorization || '');
      const ok = auth === `Bearer ${brainToken}` || auth === `bearer ${brainToken}`;
      if (!ok && !openPaths.has(url)) {
        return json(res, 401, {
          ok: false,
          error: 'Unauthorized — set Authorization: Bearer <ARK_BRAIN_TOKEN>',
        });
      }
    }

    try {
      // ── Health / contract ──────────────────────────────────────────
      if ((url === '/' || url === '/health') && req.method === 'GET') {
        const engine = arkEngine.getStatus();
        return json(res, 200, {
          ok: true,
          service: 'ark-brain',
          version: CONTRACT_VERSION,
          contractVersion: CONTRACT_VERSION,
          engine: {
            phase: engine.phase,
            activeModelId: engine.activeModelId,
            activeModelName: engine.activeModelName,
          },
          compat: ['ollama-/api', 'openai-/v1/chat/completions'],
          note: 'ARK brain API — ARK Engine on this device (drop-in brain for external apps)',
        });
      }

      if (url === '/v1/contract' && req.method === 'GET') {
        return json(res, 200, {
          ok: true,
          contractVersion: CONTRACT_VERSION,
          baseUrl: `http://127.0.0.1:${port}`,
          endpoints: publicEndpoints,
          auth: brainToken ? 'bearer' : 'none (localhost)',
          kinds: ['chat', 'image', 'video'],
          messages: true,
          compat: {
            ollama: ['GET /api/tags', 'POST /api/chat', 'POST /api/generate'],
            openai: ['POST /v1/chat/completions'],
          },
          purpose: 'External apps (assistants, IDEs, agents) use ARK as their brain instead of a third-party local runtime.',
        });
      }

      if (url === '/v1/models' && req.method === 'GET') {
        const engine = arkEngine.getStatus();
        return json(res, 200, {
          ok: true,
          models: engine.models.filter((m) => m.status === 'ready'),
          activeModelId: engine.activeModelId,
        });
      }

      if (url === '/v1/engine' && req.method === 'GET') {
        return json(res, 200, { ok: true, ...arkEngine.getStatus() });
      }

      // ── Native chat ───────────────────────────────────────────────
      if (url === '/v1/chat' && req.method === 'POST') {
        const raw = await readBody(req);
        const parsed = raw ? JSON.parse(raw) : {};
        const result = await runGenerate(parsed);
        return json(res, 200, {
          ok: true,
          reply: result.reply,
          modelName: result.modelName,
          model: result.modelName,
          modelId: result.modelId,
          source: result.source || 'ark-engine',
          media: result.media,
        });
      }

      if (url === '/v1/chat/stream' && req.method === 'POST') {
        const raw = await readBody(req);
        const parsed = raw ? JSON.parse(raw) : {};
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });
        res.write(`event: status\ndata: ${JSON.stringify({ ok: true, phase: 'generating' })}\n\n`);
        try {
          const result = await runGenerateStream(parsed, (text) => {
            try {
              res.write(`event: delta\ndata: ${JSON.stringify({ text: String(text || '') })}\n\n`);
            } catch {
              /* ignore */
            }
          });
          res.write(`event: done\ndata: ${JSON.stringify({
            ok: true,
            reply: result.reply,
            modelName: result.modelName,
            modelId: result.modelId,
            source: result.source || 'ark-engine',
            media: result.media,
            streamed: Boolean(result.streamed),
          })}\n\n`);
          res.end();
        } catch (err) {
          res.write(`event: error\ndata: ${JSON.stringify({
            ok: false,
            error: err instanceof Error ? err.message : 'Bad request',
          })}\n\n`);
          res.end();
        }
        return;
      }

      // ── OpenAI-compatible (many SDKs / agents) ─────────────────────
      if (url === '/v1/chat/completions' && req.method === 'POST') {
        const raw = await readBody(req);
        const parsed = raw ? JSON.parse(raw) : {};
        const stream = Boolean(parsed.stream);
        const modelLabel = typeof parsed.model === 'string' ? parsed.model : 'ark-engine';

        if (stream) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          });
          const result = await runGenerateStream(parsed, (text) => {
            const chunk = {
              id: `ark-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: modelLabel,
              choices: [{ index: 0, delta: { content: String(text || '') }, finish_reason: null }],
            };
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          });
          res.write(`data: ${JSON.stringify({
            id: `ark-${Date.now()}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: result.modelId || modelLabel,
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }

        const result = await runGenerate(parsed);
        return json(res, 200, {
          id: `ark-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: result.modelId || modelLabel,
          choices: [{
            index: 0,
            message: { role: 'assistant', content: result.reply || '' },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          ark: {
            modelName: result.modelName,
            source: result.source || 'ark-engine',
          },
        });
      }

      // ── Ollama-compatible (Lindsay & similar) ──────────────────────
      if (url === '/api/version' && req.method === 'GET') {
        return json(res, 200, { version: `ark-brain-${CONTRACT_VERSION}` });
      }

      if (url === '/api/tags' && req.method === 'GET') {
        return json(res, 200, { models: ollamaModelRows(arkEngine) });
      }

      if ((url === '/api/chat' || url === '/api/generate') && req.method === 'POST') {
        const raw = await readBody(req);
        const parsed = raw ? JSON.parse(raw) : {};
        const stream = parsed.stream !== false; // Ollama defaults to stream true
        const modelId = resolveModelId(parsed.model, arkEngine);
        const modelName = modelId || arkEngine.getStatus().activeModelId || 'ark-engine';

        if (stream) {
          res.writeHead(200, {
            'Content-Type': 'application/x-ndjson',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          });
          let full = '';
          const result = await runGenerateStream(parsed, (text) => {
            full += String(text || '');
            const line = url === '/api/generate'
              ? { model: modelName, created_at: new Date().toISOString(), response: String(text || ''), done: false }
              : {
                  model: modelName,
                  created_at: new Date().toISOString(),
                  message: { role: 'assistant', content: String(text || '') },
                  done: false,
                };
            res.write(`${JSON.stringify(line)}\n`);
          });
          const doneLine = url === '/api/generate'
            ? {
                model: result.modelId || modelName,
                created_at: new Date().toISOString(),
                response: '',
                done: true,
                done_reason: 'stop',
                total_duration: 0,
              }
            : {
                model: result.modelId || modelName,
                created_at: new Date().toISOString(),
                message: { role: 'assistant', content: '' },
                done: true,
                done_reason: 'stop',
              };
          // If engine didn't stream chunks, emit the full reply once.
          if (!full && result.reply) {
            const one = url === '/api/generate'
              ? { model: modelName, created_at: new Date().toISOString(), response: result.reply, done: false }
              : {
                  model: modelName,
                  created_at: new Date().toISOString(),
                  message: { role: 'assistant', content: result.reply },
                  done: false,
                };
            res.write(`${JSON.stringify(one)}\n`);
          }
          res.write(`${JSON.stringify(doneLine)}\n`);
          res.end();
          return;
        }

        const result = await runGenerate(parsed);
        if (url === '/api/generate') {
          return json(res, 200, {
            model: result.modelId || modelName,
            created_at: new Date().toISOString(),
            response: result.reply || '',
            done: true,
            done_reason: 'stop',
          });
        }
        return json(res, 200, {
          model: result.modelId || modelName,
          created_at: new Date().toISOString(),
          message: { role: 'assistant', content: result.reply || '' },
          done: true,
          done_reason: 'stop',
        });
      }

      return json(res, 404, { ok: false, error: 'Not found' });
    } catch (err) {
      return json(res, 400, {
        ok: false,
        error: err instanceof Error ? err.message : 'Bad request',
      });
    }
  });

  return {
    listen(host = '127.0.0.1') {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          listening = true;
          resolve();
        });
      });
    },
    close() {
      return new Promise((resolve) => {
        if (!server) return resolve();
        server.close(() => {
          listening = false;
          resolve();
        });
      });
    },
    isListening: () => listening,
    contractVersion: CONTRACT_VERSION,
  };
}

module.exports = {
  CONTRACT_VERSION,
  createBrainServer,
  packMessages,
  resolveModelId,
};
