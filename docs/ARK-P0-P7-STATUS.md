# ARK P0–P7 Implementation Status

Last updated: 2026-08-26 (v0.1.162 hardening pass)

## Summary

| Priority | Status |
|----------|--------|
| **P0** Debug/fix pipeline | **Working** — open path → scan → diagnose → patch → verify loop |
| **P1** Image recreate/upscale | **Working** — Pollinations + HF FLUX img2img; 1280px upscale pass in engine |
| **P2** Model routing | **Working** — ARK Auto: local → free cloud → paid; large-repo coding prefers cloud |
| **P3** File ops | **Working** — read/rename/create/delete routing + disk guards |
| **P4** Preview / localhost | **Working** — Vite warm-start + auto Preview window on debug open |
| **P5** Voice / Video | **Parked** — tabs hidden; enable via `featurePark` when ready |
| **P6** Social | **Working** — friend requests v0.1.160; apply Supabase migration on prod if needed |
| **P7** Ship polish | **Working** — releases on Ark-Source + public Ark; CI needs `ARK_PUBLIC_RELEASE_TOKEN` for auto public publish |

## P0 — Hands-free builder

- Debug path + problem → open project, bind workspace, scan with UI-runtime-first ranking
- Capability asks, file read by absolute path, local scan fallback
- Post-patch verify (`npm run typecheck` / `build` when available)
- Cloud coding hop for large repos (180+ source files)

## P1 — Image

- Pollinations Flux + optional gen.pollinations key
- Reference image img2img + upscale sharpening in `electron/arkMedia.cjs`
- Hugging Face FLUX when HF key set

## P2 — Routing

- Free-key cascade then paid keys on ARK Auto failover
- `preferCloudCoding` for large-repo patch/debug turns

## P3 — File ops

- Read / rename / create / delete intent routing (`scripts/smoke-file-ops.mjs`)

## P4 — Preview

- `ensureViteDevServer` + `ensureInAppPreview` after hands-free debug open
- `refreshLivePreview` on file writes

## P5 — Voice / Video

- Video tab is parked in the current retail build; ARK Video Core remains an internal/fallback pipeline.
- Voice tab is parked in the current retail build; Web Speech → ARK chat → TTS is not exposed as a retail route.

## P6 — Social

- Friend request delivery shipped v0.1.160.
- Networking posts sync for signed-in users; post chat, code-view requests, and moderation reports remain local-only previews.

## P7 — Ship

- Tag push builds on Ark-Source; public Ark via CI token or `scripts/publish-public-release.ps1`

## Security

- Chat self-harm guard (`arkSelfGuard.ts`)
- Disk block for ARK install paths (`electron/arkSelfGuard.cjs`)
- Reply sanitizer for packaged leaks (`replySanitizer.ts`)

## Smoke tests

```bat
Open-ARK-Build.bat
node scripts/smoke-self-guard.mjs
node scripts/smoke-chat-routes.mjs
node scripts/smoke-file-ops.mjs
```
