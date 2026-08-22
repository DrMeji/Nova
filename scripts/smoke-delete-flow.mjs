/**
 * Smoke: delete / add file / disk intent parsing (no Electron / window required).
 */
import {
  extractDeleteNameFromMessage,
  looksLikeDeleteFolderAsk,
  parseDeleteProjectTarget,
} from '../src/lib/deleteProjectFlow.ts';
import { classifyDiskIntent } from '../src/lib/chatDiskIntent.ts';
import { isBlockedDiskTargetName } from '../src/lib/projectNames.ts';

const cases = [
  {
    input: 'Delete the project named TestDelete',
    wantAsk: true,
    wantTarget: 'TestDelete',
  },
  {
    input: 'Delete the test delete project inside the Projects folder',
    wantAsk: true,
    wantName: 'test delete',
  },
  {
    input: 'delete it',
    wantAsk: true,
    wantTarget: 'follow-up',
  },
  {
    input: 'What is on my desktop?',
    wantAsk: false,
  },
];

const diskCases = [
  {
    input: 'go and add a file inside of project folder? Call it Starbucks',
    want: 'add_file',
    wantName: 'Starbucks',
    wantNameLoose: true,
  },
  {
    input: 'Delete the file that is inside the project folder called Starbucks',
    want: 'delete_file',
    wantParent: 'Starbucks',
  },
  {
    input: 'create a web app called MyShop',
    want: 'create_project',
    wantName: 'MyShop',
  },
  {
    input: 'Starbucks, that is inside the project folder. Can you go ahead and delete it',
    want: 'delete_project',
    wantName: 'Starbucks',
    recent: [],
  },
];

let failed = 0;
for (const c of cases) {
  const ask = looksLikeDeleteFolderAsk(c.input);
  if (ask !== c.wantAsk) {
    console.error(`FAIL looksLikeDeleteFolderAsk: "${c.input}" got ${ask} want ${c.wantAsk}`);
    failed += 1;
    continue;
  }
  if (!c.wantAsk) {
    console.log(`OK skip: "${c.input}"`);
    continue;
  }
  const target = parseDeleteProjectTarget(c.input);
  if (c.wantTarget && target !== c.wantTarget) {
    console.error(`FAIL parseDeleteProjectTarget: "${c.input}" got ${target} want ${c.wantTarget}`);
    failed += 1;
    continue;
  }
  if (c.wantName) {
    const name = extractDeleteNameFromMessage(c.input);
    if (!name || !name.toLowerCase().includes(c.wantName)) {
      console.error(`FAIL extractDeleteNameFromMessage: "${c.input}" got ${name} want includes ${c.wantName}`);
      failed += 1;
      continue;
    }
  }
  console.log(`OK: "${c.input}" → ${target ?? extractDeleteNameFromMessage(c.input)}`);
}

for (const c of diskCases) {
  const intent = classifyDiskIntent(c.input, { recentUserMessages: c.recent || [] });
  if (intent.type !== c.want) {
    console.error(`FAIL classifyDiskIntent type: "${c.input}" got ${intent.type} want ${c.want}`);
    failed += 1;
    continue;
  }
  if (c.wantName && 'name' in intent) {
    const got = String(intent.name || '');
    const want = c.wantName;
    const ok = c.wantNameLoose
      ? got.toLowerCase().includes(want.toLowerCase())
      : got === want;
    if (!ok) {
      console.error(`FAIL classifyDiskIntent name: "${c.input}" got ${got} want ${want}`);
      failed += 1;
      continue;
    }
  }
  if (c.wantParent && 'parentHint' in intent && intent.parentHint !== c.wantParent) {
    console.error(`FAIL classifyDiskIntent parent: "${c.input}" got ${intent.parentHint} want ${c.wantParent}`);
    failed += 1;
    continue;
  }
  console.log(`OK disk: "${c.input}" → ${intent.type}`);
}

if (isBlockedDiskTargetName('this project')) {
  console.log('OK blocklist: this project');
} else {
  console.error('FAIL blocklist: this project should be blocked');
  failed += 1;
}

if (failed > 0) {
  console.error(`\n${failed} smoke-delete-flow case(s) failed`);
  process.exit(1);
}
console.log('\nAll smoke-delete-flow cases passed');
