/**
 * NOVA Skill packs — build contracts that steer create/edit LLM prompts toward
 * Preview-ready apps on disk. Not a Cursor/Claude clone: skills attach to Nova
 * Multimodal + bound-folder builds, not a global agent home.
 */

import type { ProjectKind } from '@/lib/projectKind';

export type BuiltinNovaSkillId =
  | 'preview-contract'
  | 'design-taste'
  | 'layout-variance'
  | 'tool-ui-density'
  | 'redesign-audit'
  | 'image-to-code'
  | 'motion-presence';

/** Built-in or project-local id (project packs use free-form ids). */
export type NovaSkillId = BuiltinNovaSkillId | string;

export type NovaSkillPack = {
  id: NovaSkillId;
  name: string;
  summary: string;
  tags: string[];
  /** Injected into create/edit prompts */
  rules: string;
  /** True when loaded from a project .nova/skills folder SKILL.md */
  source?: 'builtin' | 'project';
  /** Create/build always keeps this pack even if toggled off in Settings. */
  alwaysOnCreate?: boolean;
};

export const NOVA_SKILL_PACKS: NovaSkillPack[] = [
  {
    id: 'preview-contract',
    name: 'Preview contract',
    summary: 'Force real files and a working Preview UI, not prose or empty shells.',
    tags: ['build', 'preview', 'nova'],
    alwaysOnCreate: true,
    source: 'builtin',
    rules: [
      'Emit COMPLETE @@@FILE blocks with real paths (e.g. @@@FILE src/App.jsx). Never bare @@@FILE.',
      'Ship substantial src/App.jsx + CSS that runs in Nova Vite Preview. No marketing prose instead of code.',
      'App.jsx must be an interactive product UI matching the brief (not an empty shell, single search box, or description).',
      'Do not invent fake success. If you cannot finish a mechanic, leave a clear TODO in code rather than claiming Ready.',
      'Prefer quality over a rushed stub. For rich sites/apps, App.jsx is typically well over 200 lines with real layout and state.',
    ].join(' '),
  },
  {
    id: 'design-taste',
    name: 'Design taste',
    summary: 'Unique visual language per brief. Anti-generic AI look.',
    tags: ['landing', 'web', 'brand'],
    source: 'builtin',
    rules: [
      'Infer a distinct design language from the brief (industry, mood, audience).',
      'Never ship purple-on-white or cream+terracotta AI-default themes unless the brief asks.',
      'Brand or product name is hero-level; one composition in the first viewport.',
      'Expressive typography (not Inter/Roboto/Arial/system-only stacks).',
      'Atmosphere via gradients, imagery, or subtle pattern. Not a flat single fill.',
      'No card grids in the hero; one job per section; reduce pill/stat clutter.',
    ].join(' '),
  },
  {
    id: 'layout-variance',
    name: 'Layout variance',
    summary: 'Commit to one layout family and vary section rhythm.',
    tags: ['landing', 'portfolio', 'marketing'],
    source: 'builtin',
    rules: [
      'Pick one layout family (full-bleed hero, split narrative, editorial magazine, or tool dashboard) and commit.',
      'Vary section rhythm (dense then open); avoid identical card rows on every section.',
      'Use 2 to 3 intentional motions (entrance, hover, scroll). Presence not noise.',
    ].join(' '),
  },
  {
    id: 'tool-ui-density',
    name: 'Tool UI density',
    summary: 'Dense professional controls for tools and dashboards.',
    tags: ['calculator', 'trading', 'dashboard', 'tool'],
    source: 'builtin',
    rules: [
      'Prioritize readable controls, keyboard affordances, and clear active states.',
      'Tight spacing with strong hierarchy; no marketing-hero fluff on tool UIs.',
      'History/status panels should feel native desktop software, not a landing page.',
    ].join(' '),
  },
  {
    id: 'redesign-audit',
    name: 'Redesign audit',
    summary: 'Surgical edits on bound projects. Keep what works.',
    tags: ['edit', 'redesign'],
    source: 'builtin',
    rules: [
      'Preserve working structure; change only what the user asked.',
      'Before restyling, note what to keep (brand colors, content, IA).',
      'Prefer surgical CSS/HTML edits over full-file rewrites.',
    ].join(' '),
  },
  {
    id: 'image-to-code',
    name: 'Image to code',
    summary: 'Match reference images and Multimodal vision briefs.',
    tags: ['image', 'reference', 'landing', 'vision'],
    source: 'builtin',
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
    source: 'builtin',
    rules: [
      'Ship at least two intentional motions on marketing surfaces.',
      'Prefer CSS transitions/keyframes; keep reduced-motion friendly.',
      'Motion supports hierarchy. Never decorative noise on every element.',
    ].join(' '),
  },
];

