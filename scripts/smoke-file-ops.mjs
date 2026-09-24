/**
 * Smoke-test file op intent helpers (no Electron required).
 * node scripts/smoke-file-ops.mjs
 */
import { looksLikeReadFileAsk, parseReadFileTarget } from '../src/lib/chatPcTasks.ts';
import { classifyDiskIntent } from '../src/lib/chatDiskIntent.ts';

const CASES = [
  {
    name: 'read absolute path',
    text: 'Read C:\\Users\\me\\Desktop\\NOVA-FileLab\\warehouse-ledger.ts and tell me about restock',
    read: true,
    pathIncludes: 'warehouse-ledger.ts',
  },
  {
    name: 'rename file',
    text: 'Rename readme.md to README-new.md in my project',
    disk: 'rename_file',
  },
  {
    name: 'create file',
    text: 'Create a file called notes.txt with hello world',
    disk: 'add_file',
  },
  {
    name: 'delete file',
    text: 'Delete the file temp.log',
    disk: 'delete_file',
  },
];

let failed = 0;
for (const c of CASES) {
  if (c.read != null) {
    const ok = looksLikeReadFileAsk(c.text) === c.read;
    if (!ok) {
      console.error(`FAIL [${c.name}]: read detect`);
      failed += 1;
    }
    const target = parseReadFileTarget(c.text);
    const pathStr = typeof target === 'string'
      ? target
      : String(target?.path || target?.fileName || '');
    if (c.pathIncludes && !pathStr.includes(c.pathIncludes)) {
      console.error(`FAIL [${c.name}]: path parse got ${JSON.stringify(target)}`);
      failed += 1;
    }
  }
  if (c.disk) {
    const intent = classifyDiskIntent(c.text);
    if (intent.type !== c.disk) {
      console.error(`FAIL [${c.name}]: expected ${c.disk}, got ${intent.type}`);
      failed += 1;
    }
  }
}

if (failed) {
  console.error(`\n${failed} file-op test(s) failed`);
  process.exit(1);
}
console.log(`OK: ${CASES.length} file-op routing cases passed`);
