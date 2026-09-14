# NOVA backlog (open work)

Master list of things not done yet, half-done, or parked.
**Core product first.** Image / Video / Call / Testers / Beta are **removed** from the product UI (not parked). Voice chat remains.

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

---

## Open list (full)

### Networking / social
1. ~~Delete own post~~ ✅
2. ~~Call~~ ✅ Removed from product
3. Voice chat — live (conversation only)
4. Live name sync — re-test when inviting

### Chat / AI
5–14. ~~Prior chat / MCP / Update items~~ — **Wave 1 (0.1.218):** one early dispatch with create/delete/open/cmd hosts; no `classifyTurn` in AIChat; no `runArkAgentLoop` / `answerStudio` in AIChat. **Still open:** mid-ladder hydrate→edit→chat; AIChat ≤2k; verifyAsk on every apply site; single PreviewSession; Electron job queue.

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

1. **Remaining hard items:** Windows signing cert (purchase), mark `docs/SUPABASE-APPLY-CHECKLIST.md` applied on hosted Supabase, deploy `website/` + set `VITE_ARK_WEBSITE_ORIGIN` for live email reset, optional custom SMTP
2. **Create / edit:** keep live-regressing cafe → Preview → micro-edit → second-chat isolation → interactive depth → App twins → mid-build switch → no-brain honesty
3. **Do not revive (unless product asks):** Image generation, Video generation, Call/WebRTC, Testers/Beta settings, custom profile photo upload — keep removed. Code leftovers stay unreachable; prefer delete over revive.
