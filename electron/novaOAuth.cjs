/**
 * Plugin OAuth helpers for Electron.
 * Supports GitHub device flow when NOVA_GITHUB_CLIENT_ID (or prefs) is set,
 * plus a localhost redirect callback for providers that use auth-code flow.
 */

const http = require('http');
const { shell } = require('electron');
const { URL } = require('url');
const novaOAuthConfig = require('./novaOAuthConfig.cjs');

/** @type {http.Server | null} */
let callbackServer = null;

function readClientId(pluginId) {
  const fromFile = novaOAuthConfig.get(pluginId);
  if (fromFile) return fromFile;
  const envMap = {
    github: process.env.NOVA_GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID,
    google: process.env.NOVA_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
    notion: process.env.NOVA_NOTION_CLIENT_ID || process.env.NOTION_CLIENT_ID,
  };
  return (envMap[pluginId] || '').trim() || null;
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error_description || data.error || data.message || `HTTP ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : 'OAuth request failed');
  }
  return data;
}

/**
 * GitHub device flow — user enters a code at github.com/login/device.
 * Requires a registered OAuth App client id (public; no secret for device flow).
 */
async function startGitHubDeviceFlow() {
  const clientId = readClientId('github');
  if (!clientId) {
    return {
      ok: false,
      needsConfig: true,
      message:
        'Set NOVA_GITHUB_CLIENT_ID to your GitHub OAuth App client id to use one-click device login. Paste a PAT as a fallback.',
    };
  }

  const start = await fetchJson('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'NOVA-Desktop',
    },
    body: JSON.stringify({
      client_id: clientId,
      scope: 'read:user repo',
    }),
  });

  const deviceCode = start.device_code;
  const userCode = start.user_code;
  const interval = Math.max(5, Number(start.interval) || 5) * 1000;
  const verificationUri = start.verification_uri || 'https://github.com/login/device';
  const expiresIn = Number(start.expires_in) || 900;

  if (verificationUri) {
    try {
      await shell.openExternal(verificationUri);
    } catch {
      /* ignore */
    }
  }

  const deadline = Date.now() + expiresIn * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));
    try {
      const tokenRes = await fetchJson('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'NOVA-Desktop',
        },
        body: JSON.stringify({
          client_id: clientId,
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      });
      if (tokenRes.access_token) {
        let label = 'GitHub';
        try {
          const me = await fetchJson('https://api.github.com/user', {
            headers: {
              Authorization: `Bearer ${tokenRes.access_token}`,
              Accept: 'application/vnd.github+json',
              'User-Agent': 'NOVA-Desktop',
            },
          });
          label = me.login || label;
        } catch {
          /* keep default */
        }
        return {
          ok: true,
          accessToken: tokenRes.access_token,
          accountLabel: label,
          provider: 'github',
          mode: 'device',
        };
      }
      if (tokenRes.error === 'authorization_pending' || tokenRes.error === 'slow_down') {
        continue;
      }
      if (tokenRes.error === 'expired_token' || tokenRes.error === 'access_denied') {
        return { ok: false, message: tokenRes.error_description || tokenRes.error };
      }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Device flow failed' };
    }
  }
  return { ok: false, message: 'GitHub device login timed out. Try again or paste a PAT.' };
}

/**
 * Generic localhost callback for auth-code providers.
 * Opens authorizeUrl; waits for ?code= on http://127.0.0.1:port/callback
 */
function startLocalCallback({ authorizeUrl, exchange }) {
  return new Promise((resolve) => {
    if (callbackServer) {
      try {
        callbackServer.close();
      } catch {
        /* ignore */
      }
      callbackServer = null;
    }

    const server = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url || '/', 'http://127.0.0.1');
        if (u.pathname !== '/callback') {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const code = u.searchParams.get('code');
        const err = u.searchParams.get('error');
        if (err) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><h2>NOVA</h2><p>Authorization denied. You can close this window.</p></body></html>');
          cleanup();
          resolve({ ok: false, message: err });
          return;
        }
        if (!code) {
          res.writeHead(400);
          res.end('Missing code');
          return;
        }
        const tokens = await exchange(code, `http://127.0.0.1:${server.address().port}/callback`);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>NOVA connected</h2><p>You can close this window and return to NOVA.</p></body></html>');
        cleanup();
        resolve({ ok: true, ...tokens });
      } catch (e) {
        res.writeHead(500);
        res.end('OAuth error');
        cleanup();
        resolve({ ok: false, message: e instanceof Error ? e.message : 'OAuth failed' });
      }
    });

    function cleanup() {
      try {
        server.close();
      } catch {
        /* ignore */
      }
      if (callbackServer === server) callbackServer = null;
    }

    const preferred = require('./novaConfig.cjs').OAUTH_CALLBACK_PORT;
    const onListening = async () => {
      callbackServer = server;
      const port = server.address().port;
      const url = authorizeUrl.replace(/\{PORT\}/g, String(port));
      try {
        await shell.openExternal(url);
      } catch (err) {
        cleanup();
        resolve({ ok: false, message: err instanceof Error ? err.message : 'Could not open browser' });
      }
    };
    server.once('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        server.listen(0, '127.0.0.1', onListening);
        return;
      }
      cleanup();
      resolve({ ok: false, message: err instanceof Error ? err.message : 'OAuth listen failed' });
    });
    server.listen(preferred, '127.0.0.1', onListening);

    setTimeout(() => {
      cleanup();
      resolve({ ok: false, message: 'OAuth timed out. Try again or paste a token.' });
    }, 5 * 60 * 1000);
  });
}

