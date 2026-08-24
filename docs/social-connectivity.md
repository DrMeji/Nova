# ARK social: messaging & voice calls over the internet

ARK’s **Message** and **Call** tabs work over the internet when both people use the desktop app, are **signed in** with an ARK account, and have a normal internet connection. No separate calling app is required.

## What runs where

| Piece | Where it lives | What it does |
|-------|----------------|--------------|
| **Accounts & ARK IDs** | Supabase (`profiles.ark_id`) | Each user gets a unique 7-digit ARK ID after sign-in |
| **Friend requests** | Supabase (`ark_friend_requests`) | Add someone by ID; they accept in Notifications |
| **Contacts** | Supabase (`ark_contacts`) | Your friend list after accept |
| **Direct messages** | Supabase (`ark_direct_messages`) | Text chat between two ARK IDs |
| **Call signaling** | Supabase Realtime + `ark_call_signals` | Ring, accept, WebRTC offer/answer/ICE |
| **Voice audio** | **Peer-to-peer WebRTC** | Audio goes directly between PCs when possible |
| **Local cache** | `localStorage` on each PC | Offline read + faster UI; syncs when online |

The desktop app ships with the **public Supabase URL + anon key** (`.env.production`). That is normal for Supabase client apps; **Row Level Security (RLS)** on the database ensures users only read/write their own threads and signals.

## How messaging works (step by step)

1. **Sign in** on both machines (email/password). Each account receives an **ARK ID** (e.g. `7766582`).
2. **Add friend**: Message → **+** → enter their ARK ID → **friend request** is inserted in Supabase.
3. **Other person** opens **Notifications** → **Accept**. The `accept_ark_friend_request` RPC adds both users to each other’s contact lists.
4. **Send a message**: ARK inserts a row into `ark_direct_messages` and broadcasts via **Supabase Realtime**.
5. **Other person** receives it instantly if the app is open (Realtime subscription). If Realtime blips, a **4s poll** still picks it up.

**Requirements:** both users signed in, migrations applied on the hosted Supabase project, Realtime enabled on `ark_direct_messages`.

## How calling works (step by step)

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

Apply SQL migrations to the hosted Supabase project (`supabase/migrations/`):

1. `20260818000000_profiles_ark_id.sql`
2. `20260818010000_ark_social.sql`
3. `20260824100000_ark_friend_requests.sql`

In the Supabase dashboard → **Database → Replication**, confirm these tables are in the **`supabase_realtime`** publication:

- `ark_direct_messages`
- `ark_call_signals`
- `ark_friend_requests`

CLI (if linked): `npx supabase db push`

## Testing with two accounts

1. Create two accounts (two emails) on two PCs or one PC + VM.
2. Note each **ARK ID** in Settings → Account.
3. Account A sends friend request to B’s ID.
4. Account B accepts in Notifications.
5. Open Message thread → send text both ways.
6. Tap call → other side accepts → talk.

Dev builds (`Open-ARK-Build.bat`) also show **demo contacts** for UI testing; **production installers** start with an empty social graph until real friends are added.

## What is not cloud-synced yet

- Group chat (local/demo UI only)
- File/image attachments in DMs (local only)
- Push when the app is fully quit (needs OS push service)
- True multi-party group calls (UI stacks avatars; signaling is 1:1)
