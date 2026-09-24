# Create pipeline ownership

Nova create is one ordered team. Each concern has one owner — do not re-munge roles into chat or UI chrome.

## Order

1. **Talk** ([`src/lib/chatTurnHandlers/chat.ts`](../src/lib/chatTurnHandlers/chat.ts)) — Instruct only. Plan in prose. Never dumps HTML/CSS. Never builds.
2. **Plan / Spec** ([`src/lib/createPipeline.ts`](../src/lib/createPipeline.ts) → createEnsemble) — chat brain checklist / ProductSpec.
3. **Design** — UIGEN / design GGUF → LayoutContract.
4. **Copy** — chat brain → CopyPack (words, not code). Status: `Copy · Instruct (words, not code)`.
5. **Craft** ([`src/lib/createCraft.ts`](../src/lib/createCraft.ts) → novaBuildLoop / arkAgentLoop) — **best coder** (14B when ready). Tool allowlist blocks `.gitignore` thrash.
6. **Style** — design GGUF → CSS tokens.
7. **Verify** — **coder** reviews App/CSS (never chat Instruct).
8. **Ready** ([`src/lib/createReady.ts`](../src/lib/createReady.ts)) — Preview Ready / apple gates.

## Pill / engine

- [`src/lib/createStatus.ts`](../src/lib/createStatus.ts) `announceCreatePhase` updates status + pill during hops.
- Craft/Verify pin coder; after create ends, talk sticky returns to Instruct.

## Do not

- Overwrite multi-section craft with canned tablet/stub floors.
- SilentUpgrade-replace a live chat bubble (retract flash) — see arkRouter one-paint rule.
- Treat “Copy refine · 7B Instruct” as “coding on 7B” — Copy is words only.
