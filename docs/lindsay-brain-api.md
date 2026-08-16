# Lindsay / external clients → ARK brain API

ARK owns this API. Clients talk to ARK Engine on localhost — not to Ollama or any third-party local app.

## Base URL

`http://127.0.0.1:8787` (desktop app must be running)

Optional auth: set `ARK_BRAIN_TOKEN` and send `Authorization: Bearer <token>`.

Contract version: see `GET /v1/contract` (`BRAIN_CONTRACT_VERSION` in `src/lib/brainContract.ts`).

## Quick curl

```bash
# Health
curl -s http://127.0.0.1:8787/health

# Contract
curl -s http://127.0.0.1:8787/v1/contract

# Models
curl -s http://127.0.0.1:8787/v1/models

# Chat (non-stream)
curl -s http://127.0.0.1:8787/v1/chat \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"Say hello from ARK Engine\",\"kind\":\"chat\"}"

# Chat stream (SSE)
curl -N http://127.0.0.1:8787/v1/chat/stream \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"Count to five\",\"kind\":\"chat\"}"
```

With bearer token:

```bash
curl -s http://127.0.0.1:8787/v1/chat \
  -H "Authorization: Bearer $ARK_BRAIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"ping\"}"
```

## Minimal fetch client (Node / browser)

```js
const BRAIN = 'http://127.0.0.1:8787';

async function chat(message) {
  const res = await fetch(`${BRAIN}/v1/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, kind: 'chat' }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { ok, reply, modelName, ... }
}

async function chatStream(message, onDelta) {
  const res = await fetch(`${BRAIN}/v1/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, kind: 'chat' }),
  });
  if (!res.ok || !res.body) throw new Error(await res.text());
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const chunks = buf.split('\n\n');
    buf = chunks.pop() || '';
    for (const block of chunks) {
      const ev = /event:\s*(\w+)/.exec(block)?.[1];
      const dataLine = block.split('\n').find((l) => l.startsWith('data:'));
      if (!dataLine) continue;
      const data = JSON.parse(dataLine.slice(5).trim() || '{}');
      if (ev === 'delta' && data.text) onDelta(data.text);
      if (ev === 'done') return data;
      if (ev === 'error') throw new Error(data.error || 'stream error');
    }
  }
}
```

## Endpoints

| Method | Path | Notes |
|--------|------|--------|
| GET | `/health` | ok + engine phase |
| GET | `/v1/contract` | machine-readable contract |
| GET | `/v1/models` | ARK Engine model list |
| GET | `/v1/engine` | full engine status |
| POST | `/v1/chat` | `{ message, model?, kind? }` |
| POST | `/v1/chat/stream` | SSE: `status` / `delta` / `done` / `error` |

Optional bridges (Ollama, HF, …) stay behind ARK — Lindsay only sees this API.
