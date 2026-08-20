# ARK → Grok handoff

Upload **this file** (small) and/or **`ARK-Grok-Review.txt`** on the Desktop (full source). Then ask Grok for a second opinion and what else to change.

Regenerate the big dump anytime:

```
npm run grok:bundle
```

That writes `C:\Users\thoma\Desktop\ARK-Grok-Review.txt`.

---

## What ARK is

Windows desktop AI creation studio (Electron + React). **ARK Engine** is the local brain — not Ollama. Ollama is only an optional plug-in source.

Repo: https://github.com/DrMeji/Ark  
Current app version: **0.1.89**  
GitHub Releases: **only v0.1.89 should exist** (older releases were deleted on purpose).

Product rules (do not break):

- ARK must run without Ollama installed.
- Free local / free cloud first. Real media, not fake placeholders.
- Feel like ChatGPT/Cursor: type → real work → real result.
- Networking / Message / Call stay “Coming soon” until they actually connect people.
- External clients talk to ARK’s brain on `127.0.0.1` (see `docs/ark-brain-api.md`).

---

## Seamless brain pass (uncommitted, after 0.1.89)

Owner asked to implement **all** of `docs/ARK-VISION-SEAMLESS-BRAIN.md` (90% context → prefetch next GGUF → hot-swap with history, auto-download after hardware scan, nPredict/timeout, CUDA llama, image/video alt path). **Upload that file to Grok.** It is an honest DONE / caveat table, not a claim that live 20-turn tests passed.

---

## What just shipped (v0.1.85–v0.1.89)

Owner (creator account `thomaskrishnan0107@gmail.com`) asked for these UI fixes. They are in **0.1.89**:

1. **ARK ID for that email only** = the letters `DEV` (all caps, one word). No extra “dev” badge. Copy must copy `DEV`, not the numeric ID.
2. **Top-left of the window** = empty. No “ARK”, no “ARK · Chat”, no “ARK · Models · Engine”. Only the sidebar robot icon + search.
3. **Installed models** = green check + red trash, same look on **Models → For your PC**, **Models → Local AI tab**, and the **sidebar Local AI** page (`src/views/LocalAI.tsx`).
4. Sidebar **Models** and **Local AI** must not both highlight at once.
5. **Engine** tab inside Models stays on that page (does not kick to Local AI).
6. Tray **Open Settings** must open Settings → Account (preload now forwards `ark:open-settings`).
7. TitleBar left label is blank (`src/components/TitleBar.tsx`).
8. CI GGUF smoke test skips if the model file is missing (Linux runner has no `qwen25-7b.gguf`).

---

## Ask Grok for

A **different opinion**: what is still wrong, what is sloppy, and what else to update next.

Please review and propose concrete next edits. Do **not** undo the TitleBar blanking, do **not** restore extra GitHub releases, do **not** change the creator ARK ID away from `DEV`.

Good areas to inspect:

- `docs/ARK-FULL-LIST-SPEED-ROTATION.md` — speed-aware preload + rotation (this round)
- `docs/ARK-VISION-SEAMLESS-BRAIN.md` — P0–P3 audit
- `src/lib/modelRotation.ts`, `src/lib/tokenUsage.ts`, `src/lib/threadBrain.ts`, `src/lib/chatHistory.ts`
- `electron/arkEngine.cjs`, `electron/arkGguf.cjs` — nPredict 4096+, 240s, CUDA zip names + cudart DLLs
- `src/components/TitleBar.tsx` — must stay visually empty on the left
- `src/components/AppShell.tsx` — sidebar, update button, ARK ID `DEV`, nav highlight
- `src/components/SettingsContent.tsx` — Account ARK ID copy, hardware scan button spacing, Testers/Beta blocked
- `src/views/ModelsView.tsx` + `src/views/LocalAI.tsx` — installed icon colors must match
- `electron/preload.cjs` + `electron/main.cjs` — tray Show ARK / Open Settings
- `electron/arkUpdater.cjs` — in-app GitHub update check
- `scripts/test-gguf-chat.cjs` — CI smoke currently **skips** live llama if GGUF is missing (weak test)
- Uncommitted local files (may be WIP): `src/lib/featurePark.ts`, `src/lib/pinLock.ts`, `src/lib/stripe.ts`, `src/lib/telegram.ts`

---

## Layout (where to look)

| Area | Path |
| --- | --- |
| Main process | `electron/main.cjs`, `electron/preload.cjs`, `electron/arkEngine.cjs`, `electron/arkGguf.cjs` |
| Shell / nav | `src/components/AppShell.tsx`, `src/components/TitleBar.tsx` |
| Chat | `src/views/AIChat.tsx` |
| Models | `src/views/ModelsView.tsx` |
| Local AI / Engine UI | `src/views/LocalAI.tsx` |
| Settings | `src/components/SettingsContent.tsx` |
| Routing | `src/context/RouterContext.tsx` |
| Prefs / changelog | `src/lib/localPrefs.ts` |
| Release CI | `.github/workflows/release.yml`, `.github/workflows/smoke.yml` |

---

## Paste this to Grok after upload

```
You are reviewing ARK, a Windows Electron AI studio. I uploaded the source plus docs/ARK-VISION-SEAMLESS-BRAIN.md (status of the seamless-brain list).

Give a second opinion:
1) For each P0–P3 item in that status file: is it really implemented, a no-op, or still broken? File + function.
2) What leftover bugs would make 90% → download next → hot-swap with memory fail?
3) Small concrete next edits. Do not redesign UI.

Constraints: ARK Engine is the brain (Ollama optional only). TitleBar left chrome stays blank. Creator ARK ID stays DEV. Only GitHub release should be v0.1.89 unless I ask otherwise. Do not claim live tests passed — they were not run.
```
