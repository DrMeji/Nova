# Lindsay sample client

Talks to ARK’s local brain API (`http://127.0.0.1:8787`) while the desktop app is running.

```bash
# From repo root — with ARK desktop open
node examples/lindsay-client/chat.mjs "Hello from Lindsay"
node examples/lindsay-client/chat.mjs --stream "Count to five"

# Optional bearer (if you set ARK_BRAIN_TOKEN on the desktop process)
set ARK_BRAIN_TOKEN=secret
node examples/lindsay-client/chat.mjs ping
```

OpenAPI: [docs/lindsay-openapi.yaml](../../docs/lindsay-openapi.yaml)  
Cookbook: [docs/lindsay-brain-api.md](../../docs/lindsay-brain-api.md)
