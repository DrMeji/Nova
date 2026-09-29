/**
 * Smoke: Fix DBG-009 must select DBG-009 (not DBG-001), and free-form
 * eval/exec asks must route as clinic fixes — not silent rescan / wrong id.
 */
import {
  extractClinicFixIds,
  looksLikeClinicFixAsk,
  looksLikeRemainingAsk,
  prioritizeQueueForAsk,
  mergeClinicQueueProgress,
  extractClinicProblemHints,
  extractBatchCount,
} from '../src/lib/workQueue.ts';

let failed = 0;
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`ok  ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// --- DBG-009 must parse (3-digit clinic ids) ---
check(
  'extractClinicFixIds(Fix DBG-009) → DBG-009',
  JSON.stringify(extractClinicFixIds('fix DBG-009')) === JSON.stringify(['DBG-009']),
  JSON.stringify(extractClinicFixIds('fix DBG-009')),
);
check(
  'extractClinicFixIds(Fix DBG-001) → DBG-001',
  JSON.stringify(extractClinicFixIds('fix DBG-001')) === JSON.stringify(['DBG-001']),
);
check(
  'extractClinicFixIds multi-id list',
  JSON.stringify(extractClinicFixIds('fix 15, 17, and 18')) === JSON.stringify(['DBG-015', 'DBG-017', 'DBG-018']),
);
check(
  'batch “fix next 3” is not DBG-003',
  extractClinicFixIds('fix next 3 low issues').length === 0
    && extractBatchCount('fix next 3 low issues') === 3,
);

check('looksLikeClinicFixAsk(Fix DBG-009)', looksLikeClinicFixAsk('fix DBG-009'));
check(
  'looksLikeClinicFixAsk(eval/exec risk + path)',
  looksLikeClinicFixAsk('fix the eval/exec risk in electron/main.ts restart-computer handler'),
);
check(
  'remaining ask is not a clinic fix',
  looksLikeRemainingAsk("what's remaining?") && !looksLikeClinicFixAsk("what's remaining?"),
);

// --- prioritize must put DBG-009 first ---
const queue = {
  chatId: 't1',
  title: 'Debug follow-up',
  mode: 'agent',
  fromClinic: true,
  updatedAt: Date.now(),
  items: [
    { id: 'DBG-001', title: 'as any', status: 'open', severity: 'high' },
    { id: 'DBG-008', title: 'button', status: 'done', severity: 'low' },
    { id: 'DBG-009', title: 'eval/exec risk', status: 'open', severity: 'critical' },
    { id: 'DBG-010', title: 'readme', status: 'open', severity: 'low' },
  ],
};

const prioritized = prioritizeQueueForAsk(structuredClone(queue), 'fix DBG-009');
const firstOpen = prioritized.items.find((i) => i.status === 'open' || i.status === 'doing');
check(
  'prioritizeQueueForAsk Fix DBG-009 → head is DBG-009',
  firstOpen?.id === 'DBG-009',
  `got ${firstOpen?.id}`,
);
check(
  'prioritize keeps done items',
  prioritized.items.some((i) => i.id === 'DBG-008' && i.status === 'done'),
);

// --- merge progress: rebuild must not wipe done ---
const fresh = {
  ...queue,
  items: queue.items.map((i) => ({ ...i, status: 'open' })),
};
const prior = {
  ...queue,
  items: [
    { id: 'DBG-001', title: 'as any', status: 'done', severity: 'high' },
    { id: 'DBG-009', title: 'eval/exec risk', status: 'open', severity: 'critical' },
  ],
};
const merged = mergeClinicQueueProgress(fresh, prior);
check(
  'mergeClinicQueueProgress keeps DBG-001 done',
  merged.items.find((i) => i.id === 'DBG-001')?.status === 'done',
);
check(
  'mergeClinicQueueProgress leaves DBG-009 open',
  merged.items.find((i) => i.id === 'DBG-009')?.status === 'open',
);

// --- free-form problem hints ---
const hints = extractClinicProblemHints('fix the eval/exec risk in electron/main.ts');
check(
  'problem hints include eval/exec + path',
  hints.some((h) => /eval\/exec/i.test(h)) && hints.some((h) => /electron\/main\.ts/i.test(h)),
  JSON.stringify(hints),
);

const byHint = prioritizeQueueForAsk(structuredClone(queue), 'fix the eval/exec risk in electron/main.ts');
const hintHead = byHint.items.find((i) => i.status === 'open' || i.status === 'doing');
check(
  'free-form eval/exec ask prioritizes DBG-009',
  hintHead?.id === 'DBG-009',
  `got ${hintHead?.id}`,
);

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\nAll work-queue routing checks passed.');
