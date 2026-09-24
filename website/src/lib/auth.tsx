import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '../lib/supabase';

export type SiteProfile = {
  nova_id: string | null;
  display_name: string | null;
};

type AuthCtx = {
  user: User | null;
  session: Session | null;
  profile: SiteProfile | null;
  loading: boolean;
  configured: boolean;
  signInOpen: boolean;
  profileOpen: boolean;
  openSignIn: () => void;
  closeSignIn: () => void;
  openProfile: () => void;
  closeProfile: () => void;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<SiteProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [signInOpen, setSignInOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const refreshProfile = useCallback(async () => {
    if (!supabase || !user) {
      setProfile(null);
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('ark_id, display_name')
      .eq('id', user.id)
      .maybeSingle();
    setProfile(
      data
        ? { nova_id: data.nova_id ?? null, display_name: data.display_name ?? null }
        : { nova_id: null, display_name: null },
    );
  }, [user]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setUser(next?.user ?? null);
      if (!next) {
        setProfile(null);
        setProfileOpen(false);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const openSignIn = useCallback(() => {
    setProfileOpen(false);
    setSignInOpen(true);
  }, []);
  const closeSignIn = useCallback(() => setSignInOpen(false), []);
  const openProfile = useCallback(() => {
    setSignInOpen(false);
    setProfileOpen(true);
  }, []);
  const closeProfile = useCallback(() => setProfileOpen(false), []);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setProfileOpen(false);
  }, []);

  const value = useMemo(
    () => ({
      user,
      session,
      profile,
      loading,
      configured: supabaseConfigured,
      signInOpen,
      profileOpen,
      openSignIn,
      closeSignIn,
      openProfile,
      closeProfile,
      refreshProfile,
      signOut,
    }),
    [
      user,
      session,
      profile,
      loading,
      signInOpen,
      profileOpen,
      openSignIn,
      closeSignIn,
      openProfile,
      closeProfile,
      refreshProfile,
      signOut,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
