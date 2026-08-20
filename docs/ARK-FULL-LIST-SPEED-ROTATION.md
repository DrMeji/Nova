# ARK — Full problem + fix list (speed-aware rotation + seamless brain)

**Implemented in local tree 2026-08-19.** App version still **0.1.89** until a release bump.  
Constraints: TitleBar left blank · creator ARK ID `DEV` · no Ollama required · no UI redesign.

Grok’s uploaded 0.1.89 bundle was stale. This tree now has `modelRotation.ts`, real context pressure, nPredict/timeout floors, **and** speed-aware preload (not a fixed 0.9).

---

## C. Speed-aware threshold (the missing piece)

**Rule:** `startDownloadWhen pressure >= preloadStartRatio({ name, sizeGb })`

| Effective download **MBps** (megabytes/s) | Start preload at |
|-------------------------------------------|------------------|
| ≥ 25 (very fast) | 90–95% |
| 12–25 | 70–88% |
| 5–12 | 40–70% |
| &lt; 5 | 15–40% |

100 **Mbps** ≈ 12.5 **MBps**. `formatMBps` shows both. No speed sample → `computePreloadPlan(8)` middle band. First chat without a sample starts a background speed probe.

**Where:** `src/lib/speedTest.ts` `preloadStartRatio` · `src/lib/modelRotation.ts` `prepareBrainRotation`

---

## Checklist vs this list

### B. Generation limits
- [x] Chat nPredict floor 4096, timeout 240s (`electron/arkEngine.cjs` + renderer floor)
- [x] Coding 8192 / 300s
- [x] Prefs default + migrate 1536 → 4096; Settings slider min 4096 max 8192

### C. Speed-aware rotation
- [x] Pressure = tokens(thread) / (8192 − 4096)
- [x] Threshold = `preloadStartRatio(nextModel)` with **sizeGb**
- [x] At threshold: pick successor → download → warm → `pendingModelId`
- [x] Next send: apply pending + compressed history
- [x] Hunt prefs do **not** block catalog rotation (`ignoreHuntPrefs` / reason `context`)
- [x] SD/image downloads do not block chat rotation
- [x] No successor → JobsStrip note (existing strip)

### D. Continuity
- [x] Messages not cleared on model id change
- [x] `compressHistoryIfNeeded`
- [x] Topic-shift wipe skipped when rotation pending/applied (`keepContinuity`)
- [x] Pack prompt keeps history on long threads / memory blob

### E. Warm + boot
- [x] Engine start warms first ready GGUF
- [x] llama-server kept across same-model messages
- [x] Quit stops engine; window close keeps tray brain

### F. First-run
- [x] After hardware scan: queue recommended chat (+ coder if RAM)
- [x] JobsStrip via `startEngineDownload`
- [x] Onboarding speed sample saved when the test runs

### G. CUDA
- [x] First install prefers CUDA 12.4 zip + cudart DLLs
- [x] Existing CPU binary: one background CUDA upgrade attempt per llama tag

### H. Brain API
- [x] Documented in-app-only (`electron/arkBrainApi.cjs` header). Not ported (uses renderer prefs/storage).

### I. Media
- [x] Image alts + video retry; chat thread not cleared
- [x] Chat rotation not blocked on SD jobs

### J. Cleanup
- Unrelated dirty files (`featurePark`, `pinLock`, `stripe`, `telegram`) left unstaged.

---

## Mental tests (from the list)

| Case | Expected |
|------|----------|
| Slow 3 MBps + ~4.7 GB next | Preload around 15–40% |
| Fast 40 MBps | Preload around 90–95% |
| 15-turn chat | Pending swap keeps packed history; topic-shift does not wipe if pending/freshBudget |
| Hunt toggles off | Catalog successor still downloads for `reason: context` |
