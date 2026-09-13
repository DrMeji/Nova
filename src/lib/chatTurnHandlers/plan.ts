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
    brief ? brief.slice(0, 1200) : 'Describe what you want on the page, then say **lets build this** when you want files on disk.',
    '',
    'Say **lets build this** to create the folder, or keep asking questions (plan only).',
  ];
  return lines.join('\n');
}
