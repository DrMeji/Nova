/**
 * Privacy preference gates — keep toggles honest without inventing telemetry.
 */

import { getLocalPrefs } from '@/lib/localPrefs';

/** Cloud chat / project sync uploads. */
export function maySyncToCloud(): boolean {
  const p = getLocalPrefs();
  if (p.keepFilesLocal && !p.allowCloudSync) return false;
  return Boolean(p.allowCloudSync);
}

/** Anonymous diagnostics (crash/error reports to cloud settings). */
export function maySendDiagnostics(): boolean {
  return Boolean(getLocalPrefs().sendDiagnostics);
}

/** Usage / product analytics pings (none shipped yet — gate future calls). */
export function mayShareUsageStats(): boolean {
  return Boolean(getLocalPrefs().shareUsageStats);
}
