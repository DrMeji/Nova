# NOVA P0–P7 Implementation Status

Last updated: 2026-09-13 (v0.1.220 basic public ready ~82)

## Honest summary

| Priority | Status |
|----------|--------|
| **P0** Chat turn ownership | **Done for 80%** — AIChat ≈150; useAIChatSend ≈315; chatTurnHosts |
| **P1** Image recreate/upscale | **Removed** (parked) |
| **P2** Model routing + BrainProfile | **Done** — Brain hub; sticky + router gates; profile + models dir |
| **P3** File ops | **Working** |
| **P4** Preview / localhost | **Done for 80%** — getOrAttachPreview; attach-only |
| **P5** Voice / Video / Call | Voice live. Image/Video/Call **removed** |
| **P6** Social | Guest local OK; SMTP/RLS **ops** |
| **P7** Ship polish | 0.1.220; Authenticode **ops**; Electron guest-local if no Supabase env |

## Score

~**82/100** basic public ready (create → bind → edit → Preview). Ops (cert/SMTP/RLS) still for ~90.

## Do not trust older rows

Anything claiming AIChat 9.7k or hard black-screen on Electron without keys before **0.1.220** is stale.