async function startPluginOAuth(pluginId) {
  const id = String(pluginId || '');

  if (id === 'github') {
    return startGitHubDeviceFlow();
  }

  if (id === 'google' || id === 'gmail' || id === 'gdrive' || id === 'gcal') {
    const clientId = readClientId('google');
    if (!clientId) {
      return {
        ok: false,
        needsConfig: true,
        message:
          'Set NOVA_GOOGLE_CLIENT_ID for browser OAuth. Until then, use Google OAuth Playground and paste the access token.',
      };
    }
    const scopes = [
      'openid',
      'email',
      'https://www.googleapis.com/auth/gmail.readonly',
    ];
    if (id === 'gdrive' || id === 'google') {
      scopes.push('https://www.googleapis.com/auth/drive.readonly');
    }
    if (id === 'gcal' || id === 'google') {
      scopes.push('https://www.googleapis.com/auth/calendar.readonly');
    }
    if (id === 'gmail' || id === 'google') {
      // already has gmail.readonly
    }
    const scopeParam = encodeURIComponent(scopes.join(' '));
    return startLocalCallback({
      authorizeUrl:
        `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}`
        + '&response_type=code&redirect_uri=http%3A%2F%2F127.0.0.1%3A{PORT}%2Fcallback'
        + `&scope=${scopeParam}`
        + '&access_type=offline&prompt=consent',
      exchange: async (code, redirectUri) => {
        // Public clients still need a client secret for some Google setups;
        // if NOVA_GOOGLE_CLIENT_SECRET is missing, return the code for manual exchange.
        const secret = process.env.NOVA_GOOGLE_CLIENT_SECRET || '';
        if (!secret) {
          return {
            accessToken: '',
            accountLabel: 'Google',
            message: `Got auth code but NOVA_GOOGLE_CLIENT_SECRET is not set. Code: ${code}`,
            ok: false,
          };
        }
        const body = new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: secret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        });
        const data = await fetchJson('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'NOVA-Desktop' },
          body: body.toString(),
        });
        return {
          accessToken: data.access_token,
          accountLabel: 'Google',
          refreshToken: data.refresh_token,
        };
      },
    });
  }

  return {
    ok: false,
    needsConfig: true,
    message:
      'Browser OAuth for this plugin needs a registered client id. Open the provider site and paste a token for now.',
  };
}

function oauthConfigStatus() {
  return {
    github: Boolean(readClientId('github')),
    google: Boolean(readClientId('google')),
    notion: Boolean(readClientId('notion')),
    stored: novaOAuthConfig.load(),
  };
}

module.exports = {
  startPluginOAuth,
  oauthConfigStatus,
  readClientId,
  setClientId: (pluginId, clientId) => novaOAuthConfig.set(pluginId, clientId),
  loadClientIds: () => novaOAuthConfig.load(),
};
