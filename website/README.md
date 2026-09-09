# NOVA website

Public marketing + account-help site for NOVA (separate from the desktop Electron app).

## Preview locally

```bash
cd website
npm install
npm run dev
```

Open **http://localhost:5180**

Use the sun/moon control in the header to switch **light** and **dark** mode (saved in this browser).

## Password reset (optional)

1. Copy `.env.example` → `.env.local`
2. Fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (same project as the desktop app)
3. In Supabase → Authentication → URL configuration, add:
   - `http://localhost:5180/**`
   - Site URL can stay the desktop deep-link for now; redirect allow-list must include `/account/reset`
4. Restart `npm run dev`

Without env keys, the site still runs; forgot-password shows a clear “not configured” message.

## Deploy (production password reset)

1. Deploy `website/` to Vercel/Netlify.
2. Set website env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
3. Supabase → Authentication → URL configuration — add:
   - `https://YOUR-SITE/account/reset`
   - `https://YOUR-SITE/**`
4. In the **desktop** repo `.env.production`, set:
   ```
   VITE_ARK_WEBSITE_ORIGIN=https://YOUR-SITE
   ```
   then `npm run build` so Forgot password can email a real reset link.
5. Test: Auth screen → Forgot password → inbox → set new password → desktop sign-in.

Full ship checklist (signing, packaged smoke, updates): **`docs/SHIP-OPS.md`**.


Without `VITE_ARK_WEBSITE_ORIGIN`, the desktop app shows a clear “not configured” error and offers local recovery on this PC.

## Download CTA

Buttons point at the **public** installer feed only:

https://github.com/DrMeji/Nova/releases/latest

Do not link the private NOVA-Source repo from this site.
