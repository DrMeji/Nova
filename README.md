# ARK

**ARK** is a Windows desktop AI creation studio.

It combines local and cloud AI so you can chat, generate images and video, manage models, and connect tools — without depending on a third-party local runtime like Ollama.

## What you get

- **ARK Engine** — on-device models for chat and media, with hardware-aware recommendations  
- **Chat, Image, and Video** — create in one app; outputs save to Recent / Creations  
- **Free capacity first** — local brains plus free cloud routes when you connect a key  
- **Plugins** — optional integrations (GitHub, Linear, Discord, Drive, and more)  
- **Local brain API** — other apps can use ARK on `127.0.0.1:8787` (Ollama- and OpenAI-shaped endpoints)

## Download

Get the latest Windows installer from **[Releases](https://github.com/DrMeji/Ark/releases)**.

In the app: **Settings → Updates → Check** to download newer builds.

## Docs

- [Brain API](docs/ark-brain-api.md) — point external clients at ARK  
- [Lindsay migration](docs/lindsay-migration.md) — switch from Ollama-style setups  
- [OAuth setup](docs/oauth-setup.md) — one-click plugin connect  
- [Code signing](build/signing.env.example) — Authenticode for SmartScreen

## Note

ARK is under active development. Installers may be unsigned until a code-signing certificate is configured; Windows Smart App Control / SmartScreen may warn on first run.

Uninstalling ARK currently wipes its local app data, including downloaded models and saved provider keys. Export anything you need before uninstalling.
