import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile, UserSettings } from '@/types';
import {
  clearSetupCompleted,
  ensureFirstRunGate,
  isFreshInstallGate,
  isSetupCompleted,
  markSetupCompleted,
  prepareLaunchForTesting,
} from '@/lib/setup';
import { hydrateProviderApiKeys } from '@/lib/localPrefs';
import { ensureArkId, formatArkId, readLocalArkId } from '@/lib/arkUserId';
import { mergeGuestSocialToCloud } from '@/lib/arkSocial';

// Guest identity used when login is bypassed (dev / testing only).
const BYPASS_KEY = 'ark:bypass-enabled';
const GUEST_USER = {
  id: 'guest-local',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'guest@ark.local',
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
    ark_id: readLocalArkId('guest-local'),
    onboarding_completed: isSetupCompleted(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function isBypassEnabled() {
  return localStorage.getItem(BYPASS_KEY) === '1';
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  settings: UserSettings | null;
  loading: boolean;
  bypass: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  /** Guest login. skipSetup: true jumps straight into the app; false runs first-run optimize. */
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

  const loadProfileAndSettings = async (userId: string) => {
    await ensureFirstRunGate();
    const setupDone = isSetupCompleted();
    const [profileRes, settingsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
    ]);
    if (profileRes.data) {
      const p = profileRes.data as Profile;
      const metaName = (await supabase.auth.getUser()).data.user?.user_metadata?.display_name as string | undefined;
      const display = p.display_name || metaName || null;
      setProfile({
        ...p,
        display_name: display,
        // Machine install flag wins — never skip first-run because of a cloud profile.
        onboarding_completed: setupDone,
      });
      const arkId = await ensureArkId(userId);
      setProfile(prev => prev ? { ...prev, ark_id: arkId } : prev);
      if (display || p.avatar_url) {
        try {
          const { getLocalPrefs, setLocalPrefs } = await import('@/lib/localPrefs');
          const prefs = getLocalPrefs();
          const patch: { displayName?: string; avatarDataUrl?: string } = {};
          if (display && (!prefs.displayName || prefs.displayName === 'Guest')) {
            patch.displayName = display;
          }
          if (p.avatar_url && !prefs.avatarDataUrl) {
            patch.avatarDataUrl = p.avatar_url;
          }
          if (Object.keys(patch).length) setLocalPrefs(patch);
        } catch {
          /* ignore */
        }
      }
    } else {
      setProfile({
        id: userId,
        display_name: null,
        avatar_url: null,
        ark_id: await ensureArkId(userId),
        onboarding_completed: setupDone,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    if (settingsRes.data) setSettings(settingsRes.data as UserSettings);
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Must finish before any auth profile load — otherwise signup can skip setup.
      await ensureFirstRunGate();
      if (cancelled) return;

      // Migrate any browser localStorage auth session into Electron userData.
      try {
        if (window.arkDesktop?.authStorageSet) {
          const legacy = Object.keys(localStorage).filter(k => /auth-token/i.test(k));
          for (const k of legacy) {
            const v = localStorage.getItem(k);
            if (!v) continue;
            const existing = await window.arkDesktop.authStorageGet?.(k);
            if (!existing) await window.arkDesktop.authStorageSet(k, v);
            if (k !== 'ark-auth-token') {
              const primary = await window.arkDesktop.authStorageGet?.('ark-auth-token');
              if (!primary) await window.arkDesktop.authStorageSet('ark-auth-token', v);
            }
          }
        }
      } catch {
        /* ignore */
      }

      void hydrateProviderApiKeys();

      let isPackaged = false;
      try {
        const meta = await window.arkDesktop?.appMeta?.();
        isPackaged = Boolean(meta?.isPackaged);
        if (!cancelled) setPackaged(isPackaged);
      } catch {
        /* ignore */
      }

      // Packaged releases never auto-enter as guest.
      if (isPackaged) {
        localStorage.removeItem(BYPASS_KEY);
      }

      // Fresh / reinstalled desktop: wipe leftover sessions so AuthScreen is first.
      if (isPackaged && isFreshInstallGate()) {
        localStorage.removeItem(BYPASS_KEY);
        try {
          await supabase.auth.signOut();
        } catch {
          /* ignore */
        }
        try {
          await window.arkDesktop?.authStorageRemove?.('ark-auth-token');
        } catch {
          /* ignore */
        }
        if (!cancelled) {
          setBypass(false);
          setSession(null);
          setUser(null);
          setProfile(null);
          setSettings(null);
          setLoading(false);
        }
        return;
      }

      if (!isPackaged && isBypassEnabled()) {
        setBypass(true);
        setUser(GUEST_USER);
        setProfile(guestProfile());
        setSettings(null);
        setLoading(false);
        void ensureArkId('guest-local').then(id => {
          if (!cancelled) setProfile(prev => prev ? { ...prev, ark_id: id } : prev);
        });
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        await loadProfileAndSettings(data.session.user.id);
        if (!cancelled) setLoading(false);
      } else {
        setLoading(false);
      }
    })();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        (async () => {
          await ensureFirstRunGate();
          if (cancelled) return;
          await loadProfileAndSettings(newSession.user.id);
          if (!cancelled) setLoading(false);
        })();
      } else {
        setProfile(null);
        setSettings(null);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    await ensureFirstRunGate();
    const wasGuest = isBypassEnabled();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      localStorage.setItem('ark:last-auth', JSON.stringify({
        method: 'supabase',
        email,
        at: new Date().toISOString(),
      }));
      if (wasGuest && data.user?.id) {
        localStorage.removeItem(BYPASS_KEY);
        setBypass(false);
        void mergeGuestSocialToCloud(data.user.id);
      }
    }
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    await ensureFirstRunGate();
    const wasGuest = isBypassEnabled();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      // If the caller does not provide a displayName, we leave user_metadata empty.
      // We'll assign the ARK ID display name after we generate/claim their 7-digit ARK ID.
      options: { data: { display_name: displayName?.trim() || undefined } },
    });
    if (!error && data.user) {
      try {
        const trimmed = displayName?.trim() || null;
        await supabase.from('profiles').upsert({
          id: data.user.id,
          display_name: trimmed,
          // Cloud flag is informational; local install setup still gates the UI.
          onboarding_completed: isSetupCompleted(),
        });
        const arkId = await ensureArkId(data.user.id);

        // Enforce: users do not choose their own username at signup.
        // If no displayName was provided, set display_name to the 7-digit ARK ID.
        if (!trimmed) {
          const auto = formatArkId(arkId);
          await supabase.from('profiles').update({ display_name: auto }).eq('id', data.user.id);
          const { setLocalPrefs } = await import('@/lib/localPrefs');
          setLocalPrefs({ displayName: auto });
        }
      } catch {
        /* profile row may be created by trigger */
      }
      // If a caller provided a displayName, keep the prior behavior.
      if (displayName?.trim()) {
        try {
          const { setLocalPrefs } = await import('@/lib/localPrefs');
          setLocalPrefs({ displayName: displayName.trim() });
        } catch {
          /* ignore */
        }
      }
      if (wasGuest && data.user?.id) {
        localStorage.removeItem(BYPASS_KEY);
        setBypass(false);
        void mergeGuestSocialToCloud(data.user.id);
      }
    }
    return { error: error?.message ?? null };
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'https://github.com/DrMeji/Ark',
    });
    return { error: error?.message ?? null };
  };

  const bypassLogin = (options?: { skipSetup?: boolean }) => {
    if (packaged) return;
    localStorage.setItem(BYPASS_KEY, '1');
    localStorage.setItem('ark:last-auth', JSON.stringify({
      method: 'bypass',
      at: new Date().toISOString(),
    }));
    if (options?.skipSetup) {
      markSetupCompleted();
    } else {
      clearSetupCompleted();
    }
    setBypass(true);
    setSession(null);
    setUser(GUEST_USER);
    setProfile(guestProfile());
    setSettings(null);
    setLoading(false);
    void ensureArkId('guest-local').then(id => {
      setProfile(prev => prev ? { ...prev, ark_id: id } : prev);
    });
  };

  const signOut = async () => {
    localStorage.removeItem(BYPASS_KEY);
    setBypass(false);
    setSession(null);
    setUser(null);
    setProfile(null);
    setSettings(null);
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
  };

  const refreshProfile = async () => {
    if (user?.id === 'guest-local' || bypass) {
      const id = await ensureArkId('guest-local');
      setProfile({ ...guestProfile(), ark_id: id });
      return;
    }
    if (user) await loadProfileAndSettings(user.id);
  };

  const updateSettings = async (updates: Partial<UserSettings>) => {
    if (!user || user.id === 'guest-local') return;
    const { data } = await supabase
      .from('user_settings')
      .update(updates)
      .eq('user_id', user.id)
      .select()
      .maybeSingle();
    if (data) setSettings(data as UserSettings);
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, settings, loading, bypass, signIn, signUp, resetPassword, signOut, bypassLogin, refreshProfile, updateSettings }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
