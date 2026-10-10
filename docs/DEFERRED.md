# NOVA backlog (open work)

Master list of things not done yet, half-done, or parked.
**Core product first.** Image / Video / Call / Testers / Beta are **removed** from the product UI (not parked). Voice chat remains.

---

## Create spine puzzle (0.1.315–0.1.316)

Tracked so agents stop patching side quests. See [`CREATE_PIPELINE.md`](./CREATE_PIPELINE.md).

| # | Spine piece | Status |
|---|-------------|--------|
| 1 | One family owner (`inferCreateCompositionFamily`) | ✅ 0.1.315 |
| 2 | Per-ask craft (brief-first — not tip/todo/notes recipe menus) | ✅ 0.1.317 |
| 3 | Soft shape hints only (anti-sabotage; invent from ask) | ✅ 0.1.317 |
| 4 | Truly empty Vite scaffold | ✅ 0.1.315 |
| 5 | Stop floors owning App as quality success | ✅ 0.1.316 (`floorFallback` / `repairOwnedProduct`) |
| 6 | Kill marketing default pressure (QUALITY_FLOOR, COVER) | ✅ 0.1.315 |
| 7 | Hard anti-wrong-family Ready gate | ✅ 0.1.315–316 |
| 8 | Honest Live (no forged utility mount) | ✅ 0.1.316 |
| 9 | Repair must not become the product | ✅ 0.1.316 (`repairOwnedProduct`) |
| 10 | Docs = code (this file + CREATE_PIPELINE) | ✅ 0.1.316 |

**Thin create (0.1.318):** ✅ ask → sticky craft → syntax → honest Live; floors/marketing salvage gated off. Temp Nova stays a separate harness (not merged). See [`CREATE_PIPELINE.md`](./CREATE_PIPELINE.md).

**Still later (not spine blockers):** chat mid-ladder AIChat peel, Windows signing cert, email reset hosting, richer shop-without-cart genre, ensemble unpark when cloud-only.

---

## Start here (recommended order)

| # | Item | Why first |
|---|------|-----------|
| **A–M** | Prior UX / chat reliability batch | ⚠️ Partial — Wave 1 dispatch+hosts (0.1.218); AIChat still ~9.7k; Wave 2 peel open |
| **1** | Settings **Update 504** | ✅ Done |
| **2** | MCP **tools/call** in Chat | ✅ Done |
| **3** | Plugins UX polish | ✅ Done (clarity pass, not full redesign) |
| **4** | Auth (local recovery note + PIN lockout) | ✅ Temp local recovery; real email reset still later |
| **5** | Ship slice (CSP packaged, signed-out update, SQL migrations) | ✅ Partial — signing cert still needs purchase |
| — | Image / Video / Call / Testers / Beta | ✅ Removed from product UI; Call source deleted |
| — | Voice chat | Live (dev always on; retail via Settings → Voice); refuses builds/edits |
| — | Profile photos / avatar cloud Storage | ✅ Cancelled — everyone uses the Nova logo |
| — | Create spine puzzle (#1–#10) | ✅ 0.1.316 |

---

## Open list (full)

### Networking / social
1. ~~Delete own post~~ ✅
2. ~~Call~~ ✅ Removed from product
3. Voice chat — live (conversation only)
4. Live name sync — re-test when inviting

### Chat / AI
5–14. ~~Prior chat / MCP / Update items~~ — **Wave 1 (0.1.218):** one early dispatch with create/delete/open/cmd hosts; no `classifyTurn` in AIChat; no `runNovaAgentLoop` / `answerStudio` in AIChat. **Still open:** mid-ladder hydrate→edit→chat; AIChat ≤2k; verifyAsk on every apply site; single PreviewSession; Electron job queue.

### Onboarding / Settings UX
15–20. ~~Prior onboarding / plugins~~ ✅

### Auth / backend
21. Real email password reset (hosted redirect site) — **still needed**; temp = local recovery note on PC
22. Sign-up email rate limits — needs custom SMTP in Supabase
23. ~~PIN lockout re-enable~~ ✅
24. ~~SQL migrations~~ ✅ (apply in Supabase dashboard if not already)

### Security / platform
25. Authenticode / Windows code-signing certificate — **needs purchased cert**
26. ~~CSP~~ ✅
27. Supabase RLS re-audit before large invite — still open
28. ~~Avatar Storage bucket~~ ❌ Cancelled (Nova logo for all profiles)
29. ~~Video / Image generation~~ ❌ Removed from product UI for now
30. ~~In-app update while signed out~~ ✅

---

## Done recently

- Image / Video / Call / Testers / Beta removed from product UI
- Nova logo for every profile picture
- Voice chat restored
- MCP registration + tools/call
- Update GitHub 504 retry + honest UI
- Create Ready gate + empty App twin cleanup

---

## Rule of thumb

1. **Remaining hard items:** Windows signing cert (purchase), mark `docs/SUPABASE-APPLY-CHECKLIST.md` applied on hosted Supabase, deploy `website/` + set `VITE_NOVA_WEBSITE_ORIGIN` for live email reset, optional custom SMTP
2. **Create / edit:** keep live-regressing cafe → Preview → micro-edit → second-chat isolation → interactive depth → App twins → mid-build switch → no-brain honesty
3. **Do not revive (unless product asks):** Image generation, Video generation, Call/WebRTC, Testers/Beta settings, custom profile photo upload — keep removed. Code leftovers stay unreachable; prefer delete over revive.
