# Coding pipeline inventory (full)

Master list of every Nova path that touches coding / invent / create / edit / verify.
Generated for peer-rescan planning. **Not** the same as the 7-step quality spine alone.

Legend for **Peer-rescanned**:
- `yes` = deep peer-compare done this session
- `no` = not peer-rescanned yet
- `partial` = touched / wired, not full peer pass
- `parked` = documented as intentionally off / do-not-revive

---

## A. Turn routing (entry)

| ID | Pipeline | Owner | Steps / kinds | Peer-rescanned |
|----|----------|--------|---------------|----------------|
| A1 | **Classify turn** | `classifyTurn.ts` | `chat` · `plan` · `create` · `edit` · `keep_building` · `run_cmd` · `open_folder` · `delete` | **yes** |
| A2 | **Dispatch** | `chatTurnHandlers/dispatch.ts` | Owned: create, plan, delete, open_folder, run_cmd, edit (+ chat host) | **yes** |
| A3 | **Explicit kind chips** | `chatTurnHandlers/kinds.ts` | `<!--nova-kind:…-->` override | **yes** |
| A4 | **Ask / Plan / Act mode** | Composer + plan gates | Mode before classify | **partial** (plan gate covered in L) |

Peer smoke: `scripts/smoke-turn-routing-peer.mjs`

---

## B. Create — documented thin path (canonical product create)

Doc: `docs/CREATE_PIPELINE.md`

| # | Stage | Owner | Peer-rescanned |
|---|--------|--------|----------------|
| B1 | Talk / Instruct only | chat handlers | **yes** (via A talk-before-create) |
| B2 | Hard-go → create | `createProjectIntent` / classify | **yes** |
| B3 | Bare Vite scaffold | `projectScaffolds` / `ensureViteReactProjectFiles` | **yes** |
| B4 | Single-brain craft | `createV2` / invent ask / sticky model | **yes** (craft rules + understand contract; live invent still separate) |
| B5 | Syntax gate | `createSyntaxGate.ts` | **yes** |
| B6 | npm install | create bootstrap / job store | **partial** |
| B7 | Live evidence | `createEvidence.ts` / `createRuntimeLoop.ts` | **partial** (ordered; Live probe not re-run here) |
| B8 | Quality Ready | host judge + pass spine + coding quality gate | **yes** (floorFallback cannot unlock) |
| B9 | Edit after create | `edit.ts` | **yes** → see **H** |

Thin flags: `THIN_CREATE` always on (`createThinPath.ts`). Floors / ensemble multi-seat / layout recipes = **parked**.  
Peer smoke: `scripts/smoke-thin-create-peer.mjs` · stages: `THIN_CREATE_STAGES`.

---

## C. Create — quality win spine (the “7”)

`CODING_PIPELINE_STEPS` in `codingQualityWinPack.ts` · `codingCreatePipeline.ts`

| # | Step | Peer-rescanned |
|---|------|----------------|
| C1 | understand | **yes** |
| C2 | prep | **yes** |
| C3 | scaffold | **yes** |
| C4 | craft | **yes** (prompt/contract) |
| C5 | verify | **yes** (heuristic) |
| C6 | premium | **yes** |
| C7 | done | **yes** |

Smokes: `npm run smoke:coding-pipeline-steps`

---

## D. Create — runtime stages

`CREATE_RUNTIME_STAGES` in `createEvidence.ts`

`plan → scaffold → craft → preflight → install → live → fix → verified`

| Stage | Peer-rescanned |
|-------|----------------|
| All 8 | **yes** (aligned with thin + quality + pass spine labels) |

Peer smoke: `scripts/smoke-runtime-stages-peer.mjs`

---

## E. Create — pass spine (Ready gates)

`CREATE_PASS_ORDER` in `createPassSpine.ts`

`plan → structure → design → interact → verify → critic`

| Pass | Peer-rescanned |
|------|----------------|
| All 6 | **yes** (briefVerify wired into qualityReady) |

Smoke: `smoke:create-pass-spine` · peer: `smoke:pass-spine-peer`

---

## F. Create — craft / invent execution paths

| ID | Path | Owner | Status | Peer-rescanned |
|----|------|--------|--------|----------------|
| F1 | Invent-first generic ask | `codingAgentPack.formatGenericInventOwnLookPrompt` | live | **yes** (contract) |
| F2 | Storefront invent ask | `createStorefrontLadder` | live when shop brief | **partial** |
| F3 | Product invent ask | create.ts product invent | live when product desk | partial |
| F4 | Create build loop | `novaBuildLoop.runNovaCreateBuildLoop` | optional tool loop | partial (via I) |
| F5 | Agent loop (create) | `novaAgentLoop` via build loop | optional | **yes** (via I) |
| F6 | Architect / editor split | `CODING_AGENT_PACK.architectEditorSplit` | optional | **yes** (pack Have) |
| F7 | Thin depth / compositional | `createThinPath` depth continue | live | partial |
| F8 | createV2 staged write | `createV2.ts` | live craft writer | partial |
| F9 | Blank solid / tiny blank | `novaBuildLoop` blank helpers | special-case | no |
| F10 | Invent-demo compose | `createInventDemo` | **removed** (empty stub) | **yes** (dead confirmed) |

