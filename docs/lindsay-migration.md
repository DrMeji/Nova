# Point Lindsay (or any Ollama client) at ARK

ARK owns the local brain. External apps should talk to ARK Engine on this PC — not to Ollama.

## Base URL

```
http://127.0.0.1:8787
```

Keep the **ARK desktop app running** (window can be minimized to the tray). Closing ARK stops the brain API.

## Migration checklist

1. Install / open ARK and finish first-run setup (Hardware → Models → Connect).
2. Install at least one local brain in **Local AI** (or connect a free cloud key).
3. In Lindsay (or your client), set the API / Ollama base URL to `http://127.0.0.1:8787`.
4. Use ARK model ids (or common aliases) — see below.
5. Optional: set `ARK_BRAIN_TOKEN` in the environment if you want a shared secret on requests.

## Model names

Clients may send Ollama-style names; ARK maps common aliases, for example:

| Client name | ARK Engine id |
|-------------|----------------|
| `llama3.2` / `llama3.2:3b` | `llama32-3b` |
| `llama3.1` / `llama3.1:8b` | `llama31-8b` |
| `qwen2.5:1.5b` | `qwen25-15b` |
| `qwen2.5-coder:7b` | `qwen25-coder-7b` |
| `mistral` | `mistral-7b` |
| `phi3` | `phi3-mini` |

Prefer exact ARK ids from `GET /api/tags` or `GET /v1/models`. If the client omits `model` (or sends `ark-auto`), ARK picks the best **ready** Engine GGUF for that prompt — instruct for chat, Coder for build/code — so Lindsay can use every model you installed in ARK, not a single Ollama weight.

## Endpoints

- Ollama-shaped: `/api/tags`, `/api/chat`, `/api/generate`, `/api/version`
- OpenAI-shaped: `/v1/chat/completions`
- Native: `/v1/chat`, `/v1/chat/stream`, `/health`

Full contract: [ark-brain-api.md](./ark-brain-api.md) · OpenAPI: [ark-brain-openapi.yaml](./ark-brain-openapi.yaml) · sample: `examples/external-brain-client/`
