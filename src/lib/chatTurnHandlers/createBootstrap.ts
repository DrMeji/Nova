import type { ProjectBootstrapResult } from '@/lib/createProjectFlow';

/** Bootstrap opts while npm would still be pending (legacy callers).
 * Never claim npmInstalled/Ready while still pending — Live is not ready yet.
 */
export function pendingCreateBootstrap(note?: string): ProjectBootstrapResult {
  return {
    npmInstalled: false,
    npmPending: true,
    previewLive: false,
    bootstrapNote: note
      || 'Installing project dependencies — Live unlocks when Ready.',
  };
}
