/**
 * WAVE 2 — Kill AIChat mid-ladder for general/code; keep media path only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'src', 'views', 'AIChat.tsx');
let src = fs.readFileSync(file, 'utf8');
const nl = src.includes('\r\n') ? '\r\n' : '\n';
const beforeLines = src.split(/\r?\n/).length;

function norm(s) {
  return String(s).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').join(nl);
}
function mustReplace(label, from, to) {
  const fromN = norm(from);
  const toN = norm(to);
  if (!src.includes(fromN)) {
    console.error('FAIL missing:', label);
    process.exit(1);
  }
  src = src.replace(fromN, toN);
  console.log('ok:', label);
}

if (!src.includes("from '@/lib/chatTurnSession'")) {
  mustReplace(
    'import-hydrate',
    `} from '@/lib/chatTurnHandlers';
import {
  pushApplySnapshot,`,
    `} from '@/lib/chatTurnHandlers';
import { hydrateStudio } from '@/lib/chatTurnSession';
import {
  pushApplySnapshot,`,
  );
}

const injectHosts = `          editHost: (() => {
            const sticky = pinnedModel.source === 'auto' ? threadBrainRef.current : null;
            const files = Object.keys(turnCtx.files || {}).length
              ? turnCtx.files
              : (chatStudioFilesRef.current || resolvedStudio.files || {});
            return {
              content,
              editUserMessage: content,
              projectId: turnCtx.projectId || resolvedStudio.projectId || chatStudioProjectIdRef.current,
              projectLabel: turnCtx.name || resolvedStudio.name || 'App',
              diskRoot: turnCtx.diskRoot || chatStudioDiskRootRef.current || resolvedStudio.diskRoot,
              files,
              replyStartedAt,
              modelId: pinnedModel.id,
              modelName: pinnedModel.name,
              stickyModelId: sticky?.modelId,
              stickyModelName: sticky?.modelName,
              preferredModelId: pinnedModel.id,
              preferredModelName: pinnedModel.name,
              pushStatus: pushAssistantStatus,
              countLineDiff,
              buildStudioTraceMessage,
              onApplied: ({ files: nextFiles, reply, provider, elapsedMs }) => {
                setChatStudioFiles(nextFiles);
                chatStudioFilesRef.current = nextFiles;
                resolvedStudio.files = nextFiles;
                setChatCodePill(activeChatId, true);
                setCodePillSticky(true);
                persistStudioSnapshot(activeChatId, {
                  files: nextFiles,
                  projectId: turnCtx.projectId || resolvedStudio.projectId,
                  name: turnCtx.name || resolvedStudio.name,
                  diskRoot: turnCtx.diskRoot || chatStudioDiskRootRef.current,
                });
                void pushLivePreview(nextFiles, false);
                const next = messagesRef.current.map((m) => (
                  m.id === assistantId
                    ? { ...m, content: reply, provider_used: provider, elapsed_ms: elapsedMs }
                    : m
                ));
                messagesRef.current = next;
                persistModeThread(mode, next, { chatId: activeChatId });
                setMessages(next);
                clearGeneratingIfMineEarly();
                window.setTimeout(() => {
                  if (mySeq === genSeqRef.current) flushQueuedSend();
                }, 0);
              },
              onFailed: ({ reply, elapsedMs }) => {
                const failNext = messagesRef.current.map((m) => (
                  m.id === assistantId
                    ? { ...m, content: reply, provider_used: 'NOVA · edit', elapsed_ms: elapsedMs }
                    : m
                ));
                messagesRef.current = failNext;
                persistModeThread(mode, failNext, { chatId: activeChatId });
                setMessages(failNext);
                clearGeneratingIfMineEarly();
              },
            };
          })(),
          chatHost: {
            content,
            files: Object.keys(turnCtx.files || {}).length
              ? turnCtx.files
              : (chatStudioFilesRef.current || resolvedStudio.files || {}),
            projectName: turnCtx.name || resolvedStudio.name || undefined,
            mode: 'chat' as const,
            allowFileEdits: false,
            preferredModelId: pinnedModel.id,
            preferredModelName: pinnedModel.name,
            preferredSource: pinnedModel.source,
            stickyModelId: (pinnedModel.source === 'auto' ? threadBrainRef.current?.modelId : null),
            stickyModelName: (pinnedModel.source === 'auto' ? threadBrainRef.current?.modelName : null),
            shouldAbort: () => mySeq !== genSeqRef.current || stopRequestedRef.current,
            onDelta: (live: string) => {
              if (mySeq !== genSeqRef.current || stopRequestedRef.current) return;
              const text = String(live || '').trim();
              if (text.length < 2) return;
              setMessages((prev) => {
                const next = prev.map((m) => (m.id === assistantId ? { ...m, content: text } : m));
                messagesRef.current = next;
                return next;
              });
            },
          },
`;

mustReplace(
  'pre-hydrate',
  `    // EARLY_OWNED_DISPATCH_V217 — one door: classify once + all owned hosts.
    let ownedClassified: ClassifyTurnResult | null = null;
    let ownedStatus: 'handled' | 'edit' | 'continue' | null = null;
    if (mode === 'general' || mode === 'code') {
      {
        const earlyIntent = parseNewProjectIntent(content) || null;`,
  `    // EARLY_OWNED_DISPATCH_V218 — hydrate + all hosts including edit/chat.
    let ownedClassified: ClassifyTurnResult | null = null;
    let ownedStatus: 'handled' | 'edit' | 'continue' | null = null;
    const turnCtx = await hydrateStudio({
      chatId: activeChatId,
      chatTitle: loadRecentChats().find((c) => c.id === activeChatId)?.title || null,
      content,
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
    if (mode === 'general' || mode === 'code') {
      {
        const earlyIntent = parseNewProjectIntent(content) || null;`,
);

mustReplace(
  'inject-edit-chat-hosts',
  `            setRunningStatus: (label) => {
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
  `            setRunningStatus: (label) => {
              setChatTurnStatus({ chatId: activeChatId, assistantId, label });
            },
          },
${injectHosts}
        });
        ownedClassified = owned.classified;
        ownedStatus = owned.status;
        if (owned.status === 'handled') return;
        if (owned.status === 'continue' || owned.status === 'edit') {
          const chatOut = await runChatTurn({
            content,
            files: turnCtx.files,
            projectName: turnCtx.name,
            mode: 'chat',
            allowFileEdits: false,
            preferredModelId: pinnedModel.id,
            preferredModelName: pinnedModel.name,
            preferredSource: pinnedModel.source,
            shouldAbort: () => mySeq !== genSeqRef.current || stopRequestedRef.current,
          });
          await finishPlainReply(chatOut.text, 'NOVA');
          return;
        }
        return;
      }
    }
    // Media (image/video) only — mid-ladder below. general/code already returned.
    if (!isMediaMode) {
      clearGeneratingIfMineEarly();
      return;
    }
    const ownedAlreadyResolved = false;`,
);

fs.writeFileSync(file, src);
console.log(`AIChat lines ${beforeLines} → ${src.split(/\r?\n/).length}`);
