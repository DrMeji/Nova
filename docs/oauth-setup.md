# Plugin OAuth (one-click connect)

NOVA can open GitHub device login / Google browser OAuth when you paste public client IDs.

## Where to paste

**Settings → Providers → Plugin OAuth client IDs**

Or environment variables before launch:

```
set ARK_GITHUB_CLIENT_ID=...
set ARK_GOOGLE_CLIENT_ID=...
set ARK_GOOGLE_CLIENT_SECRET=...
```

## Create the apps (you do this once)

### GitHub

1. https://github.com/settings/developers → **OAuth Apps** → New OAuth App  
2. Homepage: `https://github.com/DrMeji/Nova`  
3. Callback URL: `http://127.0.0.1` (device flow does not need a real callback)  
4. Enable **Device Flow**  
5. Copy the **Client ID** into NOVA (public; no secret needed for device flow)

### Google

1. https://console.cloud.google.com/apis/credentials → Create OAuth client (Desktop or Web)  
2. Add redirect `http://127.0.0.1:17887/oauth/callback` (NOVA localhost bridge)  
3. Paste Client ID (+ secret only in env, never in git)

Token paste still works without OAuth apps.