const SKILL_PREF_KEY = 'NOVA:skills-enabled';
const BUILTIN_TOGGLEABLE = NOVA_SKILL_PACKS.filter(s => !s.alwaysOnCreate);

export function listBuiltinSkillPacks(): NovaSkillPack[] {
  return NOVA_SKILL_PACKS.slice();
}

export function getEnabledSkillIds(): BuiltinNovaSkillId[] {
  const defaults = BUILTIN_TOGGLEABLE.map(s => s.id as BuiltinNovaSkillId);
  try {
    const raw = localStorage.getItem(SKILL_PREF_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) return defaults;
    const known = new Set(BUILTIN_TOGGLEABLE.map(s => s.id));
    return parsed.filter((id): id is BuiltinNovaSkillId => known.has(id as BuiltinNovaSkillId));
  } catch {
    return defaults;
  }
}

export function setEnabledSkillIds(ids: BuiltinNovaSkillId[]) {
  try {
    localStorage.setItem(SKILL_PREF_KEY, JSON.stringify(ids));
    window.dispatchEvent(new CustomEvent('NOVA:skills-changed'));
  } catch {
    /* ignore */
  }
}

export function toggleSkillEnabled(id: BuiltinNovaSkillId, on: boolean) {
  if (id === 'preview-contract') return; // always on for create/build
  const cur = new Set(getEnabledSkillIds());
  if (on) cur.add(id);
  else cur.delete(id);
  setEnabledSkillIds([...cur]);
}

