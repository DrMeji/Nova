/**
 * Create-time “keep working until it’s built” loop.
 * Chat UI only — no terminal for the user. Under the hood: assess → build → repair → repeat.
 */

import { applyChatReplyEdits } from '@/lib/chatAgentApply';
import { runAgentCommand } from '@/lib/chatAgentExec';
import {
  briefLooksLikeMarketingLanding,
  briefRequiresInteractiveApp,
  ensureViteReactProjectFiles,
  isPreviewReady,
  isPlayableArcadeGameReady,
  isPlayableGameReady,
  looksLikeFillerStubAppSource,
  stripModelProseFromSource,
  type PreviewReadyResult,
} from '@/lib/createBuildQuality';
import { looksLikeFpsGame, looksLikePlayableCanvasGame } from '@/lib/freshSpaFromBrief';
import { isThinProductUiSource } from '@/lib/projectCodeEdit';
import { CODER_ENGINE_RANK } from '@/lib/enginePick';

export type CreateBuildStatus = {
  phase: 'assess' | 'install' | 'build' | 'repair' | 'done' | 'give_up';
  round: number;
  maxRounds: number;
  message: string;
  reasons?: string[];
};

export type CreateBuildUntilDoneOpts = {
  brief: string;
  productName: string;
  files: Record<string, string>;
  projectId: string;
  diskRoot?: string | null;
  maxRounds?: number;
  shouldAbort?: () => boolean;
  onStatus?: (status: CreateBuildStatus) => void;
  /** Repair turn — must emit @@@FILE blocks. Receives current files for context. */
  callRepairModel: (prompt: string, files: Record<string, string>) => Promise<string>;
};

export type CreateBuildUntilDoneResult = {
  ok: boolean;
  files: Record<string, string>;
  ready: PreviewReadyResult;
  rounds: number;
  buildOk?: boolean;
  buildOutput?: string;
  stopped: boolean;
};

function appSource(files: Record<string, string>): string {
  return files['src/App.jsx'] || files['src/App.tsx'] || '';
}

function previewOptsForBrief(brief: string, productName: string) {
  const marketing = briefLooksLikeMarketingLanding(brief)
    && !/\b(?:dashboard|kanban|inbox|workspace|transactions?|accounts?|todo|tracker|application)\b/i.test(brief);
  return {
    productName,
    requireInteractive: !marketing && briefRequiresInteractiveApp(brief),
    brief,
  };
}

