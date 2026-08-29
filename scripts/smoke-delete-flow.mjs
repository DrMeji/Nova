/**
 * Smoke: delete / add file / disk intent parsing (no Electron / window required).
 */
import {
  extractDeleteNameFromMessage,
  looksLikeDeleteFolderAsk,
  parseDeleteProjectTarget,
} from '../src/lib/deleteProjectFlow.ts';
import { classifyDiskIntent } from '../src/lib/chatDiskIntent.ts';
import { extractDiskParentHintFromText } from '../src/lib/diskPathResolve.ts';
import { looksLikeRestorePointAsk } from '../src/lib/chatPcTasks.ts';
import {
  looksLikeGreenfieldIdea,
  looksLikeGreenfieldCreateGo,
  parseGreenfieldIdea,
  buildGreenfieldPlanReply,
} from '../src/lib/chatIdeaIntent.ts';
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
    wantName: 'Starbucks',
    wantNameLoose: true,
    wantParent: '__desktop_projects__',
  },
  {
    input: 'Delete the file in project folder called Starbucks',
    want: 'delete_file',
    wantName: 'Starbucks',
    wantNameLoose: true,
    wantParent: '__desktop_projects__',
  },
  {
    input: 'There is a file called Starbucks inside a project folder. Can you delete it',
    want: 'delete_file',
    wantName: 'Starbucks',
    wantNameLoose: true,
    wantParent: '__desktop_projects__',
  },
  {
    input: 'create a web app called MyShop',
    // Product scaffolding is routed through the greenfield idea flow, not
    // the direct disk-intent classifier.
    want: 'none',
  },
  {
    input: 'Add it to the desktop Project folder',
    want: 'add_file',
    wantName: 'Starbucks',
    wantNameLoose: true,
    recent: ['Add a file... Call it Starbucks'],
  },
  {
    input: 'I want you to add a file called Starbucks inside the project folder, please',
    want: 'add_file',
    wantName: 'Starbucks',
    wantNameLoose: true,
    wantParent: '__desktop_projects__',
  },
  {
    input: 'create a file called arc inside of picture folder',
    want: 'add_file',
    wantName: 'arc',
    wantNameLoose: true,
    wantParent: '__root:pictures__',
  },
  {
    input: 'Go ahead and put it in pictures',
    want: 'add_file',
    wantName: 'arc',
    wantNameLoose: true,
    wantParent: '__root:pictures__',
    recent: ['create a file called arc inside of picture folder'],
  },
  {
    input: 'Now, I want you to put the file inside the pictures',
    want: 'add_file',
    wantName: 'arc',
    wantNameLoose: true,
    wantParent: '__root:pictures__',
    recent: ['create a file called arc'],
  },
  {
    input: 'project folder',
    want: 'add_file',
    wantName: 'Starbucks',
    wantNameLoose: true,
    recent: ['Add a file... Call it Starbucks'],
  },
  {
    input: 'Starbucks, that is inside the project folder. Can you go ahead and delete it',
    want: 'delete_project',
    wantName: 'Starbucks',
    recent: [],
  },
  {
    input: 'Oh, can you go ahead and delete that folder, please',
    want: 'delete_file',
    wantName: 'Starbucks',
    wantNameLoose: true,
    sticky: { path: 'C:\\Users\\test\\Pictures\\Starbucks.txt', name: 'Starbucks.txt', kind: 'file' },
  },
  {
    input: 'Now, I want you to go ahead and delete Starbucks inside a picture folder',
    want: 'delete_file',
    wantName: 'Starbucks',
    wantNameLoose: true,
    wantParent: '__root:pictures__',
  },
  {
    input: 'I want you to create a file called picture inside a picture folder',
    want: 'add_file',
    wantName: 'picture',
    wantNameLoose: true,
    wantParent: '__root:pictures__',
  },
  {
    input: 'It should go inside a picture',
    want: 'add_file',
    wantName: 'Starbucks',
    wantNameLoose: true,
    wantParent: '__root:pictures__',
    recent: ['Can you add a file called Starbucks inside the picture folder'],
  },
  {
    input: 'Can you add a file called Starbucks inside the picture folder, please',
    want: 'add_file',
    wantName: 'Starbucks',
    wantNameLoose: true,
    wantParent: '__root:pictures__',
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
  const intent = classifyDiskIntent(c.input, {
    recentUserMessages: c.recent || [],
    stickyDiskTarget: c.sticky || null,
  });
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

if (looksLikeRestorePointAsk('create a restore point for today')) {
  console.log('OK restore point ask');
} else {
  console.error('FAIL restore point detection');
  failed += 1;
}

const pathHints = [
  ['inside a picture folder', '__root:pictures__'],
  ['It should go inside a picture', '__root:pictures__'],
  ['inside the pictures', '__root:pictures__'],
];
for (const [input, want] of pathHints) {
  const got = extractDiskParentHintFromText(input);
  if (got !== want) {
    console.error(`FAIL extractDiskParentHintFromText: "${input}" got ${got} want ${want}`);
    failed += 1;
  } else {
    console.log(`OK path hint: "${input}"`);
  }
}

const greenfieldCases = [
  {
    input: 'I want to work on a project called Ring System — when someone presses the doorbell they get a phone notification. What is the best way to start?',
    wantGreenfield: true,
    wantWorkOn: false,
    wantName: 'Ring System',
  },
  {
    input: 'Hey, I want to work on a project. I want to call it Ring System. Now, I don\'t know, it\'s basically what it is. It\'s like a ring doorbell when people press it, the app get a notification on their phone. What do you think is the best way to start',
    wantGreenfield: true,
    wantName: 'Ring System',
  },
  {
    input: 'I want to build Ring System',
    wantGreenfield: true,
    wantName: 'Ring System',
  },
  {
    input: 'Let\'s work on DeBloat',
    wantGreenfield: false,
  },
  {
    input: 'Create web app called Ring System',
    wantGreenfield: false,
    wantCreateGo: true,
  },
  {
    input: 'Add a search button on the top right corner',
    wantGreenfield: false,
  },
  {
    input: 'I want to build a website for copy shop like people can get up early they can pick what coffee they want and schedule and get a message on their phone when coffee is ready where should we start',
    wantGreenfield: true,
    wantName: 'Coffee Shop',
    noDoorbell: true,
  },
];

for (const c of greenfieldCases) {
  const isGreen = looksLikeGreenfieldIdea(c.input);
  if (isGreen !== c.wantGreenfield) {
    console.error(`FAIL greenfield detect: "${c.input.slice(0, 60)}…" got ${isGreen} want ${c.wantGreenfield}`);
    failed += 1;
    continue;
  }
  if (c.wantName) {
    const idea = parseGreenfieldIdea(c.input);
    if (!idea?.name?.toLowerCase().includes(c.wantName.toLowerCase())) {
      console.error(`FAIL greenfield name: "${c.input.slice(0, 60)}" got ${idea?.name}`);
      failed += 1;
      continue;
    }
    if (c.noDoorbell) {
      const reply = buildGreenfieldPlanReply(idea);
      if (/doorbell/i.test(reply)) {
        console.error(`FAIL greenfield plan should not mention doorbell: "${c.input.slice(0, 60)}"`);
        failed += 1;
        continue;
      }
    }
  }
  if (c.wantCreateGo && !looksLikeGreenfieldCreateGo('Create project Ring System')) {
    console.error('FAIL greenfield create go');
    failed += 1;
    continue;
  }
  console.log(`OK greenfield: "${c.input.slice(0, 50)}…"`);
}

if (failed > 0) {
  console.error(`\n${failed} smoke-delete-flow case(s) failed`);
  process.exit(1);
}
console.log('\nAll smoke-delete-flow cases passed');
