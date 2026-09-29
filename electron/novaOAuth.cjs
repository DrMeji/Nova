/**
 * Plugin OAuth helpers for Electron.
 * GitHub: prefer browser Authorize (PKCE + localhost) like ChatGPT;
 * fall back to Device Flow (shows user_code in the app). Cancel supported.
 */

const http = require('http');
const crypto = require('crypto');
const { shell, BrowserWindow } = require('electron');
const { URL } = require('url');
const novaOAuthConfig = require('./novaOAuthConfig.cjs');

/** @type {http.Server | null} */
let callbackServer = null;
let oauthCancelled = false;
let oauthTimeout = null;
/** @type {ReturnType<typeof setInterval> | null} */
let oauthCancelPoll = null;

function resetOAuthCancel() {
  oauthCancelled = false;
}

function clearOAuthTimers() {
  if (oauthTimeout) {
    try { clearTimeout(oauthTimeout); } catch { /* ignore */ }
    oauthTimeout = null;
  }
  if (oauthCancelPoll) {
    try { clearInterval(oauthCancelPoll); } catch { /* ignore */ }
    oauthCancelPoll = null;
  }
}

function cancelPluginOAuth() {
  oauthCancelled = true;
  clearOAuthTimers();
  if (callbackServer) {
    try { callbackServer.close(); } catch { /* ignore */ }
    callbackServer = null;
  }
  broadcastOAuthProgress({ cancelled: true });
  return { ok: true };
}

