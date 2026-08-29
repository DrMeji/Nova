# ARK social: messaging & voice calls over the internet

ARK’s **Message** tab works over the internet when both people use the desktop app, are **signed in** with an ARK account, and have a normal internet connection.

**Call UI is parked on retail Setup.exe builds** (hidden / non-functional for public testers). Dev/`Open-ARK-Build.bat` can still reveal call demo controls. Do not treat Call as a shipped feature on installers until it is un-parked.

## What runs where

| Piece | Where it lives | What it does |
|-------|----------------|--------------|
| **Accounts & ARK IDs** | Supabase (`profiles.ark_id`) | Each user gets a unique 7-digit ARK ID after sign-in |
| **Friend requests** | Supabase (`ark_friend_requests`) | Add someone by ID; they accept in Notifications |
| **Contacts** | Supabase (`ark_contacts`) | Your friend list after accept |
| **Direct messages** | Supabase (`ark_direct_messages`) | Text chat between two ARK IDs |
| **Call signaling** | Supabase Realtime + `ark_call_signals` | Ring, accept, WebRTC offer/answer/ICE (**parked on Setup.exe**) |
| **Voice audio** | **Peer-to-peer WebRTC** | Audio goes directly between PCs when possible (**parked on Setup.exe**) |
| **Local cache** | `localStorage` on each PC | Offline read + faster UI; syncs when online |

The desktop app ships with the **public Supabase URL + anon key** (`.env.production`). That is normal for Supabase client apps; **Row Level Security (RLS)** on the database ensures users only read/write their own threads and signals.

## How messaging works (step by step)

1. **Sign in** on both machines (email/password). Each account receives an **ARK ID** (e.g. `7766582`).
2. **Add friend**: Message → **+** → enter their ARK ID → **friend request** is inserted in Supabase.
3. **Other person** opens **Notifications** → **Accept**. The `accept_ark_friend_request` RPC adds both users to each other’s contact lists.
4. **Send a message**: ARK inserts a row into `ark_direct_messages` and broadcasts via **Supabase Realtime**.
5. **Other person** receives it instantly if the app is open (Realtime subscription). If Realtime blips, a **4s poll** still picks it up.

**Requirements:** both users signed in, migrations applied on the hosted Supabase project, Realtime enabled on `ark_direct_messages`.

## How calling works (when un-parked)

1. Both users must be **friends** (or know each other’s ARK ID) and **signed in**.
2. **Caller** taps the green call button → ARK sends a **`ring`** signal (broadcast + DB row).
3. **Callee** sees blue ring / incoming UI → **Accept**.
4. ARK exchanges **WebRTC offer, answer, and ICE candidates** via Supabase (broadcast + persisted rows for catch-up).
5. Once connected, **audio is peer-to-peer** (microphone → their speakers). Mute/end call controls are local.

**NAT / firewall:** WebRTC uses Google **STUN** by default. Some networks need **TURN** (relay). Optional build env:

- `VITE_TURN_URL`
- `VITE_TURN_USERNAME`
- `VITE_TURN_CREDENTIAL`

Without TURN, calls work on most home networks but may fail on strict corporate Wi‑Fi.

## One-time backend setup (project owner)

Apply SQL migrations to the hosted Supabase project (`supabase/migrations/`), in order. **Core social will not work until these exist:**

1. `20260818000000_profiles_ark_id.sql`
2. `20260818010000_ark_social.sql`
3. `20260824100000_ark_friend_requests.sql` (or `supabase/apply-friend-requests.sql`)
4. `20260824120000_avatar_lookup.sql`
5. `20260825100001_broadcast_my_profile.sql`
6. `20260825150000_friends_unadd_blocks.sql` (`are_mutual_ark_friends`, blocks, unfriend)
7. **`20260827130000_harden_friend_messages.sql`** — DMs only between mutual friends (required)
8. `20260828140000_avatars_storage.sql` (or `supabase/avatars-storage.sql`) — profile photos as HTTPS files
9. `20260828150000_rls_core_audit.sql` — re-assert core RLS (safe if already applied)

In the Supabase dashboard → **Database → Replication**, confirm these tables are in the **`supabase_realtime`** publication:

- `ark_direct_messages`
- `ark_call_signals`
- `ark_friend_requests`

CLI (if linked): `npx supabase db push`

**Defer for later (not required for core app):** account-delete schedule SQL, custom SMTP / real email.

## Testing with two accounts

1. Create two accounts (two emails) on two PCs or one PC + VM.
2. Note each **ARK ID** in Settings → Account.
3. Account A sends friend request to B’s ID.
4. Account B accepts in Notifications.
5. Open Message thread → send text both ways.
6. Call is parked on Setup.exe — skip call testing on public installers; use bat/dev only if testing Call UI.

Dev builds (`Open-ARK-Build.bat`) also show **demo contacts** for UI testing; **production installers** start with an empty social graph until real friends are added. Demo friends / demo ring buttons never appear on Setup.exe.

## Database one-time fix (friend requests)

If Add friend shows `Could not find the table 'public.ark_friend_requests'`, run this SQL once in the Supabase SQL Editor:

- File: `supabase/apply-friend-requests.sql`
- Dashboard: Project → SQL → New → paste → Run
- Or: `powershell -File scripts/apply-friend-requests.ps1` with `SUPABASE_ACCESS_TOKEN` set

Then try Add friend again (both people must have signed in at least once so their ARK IDs exist in `profiles`).

## What is not cloud-synced yet

- Group chat (local/demo UI only — attachments stay on this PC)
- File/image attachments in DMs (local only — not uploaded to Supabase; other devices will not see the file bytes)
- Push when the app is fully quit (needs OS push service)
- True multi-party group calls (UI stacks avatars; signaling is 1:1)
