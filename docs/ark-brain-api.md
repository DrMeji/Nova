# ARK Brain API — external apps

ARK owns this loopback API. External apps (personal assistants like Lindsay, agents, IDEs, custom tools) talk to **ARK Engine** on this PC — not to Ollama or any third-party local runtime.

Base URL: `http://127.0.0.1:8787` (desktop ARK must be running — minimize to tray keeps the brain up)

Lindsay migration: [lindsay-migration.md](./lindsay-migration.md)

Optional auth: set `ARK_BRAIN_TOKEN` and send `Authorization: Bearer <token>`.

Contract: `GET /v1/contract` (currently **0.4.0**)

## Why this exists

Apps that used to require Ollama can point at ARK instead and get every installed Engine model (plus ARK’s router when using the native API). ARK stays the brain; other apps are clients.

## Native ARK routes

| Method | Path | Notes |
|--------|------|--------|
| GET | `/health` | Engine phase + contract |
| GET | `/v1/contract` | Machine-readable capabilities |
| GET | `/v1/models` | Ready Engine models |
| GET | `/v1/engine` | Full engine status |
| POST | `/v1/chat` | `{ message }` or `{ messages:[{role,content}] }`, optional `model`, `kind` |
| POST | `/v1/chat/stream` | SSE: `status` / `delta` / `done` / `error` |

## Drop-in compatibility

### Ollama-shaped (Lindsay & similar)

Point the app’s Ollama base URL at `http://127.0.0.1:8787` (not `:11434`).

| Method | Path |
|--------|------|
| GET | `/api/tags` |
| GET | `/api/version` |
| POST | `/api/chat` |
| POST | `/api/generate` |

Streaming uses Ollama-style NDJSON. Model names are ARK Engine ids (e.g. `qwen25-15b`, `qwen25-coder-7b`).

### OpenAI-shaped

| Method | Path |
|--------|------|
| POST | `/v1/chat/completions` | `{ model, messages, stream? }` |

## Quick curl

```bash
curl -s http://127.0.0.1:8787/health
curl -s http://127.0.0.1:8787/api/tags
curl -s http://127.0.0.1:8787/v1/chat \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"Say hello from ARK Engine\",\"kind\":\"chat\"}"
```

Multi-turn:

```bash
curl -s http://127.0.0.1:8787/v1/chat \
  -H "Content-Type: application/json" \
  -d "{\"messages\":[{\"role\":\"user\",\"content\":\"Remember the number 7\"},{\"role\":\"assistant\",\"content\":\"OK\"},{\"role\":\"user\",\"content\":\"What number?\"}]}"
```

## Sample client

See `examples/external-brain-client/`.

## OpenAPI

See `docs/ark-brain-openapi.yaml`.

## Signing note

Windows SmartScreen trust needs your Authenticode cert — see `build/signing.env.example`. The brain API itself does not require code signing to work on localhost.
