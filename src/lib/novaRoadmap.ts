/**
 * Internal Nova future plans — NOT shown in the product UI.
 * Park ideas here so we don’t forget them; implement when invent is solid + budget allows.
 *
 * Order we agreed:
 *  1. Stabilize invent + chat on local (free models on the user’s PC)
 *  2. Test device / VM integration (wrap VirtualBox / Hyper-V / UTM — not build a hypervisor)
 *  3. Optional Nova-hosted remote workers (models on Nova GPUs) — only when we can pay for compute
 */

export type NovaRoadmapItem = {
  id: string;
  title: string;
  /** Why it exists */
  why: string;
  /** When to start */
  after: string;
  /** Visible in sidebar today? */
  uiVisible: boolean;
  status: 'idea' | 'parked-shell' | 'building' | 'live';
};

export const NOVA_ROADMAP: NovaRoadmapItem[] = [
  {
    id: 'test-device-vm',
    title: 'Test device (VM integration)',
    why:
      'Integrate existing VM apps (VirtualBox / Hyper-V / UTM) so users pick Windows or Linux, '
      + 'boot a guest, and try the invent project in a sandbox — not build our own hypervisor.',
    after: 'Coding invent + normal chat feel reliable on this PC.',
    uiVisible: true, // sidebar “Test device” — Coming Soon shell only
    status: 'parked-shell',
  },
  {
    id: 'remote-nova-worker',
    title: 'Nova remote worker (models off-device)',
    why:
      'Thin client: Nova UI on a weak PC, free models + invent run on a stronger machine. '
      + 'BYO worker first (user’s strong PC); Nova-hosted GPUs only when we have budget — '
      + 'hosted compute is never free even if model weights are.',
    after: 'Invent solid + Test device useful + we can afford GPU/server cost (or BYO path shipped).',
    uiVisible: false, // do NOT show in nav / Coming Soon — internal plan only
    status: 'idea',
  },
];

export function roadmapItem(id: string): NovaRoadmapItem | undefined {
  return NOVA_ROADMAP.find((r) => r.id === id);
}
