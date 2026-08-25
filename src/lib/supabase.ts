import { createClient, type SupportedStorage } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

/** Set when the production bundle was built without Vite env. UI should show this, not go blank. */
export const supabaseConfigError =
  !supabaseUrl || !supabaseAnonKey
    ? 'ARK was built without Supabase config (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).'
    : null;

/**
 * Prefer Electron userData for the auth session so upgrades keep you signed in.
 * Falls back to localStorage in the browser.
 */
const LOCAL_FALLBACK_PREFIX = 'ark-auth-fallback:';

const arkAuthStorage: SupportedStorage = {
  getItem: (key) => {
    if (window.arkDesktop?.authStorageGet) {
      return window.arkDesktop.authStorageGet(key).then((v) => {
        if (typeof v === 'string') return v;
        try {
          return localStorage.getItem(LOCAL_FALLBACK_PREFIX + key);
        } catch {
          return null;
        }
      });
    }
    return localStorage.getItem(key);
  },
  setItem: (key, value) => {
    if (window.arkDesktop?.authStorageSet) {
      return window.arkDesktop
        .authStorageSet(key, value)
        .then(() => undefined)
        .catch(() => {
          // If OS encryption is unavailable, still allow sign-in via local fallback.
          try {
            localStorage.setItem(LOCAL_FALLBACK_PREFIX + key, value);
          } catch {
            /* ignore */
          }
        });
    }
    localStorage.setItem(key, value);
  },
  removeItem: (key) => {
    if (window.arkDesktop?.authStorageRemove) {
      return window.arkDesktop
        .authStorageRemove(key)
        .then(() => undefined)
        .catch(() => {
          try {
            localStorage.removeItem(LOCAL_FALLBACK_PREFIX + key);
          } catch {
            /* ignore */
          }
        })
        .finally(() => {
          try {
            localStorage.removeItem(LOCAL_FALLBACK_PREFIX + key);
          } catch {
            /* ignore */
          }
        });
    }
    localStorage.removeItem(key);
  },
};

// Placeholder client keeps the module from throwing at import time (black screen).
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.invalid',
  supabaseAnonKey || 'public-anon-placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: arkAuthStorage,
      storageKey: 'ark-auth-token',
    },
  },
);
