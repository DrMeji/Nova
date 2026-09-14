/**
 * P0 AIChat peel for BrainProfile round (CRLF-safe).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'src', 'views', 'AIChat.tsx');
let src = fs.readFileSync(file, 'utf8');
const before = src.length;
const nl = src.includes('\r\n') ? '\r\n' : '\n';

function norm(s) {
  return String(s).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').join(nl);
}

function mustReplace(label, from, to) {
  const fromN = norm(from);
  const toN = norm(to);
  if (!src.includes(fromN)) {
    console.error(`FAIL: missing block for ${label}`);
    const probe = fromN.slice(0, 60);
    console.error('probe idx', src.indexOf(probe.replace(/\r\n/g, '\n').slice(0, 40)));
    process.exit(1);
  }
  src = src.replace(fromN, toN);
  console.log(`ok: ${label}`);
}

mustReplace(
  'early-dispatch-all-kinds',
  `      if (earlyClassified.kind === 'create' || earlyClassified.kind === 'plan') {
        const earlyIntent = parseNewProjectIntent(content) || null;`,
  `      // EARLY_OWNED_DISPATCH_V217 — every kind; hosts for delete/open/cmd still move up later.
      {
        const earlyIntent = parseNewProjectIntent(content) || null;`,
);

mustReplace(
  'early-dispatch-close',
  `        if (owned.status === 'handled') return;
      }
    }`,
  `        if (owned.status === 'handled') return;
        // edit → fall through to runEditTurn; chat → runChatTurn; other kinds without hosts continue.
      }
    }`,
);

mustReplace(
  'drop-runArkAgentLoop-import',
  `import {
  runArkAgentLoop,
  shouldRunAgentLoop,
  agentLoopPreferCloud,
  agentLoopStepsToTrace,
} from '@/lib/arkAgentLoop';`,
  `import {
  shouldRunAgentLoop,
} from '@/lib/arkAgentLoop';`,
);

{
  const startMark = norm('      // Level-B agent tool loop (search → read → edit → run → verify).');
  const endMark = norm('      // Fast path: deterministic UI patches. surgical tweaks + layout rebuilds.');
  const start = src.indexOf(startMark);
  const end = src.indexOf(endMark);
  if (start < 0 || end < 0 || end <= start) {
    console.error('FAIL: agent loop block markers', { start, end });
    process.exit(1);
  }
  const replacement = norm([
    '      // Level-B agent tool loop removed from AIChat (v0.1.217).',
    '      // Capable coder hops go through runEditTurn + BrainProfile gates only.',
    '',
  ].join('\n'));
  src = src.slice(0, start) + replacement + src.slice(end);
  console.log('ok: remove-agent-loop-body');
}

mustReplace(
  'multi-agent-gate',
  `      // Multi-agent: Design → Code → Verify (+ → Multi-agent, or explicit ask).
      if (
        allowEdits
        && (workspaceProjectId || chatStudioDiskRootRef.current)
        && wantsMultiAgentTurn(content, turnComposerMode === 'multitask')
        && stickyCount > 0
      ) {
        setChatTurnStatus({
          chatId: activeChatId,
          assistantId,
          label: 'Multi-agent: Design → Code → Verify…',
        });
        const multi = await runProjectMultiAgent({`,
  `      // Multi-agent: Design → Code → Verify (+ → Multi-agent, or explicit ask).
      if (
        allowEdits
        && (workspaceProjectId || chatStudioDiskRootRef.current)
        && wantsMultiAgentTurn(content, turnComposerMode === 'multitask')
        && stickyCount > 0
        && (await (async () => {
          const { getBrainProfile, assertMultiModelAllowed } = await import('@/lib/brainProfile');
          const { getLocalPrefs } = await import('@/lib/localPrefs');
          if (!getLocalPrefs().multiModelCreate && turnComposerMode !== 'multitask') return false;
          return assertMultiModelAllowed(await getBrainProfile()).ok;
        })())
      ) {
        setChatTurnStatus({
          chatId: activeChatId,
          assistantId,
          label: 'Multi-agent: Design → Code → Verify…',
        });
        const multi = await runProjectMultiAgent({`,
);

mustReplace(
  'dup-create-guard',
  `    if (
      (mode === 'general' || mode === 'code')
      && classifiedBound.kind === 'create'
      && diskIntent.type !== 'add_file'
    ) {
      const createOutcome = await runCreateTurn({`,
  `    // Duplicate create path retired — early dispatchOwnedTurn owns create (v0.1.217).
    if (
      false
      && (mode === 'general' || mode === 'code')
      && classifiedBound.kind === 'create'
      && diskIntent.type !== 'add_file'
    ) {
      const createOutcome = await runCreateTurn({`,
);

if (/\brunArkAgentLoop\b/.test(src)) {
  console.error('FAIL: runArkAgentLoop still present');
  process.exit(1);
}

// Drop unused continue helpers if they only served the loop — leave imports; TS may warn.
fs.writeFileSync(file, src);
console.log(`patched AIChat.tsx ${before} → ${src.length} chars`);
