/**
 * Create Runtime Loop (CRL) — verify-before-success + capped auto-fix.
 * Static Ready is preflight. Live unlock = mount. Quality Ready = pass spine judge.
 * Pattern: OpenHands /goal + Freebuff commander (heal → patch → re-probe).
 */

import { applyChatReplyEdits } from '@/lib/chatAgentApply';
import {
  collectLiveEvidence,
  emptyCreateEvidence,
  finalizeCreateEvidence,
  formatEvidenceForAgent,
  createRuntimeStageLabel,
  type CreateEvidence,
} from '@/lib/createEvidence';
import { snapshotCreateCheckpoint } from '@/lib/createCheckpoint';
import { condenseBrief, condenseObservations } from '@/lib/createProjectMap';
import {
  formatCreateCommanderFixPrompt,
  gateDesignPass,
  gatePlanPass,
  judgeCreateVerified,
  createPassStatusLabel,
  type CreateVerifiedVerdict,
} from '@/lib/createPassSpine';

export type CreateRuntimeLoopHost = {
  pushStatus: (label: string, writingPath?: string | null) => void;
  shouldAbort?: () => boolean;
  onStage?: (stage: string, detail?: string) => void;
};

export type CreateRuntimeFixResult = {
  files: Record<string, string>;
  evidence: CreateEvidence;
  fixRounds: number;
  observations: string[];
  judgedOk: boolean;
  judgeReasons: string[];
  /** True when Live may unlock (painted). */
  liveUnlock: boolean;
  /** True only when plan + design + host judge pass and no floor fallback. */
  qualityReady: boolean;
  verified: CreateVerifiedVerdict | null;
};

/** Heal + commander rounds before giving up on quality. */
const MAX_FIX_ROUNDS = 3;

/**
 * After static Ready + npm + Live URL: prove Live, then auto-heal/fix up to MAX_FIX_ROUNDS.
 */
