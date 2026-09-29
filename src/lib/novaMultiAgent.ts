/**
 * Multi-agent pass on one bound project: Scout → Builder → Critic.
 * Sequential coordinator (not parallel LLM swarm). Writes via applyAndVerify.
 */

import { applyAndVerify } from '@/lib/applyAndVerify';
import { arkRoute } from '@/lib/novaRouter';
import {
  selectSkillsForBrief,
  formatSkillsForPrompt,
  loadProjectSkills,
  skillNamesLabel,
} from '@/lib/novaSkills';
import { detectProjectKind } from '@/lib/projectKind';
import { editMiss, editSuccess, type EditMiss, type EditSuccess } from '@/lib/productContract';

export type MultiAgentWorkerId = 'scout' | 'builder' | 'critic';

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
  /** Product-contract outcome for the code apply step (editSuccess / editMiss). */
  outcome?: EditSuccess | EditMiss;
};

/** True when + → Multi-agent is on, or user asked for multi-agent explicitly. */
export function wantsMultiAgentTurn(text: string, composerMultitask?: boolean): boolean {
  if (composerMultitask) return true;
  const t = String(text || '');
  if (/^\[Multi-agent\]/i.test(t.trim())) return true;
  return /\b(multi[\s-]?agent|multiple\s+agents|use\s+agents|parallel\s+agents)\b/i.test(t);
}

async function runScout(opts: {
  brief: string;
  files: Record<string, string>;
  skillBlock: string;
  preferredModelId?: string;
}): Promise<string> {
  const paths = Object.keys(opts.files)
    .filter((p) => !/(^|\/)(node_modules|dist|build|\.git)(\/|$)/i.test(p.replace(/\\/g, '/')))
    .slice(0, 48);
  const prompt = [
    'You are the Scout agent. Read the brief and file list. Reply with 4–8 short bullets only:',
    '- files to touch (paths)',
    '- risks / regressions to avoid',
    '- smallest change that ships the ask',
    '- what “done” looks like',
    'No code fences. No JSON.',
    '',
    opts.skillBlock ? `Skills:\n${opts.skillBlock.slice(0, 1200)}` : '',
    '',
    `Files: ${paths.slice(0, 28).join(', ')}${paths.length > 28 ? '…' : ''}`,
    '',
    `Brief:\n${opts.brief.slice(0, 2800)}`,
  ].filter(Boolean).join('\n');
  try {
    const routed = await arkRoute({
      message: prompt,
      kind: 'chat',
      preferredModelId: opts.preferredModelId,
    });
    return String(routed.reply || '').trim().slice(0, 1200)
      || 'Scout: proceed with focused file edits.';
  } catch {
    return 'Scout unavailable — Builder will use the brief and skills directly.';
  }
}

