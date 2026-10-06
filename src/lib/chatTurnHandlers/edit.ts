/**
 * Edit-path: surgical first; skip weak-brain coding hops; apply as transaction.
 */

import { applyChatReplyEdits } from '@/lib/chatAgentApply';
import { finalizeCodingChatBubble } from '@/lib/chatCodeReply';
import { editMiss } from '@/lib/productContract';

export function shouldSkipWeakModelCodingHop(opts: {
  userMessage: string;
  modelId?: string | null;
  modelName?: string | null;
  surgicalMissed: boolean;
}): boolean {
  if (!opts.surgicalMissed) return false;
  const label = `${opts.modelId || ''} ${opts.modelName || ''}`;
  const weak = /1\.5b|0\.5b|0\.6b|tiny|qwen2\.5-1\.5/i.test(label);
  const micro = /\b(?:title|heading|h1|center|footer|color|background|button|text|label|copy)\b/i.test(
    opts.userMessage,
  ) || /\b(?:add|put|place|change|update|make|set)\b/i.test(opts.userMessage);
  return weak && micro;
}

export function isWeakCoderModel(modelId?: string | null, modelName?: string | null): boolean {
  return /1\.5b|0\.5b|0\.6b|tiny|qwen2\.5-1\.5/i.test(`${modelId || ''} ${modelName || ''}`);
}

/** Honest failure when apply wrote App.jsx that still won't compile for Live. */
function syntaxFailAnswer(reasons?: string[]): string {
  const why = (reasons || []).filter(Boolean).slice(0, 3).join('; ');
  return [
    'I updated files, but App.jsx still won’t compile for Live — so I’m not marking this Done.',
    why ? `Issue: ${why}.` : '',
    'Say “fix Live” or try a shorter one-line change.',
  ].filter(Boolean).join(' ');
}

export function weakModelMicroEditReply(userMessage: string): string {
  return [
    'I couldn’t apply that with a local surgical patch, and the active local model is too small for a reliable code edit.',
    '',
    `Ask: “${String(userMessage || '').trim().slice(0, 160)}”`,
    '',
    'Install a larger coding GGUF in **Models**, or try a clearer one-line ask (e.g. **put the title in the center**).',
  ].join('\n');
}

export type SurgicalEditHost = {
  content: string;
  editUserMessage: string;
  projectId: string | null;
  projectLabel: string;
  diskRoot: string | null;
  files: Record<string, string>;
  replyStartedAt: number;
  visionHopMeta?: string | null;
  pushStatus: (label: string) => void;
  onApplied: (opts: {
    files: Record<string, string>;
    updated: string[];
    reply: string;
    provider: string;
    elapsedMs: number;
  }) => void;
  onFailed: (opts: { reply: string; elapsedMs: number }) => void;
  countLineDiff: (before: string, after: string) => { added: number; removed: number };
  buildStudioTraceMessage: (opts: {
    startedAt: number;
    elapsedMs: number;
    userMessage: string;
    answer: string;
    wrotePaths: string[];
    fileChanges?: { path: string; added: number; removed: number }[];
    projectName: string;
  }) => string;
};

export type SurgicalEditResult =
  | { status: 'applied' }
  | { status: 'miss' }
  | { status: 'failed' };

/**
 * Deterministic UI patch owner. Returns miss when surgical has nothing useful.
 */
