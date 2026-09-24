/**
 * WAVE 1: one-door sendMessage — early dispatch with all hosts; drop late owned STEPs.
 * CRLF-safe, marker-guarded replacements only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'src', 'views', 'AIChat.tsx');
let src = fs.readFileSync(file, 'utf8');
const beforeLen = src.length;
const beforeLines = src.split(/\r?\n/).length;
const nl = src.includes('\r\n') ? '\r\n' : '\n';

function norm(s) {
  return String(s).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').join(nl);
}

function mustReplace(label, from, to) {
  const fromN = norm(from);
  const toN = norm(to);
  const idx = src.indexOf(fromN);
  if (idx < 0) {
    console.error(`FAIL: missing block for ${label}`);
    const probe = fromN.replace(/\r\n/g, '\n').slice(0, 80);
    console.error('probe', JSON.stringify(probe));
    process.exit(1);
  }
  // Size guard: refuse accidental huge expansions without markers
  if (fromN.length < 40) {
    console.error(`FAIL: ${label} from-block too short (${fromN.length})`);
    process.exit(1);
  }
  src = src.slice(0, idx) + toN + src.slice(idx + fromN.length);
  console.log(`ok: ${label} (${fromN.length} → ${toN.length})`);
}

function mustReplaceOnce(label, from, to) {
  const fromN = norm(from);
  const count = src.split(fromN).length - 1;
  if (count !== 1) {
    console.error(`FAIL: ${label} expected 1 match, got ${count}`);
    process.exit(1);
  }
  mustReplace(label, from, to);
}

// --- 1) Imports: drop direct delete/open/cmd (dispatch owns them) ---
mustReplaceOnce(
  'imports-handlers',
  `  FIRST_RUN_KIND_CHIPS,
  runDeleteTurn,
  runOpenFolderTurn,
  runCmdTurn,
  runEditTurn,
  dispatchOwnedTurn,
  runChatTurn,
} from '@/lib/chatTurnHandlers';`,
  `  FIRST_RUN_KIND_CHIPS,
  runEditTurn,
  dispatchOwnedTurn,
  runChatTurn,
} from '@/lib/chatTurnHandlers';`,
);

// --- 2) Remove standalone runDeleteTurn before early dispatch ---
mustReplaceOnce(
  'remove-standalone-delete',
  `    if ((mode === 'general' || mode === 'code') && !skipDiskForInPlaceRebuild && !skipDiskForCodeEdit) {
      {
        const deleteOutcome = await runDeleteTurn({
          content,
          chatId: activeChatId,
          mode,
          assistantId,
          mySeq,
          replyStartedAt,
          diskIntent,
          diskRoot,
          diskProjectId,
          diskWorkspaceName,
          stickyDiskTarget,
          workspaceFiles: resolvedStudio.files,
          messages: messagesRef.current,
          finishPlainReply,
          getLastListedFolder,
          setLastDiskTarget,
          setDeleteFilePrompt,
          setDeleteProjectPrompt,
          setDeleteFolderClarifyPrompt,
          pendingFileDeleteRef,
          pendingProjectDeleteRef,
          pendingFolderClarifyRef,
          relPathFromDisk,
        });
        if (deleteOutcome.status === 'handled') return;
      }

      if (diskIntent.type === 'rename_file') {`,
  `    if ((mode === 'general' || mode === 'code') && !skipDiskForInPlaceRebuild && !skipDiskForCodeEdit) {
      // delete → early dispatchOwnedTurn (WAVE 1)

      if (diskIntent.type === 'rename_file') {`,
);

// --- 3) Expand early dispatch with all hosts; hoist ownedClassified ---
mustReplaceOnce(
  'early-dispatch-all-hosts',
  `        // EARLY_OWNED_DISPATCH_V217 — every kind before generate.
    if (mode === 'general' || mode === 'code') {
      const earlyClassified = classifyTurn(content, {
        diskRoot: chatStudioDiskRootRef.current || chatStudioDiskRoot || resolvedStudio.diskRoot,
        files: chatStudioFilesRef.current || resolvedStudio.files,
        projectId: chatStudioProjectIdRef.current || resolvedStudio.projectId,
        chatId: activeChatId,
      });
      // EARLY_OWNED_DISPATCH_V217 — every kind; hosts for delete/open/cmd still move up later.
      {
        const earlyIntent = parseNewProjectIntent(content) || null;
        const renameFromAsk = extractProjectName(content);
        const createIntentEarly = earlyIntent && renameFromAsk && !/^(My App|New App|App)$/i.test(renameFromAsk)
          ? { ...earlyIntent, name: renameFromAsk, slug: slugifyProjectName(renameFromAsk), summary: content.length > 40 ? \`\${content}\\n\\n\${earlyIntent.summary}\` : earlyIntent.summary }
          : earlyIntent;
        const workspaceActiveForCreate = hasActiveWorkspace({
          files: resolvedStudio.files,
          projectId: resolvedStudio.projectId || chatStudioProjectIdRef.current,
          diskRoot: resolvedStudio.diskRoot || chatStudioDiskRootRef.current,
        });
        const owned = await dispatchOwnedTurn({
          content,
          mode,
          classifyOpts: {
            diskRoot: chatStudioDiskRootRef.current || resolvedStudio.diskRoot,
            files: chatStudioFilesRef.current || resolvedStudio.files,
            projectId: chatStudioProjectIdRef.current || resolvedStudio.projectId,
            chatId: activeChatId,
          },
          skipCreate: diskIntent?.type === 'add_file',
          planName: createIntentEarly?.name || earlyClassified.createName || extractProjectName(content) || 'your idea',
          planSummary: createIntentEarly?.summary || content,
          savePlanBrief: ({ name, summary }) => {
            setLastPendingGreenfield(activeChatId, {
              name,
              slug: slugifyProjectName(name),
              kind: resolveProjectKindForCreate(summary, 'vite-react', 'vite-react'),
              summary,
              problemLine: \`Build \${name} from your brief.\`,
            });
            renameChat(activeChatId, cleanProductTitle(name));
          },
          finishPlainReply,
          createHost: {
            content,
            chatId: activeChatId,
            mode,
            workspaceBound: workspaceActiveForCreate,
            createIntent: createIntentEarly,
            classifiedCreateName: earlyClassified.createName,
            messages: messagesRef.current,
            routeChatId: routeChatIdRef.current,
            pushStatus: pushAssistantStatus,
            stopIfSuperseded,
            finishPlainReply,
            syncGrants: syncWorkspaceGrantsFromPrefs,
            commitStudio: (opts) => { commitStudioForChat(activeChatId, opts); },
            setChatCodePill,
            shouldPaintStudioLive,
            setCodePillSticky,
            renameChat,
            addChat: (chat) => addChat(chat as never),
            setLastDiskTarget,
            clearPending: clearLastPendingGreenfield,
            getPending: getLastPendingGreenfield,
            previewFromText,
          },
        });
        if (owned.status === 'handled') return;
        // edit → fall through to runEditTurn; chat → runChatTurn; other kinds without hosts continue.
      }
    }`,
  `    // EARLY_OWNED_DISPATCH_V217 — one door: classify once + all owned hosts.
    let ownedClassified: ReturnType<typeof classifyTurn> | null = null;
    let ownedStatus: 'handled' | 'edit' | 'continue' | null = null;
    if (mode === 'general' || mode === 'code') {
      {
        const earlyIntent = parseNewProjectIntent(content) || null;
        const renameFromAsk = extractProjectName(content);
        const createIntentEarly = earlyIntent && renameFromAsk && !/^(My App|New App|App)$/i.test(renameFromAsk)
          ? { ...earlyIntent, name: renameFromAsk, slug: slugifyProjectName(renameFromAsk), summary: content.length > 40 ? \`\${content}\\n\\n\${earlyIntent.summary}\` : earlyIntent.summary }
          : earlyIntent;
        const workspaceActiveForCreate = hasActiveWorkspace({
          files: resolvedStudio.files,
          projectId: resolvedStudio.projectId || chatStudioProjectIdRef.current,
          diskRoot: resolvedStudio.diskRoot || chatStudioDiskRootRef.current,
        });
        const earlyComposerMode = composerModeFromContent(content) || composerMode;
        const earlyPkg = Object.keys(resolvedStudio.files || {}).some((k) => /(^|\\/)package\\.json$/i.test(k));
        const earlyAgentCwd = chatStudioDiskRootRef.current
          || chatStudioDiskRoot
          || resolvedStudio.diskRoot
          || null;
        const earlyFinishAgentReply = (reply: string, provider = 'NOVA · agent') => {
          void finishPlainReply(reply, provider);
        };
        const owned = await dispatchOwnedTurn({
          content,
          mode,
          classifyOpts: {
            diskRoot: chatStudioDiskRootRef.current || resolvedStudio.diskRoot,
            files: chatStudioFilesRef.current || resolvedStudio.files,
            projectId: chatStudioProjectIdRef.current || resolvedStudio.projectId,
            chatId: activeChatId,
          },
          skipCreate: diskIntent?.type === 'add_file',
          planName: createIntentEarly?.name || extractProjectName(content) || 'your idea',
          planSummary: createIntentEarly?.summary || content,
          savePlanBrief: ({ name, summary }) => {
            setLastPendingGreenfield(activeChatId, {
              name,
              slug: slugifyProjectName(name),
              kind: resolveProjectKindForCreate(summary, 'vite-react', 'vite-react'),
              summary,
              problemLine: \`Build \${name} from your brief.\`,
            });
            renameChat(activeChatId, cleanProductTitle(name));
          },
          finishPlainReply,
          createHost: {
            content,
            chatId: activeChatId,
            mode,
            workspaceBound: workspaceActiveForCreate,
            createIntent: createIntentEarly,
            classifiedCreateName: createIntentEarly?.name,
            messages: messagesRef.current,
            routeChatId: routeChatIdRef.current,
            pushStatus: pushAssistantStatus,
            stopIfSuperseded,
            finishPlainReply,
            syncGrants: syncWorkspaceGrantsFromPrefs,
            commitStudio: (opts) => { commitStudioForChat(activeChatId, opts); },
            setChatCodePill,
            shouldPaintStudioLive,
            setCodePillSticky,
            renameChat,
            addChat: (chat) => addChat(chat as never),
            setLastDiskTarget,
            clearPending: clearLastPendingGreenfield,
            getPending: getLastPendingGreenfield,
            previewFromText,
          },
          deleteHost: {
            content,
            chatId: activeChatId,
            mode,
            assistantId,
            mySeq,
            replyStartedAt,
            diskIntent,
            diskRoot,
            diskProjectId,
            diskWorkspaceName,
            stickyDiskTarget,
            workspaceFiles: resolvedStudio.files,
            messages: messagesRef.current,
            finishPlainReply,
            getLastListedFolder,
            setLastDiskTarget,
            setDeleteFilePrompt,
            setDeleteProjectPrompt,
            setDeleteFolderClarifyPrompt,
            pendingFileDeleteRef,
            pendingProjectDeleteRef,
            pendingFolderClarifyRef,
            relPathFromDisk,
          },
          openFolderHost: {
            content,
            chatId: activeChatId,
            mode,
            assistantId,
            userId: user?.id || 'guest-local',
            workspaceFileCount: Object.keys(resolvedStudio.files).length,
            finishPlainReply,
            syncGrants: syncWorkspaceGrantsFromPrefs,
            resolveScopedFolderPath,
            openFolderInChat,
            formatFolderLocatedMessage,
            clearGenerating: clearGeneratingIfMineEarly,
            onOpened: ({ files, projectId, name, root, locateNote }) => {
              resolvedStudio.files = files;
              resolvedStudio.projectId = projectId || resolvedStudio.projectId;
              resolvedStudio.name = name;
              chatStudioFilesRef.current = files;
              setChatStudioFiles(files);
              if (projectId) {
                chatStudioProjectIdRef.current = projectId;
                setChatStudioProjectId(projectId);
              }
              if (root) setChatStudioDiskRoot(root);
              persistStudioSnapshot(activeChatId, {
                files,
                projectId: projectId || null,
                name,
                diskRoot: root || null,
              });
              if (locateNote) lastFolderLocateNoteRef.current = locateNote;
            },
            waitUntilBound: async (root) => {
              for (let i = 0; i < 20; i++) {
                if (chatStudioDiskRootRef.current === root) return true;
                await new Promise((r) => window.setTimeout(r, 25));
              }
              return chatStudioDiskRootRef.current === root;
            },
          },
          runCmdHost: {
            content,
            mode,
            composerMode: earlyComposerMode,
            agentCwd: earlyAgentCwd,
            hasPackageJson: earlyPkg,
            assistantId,
            finishAgentReply: earlyFinishAgentReply,
            confirm: (message) => window.confirm(message),
            setRunningStatus: (label) => {
              setMessages((prev) => prev.map((m) => (
                m.id === assistantId
                  ? { ...m, content: \`__generating__:chat:\${label}\` }
                  : m
              )));
            },
          },
        });
        ownedClassified = owned.classified;
        ownedStatus = owned.status;
        if (owned.status === 'handled') return;
        // edit → sticky hydrate + runEditTurn below; continue → chat / remaining non-owned paths.
      }
    }
    // Dead mid-ladder STEPs for owned kinds must not re-run after early dispatch.
    const ownedAlreadyResolved = ownedStatus === 'handled' || ownedStatus === 'edit';`,
);

// --- 4) Rebuild: use ownedClassified, no classifyTurn ---
mustReplaceOnce(
  'rebuild-use-owned-classified',
  `// In-place scrap/rebuild of the bound workspace. never catalog Desktop or create sibling folders.
    // Create/plan always win — never let answerStudio run before runCreateTurn.
    const rebuildClassify = (mode === 'general' || mode === 'code') && looksLikeInPlaceRebuildAsk(intentText)
      ? classifyTurn(content, {
        diskRoot: chatStudioDiskRootRef.current || chatStudioDiskRoot,
        files: chatStudioFilesRef.current,
        projectId: chatStudioProjectIdRef.current,
        chatId: activeChatId,
      })
      : null;
    if (
      (mode === 'general' || mode === 'code')
      && looksLikeInPlaceRebuildAsk(intentText)
      && rebuildClassify
      && rebuildClassify.kind !== 'create'
      && rebuildClassify.kind !== 'plan'
    ) {`,
  `// In-place scrap/rebuild of the bound workspace. never catalog Desktop or create sibling folders.
    // Create/plan always win — owned.classified from early dispatch only.
    const rebuildClassify = ownedClassified;
    if (
      (mode === 'general' || mode === 'code')
      && looksLikeInPlaceRebuildAsk(intentText)
      && rebuildClassify
      && rebuildClassify.kind !== 'create'
      && rebuildClassify.kind !== 'plan'
    ) {`,
);

// --- 5) Remove duplicate classify + plan block ---
mustReplaceOnce(
  'remove-duplicate-plan-classify',
  `    const classifiedBound = classifyTurn(content, {
      diskRoot: chatStudioDiskRootRef.current || chatStudioDiskRoot,
      files: chatStudioFilesRef.current,
      projectId: chatStudioProjectIdRef.current,
      chatId: activeChatId,
    });
    // Sovereign create/plan: handlers own the bodies (Sprint A).
    if (classifiedBound.kind === 'plan' && (mode === 'general' || mode === 'code')) {
      const pendingPlan = getLastPendingGreenfield(activeChatId);
      const planName = createIntent?.name || pendingPlan?.name || extractProjectName(content) || 'your idea';
      if (createIntent) {
        setLastPendingGreenfield(activeChatId, {
          name: createIntent.name,
          slug: createIntent.slug,
          kind: resolveProjectKindForCreate(createIntent.summary, createIntent.kind, createIntent.kind),
          summary: createIntent.summary,
          problemLine: \`Build \${createIntent.name} from your brief.\`,
        });
        renameChat(activeChatId, cleanProductTitle(createIntent.name));
      }
      await finishPlainReply(handlePlanTurnReply({
        name: planName,
        summary: createIntent?.summary || pendingPlan?.summary || content,
        savePlanBrief: ({ name, summary }) => {
          setLastPendingGreenfield(activeChatId, {
            name,
            slug: slugifyProjectName(name),
            kind: resolveProjectKindForCreate(summary, 'vite-react', 'vite-react'),
            summary,
            problemLine: \`Build \${name} from your brief.\`,
          });
          renameChat(activeChatId, cleanProductTitle(name));
        },
      }));
      return;
    }
    // Duplicate create path retired — early dispatchOwnedTurn owns create (v0.1.217).`,
  `    // Plan/create owned by early dispatchOwnedTurn (WAVE 1). Use ownedClassified only.
    const classifiedBound = ownedClassified;`,
);

// --- 6) Delete late openFolder ---
mustReplaceOnce(
  'remove-late-open',
  `    // STEP 1: Natural-language folder open (handler).
    if (mode === 'general' || mode === 'code') {
      const openOutcome = await runOpenFolderTurn({
        content,
        chatId: activeChatId,
        mode,
        assistantId,
        userId: user?.id || 'guest-local',
        workspaceFileCount: Object.keys(resolvedStudio.files).length,
        finishPlainReply,
        syncGrants: syncWorkspaceGrantsFromPrefs,
        resolveScopedFolderPath,
        openFolderInChat,
        formatFolderLocatedMessage,
        clearGenerating: clearGeneratingIfMineEarly,
        onOpened: ({ files, projectId, name, root, locateNote }) => {
          resolvedStudio.files = files;
          resolvedStudio.projectId = projectId || resolvedStudio.projectId;
          resolvedStudio.name = name;
          chatStudioFilesRef.current = files;
          setChatStudioFiles(files);
          if (projectId) {
            chatStudioProjectIdRef.current = projectId;
            setChatStudioProjectId(projectId);
          }
          if (root) setChatStudioDiskRoot(root);
          persistStudioSnapshot(activeChatId, {
            files,
            projectId: projectId || null,
            name,
            diskRoot: root || null,
          });
          if (locateNote) lastFolderLocateNoteRef.current = locateNote;
        },
        waitUntilBound: async (root) => {
          for (let i = 0; i < 20; i++) {
            if (chatStudioDiskRootRef.current === root) return true;
            await new Promise((r) => window.setTimeout(r, 25));
          }
          return chatStudioDiskRootRef.current === root;
        },
      });
      if (openOutcome.status === 'handled') return;
    }

    // STEP 1b: Folder by name. default to catalog when we parsed a folder name.`,
  `    // STEP 1 open_folder → early dispatchOwnedTurn (WAVE 1).
    if (ownedAlreadyResolved && ownedStatus === 'edit') {
      /* fall through to sticky hydrate + runEditTurn only */
    }

    // STEP 1b: Folder by name. default to catalog when we parsed a folder name.`,
);