function structuralIssues(
  files: Record<string, string>,
  kind: string,
): string[] {
  const paths = Object.keys(files).map((p) => p.replace(/\\/g, '/'));
  const hasIndex = paths.some((p) => /(^|\/)index\.html$/i.test(p));
  const hasPkg = paths.some((p) => /(^|\/)package\.json$/i.test(p));
  const appBody = files['src/App.jsx'] || files['src/App.tsx'] || '';
  const cssBody = `${files['src/App.css'] || ''}\n${files['src/index.css'] || ''}`;
  const issues: string[] = [];
  if (kind === 'static-web' && !hasIndex) issues.push('missing index.html');
  if (kind === 'vite-react' && !hasPkg) issues.push('missing package.json');
  if (kind === 'vite-react' && appBody.length < 200) issues.push('App.jsx too thin');
  if (kind === 'vite-react' && cssBody.replace(/\s+/g, '').length < 200) issues.push('CSS too thin');
  if (/return\s*\(\s*<div className=["']app["']\s*\/>\s*\)/i.test(appBody)) {
    issues.push('App is still an empty shell');
  }
  return issues;
}

export async function runProjectMultiAgent(opts: {
  brief: string;
  files: Record<string, string>;
  projectId: string;
  projectName: string;
  diskRoot?: string | null;
  preferredModelId?: string;
  onProgress?: (msg: string) => void;
}): Promise<MultiAgentResult> {
  const workers: MultiAgentWorkerResult[] = [];
  const kind = detectProjectKind(opts.brief);
  let files = { ...opts.files };
  let outcome: EditSuccess | EditMiss | undefined;

  const projectSkills = await loadProjectSkills(opts.diskRoot);
  const skills = selectSkillsForBrief(opts.brief, kind, {
    isEdit: Object.keys(files).length > 0,
    forCreateBuild: Object.keys(files).length === 0,
    hasReferenceImage: /unsplash|https?:\/\/\S+\.(?:png|jpe?g|webp)/i.test(opts.brief),
    extras: projectSkills,
  });
  const skillBlock = formatSkillsForPrompt(skills);

  opts.onProgress?.('Multi-agent · Scout · reviewing');
  const scoutNotes = await runScout({
    brief: opts.brief,
    files,
    skillBlock,
    preferredModelId: opts.preferredModelId,
  });
  workers.push({
    id: 'scout',
    label: 'Scout',
    ok: true,
    note: skills.length
      ? `${skillNamesLabel(skills)} · ${scoutNotes.split('\n')[0]?.slice(0, 120) || 'notes ready'}`
      : (scoutNotes.split('\n')[0]?.slice(0, 160) || 'notes ready'),
  });

  const builderBrief = [
    opts.brief.trim(),
    '',
    skillBlock,
    '',
    'Scout notes:',
    scoutNotes,
    '',
    'Apply these notes while editing. Prefer unique visual direction over templates. Emit real @@@FILE blocks when writing UI.',
  ].join('\n');

  opts.onProgress?.('Multi-agent · Builder · applying edits');
  let updated: string[] = [];
  try {
    const applied = await applyAndVerify({
      reply: '',
      projectId: opts.projectId,
      projectName: opts.projectName,
      files,
      userMessage: builderBrief,
      diskRoot: opts.diskRoot || null,
    });
    outcome = applied.outcome;
    if (applied.ok) {
      files = applied.files;
      updated = applied.updated || [];
      workers.push({
        id: 'builder',
        label: 'Builder',
        ok: true,
        note: updated.length
          ? `Updated ${updated.slice(0, 6).join(', ')}${updated.length > 6 ? '…' : ''}`
          : 'Reviewed files (no disk delta)',
      });
    } else {
      workers.push({
        id: 'builder',
        label: 'Builder',
        ok: false,
        note: applied.outcome.message || 'Apply failed',
      });
    }
  } catch (err) {
    outcome = editMiss('write_failed', err instanceof Error ? err.message : 'Builder error');
    workers.push({
      id: 'builder',
      label: 'Builder',
      ok: false,
      note: outcome.message,
    });
  }

  opts.onProgress?.('Multi-agent · Critic · verifying');
  let issues = structuralIssues(files, kind);

  // One repair hop if Builder wrote something but Critic rejects thin shells.
  if (issues.length && updated.length) {
    opts.onProgress?.('Multi-agent · Critic · repair hop');
    try {
      const repair = await applyAndVerify({
        reply: '',
        projectId: opts.projectId,
        projectName: opts.projectName,
        files,
        userMessage: [
          opts.brief.trim(),
          '',
          'Critic rejected the last pass:',
          ...issues.map((i) => `- ${i}`),
          '',
          'Fix only those issues. Keep the product usable.',
        ].join('\n'),
        diskRoot: opts.diskRoot || null,
      });
      if (repair.ok && repair.updated.length) {
        files = repair.files;
        updated = [...new Set([...updated, ...repair.updated])];
        outcome = repair.outcome;
        issues = structuralIssues(files, kind);
      }
    } catch { /* keep prior issues */ }
  }

  workers.push({
    id: 'critic',
    label: 'Critic',
    ok: issues.length === 0,
    note: issues.length ? `Rejected: ${issues.join('; ')}` : 'Structure looks usable — open Preview',
  });

  const builderOk = workers.find((w) => w.id === 'builder')?.ok !== false;
  const criticOk = issues.length === 0;
  const ok = builderOk && criticOk;
  if (ok && !outcome) {
    outcome = editSuccess(updated, true);
  } else if (!ok && outcome?.ok !== false) {
    outcome = editMiss(
      criticOk ? 'write_failed' : 'verify_failed',
      criticOk
        ? 'Multi-agent Builder did not apply edits.'
        : `Multi-agent Critic rejected: ${issues.join('; ')}`,
    );
  }

  const reply = [
    '**Multi-agent pass** (Scout → Builder → Critic)',
    '',
    ...workers.map((w) => `- **${w.label}:** ${w.ok ? 'ok' : 'issue'} — ${w.note}`),
    '',
    !ok && outcome && !outcome.ok
      ? outcome.message
      : updated.length
        ? `Files touched: ${updated.map((p) => `\`${p}\``).join(', ')}. Open **Preview** to review.`
        : 'No file changes this pass — try a more specific edit ask.',
  ].join('\n');

  return { ok, reply, files, updated, workers, outcome };
}
