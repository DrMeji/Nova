# ARK changelog

## 0.1.140 — 2026-08-24

Image quality, chat keep-alive, NSFW gate, and static-project fixes.

**Windows installer:** [ARK-Setup.exe](https://github.com/DrMeji/Ark/releases/download/v0.1.140/ARK-Setup.exe) · [Release notes](https://github.com/DrMeji/Ark/releases/tag/v0.1.140)

### Image generation

- Flux-first pipeline (no dual Pollinations race that caused 429 “busy” errors).
- Stronger sharp-focus prompts and blur negative prompts; rejects soft/fast cache stubs.
- Optional ffmpeg upscale+unsharp when frames arrive below 1100px.
- NSFW off adds SFW constraints on free hosts; Settings → AI toggle controls adult content.

### Chat / navigation

- Chat and Image generations keep running when you hop to Settings, Local AI, or other tabs.
- Sticky local SD failure no longer blocks free image hosts.
- Multi-agent via Chat **+**; skills auto-attach on create/edit; MCP tool catalog in chat.

### Project create

- Static HTML calculators skip npm install (no ENOENT on missing package.json).
- Preview window tracks `windowOpen` for Vite HMR reload.

Download: [Releases](https://github.com/DrMeji/Ark/releases)

## 0.1.138 — 2026-08-22

Chat coding, new-product routing, and delete targeting.

**Windows installer:** [ARK-Setup.exe](https://github.com/DrMeji/Ark/releases/download/v0.1.138/ARK-Setup.exe) · [Release notes](https://github.com/DrMeji/Ark/releases/tag/v0.1.138)

Remaining product request: [issue #1](https://github.com/DrMeji/Ark/issues/1).

### Chat can edit code (default)

Default Chat is Agent, not Ask. Asks like **add a search button** or **change the header** write files in the open workspace via `@@@FILE` apply. Composer prefixes (`[Plan]`, Agent mode, Debug) are stripped before intent routing.

### New product ideas (Ring System)

“I want to work on a project called Ring System…” is a **new app**, not “which existing folder? DeBloat.” Greenfield plan → Create project. `Let’s work on DeBloat` still binds an existing folder.

### Delete / catalog safety

- Delete only the **named** folder. Never wipe the bound workspace by mistake.
- Listing a catalog no longer unbinds the open project.
- Add-file intent requires a real file name (not “Agent edit files”).

### Typecheck (follow-up on main)

Chat/Code view types: `ChatMessage.project_id`, attach `kind as const`, optional `window.arkDesktop`, Code composer `'agent'` mode, `readTextFile` `text`/`binary`.

### Also in this line (0.1.118–0.1.137)

- Chat-first PC agent: explore, folder catalog, Desktop / Documents / Full PC grants
- Create / delete project from Chat (TDZ delete bug fixed)
- File vs folder disk intents, Pictures / Desktop path resolve
- Greenfield product planning (0.1.137)

Download: [Releases](https://github.com/DrMeji/Ark/releases)
