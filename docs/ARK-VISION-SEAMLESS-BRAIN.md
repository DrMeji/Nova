# ARK vision → code: seamless brain (STATUS FOR GROK)

Date: 2026-08-19  
App version still **0.1.89** (seamless-brain + **speed-aware preload** are in this working tree).  
Repo: https://github.com/DrMeji/Ark

Also see `docs/ARK-FULL-LIST-SPEED-ROTATION.md`. Threshold is **`preloadStartRatio(nextModel)` from saved MBps**, not a fixed 0.9.

This is an audit of the original Cursor list. **Do not treat “wired in code” as “live-tested on a 20-turn chat.”** Typecheck passed. Desktop acceptance tests were **not** run in the agent session.

**Do not undo:** TitleBar left chrome blank · creator ARK ID `DEV` · Ollama never required · no extra GitHub releases.

---

## Original list — item by item

### P0 — Continuity + limits

| # | Task | Status | Where |
|---|------|--------|--------|
| 1 | Chat `nPredict` 4096+ and timeout 240s+ | **DONE in code** | `electron/arkEngine.cjs` floors chat at 4096 / 240s, coding at 8192 / 300s. `src/lib/arkEngine.ts` `ggufNPredictForKind`. `electron/arkGguf.cjs` defaults 4096 / 240000. `src/lib/localPrefs.ts` default + migrate old 1536 → 4096. Settings slider min 4096 max 8192 (same control, numbers only). UI chat timeout 250s in `AIChat.tsx`. |
| 2 | Keep llama-server warm; warm default on Engine start | **DONE in code** | `ensureLlamaServer` reuses the process if the same GGUF is already up. `arkEngine.start()` warms first ready GGUF. Download complete also `warmServer`. `stopServer` on quit / Engine stop only — not between same-model messages. |
| 3 | Never clear thread history when model id changes | **DONE for swap** | Swap changes `threadBrain.modelId` / `stickyModelId`. Topic-shift wipe is skipped when `keepContinuity` (pending/freshBudget). Assistant prior turns still slimmed to ~720 chars. |

### P1 — 90% rotation loop

| # | Task | Status | Where |
|---|------|--------|--------|
| 4 | Real context pressure = prompt tokens / (GGUF_CTX − reply reserve) | **DONE, approximate** | `src/lib/tokenUsage.ts`: `GGUF_CTX=8192`, `REPLY_RESERVE=4096`, `USABLE_TOKENS=4096`, `ROTATION_PRESSURE=0.9`. Tokens = `ceil(chars/4)`, not llama tokenizer. Measured on flattened thread text (or post-swap `freshBudget` accumulation), not llama `/tokenize`. |
| 5 | At ≥0.9: pickSuccessor + download if needed + warm | **DONE in code** | `src/lib/modelRotation.ts` `prepareBrainRotation`. Successor: `src/lib/enginePick.ts` `pickSuccessorReadyId` / `pickNextBackupId`. Download named `Next brain · …` with `forceUnknownDisk` (no confirm modal). Warm via `engineSetModel` → `warmServer`. |
| 6 | `threadBrain.pendingModelId`; apply on next generate with history | **DONE in code** | `src/lib/threadBrain.ts` pending fields. Applied at start of next send in `AIChat.tsx` and `ProjectWorkspace.tsx`. Sticky id + `rotatedHistory` passed into `arkRoute`. |
| 7 | Reset ring after swap; summarize oldest if over ctx | **DONE in code** | Swap sets `freshBudget`, `resetTokenUsage`. `compressHistoryIfNeeded` in `src/lib/chatHistory.ts` (oldest → memory blob, last 8 turns verbatim). |

### P2 — First-run auto brain

| # | Task | Status | Where |
|---|------|--------|--------|
| 8 | After hardware scan: auto-download recommended chat (+ coder if RAM) | **DONE in code** | `OnboardingScreen.runHardware` calls `queueSetupBrainDownloads` (chat + `getRecommendedCoderModel` if RAM ≥10). Finish path still waits on the chat GGUF. User still sees the same model picker — download starts in the background. |
| 9 | JobsStrip shows progress — no new chrome | **DONE in code** | Rotation jobs use existing `JobsStrip`. Label **Preparing next brain** if name matches `/next brain/i`. Setup downloads now go through `startEngineDownload` so the strip can attach after onboarding. AppShell also `reattachEngineDownloads`. **No new screens/modals.** |

### P3 — Media + GPU