export async function runCreateVerifyAndFix(opts: {
  files: Record<string, string>;
  productName: string;
  brief: string;
  projectId: string;
  diskRoot: string;
  liveUrl: string;
  npmInstalled: boolean;
  staticReady: boolean;
  staticReasons?: string[];
  host: CreateRuntimeLoopHost;
  maxFixRounds?: number;
  /** Floor/recovery path — may unlock Live but never qualityReady. */
  floorFallback?: boolean;
}): Promise<CreateRuntimeFixResult> {
  let files = { ...opts.files };
  let observations: string[] = [];
  const maxRounds = Math.max(1, Math.min(8, opts.maxFixRounds ?? MAX_FIX_ROUNDS));
  let fixRounds = 0;
  const brief = condenseBrief(opts.brief);
  let floorFallback = Boolean(opts.floorFallback);

  snapshotCreateCheckpoint(files, opts.productName, {
    label: 'pre-verify',
    diskRoot: opts.diskRoot,
  });

  let evidence = emptyCreateEvidence({
    staticReady: opts.staticReady,
    staticReasons: opts.staticReasons || [],
    npmInstalled: opts.npmInstalled,
    liveUrl: opts.liveUrl,
    stage: 'live',
  });

  const probeOnce = async () => {
    opts.host.pushStatus(createRuntimeStageLabel('live'));
    opts.host.onStage?.('live');
    const live = await collectLiveEvidence({
      liveUrl: opts.liveUrl,
      productName: opts.productName,
      files,
      brief,
      requireSmoke: false,
      onStatus: (label) => opts.host.pushStatus(label),
    });
    evidence = finalizeCreateEvidence({
      ...evidence,
      ...live,
      staticReady: opts.staticReady,
      npmInstalled: opts.npmInstalled,
    });
    observations.push(formatEvidenceForAgent(evidence));
    observations = condenseObservations(observations, 8);
    return evidence;
  };

  evidence = await probeOnce();
  if (opts.host.shouldAbort?.()) {
    return {
      files,
      evidence,
      fixRounds,
      observations,
      judgedOk: false,
      judgeReasons: ['aborted'],
      liveUnlock: false,
      qualityReady: false,
      verified: null,
    };
  }

  // Honest Live only — never forge mounted/pass from HTTP + disk heuristics.
  // Probe must report a real mount before Live unlock / quality Ready.

  const needsQualityFix = () => {
    const v = judgeCreateVerified({
      evidence,
      files,
      brief,
      productName: opts.productName,
      floorFallback,
    });
    return !v.qualityReady && (evidence.pass || evidence.httpOk);
  };

  while (fixRounds < maxRounds && ( !evidence.pass || needsQualityFix()) && !opts.host.shouldAbort?.()) {
    // Floor fallback: one heal round for mount only — never pretend quality.
    if (floorFallback && fixRounds >= 1 && evidence.pass) break;

    fixRounds += 1;
    opts.host.pushStatus(createRuntimeStageLabel('fix', `round ${fixRounds}/${maxRounds}`));
    opts.host.onStage?.('fix', `round ${fixRounds}`);
    opts.host.pushStatus(createPassStatusLabel('verify', `fix ${fixRounds}`));
    snapshotCreateCheckpoint(files, opts.productName, {
      label: `fix-${fixRounds}`,
      diskRoot: opts.diskRoot,
    });

    try {
      const { healNearCompleteTruncatedSource } = await import('@/lib/freshSpaFromBrief');
      const {
        healNearReadyCreateUi,
        healBrokenJsxOpenTags,
        previewReadyForBrief,
      } = await import('@/lib/createBuildQuality');
      const { runCreateSyntaxGate } = await import('@/lib/createSyntaxGate');

      const appKey = files['src/App.jsx'] ? 'src/App.jsx' : (files['src/App.tsx'] ? 'src/App.tsx' : '');
      if (appKey && files[appKey]) {
        const closed = healNearCompleteTruncatedSource(appKey, files[appKey]);
        if (closed && closed !== files[appKey]) {
          files = { ...files, [appKey]: closed };
          observations.push(`fix: healed truncated ${appKey}`);
        }
        const jsxFixed = healBrokenJsxOpenTags(files[appKey]);
        if (jsxFixed !== files[appKey]) {
          files = { ...files, [appKey]: jsxFixed };
          observations.push(`fix: surgical JSX open-tags on ${appKey}`);
        }
      }

      const syn = runCreateSyntaxGate(files);
      if (syn.healed) {
        files = syn.files;
        observations.push('fix: syntax gate heal');
      }

      // Compile / storefront bleed kills Live — strip + heal before re-probe.
      const compileish = !syn.ok
        || evidence.consoleErrors.some((e) => /vite|syntax|adjacent jsx|transform failed|could not be compiled|overlay/i.test(String(e || '')))
        || /NOVA_STOREFRONT_ISLAND|data-nova=["']storefront-island["']/.test(
          files['src/App.tsx'] || files['src/App.jsx'] || '',
        );
      if (compileish) {
        try {
          const {
            buildProductPlan,
            repairToContract,
            stripWrongFamilyStorefrontBleed,
          } = await import('@/lib/createProductPlan');
          const plan = buildProductPlan(brief, opts.productName);
          if (plan.compositionFamily !== 'catalog-store') {
            const appKeyBleed = files['src/App.jsx'] ? 'src/App.jsx' : 'src/App.tsx';
            if (appKeyBleed && files[appKeyBleed]) {
              const cleaned = stripWrongFamilyStorefrontBleed(files[appKeyBleed]);
              if (cleaned !== files[appKeyBleed]) {
                files = { ...files, [appKeyBleed]: cleaned };
                delete files['src/data/products.ts'];
                observations.push('fix: stripped wrong-family storefront bleed');
              }
            }
          }
          const repaired = repairToContract(files, plan, brief);
          if (repaired.changed) {
            files = repaired.files;
            observations.push(`fix: compile repair (${repaired.actions.slice(0, 4).join(', ')})`);
          }
          const syn2 = runCreateSyntaxGate(files);
          if (syn2.healed || syn2.files !== files) {
            files = syn2.files;
            observations.push('fix: syntax gate after bleed strip');
          }
        } catch {
          /* bleed strip optional */
        }
      }

      // Plan repair before near-ready (structure pass).
      // If repair owns the product shell, keep files for Live but mark floorFallback so quality Ready fails.
      if (!floorFallback) {
        try {
          const { buildProductPlan, repairToContract } = await import('@/lib/createProductPlan');
          const plan = buildProductPlan(brief, opts.productName);
          opts.host.pushStatus(createPassStatusLabel('structure', plan.compositionFamily));
          const repaired = repairToContract(files, plan, brief);
          if (repaired.changed) {
            files = repaired.files;
            observations.push(`fix: plan repair (${repaired.actions.slice(0, 4).join(', ')})`);
            if (repaired.repairOwnedProduct || repaired.needFloor) {
              floorFallback = true;
              observations.push('fix: repair owned product — Live unlock only (not quality Ready)');
            }
          }
        } catch {
          /* plan repair optional */
        }
      }

      const near = healNearReadyCreateUi(files, opts.productName, brief);
      if (near.changed) {
        files = near.files;
        observations.push(`fix: near-ready heal (${near.actions.join(', ') || 'ok'})`);
      }

      if (evidence.mounted && (!evidence.smokeOk || !evidence.consoleClean)) {
        try {
          const { reactSurgicalMicroAskEdits, askLooksLikeMarketingOrProductHomepage } = await import('@/lib/webProjectCanon');
          if (askLooksLikeMarketingOrProductHomepage(brief)) {
            observations.push('fix: skip surgical micro (marketing/product homepage)');
          } else {
            const patches = reactSurgicalMicroAskEdits(files, brief);
            if (patches.length) {
              for (const e of patches) {
                if (e.path && e.content) files = { ...files, [e.path]: e.content };
              }
              observations.push(`fix: surgical micro (${patches.length} files)`);
            }
          }
        } catch { /* optional */ }
      }

      const gate = previewReadyForBrief(files, {
        productName: opts.productName,
        brief,
      });
      if (!gate.ok) {
        observations.push(`fix: still not static Ready — ${(gate.reasons || []).slice(0, 4).join('; ')}`);
      }

      if (opts.diskRoot && appKey) {
        await applyChatReplyEdits({
          reply: [
            files[appKey] ? `@@@FILE ${appKey}\n${files[appKey]}` : '',
            files['src/App.css'] ? `@@@FILE src/App.css\n${files['src/App.css']}` : '',
            files['src/data/products.ts']
              ? `@@@FILE src/data/products.ts\n${files['src/data/products.ts']}`
              : '',
          ].filter(Boolean).join('\n'),
          projectId: opts.projectId,
          projectName: opts.productName,
          files,
          userMessage: brief,
          diskRoot: opts.diskRoot,
        }).then((r) => { if (r.ok) files = r.files; }).catch(() => {});
      }

      // Commander / agent tools when heals did not close quality (round 2+).
      if (fixRounds >= 2 && !floorFallback && (!evidence.mounted || !evidence.consoleClean || needsQualityFix())) {
        try {
          const planGate = gatePlanPass(files, brief, opts.productName);
          const designGate = gateDesignPass(files, planGate.plan);
          const { shouldUseNovaCreateBuildLoop, runNovaCreateBuildLoop } = await import('@/lib/novaBuildLoop');
          if (shouldUseNovaCreateBuildLoop()) {
            opts.host.pushStatus(createPassStatusLabel('interact', 'commander tools'));
            const commanderPrompt = formatCreateCommanderFixPrompt({
              brief,
              productName: opts.productName,
              evidenceText: formatEvidenceForAgent(evidence),
              planReasons: planGate.reasons,
              designReasons: designGate.reasons,
            });
            const loop = await runNovaCreateBuildLoop({
              brief: commanderPrompt,
              productName: opts.productName,
              files,
              projectId: opts.projectId,
              diskRoot: opts.diskRoot,
              coderId: 'NOVA-auto',
              coderName: 'commander',
              host: opts.host,
              maxFixRounds: 1,
              priorObservations: condenseObservations(observations, 4),
            });
            files = loop.files;
            observations.push(`fix: commander loop → ${loop.ok ? 'ok' : 'incomplete'}`);
          }
        } catch {
          /* agent loop optional */
        }
      }
    } catch (err) {
      observations.push(`fix error: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      await window.novaDesktop?.getOrAttachPreview?.(opts.diskRoot);
    } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 800));
    evidence = await probeOnce();
  }

  opts.host.pushStatus(createPassStatusLabel('critic'));
  const verified = judgeCreateVerified({
    evidence,
    files,
    brief,
    productName: opts.productName,
    floorFallback,
  });

  let judgedOk = verified.qualityReady;
  let judgeReasons = verified.reasons;
  if (verified.liveUnlock) {
    opts.host.pushStatus(
      verified.qualityReady
        ? createRuntimeStageLabel('verified')
        : createRuntimeStageLabel('live', 'unlock — quality still open'),
    );
    if (verified.qualityReady) {
      observations.push('host judge + plan/design PASS — quality Ready');
      opts.host.onStage?.('verified');
    } else {
      observations.push(`quality not Ready: ${judgeReasons.slice(0, 4).join('; ')}`);
      opts.host.onStage?.('live', 'quality open');
    }
  }

  return {
    files,
    evidence,
    fixRounds,
    observations: condenseObservations(observations, 12),
    judgedOk,
    judgeReasons,
    liveUnlock: verified.liveUnlock,
    qualityReady: verified.qualityReady,
    verified,
  };
}