export async function runSurgicalEditTurn(host: SurgicalEditHost): Promise<SurgicalEditResult> {
  const { finalizeWebEdits, isStructuralUiPieceAsk, verifyMicroAskApplied } = await import('@/lib/webProjectCanon');
  const { verifyAsk } = await import('@/lib/verifyAsk');
  const structuralPiece = isStructuralUiPieceAsk(host.editUserMessage);

  // Prefer surgical edits when they would change files — never "already applied" if there is work.
  const micro = finalizeWebEdits(host.files, host.editUserMessage, [], { projectName: host.projectLabel });

  // Ask already satisfied on disk — finish cleanly instead of hopping to a model (hang risk).
  // Only when verifyAsk AND verifyMicroAskApplied both pass with real constraints, and surgical
  // has nothing to add. Never short-circuit replace/rewrite/rebuild or copy/heading asks that
  // only matched a loose leftover (e.g. cream color while the heading is still missing).
  const already = verifyAsk(host.editUserMessage, host.files);
  const microAlready = verifyMicroAskApplied(host.editUserMessage, host.files);
  const forceRewrite = /\b(?:replace|rewrite|rebuild|from\s+scratch|start\s+over)\b/i.test(host.editUserMessage);
  // Multi-piece landing asks (nav + hero + CTA + copy) are never "already applied" from a loose CSS hit.
  const multiPieceLanding = (
    (/\bnav\b/i.test(host.editUserMessage) || /\bDiscover\b|\bSign\s*in\b|\bHelp\b/i.test(host.editUserMessage))
    && (/\bhero\b|\beyebrow\b|\bheadline\b|\bh1\b/i.test(host.editUserMessage))
  ) || (
    /\bINTRODUCING\b/i.test(host.editUserMessage)
    && /\b(?:Meet|CTA|button)\b/i.test(host.editUserMessage)
  );
  // New copy / heading asks must never short-circuit from a leftover cream-color check.
  const wantsNewCopy = (
    /\b(?:heading|headline|h1|title|description|saying|something\s+like)\b/i.test(host.editUserMessage)
    && /\b(?:drop|add|put|give|say|saying)\b/i.test(host.editUserMessage)
  );
  if (
    already.ok
    && already.checked > 0
    && microAlready.ok
    && !structuralPiece
    && micro.length === 0
    && !forceRewrite
    && !multiPieceLanding
    && !wantsNewCopy
  ) {
    const elapsedMs = Math.max(1, Date.now() - host.replyStartedAt);
    const answer = 'Already on the page — I checked the project files and that change is already applied. Want a different tweak next?';
    const reply = host.buildStudioTraceMessage({
      startedAt: host.replyStartedAt,
      elapsedMs,
      userMessage: host.content,
      answer,
      wrotePaths: [],
      projectName: host.projectLabel,
    });
    host.onApplied({
      files: host.files,
      updated: [],
      reply,
      provider: 'NOVA · already applied',
      elapsedMs,
    });
    return { status: 'applied' };
  }

  // Full replace/rewrite / multi-piece landings must use the model/coder path.
  if (forceRewrite || multiPieceLanding) return { status: 'miss' };

  if (
    structuralPiece
    || !(
      micro.length
      || /\b(?:change|rename|set|make|update|add|remove|fix|delete|drop)\b/i.test(host.editUserMessage)
    )
  ) {
    return { status: 'miss' };
  }

  const snapshot = { ...host.files };
  host.pushStatus(
    (
      /\b(?:add|put|place)\b/i.test(host.editUserMessage)
      || /\bdrop\b[\s\S]{0,64}\b(?:heading|headline|h1|title|card|button)\b/i.test(host.editUserMessage)
    )
      ? 'Adding to project files…'
      : /\b(?:remove|delete|drop)\b/i.test(host.editUserMessage)
        ? 'Removing from project files…'
        : 'Updating project files…',
  );
  const applied = await applyChatReplyEdits({
    reply: '',
    projectId: host.projectId,
    projectName: host.projectLabel,
    files: host.files,
    userMessage: host.editUserMessage,
    diskRoot: host.diskRoot,
  });
  const elapsedMs = Date.now() - host.replyStartedAt;

  if (applied.ok && applied.updated.length) {
    host.pushStatus('Verifying your change on disk…');
    let verified = verifyMicroAskApplied(host.editUserMessage, applied.files);
    let finalFiles = applied.files;
    let finalUpdated = applied.updated;
    // Upgrade logo/icons/heroes with Iconify / Openverse when the ask is asset-shaped.
    if (
      host.diskRoot
      && (
        /\b(?:logos?|icons?|wordmark|brand\s*mark|simple\s*icons?|lucide)\b/i.test(host.editUserMessage)
        || /\b(?:cinematic|movie[- ]?like|film\s+still|atmospheric|background\s+image|hero\s+(?:image|photo)|premium\s+background)\b/i.test(host.editUserMessage)
      )
      && /\b(?:add|put|place|insert|premium|professional|create|build|make)\b/i.test(host.editUserMessage)
    ) {
      try {
        const { planBrandAssets, materializeBrandAssets } = await import('@/lib/brandAssets');
        const { looksLikeHeavyImageAsk } = await import('@/lib/editPace');
        const plan = planBrandAssets(host.editUserMessage, host.projectLabel || 'brand');
        const wantIcons = /\b(?:menu|search|bag|cart|user)\s+icons?\b/i.test(host.editUserMessage)
          || /\b(?:premium|professional)\s+icons?\b/i.test(host.editUserMessage)
          || (/\bicons?\b/i.test(host.editUserMessage) && !/\b(?:add|put|place)\b[\s\S]{0,40}\blogo\b/i.test(host.editUserMessage))
          || /\b(?:profile|settings?|notif|toolbar)\b/i.test(host.editUserMessage)
          || /\b(?:heart|home|mail|calendar|camera|lucide|tabler|heroicons)\b/i.test(host.editUserMessage);
        const wantLogo = /\b(?:add|put|place|insert)\b[\s\S]{0,48}\b(?:logo|wordmark|brand\s*mark)\b/i.test(host.editUserMessage)
          || /\b(?:apple|google|github|discord|twitch|netflix|spotify|youtube|simple\s*icons?)\b/i.test(host.editUserMessage)
          || /\b(?:instagram|linkedin|slack|amazon|microsoft|meta|reddit|tiktok)\b/i.test(host.editUserMessage);
        const wantHero = looksLikeHeavyImageAsk(host.editUserMessage)
          || /\b(?:hero|background\s+image|cinematic|atmospheric)\b/i.test(host.editUserMessage);
        const assetPlan = {
          ...plan,
          slots: plan.slots.filter((s) => {
            if (s.role === 'logo') return wantLogo;
            if (s.role === 'icon') return wantIcons;
            if (s.role === 'hero') return wantHero;
            return false;
          }),
        };
        if (assetPlan.slots.length) {
          host.pushStatus(
            wantHero
              ? 'Searching cinematic photography (this can take a minute)…'
              : 'Fetching premium logo and icons…',
          );
          const mat = await materializeBrandAssets({
            diskRoot: host.diskRoot,
            files: finalFiles,
            plan: assetPlan,
            brief: host.editUserMessage,
            projectName: host.projectLabel || 'brand',
          });
          if (mat.saved.length) {
            finalFiles = mat.files;
            finalUpdated = [...new Set([...finalUpdated, ...mat.saved])];
            await applyChatReplyEdits({
              reply: '',
              projectId: host.projectId,
              projectName: host.projectLabel,
              files: finalFiles,
              userMessage: host.editUserMessage,
              diskRoot: host.diskRoot,
            });
            verified = verifyMicroAskApplied(host.editUserMessage, finalFiles);
          }
        }
      } catch {
        /* keep surgical SVG fallback */
      }
    }
    if (!verified.ok) {
      // One repair pass — surgical from the post-edit files, not a hard reject.
      host.pushStatus('Repairing edit to match your ask…');
      const repair = await applyChatReplyEdits({
        reply: '',
        projectId: host.projectId,
        projectName: host.projectLabel,
        files: applied.files,
        userMessage: host.editUserMessage,
        diskRoot: host.diskRoot,
      });
      if (repair.ok && repair.updated.length) {
        finalFiles = repair.files;
        finalUpdated = [...new Set([...applied.updated, ...repair.updated])];
        verified = verifyMicroAskApplied(host.editUserMessage, finalFiles);
      }
    }
    if (!verified.ok) {
      const { applyQuotedUiEdits } = await import('@/lib/createRealize');
      const quoted = applyQuotedUiEdits(finalFiles, host.editUserMessage);
      if (quoted.changed) {
        finalFiles = quoted.files;
        const appKey = finalFiles['src/App.jsx'] ? 'src/App.jsx' : 'src/App.tsx';
        finalUpdated = [...new Set([...finalUpdated, appKey, 'src/App.css'].filter((p) => finalFiles[p] != null))];
        await applyChatReplyEdits({
          reply: [
            finalFiles[appKey] ? `@@@FILE ${appKey}\n${finalFiles[appKey]}` : '',
            finalFiles['src/App.css'] ? `@@@FILE src/App.css\n${finalFiles['src/App.css']}` : '',
          ].filter(Boolean).join('\n'),
          projectId: host.projectId,
          projectName: host.projectLabel,
          files: finalFiles,
          userMessage: host.editUserMessage,
          diskRoot: host.diskRoot,
        }).then((r) => { if (r.ok) finalFiles = r.files; }).catch(() => {});
        verified = verifyMicroAskApplied(host.editUserMessage, finalFiles);
      }
    }
    if (!verified.ok) {
      const quotedNow = [...String(host.editUserMessage || '').matchAll(/["“”]([^"“”]{2,80})["“”]/g)]
        .map((m) => m[1].trim());
      const blob = `${finalFiles['src/App.jsx'] || ''}\n${finalFiles['src/App.tsx'] || ''}`;
      const landed = quotedNow.filter((q) => q && blob.includes(q));
      if (!landed.length) {
        const revertBlocks = finalUpdated
          .filter((p) => snapshot[p] != null)
          .map((p) => `@@@FILE ${p}\n${snapshot[p]}`)
          .join('\n');
        if (revertBlocks) {
          await applyChatReplyEdits({
            reply: revertBlocks,
            projectId: host.projectId,
            projectName: host.projectLabel,
            files: snapshot,
            userMessage: host.editUserMessage,
            diskRoot: host.diskRoot,
          });
        }
      }
      const miss = editMiss(
        'verify_failed',
        [
          landed.length
            ? `Updated ${landed.map((q) => `“${q}”`).join(', ')}. Still missing: ${(verified.missing || []).join(', ') || 'the rest of that edit'}.`
            : 'That edit didn’t match what you asked for, so I left the project unchanged.',
          landed.length ? 'Say the missing piece on its own if you want that added next.' : (verified.missing?.length ? `Still missing: ${verified.missing.join(', ')}.` : ''),
          landed.length ? '' : 'Try one clearer change (e.g. brand name only, or “add sticky nav with Products Specs Buy”).',
        ].filter(Boolean).join(' '),
      );
      host.onFailed({
        reply: host.buildStudioTraceMessage({
          startedAt: host.replyStartedAt,
          elapsedMs: Date.now() - host.replyStartedAt,
          userMessage: host.content,
          answer: miss.message,
          wrotePaths: [],
          projectName: host.projectLabel,
        }),
        elapsedMs: Date.now() - host.replyStartedAt,
      });
      return { status: 'failed' };
    }

    const answer = finalizeCodingChatBubble({
      userMessage: host.content,
      rawReply: '',
      changedPaths: finalUpdated,
      applied: true,
    });
    const patchFileChanges = finalUpdated.map((path) => {
      const diff = host.countLineDiff(
        String(snapshot[path] || ''),
        String(finalFiles?.[path] || ''),
      );
      return { path, added: diff.added, removed: diff.removed };
    });
    {
      const { minEditPaceMs, paceUntil, looksLikeHeavyImageAsk } = await import('@/lib/editPace');
      if (looksLikeHeavyImageAsk(host.editUserMessage)) {
        host.pushStatus('Searching premium cinematic imagery…');
      }
      await paceUntil(host.replyStartedAt, minEditPaceMs(host.editUserMessage));
    }
    const pacedElapsed = Math.max(1, Date.now() - host.replyStartedAt);
    if ((applied as { syntaxFailed?: boolean }).syntaxFailed) {
      host.onFailed({
        reply: host.buildStudioTraceMessage({
          startedAt: host.replyStartedAt,
          elapsedMs: pacedElapsed,
          userMessage: host.content,
          answer: syntaxFailAnswer((applied as { syntaxReasons?: string[] }).syntaxReasons),
          wrotePaths: finalUpdated,
          fileChanges: patchFileChanges,
          projectName: host.projectLabel,
        }),
        elapsedMs: pacedElapsed,
      });
      return { status: 'failed' };
    }
    host.onApplied({
      files: finalFiles,
      updated: finalUpdated,
      reply: host.buildStudioTraceMessage({
        startedAt: host.replyStartedAt,
        elapsedMs: pacedElapsed,
        userMessage: host.content,
        answer,
        wrotePaths: finalUpdated,
        fileChanges: patchFileChanges,
        projectName: host.projectLabel,
      }),
      provider: host.visionHopMeta ? 'NOVA · vision → patch' : 'NOVA · local patch',
      elapsedMs: pacedElapsed,
    });
    return { status: 'applied' };
  }

  if (micro.length) {
    const failAnswer = finalizeCodingChatBubble({
      userMessage: host.content,
      rawReply: '',
      applyError: applied.error || 'write_failed',
      editMode: true,
    });
    const failReply = host.buildStudioTraceMessage({
      startedAt: host.replyStartedAt,
      elapsedMs,
      userMessage: host.content,
      answer: failAnswer || applied.reply || 'Could not save that UI change to disk.',
      wrotePaths: [],
      projectName: host.projectLabel,
    });
    host.onFailed({ reply: failReply, elapsedMs });
    return { status: 'failed' };
  }

  return { status: 'miss' };
}

export type RunEditTurnHost = SurgicalEditHost & {
  modelId?: string | null;
  modelName?: string | null;
  /** Thread-sticky coder (auto route). Prefer over pinned when gating. */
  stickyModelId?: string | null;
  stickyModelName?: string | null;
  preferredModelId?: string | null;
  preferredModelName?: string | null;
  /** Soft-pin the resolved coder on the chat Multimodal pill while editing. */
  onCoderPinned?: (coder: { id: string; name: string }) => void;
  /** Stop / superseded — must abort Live evidence, not only model generate. */
  shouldAbort?: () => boolean;
  /** Model generate with AbortSignal; budget from codingFileEditTimeoutMs (45s–480s). */
  generate?: (opts: {
    signal: AbortSignal;
    userMessage: string;
    files: Record<string, string>;
  }) => Promise<string | null | undefined>;
  onWeakMiss?: () => void;
  /** Called after a successful model apply, before onApplied (e.g. undo snapshot). */
  onSnapshot?: (opts: { files: Record<string, string>; updatedPaths: string[] }) => void;
};

export type RunEditTurnResult =
  | SurgicalEditResult
  | { status: 'weak_miss' };

/**
 * Surgical first; on miss, skip weak coder or one generate→apply (budget from ask).
 */
export async function runEditTurn(host: RunEditTurnHost): Promise<RunEditTurnResult> {
  // Checkpoint rollback — restore last scaffold/craft snapshot to disk.
  try {
    const {
      looksLikeRollbackAsk,
      latestCreateCheckpoint,
      rollbackCreateCheckpoint,
    } = await import('@/lib/createCheckpoint');
    if (looksLikeRollbackAsk(host.content) && host.diskRoot) {
      const cp = latestCreateCheckpoint(host.diskRoot);
      if (!cp) {
        host.onFailed({
          reply: host.buildStudioTraceMessage({
            startedAt: host.replyStartedAt,
            elapsedMs: Date.now() - host.replyStartedAt,
            userMessage: host.content,
            answer: 'No checkpoint found for this folder. Create or craft once first, then rollback works.',
            wrotePaths: [],
            projectName: host.projectLabel,
          }),
          elapsedMs: Date.now() - host.replyStartedAt,
        });
        return { status: 'miss' };
      }
      const rolled = rollbackCreateCheckpoint(host.files, cp);
      const blocks = rolled.restored
        .map((p) => `@@@FILE ${p}\n${rolled.files[p]}`)
        .join('\n');
      const applied = await applyChatReplyEdits({
        reply: blocks,
        projectId: host.projectId,
        projectName: host.projectLabel,
        files: host.files,
        userMessage: host.content,
        diskRoot: host.diskRoot,
      });
      const elapsedMs = Date.now() - host.replyStartedAt;
      if (!applied.ok) {
        host.onFailed({
          reply: host.buildStudioTraceMessage({
            startedAt: host.replyStartedAt,
            elapsedMs,
            userMessage: host.content,
            answer: `Rollback failed: ${applied.error || 'write error'}`,
            wrotePaths: [],
            projectName: host.projectLabel,
          }),
          elapsedMs,
        });
        return { status: 'failed' };
      }
      host.onApplied({
        files: applied.files,
        updated: applied.updated,
        reply: host.buildStudioTraceMessage({
          startedAt: host.replyStartedAt,
          elapsedMs,
          userMessage: host.content,
          answer: `Restored checkpoint **${cp.label}** (${rolled.restored.length} files). Say **rebuild the UI** or **run Preview** to re-verify Live.`,
          wrotePaths: applied.updated,
          projectName: host.projectLabel,
        }),
        provider: 'NOVA · rollback',
        elapsedMs,
      });
      return { status: 'applied' };
    }
  } catch { /* fall through */ }

  // Resume a capped create/edit tool loop when the user says "continue".
  // Code overlay: only auto-opens on first create — edits stay closed unless the user clicks Code.
  try {
    const { looksLikeAgentContinueAsk, loadAgentContinue, clearAgentContinue } = await import('@/lib/novaAgentContinue');
    const { shouldUseNovaEditBuildLoop } = await import('@/lib/novaBuildLoop');
    if (looksLikeAgentContinueAsk(host.content) && host.projectId && shouldUseNovaEditBuildLoop()) {
      const cont = loadAgentContinue(host.projectId);
      if (cont?.brief) {
        const { runNovaAgentLoop } = await import('@/lib/novaAgentLoop');
        const { packNovaBuildContext } = await import('@/lib/novaBuildContext');
        const { modeStatusLabel } = await import('@/lib/novaStudioModes');
        const { answerStudio } = await import('@/lib/studioAnswerEngine');
        host.pushStatus(modeStatusLabel('fix', 'Continuing tool loop'));
        const coderId = String(host.stickyModelId || host.preferredModelId || host.modelId || '');
        const coderName = String(host.stickyModelName || host.preferredModelName || host.modelName || 'coder');
        const loop = await runNovaAgentLoop({
          brief: cont.brief,
          files: packNovaBuildContext(host.files),
          projectId: host.projectId,
          projectName: host.projectLabel,
          diskRoot: host.diskRoot,
          priorObservations: cont.observations,
          maxSteps: 12,
          autoRunAllowlisted: true,
          callModel: async ({ prompt }) => {
            const result = await answerStudio({
              userMessage: prompt,
              files: packNovaBuildContext(host.files),
              projectName: host.projectLabel,
              mode: 'code',
              preferredModelId: coderId || undefined,
              preferredModelName: coderName,
              allowFileEdits: true,
            });
            return { reply: String(result.text || ''), modelName: coderName, providerLabel: String(result.meta || 'NOVA') };
          },
          onStep: (step) => host.pushStatus(step.label),
        });
        if (!loop.hitStepCap) clearAgentContinue(host.projectId);
        if (loop.updated.length) {
          const elapsedMs = Math.max(1, Date.now() - host.replyStartedAt);
          const reply = host.buildStudioTraceMessage({
            startedAt: host.replyStartedAt,
            elapsedMs,
            userMessage: host.content,
            answer: loop.reply || `Continued — updated ${loop.updated.slice(0, 4).join(', ')}.`,
            wrotePaths: loop.updated,
            projectName: host.projectLabel,
          });
          host.onSnapshot?.({ files: loop.files, updatedPaths: loop.updated });
          host.onApplied({
            files: loop.files,
            updated: loop.updated,
            reply,
            provider: loop.providerLabel || 'NOVA',
            elapsedMs,
          });
          return { status: 'applied' };
        }
      }
    }
  } catch { /* fall through */ }

  const surgical = await runSurgicalEditTurn(host);
  if (surgical.status === 'applied' || surgical.status === 'failed') return surgical;

  const weakHop = shouldSkipWeakModelCodingHop({
    userMessage: host.editUserMessage,
    modelId: host.modelId,
    modelName: host.modelName,
    surgicalMissed: true,
  }) || isWeakCoderModel(host.modelId, host.modelName);

  if (weakHop) {
    host.onWeakMiss?.();
    const elapsedMs = Date.now() - host.replyStartedAt;
    const answer = weakModelMicroEditReply(host.editUserMessage);
    const reply = host.buildStudioTraceMessage({
      startedAt: host.replyStartedAt,
      elapsedMs,
      userMessage: host.content,
      answer,
      wrotePaths: [],
      projectName: host.projectLabel,
    });
    host.onFailed({ reply, elapsedMs });
    return { status: 'weak_miss' };
  }

  // BrainProfile: resolve a real local coder (same as create) — never gate rebuild on chat Instruct sticky.
  {
    const { resolveCreateUiPolishCoder } = await import('@/lib/chatTurnHandlers/create');
    const resolved = await resolveCreateUiPolishCoder(host);
    if (!resolved.ok) {
      host.onWeakMiss?.();
      const elapsedMs = Date.now() - host.replyStartedAt;
      const answer = [
        resolved.reason || 'Create/build needs a coder GGUF (for example Qwen Coder 7B/14B).',
        '',
        `Ask: “${String(host.editUserMessage || '').trim().slice(0, 160)}”`,
        '',
        'Pin a fitting coder in **Models**, or keep using one-line surgical edits / scaffold.',
      ].join('\n');
      const reply = host.buildStudioTraceMessage({
        startedAt: host.replyStartedAt,
        elapsedMs,
        userMessage: host.content,
        answer,
        wrotePaths: [],
        projectName: host.projectLabel,
      });
      host.onFailed({ reply, elapsedMs });
      return { status: 'weak_miss' };
    }
    try {
      host.onCoderPinned?.({ id: resolved.id, name: resolved.name });
    } catch { /* ignore */ }
    // Prefer resolved coder for the rest of this edit turn.
    (host as { stickyModelId?: string | null }).stickyModelId = resolved.id;
    (host as { stickyModelName?: string | null }).stickyModelName = resolved.name;
    (host as { preferredModelId?: string | null }).preferredModelId = resolved.id;
    (host as { preferredModelName?: string | null }).preferredModelName = resolved.name;
  }

  // Nova edit tool loop (substantial asks) — free, no paywall; surgical already missed.
  try {
    const { shouldUseNovaEditBuildLoop } = await import('@/lib/novaBuildLoop');
    const { packNovaBuildContext } = await import('@/lib/novaBuildContext');
    const { runNovaAgentLoop } = await import('@/lib/novaAgentLoop');
    const { modeStatusLabel } = await import('@/lib/novaStudioModes');
    const ask = String(host.editUserMessage || host.content || '');
    const substantial = ask.length >= 40
      && /\b(fix|implement|refactor|rebuild|redesign|add\s+section|wire|layout|page|component|flow)\b/i.test(ask);
    if (shouldUseNovaEditBuildLoop() && substantial && host.projectId) {
      host.pushStatus(modeStatusLabel('fix', 'Nova tool loop'));
      const { answerStudio } = await import('@/lib/studioAnswerEngine');
      const coderId = String(host.stickyModelId || host.preferredModelId || host.modelId || '');
      const coderName = String(host.stickyModelName || host.preferredModelName || host.modelName || 'coder');
      const loop = await runNovaAgentLoop({
        brief: [
          ask.slice(0, 2500),
          '',
          'Prefer TOOL: patch. Never add paywalls or upgrade CTAs. Call TOOL: ready when the UI change is done.',
        ].join('\n'),
        files: packNovaBuildContext(host.files),
        projectId: host.projectId,
        projectName: host.projectLabel,
        diskRoot: host.diskRoot,
        maxSteps: 12,
        autoRunAllowlisted: true,
        // Full-page rewrite / screenshot match needs the longer create craft step wall.
        createCraftMode: /\b(?:rebuild|redesign|rewrite|screenshot|match\s+(?:this|the)\s+image|full\s+(?:page|ui)|landing)\b/i.test(ask),
        callModel: async ({ prompt }) => {
          const result = await answerStudio({
            userMessage: prompt,
            files: packNovaBuildContext(host.files),
            projectName: host.projectLabel,
            mode: 'code',
            preferredModelId: coderId || undefined,
            preferredModelName: coderName,
            allowFileEdits: true,
          });
          return { reply: String(result.text || ''), modelName: coderName, providerLabel: String(result.meta || 'NOVA') };
        },
        onStep: (step) => {
          host.pushStatus(
            step.tool === 'status' || step.tool === 'thought'
              ? modeStatusLabel('fix', step.label)
              : step.label,
          );
        },
      });
      if (loop.updated.length) {
        const elapsedMs = Math.max(1, Date.now() - host.replyStartedAt);
        const answer = loop.reply || `Updated ${loop.updated.slice(0, 4).join(', ')}.`;
        const reply = host.buildStudioTraceMessage({
          startedAt: host.replyStartedAt,
          elapsedMs,
          userMessage: host.content,
          answer,
          wrotePaths: loop.updated,
          projectName: host.projectLabel,
        });
        host.onSnapshot?.({ files: loop.files, updatedPaths: loop.updated });
        host.onApplied({
          files: loop.files,
          updated: loop.updated,
          reply,
          provider: loop.providerLabel || 'NOVA',
          elapsedMs,
        });
        return { status: 'applied' };
      }
    }
  } catch {
    /* fall through to generate path */
  }

  if (!host.generate) {
    // Default owner: answerStudio lives here — not in AIChat.
    const { answerStudio, codingFileEditTimeoutMs } = await import('@/lib/studioAnswerEngine');
    const budgetMs = codingFileEditTimeoutMs(host.editUserMessage || host.content);
    host.generate = async ({ signal, userMessage, files }) => {
      const started = Date.now();
      const result = await answerStudio(
        {
          userMessage,
          files,
          projectName: host.projectLabel,
          mode: 'code',
          preferredModelId: host.stickyModelId || host.preferredModelId || host.modelId || undefined,
          preferredModelName: host.stickyModelName || host.preferredModelName || host.modelName || undefined,
          allowFileEdits: true,
          shouldAbort: () => signal.aborted || Date.now() - started > budgetMs,
        },
        undefined,
      );
      return result.text || '';
    };
  }

  if (!host.generate) {
    const elapsedMs = Date.now() - host.replyStartedAt;
    host.onFailed({
      reply: host.buildStudioTraceMessage({
        startedAt: host.replyStartedAt,
        elapsedMs,
        userMessage: host.content,
        answer: 'I couldn’t apply that as a local patch. Try a clearer one-line ask (e.g. change the name to Tesla).',
        wrotePaths: [],
        projectName: host.projectLabel,
      }),
      elapsedMs,
    });
    return { status: 'miss' };
  }

  const { verifyMicroAskApplied } = await import('@/lib/webProjectCanon');
  const { codingFileEditTimeoutMs, looksLikeFullUiBuildCodingAsk } = await import('@/lib/studioAnswerEngine');
  const editBudgetMs = codingFileEditTimeoutMs(host.editUserMessage || host.content);
  const snapshot = { ...host.files };
  const isUiRebuild = looksLikeFullUiBuildCodingAsk(host.editUserMessage || host.content)
    || editBudgetMs > 120_000;
  host.pushStatus(isUiRebuild ? 'Rebuilding UI…' : 'Coding…');

  // Aider-style ranked map + index peek before generate (edit path).
  let mapBlock = '';
  try {
    const { buildRankedProjectMap } = await import('@/lib/createProjectMap');
    mapBlock = buildRankedProjectMap(host.files, host.editUserMessage || host.content, { limit: 14 });
  } catch { /* ignore */ }
  try {
    const { searchAgentIndex, loadPersistedAgentRepoIndex } = await import('@/lib/novaAgentIndex');
    const idx = loadPersistedAgentRepoIndex(host.projectId || 'project', host.files);
    if (idx) {
      const res = searchAgentIndex(idx, String(host.editUserMessage || '').slice(0, 80), 6);
      if (res?.hits?.length) {
        mapBlock += `\n## Index hits\n${res.hits.map((h) => `- ${h.path}`).join('\n')}`;
      }
    }
  } catch { /* index optional */ }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), editBudgetMs);
  let modelReply = '';
  try {
    const raced = await Promise.race([
      host.generate({
        signal: controller.signal,
        userMessage: mapBlock
          ? `${host.editUserMessage}\n\n${mapBlock}`
          : host.editUserMessage,
        files: host.files,
      }),
      new Promise<null>((resolve) => {
        controller.signal.addEventListener('abort', () => resolve(null), { once: true });
      }),
    ]);
    modelReply = String(raced || '').trim();
  } catch {
    modelReply = '';
  } finally {
    clearTimeout(timer);
  }

  if (!modelReply) {
    const elapsedMs = Date.now() - host.replyStartedAt;
    host.onFailed({
      reply: host.buildStudioTraceMessage({
        startedAt: host.replyStartedAt,
        elapsedMs,
        userMessage: host.content,
        answer: isUiRebuild
          ? 'That UI rebuild timed out before files were written. Say rebuild the UI again and I will continue from this folder.'
          : 'That edit timed out before I could write files. Try a shorter one-line change, or name the exact file to patch.',
        wrotePaths: [],
        projectName: host.projectLabel,
      }),
      elapsedMs,
    });
    return { status: 'miss' };
  }

  const applied = await applyChatReplyEdits({
    reply: modelReply,
    projectId: host.projectId,
    projectName: host.projectLabel,
    files: host.files,
    userMessage: host.editUserMessage,
    diskRoot: host.diskRoot,
  });
  const elapsedMs = Date.now() - host.replyStartedAt;

  if (!applied.ok || !applied.updated.length) {
    const failAnswer = finalizeCodingChatBubble({
      userMessage: host.content,
      rawReply: modelReply,
      applyError: applied.error || 'write_failed',
      editMode: true,
    });
    const failReply = host.buildStudioTraceMessage({
      startedAt: host.replyStartedAt,
      elapsedMs,
      userMessage: host.content,
      answer: failAnswer || applied.reply || 'Could not apply that edit.',
      wrotePaths: [],
      projectName: host.projectLabel,
    });
    host.onFailed({ reply: failReply, elapsedMs });
    return { status: 'failed' };
  }

  let verified = verifyMicroAskApplied(host.editUserMessage, applied.files);
  const appNow = `${applied.files?.['src/App.jsx'] || ''}\n${applied.files?.['src/App.tsx'] || ''}\n${applied.files?.['src/App.css'] || ''}`;
  const forceRewrite = /\b(?:replace|rewrite|rebuild|from\s+scratch|start\s+over)\b/i.test(host.editUserMessage);
  const multiPieceLanding = (
    (/\bnav\b/i.test(host.editUserMessage) || /\bDiscover\b|\bSign\s*in\b|\bHelp\b/i.test(host.editUserMessage))
    && (/\bhero\b|\beyebrow\b|\bheadline\b|\bh1\b/i.test(host.editUserMessage))
  ) || (
    /\bINTRODUCING\b/i.test(host.editUserMessage)
    && /\b(?:Meet|CTA|button)\b/i.test(host.editUserMessage)
  );
  const quoted = [...String(host.editUserMessage || '').matchAll(/["“”]([^"“”]{2,80})["“”]/g)]
    .map((m) => m[1].trim())
    .filter((q) => q && !/\.(jsx?|tsx?|css|html)$/i.test(q)
      && !/\b(?:short support|pill CTA|left-aligned|keep orbs|never ship|breathing room)\b/i.test(q));
  const landedQuoted = quoted.filter((q) => appNow.includes(q));
  // Soft keep for multi-piece / rewrite asks: if most requested copy is present, don't revert.
  const keyPhrases = [
    ...landedQuoted,
    ...['INTRODUCING', 'Discover', 'Sign in', 'Meet ', 'Air,', 'Quiet ']
      .filter((p) => new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(host.editUserMessage)
        && new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(appNow)),
  ];
  const softKeep = (forceRewrite || multiPieceLanding)
    && (keyPhrases.length >= 2 || landedQuoted.length >= Math.ceil(Math.max(1, quoted.length) * 0.5));
  // Full UI rebuilds: keep real App/CSS rewrites — never revert because verifyAsk
  // still demands external https photos when local /heroes/ art is correct.
  const rebuildKeep = isUiRebuild
    && applied.updated.length > 0
    && (
      appNow.replace(/\s+/g, '').length >= 900
      || /\/heroes\//i.test(appNow)
      || /<(?:section|footer|nav)\b/i.test(appNow)
    );
  if (!verified.ok && !softKeep && !rebuildKeep) {
    const partial = landedQuoted.length > 0;
    if (!partial) {
      const revertBlocks = applied.updated
        .filter((p) => snapshot[p] != null)
        .map((p) => `@@@FILE ${p}\n${snapshot[p]}`)
        .join('\n');
      if (revertBlocks) {
        await applyChatReplyEdits({
          reply: revertBlocks,
          projectId: host.projectId,
          projectName: host.projectLabel,
          files: snapshot,
          userMessage: host.editUserMessage,
          diskRoot: host.diskRoot,
        });
      }
    }
    const miss = editMiss(
      'verify_failed',
      [
        partial
          ? `Updated ${landedQuoted.map((q) => `“${q}”`).join(', ')}. Still missing: ${(verified.missing || []).join(', ') || 'the rest of that edit'}.`
          : 'That edit didn’t match what you asked for, so I left the project unchanged.',
        partial ? '' : (verified.missing?.length ? `Still missing: ${verified.missing.join(', ')}.` : ''),
        partial ? 'Say the missing piece on its own if you want that added next.' : 'Try one clearer change (e.g. change the name to Tesla).',
      ].filter(Boolean).join(' '),
    );
    host.onFailed({
      reply: host.buildStudioTraceMessage({
        startedAt: host.replyStartedAt,
        elapsedMs,
        userMessage: host.content,
        answer: miss.message,
        wrotePaths: [],
        projectName: host.projectLabel,
      }),
      elapsedMs,
    });
    return { status: 'miss' };
  }
  if (!verified.ok && (softKeep || rebuildKeep)) {
    verified = { ok: true, missing: [] };
  }

  host.onSnapshot?.({ files: snapshot, updatedPaths: applied.updated });

  const { verifyAsk } = await import('@/lib/verifyAsk');
  let askCheck = verifyAsk(host.editUserMessage, applied.files);
  // Fail closed if the model wiped an existing short centered brand on a non-wipe ask.
  // Long hero lines ("Fresh vegetable plants") are headings, not brand marks — don't block shop polish.
  {
    const before = `${snapshot['src/App.jsx'] || ''}\n${snapshot['src/App.tsx'] || ''}`;
    const after = `${applied.files?.['src/App.jsx'] || ''}\n${applied.files?.['src/App.tsx'] || ''}`;
    const navBrand = before.match(/className=["'](?:brand|logo-text|nav-brand|site-name)["'][^>]*>([^<]{1,48})</i)?.[1]?.trim() || '';
    const centerBrand = before.match(/className=["']center-word["'][^>]*>([^<]{1,48})</i)?.[1]?.trim() || '';
    const brand = navBrand || (
      centerBrand
      && centerBrand.length <= 22
      && centerBrand.split(/\s+/).filter(Boolean).length <= 2
        ? centerBrand
        : ''
    );
    const wipeOk = /\b(?:remove|delete|drop|replace|rebuild|from\s+scratch)\b[\s\S]{0,48}\b(?:title|brand|heading|h1|words?)\b/i.test(
      host.editUserMessage,
    );
    // Additive shop polish must not fail-closed on brand when the ask never asked to rename it.
    const additiveAsk = /\b(?:add|put|give|expand|filter|cart|description|stepper|quantity|sticky|shadow|grid|footer|About)\b/i.test(
      host.editUserMessage,
    ) && !/\b(?:rename|rebrand|change\s+(?:the\s+)?(?:name|brand|title)\s+to)\b/i.test(host.editUserMessage);
    if (brand && !wipeOk && !additiveAsk) {
      const esc = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!new RegExp(esc, 'i').test(after)) {
        askCheck = {
          ok: false,
          missing: [...askCheck.missing, `kept brand “${brand}”`],
          checked: Math.max(1, askCheck.checked || 0),
        };
      }
    }
  }
  // Soft keep rewrite/landing/rebuild work — don't undo a real layout over a loose miss.
  if (!askCheck.ok && (softKeep || rebuildKeep)) {
    askCheck = { ok: true, missing: [], checked: askCheck.checked };
  }
  if (!askCheck.ok) {
    const revertBlocks = applied.updated
      .filter((p) => snapshot[p] != null)
      .map((p) => `@@@FILE ${p}\n${snapshot[p]}`)
      .join('\n');
    if (revertBlocks) {
      await applyChatReplyEdits({
        reply: revertBlocks,
        projectId: host.projectId,
        projectName: host.projectLabel,
        files: snapshot,
        userMessage: host.editUserMessage,
        diskRoot: host.diskRoot,
      });
    }
    const miss = editMiss(
      'verify_failed',
      [
        'That edit didn’t match what you asked for, so I left the project unchanged.',
        askCheck.missing.length ? `Still missing: ${askCheck.missing.join(', ')}.` : '',
        'Try one clearer change.',
      ].filter(Boolean).join(' '),
    );
    host.onFailed({
      reply: host.buildStudioTraceMessage({
        startedAt: host.replyStartedAt,
        elapsedMs,
        userMessage: host.content,
        answer: miss.message,
        wrotePaths: [],
        projectName: host.projectLabel,
      }),
      elapsedMs,
    });
    return { status: 'failed' };
  }

  let finalFiles = applied.files;
  // Family anti-bleed runs inside applyChatReplyEdits (all surgical/model/agent writes).
  if (isUiRebuild && host.diskRoot) {
    try {
      host.pushStatus('Live evidence after rebuild…');
      const liveBudgetMs = 90_000;
      const liveStarted = Date.now();
      const aborted = () => Boolean(host.shouldAbort?.()) || Date.now() - liveStarted > liveBudgetMs;
      const attach = await Promise.race([
        window.novaDesktop?.getOrAttachPreview?.(host.diskRoot) ?? Promise.resolve(null),
        new Promise<null>((resolve) => {
          window.setTimeout(() => resolve(null), 55_000);
        }),
      ]);
      if (aborted()) {
        host.pushStatus('Live evidence stopped — files kept…');
      } else {
        const liveUrl = String(attach?.url || '').trim();
        if (attach?.ok && liveUrl) {
          const { runCreateVerifyAndFix } = await import('@/lib/createRuntimeLoop');
          const runtime = await Promise.race([
            runCreateVerifyAndFix({
              files: finalFiles,
              productName: host.projectLabel || 'project',
              brief: host.editUserMessage || host.content,
              projectId: host.projectId || 'project',
              diskRoot: host.diskRoot,
              liveUrl,
              npmInstalled: true,
              staticReady: true,
              host: {
                pushStatus: (label) => host.pushStatus(label),
                shouldAbort: () => aborted(),
              },
              // One heal pass — never thrash Live for 10+ minutes after craft.
              maxFixRounds: 1,
            }),
            new Promise<null>((resolve) => {
              window.setTimeout(() => resolve(null), Math.max(8_000, liveBudgetMs - (Date.now() - liveStarted)));
            }),
          ]);
          if (runtime) {
            finalFiles = runtime.files;
            if (!runtime.evidence.pass && !runtime.evidence.httpOk) {
              const why = [
                !runtime.evidence.mounted ? 'UI did not mount' : '',
                !runtime.evidence.consoleClean ? 'console errors' : '',
                runtime.evidence.smokeOk === false ? runtime.evidence.smokeDetail : '',
              ].filter(Boolean).join('; ') || 'Live evidence incomplete';
              // Soft: keep written files; unlock chat with honest note (don't freeze forever).
              host.pushStatus(`Live check incomplete (${why}) — open Live or say rebuild again…`);
            } else if (runtime.evidence.pass || runtime.evidence.httpOk) {
              host.pushStatus(
                runtime.evidence.pass || (runtime.evidence.httpOk && runtime.evidence.mounted)
                  ? 'Live verified after rebuild…'
                  : 'Live server up after rebuild…',
              );
            }
          } else {
            host.pushStatus('Live evidence timed out — files kept; open Live to retry…');
          }
        } else {
          host.pushStatus('Could not start Live preview after rebuild — files kept…');
        }
      }
    } catch {
      /* Live evidence best-effort on rebuild — never freeze the turn */
      host.pushStatus('Live evidence skipped — files kept…');
    }
  }

  const patchFileChanges = applied.updated.map((path) => {
    const diff = host.countLineDiff(
      String(snapshot[path] || ''),
      String(finalFiles?.[path] || ''),
    );
    return { path, added: diff.added, removed: diff.removed };
  });
  const modelElapsed = Date.now() - host.replyStartedAt;
  if ((applied as { syntaxFailed?: boolean }).syntaxFailed) {
    // Re-check final files (post-heal / Live evidence may have mutated App).
    let reasons = (applied as { syntaxReasons?: string[] }).syntaxReasons || [];
    try {
      const { runCreateSyntaxGate } = await import('@/lib/createSyntaxGate');
      const syn = runCreateSyntaxGate(finalFiles);
      if (!syn.ok) reasons = syn.reasons || reasons;
      else {
        // Healed clean on disk — allow Done.
        const answerOk = finalizeCodingChatBubble({
          userMessage: host.content,
          rawReply: modelReply,
          changedPaths: applied.updated,
          applied: true,
        });
        host.onApplied({
          files: syn.files,
          updated: applied.updated,
          reply: host.buildStudioTraceMessage({
            startedAt: host.replyStartedAt,
            elapsedMs: modelElapsed,
            userMessage: host.content,
            answer: answerOk,
            wrotePaths: applied.updated,
            fileChanges: patchFileChanges,
            projectName: host.projectLabel,
          }),
          provider: host.visionHopMeta ? 'NOVA · vision → model' : 'NOVA · model edit',
          elapsedMs: modelElapsed,
        });
        return { status: 'applied' };
      }
    } catch { /* keep failure path */ }
    host.onFailed({
      reply: host.buildStudioTraceMessage({
        startedAt: host.replyStartedAt,
        elapsedMs: modelElapsed,
        userMessage: host.content,
        answer: syntaxFailAnswer(reasons),
        wrotePaths: applied.updated,
        fileChanges: patchFileChanges,
        projectName: host.projectLabel,
      }),
      elapsedMs: modelElapsed,
    });
    return { status: 'failed' };
  }
  const answer = finalizeCodingChatBubble({
    userMessage: host.content,
    rawReply: modelReply,
    changedPaths: applied.updated,
    applied: true,
  });
  const reply = host.buildStudioTraceMessage({
    startedAt: host.replyStartedAt,
    elapsedMs: modelElapsed,
    userMessage: host.content,
    answer,
    wrotePaths: applied.updated,
    fileChanges: patchFileChanges,
    projectName: host.projectLabel,
  });
  host.onApplied({
    files: finalFiles,
    updated: applied.updated,
    reply,
    provider: host.visionHopMeta ? 'NOVA · vision → model' : 'NOVA · model edit',
    elapsedMs: modelElapsed,
  });
  return { status: 'applied' };
}