---

## G. Create — post-craft gates & honesty

| ID | Gate | Owner | Peer-rescanned |
|----|------|--------|----------------|
| G1 | Syntax heal | `createSyntaxGate` | **yes** (agent/edit thin-valid exception) |
| G2 | Ask-match / brief fidelity | `createAskContract`, `inventBriefFidelity` | **partial** |
| G3 | Build quality / Ready helpers | `createBuildQuality` | partial |
| G4 | Host judge | `createHostJudge` | **yes** (via E peer) |
| G5 | Coding quality Ready | `readyBlockedByCodingQuality` + must-haves | **yes** |
| G6 | Harness quality Ready | `harnessQualityReadyGate` | **yes** (via J) |
| G7 | Reply honesty | `formatCreateProjectReply` | **partial** |
| G8 | Job Ready / Live unlock | `createJobStore`, `createReady` | **yes** (harness gate wired) |
| G9 | Checkpoint / abort / resume | `createCheckpoint`, job abort | no |

---

## H. Edit / keep_building

| ID | Path | Owner | Peer-rescanned |
|----|------|--------|----------------|
| H1 | Surgical edit | `runSurgicalEditTurn` | **yes** |
| H2 | Model edit turn | `runEditTurn` | **yes** |
| H3 | Apply + anti-bleed | `applyChatReplyEdits` / finalize | **yes** |
| H4 | Edit agent loop | `shouldUseNovaEditBuildLoop` + `novaAgentLoop` | **yes** |
| H5 | Keep building | classify → edit/create continue | **partial** |
| H6 | Luggage / premium redesign hooks | edit.ts specials | parked (demo path dead) |

Peer smoke: `scripts/smoke-edit-peer.mjs` · stages: `EDIT_PIPELINE_STAGES`

---

## I. Agent loop & coding agent packs

| ID | Pack / loop | Owner | Peer-rescanned |
|----|-------------|--------|----------------|
| I1 | Nova agent loop | `novaAgentLoop.ts` | **yes** |
| I2 | Coding agent pack | `CODING_AGENT_PACK` (invent-first, read-before-edit, doom-loop, …) | **yes** |
| I3 | Coding cloud policy | `codingCloudPolicy` | **partial** (prep) |
| I4 | Coding create seats | `codingCreateSeats` | **partial** (prep) |
| I5 | Coding file verify | `codingFileVerify` | **yes** (doom loop) |
| I6 | Post-patch verify | `postPatchVerify` | **partial** |
| I7 | Unique capabilities matrix | `CODING_UNIQUE_CAPABILITIES` (~90 rows) | partial (invent-demo evidence pruned in K) |

Peer smoke: `scripts/smoke-agent-loop-peer.mjs` · stages: `AGENT_LOOP_STAGES`  
Fix this pass: invent completeness no longer blocks compile-valid thin agent writes (`isAgentLoopWritableAppSource`).

---

## J. Agent harness (P0–P2 + R7–R10)

`HARNESS_PACK` in `agentHarness/index.ts`

| Layer | Capabilities (flags) | Peer-rescanned |
|-------|----------------------|----------------|
| P0 | binaryRubric, generator≠evaluator, failToPassSmoke, progressMd, visionA11y, browserClosedLoop, osSandbox, constrainedDecode, createArtifacts | **yes** |
| P1 | bestOfN, headlessJson, acpGuest, codeGraph, astEdit, worktreeMesh, driverNavigator, debateCoder, earsSpec, mcpSchemaPin, subAgents, reflexionRulesDesign, trajectoryUndoSteer | **yes** |
| P2 | memoriesDecay, shareableRunUrl, hooksBus, pluginMarketplace, personas, a2aGateway, scheduledAgents, bgInventIngress, costQualityBench | **yes** |
| R7–R10 | `R7R10_PACK` (elision, HAR, network-restricted verify, empty-patch fail, skills-first, meta router, retrieval, stop policy) | **yes** |

Smoke: `smoke:agent-harness` · peer: `smoke:agent-harness-peer`

---

## K. Invent research packs (Acc attach / meta)

These stamp `.nova/*` / Acc helpers; invent-demo host twin is **removed**.

