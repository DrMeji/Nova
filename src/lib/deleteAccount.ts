/**
 * Immediate self-serve account deletion (no waiting period).
 */

import { supabase } from '@/lib/supabase';

function rpcMissing(msg: string) {
  return /could not find the function|schema cache|does not exist|column .* does not exist/i.test(msg);
}

function clearLocalDeleteKeys() {
  try {
    localStorage.removeItem('NOVA:delete-scheduled-at');
    localStorage.removeItem('NOVA:delete-scheduled-email');
    localStorage.removeItem('ark:delete-scheduled-at');
    localStorage.removeItem('ark:delete-scheduled-email');
    localStorage.removeItem('NOVA:friend-requests');
    localStorage.removeItem('NOVA:bypass');
  } catch {
    /* ignore */
  }
}

/** Permanently delete the signed-in account now. */
export async function deleteOwnAccountPermanently(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user?.id) {
      return { ok: false, error: 'Sign in with a real account first (guest cannot be deleted this way).' };
    }

    const { error } = await supabase.rpc('delete_own_account');
    if (error) {
      const msg = String(error.message || '');
      if (rpcMissing(msg)) {
        return {
          ok: false,
          error: 'Account delete is not enabled on the server yet. Apply supabase/delete-own-account.sql, then try again.',
        };
      }
      return { ok: false, error: msg || 'Could not delete account' };
    }

    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      /* ignore */
    }

    clearLocalDeleteKeys();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not delete account' };
  }
}

/** @deprecated Prefer deleteOwnAccountPermanently — kept so old call sites compile during the cutover. */
export async function scheduleOwnAccountDeletion(_hours = 0) {
  const res = await deleteOwnAccountPermanently();
  if (!res.ok) return res;
  return { ok: true as const, deleteAt: new Date().toISOString() };
}

/** @deprecated No grace period anymore. */
export async function cancelOwnAccountDeletion(): Promise<{ ok: true } | { ok: false; error: string }> {
  clearLocalDeleteKeys();
  return { ok: true };
}

/** @deprecated No scheduled deletes. */
export async function finalizeScheduledDeletionIfDue(
  _deleteScheduledAt?: string | null,
): Promise<'deleted' | 'pending' | 'none' | 'error'> {
  return 'none';
}
