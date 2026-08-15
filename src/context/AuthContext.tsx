import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile, UserSettings } from '@/types';
import {
  clearSetupCompleted,
  isSetupCompleted,
  markSetupCompleted,
  prepareLaunchForTesting,
} from '@/lib/setup';
import { hydrateProviderApiKeys } from '@/lib/localPrefs';

// Guest identity used when login is bypassed (e.g. desktop quick-launch).
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
  signOut: () => Promise<void>;
  /** Guest login. skipSetup: true jumps straight into the app; false runs first-run optimize. */
  bypassLogin: (options?: { skipSetup?: boolean }) => void;
  refreshProfile: () => Promise<void>;
  updateSettings: (updates: Partial<UserSettings>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Optional test helper — only clears guest when FORCE_AUTH_ON_LAUNCH is true.
  prepareLaunchForTesting();

  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [bypass, setBypass] = useState(() => isBypassEnabled());
  const [loading, setLoading] = useState(true);

  const loadProfileAndSettings = async (userId: string) => {
    const [profileRes, settingsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
    ]);
    if (profileRes.data) {
      const p = profileRes.data as Profile;
      // Local first run gate wins until setup is marked complete.
      setProfile({ ...p, onboarding_completed: isSetupCompleted() && p.onboarding_completed });
    } else {
      // New account with no profile row yet: still run optimize once.
      setProfile({
        id: userId,
        display_name: null,
        avatar_url: null,
        onboarding_completed: isSetupCompleted(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    if (settingsRes.data) setSettings(settingsRes.data as UserSettings);
  };

  useEffect(() => {
    void hydrateProviderApiKeys();

    // After prepareLaunchForTesting(), bypass is cleared so we always hit AuthScreen.
    if (isBypassEnabled()) {
      setBypass(true);
      setUser(GUEST_USER);
      setProfile(guestProfile());
      setSettings(null);
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        loadProfileAndSettings(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        (async () => {
          await loadProfileAndSettings(newSession.user.id);
          setLoading(false);
        })();
      } else {
        setProfile(null);
        setSettings(null);
        setLoading(false);
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      localStorage.setItem('ark:last-auth', JSON.stringify({
        method: 'supabase',
        email,
        at: new Date().toISOString(),
      }));
    }
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    return { error: error?.message ?? null };
  };

  const bypassLogin = (options?: { skipSetup?: boolean }) => {
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
      setProfile(guestProfile());
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
    <AuthContext.Provider value={{ session, user, profile, settings, loading, bypass, signIn, signUp, signOut, bypassLogin, refreshProfile, updateSettings }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
