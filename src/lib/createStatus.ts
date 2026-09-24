/**
 * Create-phase status + model pill ownership.
 * Talk sticky stays Instruct; during create hops the pill/engine follow the active role.
 */

export type CreatePhase =
  | 'plan'
  | 'spec'
  | 'design'
  | 'copy'
  | 'craft'
  | 'style'
  | 'verify'
  | 'critic'
  | 'done';

export type CreatePhaseModel = {
  id: string;
  name: string;
  role: CreatePhase;
};

/** User-facing status — role first so Copy·Instruct is never read as “the coder”. */
export function createPhaseStatusLabel(phase: CreatePhase, modelName: string): string {
  const name = String(modelName || '').trim() || 'model';
  switch (phase) {
    case 'plan':
    case 'spec':
      return `Plan · **${name}**`;
    case 'design':
      return `Design · **${name}**`;
    case 'copy':
      return `Copy · **${name}** (words, not code)`;
    case 'craft':
      return `Craft · **${name}**`;
    case 'style':
      return `Style · **${name}**`;
    case 'verify':
      return `Verify · **${name}**`;
    case 'critic':
      return `Critic · **${name}**`;
    case 'done':
      return `Done · **${name}**`;
    default:
      return name;
  }
}

export type CreatePhaseHost = {
  pushStatus?: (label: string, writingPath?: string | null) => void;
  onCoderPinned?: (coder: { id: string; name: string }) => void;
  onCreatePhaseModel?: (phase: CreatePhaseModel) => void;
};

/**
 * Announce a hop: status line + optional engine/pill sync.
 * Craft/verify call onCoderPinned so the Code pill shows the coder.
 */
export async function announceCreatePhase(
  host: CreatePhaseHost,
  phase: CreatePhase,
  model: { id: string; name: string },
  opts?: { setEngine?: boolean },
): Promise<void> {
  const label = createPhaseStatusLabel(phase, model.name);
  try { host.pushStatus?.(label); } catch { /* ignore */ }
  try {
    host.onCreatePhaseModel?.({ id: model.id, name: model.name, role: phase });
  } catch { /* ignore */ }
  if (phase === 'craft' || phase === 'verify') {
    try { host.onCoderPinned?.({ id: model.id, name: model.name }); } catch { /* ignore */ }
  }
  if (opts?.setEngine !== false && model.id && model.id !== 'NOVA-auto') {
    try {
      const { setEngineModel } = await import('@/lib/novaEngine');
      void setEngineModel?.(model.id);
    } catch { /* ignore */ }
  }
}
