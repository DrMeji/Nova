/**
 * Lightweight multi-agent pass on one bound project: Design → Code → Verify.
 * Sequential coordinator (not parallel LLM swarm). safe merge via chatAgentApply.
 */

import { applyChatReplyEdits } from '@/lib/chatAgentApply';
import {
  selectSkillsForBrief,
  formatSkillsForPrompt,
  loadProjectSkills,
  skillNamesLabel,
} from '@/lib/novaSkills';
import { detectProjectKind } from '@/lib/projectKind';

export type MultiAgentWorkerId = 'design' | 'code' | 'verify';

export type MultiAgentWorkerResult = {
  id: MultiAgentWorkerId;
  label: string;
  ok: boolean;
  note: string;
};

export type MultiAgentResult = {
  ok: boolean;
  reply: string;
  files: Record<string, string>;
  updated: string[];
  workers: MultiAgentWorkerResult[];
};

/** True when + → Multi-agent is on, or user asked for multi-agent explicitly. */
export function wantsMultiAgentTurn(text: string, composerMultitask?: boolean): boolean {
  if (composerMultitask) return true;
  const t = String(text || '');
  if (/^\[Multi-agent\]/i.test(t.trim())) return true;
  return /\b(multi[\s-]?agent|multiple\s+agents|use\s+agents|parallel\s+agents)\b/i.test(t);
}

export async function runProjectMultiAgent(opts: {
  brief: string;
  files: Record<string, string>;
  projectId: string;
  projectName: string;
  diskRoot?: string | null;
}): Promise<MultiAgentResult> {
  const workers: MultiAgentWorkerResult[] = [];
  const kind = detectProjectKind(opts.brief);
  let files = { ...opts.files };

  const projectSkills = await loadProjectSkills(opts.diskRoot);
  const skills = selectSkillsForBrief(opts.brief, kind, {
    isEdit: Object.keys(files).length > 0,
    forCreateBuild: Object.keys(files).length === 0,
    hasReferenceImage: /unsplash|https?:\/\/\S+\.(?:png|jpe?g|webp)/i.test(opts.brief),
    extras: projectSkills,
  });
  const skillBlock = formatSkillsForPrompt(skills);
  const designBrief = [
    opts.brief.trim(),
    '',
    skillBlock,
    '',
    'Apply these NOVA skills while editing the project files. Prefer unique visual direction over templates. Emit real @@@FILE blocks when writing UI.',
  ].join('\n');
  workers.push({
    id: 'design',
    label: 'Design',
    ok: skills.length > 0,
    note: skills.length
      ? `Equipped ${skillNamesLabel(skills)}`
      : 'No skills enabled. using brief only',
  });

  // --- Code worker: apply via existing edit path ---
  let updated: string[] = [];
  try {
    const applied = await applyChatReplyEdits({
      reply: '',
      projectId: opts.projectId,
      projectName: opts.projectName,
      files,
      userMessage: designBrief,
      diskRoot: opts.diskRoot || undefined,
    });
    if (applied.ok) {
      files = applied.files;
      updated = applied.updated || [];
      workers.push({
        id: 'code',
        label: 'Code',
        ok: true,
        note: updated.length
          ? `Updated ${updated.slice(0, 6).join(', ')}${updated.length > 6 ? '…' : ''}`
          : 'Reviewed files (no disk delta)',
      });
    } else {
      workers.push({
        id: 'code',
        label: 'Code',
        ok: false,
        note: applied.error || 'Apply failed',
      });
    }
  } catch (err) {
    workers.push({
      id: 'code',
      label: 'Code',
      ok: false,
      note: err instanceof Error ? err.message : 'Code worker error',
    });
  }

  // --- Verify worker: structural checks ---
  const paths = Object.keys(files).map(p => p.replace(/\\/g, '/'));
  const hasIndex = paths.some(p => /(^|\/)index\.html$/i.test(p));
  const hasPkg = paths.some(p => /(^|\/)package\.json$/i.test(p));
  const hasCss = paths.some(p => /\.css$/i.test(p));
  const issues: string[] = [];
  if (kind === 'static-web' && !hasIndex) issues.push('missing index.html');
  if (kind === 'vite-react' && !hasPkg) issues.push('missing package.json');
  if (hasIndex && !hasCss && !paths.some(p => /\.css|style=/i.test(files[paths.find(x => /index\.html$/i.test(x)) || ''] || ''))) {
    /* soft. many pages use inline style */
  }
  workers.push({
    id: 'verify',
    label: 'Verify',
    ok: issues.length === 0,
    note: issues.length ? issues.join('; ') : 'Structure looks usable. open Preview',
  });

  const ok = workers.every(w => w.id === 'verify' ? w.ok : w.id !== 'code' || w.ok);
  const reply = [
    '**Multi-agent pass** (Design → Code → Verify)',
    '',
    ...workers.map(w => `- **${w.label}:** ${w.ok ? '✓' : '✗'} ${w.note}`),
    '',
    updated.length
      ? `Files touched: ${updated.map(p => `\`${p}\``).join(', ')}. Open **Preview** to review.`
      : 'No file changes this pass. try a more specific edit ask.',
  ].join('\n');

  return { ok, reply, files, updated, workers };
}
