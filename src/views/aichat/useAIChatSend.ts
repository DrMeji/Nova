/**
 * AIChat sendMessage — thin owned-turn path.
 * Preamble → hydrateStudio → make* hosts → dispatchOwnedTurn → one runChatTurn / media.
 */
// @ts-nocheck — ctx bag mirrors AIChat closures; keep in sync when wiring.
import { loadRecentChats } from '@/lib/recentStore';
import {
  parseNewProjectIntent,
  extractProjectName,
  slugifyProjectName,
  resolveProjectKindForCreate,
} from '@/lib/createProjectIntent';
import { setLastPendingGreenfield, getLastPendingGreenfield } from '@/lib/chatStudioStore';
import { cleanProductTitle } from '@/lib/freshSpaFromBrief';
import { hasActiveWorkspace, stripComposerPrefix } from '@/lib/chatAgentTurn';
import { composerModeFromContent } from '@/views/aichat/aiChatHelpers';
import { hydrateStudio } from '@/lib/chatTurnSession';
import { dispatchOwnedTurn, runChatTurn, runEditTurn } from '@/lib/chatTurnHandlers';
import { runMediaChatTurn } from '@/lib/chatMediaTurn';
import { buildRouterHistory } from '@/lib/chatHistory';
import { getLocalPrefs, setLocalPrefs, isEnsembleAutoParked } from '@/lib/localPrefs';
import { notifyChatDone } from '@/lib/activityIndicators';
import { setActiveBrainId } from '@/lib/brainRoles';
import { setEngineModel } from '@/lib/novaEngine';
import { saveAutoThreadBrain } from '@/lib/threadBrain';
import { defaultModelForKind } from '@/views/aichat/aiChatHelpers';
import {
  resolveConversationalEditAsk,
  rememberLastEditTopic,
  inferEditTopicFromAsk,
} from '@/lib/editAskResolve';
import {
  getApplySnapshot,
  clearApplySnapshot,
  snapshotToRevertBlocks,
} from '@/lib/chatApplySnapshotStore';
import { applyChatReplyEdits } from '@/lib/chatAgentApply';
import { buildStudioTraceMessage, finalizeCodingChatBubble } from '@/lib/chatCodeReply';
import {
  makeCreateHost,
  makeDeleteHost,
  makeOpenFolderHost,
  makeRunCmdHost,
  makeEditHost,
  makeChatHost,
  type HostBag,
} from '@/lib/chatTurnHosts';
import {
  prepareAIChatSend,
  type AIChatSendCtx,
} from '@/views/aichat/aiChatSendPreamble';
import { runPluginAction, getPluginRuntime, loadPluginState } from '@/lib/plugins';
import {
  wantsGithubCatalog,
  formatRepoCatalog,
  listAccountRepos,
} from '@/lib/chatStudio';
import { verifyGitHubToken } from '@/lib/github';
import { githubToken } from '@/lib/codeGitHubWorkflow';
import { runDebugClinic, formatClinicReportMessage, parseClinicReportMessage } from '@/lib/debugClinic';
import {
  runPlanMode,
  formatPlanChatReply,
  looksLikePlanDiscoveryAsk,
  appendPlanDiscoveryNudge,
  looksLikePlanRefineAsk,
  looksLikePlanIncrementalAdd,
  looksLikePlanSideChatAsk,
  buildPlanBriefFromThread,
  findLatestPlanReport,
  serializePlanReportForCreate,
  planReportToPlanLog,
  countPlanSteps,
} from '@/lib/planReport';
import { saveChatPlan, setChatPlanPill } from '@/lib/chatPlanStore';
import { requestOpenChatPlan } from '@/lib/openChatPlan';
import { looksLikeImplementGo } from '@/lib/chatPlanMode';
import { runAgentWorkMode } from '@/lib/agentWorkMode';
import { wantsMultiAgentTurn } from '@/lib/novaMultiAgent';
import {
  looksLikeWorkQueueDoNext,
  looksLikeWorkQueueFinishAll,
  looksLikeWorkQueueStop,
  looksLikeClinicFixAsk,
  looksLikeRemainingAsk,
  loadWorkQueue,
  extractClinicFixIds,
} from '@/lib/workQueue';
import { getChatTurnStatus } from '@/lib/chatTurnStatusStore';
import { isBuildArtifactPath } from '@/lib/projectInspect';
import { studioPathBasename } from '@/lib/chatStudioStore';
import { requestCloseChatCode, requestOpenChatCode } from '@/lib/openChatCode';
import { prepareBrainRotation, emitRotationNote } from '@/lib/modelRotation';
import { buildThreadSummaryFromMessages } from '@/lib/chatHistory';

export type { AIChatSendCtx };

