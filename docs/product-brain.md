# NOVA product brain

Product rules for NOVA Engine, models, and creation flows.

## Core identity

- **NOVA owns its own brain.** Local inference, model storage, Local AI UI, and the localhost brain API are NOVA Engine — not a wrapper around any third-party local app.
- NOVA must **run without** Ollama (or similar) installed. Never make a third-party local runtime required.
- Do **not** treat Ollama as NOVA’s brain, default engine, or identity.

## Pluggable model sources

- **Ollama is just another plug-in source** — same idea as Hugging Face, GitHub Models, OpenRouter free routes, etc.
- Users enable it in Models, then use those models like any other model. No special “Ollama mode” identity.

## Free model discovery

- Prefer free local NOVA Engine models first.
- Surface free cloud options: GitHub Models, Hugging Face Inference, OpenRouter free routes, Google AI Studio free tier, Groq free tier, Pollinations-style free media, etc.
- When a free key or no-key endpoint works, wire it into Models / Chat / Image / Video so the user just picks and creates.

## Models page

- Keep **For your PC** (best / balanced / performance).
- Default lists = hardware-fit only.
- Search = intentional discovery (out-of-spec, Ollama, HF, etc. can appear).

## Generated media

- Image / video outputs must be **real media** when a free/local/cloud path is available — not text-on-gradient placeholders presented as finished art.
- Generations are **saved into Recent → Creations** (and NOVA Engine media storage) so users can reopen them.
- Be honest in UI if only a preview/fallback was produced.

## Product bar

NOVA should feel like a modern AI studio: the user types what they want, and the app **does it** — chat, code, image, video — in one place.

- **Free models are the default.** Slow is OK. Fake “done” states are not.
- Aim for a useful result in **under a few minutes**. Start the real request immediately.
- **Simple over theatrical.** One send → progress that matches real work → a real answer, file, or image.
- Code should behave like a coding partner: read the repo, explain it, suggest what to do next, then edit.

## Lindsay / brain API

- External clients talk to **NOVA’s** brain API / engine on loopback (port from Settings → AI → Brain API).
- Ollama-shaped `/api/*` and OpenAI-shaped `/v1/chat/completions` exist so external apps can point at NOVA instead.
- Cookbook: `docs/ark-brain-api.md` · sample: `examples/external-brain-client/`.