// --- 7) Delete late runCmd ---
mustReplaceOnce(
  'remove-late-cmd',
  `    // STEP 4–5: Agent commands (handler).
    {
      const cmdOutcome = await runCmdTurn({
        content,
        mode,
        composerMode: turnComposerMode,
        agentCwd,
        hasPackageJson,
        assistantId,
        finishAgentReply,
        confirm: (message) => window.confirm(message),
        setRunningStatus: (label) => {
          setMessages(prev => prev.map(m => (
            m.id === assistantId
              ? { ...m, content: \`__generating__:chat:\${label}\` }
              : m
          )));
        },
      });
      if (cmdOutcome.status === 'handled') return;
    }

    const stickyFiles = resolvedStudio.files;`,
  `    // STEP 4–5 run_cmd → early dispatchOwnedTurn (WAVE 1).

    const stickyFiles = resolvedStudio.files;`,
);

// --- 8) runEditTurn: pass sticky/preferred; ensure early return after edit for owned edit ---
mustReplaceOnce(
  'edit-host-sticky-models',
  `        const surgical = await runEditTurn({
          content,
          editUserMessage,
          projectId: workspaceProjectId,
          projectLabel,
          diskRoot: chatStudioDiskRootRef.current,
          files: stickyFiles,
          replyStartedAt,
          visionHopMeta,
          modelId: pinnedModel.id,
          modelName: pinnedModel.name,
          pushStatus: pushAssistantStatus,`,
  `        const surgical = await runEditTurn({
          content,
          editUserMessage,
          projectId: workspaceProjectId,
          projectLabel,
          diskRoot: chatStudioDiskRootRef.current,
          files: stickyFiles,
          replyStartedAt,
          visionHopMeta,
          modelId: pinnedModel.id,
          modelName: pinnedModel.name,
          stickyModelId: sticky?.modelId,
          stickyModelName: sticky?.modelName,
          preferredModelId: pinnedModel.id,
          preferredModelName: pinnedModel.name,
          pushStatus: pushAssistantStatus,`,
);

