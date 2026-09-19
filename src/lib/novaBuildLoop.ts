/**
 * Nova create/edit build loop — original orchestration on top of Level-B tools.
 * Free forever (local GGUF + optional free/user-keyed cloud). No paywall. No copied builders.
 *
 * Flow: pack context → agent tools → Preview Ready / assets check → fix rounds → heal.
 */

import { runArkAgentLoop, type AgentLoopResult, type AgentLoopStep } from '@/lib/arkAgentLoop';
import { packNovaBuildContext, novaCreateWriteTargets } from '@/lib/novaBuildContext';
import { modeStatusLabel } from '@/lib/novaStudioModes';
import { getLocalPrefs } from '@/lib/localPrefs';

export type NovaBuildLoopHost = {
  pushStatus: (label: string, writingPath?: string | null) => void;
  shouldAbort?: () => boolean;
};

export type NovaBuildLoopOpts = {
  brief: string;
  productName: string;
  files: Record<string, string>;
  projectId: string;
  diskRoot?: string | null;
  mustHaves?: string[];
  coderId: string;
  coderName: string;
  coderSource?: string;
  stickyModelId?: string | null;
  stickyModelName?: string | null;
  host: NovaBuildLoopHost;
  /** Max Ready→fix rounds after the first tool loop. */
  maxFixRounds?: number;
  priorObservations?: string[];
};

export type NovaBuildLoopResult = {
  ok: boolean;
  files: Record<string, string>;
  reasons: string[];
  steps: AgentLoopStep[];
  usedAgentLoop: true;
  replySummary: string;
};

function buildCreateBrief(opts: NovaBuildLoopOpts): string {
  const targets = novaCreateWriteTargets(opts.files).join(', ');
  const must = (opts.mustHaves || []).slice(0, 10).map((m, i) => `${i + 1}. ${m}`).join('\n');
  return [
    `Build the full product UI for **${opts.productName}** on this Vite + React project.`,
    'Nova is free — ship a real usable first screen. No paywalls, no “upgrade to Pro”, no placeholder stock sites.',
    '',
    '## Product brief',
    opts.brief.slice(0, 3500),
    '',
    must ? `## Must-haves\n${must}` : '',
    '',
    '## Rules',
    `- Prefer TOOL: write or TOOL: patch on: ${targets}`,
    '- Put the product in App + App.css (no ./components imports unless those files already exist).',
    '- Finish every JSX tag. Real copy for THIS brand — never lorem / “Sample” / via.placeholder.com.',
    '- Use local /public asset paths when heroes/logo already exist; never invent remote image hosts.',
    '- After substantial UI is written, call TOOL: ready then TOOL: assets. Fix failures before TOOL: done.',
    '- Prefer patch for small fixes; full write only when rewriting App.',
    '',
    'Start by TOOL: list or TOOL: read on src/App.tsx (or App.jsx), then write the product UI.',
  ].filter(Boolean).join('\n');
}

async function runReadyAndAssetsCheck(
  files: Record<string, string>,
  productName: string,
  brief: string,
  mustHaves: string[],
): Promise<{ ok: boolean; reasons: string[] }> {
  const {
    isPreviewReady,
    looksLikeFillerStubAppSource,
    briefRequiresInteractiveApp,
    briefLooksLikeChatApp,
  } = await import('@/lib/createBuildQuality');
  const { briefCreateMisses, createBriefSpecFromAsk } = await import('@/lib/createIdentity');
  const appBody = files['src/App.tsx'] || files['src/App.jsx'] || '';
  const spec = createBriefSpecFromAsk(productName, brief);
  const needsInteractive = briefLooksLikeChatApp(brief)
    || briefRequiresInteractiveApp(brief)
    || (mustHaves.length ? mustHaves : spec.mustHave).some((m) => /book|slot|confirm|cart|checkout|search|messag|lend/i.test(m));
  const ready = isPreviewReady(files, {
    productName,
    brief,
    requireInteractive: needsInteractive,
  });
  const misses = briefCreateMisses(spec, files);
  const filler = looksLikeFillerStubAppSource(appBody);
  const reasons = [
    ...(ready.ok ? [] : (ready.reasons || [])),
    ...misses,
    ...(filler ? ['App is still a filler stub'] : []),
  ];
  return { ok: reasons.length === 0, reasons };
}

