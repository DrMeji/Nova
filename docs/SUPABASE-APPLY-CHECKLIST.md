# Supabase apply checklist (#10)

Owner checklist before inviting testers. Mark each row after it is **Run** in the hosted Supabase SQL editor (or `npx supabase db push` against the linked project).

## Core social + RLS

| Applied? | File | Why |
|----------|------|-----|
| [ ] | `supabase/migrations/20260818000000_profiles_ark_id.sql` | NOVA IDs |
| [ ] | `supabase/migrations/20260818010000_ark_social.sql` | Contacts, posts, DMs |
| [ ] | `supabase/migrations/20260824100000_ark_friend_requests.sql` | Add / accept friends |
| [ ] | `supabase/migrations/20260824120000_avatar_lookup.sql` | Friend avatar lookup |
| [ ] | `supabase/migrations/20260825100001_broadcast_my_profile.sql` | Push name/photo to friends (`broadcast_my_profile`) |
| [ ] | `supabase/migrations/20260825150000_friends_unadd_blocks.sql` | Mutual friends + block/unfriend |
| [ ] | `supabase/migrations/20260827130000_harden_friend_messages.sql` | DMs only if mutual friends |
| [ ] | `supabase/migrations/20260828140000_avatars_storage.sql` | Avatar Storage bucket |
| [ ] | `supabase/migrations/20260828150000_rls_core_audit.sql` | Re-assert DM / posts RLS |
| [ ] | `supabase/migrations/20260909120000_rls_friend_request_tighten.sql` | Recipient-only friend-request UPDATE (#11) |

## Account delete RPCs

| Applied? | File | Why |
|----------|------|-----|
| [ ] | `supabase/migrations/20260825100000_delete_own_account.sql` | `delete_own_account` |
| [ ] | `supabase/migrations/20260828130000_schedule_account_deletion.sql` | 24h scheduled delete |

## Realtime

| Applied? | Action |
|----------|--------|
| [ ] | Database → Replication: enable `ark_direct_messages` |
| [ ] | Database → Replication: enable `ark_friend_requests` |

## Auth / email reset (#9)

| Applied? | Action |
|----------|--------|
| [ ] | Deploy `website/` (see `website/README.md`) |
| [ ] | Supabase Auth → Redirect URLs include `https://YOUR-SITE/account/reset` and `https://YOUR-SITE/**` |
| [ ] | Desktop build has `VITE_ARK_WEBSITE_ORIGIN=https://YOUR-SITE` in `.env.production` |
| [ ] | Website deploy has `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` |
| [ ] | Forgot password → real inbox → `/account/reset` → sign in on desktop |

## Auth / SMTP (#12) + hard-fail (#13)

| Applied? | Action |
|----------|--------|
| [ ] | Prefer **custom SMTP** (Project Settings → Auth → SMTP) so signup/reset mail is not capped by Supabase built-in (~2 emails/hour) |
| [ ] | Or disable **Confirm email** for invite-only testing, and tell users to Sign in if the account already exists after a rate-limit error |
| [ ] | Desktop shows clear config screen when `VITE_SUPABASE_*` missing (`supabaseConfigError` / App hard-fail) — verify with a broken build once |

## Quick verify

1. Two accounts: add friend → accept → DM both ways (#15). Accept/DM failures must show an error toast, not silent success.
2. Non-friends cannot DM.
3. Networking: create post → see it → post chat (device-only label) → delete own post (#16).
4. Settings → delete account path returns success (or clear “migration missing” if not applied).
5. Name change broadcasts to a friend contact list without wiping avatar (#17).
6. Forgot password email lands when origin is configured.

**Done when:** every box above is checked on the hosted project (this repo cannot prove live DB state by itself).
