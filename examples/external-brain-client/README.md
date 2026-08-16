# External brain client (sample)

Minimal Node client for ARK’s localhost brain API.

```bash
# Start ARK desktop first, then:
node chat.mjs "Hello"
node chat.mjs --stream "Count to five"
node chat.mjs --ollama "Hello via Ollama-shaped routes"
```

Point Lindsay (or any Ollama client) at `http://127.0.0.1:8787` instead of `11434`.

Docs: [docs/ark-brain-api.md](../../docs/ark-brain-api.md)
