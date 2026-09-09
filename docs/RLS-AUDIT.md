# RLS re-audit note (#11)

Date: 2026-09-09

## Scope
Profiles, friend requests, DMs, network posts, contacts/blocks.

## Findings
1. **Friend-request UPDATE was too wide** — sender OR recipient could UPDATE any row they appeared on, so a sender could mark `accepted` without going through `accept_ark_friend_request` (contacts might not be created).
2. **DM insert** already requires mutual friends (`20260827130000` / core audit). Client also checks blocks before send.
3. **Profiles** owner-only policies exist; re-asserted in the new migration.
4. **Network posts** update/delete own — re-asserted when table exists.
5. **DM SELECT after unfriend** — participants can still read prior thread history. Acceptable for v1 (local cache + history); not changed.

## Closed in repo
- Migration `supabase/migrations/20260909120000_rls_friend_request_tighten.sql`
  - Recipient-only UPDATE with status ∈ (`accepted`,`declined`)
  - Re-assert profile + post owner policies

## Apply
Run the new migration on the hosted project (see `docs/SUPABASE-APPLY-CHECKLIST.md`).
