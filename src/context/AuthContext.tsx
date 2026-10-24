import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import '@/lib/authFlags';
import type { Session, User } from '@supabase/supabase-js';
import {
  supabase,
  clearAuthLocalFallback,
  isSupabaseConfigured,
} from '@/lib/supabase';
import type { Profile, UserSettings } from '@/types';
import {
  clearSetupCompleted,
  ensureFirstRunGate,
  isSetupCompleted,
  markSetupCompleted,
  prepareLaunchForTesting,
} from '@/lib/setup';
import { hydrateProviderApiKeys, getLocalPrefs, setLocalPrefs } from '@/lib/localPrefs';
import {
  clearGitHubSession,
  formatGitHubIdentity,
  loadGitHubSession,
  saveGitHubSession,
  type GitHubSession,
} from '@/lib/githubSession';

const BYPASS_KEY = 'NOVA:bypass-enabled';
const GUEST_USER = {
  id: 'guest-local',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'guest@NOVA.local',
  email_confirmed_at: undefined,
  phone: '',
  confirmed_at: undefined,
  last_sign_in_at: undefined,
  app_metadata: {},
  user_metadata: { display_name: 'Guest' },
  identities: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  is_anonymous: true,
} as unknown as User;

function guestProfile(): Profile {
  return {
    id: 'guest-local',
    display_name: 'Guest',
    avatar_url: null,
    nova_id: 'guest',
    onboarding_completed: isSetupCompleted(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function githubUserFromSession(s: GitHubSession): User {
  return {
    id: `github:${s.githubId}`,
    aud: 'authenticated',
    role: 'authenticated',
    email: `${s.login}@users.noreply.github.com`,
    email_confirmed_at: new Date().toISOString(),
    phone: '',
    confirmed_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: 'github', providers: ['github'] },
    user_metadata: {
      display_name: s.name || s.login,
      user_name: s.login,
      avatar_url: s.avatarUrl || undefined,
      github_id: s.githubId,
    },
    identities: [],
    created_at: s.at,
    updated_at: new Date().toISOString(),
    is_anonymous: false,
  } as unknown as User;
}

function githubProfileFromSession(s: GitHubSession): Profile {
  return {
    id: `github:${s.githubId}`,
    display_name: s.name || s.login,
    avatar_url: s.avatarUrl,
    nova_id: formatGitHubIdentity(s.login),
    onboarding_completed: isSetupCompleted(),
    created_at: s.at,
    updated_at: new Date().toISOString(),
  };
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  settings: UserSettings | null;
  loading: boolean;
  bypass: boolean;
  /** Primary gate — browser GitHub device/OAuth flow (or PAT). */
  signInWithGitHub: (opts?: { accessToken?: string }) => Promise<{ error: string | null; needsConfig?: boolean; cancelled?: boolean }>;
  /** @deprecated Email/password removed — use signInWithGitHub. */
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  /** @deprecated Email/password removed — use signInWithGitHub. */
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: string | null }>;
  /** @deprecated Email/password removed. */
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  deleteAccountPermanently: () => Promise<{ ok: true } | { ok: false; error: string }>;
  bypassLogin: (options?: { skipSetup?: boolean }) => void;
  refreshProfile: () => Promise<void>;
  updateSettings: (updates: Partial<UserSettings>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  prepareLaunchForTesting();

  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [bypass, setBypass] = useState(false);
  const [loading, setLoading] = useState(true);
  const [packaged, setPackaged] = useState(false);
  const bypassRef = useRef(false);
  bypassRef.current = bypass;
  const githubModeRef = useRef(false);

  const applyGitHubSession = (s: GitHubSession) => {
    githubModeRef.current = true;
    setSession(null);
    setUser(githubUserFromSession(s));
    setProfile(githubProfileFromSession(s));
    setSettings(null);
    setBypass(false);
    bypassRef.current = false;
    try {
      const prefs = getLocalPrefs();
      const display = s.name || s.login;
      if (display && (!prefs.displayName || prefs.displayName === 'Guest')) {
        setLocalPrefs({ displayName: display });
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      await ensureFirstRunGate();
      if (cancelled) return;

      try {
        await hydrateProviderApiKeys();
      } catch { /* ignore */ }

      try {
        const meta = await window.novaDesktop?.appMeta?.();
        if (!cancelled) setPackaged(Boolean(meta?.isPackaged));
      } catch { /* ignore */ }

      // GitHub session is the primary gate — no Supabase required.
      const gh = await loadGitHubSession();
      if (cancelled) return;
      if (gh) {
        applyGitHubSession(gh);
        setLoading(false);
        return;
      }

      // Never auto-restore guest bypass across restarts.
      localStorage.removeItem(BYPASS_KEY);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signInWithGitHub = async (opts?: { accessToken?: string }) => {
    await ensureFirstRunGate();
    intentionalClear();
    if (!window.novaDesktop?.pluginOAuthStart) {
      return { error: 'GitHub sign-in needs the NOVA desktop app.' };
    }
    try {
      const tokenOverride = String(opts?.accessToken || '').trim();
      if (!tokenOverride) {
        const status = await window.novaDesktop.pluginOAuthStatus?.();
        if (status && status.github === false) {
          return {
            error:
              'Add your GitHub OAuth Client ID or a personal access token below, then try again.',
            needsConfig: true,
          };
        }
      }
      const res = await window.novaDesktop.pluginOAuthStart(
        'github',
        tokenOverride ? { accessToken: tokenOverride } : undefined,
      );
          if (!res?.ok || !res.accessToken) {
        if (res?.cancelled) {
          return { error: null, cancelled: true };
        }
        return {
          error: res?.message
            || (res?.needsConfig
              ? 'Add your GitHub OAuth Client ID or a personal access token below, then try again.'
              : 'GitHub sign-in was cancelled or failed.'),
          needsConfig: Boolean(res?.needsConfig),
        };
      }
      const login = String(res.accountLabel || '').trim();
      const githubId = String(res.githubId || '').trim() || login;
      if (!login) {
        return { error: 'GitHub did not return a username. Try again.' };
      }
      const next: GitHubSession = {
        githubId,
        login,
        avatarUrl: res.avatarUrl ?? null,
        name: res.name ?? null,
        at: new Date().toISOString(),
      };
      await saveGitHubSession(next, res.accessToken);
      applyGitHubSession(next);
      localStorage.setItem('NOVA:last-auth', JSON.stringify({
        method: 'github',
        login,
        at: new Date().toISOString(),
      }));
      setLoading(false);
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'GitHub sign-in failed.' };
    }
  };

  function intentionalClear() {
    /* marker for future spurious-sign-out guards */
  }

  const signIn = async () => ({
    error: 'Email sign-in is retired. Use Continue with GitHub.',
  });

  const signUp = async () => ({
    error: 'Email sign-up is retired. Use Continue with GitHub.',
  });

  const resetPassword = async () => ({
    error: 'Password reset is retired. Sign in with GitHub.',
  });

  const bypassLogin = (options?: { skipSetup?: boolean }) => {
    if (packaged) return;
    localStorage.removeItem(BYPASS_KEY);
    localStorage.setItem('NOVA:last-auth', JSON.stringify({
      method: 'bypass',
      at: new Date().toISOString(),
    }));
    if (options?.skipSetup) {
      markSetupCompleted();
    } else {
      clearSetupCompleted();
    }
    githubModeRef.current = false;
    bypassRef.current = true;
    setBypass(true);
    setSession(null);
    setUser(GUEST_USER);
    setProfile(guestProfile());
    setSettings(null);
    setLoading(false);
  };

  const signOut = async () => {
    intentionalClear();
    localStorage.removeItem(BYPASS_KEY);
    clearAuthLocalFallback();
    githubModeRef.current = false;
    setBypass(false);
    setSession(null);
    setUser(null);
    setProfile(null);
    setSettings(null);
    await clearGitHubSession();
    if (isSupabaseConfigured) {
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch { /* ignore */ }
    }
  };

  const deleteAccountPermanently = async () => {
    await signOut();
    return { ok: true as const };
  };

  const refreshProfile = async () => {
    if (user?.id === 'guest-local' || bypass) {
      setProfile(guestProfile());
      return;
    }
    const gh = await loadGitHubSession();
    if (gh) {
      applyGitHubSession(gh);
    }
  };

  const updateSettings = async (_updates: Partial<UserSettings>) => {
    // Local-first GitHub gate — no cloud user_settings until social returns.
  };

  return (
    <AuthContext.Provider value={{
      session,
      user,
      profile,
      settings,
      loading,
      bypass,
      signInWithGitHub,
      signIn,
      signUp,
      resetPassword,
      signOut,
      deleteAccountPermanently,
      bypassLogin,
      refreshProfile,
      updateSettings,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Dev/HMR only — Vite can remount AppContent against a stale AuthContext module. */
const HMR_GUEST_AUTH: AuthContextValue = {
  session: null,
  user: GUEST_USER,
  profile: guestProfile(),
  settings: null,
  loading: false,
  bypass: true,
  signInWithGitHub: async () => ({ error: 'HMR auth fallback — reload' }),
  signIn: async () => ({ error: 'HMR auth fallback — reload' }),
  signUp: async () => ({ error: 'HMR auth fallback — reload' }),
  resetPassword: async () => ({ error: 'HMR auth fallback — reload' }),
  signOut: async () => {},
  deleteAccountPermanently: async () => ({ ok: true }),
  bypassLogin: () => {},
  refreshProfile: async () => {},
  updateSettings: async () => {},
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Vite HMR: AuthProvider still wraps the tree, but AppContent imported a different
    // AuthContext instance → context reads undefined and white-screens the shell.
    if (import.meta.env.DEV) {
      console.warn('[NOVA] useAuth: AuthProvider context missing (often HMR). Guest fallback.');
      return HMR_GUEST_AUTH;
    }
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    import.meta.hot?.invalidate();
  });
}
