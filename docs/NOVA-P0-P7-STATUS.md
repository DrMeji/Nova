# NOVA P0–P7 Implementation Status

Last updated: 2026-09-13 (v0.1.218 Wave 1 reliability)

## Honest summary

| Priority | Status |
|----------|--------|
| **P0** Chat turn ownership | **In progress** — `dispatchOwnedTurn` + hosts for create/plan/delete/open/cmd; AIChat mid-ladder still large (~9.7k). Target AIChat ≤ 2k. |
| **P1** Image recreate/upscale | **Removed** from product UI |
| **P2** Model routing + BrainProfile | **Partial** — BrainProfile/VRAM gates wired; recommenders cleaned; Models+LocalAI+Brain still split |
| **P3** File ops | **Working** — handlers + disk guards; winget/choco blocked |
| **P4** Preview / localhost | **Partial** — dual Vite/static still exists; createJob preview attach not single session |
| **P5** Voice / Video / Call | Voice live (conversation only). Image/Video/Call **removed** |
| **P6** Social | **Partial** — guest + RLS/SMTP still ops |
| **P7** Ship polish | Releases on Nova-Source + public Nova; Authenticode cert still ops |

## Do not trust older rows

Anything claiming Image/Video “Working” or “chat reliability done” before **0.1.218** is stale.
