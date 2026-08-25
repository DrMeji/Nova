# ARK changelog

## 0.1.152 — 2026-08-24

Permanent Delete account in Settings (immediate, no waiting period).

**Windows installer:** [ARK-Setup.exe](https://github.com/DrMeji/Ark/releases/download/v0.1.152/ARK-Setup.exe) · [Release notes](https://github.com/DrMeji/Ark/releases/tag/v0.1.152)

### Account
- Settings → Account → Permanently delete account removes the user on Supabase right away so the same email can sign up again with a new ARK ID.
## 0.1.151 — 2026-08-24

Clean auth restart on the new Supabase project. Developer email shows as DEV; everyone else keeps a 7-digit ARK ID.

**Windows installer:** [ARK-Setup.exe](https://github.com/DrMeji/Ark/releases/download/v0.1.151/ARK-Setup.exe) · [Release notes](https://github.com/DrMeji/Ark/releases/tag/v0.1.151)

### Social
- Fresh backend has no leftover accounts — sign up again with your email.
- `thomaskrishnan0107@gmail.com` displays as **DEV**; friends can add `DEV` or the underlying 7-digit ID.
- Other accounts always use their own 7-digit ARK ID.
## 0.1.150 — 2026-08-24

Point ARK at the new Supabase project and ship friend-request schema for public testers.

**Windows installer:** [ARK-Setup.exe](https://github.com/DrMeji/Ark/releases/download/v0.1.150/ARK-Setup.exe) · [Release notes](https://github.com/DrMeji/Ark/releases/tag/v0.1.150)

### Social / backend
- Desktop app now uses Supabase project `mjheezjqwqbhkcmwredq`.
- Friend requests, profiles, contacts, DMs, and networking tables are live on that project.
- Sign in again on each PC (accounts from the old project do not carry over).
## 0.1.149 — 2026-08-24

Friend requests / Networking add-by-ARK-ID. Requires applying supabase/apply-friend-requests.sql once on the hosted project.

**Windows installer:** [ARK-Setup.exe](https://github.com/DrMeji/Ark/releases/download/v0.1.149/ARK-Setup.exe) · [Release notes](https://github.com/DrMeji/Ark/releases/tag/v0.1.149)

### Social
- Clearer errors when friend-request table is missing on Supabase.
- Lookup ARK IDs reliably before sending requests (both accounts must have signed in once).
- Networking search accepts a 7-digit ARK ID and shows Add friend.
- Message / Networking add paths send a friend request (not a fake instant contact).
## 0.1.148 — 2026-08-24

Security / public-beta hardening for testers. Video stays Soon. Forgot password goes to contact developer.

**Windows installer:** [ARK-Setup.exe](https://github.com/DrMeji/Ark/releases/download/v0.1.148/ARK-Setup.exe) · [Release notes](https://github.com/DrMeji/Ark/releases/tag/v0.1.148)

### Security / public beta
- Updates re-resolve the installer from DrMeji/Ark Releases and reject non-trusted URLs before download/silent install.
- After download, Setup.exe is checked against `latest.yml` sha512 when that asset is published (Authenticode signing still needs a publisher cert).
- Agent command mode is enforced in Electron main (renderer cannot force run_all); node -e / python -c blocked; node/python/npx always need confirm.
- Call UI parked on retail Setup.exe builds (bat/dev can still reveal); Message phone controls hidden when parked.
- Full PC grant limited to the Windows user profile (not whole-disk).
- pathStat / browse honor the same workspace grants as file read.
- Forgot password → contact developer (@DrMeji) instead of broken email reset.
- Public docs link goes to Releases (no oauth-setup.md on public Ark).
- Skip-setup chat honesty no longer treats engine IPC as a live brain.
- Video models always "coming soon" in catalog; video capacity never advertised as free/live.
- openExternal allowlists known Connect/docs hosts (HTTPS only).
- Localhost HTTP proxy limited to brain / Ollama / Vite ports.
- Image offline/SVG fallbacks show an honesty label; DM attachments labeled "this PC only".
## 0.1.147 — 2026-08-24

Public downloads without public source.

**Windows installer:** [ARK-Setup.exe](https://github.com/DrMeji/Ark/releases/download/v0.1.147/ARK-Setup.exe) · [Release notes](https://github.com/DrMeji/Ark/releases/tag/v0.1.147)

### Distribution
- Public **DrMeji/Ark** is README + Releases (installers) only.
- Full source lives in private **DrMeji/Ark-Source**.
- In-app updates check the public Ark feed.
## 0.1.146 — 2026-08-24

In-app updates work while source stays private.

**Windows installer:** [ARK-Setup.exe](https://github.com/DrMeji/Ark/releases/download/v0.1.146/ARK-Setup.exe) · [Release notes](https://github.com/DrMeji/Ark/releases/tag/v0.1.146)

### Updates
- Check/Download now reads the public **DrMeji/Ark** feed (installers only).
- Private `DrMeji/Ark` source no longer blocks anonymous update checks (GitHub 404).
## 0.1.145 � 2026-08-24

Chat continuity, setup Connect links, and image download / enlarge fixes.

**Windows installer:** [ARK-Setup.exe](https://github.com/DrMeji/Ark/releases/download/v0.1.145/ARK-Setup.exe) � [Release notes](https://github.com/DrMeji/Ark/releases/tag/v0.1.145)

### Chat
- Soft follow-ups (�more details�, �dive deeper�, �recommended area�) keep history and a thread topic so local models stay on coding instead of inventing EcoBuddy or movies/TV.
- Bare teach-me follow-ups no longer force product-planning framing.

### Setup Connect
- Connect / Add opens the system browser immediately (no �Open external link?� confirm) for OpenAI, NVIDIA NIM, and other hosts.

### Images
- Download saves a real **JPG/PNG** (was wrongly named `.svg` when �svg� appeared inside base64).
- Click an image to open a larger clear preview; Esc or backdrop closes it.
- Portrait prompts nudge better eye anatomy (Flux still has limits).
## 0.1.144 G�� 2026-08-24

Setup access toggles apply instantly (no OK popups). Decorative em dashes cleaned from UI copy.

**Windows installer:** [ARK-Setup.exe](https://github.com/DrMeji/Ark/releases/download/v0.1.144/ARK-Setup.exe) -+ [Release notes](https://github.com/DrMeji/Ark/releases/tag/v0.1.144)

### Setup / Security
- Desktop, Documents, Full PC, and Run everything toggles no longer show a second confirm dialog.
- Same for Settings G�� Security access and execution mode.

### Copy
- Removed decorative em dashes in user-facing text (e.g. GǣGemini free tier. One key.Gǥ).

## 0.1.143 G�� 2026-08-24

Fresh installs always open on Sign in / Sign up before first-run setup.

**Windows installer:** [ARK-Setup.exe](https://github.com/DrMeji/Ark/releases/download/v0.1.143/ARK-Setup.exe) -+ [Release notes](https://github.com/DrMeji/Ark/releases/tag/v0.1.143)

### Auth
- New installs clear leftover saved sessions so setup cannot skip Sign in / Sign up.
- Installer deletes `ark-auth-storage.dat` on a fresh install (not upgrades).

## 0.1.142 G�� 2026-08-24

Plugins Soon locks, profile photos across Connect, and presence-colored sidebar ring.

**Windows installer:** [ARK-Setup.exe](https://github.com/DrMeji/Ark/releases/download/v0.1.142/ARK-Setup.exe) -+ [Release notes](https://github.com/DrMeji/Ark/releases/tag/v0.1.142)

### Plugins
- Unwired catalog plugins (Neon, Shopify, HubSpot, QuickBooks, etc.) show **Soon**, are dimmed, and are not clickable.

### Profile & presence
- Uploaded profile photo syncs to your account and shows on Network, Message, and Notifications.
- Sidebar profile avatar ring + ARK ID color follow Online / Idle / Do Not Disturb / Inactive.

## 0.1.141 G�� 2026-08-24

Live social: cloud friend requests, real-time DMs, and internet voice calls.

**Windows installer:** [ARK-Setup.exe](https://github.com/DrMeji/Ark/releases/download/v0.1.141/ARK-Setup.exe) -+ [Release notes](https://github.com/DrMeji/Ark/releases/tag/v0.1.141)

### Social (production)

- **Friend requests** sync through Supabase (`ark_friend_requests`) G�� add by ARK ID, accept in Notifications on the other device.
- **Direct messages** already use Supabase Realtime; friend flow is now wired for cross-user use when signed in.
- **Voice calls** use Supabase signaling + WebRTC audio; offer/answer/ICE persist for reconnect catch-up.
- **Call tab** enabled by default (no Testers toggle required).
- **Call UI** on message pill + sidebar dock (colored ring, mute, timer).
- Docs: [social-connectivity.md](./social-connectivity.md) G�� how messaging and calls work over the internet.

### Backend migration

Apply `supabase/migrations/20260824100000_ark_friend_requests.sql` on the hosted Supabase project and enable Realtime on `ark_friend_requests`.

## 0.1.140 G�� 2026-08-24

Image quality, chat keep-alive, NSFW gate, and static-project fixes.

**Windows installer:** [ARK-Setup.exe](https://github.com/DrMeji/Ark/releases/download/v0.1.140/ARK-Setup.exe) -+ [Release notes](https://github.com/DrMeji/Ark/releases/tag/v0.1.140)

### Image generation

- Flux-first pipeline (no dual Pollinations race that caused 429 GǣbusyGǥ errors).
- Stronger sharp-focus prompts and blur negative prompts; rejects soft/fast cache stubs.
- Optional ffmpeg upscale+unsharp when frames arrive below 1100px.
- NSFW off adds SFW constraints on free hosts; Settings G�� AI toggle controls adult content.

### Chat / navigation

- Chat and Image generations keep running when you hop to Settings, Local AI, or other tabs.
- Sticky local SD failure no longer blocks free image hosts.
- Multi-agent via Chat **+**; skills auto-attach on create/edit; MCP tool catalog in chat.

### Project create

- Static HTML calculators skip npm install (no ENOENT on missing package.json).
- Preview window tracks `windowOpen` for Vite HMR reload.

Download: [Releases](https://github.com/DrMeji/Ark/releases)

## 0.1.138 G�� 2026-08-22

Chat coding, new-product routing, and delete targeting.

**Windows installer:** [ARK-Setup.exe](https://github.com/DrMeji/Ark/releases/download/v0.1.138/ARK-Setup.exe) -+ [Release notes](https://github.com/DrMeji/Ark/releases/tag/v0.1.138)

Remaining product request: [issue #1](https://github.com/DrMeji/Ark/issues/1).

### Chat can edit code (default)

Default Chat is Agent, not Ask. Asks like **add a search button** or **change the header** write files in the open workspace via `@@@FILE` apply. Composer prefixes (`[Plan]`, Agent mode, Debug) are stripped before intent routing.

### New product ideas (Ring System)

GǣI want to work on a project called Ring SystemGǪGǥ is a **new app**, not Gǣwhich existing folder? DeBloat.Gǥ Greenfield plan G�� Create project. `LetG��s work on DeBloat` still binds an existing folder.

### Delete / catalog safety

- Delete only the **named** folder. Never wipe the bound workspace by mistake.
- Listing a catalog no longer unbinds the open project.
- Add-file intent requires a real file name (not GǣAgent edit filesGǥ).

### Typecheck (follow-up on main)

Chat/Code view types: `ChatMessage.project_id`, attach `kind as const`, optional `window.arkDesktop`, Code composer `'agent'` mode, `readTextFile` `text`/`binary`.

### Also in this line (0.1.118G��0.1.137)

- Chat-first PC agent: explore, folder catalog, Desktop / Documents / Full PC grants
- Create / delete project from Chat (TDZ delete bug fixed)
- File vs folder disk intents, Pictures / Desktop path resolve
- Greenfield product planning (0.1.137)

Download: [Releases](https://github.com/DrMeji/Ark/releases)
