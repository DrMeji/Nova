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
  // Only when verifyAsk actually evaluated constraints (checked > 0) AND surgical has nothing to add.
  const already = verifyAsk(host.editUserMessage, host.files);
  if (already.ok && already.checked > 0 && !structuralPiece && micro.length === 0) {
    const elapsedMs = Math.max(1, Date.now() - host.replyStartedAt);
    const answer = 'Already on the page — that change is already applied.';
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
    /\b(?:add|put|place)\b/i.test(host.editUserMessage)
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
      // Fail closed — revert.
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
      const miss = editMiss(
        'verify_failed',
        [
          'That edit didn’t match what you asked for, so I left the project unchanged.',
          verified.missing?.length ? `Still missing: ${verified.missing.join(', ')}.` : '',
          'Try one clearer change (e.g. brand name only, or “add sticky nav with Products Specs Buy”).',
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
  /** Model generate with AbortSignal; capped at 45s by runEditTurn. */
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
 * Surgical first; on miss, skip weak coder or one generate→apply (45s cap).
 */
export async function runEditTurn(host: RunEditTurnHost): Promise<RunEditTurnResult> {
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

  // BrainProfile: block wrong-size / wrong-VRAM coder before any generate.
  {
    const { getBrainProfile, assertCoderAllowed } = await import('@/lib/brainProfile');
    const profile = await getBrainProfile();
    const coderId = host.stickyModelId || host.preferredModelId || host.modelId;
    const coderName = host.stickyModelName || host.preferredModelName || host.modelName;
    const gate = assertCoderAllowed(profile, coderId, coderName);
    if (!gate.ok) {
      host.onWeakMiss?.();
      const elapsedMs = Date.now() - host.replyStartedAt;
      const answer = [
        gate.reason,
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
  }

  if (!host.generate) {
    // Default owner: answerStudio lives here — not in AIChat.
    const { answerStudio } = await import('@/lib/studioAnswerEngine');
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
          shouldAbort: () => signal.aborted || Date.now() - started > 45_000,
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
  const snapshot = { ...host.files };
  host.pushStatus('Coding…');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  let modelReply = '';
  try {
    const raced = await Promise.race([
      host.generate({
        signal: controller.signal,
        userMessage: host.editUserMessage,
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
        answer: 'That edit timed out before I could write files. Try a shorter one-line change.',
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

  const verified = verifyMicroAskApplied(host.editUserMessage, applied.files);
  if (!verified.ok) {
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
        verified.missing?.length ? `Still missing: ${verified.missing.join(', ')}.` : '',
        'Try one clearer change (e.g. change the name to Tesla).',
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

  host.onSnapshot?.({ files: snapshot, updatedPaths: applied.updated });

  const { verifyAsk } = await import('@/lib/verifyAsk');
  let askCheck = verifyAsk(host.editUserMessage, applied.files);
  // Fail closed if the model wiped an existing centered brand on a non-wipe ask.
  {
    const before = `${snapshot['src/App.jsx'] || ''}\n${snapshot['src/App.tsx'] || ''}`;
    const after = `${applied.files?.['src/App.jsx'] || ''}\n${applied.files?.['src/App.tsx'] || ''}`;
    const brand = before.match(/className=["']center-word["'][^>]*>([^<]{1,80})</i)?.[1]?.trim() || '';
    const wipeOk = /\b(?:remove|delete|drop|replace|rebuild|from\s+scratch)\b[\s\S]{0,48}\b(?:title|brand|heading|h1|words?)\b/i.test(
      host.editUserMessage,
    );
    if (brand && !wipeOk) {
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

  const answer = finalizeCodingChatBubble({
    userMessage: host.content,
    rawReply: modelReply,
    changedPaths: applied.updated,
    applied: true,
  });
  const patchFileChanges = applied.updated.map((path) => {
    const diff = host.countLineDiff(
      String(snapshot[path] || ''),
      String(applied.files?.[path] || ''),
    );
    return { path, added: diff.added, removed: diff.removed };
  });
  const reply = host.buildStudioTraceMessage({
    startedAt: host.replyStartedAt,
    elapsedMs,
    userMessage: host.content,
    answer,
    wrotePaths: applied.updated,
    fileChanges: patchFileChanges,
    projectName: host.projectLabel,
  });
  host.onApplied({
    files: applied.files,
    updated: applied.updated,
    reply,
    provider: host.visionHopMeta ? 'NOVA · vision → model' : 'NOVA · model edit',
    elapsedMs,
  });
  return { status: 'applied' };
}
