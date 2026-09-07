# NOVA backlog (open work)

Master list of things not done yet, half-done, or parked.  
**Core product first** — Call / Voice / Video are side add-ons for later.

---

## Start here (recommended order)

| # | Item | Why first |
|---|------|-----------|
| **A–M** | Prior UX / chat reliability batch | ✅ Done |
| **1** | Settings **Update 504** | ✅ Done |
| **2** | MCP **tools/call** in Chat | ✅ Done |
| **3** | Plugins UX polish | ✅ Done (clarity pass, not full redesign) |
| **4** | Auth (local recovery note + PIN lockout) | ✅ Temp local recovery; real email reset still later |
| **5** | Ship slice (CSP packaged, signed-out update, SQL migrations) | ✅ Partial — signing cert still needs purchase; avatar Storage + RLS SQL ready to apply |
| — | Call / Video / Voice | Parked side add-ons — later |

---

## Open list (full)

### Networking / social
1. ~~Delete own post~~ ✅  
2–3. Call / Voice / signaling — later  
4. Live name/avatar sync — re-test  

### Chat / AI
5–13. ~~Prior chat items~~ ✅ (incl. MCP register + call, Update 504)  
14. ~~Update 504~~ ✅  

### Onboarding / Settings UX
15–19. ~~Prior onboarding~~ ✅  
20. ~~Plugins “half-finished” UX~~ ✅ (copy / empty state / how-to clarity)  

### Auth / backend
21. Real email password reset (hosted redirect site) — **still needed**; temp = local recovery note on PC  
22. Sign-up email rate limits — needs custom SMTP in Supabase  
23. ~~PIN lockout re-enable~~ ✅ (5 fails → 1 min)  
24. ~~SQL migrations for `delete_own_account` / `broadcast_my_profile`~~ ✅ (copied into `supabase/migrations/`) — **apply in Supabase dashboard if not already**  

### Security / platform
25. Authenticode / Windows code-signing certificate — **needs purchased cert** (can’t fake in code)  
26. ~~CSP~~ ✅ (packaged Electron builds)  
27. Supabase RLS re-audit before large invite — still open  
28. Avatar Storage bucket (not data URLs) — still open  
29. Video generation — later  
30. ~~In-app update while signed out~~ ✅ (Auth screen Check for update)  

---

## Done recently

- MCP registration + tools/call  
- Update GitHub 504 retry + honest UI  
- Boot/setup tips  
- **Temp local login recovery note** (email+password on this PC only)  
- Plugins clarity pass  
- PIN lockout restored  
- Packaged CSP  
- Signed-out update check on Auth  

---

## Rule of thumb

1. **Remaining hard items:** Windows signing cert (purchase), Supabase dashboard apply (avatars + RLS migrations), deploy `website/` + set `VITE_ARK_WEBSITE_ORIGIN`, optional custom SMTP  
2. **Later (side add-ons):** Call, Voice, Video  
