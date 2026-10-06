# Create pipeline ownership

Nova create is **Single Brain Create** with a **pass spine**: bare Vite wiring → **ProductPlan** → craft (createV2 staged write) → polish + plan repair → Live evidence → commander fix rounds → **quality Ready** (plan + design + host judge).

**Family owner (single):** `inferCreateCompositionFamily` in [`createProductPlan.ts`](../src/lib/createProductPlan.ts). `inferCompositionFamily` in Design Spine **delegates** to it (no marketing-default fork).

**Brief is the source of truth.** Craft invents whatever the user asked for — not a tip/todo/notes/marketing/shop recipe menu. `compositionFamily` / `toolKind` / `appKind` are **soft shape hints** (anti-sabotage only: e.g. don’t ship a marketing hero when they asked for a working tool). Repair **strips** wrong-family bleed; it must not paste genre starters as the product.

Marketing COVER/hero heals must not run on `tool-panel` / `app-chrome`. `layoutReference` recipes (apple/Linear/cafe) are **retired** on create — do not reinject.

Static Preview Ready is **preflight only**. Live unlock = real probe mount (**no forged utility mount**). Quality Ready = Live unlock + smoke + host judge + ProductPlan score + design score + **no floor fallback** + **no repairOwnedProduct**.

## Original one-of-one (non-negotiable)

Every create invents a **unique professional** UI for *this* ask.

**Forbidden on create:**
- Product templates / locked Design Spine marketing shells pre-written before craft
- Placeholders (lorem, Sample, Band-N, via.placeholder.com)
- Reference recipes (apple.com / Linear / cafe word lists driving layout) — `layoutReferencePromptLines` is a no-op
- Scaffold utility stubs (tip/todo/coffee) on unrelated product asks
- Copy-paste `healDesignShell` restores of a prior shell
- Forging Live `mounted`/`pass` from HTTP + disk heuristics
- Treating repair starters / recovery floors as quality Ready (`repairOwnedProduct` / `floorFallback` block quality)
- Multimodal Plan→Design→Copy→Craft GGUF seat swaps (ensemble Auto is **parked** via `ensembleAutoParked` — code kept, hops forced off)

**Allowed infrastructure only:**
- Bare Vite wiring (`package.json`, `index.html`, `main`, empty `#root`)
- Quality **rules** in prompts (`QUALITY_FLOOR` / `formatOriginalCraftRules`) — not pasted layouts

**If craft fails originality/quality lint:** one same-model retry path / fail Ready — never paste a template.

## Order (Create Runtime Loop)

1. **Talk** ([`src/lib/chatTurnHandlers/chat.ts`](../src/lib/chatTurnHandlers/chat.ts)) — Instruct only. Never builds.
2. **Soft plan-talk** (optional, in normal chat) — no Plan pill required. Hard-go (“build it”, “on disk now”) enters create.
3. **Bare scaffold** — disk folder + Vite entry files; App is an empty mount (`<div className="app" />`) — not a centered title phone-column. Craft owns the product UI.
4. **Single Brain craft** ([`src/lib/chatTurnHandlers/create.ts`](../src/lib/chatTurnHandlers/create.ts) / [`createV2.ts`](../src/lib/createV2.ts)) — one sticky model invents UI from the brief (`@@@FILE`) following the **pass spine** (plan → structure → design → interact → verify → critic). See [`createPassSpine.ts`](../src/lib/createPassSpine.ts).
   - Default: `src/App.tsx` + `src/App.css`.
   - **Storefront genre** (cart/checkout/liquor/shop+browse): structural plan + **required** `src/data/products.ts` + optional `src/components/*` under the storefront LayoutContract. See [`createLayoutContract.ts`](../src/lib/createLayoutContract.ts), [`createStorefrontRepair.ts`](../src/lib/createStorefrontRepair.ts), [`createStorefrontFloor.ts`](../src/lib/createStorefrontFloor.ts).
5. **Style polish** — CSS thicken on the **same** GGUF (no unload/reload); all families run ProductPlan repair before genre floors.
6. **Originality lint** — `lintOriginalCreateQuality` + `scorePlanContract` + design quality.
7. **Preflight** — Preview Ready. Floors are last-resort recovery only (honest status); marketing floor only for `marketing-bands` family. Floors / repair-owned starters unlock Live but **never** quality Ready alone.
8. **Install** — npm bootstrap.
9. **Live evidence** ([`src/lib/createEvidence.ts`](../src/lib/createEvidence.ts) + [`createRuntimeLoop.ts`](../src/lib/createRuntimeLoop.ts)) — HTTP + Electron mount + console + smoke. Probe must report mount — no forged utility shortcut.
10. **Fix rounds** (up to 3) — trunc/near-ready heal → plan repair → surgical patches → optional commander tool loop → re-probe. Repair that owns the product sets `floorFallback`.
11. **Host judge + pass spine** ([`src/lib/createHostJudge.ts`](../src/lib/createHostJudge.ts), [`createPassSpine.ts`](../src/lib/createPassSpine.ts)) — plan + design scores hard-gate quality Ready.
12. **Ready** — `markCreateJobReady` requires Live URL; status distinguishes quality verified vs Live unlocked (quality open). Git commit only on quality Ready.
13. **Edit** — every write goes through `applyChatReplyEdits` → `antiBleedForFamily` (strip wrong-family COVER / `products.ts` without inventing UI). In-place rebuild stays on the edit path (`keep_building`), not full create spine.

Smokes: `npm run smoke:tool-craft-contract`, `npm run smoke:create-pass-spine`, `npm run smoke:single-brain-create`, `npm run smoke:design-spine`, `npm run smoke:product-plan`, `npm run smoke:create-intent`.

## Manual live test (after smokes)

1. Hello — natural reply, no freeze  
2. Talk through a vacuum website — stays chat  
3. Build it — Single Brain Create; Live looks unique/professional  
4. Build a second different product — must not clone #3  
5. Blank white website — solid empty page  
6. No Plan/Agent/Multi-agent/Debug pills required; no OS freeze

## Pill / engine

- Status stages: `CREATE_RUNTIME_STAGES` in createEvidence.
- Job store: `writing` → `npm` → `verifying` → `ready` | `failed`.
- Pin honor: chat picker / sticky craft model wins (no silent 32B upgrade, no mid-create GGUF swap).
- Composer model picker label: **Nova Auto** (one Ready brain) — not a multi-model team.

## Composer surface

Default `+` menu: **Debug (Coming Soon / parked)** + **files / bind project**. Plan, Agent, and Multi-agent stay removed. Debug is visible like Message/Networking (Soon badge) until the clinic is ready — flip `isDebugComposerParked()` in [`featurePark.ts`](../src/lib/featurePark.ts) when enabling.

## Do not

- Claim success from static Ready alone.
- Unlock Live with a null preview URL.
- Treat Plan card as done.
- Run Multimodal create relay / multi-GGUF seat swaps.
- Pre-write Design Spine product shells or restore them as Ready heals.
- Open Live while status is `failed` / `verifying` / `npm` without evidence.
