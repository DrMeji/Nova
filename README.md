# NOVA

Private **source** repository for the NOVA desktop app.

| Repo | Visibility | What is there |
|------|------------|---------------|
| **[DrMeji/Nova](https://github.com/DrMeji/Nova)** | **Public** | README + Windows installers / Releases only |
| **DrMeji/Nova-Source** (this repo) | **Private** | Full application source |

Current source: **v0.1.317** · Private changelog: [docs/CHANGELOG.md](docs/CHANGELOG.md) · Public downloads: [NOVA Releases](https://github.com/DrMeji/Nova/releases)

## Public install (closed beta)

- **Unsigned builds** may show SmartScreen — choose “More info → Run anyway.” Authenticode is optional ops, not a substitute for isolation.
- **Guest** works fully on-device (`guest-local`); no shared cloud chat row without sign-in.
- **Social / Messages / Networking / Call / Image / Video** stay parked on the first public Setup — do not treat half-wired UI as shipped.
- **Keys** live in the OS vault only. Never paste API keys into Chat.
- Before upload: `npm run smoke:public-harden` and `npm run smoke:secrets` must pass.

## Releasing (do not leak source)

1. Develop and commit **only** to `DrMeji/Nova-Source` (private).
2. Tag / run **Release** CI → installer lands on **Nova-Source** first (test that build, or a local bat/dev build).
3. Only after it looks good, re-run Release with **publish_public** (or the helper below) so public **DrMeji/Nova** gets:
   - `NOVA-Setup.exe`
   - `NOVA-Setup.exe.blockmap` (optional)
   - `latest.yml` (optional, for differential updates — leave off until auto-update is intentional)
4. **Never** `git push` source trees, `src/`, `electron/`, or docs internals to `DrMeji/Nova`.

Helper (public only, after a local `release/` build):  
`pwsh scripts/publish-public-release.ps1 -Tag v0.1.xxx -Repos @('DrMeji/Nova')`

See [docs/RELEASING.md](docs/RELEASING.md).

## Website (preview)

Marketing + account-help site lives in [`website/`](website/). It is **not** packaged into the desktop installer.

```bash
npm run website:dev
```

Open http://localhost:5180 — details in [website/README.md](website/README.md).
