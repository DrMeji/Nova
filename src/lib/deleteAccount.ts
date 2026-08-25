/** Permanently delete the signed-in ARK account on Supabase (immediate). */

import { supabase } from '@/lib/supabase';

export async function deleteOwnAccountPermanently(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user?.id) {
      return { ok: false, error: 'Sign in with a real account first (guest cannot be deleted this way).' };
    }

    const { error } = await supabase.rpc('delete_own_account');
    if (error) {
      const msg = String(error.message || '');
      if (/could not find the function|schema cache|does not exist/i.test(msg)) {
        return {
          ok: false,
          error: 'Account delete is not enabled on the server yet. Ask the developer to run supabase/delete-own-account.sql, then try again.',
        };
      }
      return { ok: false, error: msg || 'Could not delete account' };
    }

    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      /* ignore */
    }

    try {
      localStorage.removeItem('ark:friend-requests');
      localStorage.removeItem('ark:bypass');
    } catch {
      /* ignore */
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not delete account' };
  }
}