async function healCreateFiles(
  files: Record<string, string>,
  opts: {
    productName: string;
    brief: string;
    projectId: string;
    diskRoot?: string | null;
    pushStatus: NovaBuildLoopHost['pushStatus'];
  },
): Promise<Record<string, string>> {
  const { applyChatReplyEdits } = await import('@/lib/chatAgentApply');
  const { ensureStylesLinked, createBriefSpecFromAsk } = await import('@/lib/createIdentity');
  const { ensureReactImportForNamespace } = await import('@/lib/createBuildQuality');
  let next = { ...files };
  const linked = ensureStylesLinked(next);
  if (linked.changed.length) {
    opts.pushStatus(modeStatusLabel('fix', 'Linking App.css'));
    next = linked.files;
    const blocks = linked.changed.map((p) => `@@@FILE ${p}\n${next[p]}`).join('\n');
    const applied = await applyChatReplyEdits({
      reply: blocks,
      projectId: opts.projectId,
      projectName: opts.productName,
      files: next,
      userMessage: opts.brief,
      diskRoot: opts.diskRoot,
    });
    if (applied.ok) next = applied.files;
  }
  const appKey = next['src/App.tsx'] && !next['src/App.jsx']
    ? 'src/App.tsx'
    : (next['src/App.jsx'] ? 'src/App.jsx' : 'src/App.tsx');
  const briefSpec = createBriefSpecFromAsk(opts.productName, opts.brief);
  let body = next[appKey] || '';
  if (body && /\/heroes\/hero\.jpg/i.test(body) && briefSpec.heroHref) {
    body = body.replace(/\/heroes\/hero\.jpg/gi, briefSpec.heroHref);
    next = { ...next, [appKey]: body };
  }
  const healed = ensureReactImportForNamespace(next[appKey] || '');
  if (healed !== (next[appKey] || '')) {
    opts.pushStatus(modeStatusLabel('fix', 'React import for Live'));
    next = { ...next, [appKey]: healed };
  }
  if (next[appKey] !== files[appKey]) {
    await applyChatReplyEdits({
      reply: `@@@FILE ${appKey}\n${next[appKey]}`,
      projectId: opts.projectId,
      projectName: opts.productName,
      files: next,
      userMessage: opts.brief,
      diskRoot: opts.diskRoot,
    }).then((r) => { if (r.ok) next = r.files; }).catch(() => {});
  }
  return next;
}

/**
 * Run Nova’s create polish via the tool loop + Ready/assets verify→fix.
 */
