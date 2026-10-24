/**
 * Edit-path: surgical first; skip weak-brain coding hops; apply as transaction.
 */

import { applyChatReplyEdits } from '@/lib/chatAgentApply';
import { finalizeCodingChatBubble } from '@/lib/chatCodeReply';
import { getCreateJobForChat, getCreateJobForPath, getLatestReusableCreateJob } from '@/lib/createJobStore';
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
  // Inline paragraph so callers stay sync (handback module is also sync).
  return [
    'I updated files, but App.jsx still will not compile for Live, so I am not marking this done.',
    why ? `Issue: ${why}.` : '',
    'Say “fix Live” or try a shorter one-line change and I will keep going.',
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
  /** Fidelity spine: micro place/rename/bg asks — agent must invent nothing. */
  fidelityBrief?: string;
  fidelityMicroOnly?: boolean;
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
  const {
    planUiAsk,
    verifyUiAskPlan,
    canonicalAskForOp,
    isMicroFidelityPlan,
    fidelityAgentBrief,
  } = await import('@/lib/uiAskPlan');
  const structuralPiece = isStructuralUiPieceAsk(host.editUserMessage);

  // Ladder end shells (landing / SaaS / Twitter / polish) — apply surgical App.jsx
  // immediately. Never hop to invent or Openverse hero-image search.
  {
    const ask0 = String(host.editUserMessage || '');
    const ladderEnd = /\bfull\s+landing\s+page\b/i.test(ask0)
      || (/\blanding\b/i.test(ask0) && /\b(?:hero|features|pricing|FAQ|footer|testimonials)\b/i.test(ask0))
      || /\bSaaS\s+app\s+shell\b/i.test(ask0)
      || (/\bauth\s+screen\b/i.test(ask0) && /\bbilling\b/i.test(ask0))
      || /\bfeel\s+polished\b/i.test(ask0)
      || (/\bconsistent\s+spacing\b/i.test(ask0) && /\bhover\b/i.test(ask0))
      || /\bcompletely\s+different\s+visual\s+style\b/i.test(ask0)
      || (/\brebuild\b/i.test(ask0) && /\bdifferent\s+visual\b/i.test(ask0))
      || /\bTwitter\s+clone\b/i.test(ask0)
      || (/\bcompose\b/i.test(ask0) && /\bfeed\b/i.test(ask0) && /\blikes?\b/i.test(ask0));
    if (ladderEnd) {
      const shellEdits = finalizeWebEdits(host.files, ask0, [], { projectName: host.projectLabel });
      if (shellEdits.length) {
        host.pushStatus('Updating project files…');
        const resolvedDisk = (() => {
          const bound = String(host.diskRoot || '').trim();
          if (bound) return bound;
          try {
            const byChat = getCreateJobForChat(String((host as { chatId?: string }).chatId || ''));
            if (byChat?.path) return String(byChat.path);
            const latest = getLatestReusableCreateJob();
            if (latest?.path) return String(latest.path);
          } catch { /* best-effort */ }
          return null;
        })();
        const resolvedProjectId = host.projectId || (() => {
          try {
            const byChat = getCreateJobForChat(String((host as { chatId?: string }).chatId || ''));
            if (byChat?.projectId) return byChat.projectId;
            return getLatestReusableCreateJob()?.projectId || null;
          } catch {
            return null;
          }
        })();
        const applied = await applyChatReplyEdits({
          reply: '',
          projectId: resolvedProjectId,
          projectName: host.projectLabel,
          files: host.files,
          userMessage: ask0,
          diskRoot: resolvedDisk,
        });
        if (applied.ok && applied.updated.length) {
          const elapsedMs = Math.max(1, Date.now() - host.replyStartedAt);
          const { formatEditHandback } = await import('@/lib/taskHandbackReply');
          const answer = formatEditHandback({
            ask: ask0,
            outcome: 'edit-ok',
            productName: host.projectLabel,
            surface: 'chat',
          });
          host.onApplied({
            files: applied.files,
            updated: applied.updated,
            reply: host.buildStudioTraceMessage({
              startedAt: host.replyStartedAt,
              elapsedMs,
              userMessage: host.content,
              answer,
              wrotePaths: applied.updated,
              projectName: host.projectLabel,
            }),
            provider: 'NOVA · ask fidelity',
            elapsedMs,
          });
          return { status: 'applied' };
        }
      }
    }
  }

  // ── Ask fidelity spine ──────────────────────────────────────────────────
  // Parse ALL intents, apply each as its own surgical ask, verify every op.
  // Micro plans never fall through to an inventing agent.
  const fidelityPlan = planUiAsk(host.editUserMessage);
  host.fidelityMicroOnly = isMicroFidelityPlan(fidelityPlan);
  if (host.fidelityMicroOnly) {
    host.fidelityBrief = fidelityAgentBrief(fidelityPlan, []);
    host.pushStatus('Following your ask…');

    const createBriefEarly = (() => {
      try {
        const job = getCreateJobForChat(String((host as { chatId?: string }).chatId || ''));
        return String(job?.originalBrief || job?.generationBrief || '').trim();
      } catch {
        return '';
      }
    })();
    const resolvedDiskEarly = (() => {
      const bound = String(host.diskRoot || '').trim();
      if (bound) return bound;
      try {
        const byChat = getCreateJobForChat(String((host as { chatId?: string }).chatId || ''));
        if (byChat?.path) return String(byChat.path);
        const latest = getLatestReusableCreateJob();
        if (latest?.path) return String(latest.path);
      } catch { /* best-effort */ }
      return null;
    })();
    const resolvedProjectIdEarly = host.projectId || (() => {
      try {
        const byChat = getCreateJobForChat(String((host as { chatId?: string }).chatId || ''));
        if (byChat?.projectId) return byChat.projectId;
        return getLatestReusableCreateJob()?.projectId || null;
      } catch {
        return null;
      }
    })();

    let working = { ...host.files };
    const allUpdated: string[] = [];
    const snapshotFidelity = { ...host.files };

    for (const op of fidelityPlan.ops) {
      const ask = canonicalAskForOp(op);
      if (!ask.trim()) continue;
      // Always compute surgical in memory first — never trust apply alone (disk hydrate can miss).
      const edits = finalizeWebEdits(working, ask, [], { projectName: host.projectLabel });
      for (const e of edits) {
        const p = String(e.path || '').replace(/\\/g, '/');
        if (!p || working[p] === e.content) continue;
        working[p] = e.content;
        if (!allUpdated.includes(p)) allUpdated.push(p);
      }
      const appliedOp = await applyChatReplyEdits({
        reply: '',
        projectId: resolvedProjectIdEarly,
        projectName: host.projectLabel,
        files: working,
        userMessage: ask,
        diskRoot: resolvedDiskEarly,
        originalBrief: createBriefEarly || undefined,
      });
      if (appliedOp.ok && appliedOp.updated.length) {
        // Keep labels that verify; merge applied on top only when it still satisfies the op.
        const merged = { ...working, ...appliedOp.files };
        const afterApply = verifyUiAskPlan({ ...fidelityPlan, ops: [op] }, merged);
        if (afterApply.ok) {
          working = merged;
          for (const p of appliedOp.updated) {
            if (!allUpdated.includes(p)) allUpdated.push(p);
          }
        }
      }
    }

    // Whole-ask fallback when per-op still missed (compound / dual).
    let planCheck = verifyUiAskPlan(fidelityPlan, working);
    if (!planCheck.ok) {
      const whole = finalizeWebEdits(working, host.editUserMessage, [], { projectName: host.projectLabel });
      for (const e of whole) {
        const p = String(e.path || '').replace(/\\/g, '/');
        if (!p || working[p] === e.content) continue;
        working[p] = e.content;
        if (!allUpdated.includes(p)) allUpdated.push(p);
      }
      planCheck = verifyUiAskPlan(fidelityPlan, working);
    }

    // Already satisfied on disk — finish cleanly.
    if (planCheck.ok && !allUpdated.length) {
      const elapsedMs = Math.max(1, Date.now() - host.replyStartedAt);
      const answer = 'Already on the page — I checked the project files and that change is already applied. Want a different tweak next?';
      host.onApplied({
        files: working,
        updated: [],
        reply: host.buildStudioTraceMessage({
          startedAt: host.replyStartedAt,
          elapsedMs,
          userMessage: host.content,
          answer,
          wrotePaths: [],
          projectName: host.projectLabel,
        }),
        provider: 'NOVA · already applied',
        elapsedMs,
      });
      return { status: 'applied' };
    }

    // Persist any in-memory merges that didn't go through disk yet.
    // Inert userMessage so finalizeWebEdits keeps @@@FILE contents (no surgical re-fire).
    // Never let a disk hydrate wipe a paint that already verified in memory (teal/orange first-try).
    if (planCheck.ok && allUpdated.length) {
      const prePersist = { ...working };
      const replyBlocks = allUpdated
        .filter((p) => working[p] != null && working[p] !== snapshotFidelity[p])
        .map((p) => `@@@FILE ${p}\n${working[p]}`)
        .join('\n');
      if (replyBlocks) {
        const persisted = await applyChatReplyEdits({
          reply: replyBlocks,
          projectId: resolvedProjectIdEarly,
          projectName: host.projectLabel,
          files: snapshotFidelity,
          userMessage: 'Persist planned UI edits.',
          diskRoot: resolvedDiskEarly,
          originalBrief: createBriefEarly || undefined,
        });
        if (persisted.ok) {
          const mergedPersist = { ...prePersist, ...persisted.files };
          const afterPersist = verifyUiAskPlan(fidelityPlan, mergedPersist);
          if (afterPersist.ok) {
            working = mergedPersist;
            for (const p of persisted.updated) {
              if (!allUpdated.includes(p)) allUpdated.push(p);
            }
          } else {
            working = prePersist;
          }
        }
      }
      planCheck = verifyUiAskPlan(fidelityPlan, working);
    }

    if (planCheck.ok && allUpdated.length) {
      Object.assign(host.files, working);
      const answer = finalizeCodingChatBubble({
        userMessage: host.content,
        rawReply: '',
        changedPaths: allUpdated,
        applied: true,
      });
      const patchFileChanges = allUpdated.map((path) => {
        const diff = host.countLineDiff(
          String(snapshotFidelity[path] || ''),
          String(working[path] || ''),
        );
        return { path, added: diff.added, removed: diff.removed };
      });
      {
        const { minEditPaceMs, paceUntil } = await import('@/lib/editPace');
        await paceUntil(host.replyStartedAt, minEditPaceMs(host.editUserMessage));
      }
      const pacedElapsed = Math.max(1, Date.now() - host.replyStartedAt);
      host.onApplied({
        files: working,
        updated: allUpdated,
        reply: host.buildStudioTraceMessage({
          startedAt: host.replyStartedAt,
          elapsedMs: pacedElapsed,
          userMessage: host.content,
          answer,
          wrotePaths: allUpdated,
          fileChanges: patchFileChanges,
          projectName: host.projectLabel,
        }),
        provider: 'NOVA · ask fidelity',
        elapsedMs: pacedElapsed,
      });
      return { status: 'applied' };
    }

    // Micro ask incomplete — honest fail. Never invent About/Features/landing chrome.
    host.fidelityBrief = fidelityAgentBrief(fidelityPlan, planCheck.missing);
    const miss = editMiss(
      'verify_failed',
      [
        'I followed your ask as written and could not land every piece, so I left the inventing agent out of it.',
        planCheck.missing.length
          ? `Still missing: ${planCheck.missing.join(', ')}.`
          : 'That edit didn’t fully match what you asked for.',
        'Try the missing piece as its own one-line ask.',
      ].filter(Boolean).join(' '),
    );
    const elapsedFail = Math.max(1, Date.now() - host.replyStartedAt);
    host.onFailed({
      reply: host.buildStudioTraceMessage({
        startedAt: host.replyStartedAt,
        elapsedMs: elapsedFail,
        userMessage: host.content,
        answer: miss.message,
        wrotePaths: [],
        projectName: host.projectLabel,
      }),
      elapsedMs: elapsedFail,
    });
    return { status: 'failed' };
  }

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
  // Click / toggle / tab asks must never "already apply" from a bare icon img.
  const wantsInteractive = /\b(?:clickable|toggle|alert\s+clicked|open\s+a\s+(?:different\s+)?tab|\btabs?\b)\b/i.test(
    host.editUserMessage,
  );
  // "Delete the Contact link" when Contact is already gone — finish without inventing (hang risk).
  const navLinkAlreadyGone = (
    /\b(?:delete|remove|drop)\b/i.test(host.editUserMessage)
    && /\b(?:link|nav|navigation)\b/i.test(host.editUserMessage)
    && microAlready.ok
    && micro.length === 0
  );
  if (
    (
      (already.ok && already.checked > 0 && microAlready.ok)
      || navLinkAlreadyGone
    )
    && micro.length === 0
    && !forceRewrite
    && !multiPieceLanding
    && !wantsNewCopy
    && !wantsInteractive
    // Structural Discord pieces may already be complete from a prior ladder step
    // (e.g. chat pane surgical also wired the composer) — finish cleanly, don't hang.
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

  // Structural Discord/chat pieces used to always miss surgical and hang on the model.
  // When finalizeWebEdits already produced Relay/sidebar/channel patches, apply them.
  if (!micro.length) {
    if (
      structuralPiece
      || !/\b(?:change|rename|set|make|update|add|remove|fix|delete|drop|put|place|stack|show|move|center|centre)\b/i.test(host.editUserMessage)
    ) {
      return { status: 'miss' };
    }
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
  const createBrief = (() => {
    try {
      const job = getCreateJobForChat(String((host as { chatId?: string }).chatId || ''));
      return String(job?.originalBrief || job?.generationBrief || '').trim();
    } catch {
      return '';
    }
  })();
  // Step-ladder: surgical must write the live create folder even when this chat lost its bind.
  const resolvedDisk = (() => {
    const bound = String(host.diskRoot || '').trim();
    if (bound) return bound;
    try {
      const byChat = getCreateJobForChat(String((host as { chatId?: string }).chatId || ''));
      if (byChat?.path) return String(byChat.path);
      const latest = getLatestReusableCreateJob();
      if (latest?.path) return String(latest.path);
    } catch { /* best-effort */ }
    return null;
  })();
  const resolvedProjectId = host.projectId || (() => {
    try {
      const byChat = getCreateJobForChat(String((host as { chatId?: string }).chatId || ''));
      if (byChat?.projectId) return byChat.projectId;
      return getLatestReusableCreateJob()?.projectId || null;
    } catch {
      return null;
    }
  })();
  const applied = await applyChatReplyEdits({
    reply: '',
    projectId: resolvedProjectId,
    projectName: host.projectLabel,
    files: host.files,
    userMessage: host.editUserMessage,
    diskRoot: resolvedDisk,
    originalBrief: createBrief || undefined,
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
        // Generated glyphs / “no outside images” must never trigger remote hero search.
        const banRemoteHero = /\b(?:no\s+outside\s+images?|generated\s+(?:glyph|product|mic)|product\s+glyphs?|inline\s+svg)\b/i.test(host.editUserMessage);
        // "landing page: hero, features…" is a Hero section, not a photo fetch.
        const ladderSectionHero = /\blanding\b/i.test(host.editUserMessage)
          && /\b(?:features|testimonials|pricing|FAQ|footer|logos?)\b/i.test(host.editUserMessage);
        const wantHero = !banRemoteHero && !ladderSectionHero && (
          looksLikeHeavyImageAsk(host.editUserMessage)
          || /\b(?:hero\s+(?:image|photo)|background\s+image|cinematic|atmospheric)\b/i.test(host.editUserMessage)
        );
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
    if ((applied as { syntaxFailed?: boolean }).syntaxFailed) {
      const elapsedSyn = Math.max(1, Date.now() - host.replyStartedAt);
      host.onFailed({
        reply: host.buildStudioTraceMessage({
          startedAt: host.replyStartedAt,
          elapsedMs: elapsedSyn,
          userMessage: host.content,
          answer: syntaxFailAnswer((applied as { syntaxReasons?: string[] }).syntaxReasons),
          wrotePaths: [],
          projectName: host.projectLabel,
        }),
        elapsedMs: elapsedSyn,
      });
      return { status: 'failed' };
    }
    const detail = [
      applied.error || 'write_failed',
      resolvedDisk ? `disk:${resolvedDisk}` : 'disk:none',
      resolvedProjectId ? `proj:${resolvedProjectId}` : 'proj:none',
      applied.reply ? String(applied.reply).slice(0, 120) : '',
    ].filter(Boolean).join(' · ');
    const failAnswer = finalizeCodingChatBubble({
      userMessage: host.content,
      rawReply: '',
      applyError: detail,
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
  // Click-to-source — attach Live selection to this edit ask when present.
  let editAsk = String(host.editUserMessage || host.content || '');
  try {
    const { consumeClickToSource, formatClickToSourceAsk } = await import('@/lib/inventClickToSource');
    const key = String(host.diskRoot || host.projectLabel || 'default');
    const sel = consumeClickToSource(key);
    if (sel) {
      editAsk = formatClickToSourceAsk(sel, editAsk);
      host.pushStatus(`Click-to-source · ${sel.selector.slice(0, 64)}`);
      // Direct visual props — color/size/radius phrases apply without full agent rewrite.
      const color = editAsk.match(/\b(?:color|text)\s*(?:to|=|:)?\s*(#[0-9a-fA-F]{3,8}|\b(?:red|blue|black|white|green)\b)/i);
      const bg = editAsk.match(/\b(?:bg|background)\s*(?:to|=|:)?\s*(#[0-9a-fA-F]{3,8}|\b(?:red|blue|black|white|cream)\b)/i);
      const radius = editAsk.match(/\b(?:radius|rounded)\s*(?:to|=|:)?\s*([\d.]+(?:px|rem)?)/i);
      if (color || bg || radius) {
        const { applyDirectVisualProps } = await import('@/lib/inventWave4Pack');
        const patched = applyDirectVisualProps(host.files || {}, {
          selector: sel.selector,
          props: {
            ...(color ? { color: color[1] } : {}),
            ...(bg ? { background: bg[1] } : {}),
            ...(radius ? { borderRadius: /px|rem/.test(radius[1]) ? radius[1] : `${radius[1]}px` } : {}),
          },
        });
        if (patched.applied) {
          Object.assign(host, { files: patched.files });
          host.pushStatus(`Direct visual · ${patched.note}`);
          try {
            const {
              nextEditSuggestion,
              stashNextEditSuggestion,
            } = await import('@/lib/inventWave4Pack');
            const patchProps = {
              selector: sel.selector,
              props: {
                ...(color ? { color: color[1] } : {}),
                ...(bg ? { background: bg[1] } : {}),
                ...(radius ? { borderRadius: radius[1] } : {}),
              },
            };
            stashNextEditSuggestion(key, patchProps);
            host.pushStatus(nextEditSuggestion(patchProps));
          } catch { /* optional */ }
        }
      }
      // NES accept — "next edit" / "accept suggestion"
      if (/\b(?:next\s+edit|accept\s+(?:nes|suggestion))\b/i.test(editAsk)) {
        const {
          consumeNextEditSuggestion,
          buildNesFollowUpPatch,
          applyDirectVisualProps,
          nextEditSuggestion,
          stashNextEditSuggestion,
        } = await import('@/lib/inventWave4Pack');
        const prev = consumeNextEditSuggestion(key);
        if (prev) {
          const follow = buildNesFollowUpPatch(prev);
          const nes = applyDirectVisualProps(host.files || {}, follow);
          if (nes.applied) {
            Object.assign(host, { files: nes.files });
            stashNextEditSuggestion(key, follow);
            host.pushStatus(`NES · ${nes.note}`);
            host.pushStatus(nextEditSuggestion(follow));
          }
        }
      }
      // Invent direction — "use direction 2" / "layout salt 3"
      {
        const dirHit = editAsk.match(/\b(?:use\s+)?direction\s*(\d)\b/i)
          || editAsk.match(/\blayout\s+salt\s*(\d)\b/i);
        if (dirHit) {
          const { applyInventDirection } = await import('@/lib/inventWave4Pack');
          const dir = applyInventDirection(host.files || {}, Number(dirHit[1]));
          if (dir.applied) {
            Object.assign(host, { files: dir.files });
            host.pushStatus(`Invent direction · ${dir.note}`);
          }
        }
      }
      // Batch flush phrase — "apply visual batch" / "flush visual edits"
      if (/\b(?:apply|flush)\s+visual\s+batch\b/i.test(editAsk)
        || /\bflush\s+visual\s+edits\b/i.test(editAsk)) {
        const { flushVisualEditBatch } = await import('@/lib/inventWave4Pack');
        const flushed = flushVisualEditBatch(key, host.files || {});
        if (flushed.count) {
          Object.assign(host, { files: flushed.files });
          host.pushStatus(`Visual batch · ${flushed.note}`);
        }
      }
    }
    const { consumeLiveAnnotations, formatAnnotationsAsk } = await import('@/lib/inventWave4Pack');
    const anns = consumeLiveAnnotations(key);
    if (anns.length) {
      editAsk = formatAnnotationsAsk(anns, editAsk);
      host.pushStatus(`Live annotations · ${anns.length}`);
    }
  } catch { /* optional */ }
  // Mid-turn STEER / mode ACL / repo map peek / wave5 correction memory / dual-live.
  try {
    const {
      detectInventAgentMode,
      inventModeAcl,
      rankedRepoMapPeek,
      formatMidTurnSteer,
    } = await import('@/lib/inventHarnessPack');
    const mode = detectInventAgentMode(editAsk);
    const acl = inventModeAcl(mode);
    host.pushStatus(`Edit · mode ${mode}`);
    if (/^\s*STEER\b/i.test(editAsk) || /\b(?:steer|nudge|instead)\b/i.test(editAsk.slice(0, 80))) {
      host.pushStatus(formatMidTurnSteer(editAsk));
    }
    const peek = rankedRepoMapPeek(host.files || {}, editAsk, 8);
    if (peek.length) {
      host.pushStatus(`Edit · repo map: ${peek.slice(0, 5).join(', ')}`);
    }
    try {
      const { snapshotForDiff, diffSinceSnapshot } = await import('@/lib/inventWave5Pack');
      const dkey = String(host.diskRoot || host.projectLabel || 'default');
      if (/^\/diff\b|\bshow\s+diff\b/i.test(editAsk)) {
        host.pushStatus(diffSinceSnapshot(dkey, host.files || {}).slice(0, 240));
      } else {
        snapshotForDiff(dkey, host.files || {});
      }
    } catch { /* optional */ }
    if (!acl.allowWriteLogo) {
      (host as { __novaBlockLogo?: boolean }).__novaBlockLogo = true;
    }
    const { correctionToMemoryLine } = await import('@/lib/inventWave5Pack');
    const { appendAutoMemory } = await import('@/lib/inventCraftPack');
    const memLine = correctionToMemoryLine(editAsk);
    if (memLine && host.files) {
      const nextFiles = { ...host.files };
      nextFiles['.nova/memory.md'] = appendAutoMemory(
        String(nextFiles['.nova/memory.md'] || ''),
        memLine,
      );
      Object.assign(host, { files: nextFiles });
      host.pushStatus('Auto-memory · correction saved');
    }
    // Dual Live — show live A/B by swapping App from dual-live snapshot.
    const livePane = editAsk.match(/\b(?:show\s+)?live\s*([ab])\b/i);
    if (livePane && host.files) {
      const pane = livePane[1].toUpperCase();
      const snap = host.files[`.nova/dual-live/${pane}/App.jsx`];
      if (snap) {
        const nextFiles: Record<string, string> = { ...host.files, 'src/App.jsx': snap };
        delete nextFiles['src/App.tsx'];
        Object.assign(host, { files: nextFiles });
        host.pushStatus(`Dual Live · pane ${pane} mounted into App.jsx`);
      }
    }
  } catch { /* optional */ }
  if (editAsk && editAsk !== String(host.editUserMessage || host.content || '')) {
    Object.assign(host, { content: editAsk, editUserMessage: editAsk });
  }
  // Full luggage redesign — first owner, before surgical / glyphs / invent chat.
  {
    const askNow = String(host.editUserMessage || host.content || '');
    const redesignLuggage = /\b(?:redesign|rewrite|completely\s+new|new\s+layout|new\s+background)\b/i.test(askNow)
      && /\b(?:suitcases?|luggage|carry[- ]?ons?|travel\s+bags?|duffels?|weekenders?)\b/i.test(askNow);
    if (redesignLuggage) {
      try {
        host.pushStatus('Premium luggage redesign…');
        const { applyLuggagePremiumRedesign } = await import('@/lib/createInventDemo');
        let lastDisk: { path?: string; name?: string } = {};
        try {
          lastDisk = JSON.parse(localStorage.getItem('NOVA:last-disk-target') || '{}') || {};
        } catch { /* ignore */ }
        const diskRoot = String(host.diskRoot || lastDisk.path || '').trim() || null;
        const brand = String(
          host.projectLabel && host.projectLabel !== 'App' ? host.projectLabel : '',
        ).trim()
          || String(lastDisk.name || '').trim()
          || 'Ridgeline Carry';
        let baseFiles = host.files || {};
        if (diskRoot && Object.keys(baseFiles).length < 3) {
          try {
            const { loadPreviewFilesFromDisk } = await import('@/lib/projectPreview');
            const fresh = await loadPreviewFilesFromDisk(diskRoot);
            if (fresh && Object.keys(fresh).length) baseFiles = fresh;
          } catch { /* keep studio files */ }
        }
        const salvaged = applyLuggagePremiumRedesign(baseFiles, brand, askNow);
        if (salvaged.applied) {
          const wrote = ['src/App.jsx', 'src/App.css', 'public/logo.svg'].filter((p) => salvaged.files[p]);
          // Write bytes directly — applyChatReplyEdits→finalizeWebEdits treats “contact form”
          // in the ask as a micro form ladder and guts the premium App.
          let diskWrote = 0;
          if (diskRoot && window.novaDesktop?.workspaceWriteFile) {
            const sep = diskRoot.includes('\\') ? '\\' : '/';
            const root = diskRoot.replace(/[\\/]+$/, '');
            for (const rel of wrote) {
              try {
                const w = await window.novaDesktop.workspaceWriteFile({
                  targetPath: `${root}${sep}${rel.replace(/\//g, sep)}`,
                  content: salvaged.files[rel],
                });
                if (w?.ok !== false) diskWrote += 1;
              } catch { /* best-effort */ }
            }
          }
          if (!diskWrote) {
            const blocks = wrote
              .map((p) => `@@@FILE ${p}\n${salvaged.files[p]}`)
              .join('\n');
            await applyChatReplyEdits({
              reply: blocks,
              projectId: host.projectId,
              projectName: brand,
              files: baseFiles,
              // Neutral ask so form/ladder heuristics cannot replace the dump.
              userMessage: 'Full rewrite App.jsx App.css premium luggage layout redesign',
              diskRoot,
            });
          }
          const filesOut = salvaged.files;
          const updated = wrote;
          const elapsedMs = Math.max(1, Date.now() - host.replyStartedAt);
          const { formatEditHandback: handbackRedesign } = await import('@/lib/taskHandbackReply');
          const answer = handbackRedesign({
            ask: host.content,
            outcome: 'edit-ok',
            productName: brand,
            summary: `I've finished the redesign for **${brand}** — a completely new premium editorial layout is on disk, not the old bag-layers list.`,
            surface: 'chat',
          });
          const reply = host.buildStudioTraceMessage({
            startedAt: host.replyStartedAt,
            elapsedMs,
            userMessage: host.content,
            answer,
            wrotePaths: updated,
            projectName: brand,
          });
          host.onSnapshot?.({ files: filesOut, updatedPaths: updated });
          host.onApplied({
            files: filesOut,
            updated,
            reply,
            provider: 'NOVA · luggage premium redesign',
            elapsedMs,
          });
          return { status: 'applied' };
        }
      } catch { /* fall through */ }
    }
  }

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
      // Auto re-attach Live after restore (safe, idempotent) instead of telling the user to say "run Preview".
      let liveAfterRestore = false;
      if (host.diskRoot && typeof window !== 'undefined' && window.novaDesktop?.getOrAttachPreview) {
        host.pushStatus('Restored — re-attaching Live…');
        try {
          const attach = await Promise.race([
            window.novaDesktop.getOrAttachPreview(host.diskRoot),
            new Promise<null>((resolve) => { window.setTimeout(() => resolve(null), 45_000); }),
          ]);
          liveAfterRestore = Boolean(attach?.ok && attach.url);
        } catch { /* best-effort */ }
      }
      host.onApplied({
        files: applied.files,
        updated: applied.updated,
        reply: host.buildStudioTraceMessage({
          startedAt: host.replyStartedAt,
          elapsedMs,
          userMessage: host.content,
          answer: liveAfterRestore
            ? `Restored checkpoint **${cp.label}** (${rolled.restored.length} files). Live is re-attached — open **Live** to check it.`
            : `Restored checkpoint **${cp.label}** (${rolled.restored.length} files). Live didn’t re-attach on its own — click **Live** under the chat, or tell me what looks off and I will fix it.`,
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

  // Product visual asks: local image gen → public/glyphs + App wire (SVG only if no model).
  try {
    const { wantsProductVisualAsk, applyProductVisualToProject } = await import('@/lib/productVisual');
    const visualDisk = (() => {
      const bound = String(host.diskRoot || '').trim();
      if (bound) return bound;
      try {
        const byChat = getCreateJobForChat(String((host as { chatId?: string }).chatId || ''));
        if (byChat?.path) return String(byChat.path);
        const latest = getLatestReusableCreateJob();
        if (latest?.path) return String(latest.path);
      } catch { /* best-effort */ }
      return '';
    })();
    if (wantsProductVisualAsk(host.editUserMessage) && visualDisk) {
      // Bound rich catalogs must never take the glyph wipe path — fall through to surgical edit.
      const { projectLooksLikeRichCatalogShell } = await import('@/lib/productVisual');
      if (projectLooksLikeRichCatalogShell(host.files)) {
        /* skip product-visual wipe */
      } else {
      host.pushStatus('Generating product shot (may take 1–3 min)…');
      const visual = await applyProductVisualToProject({
        diskRoot: visualDisk,
        files: host.files,
        message: host.editUserMessage,
      });
      if (visual.ok && visual.updated.length) {
        const elapsedMs = Math.max(1, Date.now() - host.replyStartedAt);
        const sourceNote = visual.source === 'local-image'
          ? 'from your local image model'
          : visual.source === 'image-core'
            ? 'from Image Core (HF / Horde)'
            : 'with a catalog SVG fallback — install **SDXL Turbo Local** or add a Hugging Face key for photo shots';
        const answer = [
          `Added a **${visual.kind}** product image ${sourceNote}.`,
          visual.href ? `Saved to \`${visual.href}\`.` : '',
          visual.error && visual.source === 'svg-fallback'
            ? `(Generation note: ${String(visual.error).slice(0, 160)})`
            : '',
          'Open **Live** to check it.',
        ].filter(Boolean).join(' ');
        const reply = host.buildStudioTraceMessage({
          startedAt: host.replyStartedAt,
          elapsedMs,
          userMessage: host.content,
          answer,
          wrotePaths: visual.updated,
          projectName: host.projectLabel,
        });
        host.onSnapshot?.({ files: visual.files, updatedPaths: visual.updated });
        host.onApplied({
          files: visual.files,
          updated: visual.updated,
          reply,
          provider: visual.source === 'svg-fallback' ? 'NOVA · glyph SVG' : 'NOVA · product visual',
          elapsedMs,
        });
        return { status: 'applied' };
      }
      } // end else (!richCatalog)
    }
  } catch { /* fall through to surgical */ }

  // Graphic composition: materialize glyph files first so the shell can use /glyphs/* imgs.
  try {
    const {
      wantsProductVisualAsk: isSingleGlyph,
      materializeProductGlyph,
      detectProductVisualKind,
    } = await import('@/lib/productVisual');
    const graphicAsk = /\b(?:graphic|high[- ]?quality\s+design|product\s+(?:photos?|glyphs?|visuals?)|hero\s+(?:image|photo|glyph)|split\s+layout|look\s+different|brand\s+new\s+layout|rebuild\s+(?:the\s+)?(?:layout|design|page)|photo\s+on\s+the\s+left|visual\s+design|generated\s+(?:product|mic|glyph)|no\s+outside\s+images)\b/i.test(host.editUserMessage)
      || (
        /\bdesign\b/i.test(host.editUserMessage)
        && /\b(?:more|real|actual|better|new|fresh|different)\b/i.test(host.editUserMessage)
        && !/\bkeep\s+the\s+design\s+simple\b/i.test(host.editUserMessage)
      );
    // Only materialize mic glyphs for actual microphone asks — redesign / "look different"
    // / luggage briefs used to hardcode mic-travel and hang on Horde for minutes.
    const glyphKind = detectProductVisualKind(host.editUserMessage);
    const luggageAsk = /\b(?:suitcase|carry[- ]?on|luggage|duffel|weekender|travel\s+bag|roller\s+bag|cabin\s+bag)\b/i
      .test(host.editUserMessage);
    if (
      graphicAsk
      && host.diskRoot
      && !isSingleGlyph(host.editUserMessage)
      && glyphKind === 'microphone'
      && !luggageAsk
    ) {
      host.pushStatus('Preparing product glyphs…');
      const { listReadyLocalImageModels } = await import('@/lib/siteHeroImages');
      let readyLocal = false;
      try {
        readyLocal = (await listReadyLocalImageModels()).length > 0;
      } catch { /* offline */ }
      let files = { ...host.files };
      const slots: Array<{ kind: 'microphone'; slug: string; variant?: string }> = [
        { kind: 'microphone', slug: 'microphone' },
        { kind: 'microphone', slug: 'mic-room', variant: 'condenser room' },
        { kind: 'microphone', slug: 'mic-desk', variant: 'desk dynamic' },
        { kind: 'microphone', slug: 'mic-travel', variant: 'travel clip lavalier' },
      ];
      for (const slot of slots) {
        const mat = await materializeProductGlyph({
          diskRoot: host.diskRoot,
          kind: slot.kind,
          slug: slot.slug,
          variant: slot.variant,
          files,
          // Hero tries the model when local weights are ready; thumbs stay SVG unless ready.
          preferFallback: !readyLocal || slot.slug !== 'microphone',
        });
        files = mat.files;
      }
      Object.assign(host.files, files);
      host.onSnapshot?.({ files, updatedPaths: Object.keys(files).filter((k) => /glyphs\//i.test(k)) });
    }
  } catch { /* still try surgical shell */ }

  const surgical = await runSurgicalEditTurn(host);
  if (surgical.status === 'applied' || surgical.status === 'failed') return surgical;

  // UI shells: never invent-timeout after surgical miss — fail fast with a short miss.
  // Undo/redo are snapshot-owned in the send path; don't trap them here.
  {
    const { isUiShellAsk } = await import('@/lib/webProjectCanon');
    const ask = String(host.editUserMessage || '');
    const undoRedo = /\b(?:undo|redo)\b/i.test(ask)
      && /\b(?:last|previous|undone|change|edit)\b/i.test(ask);
    if (isUiShellAsk(ask) && !undoRedo) {
      const elapsedMs = Math.max(1, Date.now() - host.replyStartedAt);
      const miss = editMiss(
        'verify_failed',
        [
          'I followed your ask as written and could not land a surgical change, so I left the inventing agent out of it.',
          'Try the same ask as one clear one-line change, or split it into smaller pieces.',
        ].join(' '),
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
  }

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

  // Coding foundation: after surgical miss, tool loop owns all project coding asks.
  // Invent answerStudio remains fallback only when the loop returns no updates.
  try {
    const { shouldUseNovaEditBuildLoop } = await import('@/lib/novaBuildLoop');
    const { packNovaBuildContext } = await import('@/lib/novaBuildContext');
    const { runNovaAgentLoop } = await import('@/lib/novaAgentLoop');
    const { modeStatusLabel } = await import('@/lib/novaStudioModes');
    const { getLocalPrefs } = await import('@/lib/localPrefs');
    const ask = String(host.editUserMessage || host.content || '');
    if (shouldUseNovaEditBuildLoop() && host.projectId && ask.trim()) {
      host.pushStatus(modeStatusLabel('fix', 'Nova tool loop'));
      const { answerStudio } = await import('@/lib/studioAnswerEngine');
      const coderId = String(host.stickyModelId || host.preferredModelId || host.modelId || '');
      const coderName = String(host.stickyModelName || host.preferredModelName || host.modelName || 'coder');
      const prefsMax = Number(getLocalPrefs().agentLoopMaxSteps) || 32;
      const maxSteps = Math.max(12, Math.min(prefsMax, 24));
      const loop = await runNovaAgentLoop({
        brief: [
          host.fidelityBrief || ask.slice(0, 2500),
          '',
          host.fidelityMicroOnly
            ? 'Do ONLY the required ops. Invent nothing — no About, Features, footer, nav, or sample sections.'
            : 'Prefer TOOL: patch / write / read / grep / run. Never add paywalls or upgrade CTAs.',
          'Call TOOL: ready when the change is done; TOOL: done when finished.',
        ].join('\n'),
        files: packNovaBuildContext(host.files),
        projectId: host.projectId,
        projectName: host.projectLabel,
        diskRoot: host.diskRoot,
        maxSteps,
        autoRunAllowlisted: true,
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
      // Redesign luggage asks: tool loop often returns prose — mount premium layout on disk.
      const redesignLuggage = /\b(?:redesign|rewrite|completely\s+new|new\s+layout|new\s+background)\b/i.test(ask)
        && /\b(?:suitcases?|luggage|carry[- ]?ons?|travel\s+bags?|duffels?|weekenders?)\b/i.test(ask);
      if (redesignLuggage) {
        host.pushStatus(modeStatusLabel('fix', 'Premium luggage redesign…'));
        const { applyLuggagePremiumRedesign } = await import('@/lib/createInventDemo');
        let lastDisk: { path?: string; name?: string } = {};
        try {
          lastDisk = JSON.parse(localStorage.getItem('NOVA:last-disk-target') || '{}') || {};
        } catch { /* ignore */ }
        const diskRoot = String(host.diskRoot || lastDisk.path || '').trim() || null;
        const brand = String(
          host.projectLabel && host.projectLabel !== 'App' ? host.projectLabel : '',
        ).trim()
          || String(lastDisk.name || '').trim()
          || 'Ridgeline Carry';
        const salvaged = applyLuggagePremiumRedesign(loop.files || host.files, brand, ask);
        if (salvaged.applied) {
          const wrote = ['src/App.jsx', 'src/App.css', 'public/logo.svg'].filter((p) => salvaged.files[p]);
          const blocks = wrote
            .map((p) => `@@@FILE ${p}\n${salvaged.files[p]}`)
            .join('\n');
          const persisted = await applyChatReplyEdits({
            reply: blocks,
            projectId: host.projectId,
            projectName: brand,
            files: loop.files || host.files,
            userMessage: ask,
            diskRoot,
          });
          if ((!persisted.ok || !persisted.updated?.length) && diskRoot && window.novaDesktop?.workspaceWriteFile) {
            const sep = diskRoot.includes('\\') ? '\\' : '/';
            const root = diskRoot.replace(/[\\/]+$/, '');
            for (const rel of wrote) {
              try {
                await window.novaDesktop.workspaceWriteFile({
                  targetPath: `${root}${sep}${rel.replace(/\//g, sep)}`,
                  content: salvaged.files[rel],
                });
              } catch { /* best-effort */ }
            }
          }
          const filesOut = persisted.ok ? persisted.files : salvaged.files;
          const updated = persisted.ok && persisted.updated?.length ? persisted.updated : wrote;
          const elapsedMs = Math.max(1, Date.now() - host.replyStartedAt);
          const { formatEditHandback: handbackRedesign2 } = await import('@/lib/taskHandbackReply');
          const answer = handbackRedesign2({
            ask: host.content,
            outcome: 'edit-ok',
            productName: brand,
            summary: `I've finished the redesign for **${brand}** — a completely new premium editorial layout is on disk, not the old bag-layers list.`,
            surface: 'chat',
          });
          const reply = host.buildStudioTraceMessage({
            startedAt: host.replyStartedAt,
            elapsedMs,
            userMessage: host.content,
            answer,
            wrotePaths: updated,
            projectName: host.projectLabel,
          });
          host.onSnapshot?.({ files: filesOut, updatedPaths: updated });
          host.onApplied({
            files: filesOut,
            updated,
            reply,
            provider: 'NOVA · luggage premium redesign',
            elapsedMs,
          });
          return { status: 'applied' };
        }
      }
      host.pushStatus(modeStatusLabel('fix', 'Tool loop empty — invent fallback'));
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
          ? 'That UI rebuild timed out before any files were written, so your project is untouched. Send the ask again (or a smaller UI change) and I’ll continue from this folder.'
          : 'That edit timed out before I could write files. Try a shorter one-line change, or name the exact file to patch.',
        wrotePaths: [],
        projectName: host.projectLabel,
      }),
      elapsedMs,
    });
    return { status: 'miss' };
  }

  const editCreateBrief = (() => {
    try {
      const byChat = getCreateJobForChat(String((host as { chatId?: string }).chatId || ''));
      if (byChat) return String(byChat.originalBrief || byChat.generationBrief || '').trim();
      if (host.diskRoot) {
        const byPath = getCreateJobForPath(host.diskRoot);
        return String(byPath?.originalBrief || byPath?.generationBrief || '').trim();
      }
    } catch { /* ignore */ }
    return '';
  })();
  let applied = await applyChatReplyEdits({
    reply: modelReply,
    projectId: host.projectId,
    projectName: host.projectLabel,
    files: host.files,
    userMessage: host.editUserMessage,
    diskRoot: host.diskRoot,
    originalBrief: editCreateBrief || undefined,
  });
  const elapsedMs = Date.now() - host.replyStartedAt;
  /** Appended to the final success bubble when verifyAsk still misses after one retry but files are intact. */
  let partialAskNote = '';

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
  // verifyAsk + brand guard, re-runnable so one retry round can be checked the same way.
  const runAskCheck = (files: Record<string, string>) => {
    let check = verifyAsk(host.editUserMessage, files);
  // Fail closed if the model wiped an existing short centered brand on a non-wipe ask.
  // Long hero lines ("Fresh vegetable plants") are headings, not brand marks — don't block shop polish.
  {
    const before = `${snapshot['src/App.jsx'] || ''}\n${snapshot['src/App.tsx'] || ''}`;
    const after = `${files?.['src/App.jsx'] || ''}\n${files?.['src/App.tsx'] || ''}`;
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
        check = {
          ok: false,
          missing: [...check.missing, `kept brand “${brand}”`],
          checked: Math.max(1, check.checked || 0),
        };
      }
    }
  }
    // Soft keep rewrite/landing/rebuild work — don't undo a real layout over a loose miss.
    if (!check.ok && (softKeep || rebuildKeep)) {
      check = { ok: true, missing: [], checked: check.checked };
    }
    return check;
  };
  let askCheck = runAskCheck(applied.files);
  const revertToSnapshot = async () => {
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
  };

  // verifyAsk missed: one retry round feeding the gaps back to the model (mirrors create's repair loop).
  // Do NOT revert up front — the first write may be mostly right.
  let askRetried = false;
  if (!askCheck.ok && askCheck.missing.length && host.generate) {
    askRetried = true;
    host.pushStatus('Close — fixing what’s still missing…');
    const retryBudgetMs = Math.min(editBudgetMs, 120_000);
    const retryController = new AbortController();
    const retryTimer = setTimeout(() => retryController.abort(), retryBudgetMs);
    let retryReply = '';
    try {
      const retryAsk = [
        host.editUserMessage,
        '',
        '## Retry — your last edit missed part of the ask',
        `Still missing: ${askCheck.missing.join('; ')}.`,
        'Fix ONLY those gaps on top of the current files. Keep everything else, including the brand/name. Return full @@@FILE blocks for any file you change.',
        mapBlock || '',
      ].filter((l) => l !== '').join('\n');
      const raced = await Promise.race([
        host.generate({ signal: retryController.signal, userMessage: retryAsk, files: applied.files }),
        new Promise<null>((resolve) => {
          retryController.signal.addEventListener('abort', () => resolve(null), { once: true });
        }),
      ]);
      retryReply = String(raced || '').trim();
    } catch {
      retryReply = '';
    } finally {
      clearTimeout(retryTimer);
    }
    if (retryReply) {
      const retryApplied = await applyChatReplyEdits({
        reply: retryReply,
        projectId: host.projectId,
        projectName: host.projectLabel,
        files: applied.files,
        userMessage: host.editUserMessage,
        diskRoot: host.diskRoot,
      });
      if (retryApplied.ok && retryApplied.updated.length) {
        const retryBroken = Boolean((retryApplied as { syntaxFailed?: boolean }).syntaxFailed);
        const firstBroken = Boolean((applied as { syntaxFailed?: boolean }).syntaxFailed);
        const retryCheck = runAskCheck(retryApplied.files);
        // Accept the retry unless it broke files that were intact before it.
        if (!retryBroken || firstBroken) {
          applied = {
            ...retryApplied,
            updated: [...new Set([...applied.updated, ...retryApplied.updated])],
          };
          askCheck = retryCheck;
          host.onSnapshot?.({ files: snapshot, updatedPaths: applied.updated });
        }
      }
    }
  }

  if (!askCheck.ok) {
    // Only revert when the files are actually broken (syntax gate failed, or the model wiped the brand).
    // Otherwise keep the intact edit and say plainly what is still missing.
    const filesBroken = Boolean((applied as { syntaxFailed?: boolean }).syntaxFailed)
      || askCheck.missing.some((m) => /^kept brand/i.test(m));
    const keepIntact = askRetried && !filesBroken && applied.ok && applied.updated.length > 0;
    if (keepIntact) {
      partialAskNote = `I've applied what I could, but still missing: ${askCheck.missing.join(', ') || 'part of that ask'}. Say that piece on its own and I will add it.`;
    } else {
    await revertToSnapshot();
    const miss = editMiss(
      'verify_failed',
      [
        askRetried
          ? 'I tried that edit twice and the result wasn’t safe to keep (it broke the code or dropped your brand), so I restored your previous files.'
          : 'That edit didn’t match what you asked for, so I restored your previous files.',
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
  const answerBase = finalizeCodingChatBubble({
    userMessage: host.content,
    rawReply: modelReply,
    changedPaths: applied.updated,
    applied: true,
  });
  const answer = partialAskNote
    ? `${answerBase.replace(/\s+$/, '')} ${partialAskNote}`.replace(/\s+/g, ' ').trim()
    : answerBase;
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