mustReplaceOnce(
  'edit-early-return-guard',
  `        // Edit owner finished — do not fall through to a second long answerStudio.
        if (surgical.status !== 'miss') return;
        await finishPlainReply(
          'Could not apply that edit with a reliable patch. Try a clearer one-line ask, or pin a larger coder in Models.',
          'NOVA · edit',
        );
        return;
      }`,
  `        // Edit owner finished — do not fall through to a second long answerStudio.
        if (surgical.status !== 'miss') return;
        await finishPlainReply(
          'Could not apply that edit with a reliable patch. Try a clearer one-line ask, or pin a larger coder in Models.',
          'NOVA · edit',
        );
        return;
      }
      // WAVE 1: owned edit path must not continue into multi-agent / weak-hop / chat generate.
      if (ownedStatus === 'edit') {
        await finishPlainReply(
          'Could not apply that edit. Try a clearer one-line ask, or pin a larger coder in Models.',
          'NOVA · edit',
        );
        return;
      }`,
);

// --- 9) Workspace gate: null-safe classifiedBound ---
mustReplaceOnce(
  'workspace-gate-nullsafe',
  `    if (turnNeedsWorkspace && !workspaceActiveAfterPending && (mode === 'general' || mode === 'code')) {
      // Create-shaped asks never hit the workspace wall — they create a folder.
      const classifiedHere = classifiedBound;
      if (classifiedHere.kind === 'create') {
        // Fall through: create Intent path above should have handled; if not, don't wall.
      } else if (classifiedHere.kind === 'edit' || classifiedHere.kind === 'keep_building') {
        await finishPlainReply(
          'No folder is bound yet.\\n\\nSay **build me a website called …** and I’ll create one, or use **+ → Open folder**.',
        );
        return;
      } else {
        finishAgentReply(NO_WORKSPACE_MSG, 'NOVA');
        return;
      }
    }`,
  `    if (turnNeedsWorkspace && !workspaceActiveAfterPending && (mode === 'general' || mode === 'code')) {
      // Create-shaped asks never hit the workspace wall — they create a folder.
      const classifiedHere = classifiedBound;
      if (classifiedHere?.kind === 'create') {
        // Fall through: create Intent path above should have handled; if not, don't wall.
      } else if (classifiedHere?.kind === 'edit' || classifiedHere?.kind === 'keep_building') {
        await finishPlainReply(
          'No folder is bound yet.\\n\\nSay **build me a website called …** and I’ll create one, or use **+ → Open folder**.',
        );
        return;
      } else {
        finishAgentReply(NO_WORKSPACE_MSG, 'NOVA');
        return;
      }
    }`,
);

