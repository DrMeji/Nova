# Nova coding-fidelity re-audit pack (CURRENT post-campaign)

Upload ALL files in this folder to Claude, then paste the audit prompt from Cursor.

## Included (current working tree)
- `src/lib/artifactEvidence.ts` — soft vs strict gates
- `src/lib/projectScaffolds.ts` — seeds
- `src/lib/createArtifactKind.ts` — resolveArtifactKind
- `src/lib/novaBuildLoop.ts` — Ready / fix loop
- `src/lib/createThinPath.ts` — craft / thin create
- `src/lib/codingAgentPack.ts` — agent pack / markers
- `src/lib/classifyTurn.ts` — talk-first vs create
- `src/lib/chatTurnHandlers/create.ts` — create path / Ready consumer
- `src/lib/chatIdeaIntent.ts` — soft help-build asks
- `scripts/smoke-coding-fidelity-matrix.mjs` — 291 asks + evidence smokes

## Product rules
Nova builds ANYTHING from the prompt — NOT websites-only.
Soft explores stay talk-first. Product invent opt-in only for clear product-site.
Prefer FIVE suspects → ONE worst only when iterating; this upload is for a FULL clear-up: all material blockers ranked, or exactly DONE.

## Matrix status
smoke-coding-fidelity-matrix: ok 291 asks (includes Tkinter/pygame/C# desktop fixes).