| # | Task | Status | Where |
|---|------|--------|--------|
| 10 | Image/video busy/fail → alternate path, don’t break chat | **DONE in code (simple)** | Image: `IMAGE_ALTS` in `src/lib/arkRouter.ts` (`sd15-local`, `sdxl-turbo-local`, `flux-schnell-local`, `ark-image-core`). Video: retry `ark-video-core` on failure. Chat messages are not cleared. **Not** a token-ring rotation for SD/FLUX queue depth. |
| 11 | Prefer CUDA llama when NVIDIA detected | **DONE for first install only** | `electron/arkGguf.cjs` `llamaDownloadUrls`: if `acceleration === 'CUDA'`, try `llama-b9992-bin-win-cuda-12.4-x64.zip` then `13.3`, then CPU. Also merges `cudart-llama-bin-win-cuda-12.4-x64.zip` DLLs. **If a llama binary already exists (CPU), it is not replaced.** |

### NEVER / constraints

| Rule | Status |
|------|--------|
| Never require Ollama | **Held.** Auto still tries Engine first. Ollama is optional last-resort if the user enabled it. |
| Never clear history on swap | **Held** for model-id swap. Topic-shift packing can still drop prior turns. |
| Never block typing with a rotation modal | **Held.** `forceUnknownDisk: true` on auto downloads. No rotation modal. |
| TitleBar left blank | **Held.** `src/components/TitleBar.tsx` left pane empty. |
| Creator ARK ID `DEV` | **Held.** Settings + AppShell copy `DEV` for creator email. |

### Phase 5 hard guarantees (from the original vision doc)

| Guarantee | Status |
|-----------|--------|
| Quit tray stops brain; start app starts brain | **DONE.** `arkEngine.start()` on ready. `before-quit` / updater force-exit call `arkEngine.stop()` + `arkGguf.stopServer()`. Closing the window hides to tray; brain stays until Quit. |
| Swap never requires opening Models | **DONE in code.** Background download + pending swap. |
| Over context → summarize oldest, keep recent verbatim | **DONE in code.** `compressHistoryIfNeeded`. |
| JobsStrip “Preparing next brain…” | **DONE.** |

---

## What is still incomplete / what Grok should hunt

These are **not** the original 11 checkboxes. They are the honest leftover risks:

1. **Not live-tested** in this pass: 20+ turn chat, MLK full answer, hello latency on warm 1.5B, CUDA first install, onboarding on a fresh PC.
2. **Token pressure is an estimate** (`length/4`), not llama.cpp prompt tokens. Could rotate too early or too late.
3. **`buildRouterHistory` still slims assistants to ~720 chars and can wipe on topic shift.** Continuity across swap is “packed window + summary blob,” not a lossless archive.
4. **Brain API / Lindsay** (`electron/arkBrainApi.cjs`) does **not** run `prepareBrainRotation`. Only in-app Chat + Code workspace do.
5. **CUDA upgrade:** existing CPU `llama-cli` is left in place. NVIDIA users who already installed CPU runtime stay on CPU until they delete `ark-engine/bin`.
6. **Image/video “capacity”** is failover-on-fail, not 90% GPU/queue rotation.
7. **One ready GGUF only:** successor download needs disk + RAM for a second model. If nothing else fits, hunt bootstrap is best-effort.
8. **Work is uncommitted.** `featurePark.ts` / `pinLock.ts` / `stripe.ts` / `telegram.ts` may be unrelated dirty files — ignore unless asked.

---

## Key files for Grok to re-read

```
src/lib/modelRotation.ts
src/lib/tokenUsage.ts
src/lib/threadBrain.ts
src/lib/chatHistory.ts
src/lib/enginePick.ts
src/lib/arkRouter.ts          (image alts, sticky + history)
src/views/AIChat.tsx
src/views/ProjectWorkspace.tsx
src/components/onboarding/OnboardingScreen.tsx
src/components/JobsStrip.tsx
electron/arkEngine.cjs
electron/arkGguf.cjs
electron/arkModelRank.cjs
electron/main.cjs             (start/stop brain, no Ollama)
```

---

## Ask Grok

You are reviewing ARK after the seamless-brain pass.

1. Verify each P0–P3 row above against the source. If anything is still missing or a no-op, say so with a file + function.
2. List the **next concrete bugs** that would make 90% → prefetch → hot-swap feel broken (false pressure, history drop, swap to a model that is not ready, CUDA 404, JobsStrip not showing setup downloads, etc.).
3. Propose a short file-level fix list. Do **not** redesign the UI. Do **not** require Ollama. Keep TitleBar blank and creator ARK ID `DEV`.

This pass is meant to implement the list, not to claim the product is finished.