// --- 10) tryStartTurn + Continue uses last user message ---
mustReplaceOnce(
  'try-start-turn',
  `  sendMessageRef.current = sendMessage;

  useEffect(() => {
    const onContinue = () => {
      setComposerMode('agent');
      setInput('Continue');
      void sendMessageRef.current('Continue');
    };
    window.addEventListener('NOVA:agent-continue', onContinue);
    return () => window.removeEventListener('NOVA:agent-continue', onContinue);
  }, []);`,
  `  sendMessageRef.current = sendMessage;

  const tryStartTurn = (text: string) => {
    if (generatingRef.current) return;
    const t = String(text || '').trim();
    if (!t) return;
    void sendMessageRef.current(t);
  };

  useEffect(() => {
    const onContinue = () => {
      setComposerMode('agent');
      const lastUser = [...messagesRef.current].reverse().find((m) => m.role === 'user');
      const text = String(lastUser?.content || '').replace(/<!--[\\s\\S]*?-->/g, '').trim();
      if (!text || /^continue$/i.test(text)) return;
      setInput(text);
      tryStartTurn(text);
    };
    window.addEventListener('NOVA:agent-continue', onContinue);
    return () => window.removeEventListener('NOVA:agent-continue', onContinue);
  }, []);`,
);

// --- 11) Chips / voice → tryStartTurn (selected call sites) ---
mustReplaceOnce(
  'chip-first-run',
  `                        onClick={() => void sendMessageRef.current(chip.prompt)}`,
  `                        onClick={() => tryStartTurn(chip.prompt)}`,
);

