# Apply core Supabase (make NOVA social + avatars work)

Do this on the **hosted** Supabase project before inviting testers.

## Checklist

Run each file in **SQL → New → paste → Run** (or `npx supabase db push` if the project is linked):

| # | File | Why |
|---|------|-----|
| 1 | `migrations/20260818000000_profiles_ark_id.sql` | NOVA IDs |
| 2 | `migrations/20260818010000_ark_social.sql` | Contacts, posts, DMs |
| 3 | `migrations/20260824100000_ark_friend_requests.sql` | Add / accept friends |
| 4 | `migrations/20260824120000_avatar_lookup.sql` | Friend avatar lookup |
| 5 | `migrations/20260825100000_delete_own_account.sql` | `delete_own_account` RPC |
| 6 | `migrations/20260825100001_broadcast_my_profile.sql` | Push name/photo to friends |
| 7 | `migrations/20260825150000_friends_unadd_blocks.sql` | Mutual friends + block/unfriend |
| 8 | `migrations/20260827130000_harden_friend_messages.sql` | DMs only if mutual friends |
| 9 | `migrations/20260828130000_schedule_account_deletion.sql` | 24h scheduled account delete |
| 10 | `migrations/20260828140000_avatars_storage.sql` | Avatar files in Storage (not giant data URLs) |
| 11 | `migrations/20260828150000_rls_core_audit.sql` | Re-assert DM / posts / call RLS (safe to re-run) |
| 12 | `migrations/20260909120000_rls_friend_request_tighten.sql` | Recipient-only accept/decline (#11) |

Then **Database → Replication**: enable Realtime for `ark_direct_messages`, `ark_friend_requests` (and `ark_call_signals` if you test Call on bat/dev).

Full printable checklist (including Auth / email reset): **`docs/SUPABASE-APPLY-CHECKLIST.md`**.
RLS audit note: **`docs/RLS-AUDIT.md`**.

## Auth + email reset (desktop + website)

1. Deploy `website/` (Vercel/Netlify). See `website/README.md`.
2. **Authentication → URL configuration** in Supabase:
   - Add `https://YOUR-SITE/account/reset` to **Redirect URLs**
   - Add `https://YOUR-SITE/**` (or localhost `http://localhost:5180/**` for dev)
3. Set `VITE_NOVA_WEBSITE_ORIGIN=https://YOUR-SITE` in `.env.production` before `npm run build` (desktop forgot-password uses Supabase `resetPasswordForEmail` with redirect to `/account/reset`).
4. **Custom SMTP (recommended before invites)** — Project Settings → Auth → SMTP. Built-in Supabase mail is ~2 messages/hour; signup rate-limit errors tell users to wait, disable Confirm email for testing, or Sign in if the account already exists (`AuthContext.signUp`).
5. **Auth hard-fail** — a desktop build without `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` must show the “NOVA could not start” screen (`supabaseConfigError`), not a blank shell.

## Quick verify

1. Two signed-in accounts → Add friend by NOVA ID → Accept in Notifications.  
2. Message tab → send text both ways.  
3. Settings → Account → set a photo → other friend’s contact list shows it (after Storage SQL).  
4. Non-friends cannot DM each other (harden migration).  
5. Auth screen → Forgot password → email arrives with link to `website/account/reset` (after steps above).

## Not cloud yet (OK for MVP)

- Group chat UI (this PC only)  
- DM file attachments  
- Post discussion threads under Networking posts  
- Windows Authenticode cert (see `build/signing.env.example` + Settings → Updates)
