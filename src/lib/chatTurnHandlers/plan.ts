/** Plan-only replies — honor classifyTurn.kind === 'plan' only. */

export function handlePlanTurnReply(opts: {
  name?: string | null;
  summary?: string | null;
}): string {
  const title = String(opts.name || 'your idea').trim() || 'your idea';
  const brief = String(opts.summary || '').trim();
  const lines = [
    `I’ve saved a plan for **${title}**.`,
    '',
    brief ? brief.slice(0, 1200) : 'Describe what you want on the page, then say **lets build this** when you want files on disk.',
    '',
    'Say **lets build this** to create the folder, or keep asking questions (plan only).',
  ];
  return lines.join('\n');
}
