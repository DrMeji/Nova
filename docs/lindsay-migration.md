# Point Lindsay (or any Ollama client) at NOVA

NOVA owns the local brain. External apps should talk to NOVA Engine on this PC — not to Ollama.

## Base URL

Copy the current URL from **NOVA Settings → AI → Brain API**. NOVA commonly starts on `http://127.0.0.1:8787`, but it can choose another port when that port is occupied.

Keep the **NOVA desktop app running** (window can be minimized to the tray). Closing NOVA stops the brain API.

## Migration checklist

1. Install / open NOVA and finish first-run setup (Hardware → Models → Connect).
2. Install at least one local brain in **Local AI** (or connect a free cloud key).
3. In **Settings → AI → Brain API**, use **Copy URL + token**.
4. In Lindsay (or your client), set the API / Ollama base URL and bearer token to those copied values.
5. Use NOVA model ids (or common aliases) — see below.

Packaged NOVA requires the token on chat and model routes. `NOVA_BRAIN_TOKEN` is optional only for an unpackaged localhost development build.

## Model names

Clients may send Ollama-style names; NOVA maps common aliases, for example:

| Client name | NOVA Engine id |
|-------------|----------------|
| `llama3.2` / `llama3.2:3b` | `llama32-3b` |
| `llama3.1` / `llama3.1:8b` | `llama31-8b` |
| `qwen2.5:1.5b` | `qwen25-15b` |
| `qwen2.5-coder:7b` | `qwen25-coder-7b` |
| `mistral` | `mistral-7b` |
| `phi3` | `phi3-mini` |

Prefer exact NOVA ids from `GET /api/tags` or `GET /v1/models`. If the client omits `model` (or sends `NOVA-auto`), NOVA picks the best **ready** Engine GGUF for that prompt — instruct for chat, Coder for build/code — so Lindsay can use every model you installed in NOVA, not a single Ollama weight.

## Endpoints

- Ollama-shaped: `/api/tags`, `/api/chat`, `/api/generate`, `/api/version`
- OpenAI-shaped: `/v1/chat/completions`
- Native: `/v1/chat`, `/v1/chat/stream`, `/v1/contract`, `/health`

Full contract: [NOVA-brain-api.md](./nova-brain-api.md) · OpenAPI: [NOVA-brain-openapi.yaml](./nova-brain-openapi.yaml) · sample: `examples/external-brain-client/`
