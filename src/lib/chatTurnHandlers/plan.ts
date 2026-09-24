/** Plan-only replies — honor classifyTurn.kind === 'plan' only. */

export type PlanTurnHost = {
  name?: string | null;
  summary?: string | null;
  /** Always persist a buildable brief when provided. */
  savePlanBrief?: (brief: { name: string; summary: string }) => void;
};

export function handlePlanTurnReply(opts: PlanTurnHost): string {
  const title = String(opts.name || 'your idea').trim() || 'your idea';
  const brief = String(opts.summary || '').trim();
  opts.savePlanBrief?.({ name: title, summary: brief });
  const lines = [
    `I’ve saved a plan for **${title}**.`,
    '',
    'Ask another question if you want to change it.',
    'Say **lets build this** when you want the folder created.',
  ];
  void brief;
  return lines.join('\n');
}