export async function runAIChatSend(content: string, ctx: AIChatSendCtx): Promise<void> {
  const prep = await prepareAIChatSend(content, ctx);
  if (prep.status === 'done') return;

  const {
    mode,
    activeChatId,
    assistantId,
    mySeq,
    finishPlainReply,
    clearGeneratingIfMineEarly,
    pushAssistantStatus,
    resolvedStudio,
    chatStudioFilesRef,
    chatStudioDiskRootRef,
    chatStudioProjectIdRef,
    setChatStudioFiles,
    setChatStudioDiskRoot,
    setChatStudioProjectId,
    pinnedModel,
    composerMode,
    diskIntent,
    genSeqRef,
    genSeqByChatRef,
    stopRequestedRef,
    stopRequestedByChatRef,
    threadBrainRef,
    messagesRef,
    routeChatIdRef,
    chatRouteSeedRef,
    chatTurnCtlRef,
    flushQueuedSend,
  } = prep;

  if (prep.status === 'owned' && (mode === 'general' || mode === 'code')) {
    const turnCtx = await hydrateStudio({
      chatId: activeChatId,
      chatTitle: loadRecentChats().find((c) => c.id === activeChatId)?.title || null,
      content: prep.content,
      mode,
      fallbackFiles: chatStudioFilesRef.current || resolvedStudio.files,
      fallbackProjectId: chatStudioProjectIdRef.current || resolvedStudio.projectId,
      fallbackDiskRoot: chatStudioDiskRootRef.current || resolvedStudio.diskRoot,
      fallbackName: resolvedStudio.name,
    });
    if (turnCtx.diskRoot) {
      chatStudioDiskRootRef.current = turnCtx.diskRoot;
      setChatStudioDiskRoot(turnCtx.diskRoot);
    }
    if (Object.keys(turnCtx.files || {}).length) {
      chatStudioFilesRef.current = turnCtx.files;
      setChatStudioFiles(turnCtx.files);
      resolvedStudio.files = turnCtx.files;
    }
    if (turnCtx.projectId) {
      chatStudioProjectIdRef.current = turnCtx.projectId;
      setChatStudioProjectId(turnCtx.projectId);
      resolvedStudio.projectId = turnCtx.projectId;
    }

    const earlyIntent = parseNewProjectIntent(prep.content) || null;
    const renameFromAsk = extractProjectName(prep.content);
    const createIntentEarly = earlyIntent && renameFromAsk && !/^(My App|New App|App)$/i.test(renameFromAsk)
      ? { ...earlyIntent, name: renameFromAsk, slug: slugifyProjectName(renameFromAsk), summary: prep.content.length > 40 ? `${prep.content}\n\n${earlyIntent.summary}` : earlyIntent.summary }
      : earlyIntent;
    const workspaceActiveForCreate = hasActiveWorkspace({
      files: resolvedStudio.files,
      projectId: resolvedStudio.projectId || chatStudioProjectIdRef.current,
      diskRoot: resolvedStudio.diskRoot || chatStudioDiskRootRef.current,
    });
    let earlyComposerMode = composerModeFromContent(prep.content) || composerMode;
    const earlyPkg = Object.keys(resolvedStudio.files || {}).some((k) => /(^|\/)package\.json$/i.test(k));
    const earlyAgentCwd = chatStudioDiskRootRef.current
      || prep.chatStudioDiskRoot
      || resolvedStudio.diskRoot
      || null;

    const workspaceBound = hasActiveWorkspace({
      files: chatStudioFilesRef.current || resolvedStudio.files,
      projectId: chatStudioProjectIdRef.current || resolvedStudio.projectId,
      diskRoot: chatStudioDiskRootRef.current || resolvedStudio.diskRoot,
      chatId: activeChatId,
    });

    // Sync only — stopIfSuperseded is async and returns a Promise (always truthy if used as boolean).
    const turnDead = () => {
      const liveSeq = (genSeqByChatRef?.current?.[activeChatId] as number) || genSeqRef.current;
      return Boolean(
        mySeq !== liveSeq
        || stopRequestedRef.current
        || stopRequestedByChatRef?.current?.[activeChatId],
      );
    };

    // One-seat Auto: preload/handoff on context pressure (ensemble multi-seat stays parked).
    try {
      const rotKind = mode === 'code' ? 'coding' as const : 'chat' as const;
      const pinId = String(pinnedModel?.id || '').trim();
      const pinLocked = Boolean(pinId && pinId !== 'NOVA-auto' && pinnedModel?.source !== 'auto');
      const seedBrain = pinnedModel?.source === 'auto'
        ? threadBrainRef.current
        : (pinLocked
          ? {
              kind: rotKind,
              modelId: pinId,
              modelName: String(pinnedModel?.name || pinId),
              pinnedSource: (pinnedModel?.source === 'cloud' ? 'cloud' : 'local') as 'local' | 'cloud',
              tier: 'local-free' as const,
            }
          : threadBrainRef.current);
      const rotation = await prepareBrainRotation({
        scopeId: activeChatId,
        kind: rotKind,
        history: buildRouterHistory(
          messagesRef.current.filter((m) => m.role === 'user' || m.role === 'assistant'),
          prep.content,
          undefined,
          { keepContinuity: true, kind: rotKind === 'coding' ? 'coding' : 'chat' },
        ),
        currentModelId: seedBrain?.modelId || pinId || undefined,
        brain: seedBrain,
      });
      if (rotation.brain) {
        threadBrainRef.current = rotation.brain;
        prep.setThreadBrain?.(rotation.brain);
      }
      if (rotation.swapped && rotation.brain) {
        const summary = buildThreadSummaryFromMessages(messagesRef.current || []);
        const name = rotation.brain.modelName || rotation.brain.modelId;
        emitRotationNote(
          summary
            ? `Continuing on ${name} — same project. Where we left off: ${summary.slice(0, 280)}`
            : `Continuing on ${name} — same project, fresh context.`,
        );
        try {
          pushAssistantStatus(`Continuing on **${name}**…`);
        } catch { /* ignore */ }
      }
    } catch { /* rotation is best-effort */ }

    // Plan mode — deep in-chat plan card; no file writes (until “lets build this”).
    // Keep refining / add-to-plan soft-rearms Plan even if the pill was cleared.
    // Never steal Fix / queue / Debug-remaining asks when the Plan pill is still armed.
    // Never steal DIY tooling / how-to / shopping Q&A into Plan (Python/VS Code, buy parts, etc.).
    const askForPlan = stripComposerPrefix(prep.content);
    const priorPlanForSoft = findLatestPlanReport(messagesRef.current || [], activeChatId);
    const softPlanRefine = looksLikePlanRefineAsk(askForPlan)
      || (Boolean(priorPlanForSoft?.steps?.length) && looksLikePlanIncrementalAdd(askForPlan));
    const planSideChat = looksLikePlanSideChatAsk(askForPlan);
    const clinicFixAskEarly = looksLikeClinicFixAsk(askForPlan);
    const remainingAskEarly = looksLikeRemainingAsk(askForPlan);
    const queueChipAskEarly = looksLikeWorkQueueDoNext(askForPlan)
      || looksLikeWorkQueueFinishAll(askForPlan)
      || looksLikeWorkQueueStop(askForPlan);
    const {
      looksLikeBuildToolingAsk,
      looksLikeHowToGuideAsk,
      looksLikeShoppingOrPartsLinksAsk,
    } = await import('@/lib/replySanity');
    const { looksLikeSimpleBuildToyChatAsk } = await import('@/lib/chatIntent');
    const diyChatAsk = looksLikeBuildToolingAsk(askForPlan)
      || looksLikeHowToGuideAsk(askForPlan)
      || looksLikeShoppingOrPartsLinksAsk(askForPlan)
      || looksLikeSimpleBuildToyChatAsk(askForPlan);
    // Soft talk-first (“talk me through / do not create files”) must never fire the Plan card,
    // even if the Plan pill is still armed from an earlier turn — unless they explicitly ask to plan.
    // Forbid lists (“Do not create a todo…”) next to hard create are not talk-first.
    const { isCreateRefusedAsk } = await import('@/lib/createProjectIntent');
    const talkFirstNoPlanCard = !softPlanRefine && (
      isCreateRefusedAsk(askForPlan)
      || /\btalk\s+me\s+through\b/i.test(askForPlan)
      || /\bfirst\s+version\s+only\b/i.test(askForPlan)
      || /\bno\s+files\s+yet\b/i.test(askForPlan)
    );
    // Sticky Plan pill + a plain chat question (“risks?”, “quick one…”) → answer in chat, keep plan synced.
    if ((diyChatAsk || talkFirstNoPlanCard || planSideChat) && earlyComposerMode === 'plan' && !softPlanRefine) {
      try { prep.setComposerMode?.(null); } catch { /* ignore */ }
    }
    // Hard create (“on disk now”, “skip plan”, “build it”) must never stall on a Plan card.
    const hardCreateEscape = looksLikeImplementGo(askForPlan)
      || /\bskip\s+plan\b/i.test(askForPlan)
      || /\bon\s+disk\s+now\b/i.test(askForPlan)
      || /\b(?:create|build|scaffold)\b[\s\S]{0,120}\bon\s+disk\b/i.test(askForPlan);
    if (hardCreateEscape && earlyComposerMode === 'plan') {
      try { prep.setComposerMode?.(null); } catch { /* ignore */ }
    }
    if (
      ((earlyComposerMode === 'plan' && !diyChatAsk && !talkFirstNoPlanCard && !planSideChat) || softPlanRefine)
      && !hardCreateEscape
      && !clinicFixAskEarly
      && !remainingAskEarly
      && !queueChipAskEarly
      && !diyChatAsk
      && !talkFirstNoPlanCard
      && !planSideChat
    ) {
      if (softPlanRefine && earlyComposerMode !== 'plan') {
        try { prep.setComposerMode?.('plan'); } catch { /* ignore */ }
      }
      const ask = askForPlan;
      const priorPlan = findLatestPlanReport(messagesRef.current || [], activeChatId);
      // One-line feature adds must stay short so the fast incremental path matches.
      // Enter-plan phrases stitch recent chat so the model has the product brief.
      const planBrief = (priorPlan?.steps?.length && looksLikePlanIncrementalAdd(ask))
        ? ask
        : buildPlanBriefFromThread(ask, messagesRef.current || []);
      const projectName = extractProjectName(planBrief)
        || extractProjectName(ask)
        || createIntentEarly?.name
        || resolvedStudio.name
        || 'your idea';
      const boundName = workspaceBound
        ? (resolvedStudio.name
          || studioPathBasename(chatStudioDiskRootRef.current || resolvedStudio.diskRoot || '')
          || 'project')
        : null;
      const setDropHint = typeof prep.setDropHint === 'function' ? prep.setDropHint : null;
      const planTitle = priorPlan?.title || projectName;
      const refining = Boolean(priorPlan?.steps?.length);
      setDropHint?.(refining ? 'Planning · refining your outline…' : 'Planning · drafting a deeper outline…');
      pushAssistantStatus(`Plan · ${planTitle}`);
      // Live Plan: open the synced overlay while drafting (same idea as live Code).
      try {
        setChatPlanPill(activeChatId, true);
        requestOpenChatPlan({ chatId: activeChatId, openOverlay: true, live: true });
      } catch { /* ignore */ }
      try {
        const report = await runPlanMode({
          userMessage: planBrief,
          projectName: planTitle,
          boundName,
          preferredModelId: pinnedModel?.id,
          priorPlan,
          onProgress: (msg) => {
            if (turnDead()) return;
            pushAssistantStatus(msg);
            try {
              requestOpenChatPlan({ chatId: activeChatId, openOverlay: true, live: true });
            } catch { /* ignore */ }
          },
        });
        if (await prep.stopIfSuperseded?.()) return;
        const finalTitle = report.title || planTitle;
        try {
          saveChatPlan(activeChatId, report);
          setChatPlanPill(activeChatId, true);
          requestOpenChatPlan({ chatId: activeChatId, openOverlay: true, live: false });
        } catch { /* ignore */ }
        setLastPendingGreenfield(activeChatId, {
          name: finalTitle,
          slug: slugifyProjectName(finalTitle),
          kind: resolveProjectKindForCreate(report.summary || ask, 'vite-react', 'vite-react'),
          summary: serializePlanReportForCreate(report),
          planLog: planReportToPlanLog(report),
          problemLine: `Build ${finalTitle} from your plan.`,
        });
        try {
          prep.renameChat?.(activeChatId, cleanProductTitle(finalTitle));
        } catch { /* ignore */ }
        pushAssistantStatus('Outline ready');
        setDropHint?.('Planning · outline ready · open Plan to review, or say Let’s build.');
        const changeNote = refining && looksLikePlanIncrementalAdd(ask)
          ? `Added that to **${finalTitle}**. The Plan map now has **${countPlanSteps(report)}** steps — open **Plan** to review.`
          : undefined;
        await finishPlainReply(
          formatPlanChatReply(report, { refining, changeNote }),
          'NOVA · Plan',
        );
      } catch (err) {
        if (await prep.stopIfSuperseded?.()) return;
        const detail = err instanceof Error ? err.message : String(err || 'unknown');
        pushAssistantStatus(`Plan stalled · ${detail.slice(0, 80)}`);
        setDropHint?.('Planning · try again, or refine your brief.');
        await finishPlainReply(
          `Plan mode stalled: ${detail}\n\nTry again, or add more detail about what you want to build.`,
          'NOVA · Plan',
        );
      }
      return;
    }

    // Debug clinic — read-only scan. Fix asks (“fix DBG-002”, “work on low”, “add README”)
    // must NOT rescan — they fall through to the Agent work-queue path below.
    // “What’s remaining?” / “rescan” forces a fresh clinic even if composer is still on Fix/Agent.
    // Overview asks (“what is this project about?”) never dump the full clinic — answer the ask.
    const askForMode = stripComposerPrefix(prep.content);
    // Explicit edit / landing rewrite must never be swallowed by a sticky Debug composer mode.
    const explicitEditKind = /<!--\s*(?:nova|ark)-kind:\s*edit\s*-->/i.test(prep.content);
    const structuralUiEditAsk = /\b(?:replace|rewrite|rebuild)\b/i.test(askForMode)
      || (/\b(?:nav|hero|footer|eyebrow|cta)\b/i.test(askForMode)
        && /\b(?:add|update|change|make|build)\b/i.test(askForMode));
    if ((explicitEditKind || structuralUiEditAsk) && earlyComposerMode === 'debug') {
      try { prep.setComposerMode?.(null); } catch { /* ignore */ }
      earlyComposerMode = null;
    }
    const clinicFixAsk = looksLikeClinicFixAsk(askForMode)
      && !explicitEditKind
      && !structuralUiEditAsk;
    const remainingAsk = looksLikeRemainingAsk(askForMode) && !explicitEditKind && !structuralUiEditAsk;
    const { looksLikeProjectOverviewAsk } = await import('@/lib/chatProjectDebug');
    const overviewAsk = looksLikeProjectOverviewAsk(askForMode);
    if (overviewAsk && earlyComposerMode === 'debug' && !remainingAsk) {
      if (!workspaceBound) {
        await finishPlainReply(
          'Open or bind the project folder first (**+ → clip → Project folder**), then ask again what it is about.',
          'NOVA · Overview',
        );
        return;
      }
      pushAssistantStatus('Checking what this project is about…');
      const files = chatStudioFilesRef.current || resolvedStudio.files || {};
      const projectName = resolvedStudio.name
        || studioPathBasename(chatStudioDiskRootRef.current || resolvedStudio.diskRoot || '')
        || 'project';
      const { describeProjectFromFiles } = await import('@/lib/projectInspect');
      const body = describeProjectFromFiles(files, projectName);
      const reply = [
        body.trim(),
        '',
        'You are in **Debug** mode. Say **find problems** when you want the full clinic scan.',
        'Or tell me what to add, remove, or fix and I can work on it here.',
      ].join('\n');
      await finishPlainReply(reply, 'NOVA · Overview');
      return;
    }
    if ((earlyComposerMode === 'debug' || remainingAsk) && !clinicFixAsk) {
      if (remainingAsk && earlyComposerMode !== 'debug') {
        try { prep.setComposerMode?.('debug'); } catch { /* ignore */ }
      }
      if (!workspaceBound) {
        await finishPlainReply(
          'Grant access to the project folder you want audited.\n\nUse **+ → clip → Project folder**, then press Enter (or say **find problems**).',
          'NOVA · Debug',
        );
        return;
      }
      // Prefer live disk bytes so already-patched files don’t reappear as “new” problems.
      try {
        const diskRoot = chatStudioDiskRootRef.current || resolvedStudio.diskRoot;
        if (diskRoot) {
          const { loadPreviewFilesFromDisk } = await import('@/lib/projectPreview');
          const fresh = await loadPreviewFilesFromDisk(diskRoot);
          if (fresh && Object.keys(fresh).length) {
            setChatStudioFiles(fresh);
            chatStudioFilesRef.current = fresh;
          }
        }
      } catch { /* keep in-memory studio if disk hydrate fails */ }
      const files = chatStudioFilesRef.current || resolvedStudio.files || {};
      const sourceCount = Object.keys(files).filter((p) => !isBuildArtifactPath(p)).length;
      const projectName = resolvedStudio.name
        || studioPathBasename(chatStudioDiskRootRef.current || resolvedStudio.diskRoot || '')
        || 'project';
      const clinicTurnDead = turnDead;
      // Composer line stays simple (scanning / done). Detailed pass counters live in the bubble.
      const setDropHint = typeof prep.setDropHint === 'function' ? prep.setDropHint : null;
      const composerClinicHint = (phase: 'scan' | 'done' | 'stalled') => {
        if (!setDropHint) return;
        if (phase === 'scan') {
          setDropHint(`${projectName} · ${sourceCount} files · Scanning all files…`);
        } else if (phase === 'done') {
          setDropHint(`${projectName} · ${sourceCount} files · Done`);
        } else {
          setDropHint(`${projectName} · ${sourceCount} files · Stalled`);
        }
      };
      composerClinicHint('scan');
      // Seed expandable history, then hand off — clinic updates status from the first tick.
      pushAssistantStatus(`Debug clinic · ${projectName} · ${sourceCount} files`);
      pushAssistantStatus('Pass 1 · Inventory · starting');
      try {
        const report = await runDebugClinic({
          files,
          projectName,
          diskRoot: chatStudioDiskRootRef.current || resolvedStudio.diskRoot,
          userMessage: remainingAsk
            ? 'Rescan after fixes — list every remaining problem that still needs a patch.'
            : askForMode,
          preferredModelId: pinnedModel?.id,
          onProgress: (msg) => {
            if (clinicTurnDead()) return;
            pushAssistantStatus(msg);
            // Keep composer hint as a calm “scanning” line — never mirror file-by-file detail here.
            if (setDropHint && /^(?:Pass |Deep ·|Verify ·|Triage ·|Clinic ready)/i.test(msg)) {
              composerClinicHint('scan');
            }
          },
          shouldAbort: () => clinicTurnDead(),
        });
        if (await prep.stopIfSuperseded?.()) return;
        const liveStatus = getChatTurnStatus();
        const statusHistory = (
          liveStatus
          && liveStatus.assistantId === assistantId
          && Array.isArray(liveStatus.history)
        ) ? liveStatus.history.map((s) => ({ label: s.label, at: s.at })) : [];
        if (!statusHistory.some((s) => /^done$/i.test(s.label))) {
          statusHistory.push({ label: 'Done', at: Date.now() });
        }
        composerClinicHint('done');
        await finishPlainReply(
          formatClinicReportMessage(report, statusHistory),
          remainingAsk ? 'NOVA · Debug · remaining' : 'NOVA · Debug clinic',
        );
      } catch (err) {
        if (await prep.stopIfSuperseded?.()) return;
        const detail = err instanceof Error ? err.message : String(err || 'unknown');
        pushAssistantStatus(`Clinic stalled · ${detail.slice(0, 80)}`);
        composerClinicHint('stalled');
        await finishPlainReply(
          `Debug clinic stalled: ${detail}\n\nBind the folder again, or try with a smaller project tree.`,
          'NOVA · Debug',
        );
      }
      return;
    }

    // Agent / Multi-agent — work queue on a bound project (Scout→Builder→Critic for multitask).
    // Also handles Debug “fix DBG-xxx” / “work on low” / “add README” without rescanning.
    const askPlain = askForMode;
    const softMulti = wantsMultiAgentTurn(askPlain, earlyComposerMode === 'multitask');
    const queueFollowUp = looksLikeWorkQueueDoNext(askPlain)
      || looksLikeWorkQueueFinishAll(askPlain)
      || looksLikeWorkQueueStop(askPlain);
    const savedQueue = queueFollowUp || clinicFixAsk ? loadWorkQueue(activeChatId) : null;
    const agentLike = earlyComposerMode === 'agent'
      || earlyComposerMode === 'multitask'
      || softMulti
      || clinicFixAsk
      || Boolean(savedQueue);
    if (agentLike) {
      // Fix / queue chips win over a leftover Plan pill so “Fix DBG-009” never drafts a plan.
      if (earlyComposerMode === 'plan' && (clinicFixAsk || queueFollowUp)) {
        try { prep.setComposerMode?.('agent'); } catch { /* ignore */ }
      }
      const workMode: 'agent' | 'multitask' =
        earlyComposerMode === 'multitask'
        || softMulti
        || savedQueue?.mode === 'multitask'
          ? 'multitask'
          : 'agent';
      if (!workspaceBound) {
        await finishPlainReply(
          workMode === 'multitask'
            ? 'Grant access to the project folder for Multi-agent.\n\nUse **+ → clip → Project folder**, then press Enter.'
            : 'Grant access to the project folder so I can apply the fix.\n\nUse **+ → clip → Project folder**, then say **fix DBG-002** (or **add a README**) again.',
          clinicFixAsk ? 'NOVA · Fix' : (workMode === 'multitask' ? 'NOVA · Multi-agent' : 'NOVA · Agent'),
        );
        return;
      }
      const files = { ...(chatStudioFilesRef.current || resolvedStudio.files || {}) };
      const projectName = resolvedStudio.name
        || studioPathBasename(chatStudioDiskRootRef.current || resolvedStudio.diskRoot || '')
        || 'project';
      const projectId = chatStudioProjectIdRef.current || resolvedStudio.projectId || activeChatId;
      const setDropHint = typeof prep.setDropHint === 'function' ? prep.setDropHint : null;
      const label = clinicFixAsk ? 'Fix' : (workMode === 'multitask' ? 'Multi-agent' : 'Agent');
      setDropHint?.(`${projectName} · ${label} · working…`);
      pushAssistantStatus(`${label} · ${projectName}`);
      const diskForOverlay = chatStudioDiskRootRef.current || resolvedStudio.diskRoot || null;
      // Open Code pill while applying so the user can watch files change, then close after.
      try {
        requestOpenChatCode({
          projectId,
          diskPath: diskForOverlay || undefined,
          name: projectName,
          openOverlay: true,
        });
      } catch { /* ignore */ }
      try {
        if (clinicFixAsk && earlyComposerMode === 'debug') {
          // Stay useful: soft-arm Agent so follow-up chips keep working.
          try { prep.setComposerMode?.('agent'); } catch { /* ignore */ }
        } else if (workMode === 'multitask' && earlyComposerMode !== 'multitask') {
          try { prep.setComposerMode?.('multitask'); } catch { /* ignore */ }
        }

        // New chat / fresh bind: named DBG fix with no clinic in this thread → rescan first.
        let messagesForAgent = messagesRef.current || [];
        const namedFixIds = clinicFixAsk ? extractClinicFixIds(askPlain) : [];
        const hasClinicInThread = messagesForAgent.some(
          (m) => m?.role === 'assistant' && parseClinicReportMessage(String(m.content || '')),
        );
        const queueKnowsNamed = Boolean(
          namedFixIds.length
          && savedQueue?.items?.some((i) => namedFixIds.some(
            (id) => id.toUpperCase() === String(i.id || '').toUpperCase(),
          )),
        );
        let preScanNote = '';
        if (
          clinicFixAsk
          && namedFixIds.length
          && !hasClinicInThread
          && !queueKnowsNamed
          && !turnDead()
        ) {
          pushAssistantStatus('Debug clinic · rescan before fix');
          setDropHint?.(`${projectName} · Debug · rescanning so I know ${namedFixIds[0]}…`);
          try {
            const report = await runDebugClinic({
              files: chatStudioFilesRef.current || files,
              projectName,
              diskRoot: chatStudioDiskRootRef.current || resolvedStudio.diskRoot,
              userMessage: 'Rescan so I can apply the requested DBG fix with current findings.',
              preferredModelId: pinnedModel?.id,
              onProgress: (msg) => {
                if (turnDead()) return;
                pushAssistantStatus(msg);
              },
              shouldAbort: () => turnDead(),
            });
            if (await prep.stopIfSuperseded?.()) return;
            const clinicBubble = formatClinicReportMessage(report);
            messagesForAgent = [
              ...messagesForAgent,
              { role: 'assistant', content: clinicBubble },
            ];
            preScanNote = [
              `**Fresh Debug clinic** (this chat had no prior scan)`,
              '',
              clinicBubble,
              '',
              '---',
              '',
            ].join('\n');
          } catch (err) {
            const detail = err instanceof Error ? err.message : String(err || 'unknown');
            await finishPlainReply(
              `I need a Debug clinic report before I can fix ${namedFixIds.map((id) => `**${id}**`).join(', ')}, but the rescan stalled: ${detail}\n\nSay **find problems** and try the fix again.`,
              'NOVA · Fix',
            );
            return;
          }
        }

        const result = await runAgentWorkMode({
          chatId: activeChatId,
          mode: workMode,
          userMessage: askPlain,
          files,
          projectId,
          projectName,
          diskRoot: chatStudioDiskRootRef.current || resolvedStudio.diskRoot,
          preferredModelId: pinnedModel?.id,
          messages: messagesForAgent,
          onProgress: (msg, writingPath) => {
            if (turnDead()) return;
            pushAssistantStatus(msg, writingPath);
          },
          shouldAbort: () => turnDead(),
          commitFiles: (nextFiles, updated) => {
            try {
              setChatStudioFiles(nextFiles);
              chatStudioFilesRef.current = nextFiles;
              prep.commitStudioForChat?.(activeChatId, {
                files: nextFiles,
                projectId,
                name: projectName,
                diskRoot: chatStudioDiskRootRef.current || resolvedStudio.diskRoot || null,
              });
              if (updated.length) {
                prep.persistStudioSnapshot?.(activeChatId);
              }
            } catch { /* ignore studio sync */ }
          },
        });
        if (await prep.stopIfSuperseded?.()) return;

        let finalReply = preScanNote ? `${preScanNote}${result.reply}` : result.reply;
        // After clinic-seeded queue is fully clear — full Debug clinic rescan (one bubble).
        if (result.needsFullRescan && !turnDead()) {
          pushAssistantStatus('Debug clinic · rescanning after fixes');
          setDropHint?.(`${projectName} · Debug · rescanning…`);
          try {
            // Prefer live disk bytes so just-patched files don’t reappear as “still open”.
            let rescanFiles = chatStudioFilesRef.current || result.files;
            try {
              const diskRoot = chatStudioDiskRootRef.current || resolvedStudio.diskRoot;
              if (diskRoot) {
                const { loadPreviewFilesFromDisk } = await import('@/lib/projectPreview');
                const fresh = await loadPreviewFilesFromDisk(diskRoot);
                if (fresh && Object.keys(fresh).length) {
                  rescanFiles = fresh;
                  setChatStudioFiles(fresh);
                  chatStudioFilesRef.current = fresh;
                }
              }
            } catch { /* keep in-memory studio if disk hydrate fails */ }
            const report = await runDebugClinic({
              files: rescanFiles,
              projectName,
              diskRoot: chatStudioDiskRootRef.current || resolvedStudio.diskRoot,
              userMessage: 'Rescan after fixes — find any remaining problems or security risks.',
              preferredModelId: pinnedModel?.id,
              onProgress: (msg) => {
                if (turnDead()) return;
                pushAssistantStatus(msg);
              },
              shouldAbort: () => turnDead(),
            });
            if (await prep.stopIfSuperseded?.()) return;
            finalReply = [
              result.reply.replace(/\n\nQueue clear — running a fresh \*\*Debug clinic\*\* pass to catch anything new\./i, '').trim(),
              '',
              '---',
              '',
              '**Fresh Debug clinic** (after fixes)',
              '',
              formatClinicReportMessage(report),
            ].join('\n');
          } catch (err) {
            const detail = err instanceof Error ? err.message : String(err || 'unknown');
            finalReply = `${result.reply}\n\nPost-fix rescan stalled: ${detail}\n\nSay **find problems** to run Debug again.`;
          }
        }

        pushAssistantStatus(result.queue ? `${label} · next ready` : 'Done', null);
        setDropHint?.(
          result.queue
            ? `${projectName} · ${label} · next task ready`
            : `${projectName} · ${label} · done`,
        );
        // Let the Code pill show the final bytes briefly, then tuck it away.
        if (result.updated.length) {
          await new Promise((r) => setTimeout(r, 900));
        }
        try { requestCloseChatCode(); } catch { /* ignore */ }
        await finishPlainReply(
          finalReply,
          result.needsFullRescan
            ? 'NOVA · Fix + clinic'
            : (clinicFixAsk ? 'NOVA · Fix' : (workMode === 'multitask' ? 'NOVA · Multi-agent' : 'NOVA · Agent')),
        );
      } catch (err) {
        if (await prep.stopIfSuperseded?.()) return;
        const detail = err instanceof Error ? err.message : String(err || 'unknown');
        pushAssistantStatus(`${label} stalled · ${detail.slice(0, 80)}`, null);
        setDropHint?.(`${projectName} · ${label} · stalled`);
        try { requestCloseChatCode(); } catch { /* ignore */ }
        await finishPlainReply(
          `${label} stalled: ${detail}\n\nBind the folder again, or try a smaller ask.`,
          clinicFixAsk ? 'NOVA · Fix' : (workMode === 'multitask' ? 'NOVA · Multi-agent' : 'NOVA · Agent'),
        );
      }
      return;
    }

    const resolvedAsk = resolveConversationalEditAsk({
      message: prep.content,
      chatId: activeChatId,
      messages: messagesRef.current,
      workspaceBound,
      hasApplySnapshot: Boolean(getApplySnapshot(activeChatId)),
    });
    const editContent = resolvedAsk.content;

    if (resolvedAsk.revertSnapshot && workspaceBound) {
      const snap = getApplySnapshot(activeChatId);
      const blocks = snap ? snapshotToRevertBlocks(snap) : '';
      if (snap && blocks) {
        const applied = await applyChatReplyEdits({
          reply: blocks,
          projectId: chatStudioProjectIdRef.current || resolvedStudio.projectId,
          projectName: resolvedStudio.name || 'project',
          files: snap.files,
          userMessage: 'put it back',
          diskRoot: snap.diskRoot,
        });
        if (applied.ok) {
          setChatStudioFiles(applied.files);
          chatStudioFilesRef.current = applied.files;
          prep.persistStudioSnapshot(activeChatId, {
            files: applied.files,
            projectId: chatStudioProjectIdRef.current || resolvedStudio.projectId,
            diskRoot: snap.diskRoot,
          });
          clearApplySnapshot(activeChatId);
          const topic = inferEditTopicFromAsk(activeChatId, 'put it back', {
            priorFiles: snap.files,
            nextFiles: applied.files,
          });
          if (topic) rememberLastEditTopic(topic);
          const answer = finalizeCodingChatBubble({
            userMessage: prep.content,
            rawReply: '',
            changedPaths: applied.updated,
            applied: true,
          }) || 'Put it back — restored the previous version.';
          const reply = buildStudioTraceMessage({
            startedAt: prep.replyStartedAt,
            elapsedMs: Math.max(1, Date.now() - prep.replyStartedAt),
            userMessage: prep.content,
            answer,
            wrotePaths: applied.updated,
            projectName: resolvedStudio.name || 'App',
          });
          await finishPlainReply(reply, 'NOVA · undo');
          return;
        }
      }
    }

    const bag: HostBag = {
      turnCtx,
      content: prep.content,
      editUserMessage: editContent,
      mode,
      activeChatId,
      assistantId,
      mySeq,
      replyStartedAt: prep.replyStartedAt,
      pinnedModel,
      composerMode,
      regenerating: Boolean(prep.regenerating),
      diskIntent,
      diskRoot: prep.diskRoot,
      diskProjectId: prep.diskProjectId,
      diskWorkspaceName: prep.diskWorkspaceName,
      stickyDiskTarget: prep.stickyDiskTarget,
      workspaceActiveForCreate,
      createIntentEarly,
      earlyComposerMode,
      earlyPkg,
      earlyAgentCwd,
      userId: prep.userId,
      workspaceFileCount: Object.keys(resolvedStudio.files || {}).length,
      resolvedStudio,
      messages: messagesRef.current,
      routeChatId: routeChatIdRef.current,
      finishPlainReply,
      pushAssistantStatus,
      stopIfSuperseded: prep.stopIfSuperseded,
      clearGeneratingIfMineEarly,
      commitStudioForChat: prep.commitStudioForChat,
      persistStudioSnapshot: prep.persistStudioSnapshot,
      persistModeThread: prep.persistModeThread,
      renameChat: prep.renameChat,
      addChat: prep.addChat,
      touchRecentProject: prep.touchRecentProject,
      previewFromText: prep.previewFromText,
      setCodePillSticky: prep.setCodePillSticky,
      setDeleteFilePrompt: prep.setDeleteFilePrompt,
      setDeleteProjectPrompt: prep.setDeleteProjectPrompt,
      setDeleteFolderClarifyPrompt: prep.setDeleteFolderClarifyPrompt,
      onCoderPinned: (coder) => {
        try {
          const parked = isEnsembleAutoParked();
          // Parked one-seat: warm the locked brain + label only — do not steal chat prefs into a coder seat.
          if (!parked) {
            setActiveBrainId('coder', coder.id);
            setLocalPrefs({
              activeCoderId: coder.id,
              defaultCodeModelId: coder.id,
            });
          }
          void setEngineModel(coder.id).catch(() => undefined);
          try {
            setLocalPrefs({ lastAnsweredLabel: `Local · ${coder.name}` });
          } catch { /* ignore */ }
          const short = String(coder.name || coder.id)
            .replace(/^Local · /i, '')
            .trim();
          const label = parked ? 'Building' : 'Craft';
          prep.setCreateLiveModelLabel?.(
            short ? `${label} · ${short.length > 18 ? `${short.slice(0, 16)}…` : short}` : label,
          );
        } catch { /* ignore */ }
      },
      onCreatePhaseModel: (phase) => {
        try {
          const role = String(phase.role || 'craft');
          const short = String(phase.name || phase.id)
            .replace(/^Local · /i, '')
            .trim();
          const parked = isEnsembleAutoParked();
          // Parked = one locked brain; phase names are status only (not Craft/Style seats).
          const roleLabel = parked
            ? (role === 'done' ? 'Done' : role === 'verify' ? 'Verifying' : 'Building')
            : (role === 'craft' ? 'Craft'
              : role === 'verify' ? 'Verify'
                : role === 'design' ? 'Design'
                  : role === 'copy' ? 'Copy'
                    : role === 'style' ? 'Style'
                      : role === 'critic' ? 'Critic'
                        : role === 'plan' || role === 'spec' ? 'Plan'
                          : role === 'done' ? 'Done'
                            : 'Build');
          prep.setCreateLiveModelLabel?.(
            short
              ? `${roleLabel} · ${short.length > 18 ? `${short.slice(0, 16)}…` : short}`
              : roleLabel,
          );
          try {
            setLocalPrefs({ lastAnsweredLabel: `${roleLabel} · ${phase.name}` });
          } catch { /* ignore */ }
          // Ensemble parked: never mutate coder/design prefs per phase (one seat locked).
          if (!parked) {
            if (phase.role === 'craft' || phase.role === 'verify') {
              setActiveBrainId('coder', phase.id);
              setLocalPrefs({
                activeCoderId: phase.id,
                defaultCodeModelId: phase.id,
                lastAnsweredLabel: `Craft · ${phase.name}`,
              });
            }
            if (phase.role === 'design' || phase.role === 'style') {
              try { setActiveBrainId('design', phase.id); } catch { /* ignore */ }
              setLocalPrefs({ activeDesignId: phase.id });
            }
          }
          // Single Brain Create — never unload/reload GGUF on phase labels (OS freeze).
          if (phase.role === 'done') {
            // Restore Auto only when the user was already on Auto. An explicit
            // Ready-row / force-chat-model pin must survive create Done (ladder tests).
            try {
              const prefs = getLocalPrefs();
              const pinned = [prefs.lastChatModelId, prefs.defaultModelId, prefs.activeChatId]
                .map((s) => String(s || '').trim())
                .find((id) => id && id !== 'NOVA-auto');
              if (!pinned) {
                setLocalPrefs({
                  lastChatModelId: 'NOVA-auto',
                  defaultModelId: 'NOVA-auto',
                  activeChatId: 'NOVA-auto',
                });
                prep.setActiveModel?.(defaultModelForKind('chat'));
              }
            } catch { /* ignore */ }
            window.setTimeout(() => prep.setCreateLiveModelLabel?.(null), 1800);
          }
        } catch { /* ignore */ }
      },
      pendingFileDeleteRef: prep.pendingFileDeleteRef,
      pendingProjectDeleteRef: prep.pendingProjectDeleteRef,
      pendingFolderClarifyRef: prep.pendingFolderClarifyRef,
      openFolderInChat: prep.openFolderInChat,
      lastFolderLocateNoteRef: prep.lastFolderLocateNoteRef,
      chatStudioFilesRef,
      chatStudioDiskRootRef,
      chatStudioProjectIdRef,
      setChatStudioFiles,
      setChatStudioDiskRoot,
      setChatStudioProjectId,
      setMessages: prep.setMessages,
      messagesRef,
      genSeqRef,
      genSeqByChatRef,
      stopRequestedRef,
      stopRequestedByChatRef,
      threadBrainRef,
      pushLivePreview: prep.pushLivePreview,
      flushQueuedSend,
      relPathFromDisk: prep.relPathFromDisk || (() => null),
    };

    const recentUserLines = messagesRef.current
      .filter((m) => m.role === 'user')
      .map((m) => String(m.content || '').trim())
      .filter(Boolean)
      .slice(-12);

    // Connected plugins (Gmail, Slack, GitHub, …) must win over the local chat model —
    // but never hijack Debug clinic, and never steal bound-folder / Answer Contract disk asks.
    const { looksLikeBoundProjectAsk } = await import('@/lib/chatProjectDebug');
    const { resolveAnswerContract, contractBlocksPlugins } = await import('@/lib/answerContract');
    const boundFiles = Object.keys(chatStudioFilesRef.current || resolvedStudio.files || {}).length > 0;
    const answerContract = resolveAnswerContract({
      message: prep.content,
      hasBoundFiles: boundFiles,
    });
    const boundProjectAsk = (looksLikeBoundProjectAsk(prep.content) && boundFiles)
      || contractBlocksPlugins(answerContract);
    if (
      prep.pluginId
      && earlyComposerMode !== 'debug'
      && earlyComposerMode !== 'plan'
      && !boundProjectAsk
      && answerContract.allowPlugins
    ) {
      pushAssistantStatus('Talking to plugin…');
      const liveState = getPluginRuntime(prep.pluginId, loadPluginState());
      const pluginReply = await runPluginAction(
        prep.pluginId,
        prep.content,
        liveState.token || prep.pluginState?.token,
        liveState.permissions?.length ? liveState.permissions : prep.pluginState?.permissions,
      );
      if (pluginReply) {
        await finishPlainReply(pluginReply, prep.providerLabel || 'Plugin');
        return;
      }
    }

    // GitHub catalog shorthand when connected but mention detection missed.
    if (
      earlyComposerMode !== 'debug'
      && earlyComposerMode !== 'plan'
      && !boundProjectAsk
      && answerContract.allowPlugins
      && wantsGithubCatalog(prep.content)
    ) {
      const token = githubToken();
      if (token) {
        pushAssistantStatus('Listing GitHub repos…');
        try {
          const [user, repos] = await Promise.all([
            verifyGitHubToken(token),
            listAccountRepos(token),
          ]);
          await finishPlainReply(
            formatRepoCatalog(repos, user.login || user.name || 'GitHub'),
            `GitHub · @${user.login || 'live'}`,
          );
          return;
        } catch (err) {
          await finishPlainReply(
            err instanceof Error ? err.message : 'Could not list GitHub repositories.',
            'GitHub',
          );
          return;
        }
      }
    }

    const owned = await dispatchOwnedTurn({
      // Classify on the original ask — edit shorthand only goes to the edit host.
      content: prep.content,
      mode,
      classifyOpts: {
        diskRoot: chatStudioDiskRootRef.current || resolvedStudio.diskRoot,
        files: chatStudioFilesRef.current || resolvedStudio.files,
        projectId: chatStudioProjectIdRef.current || resolvedStudio.projectId,
        chatId: activeChatId,
        pendingBrief: getLastPendingGreenfield(activeChatId)?.summary || null,
        recentUserLines,
      },
      skipCreate: diskIntent?.type === 'add_file',
      planName: createIntentEarly?.name || extractProjectName(prep.content) || 'your idea',
      planSummary: createIntentEarly?.summary || prep.content,
      planMessages: messagesRef.current || [],
      planPreferredModelId: pinnedModel?.id || null,
      planOnProgress: (msg: string) => {
        if (turnDead()) return;
        pushAssistantStatus(msg);
      },
      savePlanBrief: ({ name, summary, planLog }) => {
        setLastPendingGreenfield(activeChatId, {
          name,
          slug: slugifyProjectName(name),
          kind: resolveProjectKindForCreate(summary, 'vite-react', 'vite-react'),
          summary,
          planLog: Array.isArray(planLog) ? planLog : undefined,
          problemLine: `Build ${name} from your plan.`,
        });
        prep.renameChat(activeChatId, cleanProductTitle(name));
      },
      finishPlainReply: async (text: string, provider?: string) => {
        // Soft Plan discovery after normal build-intent chat (never when a deep mode pill is on,
        // and never on create/clinic/plan-card results). Ask mode still gets the invite.
        let out = text;
        const raw = String(text || '');
        const skipNudge = /<!--nova-(?:clinic|plan-report|trace|prompt-chips)/i.test(raw)
          || /\b(?:created the project|scaffolded|project folder is ready|@@@FILE|Live preview)\b/i.test(raw)
          || /\bI can't do that yet\b/i.test(raw);
        const deepMode = earlyComposerMode === 'plan'
          || earlyComposerMode === 'debug'
          || earlyComposerMode === 'agent'
          || earlyComposerMode === 'multitask';
        if (
          !deepMode
          && !skipNudge
          && looksLikePlanDiscoveryAsk(stripComposerPrefix(prep.content))
        ) {
          out = appendPlanDiscoveryNudge(text, activeChatId);
        }
        await finishPlainReply(out, provider);
      },
      createHost: makeCreateHost(bag),
      deleteHost: makeDeleteHost(bag),
      openFolderHost: makeOpenFolderHost(bag),
      runCmdHost: makeRunCmdHost(bag),
      editHost: makeEditHost(bag),
      chatHost: makeChatHost(bag),
    });

    const stickChatBrain = (chatOutcome: {
      modelId?: string;
      modelName?: string;
      attemptedLen?: number;
      source?: string;
      tier?: string;
    } | undefined) => {
      if (!chatOutcome?.modelId || !chatOutcome.source || chatOutcome.source === 'none') return;
      if (pinnedModel.source !== 'auto') return;
      if (/coder|starcoder|codestral|codellama|devstral|deepseek-coder/i.test(chatOutcome.modelId)) return;
      try {
        const nextBrain = saveAutoThreadBrain(
          activeChatId,
          'chat',
          {
            reply: '',
            modelId: chatOutcome.modelId,
            modelName: chatOutcome.modelName || chatOutcome.modelId,
            source: chatOutcome.source as 'ark-gguf',
            tier: (chatOutcome.tier || 'local-free') as 'local-free',
            attempted: Array.from({ length: Math.max(1, chatOutcome.attemptedLen || 1) }, (_, i) =>
              i === 0 ? `NOVA Engine · ${chatOutcome.modelId}` : `hop-${i}`,
            ),
          },
          threadBrainRef.current as never,
          chatOutcome.attemptedLen || 1,
        );
        if (nextBrain) {
          threadBrainRef.current = nextBrain;
          prep.setThreadBrain?.(nextBrain);
        }
      } catch { /* ignore */ }
    };

    if (owned.status === 'handled') {
      stickChatBrain((owned as { chatOutcome?: Parameters<typeof stickChatBrain>[0] }).chatOutcome);
      return;
    }
    if (owned.status === 'edit') {
      await runEditTurn(makeEditHost(bag));
      return;
    }
    if (owned.status === 'continue') {
      const chatOut = await runChatTurn(makeChatHost(bag));
      stickChatBrain(chatOut);
      let replyText = chatOut.text;
      const deepMode = earlyComposerMode === 'plan'
        || earlyComposerMode === 'debug'
        || earlyComposerMode === 'agent'
        || earlyComposerMode === 'multitask';
      if (
        !deepMode
        && looksLikePlanDiscoveryAsk(stripComposerPrefix(prep.content))
      ) {
        replyText = appendPlanDiscoveryNudge(replyText, activeChatId);
      }
      await finishPlainReply(replyText, chatOut.provider || 'NOVA');
      return;
    }
    return;
  }

  if (!prep.isMediaMode) {
    clearGeneratingIfMineEarly();
    return;
  }

  chatRouteSeedRef.current = {
    history: buildRouterHistory(
      messagesRef.current.filter((m) => m.role === 'user' || m.role === 'assistant'),
      prep.content,
      undefined,
      { keepContinuity: true, kind: 'chat' },
    ),
    sticky: pinnedModel.source === 'auto' ? threadBrainRef.current : null,
  };

  const clearGeneratingIfMine = () => {
    clearGeneratingIfMineEarly();
  };

  const finalizeAssistant = (finalText: string, provider: string, libraryId?: string) => {
    const liveSeq = genSeqByChatRef?.current?.[activeChatId] ?? genSeqRef.current;
    if (mySeq !== liveSeq) return;
    if (provider && provider !== 'NOVA · setup needed') {
      setLocalPrefs({ lastAnsweredLabel: provider });
    }
    const threadChatId = activeChatId;
    const viewingThisThread = Boolean(threadChatId && routeChatIdRef.current === threadChatId);
    const cleaned = String(finalText || '').trim() || 'Done.';
    const next = messagesRef.current.map((m) => (
      m.id === assistantId
        ? { ...m, content: cleaned, provider_used: provider || 'NOVA', library_id: libraryId }
        : m
    ));
    messagesRef.current = next;
    prep.persistModeThread(mode, next, { chatId: threadChatId });
    prep.setMessages((prev) => (viewingThisThread ? next : prev));
    notifyChatDone(threadChatId);
    clearGeneratingIfMine();
  };

  chatTurnCtlRef.current = {
    clearGenerating: clearGeneratingIfMine,
    finalizeAssistant,
    pushStatus: pushAssistantStatus,
  };

  void runMediaChatTurn({
    content: prep.content,
    mode,
    composerMode,
    providerLabel: prep.providerLabel,
    mySeq,
    activeChatId,
    genJobId: prep.genJobId,
    previousAssistant: prep.previousAssistant,
    statusLabel: prep.statusLabel,
    isMediaMode: prep.isMediaMode,
    videoDurationSec: prep.videoDurationSec,
    pluginId: prep.pluginId,
    pluginState: prep.pluginState,
    pinnedModel,
    normalized: prep.normalized,
    userMsg: prep.userMsg,
    assistantMsg: prep.assistantMsg,
    assistantId,
    priorForHistory: prep.priorForHistory,
    resolvedStudio,
    turnDiskRoot: prep.turnDiskRoot,
    turnProjectId: prep.turnProjectId,
    turnStudioFiles: prep.turnStudioFiles,
    chatStudioDiskRoot: prep.chatStudioDiskRoot,
    threadKind: prep.threadKind,
    capacity: prep.capacity,
    chats: prep.chats,
    chatRouteSeedRef,
    genSeqRef,
    stopRequestedRef,
    chatTurnCtlRef,
    chatStudioFilesRef,
    chatStudioDiskRootRef,
    chatStudioProjectIdRef,
    imageBriefRef: prep.imageBriefRef,
    routeChatIdRef,
    messagesRef,
    messagesChatIdRef: prep.messagesChatIdRef,
    persistTimerRef: prep.persistTimerRef,
    threadBrainRef,
    previewUrlRef: prep.previewUrlRef,
    setMessages: prep.setMessages,
    persistModeThread: prep.persistModeThread,
    setFailoverNote: prep.setFailoverNote,
    setThreadBrain: prep.setThreadBrain,
    setIpcFallbackDev: prep.setIpcFallbackDev,
    setChatStudioFiles,
    persistStudioSnapshot: prep.persistStudioSnapshot,
    pushLivePreview: prep.pushLivePreview,
    flushQueuedSend,
    addCreation: (c) => prep.addCreation(c as never),
    addChat: (c) => prep.addChat(c as never),
    failoverChipText: prep.failoverChipText,
    previewFromText: prep.previewFromText,
  });
}
