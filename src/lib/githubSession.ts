/**
 * Local GitHub identity session — replaces Supabase email/password as the app gate.
 * Token lives in the OS vault (plugin:github); profile metadata in auth storage / localStorage.
 */

import { clearPluginToken, getPluginToken, setPluginToken } from '@/lib/localPrefs';
import { loadPluginState, upsertPluginRuntime } from '@/lib/plugins';

export type GitHubSession = {
  githubId: string;
  login: string;
  avatarUrl: string | null;
  name: string | null;
  at: string;
};

const SESSION_KEY = 'NOVA:github-session';
const AUTH_STORE_KEY = 'nova-github-session-v1';

function parseSession(raw: string | null | undefined): GitHubSession | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<GitHubSession>;
    const login = String(data.login || '').trim();
    const githubId = String(data.githubId || '').trim();
    if (!login || !githubId) return null;
    return {
      githubId,
      login,
      avatarUrl: data.avatarUrl ? String(data.avatarUrl) : null,
      name: data.name ? String(data.name) : null,
      at: String(data.at || new Date().toISOString()),
    };
  } catch {
    return null;
  }
}

export async function loadGitHubSession(): Promise<GitHubSession | null> {
  try {
    const fromStore = await window.novaDesktop?.authStorageGet?.(AUTH_STORE_KEY);
    const parsed = parseSession(fromStore);
    if (parsed) return parsed;
  } catch { /* fall through */ }
  try {
    return parseSession(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

export async function saveGitHubSession(session: GitHubSession, accessToken?: string): Promise<void> {
  const payload = JSON.stringify(session);
  try {
    localStorage.setItem(SESSION_KEY, payload);
  } catch { /* ignore */ }
  try {
    await window.novaDesktop?.authStorageSet?.(AUTH_STORE_KEY, payload);
  } catch { /* ignore */ }

  if (accessToken) {
    try {
      setPluginToken('github', accessToken);
      const map = loadPluginState();
      upsertPluginRuntime(map, 'github', {
        installed: true,
        connected: true,
        enabledInChat: true,
        accountLabel: session.login,
        permissions: ['list', 'read', 'search', 'write'],
      });
    } catch { /* ignore */ }
  }
  window.dispatchEvent(new Event('NOVA:github-session-changed'));
  window.dispatchEvent(new Event('NOVA:plugins-changed'));
}

export async function clearGitHubSession(): Promise<void> {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch { /* ignore */ }
  try {
    await window.novaDesktop?.authStorageRemove?.(AUTH_STORE_KEY);
  } catch { /* ignore */ }
  try {
    clearPluginToken('github');
    const map = loadPluginState();
    upsertPluginRuntime(map, 'github', {
      connected: false,
      enabledInChat: false,
      accountLabel: undefined,
    });
  } catch { /* ignore */ }
  window.dispatchEvent(new Event('NOVA:github-session-changed'));
  window.dispatchEvent(new Event('NOVA:plugins-changed'));
}

/** True when auth already connected GitHub (skip second Connect GitHub prompts). */
export function hasGitHubVaultToken(): boolean {
  return Boolean(String(getPluginToken('github') || '').trim());
}

export function formatGitHubIdentity(login: string): string {
  const t = String(login || '').trim().replace(/^@/, '');
  return t ? `@${t}` : '';
}