function broadcastOAuthProgress(payload) {
  try {
    for (const w of BrowserWindow.getAllWindows()) {
      if (w.isDestroyed()) continue;
      try {
        w.webContents.send('NOVA:plugin-oauth-progress', payload);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

function readClientId(pluginId) {
  const fromFile = novaOAuthConfig.get(pluginId);
  if (fromFile) return fromFile;
  const envMap = {
    github:
      process.env.NOVA_GITHUB_CLIENT_ID
      || process.env.GITHUB_CLIENT_ID
      || process.env.ARK_GITHUB_CLIENT_ID,
    google:
      process.env.NOVA_GOOGLE_CLIENT_ID
      || process.env.GOOGLE_CLIENT_ID
      || process.env.ARK_GOOGLE_CLIENT_ID,
    notion: process.env.NOVA_NOTION_CLIENT_ID || process.env.NOTION_CLIENT_ID,
  };
  return (envMap[pluginId] || '').trim() || null;
}

function readGithubClientSecret() {
  const fromFile = novaOAuthConfig.get('github_secret');
  if (fromFile) return fromFile;
  return (
    process.env.NOVA_GITHUB_CLIENT_SECRET
    || process.env.GITHUB_CLIENT_SECRET
    || process.env.ARK_GITHUB_CLIENT_SECRET
    || ''
  ).trim() || null;
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

function isGithubPat(value) {
  const t = String(value || '').trim();
  return /^(ghp_|github_pat_|gho_|ghu_|ghs_|ghr_)/i.test(t);
}

function looksLikeOauthClientId(value) {
  const t = String(value || '').trim();
  if (!t || isGithubPat(t)) return false;
  if (t.length < 10 || t.length > 80) return false;
  if (/\s/.test(t)) return false;
  return true;
}

function pkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function authWithGithubToken(accessToken) {
  const token = String(accessToken || '').trim();
  if (!token) {
    return { ok: false, message: 'Missing GitHub token.' };
  }
  try {
    const me = await fetchJson('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'NOVA-Desktop',
      },
    });
    const label = me.login || 'GitHub';
    return {
      ok: true,
      accessToken: token,
      accountLabel: label,
      githubId: me.id != null ? String(me.id) : label,
      avatarUrl: me.avatar_url || null,
      name: me.name || null,
      provider: 'github',
      mode: 'token',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Token login failed';
    return {
      ok: false,
      message:
        /bad credentials|401|unauthorized/i.test(msg)
          ? 'That GitHub token was rejected. Create a fine-grained or classic PAT with repo access, or use an OAuth App Client ID.'
          : msg,
    };
  }
}

/**
 * ChatGPT-style browser authorize (Authorize NOVA → redirect to localhost).
 * Uses PKCE so a client secret is optional; secret used when present.
 */
async function startGitHubBrowserFlow(clientId) {
  const { verifier, challenge } = pkcePair();
  const state = crypto.randomBytes(16).toString('hex');
  const secret = readGithubClientSecret();

  broadcastOAuthProgress({
    mode: 'browser',
    message: 'Approve NOVA in your browser…',
  });

  const result = await startLocalCallback({
    authorizeUrl:
      `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}`
      + '&redirect_uri=http%3A%2F%2F127.0.0.1%3A{PORT}%2Fcallback'
      + `&scope=${encodeURIComponent('read:user repo')}`
      + `&state=${encodeURIComponent(state)}`
      + `&code_challenge=${encodeURIComponent(challenge)}`
      + '&code_challenge_method=S256',
    expectedState: state,
    exchange: async (code, redirectUri) => {
      const body = {
        client_id: clientId,
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      };
      if (secret) body.client_secret = secret;
      const data = await fetchJson('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'NOVA-Desktop',
        },
        body: JSON.stringify(body),
      });
      if (!data.access_token) {
        throw new Error(data.error_description || data.error || 'No access token from GitHub');
      }
      return authWithGithubToken(data.access_token);
    },
  });

  return result;
}

/**
 * Device flow fallback — shows a short user_code in the app (and opens GitHub).
 */
async function startGitHubDeviceFlow(clientId) {
  let start;
  try {
    start = await fetchJson('https://github.com/login/device/code', {
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Device flow failed';
    if (/not found|404/i.test(msg)) {
      return {
        ok: false,
        needsConfig: true,
        message:
          'GitHub did not recognize that Client ID. Confirm the OAuth App exists and Device Flow is enabled.',
      };
    }
    return { ok: false, message: msg };
  }

  const deviceCode = start.device_code;
  const userCode = start.user_code;
  const interval = Math.max(5, Number(start.interval) || 5) * 1000;
  const verificationUri = start.verification_uri || 'https://github.com/login/device';
  const expiresIn = Number(start.expires_in) || 900;

  if (!deviceCode || !userCode) {
    return {
      ok: false,
      needsConfig: true,
      message:
        'GitHub did not start device login. Confirm Device Flow is enabled on your OAuth App.',
    };
  }

  broadcastOAuthProgress({
    mode: 'device',
    userCode,
    verificationUri,
    message: 'Enter this code on GitHub, then Authorize.',
  });

  try {
    const openUrl = start.verification_uri_complete
      || `${verificationUri}${verificationUri.includes('?') ? '&' : '?'}user_code=${encodeURIComponent(userCode)}`;
    await shell.openExternal(openUrl);
  } catch {
    /* ignore */
  }

  const deadline = Date.now() + expiresIn * 1000;
  while (Date.now() < deadline) {
    if (oauthCancelled) {
      return { ok: false, cancelled: true, message: 'Cancelled.' };
    }
    await new Promise((r) => setTimeout(r, interval));
    if (oauthCancelled) {
      return { ok: false, cancelled: true, message: 'Cancelled.' };
    }
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
        return authWithGithubToken(tokenRes.access_token);
      }
      if (tokenRes.error === 'authorization_pending' || tokenRes.error === 'slow_down') {
        continue;
      }
      if (tokenRes.error === 'expired_token' || tokenRes.error === 'access_denied') {
        return { ok: false, message: tokenRes.error_description || tokenRes.error };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Device flow failed';
      if (/authorization_pending|slow_down/i.test(msg)) continue;
      return { ok: false, message: msg };
    }
  }
  return { ok: false, message: 'GitHub device login timed out. Try again.' };
}

async function startGitHubOAuth(opts = {}) {
  resetOAuthCancel();
  const override = String(opts.accessToken || opts.clientId || '').trim();
  let clientId = override || readClientId('github');

  if (!clientId) {
    return {
      ok: false,
      needsConfig: true,
      message:
        'Add your GitHub OAuth App Client ID once (publisher setup), or paste a personal access token.',
    };
  }

  if (isGithubPat(clientId)) {
    if (!override) {
      try { novaOAuthConfig.set('github', ''); } catch { /* ignore */ }
    }
    return authWithGithubToken(clientId);
  }

  if (!looksLikeOauthClientId(clientId)) {
    return {
      ok: false,
      needsConfig: true,
      message:
        'That does not look like a GitHub OAuth Client ID. Use the Client ID from your OAuth App, or a personal access token.',
    };
  }

  // Prefer ChatGPT-style Authorize page (browser + localhost callback).
  try {
    const browser = await startGitHubBrowserFlow(clientId);
    if (browser?.ok && browser.accessToken) return browser;
    if (browser?.cancelled) return browser;
    // Fall through to device flow when redirect URI isn't registered / PKCE rejected.
  } catch {
    /* device fallback */
  }

  if (oauthCancelled) {
    return { ok: false, cancelled: true, message: 'Cancelled.' };
  }

  resetOAuthCancel();
  return startGitHubDeviceFlow(clientId);
}

/**
 * Generic localhost callback for auth-code providers.
 * Opens authorizeUrl; waits for ?code= on http://127.0.0.1:port/callback
 */
function startLocalCallback({ authorizeUrl, exchange, expectedState }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearOAuthTimers();
      resolve(value);
    };

    if (callbackServer) {
      try { callbackServer.close(); } catch { /* ignore */ }
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
        if (expectedState) {
          const got = u.searchParams.get('state');
          if (got && got !== expectedState) {
            res.writeHead(400);
            res.end('Invalid state');
            cleanup();
            finish({ ok: false, message: 'OAuth state mismatch. Try again.' });
            return;
          }
        }
        const code = u.searchParams.get('code');
        const err = u.searchParams.get('error');
        if (err) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><h2>NOVA</h2><p>Authorization denied. You can close this window.</p></body></html>');
          cleanup();
          finish({ ok: false, message: err, cancelled: err === 'access_denied' });
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
        finish(tokens?.ok === false ? tokens : { ok: true, ...tokens });
      } catch (e) {
        res.writeHead(500);
        res.end('OAuth error');
        cleanup();
        finish({ ok: false, message: e instanceof Error ? e.message : 'OAuth failed' });
      }
    });

    function cleanup() {
      try { server.close(); } catch { /* ignore */ }
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
        finish({ ok: false, message: err instanceof Error ? err.message : 'Could not open browser' });
      }
    };
    server.once('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        server.listen(0, '127.0.0.1', onListening);
        return;
      }
      cleanup();
      finish({ ok: false, message: err instanceof Error ? err.message : 'OAuth listen failed' });
    });
    server.listen(preferred, '127.0.0.1', onListening);

    oauthCancelPoll = setInterval(() => {
      if (!oauthCancelled) return;
      cleanup();
      finish({ ok: false, cancelled: true, message: 'Cancelled.' });
    }, 250);

    oauthTimeout = setTimeout(() => {
      cleanup();
      finish({ ok: false, message: 'OAuth timed out. Try again.' });
    }, 5 * 60 * 1000);
  });
}

async function startPluginOAuth(pluginId, opts = {}) {
  const id = String(pluginId || '');

  if (id === 'github') {
    return startGitHubOAuth(opts || {});
  }

  if (id === 'google' || id === 'gmail' || id === 'gdrive' || id === 'gcal') {
    resetOAuthCancel();
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
    const scopeParam = encodeURIComponent(scopes.join(' '));
    return startLocalCallback({
      authorizeUrl:
        `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}`
        + '&response_type=code&redirect_uri=http%3A%2F%2F127.0.0.1%3A{PORT}%2Fcallback'
        + `&scope=${scopeParam}`
        + '&access_type=offline&prompt=consent',
      exchange: async (code, redirectUri) => {
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
  cancelPluginOAuth,
  oauthConfigStatus,
  readClientId,
  setClientId: (pluginId, clientId) => novaOAuthConfig.set(pluginId, clientId),
  loadClientIds: () => novaOAuthConfig.load(),
};
