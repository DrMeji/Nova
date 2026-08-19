/**
 * Title-bar / status pill: Local · Hybrid · Cloud · Offline
 */

import { getLocalPrefs } from '@/lib/localPrefs';
import { hasAnyCloudChatKey } from '@/lib/cloudChat';
import { getEngineStatus } from '@/lib/arkEngine';

export type AiModeLabel = 'Local' | 'Hybrid' | 'Cloud' | 'Offline';

export async function probeAiModeLabel(): Promise<AiModeLabel> {
  const prefs = getLocalPrefs();
  let localGguf = false;
  try {
    const status = await getEngineStatus();
    localGguf = Boolean(status.ggufBinary && (status.ggufCount || 0) > 0);
  } catch {
    localGguf = false;
  }
  const cloud = hasAnyCloudChatKey();

  if (prefs.aiMode === 'local_only') return localGguf ? 'Local' : 'Offline';
  if (prefs.aiMode === 'cloud_when_available') return cloud ? 'Cloud' : 'Offline';
  if (localGguf && cloud) return 'Hybrid';
  if (localGguf) return 'Local';
  if (cloud) return 'Cloud';
  return 'Offline';
}
