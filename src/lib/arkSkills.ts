/**
 * NOVA design Skill packs. built-in playbooks auto-attached by project kind.
 * Separate from SaaS Plugins (GitHub/Notion/…). Inspired by taste/arsenal-style skills.
 */

import type { ProjectKind } from '@/lib/projectKind';

export type ArkSkillId =
  | 'design-taste'
  | 'layout-variance'
  | 'tool-ui-density'
  | 'redesign-audit'
  | 'image-to-code'
  | 'motion-presence';

export type ArkSkillPack = {
  id: ArkSkillId;
  name: string;
  summary: string;
  tags: string[];
  /** Injected into create/edit prompts */
  rules: string;
};

export const ARK_SKILL_PACKS: ArkSkillPack[] = [
  {
    id: 'design-taste',
    name: 'Design taste',
    summary: 'Anti-generic UI. unique type, color, and composition per brief.',
    tags: ['landing', 'web', 'brand'],
    rules: [
      'Infer a distinct design language from the brief (industry, mood, audience).',
      'Never ship purple-on-white or cream+terracotta AI-default themes unless the brief asks.',
      'Brand or product name is hero-level; one composition in the first viewport.',
      'Expressive typography (not Inter/Roboto/Arial/system-only stacks).',
      'Atmosphere via gradients, imagery, or subtle pattern. not a flat single fill.',
      'No card grids in the hero; one job per section; reduce pill/stat clutter.',
    ].join(' '),
  },
  {
    id: 'layout-variance',
    name: 'Layout variance',
    summary: 'Break template sameness with intentional layout families.',
    tags: ['landing', 'portfolio', 'marketing'],
    rules: [
      'Pick one layout family (full-bleed hero, split narrative, editorial magazine, or tool dashboard) and commit.',
      'Vary section rhythm (dense then open); avoid identical card rows on every section.',
      'Use 2–3 intentional motions (entrance, hover, scroll). presence not noise.',
    ].join(' '),
  },
  {
    id: 'tool-ui-density',
    name: 'Tool UI density',
    summary: 'Dense professional controls for calculators, cockpits, and dashboards.',
    tags: ['calculator', 'trading', 'dashboard', 'tool'],
    rules: [
      'Prioritize readable controls, keyboard affordances, and clear active states.',
      'Tight spacing with strong hierarchy; no marketing-hero fluff on tool UIs.',
      'History/status panels should feel native desktop software, not a landing page.',
    ].join(' '),
  },
  {
    id: 'redesign-audit',
    name: 'Redesign audit',
    summary: 'Audit-first when improving an existing UI.',
    tags: ['edit', 'redesign'],
    rules: [
      'Preserve working structure; change only what the user asked.',
      'Before restyling, note what to keep (brand colors, content, IA).',
      'Prefer surgical CSS/HTML edits over full-file rewrites.',
    ].join(' '),
  },
  {
    id: 'image-to-code',
    name: 'Image to code',
    summary: 'Turn reference images into faithful layout and style.',
    tags: ['image', 'reference', 'landing'],
    rules: [
      'Match composition, spacing, and palette from the reference when provided.',
      'Do not invent unrelated sections; translate what is visible first.',
      'Use real image URLs from the brief when present.',
    ].join(' '),
  },
  {
    id: 'motion-presence',
    name: 'Motion presence',
    summary: 'Tasteful motion that sells hierarchy.',
    tags: ['landing', 'marketing'],
    rules: [
      'Ship at least two intentional motions on marketing surfaces.',
      'Prefer CSS transitions/keyframes; keep reduced-motion friendly.',
      'Motion supports hierarchy. never decorative noise on every element.',
    ].join(' '),
  },
];

const SKILL_PREF_KEY = 'NOVA:skills-enabled';

export function getEnabledSkillIds(): ArkSkillId[] {
  try {
    const raw = localStorage.getItem(SKILL_PREF_KEY);
    if (!raw) return ARK_SKILL_PACKS.map(s => s.id);
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) return ARK_SKILL_PACKS.map(s => s.id);
    const known = new Set(ARK_SKILL_PACKS.map(s => s.id));
    return parsed.filter((id): id is ArkSkillId => known.has(id as ArkSkillId));
  } catch {
    return ARK_SKILL_PACKS.map(s => s.id);
  }
}

export function setEnabledSkillIds(ids: ArkSkillId[]) {
  try {
    localStorage.setItem(SKILL_PREF_KEY, JSON.stringify(ids));
    window.dispatchEvent(new CustomEvent('NOVA:skills-changed'));
  } catch {
    /* ignore */
  }
}

export function toggleSkillEnabled(id: ArkSkillId, on: boolean) {
  const cur = new Set(getEnabledSkillIds());
  if (on) cur.add(id);
  else cur.delete(id);
  setEnabledSkillIds([...cur]);
}

/** Auto-pick skills for a create/edit brief + stack. */
export function selectSkillsForBrief(
  summary: string,
  kind?: ProjectKind,
  opts?: { isEdit?: boolean; hasReferenceImage?: boolean },
): ArkSkillPack[] {
  const enabled = new Set(getEnabledSkillIds());
  const t = String(summary || '').toLowerCase();
  const picked: ArkSkillPack[] = [];
  const add = (id: ArkSkillId) => {
    if (!enabled.has(id)) return;
    const pack = ARK_SKILL_PACKS.find(s => s.id === id);
    if (pack && !picked.some(p => p.id === id)) picked.push(pack);
  };

  if (opts?.isEdit || /\b(redesign|restyle|improve\s+(?:the\s+)?(?:look|ui|design))\b/.test(t)) {
    add('redesign-audit');
  }
  if (opts?.hasReferenceImage || /\b(from\s+(?:this\s+)?(?:image|screenshot|mockup)|image[\s-]?to[\s-]?code)\b/.test(t)) {
    add('image-to-code');
  }
  if (
    kind === 'static-web'
    || /\b(landing|website|site|portfolio|festival|restaurant|hero)\b/.test(t)
  ) {
    add('design-taste');
    add('layout-variance');
    if (/\b(motion|animate|scroll|gsap)\b/.test(t) || kind === 'static-web') add('motion-presence');
  }
  if (
    /\b(calculator|cockpit|dashboard|trading|watchlist|tool\s+ui)\b/.test(t)
    || (kind === 'static-web' && /\bcalc\b/.test(t))
  ) {
    add('tool-ui-density');
  }
  if (kind === 'vite-react' && /\b(app|dashboard|spa)\b/.test(t)) {
    add('design-taste');
    add('tool-ui-density');
  }
  if (!picked.length) {
    add('design-taste');
  }
  return picked;
}

/** Compact block for LLM / scaffold post-pass. */
export function formatSkillsForPrompt(skills: ArkSkillPack[]): string {
  if (!skills.length) return '';
  const lines = [
    '## NOVA design skills (follow these)',
    ...skills.map(s => `- **${s.name}:** ${s.rules}`),
  ];
  return lines.join('\n');
}

export function skillPromptAppendix(
  summary: string,
  kind?: ProjectKind,
  opts?: { isEdit?: boolean; hasReferenceImage?: boolean },
): string {
  return formatSkillsForPrompt(selectSkillsForBrief(summary, kind, opts));
}
