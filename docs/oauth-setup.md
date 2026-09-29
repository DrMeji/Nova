# Plugin OAuth (one-click connect)

NOVA can open GitHub device login / Google browser OAuth when you paste public client IDs.

## Where to paste

**Settings → Providers → Plugin OAuth client IDs**

Or environment variables before launch:

```
set NOVA_GITHUB_CLIENT_ID=...
set NOVA_GOOGLE_CLIENT_ID=...
set NOVA_GOOGLE_CLIENT_SECRET=...
```

(Legacy `ARK_GITHUB_CLIENT_ID` / `ARK_GOOGLE_CLIENT_ID` still work.)
## Create the apps (you do this once)

### GitHub

1. https://github.com/settings/developers → **OAuth Apps** → New OAuth App  
2. Homepage: `https://github.com/DrMeji/Nova`  
3. **Callback / Redirect URI (required for one-click Authorize):**  
   `http://127.0.0.1:17887/callback`  
4. Optionally enable **Device Flow** (fallback if browser redirect fails)  
5. Copy the **Client ID** into NOVA once (publisher setup). End users never paste this.

NOVA prefers the ChatGPT-style browser Authorize page. Device Flow is only a fallback and will show the short code inside the app.

### Google

1. https://console.cloud.google.com/apis/credentials → Create OAuth client (Desktop or Web)  
2. Add redirect `http://127.0.0.1:17887/oauth/callback` (NOVA localhost bridge)  
3. Paste Client ID (+ secret only in env, never in git)

Token paste still works without OAuth apps.