export function assessCreateQuality(
  files: Record<string, string>,
  brief: string,
  productName: string,
): PreviewReadyResult {
  if (looksLikePlayableCanvasGame(brief, productName)) {
    return looksLikeFpsGame(brief, productName)
      ? isPlayableGameReady(files)
      : isPlayableArcadeGameReady(files);
  }
  const ready = isPreviewReady(files, previewOptsForBrief(brief, productName));
  const app = appSource(files);
  const reasons = [...ready.reasons];
  if (looksLikeFillerStubAppSource(app)) {
    reasons.push('App is still a filler stub');
  }
  if (isThinProductUiSource(app, brief)) {
    reasons.push('App still too thin for the brief');
  }
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

async function runNpmBuild(diskRoot: string): Promise<{ ok: boolean; output: string }> {
  const install = await runAgentCommand({
    command: 'npm install',
    cwd: diskRoot,
    skipConfirm: true,
  });
  if (install.ok === false) {
    return { ok: false, output: String(install.reply || 'npm install failed') };
  }
  const build = await runAgentCommand({
    command: 'npm run build',
    cwd: diskRoot,
    skipConfirm: true,
  });
  const output = String(build.reply || '');
  const failed = build.ok === false
    || /\berror\b|failed to compile|Build failed|ERR!/i.test(output);
  return { ok: !failed, output: output.slice(0, 4000) };
}

function buildRepairPrompt(opts: {
  brief: string;
  productName: string;
  ready: PreviewReadyResult;
  buildOk?: boolean;
  buildOutput?: string;
  round: number;
  maxRounds: number;
}): string {
  const failBits = [
    ...opts.ready.reasons.slice(0, 8),
    opts.buildOk === false ? 'npm run build failed' : '',
  ].filter(Boolean);
  return [
    `KEEP BUILDING (round ${opts.round}/${opts.maxRounds}) for "${opts.productName}".`,
    'Do not stop. Do not apologize. Emit COMPLETE @@@FILE blocks only for files you change.',
    'Put the full product UI in src/App.jsx (or src/App.tsx) + src/App.css + src/index.css.',
    'Each @@@FILE line MUST include the path.',
    '',
    'What is still wrong:',
    ...failBits.map((r) => `- ${r}`),
    opts.buildOutput
      ? `\nBuild / install output (fix from this):\n\`\`\`\n${opts.buildOutput.slice(0, 2500)}\n\`\`\``
      : '',
    '',
    'Requirements from the original brief (follow closely):',
    opts.brief,
    '',
    'If this is a restaurant/landing: full-bleed hero, brand as hero signal, CTA, real sections, footer, distinctive CSS — never sample text, never a blank page.',
    'If this is an app: real interactive state (useState) and working controls.',
    'If this is a simple game: real canvas loop + keyboard controls — not a static mock.',
  ].filter(Boolean).join('\n');
}

/** Prefer a local coder GGUF when the user has one ready (terminal-class quality without a terminal). */
export function pickLocalCoderModel(
  models: Array<{ id: string; name: string; source?: string }>,
): { id: string; name: string } | null {
  const local = models.filter((m) => !m.source || m.source === 'local');
  for (const id of CODER_ENGINE_RANK) {
    const hit = local.find((m) => m.id === id || m.id.endsWith(id));
    if (hit) return { id: hit.id, name: hit.name };
  }
  const fuzzy = local.find((m) => /coder|starcoder|codestral|deepseek-coder/i.test(m.id + m.name));
  return fuzzy ? { id: fuzzy.id, name: fuzzy.name } : null;
}

/**
 * Keep repairing the create until Preview quality + (optional) npm build pass,
 * or rounds / abort. Status callbacks drive the chat UI — user never opens a terminal.
 */
export async function runCreateBuildUntilDone(
  opts: CreateBuildUntilDoneOpts,
): Promise<CreateBuildUntilDoneResult> {
  const maxRounds = Math.max(2, Math.min(opts.maxRounds ?? 8, 12));
  let files = { ...opts.files };
  let stopped = false;
  let buildOk: boolean | undefined;
  let buildOutput = '';
  let ready = assessCreateQuality(files, opts.brief, opts.productName);
  let round = 0;

  const status = (partial: Omit<CreateBuildStatus, 'round' | 'maxRounds'>) => {
    opts.onStatus?.({ ...partial, round, maxRounds });
  };

  while (round < maxRounds) {
    if (opts.shouldAbort?.()) {
      stopped = true;
      break;
    }
    round += 1;

    status({ phase: 'assess', message: `Checking the build (pass ${round} of ${maxRounds})…`, reasons: ready.reasons });
    files = ensureViteReactProjectFiles(files, opts.productName).files;
    for (const key of Object.keys(files)) {
      const cleaned = stripModelProseFromSource(key, files[key]);
      if (cleaned !== files[key]) files = { ...files, [key]: cleaned };
    }
    ready = assessCreateQuality(files, opts.brief, opts.productName);

    if (opts.diskRoot && window.arkDesktop?.agentRun) {
      status({
        phase: 'build',
        message: ready.ok
          ? 'UI looks solid — verifying with a real project build…'
          : 'Running project build so we can fix real errors…',
      });
      try {
        const built = await runNpmBuild(opts.diskRoot);
        buildOk = built.ok;
        buildOutput = built.output;
      } catch (e) {
        buildOk = false;
        buildOutput = String(e);
      }
    } else {
      // No desktop shell — quality gates alone decide.
      buildOk = ready.ok ? true : buildOk;
    }

    const qualityOk = ready.ok && buildOk !== false;
    if (qualityOk) {
      status({ phase: 'done', message: 'Build checks passed — finishing Preview setup…' });
      return {
        ok: true,
        files,
        ready,
        rounds: round,
        buildOk,
        buildOutput,
        stopped: false,
      };
    }

    if (round >= maxRounds) break;

    status({
      phase: 'repair',
      message: `Still not done — fixing: ${(ready.reasons[0] || (buildOk === false ? 'build error' : 'thin UI')).slice(0, 80)}…`,
      reasons: ready.reasons,
    });

    const prompt = buildRepairPrompt({
      brief: opts.brief,
      productName: opts.productName,
      ready,
      buildOk,
      buildOutput,
      round,
      maxRounds,
    });

    let reply = '';
    try {
      reply = String(await opts.callRepairModel(prompt, files) || '').trim();
    } catch {
      reply = '';
    }
    if (opts.shouldAbort?.()) {
      stopped = true;
      break;
    }
    if (!reply) continue;

    const applied = await applyChatReplyEdits({
      reply,
      projectId: opts.projectId,
      projectName: opts.productName,
      files,
      userMessage: opts.brief,
      diskRoot: opts.diskRoot,
    });
    if (applied.ok && applied.updated.length) {
      files = applied.files;
      files = ensureViteReactProjectFiles(files, opts.productName).files;
    }
    ready = assessCreateQuality(files, opts.brief, opts.productName);
  }

  status({
    phase: 'give_up',
    message: stopped
      ? 'Stopped — you can say keep building anytime.'
      : `Still not Preview-ready after ${maxRounds} passes.`,
    reasons: ready.reasons,
  });

  return {
    ok: false,
    files,
    ready,
    rounds: round,
    buildOk,
    buildOutput,
    stopped,
  };
}