// Voice typed build/edit
mustReplaceOnce(
  'voice-typed-tryStart',
  `    if (typed && looksLikeVoiceBuildOrEditAsk(typed)) {
      // Voice is Chat with a mic — same classify + create/edit path.
      setVoicePhase('idle');
      await sendMessageRef.current(typed);
      return;
    }`,
  `    if (typed && looksLikeVoiceBuildOrEditAsk(typed)) {
      // Voice is Chat with a mic — same classify + create/edit path.
      setVoicePhase('idle');
      tryStartTurn(typed);
      return;
    }`,
);

// Image handoff keeps sendMessageRef (intentional start) — leave alone.
// Prompt chips in thread:
{
  const fromN = norm(`onPromptChipPick={(prompt) => void sendMessageRef.current(prompt)}`);
  const count = src.split(fromN).length - 1;
  if (count < 1) {
    console.error('FAIL: onPromptChipPick sites missing', count);
    process.exit(1);
  }
  src = src.split(fromN).join(norm(`onPromptChipPick={(prompt) => tryStartTurn(prompt)}`));
  console.log(`ok: prompt-chip-tryStart (×${count})`);
}

// Retry-with-cloud already uses last user via sendMessage — OK.
// Continue-from-cutoff: use last user when possible
mustReplaceOnce(
  'continue-cutoff',
  `                        onClick={() => void sendMessage('Continue the previous answer from where you stopped.')}`,
  `                        onClick={() => {
                          const lastUser = [...messages].reverse().find((m) => m.role === 'user');
                          const text = String(lastUser?.content || '').replace(/<!--[\\s\\S]*?-->/g, '').trim();
                          tryStartTurn(text || 'Continue the previous answer from where you stopped.');
                        }}`,
);

