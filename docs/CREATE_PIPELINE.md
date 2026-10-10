# Create pipeline ownership

Nova create uses a **thin create path** (Temp Nova *shape*, not a merge of the Temp Nova app): ask → bare Vite scaffold → sticky single-brain craft → syntax → npm → honest Live → quality Ready.

**Do not merge Temp Nova into Nova.** Temp Nova stays a separate harness. We only copy the working approach: invent from the ask, write `@@@FILE`, skip the post-craft maze.

```mermaid
flowchart LR
  ask[HardGoAsk] --> scaffold[BareViteScaffold]
  scaffold --> craft[StickyModelCraft]
  craft --> syntax[SyntaxGateOnly]
  syntax --> npm[NpmInstall]
  npm --> live[HonestLiveProbe]
  live --> ready[QualityReady]
```

Owner: [`isThinCreatePath()`](../src/lib/createThinPath.ts) — always on for create turns. Edit stays apply + anti-bleed + syntax.

**Family owner (single):** `inferCreateCompositionFamily` in [`createProductPlan.ts`](../src/lib/createProductPlan.ts). Soft shape hint only (anti-sabotage). Craft invents from the brief — not tip/todo/notes/marketing/shop recipes.

Static Preview Ready is **preflight only**. Live unlock = real probe mount (**no forged utility mount**). Quality Ready = Live unlock + smoke + host judge + ProductPlan/design scores + **no floorFallback** + **no repairOwnedProduct**.

## Thin path (default)

**Keep**
- Hard-go → create · bare scaffold · sticky craft (`createV2`) · short craft prompt (`formatThinCreateCraftRules`)
- Mechanical syntax gate · strip-only anti-bleed · npm · honest Live · quality Ready without floor rescue

**Skip (gated when thin)**
- Genre / recovery floors (`buildBriefInteractiveFloor`, utility/kiln/sticky/apple/game floors, `realizeBriefUi` salvage)
- Marketing COVER / structure heals / CSS companion floors as Ready unlock
- Plan repair that sets `repairOwnedProduct` / `floorFallback`
- Style hop as a required polish step
- Commander/tool-loop salvage rounds in verify/fix

**If craft fails:** clear fail message — never paste a floor to fake success.

## Order

1. **Talk** — Instruct only. Never builds.
2. **Hard-go** — “build it” / “on disk now” → create.
3. **Bare scaffold** — Vite entry; empty App mount. Craft owns the product UI.
4. **Single Brain craft** — sticky model, `@@@FILE` invent-from-ask ([`createThinPath.ts`](../src/lib/createThinPath.ts), [`createV2.ts`](../src/lib/createV2.ts)).
5. **Syntax gate** — mechanical heal only ([`createSyntaxGate.ts`](../src/lib/createSyntaxGate.ts)).
6. **Install** — npm bootstrap.
7. **Live evidence** — HTTP + real mount ([`createEvidence.ts`](../src/lib/createEvidence.ts), [`createRuntimeLoop.ts`](../src/lib/createRuntimeLoop.ts)). Thin fix rounds = trunc + syntax + re-probe only.
8. **Ready** — `judgeCreateVerified` · floors never unlock quality.
9. **Edit** — `applyChatReplyEdits` → `antiBleedForFamily` + syntax.

Smokes: `npm run smoke:thin-create-path`, `npm run smoke:create-pass-spine`, `npm run smoke:tool-craft-contract`, `npm run smoke:single-brain-create`.

## Already parked — do not revive

- Ensemble multi-seat (`ensembleAutoParked`)
- `layoutReference` recipes
- Forged utility mount
- Commander create (`agentLoopOnCreate`)

## Do not

- Claim success from static Ready alone.
- Unlock Live with a null preview URL.
- Treat floors / repair-owned shells as quality Ready.
- Merge Temp Nova UI/code into Nova create.
- Pre-write Design Spine shells or restore them as Ready heals.
- Run Multimodal create relay / multi-GGUF seat swaps.