| Pack | File | Role | Peer-rescanned |
|------|------|------|----------------|
| K1 | `inventCraftPack` | brand kit, logo lock, live grade, craft media, plan-approve | **yes** |
| K2 | `inventCodingPack` | coding roles, orchestra, verify toolkit, seat outcomes | **yes** (exists; no demo re-enable) |
| K3 | `inventFieldPack` | field invent, secrets, SEO, worktrees, PR draft | **yes** |
| K4 | `inventCloseAllPack` | worker DAG, scaffolds, attaches | **yes** |
| K5 | `inventOpenAllPack` | open-all caps matrix | partial |
| K6 | `inventNormalFloorPack` | “normal” Acc pages — **floor-ish** | parked-ish |
| K7 | `inventHomesPack` | UI homes placement | partial |
| K8 | `inventPlatformPack` | sandbox, ACP, CI, fullstack, figma | partial |
| K9 | `inventHarnessPack` | invent/redesign/ask/debug modes | **yes** |
| K10 | `inventWave4Pack` | directions, skills, annotations | partial |
| K11 | `inventWave5Pack` | permission modes, approvals, architect pair | partial |
| K12 | `inventBriefFidelity` | genre detect + twin layout fidelity | **yes** |
| K13 | Deep rescan meta | `inventDeepRescanMeta.generated.ts` | n/a |

Peer smoke: `scripts/smoke-invent-packs-peer.mjs` · craft: `smoke:invent-craft-pack`

---

## L. Plan / chat coding-adjacent

| ID | Path | Owner | Peer-rescanned |
|----|------|--------|----------------|
| L1 | Plan turn | `chatTurnHandlers/plan.ts` | **yes** |
| L2 | Plan → implement gate | `chatPlanMode` / inventNeedsPlanApprove | **yes** |
| L3 | Chat coding talk-first | `chat.ts` + idea intent | **yes** (via A) |
| L4 | Run cmd | `runCmd.ts` | **yes** |

Peer smoke: `scripts/smoke-plan-chat-peer.mjs`

---

## M. Ensemble / legacy (parked or legacy export)

| ID | Path | Notes | Peer-rescanned |
|----|------|--------|----------------|
| M1 | `createEnsemble` hops | plan/spec/design/copy/style/verify/critic — **parked** for live create | parked |
| M2 | `createPipeline.ts` | re-exports ensemble only | parked |
| M3 | Multimodal / multi-GGUF seat swaps | do-not-revive per CREATE_PIPELINE.md | parked |

---

## N. Supporting coding surfaces (UI / settings)

Not full “pipelines,” but coding-related:

- Model seats / Providers / test-connection (`codingCreateSeats`, `codingProvidersTestConnection`)
- MCP tools allowlist (`novaMcp`)
- Agents window / agent trace
- CodingWorkerDagPanel / CodingPipelineChecklist
- Diff review / patch confidence / file model attribution
- Missing-items coding rows (`missingItemsByHome.generated.ts`)

Peer-rescanned: **partial** (seats surfaced in Prep; harness MCP pin covered in J)

---

## O. Smoke / regression entrypoints (coding)

| Script | Covers |
|--------|--------|
| `smoke:coding-pipeline-steps` | C1–C7 |
| `smoke:thin-create-path` / `smoke:thin-create-peer` | B |
| `smoke:create-pass-spine` / `smoke:pass-spine-peer` | E |
| `smoke:runtime-stages-peer` | D |
| `smoke:edit-peer` / `smoke:edit-weak` | H |
| `smoke:agent-loop` / `smoke:agent-loop-peer` | I1 |
| `smoke:coding-agent-pack` | I2 |
| `smoke:agent-harness` / `smoke:agent-harness-peer` | J |
| `smoke:invent-packs-peer` / `smoke:invent-craft-pack` | K |
| `smoke:turn-routing-peer` | A |
| `smoke:plan-chat-peer` | L |
| `_smoke-coding-quality-win` | C flags + invent-demo empty |

---

## Summary counts

| Bucket | Pipelines / packs | Peer deep-scan done |
|--------|-------------------|---------------------|
| A Turn routing | 4 | **4** |
| B Thin create doc path | 9 stages | **yes** (npm/Live partial) |
| C Quality 7 | 7 | **7** |
| D Runtime stages | 8 | **8** |
| E Pass spine | 6 | **6** |
| F Craft executors | ~10 | most yes/partial; invent-demo dead |
| G Post-craft gates | 9 | most yes/partial |
| H Edit | 6 | **yes** |
| I Agent / unique | 7+ | **yes** core |
| J Harness | ~30 flags | **yes** |
| K Invent packs | 13 | **hot path yes**; Acc-only partial |
| L Plan/chat | 4 | **4** |
| M Parked | 3 | n/a |

**Peer-rescan order completed (this session):**

1. **B** Thin create  
2. **H** Edit + keep_building  
3. **E** Pass spine + **G** Ready gates  
4. **I** Agent loop (thin-write fix)  
5. **J** Harness  
6. **D** Runtime stages alignment  
7. **K** Invent packs (demo-empty + craft helpers)  
8. **A** Turn routing  
9. **L** Plan / chat  

**Still deferred (needs Live / human):** end-to-end Live invent prove; soft DESIGN.md tokens / heuristic verify polish behind peers; Acc-only invent packs prune.
