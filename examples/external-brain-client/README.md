# External brain client (sample)

Minimal Node client for NOVA’s localhost brain API.

```bash
# Start NOVA desktop first, then:
set ARK_BRAIN_URL=http://127.0.0.1:8787
set ARK_BRAIN_TOKEN=copy-from-NOVA-Settings-AI
node chat.mjs "Hello"
node chat.mjs --stream "Count to five"
node chat.mjs --ollama "Hello via Ollama-shaped routes"
```

Copy the URL and token from **NOVA Settings → AI → Brain API**. Packaged NOVA requires the token, and the port may differ from `8787`. The sample reads `ARK_BRAIN_TOKEN` and resolves the active `baseUrl` from `/v1/contract`.

Docs: [docs/ark-brain-api.md](../../docs/ark-brain-api.md)
