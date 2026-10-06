/**
 * Explicit turn kind from composer chips — wins over regex classify.
 * Example: <!--nova-kind:create-->Build a site
 * (also accepts legacy <!--ark-kind:…-->)
 */

import type { TurnKind } from '@/lib/classifyTurn';

const KIND_RE = /<!--\s*(?:nova|ark)-kind:\s*(create|edit|plan|keep_building|chat|delete|open_folder|run_cmd)\s*-->/i;

export function parseExplicitTurnKind(message: string): TurnKind | null {
  const m = String(message || '').match(KIND_RE);
  if (!m?.[1]) return null;
  return m[1].toLowerCase() as TurnKind;
}

export function stripExplicitTurnKind(message: string): string {
  return String(message || '').replace(KIND_RE, '').trim();
}

export function withExplicitTurnKind(kind: TurnKind, prompt: string): string {
  const body = String(prompt || '').trim();
  return `<!--nova-kind:${kind}-->${body}`;
}

/** Three first-run chips — match classify kinds explicitly. */
export const FIRST_RUN_KIND_CHIPS = [
  {
    label: 'Build a site',
    prompt: withExplicitTurnKind('create', 'Build me a website'),
  },
  {
    label: 'Edit this',
    prompt: withExplicitTurnKind('edit', 'Put the title in the center'),
  },
  {
    label: 'Plan only',
    prompt: withExplicitTurnKind('plan', 'Plan a coffee shop site called Ember — plan only, don’t build yet'),
  },
] as const;
