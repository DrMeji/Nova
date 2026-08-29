/**
 * Account deletion with a 24-hour grace period.
 * Final wipe still uses delete_own_account once the timer elapses (or on next sign-in).
 */

import { supabase } from '@/lib/supabase';

export type ScheduleDeleteResult =
  | { ok: true; deleteAt: string }
  | { ok: false; error: string };

function rpcMissing(msg: string) {
  return /could not find the function|schema cache|does not exist|column .* does not exist/i.test(msg);
}

export async function scheduleOwnAccountDeletion(hours = 24): Promise<ScheduleDeleteResult> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user?.id) {
      return { ok: false, error: 'Sign in with a real account first (guest cannot be deleted this way).' };
    }

    const { data, error } = await supabase.rpc('schedule_own_account_deletion', { p_hours: hours });
    if (error) {
      const msg = String(error.message || '');
      if (rpcMissing(msg)) {
        return {
          ok: false,
          error: '24-hour delete is not enabled on the server yet. Ask the developer to run supabase/migrations/20260828130000_schedule_account_deletion.sql, then try again.',
        };
      }
      return { ok: false, error: msg || 'Could not schedule account deletion' };
    }

    const deleteAt = data
      ? new Date(String(data)).toISOString()
      : new Date(Date.now() + hours * 3600_000).toISOString();

    // Local reminder until email delivery ships.
    try {
      localStorage.setItem('ark:delete-scheduled-at', deleteAt);
      localStorage.setItem('ark:delete-scheduled-email', sessionData.session.user.email || '');
    } catch {
      /* ignore */
    }

    return { ok: true, deleteAt };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not schedule account deletion' };
  }
}

export async function cancelOwnAccountDeletion(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user?.id) {
      return { ok: false, error: 'Sign in first.' };
    }
    const { error } = await supabase.rpc('cancel_own_account_deletion');
    if (error) {
      const msg = String(error.message || '');
      if (rpcMissing(msg)) {
        return {
          ok: false,
          error: 'Cancel delete is not enabled on the server yet. Apply the schedule_account_deletion migration.',
        };
      }
      return { ok: false, error: msg || 'Could not cancel deletion' };
    }
    try {
      localStorage.removeItem('ark:delete-scheduled-at');
      localStorage.removeItem('ark:delete-scheduled-email');
    } catch {
      /* ignore */
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not cancel deletion' };
  }
}

/** Permanently delete now (used when the 24h window has elapsed). */
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
      localStorage.removeItem('ark:delete-scheduled-at');
      localStorage.removeItem('ark:delete-scheduled-email');
    } catch {
      /* ignore */
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not delete account' };
  }
}

/** If a scheduled delete is due, wipe the account. Call after profile load. */
export async function finalizeScheduledDeletionIfDue(
  deleteScheduledAt: string | null | undefined,
): Promise<'deleted' | 'pending' | 'none' | 'error'> {
  if (!deleteScheduledAt) return 'none';
  const when = Date.parse(deleteScheduledAt);
  if (!Number.isFinite(when)) return 'none';
  if (Date.now() < when) return 'pending';
  const res = await deleteOwnAccountPermanently();
  return res.ok ? 'deleted' : 'error';
}
