# Deferred / not fully implemented

Parked on purpose or blocked by external requirements. Revisit after core social + auth is stable.

## Product / UX

1. **Call (WebRTC)** — UI parked behind Testers until signaling spoof hardening ships. Message DMs work; call button stays hidden on retail until Call is revealed.
2. **WebRTC call signaling spoof hardening** — full fix when Call officially ships.
3. **Video generation** — intentionally blocked until generation is reliable (not motion-still fallback).
4. **Plugins “half-finished” UX** — no redesign yet; keep current UI.
5. **Real email password reset** — still contact-developer flow (`@DrMeji`); no automated reset email.
6. **Sign-up email rate limits** — Supabase built-in SMTP (~2/hour). Needs custom SMTP to raise; Confirm email off helps testing.

## Security / platform

7. **Authenticode / publisher code-signing** — need a real Windows code-signing cert. Today: GitHub URL trust + sha512 on releases.
8. **CSP (Content Security Policy)** — skipped for now (easy to break Electron / `data:` images).
9. **Supabase RLS re-audit** — manual dashboard pass before large invite.
10. **PIN lockout** — temporarily disabled for testing (`pinLock.ts`); re-enable before public launch.
11. **Avatar storage** — profile photos are currently data URLs in `profiles` / contacts; move to Storage bucket before scale.

## Ops

12. **In-app update while signed out** — Auth screen has “Download latest installer” link; Settings → Updates still needs sign-in.
13. **`delete_own_account` / `broadcast_my_profile` SQL** — must be applied once per Supabase project (SQL editor). Client degrades gracefully if missing.

## Done recently (do not re-park)

- Friend requests + DM messaging
- Live contact name/avatar refresh from profiles
- Sign-up display name field
- DEV alias for developer account