function joinDisk(root: string, rel: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  const cleanRoot = root.replace(/[/\\]+$/, '');
  const cleanRel = rel.replace(/^[/\\]+/, '').replace(/\//g, sep);
  return cleanRel ? `${cleanRoot}${sep}${cleanRel}` : cleanRoot;
}

/** Parse Nova SKILL.md (frontmatter-lite + body rules). */
export function parseNovaSkillMarkdown(raw: string, fallbackId: string): NovaSkillPack | null {
  const text = String(raw || '').replace(/^\uFEFF/, '').trim();
  if (!text) return null;
  let id = fallbackId;
  let name = fallbackId.replace(/[-_]/g, ' ');
  let summary = '';
  let tags: string[] = [];
  let body = text;

  if (text.startsWith('---')) {
    const end = text.indexOf('---', 3);
    if (end > 0) {
      const fm = text.slice(3, end).trim();
      body = text.slice(end + 3).trim();
      for (const line of fm.split(/\r?\n/)) {
        const m = line.match(/^(\w+)\s*:\s*(.+)$/);
        if (!m) continue;
        const key = m[1].toLowerCase();
        const val = m[2].trim().replace(/^["']|["']$/g, '');
        if (key === 'id') id = val;
        else if (key === 'name') name = val;
        else if (key === 'summary') summary = val;
        else if (key === 'tags') {
          tags = val.split(/[, ]+/).map(t => t.trim()).filter(Boolean);
        }
      }
    }
  }

  const rules = body
    .split(/\r?\n/)
    .map(l => l.replace(/^[-*]\s+/, '').trim())
    .filter(l => l && !l.startsWith('#'))
    .join(' ');
  if (!rules) return null;
  return {
    id,
    name: name || id,
    summary: summary || 'Project skill',
    tags,
    rules,
    source: 'project',
  };
}

/** Load optional packs from project .nova/skills/packName/SKILL.md */
export async function loadProjectSkills(diskRoot?: string | null): Promise<NovaSkillPack[]> {
  const root = String(diskRoot || '').trim();
  if (!root || !window.arkDesktop?.listDir || !window.arkDesktop?.readTextFile) return [];

  try {
    const skillsDir = joinDisk(root, '.nova/skills');
    const listing = await window.arkDesktop.listDir(skillsDir);
    if (!listing?.ok || !listing.items?.length) return [];

    const packs: NovaSkillPack[] = [];
    for (const item of listing.items) {
      if (!item?.name || item.name === '.' || item.name === '..') continue;

      let skillPath = '';
      let fallbackId = item.name;
      if (item.kind === 'dir') {
        skillPath = joinDisk(item.path || joinDisk(skillsDir, item.name), 'SKILL.md');
        fallbackId = item.name;
      } else if (item.kind === 'file' && /\.md$/i.test(item.name)) {
        skillPath = item.path || joinDisk(skillsDir, item.name);
        fallbackId = item.name.replace(/\.md$/i, '');
      } else {
        continue;
      }

      try {
        const read = await window.arkDesktop.readTextFile({ path: skillPath, maxBytes: 80_000 });
        const content = read?.ok ? String(read.text || '') : '';
        if (!content) continue;
        const pack = parseNovaSkillMarkdown(content, fallbackId);
        if (pack) packs.push(pack);
      } catch {
        /* missing SKILL.md */
      }
    }
    return packs;
  } catch {
    return [];
  }
}

export type SelectSkillsOpts = {
  isEdit?: boolean;
  hasReferenceImage?: boolean;
  /** Create/build LLM path: always include preview-contract. */
  forCreateBuild?: boolean;
  /** Extra packs (e.g. project-local). */
  extras?: NovaSkillPack[];
};

/** Auto-pick built-in skills for a create/edit brief + stack. */
export function selectSkillsForBrief(
  summary: string,
  kind?: ProjectKind,
  opts?: SelectSkillsOpts,
): NovaSkillPack[] {
  const enabled = new Set(getEnabledSkillIds());
  const t = String(summary || '').toLowerCase();
  const picked: NovaSkillPack[] = [];
  const add = (id: BuiltinNovaSkillId) => {
    const pack = NOVA_SKILL_PACKS.find(s => s.id === id);
    if (!pack) return;
    if (pack.alwaysOnCreate && opts?.forCreateBuild) {
      if (!picked.some(p => p.id === id)) picked.push(pack);
      return;
    }
    if (!enabled.has(id) && !pack.alwaysOnCreate) return;
    // preview-contract only when forCreateBuild (or explicitly enabled via always)
    if (id === 'preview-contract' && !opts?.forCreateBuild) return;
    if (!picked.some(p => p.id === id)) picked.push(pack);
  };

  if (opts?.forCreateBuild) add('preview-contract');

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
  if (!picked.some(p => p.id !== 'preview-contract')) {
    add('design-taste');
  }

  return mergeSkillPacks(picked, opts?.extras || []);
}

/** Project packs win on same id. */
export function mergeSkillPacks(base: NovaSkillPack[], extras: NovaSkillPack[]): NovaSkillPack[] {
  const map = new Map<string, NovaSkillPack>();
  for (const p of base) map.set(p.id, p);
  for (const p of extras) map.set(p.id, p);
  return [...map.values()];
}

export async function resolveSkillsForBrief(
  summary: string,
  kind?: ProjectKind,
  opts?: SelectSkillsOpts & { diskRoot?: string | null },
): Promise<NovaSkillPack[]> {
  const extras = opts?.extras?.length
    ? opts.extras
    : await loadProjectSkills(opts?.diskRoot);
  return selectSkillsForBrief(summary, kind, { ...opts, extras });
}

/** Compact block for LLM prompts. */
export function formatSkillsForPrompt(skills: NovaSkillPack[]): string {
  if (!skills.length) return '';
  const lines = [
    '## NOVA skills (follow these build contracts)',
    ...skills.map(s => `- **${s.name}:** ${s.rules}`),
  ];
  return lines.join('\n');
}

export function skillNamesLabel(skills: NovaSkillPack[]): string {
  if (!skills.length) return '';
  return skills.map(s => s.name).join(', ');
}

export function skillPromptAppendix(
  summary: string,
  kind?: ProjectKind,
  opts?: SelectSkillsOpts,
): string {
  return formatSkillsForPrompt(selectSkillsForBrief(summary, kind, opts));
}

export async function skillPromptAppendixAsync(
  summary: string,
  kind?: ProjectKind,
  opts?: SelectSkillsOpts & { diskRoot?: string | null },
): Promise<{ appendix: string; skills: NovaSkillPack[] }> {
  const skills = await resolveSkillsForBrief(summary, kind, opts);
  return { appendix: formatSkillsForPrompt(skills), skills };
}

/* --- Compatibility aliases (old Ark names) --- */
export type ArkSkillId = BuiltinNovaSkillId;
export type ArkSkillPack = NovaSkillPack;
export const ARK_SKILL_PACKS = NOVA_SKILL_PACKS;
