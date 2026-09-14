/**
 * WAVE 1 follow-up: hoist tryStartTurn, fix imports.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'views', 'AIChat.tsx');
let src = fs.readFileSync(file, 'utf8');
const nl = src.includes('\r\n') ? '\r\n' : '\n';
const norm = (s) => String(s).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').join(nl);

function rep(label, from, to) {
  const f = norm(from);
  const t = norm(to);
  if (!src.includes(f)) {
    console.error('FAIL', label);
    process.exit(1);
  }
  src = src.replace(f, t);
  console.log('ok', label);
}

rep(
  'drop-handlePlan',
  `import {
  handlePlanTurnReply,
  shouldSkipWeakModelCodingHop,`,
  `import {
  shouldSkipWeakModelCodingHop,`,
);

rep(
  'classify-type-import',
  `import { classifyTurn } from '@/lib/classifyTurn';`,
  `import type { ClassifyTurnResult } from '@/lib/classifyTurn';`,
);

rep(
  'owned-classified-type',
  `let ownedClassified: ReturnType<typeof classifyTurn> | null = null;`,
  `let ownedClassified: ClassifyTurnResult | null = null;`,
);

rep(
  'early-tryStart',
  `  const sendMessageRef = useRef<(content: string) => Promise<void>>(async () => {});
  /** Bumps on every new send/stop so late chunks from an old turn cannot stick Stop/queue. */`,
  `  const sendMessageRef = useRef<(content: string) => Promise<void>>(async () => {});
  const tryStartTurn = (text: string) => {
    if (generatingRef.current) return;
    const t = String(text || '').trim();
    if (!t) return;
    void sendMessageRef.current(t);
  };
  /** Bumps on every new send/stop so late chunks from an old turn cannot stick Stop/queue. */`,
);

rep(
  'dedupe-tryStart',
  `  sendMessageRef.current = sendMessage;

  const tryStartTurn = (text: string) => {
    if (generatingRef.current) return;
    const t = String(text || '').trim();
    if (!t) return;
    void sendMessageRef.current(t);
  };

  useEffect(() => {`,
  `  sendMessageRef.current = sendMessage;

  useEffect(() => {`,
);

fs.writeFileSync(file, src);
console.log('done');
