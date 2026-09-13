import type { ProjectBootstrapResult } from '@/lib/createProjectFlow';

/** Bootstrap opts for template-first create while npm runs in the background. */
export function pendingCreateBootstrap(note?: string): ProjectBootstrapResult {
  return {
    npmInstalled: true,
    npmPending: true,
    previewLive: false,
    bootstrapNote: note
      || 'Click **Preview** shortly, or say **make it richer** to expand the UI.',
  };
}
