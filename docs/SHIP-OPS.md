# Ship / retail ops (#26–#29)

Code paths are ready; these need a human + purchased cert / deploy.

## #26 Authenticode

1. Buy OV/EV code-signing cert (see `build/signing.env.example`).
2. Set `CSC_LINK` + `CSC_KEY_PASSWORD` locally and as GitHub Actions secrets.
3. Build Setup → `Get-AuthenticodeSignature .\release\NOVA-Setup.exe` → Status **Valid**.
4. In-app: Settings → Updates → check this install’s signature (packaged only).

## #27 Packaged smoke (after Setup)

```bash
# Dir build
npm run electron:build:dir
npm run smoke:packaged

# Or after running NOVA-Setup.exe once:
set NOVA_SMOKE_EXE=%LOCALAPPDATA%\Programs\NOVA\NOVA.exe
npm run smoke:packaged
```

Expect Auth / Welcome UI, not a blank root.

## #28 Update from previous version

1. Install an older GitHub Release Setup.
2. Publish newer tag with `NOVA-Setup.exe`, `latest.yml`, and `.blockmap`.
3. Settings → Updates → Check → download/install succeeds.

## #29 Website + password reset origin

1. Deploy `website/` (see `website/README.md`).
2. Set `VITE_NOVA_WEBSITE_ORIGIN=https://YOUR-SITE` in `.env.production` and rebuild desktop.
3. Supabase Auth redirect allowlist includes `/account/reset`.
4. Forgot password → inbox → reset page → sign in on desktop.

Also tracked in `docs/SUPABASE-APPLY-CHECKLIST.md`.
