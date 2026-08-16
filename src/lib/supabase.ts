import { createClient, type SupportedStorage } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

/**
 * Prefer Electron userData for the auth session so upgrades keep you signed in.
 * Falls back to localStorage in the browser.
 */
const arkAuthStorage: SupportedStorage = {
  getItem: (key) => {
    if (window.arkDesktop?.authStorageGet) {
      return window.arkDesktop.authStorageGet(key);
    }
    return localStorage.getItem(key);
  },
  setItem: (key, value) => {
    if (window.arkDesktop?.authStorageSet) {
      return window.arkDesktop.authStorageSet(key, value).then(() => undefined);
    }
    localStorage.setItem(key, value);
  },
  removeItem: (key) => {
    if (window.arkDesktop?.authStorageRemove) {
      return window.arkDesktop.authStorageRemove(key).then(() => undefined);
    }
    localStorage.removeItem(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: arkAuthStorage,
    storageKey: 'ark-auth-token',
  },
});