export async function runNovaCreateBuildLoop(opts: NovaBuildLoopOpts): Promise<NovaBuildLoopResult> {
  const prefs = getLocalPrefs();
  const maxFix = Math.max(0, Math.min(4, opts.maxFixRounds ?? 2));
  const packed = packNovaBuildContext(opts.files);
  const allSteps: AgentLoopStep[] = [];
  let files = { ...opts.files, ...packed };
  let observations = [...(opts.priorObservations || [])];
  let lastLoop: AgentLoopResult | null = null;
  let reasons: string[] = [];

  const { answerStudio } = await import('@/lib/studioAnswerEngine');

  const callModel = async (modelOpts: {
    prompt: string;
    onChunk?: (chunk: string) => void;
  }) => {
    const result = await answerStudio(
      {
        userMessage: modelOpts.prompt,
        files: packNovaBuildContext(files),
        projectName: opts.productName,
        mode: 'code',
        preferredModelId: opts.coderId,
        preferredModelName: opts.coderName,
        preferredSource: (opts.coderSource as 'local' | 'cloud' | 'auto' | undefined) || 'local',
        stickyModelId: opts.stickyModelId || undefined,
        stickyModelName: opts.stickyModelName || undefined,
        stickyPinnedSource: opts.stickyModelId ? 'local' : undefined,
        allowFileEdits: true,
        shouldAbort: () => Boolean(opts.host.shouldAbort?.()),
      },
      (delta) => {
        modelOpts.onChunk?.(String(delta || ''));
      },
    );
    return {
      reply: String(result.text || ''),
      modelName: opts.coderName,
      providerLabel: String(result.meta || 'NOVA'),
    };
  };

  opts.host.pushStatus(modeStatusLabel('build', 'Tool loop — reading project'));

  for (let round = 0; round <= maxFix; round++) {
    if (opts.host.shouldAbort?.()) {
      return {
        ok: false,
        files,
        reasons: ['Stopped'],
        steps: allSteps,
        usedAgentLoop: true,
        replySummary: 'Stopped during build loop.',
      };
    }

    const brief = round === 0
      ? buildCreateBrief({ ...opts, files })
      : [
          buildCreateBrief({ ...opts, files }),
          '',
          '## Fix round — Preview Ready / assets failed',
          ...reasons.map((r) => `- ${r}`),
          'Patch the failing issues. Then TOOL: ready and TOOL: assets again. Finish with TOOL: done.',
        ].join('\n');

    if (round > 0) {
      opts.host.pushStatus(modeStatusLabel('fix', reasons[0]?.slice(0, 72) || 'Ready issues'));
    }

    lastLoop = await runArkAgentLoop({
      brief,
      files: packNovaBuildContext(files),
      projectId: opts.projectId,
      projectName: opts.productName,
      diskRoot: opts.diskRoot,
      maxSteps: Math.min(28, Math.max(8, Number(prefs.agentLoopMaxSteps) || 20)),
      shouldAbort: () => Boolean(opts.host.shouldAbort?.()),
      priorObservations: observations,
      autoRunAllowlisted: true,
      callModel,
      onStep: (step) => {
        allSteps.push(step);
        const pathMatch = String(step.detail || step.label || '').match(
          /\b((?:src\/)?[\w./-]+\.(?:tsx?|jsx?|css))\b/i,
        );
        const label = step.tool === 'thought' || step.tool === 'status'
          ? modeStatusLabel(round > 0 ? 'fix' : 'build', step.label)
          : `${step.ok === false ? '⚠ ' : ''}${step.label}`;
        opts.host.pushStatus(label, pathMatch?.[1] || null);
      },
    });

    files = { ...files, ...lastLoop.files };
    observations = [
      ...observations,
      ...lastLoop.observations.slice(-6),
      lastLoop.ok ? 'Agent loop finished a pass.' : 'Agent loop stopped before done.',
    ].slice(-20);

    if (lastLoop.hitStepCap || lastLoop.stopped) {
      try {
        const { saveAgentContinue } = await import('@/lib/arkAgentContinue');
        saveAgentContinue({
          chatKey: opts.projectId,
          brief: opts.brief,
          observations,
          updated: lastLoop.updated || [],
          projectId: opts.projectId,
          projectName: opts.productName,
          diskRoot: opts.diskRoot,
          at: Date.now(),
        });
      } catch { /* ignore */ }
    } else {
      try {
        const { clearAgentContinue } = await import('@/lib/arkAgentContinue');
        clearAgentContinue(opts.projectId);
      } catch { /* ignore */ }
    }

    files = await healCreateFiles(files, {
      productName: opts.productName,
      brief: opts.brief,
      projectId: opts.projectId,
      diskRoot: opts.diskRoot,
      pushStatus: opts.host.pushStatus,
    });

    const check = await runReadyAndAssetsCheck(
      files,
      opts.productName,
      opts.brief,
      opts.mustHaves || [],
    );
    reasons = check.reasons;
    if (check.ok) {
      opts.host.pushStatus(modeStatusLabel('build', 'Preview Ready'));
      return {
        ok: true,
        files,
        reasons: [],
        steps: allSteps,
        usedAgentLoop: true,
        replySummary: lastLoop.reply || `Built **${opts.productName}**. Open Live when ready.`,
      };
    }
  }

  return {
    ok: false,
    files,
    reasons,
    steps: allSteps,
    usedAgentLoop: true,
    replySummary: lastLoop?.reply
      || `Could not reach Preview Ready yet:\n${reasons.slice(0, 5).map((r) => `- ${r}`).join('\n')}`,
  };
}

/** Whether create should use the Nova build loop (default on; free, no paywall). */
export function shouldUseNovaCreateBuildLoop(): boolean {
  const prefs = getLocalPrefs();
  if (prefs.agentLoopOnCreate === false) return false;
  // Create path opts into the loop even if the older workspace-only toggle is off.
  return prefs.agentLoopOnCreate !== false;
}

export function shouldUseNovaEditBuildLoop(): boolean {
  const prefs = getLocalPrefs();
  return prefs.agentLoopOnEdit !== false && prefs.agentLoopEnabled !== false;
}
