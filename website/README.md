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

## Deploy later (no custom domain yet)

Deploy the `website/` folder to Vercel/Netlify. Then add that `*.vercel.app` origin to Supabase redirect URLs.

## Download CTA

Buttons point at the **public** installer feed only:

https://github.com/DrMeji/Ark/releases/latest

Do not link the private NOVA-Source repo from this site.