// Size / sanity guards
const afterLen = src.length;
const afterLines = src.split(/\r?\n/).length;
if (Math.abs(afterLines - beforeLines) > 400) {
  console.error(`FAIL: line delta too large ${beforeLines} → ${afterLines}`);
  process.exit(1);
}
if (/\bclassifyTurn\s*\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''))) {
  // Allow type-only ReturnType<typeof classifyTurn>
  const stripped = src
    .replace(/ReturnType<\s*typeof\s+classifyTurn\s*>/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  if (/\bclassifyTurn\s*\(/.test(stripped)) {
    console.error('FAIL: classifyTurn( still present in AIChat');
    const m = stripped.match(/.{0,40}classifyTurn\s*\(.{0,40}/);
    console.error(m && m[0]);
    process.exit(1);
  }
}
if (/\brunDeleteTurn\s*\(/.test(src) || /\brunOpenFolderTurn\s*\(/.test(src) || /\brunCmdTurn\s*\(/.test(src)) {
  console.error('FAIL: late delete/open/cmd still called');
  process.exit(1);
}
if (!/deleteHost:\s*\{/.test(src) || !/openFolderHost:\s*\{/.test(src) || !/runCmdHost:\s*\{/.test(src)) {
  console.error('FAIL: early dispatch missing hosts');
  process.exit(1);
}
if (/\banswerStudio\s*\(/.test(src) || /\brunNovaAgentLoop\s*\(/.test(src)) {
  console.error('FAIL: answerStudio/runNovaAgentLoop reintroduced');
  process.exit(1);
}

fs.writeFileSync(file, src);
console.log(`wrote AIChat.tsx ${beforeLen}→${afterLen} bytes, ${beforeLines}→${afterLines} lines`);
