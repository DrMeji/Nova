/**
 * Smoke-test chat intent routing — golden prompts must not cross-route.
 * node scripts/smoke-chat-routes.mjs
 */
import {
  winningChatRoute,
  createBriefBeatsDiskRoutes,
} from '../src/lib/chatMessageRouter.ts';
import {
  shouldRouteReadFile,
  isProjectCreateBrief,
} from '../src/lib/chatRouteGuards.ts';
import { looksLikeReadFileAsk } from '../src/lib/chatPcTasks.ts';
import { parseNewProjectIntent } from '../src/lib/createProjectIntent.ts';
import { parseGreenfieldIdea } from '../src/lib/chatIdeaIntent.ts';

const SIGNAL_DESK = `Create a React + Vite app named SignalDesk (original brand — NOT Discord or Slack). Build a team messaging app with local demo data only. Must include:
* Left rail: hexagon logo, Home, Teams, DMs, Settings (lucide-react icons)
* Team sidebar: #announcements, #engineering, #design, voice channel "Standup", member list with online/idle/offline dots
* Main chat: threaded messages, reply button, edit/delete own messages, @mentions autocomplete stub, file attach button
* DMs: 3 fake users, typing indicator, read receipts (demo)
* Threads panel: click a message -> side panel shows replies
* Voice UI: call bar with mute, deafen, screen share, participant grid (fake video tiles)
* Settings modal with working tabs: Account, Appearance, Notifications, Privacy, Keybinds, Voice & Video
* Command palette (Ctrl+K): search channels and users
* Empty states for no channel selected and no DMs
* Responsive: rail collapses to icons on narrow width
* npm install + hidden dev server; Localhost opens in NOVA
Create on Desktop\\Projects with real files — full component split (Rail, Sidebar, ChatPane, etc.)`;

const CASES = [
  {
    name: 'SignalDesk create brief',
    text: SIGNAL_DESK,
    expectNotReadFile: true,
    expectCreateBrief: true,
    expectWinner: ['create_project', 'greenfield_plan'],
    expectParsedName: 'SignalDesk',
  },
  {
    name: 'NexusLink React chat app',
    text: 'Create a React + Vite app named NexusLink. Team chat with channels, DMs, voice bar. npm install. Real files on Desktop\\Projects.',
    expectNotReadFile: true,
    expectCreateBrief: true,
    expectWinner: ['create_project', 'greenfield_plan'],
    expectParsedName: 'NexusLink',
  },
  {
    name: 'explicit read file',
    text: 'Read the file package.json in my project folder',
    expectNotReadFile: false,
    expectCreateBrief: false,
    expectWinner: ['read_file'],
    expectParsedName: null,
  },
  {
    name: 'list desktop projects',
    text: 'What projects do I have on my desktop?',
    expectNotReadFile: true,
    expectCreateBrief: false,
    expectWinner: ['folder_catalog', 'pc_explore'],
    expectParsedName: null,
  },
  {
    name: 'Create project chip executes',
    text: 'Create project SignalDesk',
    expectNotReadFile: true,
    expectCreateBrief: true,
    expectWinner: ['create_project', 'greenfield_plan'],
    expectParsedName: 'SignalDesk',
    expectPreferPlanFalse: true,
  },
  {
    name: 'PlateHouse landing',
    text: 'Create a restaurant website called PlateHouse with hero, menu section, and booking CTA. Use real images from Unsplash.',
    expectNotReadFile: true,
    expectCreateBrief: true,
    expectWinner: ['create_project', 'greenfield_plan'],
    expectParsedName: 'PlateHouse',
  },
  {
    name: 'TaskRail kanban SPA',
    text: 'Create a React + Vite kanban board named TaskRail. Columns Backlog Doing Review Done. Cards drag between columns. Add Card opens a modal. Persist in localStorage. Desktop\\Projects.',
    expectNotReadFile: true,
    expectCreateBrief: true,
    expectWinner: ['create_project', 'greenfield_plan'],
    expectParsedName: 'Taskrail',
  },
  {
    name: 'SaltPier restaurant landing',
    text: 'Create SaltPier restaurant website on Desktop\\Projects with Unsplash hero, headline Tide-to-table plates, Reserve a table and View menu buttons, 4 dish cards, hours in footer. Static HTML OK.',
    expectNotReadFile: true,
    expectCreateBrief: true,
    expectWinner: ['create_project', 'greenfield_plan'],
    expectParsedName: 'SaltPier',
  },
  {
    name: 'BrassGate festival landing',
    text: 'help me plan a landing page called BrassGate with a lineup grid, ticket CTA, dark velvet vibe. Just planning, no files.',
    expectNotReadFile: true,
    expectCreateBrief: false,
    expectWinner: ['greenfield_plan'],
    expectParsedName: 'Brassgate',
  },
  {
    name: 'lets build this is implement-go',
    text: 'lets build this',
    expectNotReadFile: true,
    expectImplementGo: true,
  },
  {
    name: 'lets start building is implement-go',
    text: 'ok lets start building, take ur time do not rush building the game',
    expectNotReadFile: true,
    expectImplementGo: true,
  },
  {
    name: 'build it is implement-go',
    text: 'build it',
    expectNotReadFile: true,
    expectImplementGo: true,
  },
  {
    name: 'gaming PC is chat not create',
    text: 'If I build a mid-range gaming PC in 2026 for about $900, what CPU and GPU pair would you pick and why?',
    expectNotReadFile: true,
    expectCreateBrief: false,
    expectWinnerNot: ['create_project', 'greenfield_plan'],
    expectParsedName: null,
  },
  {
    name: 'clarify first never creates',
    text: 'I want to build something useful but I do not know where to start. Ask me clarifying questions first. Do not create any project.',
    expectNotReadFile: true,
    expectCreateBrief: false,
    expectWinnerNot: ['create_project', 'greenfield_plan'],
    expectParsedName: null,
  },
  {
    name: 'planning only never creates',
    text: 'Hey, I want to build something but I do not know where to start. Help me plan it. Do not create any project yet — just talk.',
    expectNotReadFile: true,
    expectCreateBrief: false,
    expectWinnerNot: ['create_project', 'greenfield_plan'],
    expectParsedName: null,
    expectNoPlanChips: true,
  },
  {
    name: '3D app conversational planning',
    text: "Hey, I'm building a 3D model app and want to know how I can get started.",
    expectNotReadFile: true,
    expectCreateBrief: false,
    expectWinnerNot: ['create_project'],
    expectNoPlanChips: true,
    expectConversationalPlan: true,
  },
  {
    name: 'stack question conversational',
    text: 'If I were to build a habit tracker, what type of code system should I use — React or plain HTML?',
    expectNotReadFile: true,
    expectCreateBrief: false,
    expectWinnerNot: ['create_project'],
    expectNoPlanChips: true,
    expectConversationalPlan: true,
  },
  {
    name: 'rich brief planning only still plans not scaffold',
    text: 'I am thinking of a team messaging app with channels and DMs. What should I build first? Still planning only — no scaffolding.',
    expectNotReadFile: true,
    expectCreateBrief: false,
    expectWinnerNot: ['create_project'],
    expectParsedName: null,
  },
];

let failed = 0;

for (const c of CASES) {
  const winner = winningChatRoute(c.text);
  const readFile = shouldRouteReadFile(c.text);
  const legacyRead = looksLikeReadFileAsk(c.text);
  const createBrief = isProjectCreateBrief(c.text);
  const beatsDisk = createBriefBeatsDiskRoutes(c.text);
  const parsed = parseNewProjectIntent(c.text) || parseGreenfieldIdea(c.text);

  if (c.expectNotReadFile && (readFile || legacyRead)) {
    console.error(`FAIL [${c.name}]: should NOT route to read_file`);
    failed += 1;
  }
  if (!c.expectNotReadFile && !readFile) {
    console.error(`FAIL [${c.name}]: should route to read_file`);
    failed += 1;
  }
  if (c.expectCreateBrief && !createBrief) {
    console.error(`FAIL [${c.name}]: should be project create brief`);
    failed += 1;
  }
  if (c.expectCreateBrief === false && createBrief) {
    console.error(`FAIL [${c.name}]: should NOT be project create brief`);
    failed += 1;
  }
  if (c.expectWinner && !c.expectWinner.includes(winner)) {
    console.error(`FAIL [${c.name}]: expected winner in ${c.expectWinner.join('|')}, got ${winner}`);
    failed += 1;
  }
  if (c.expectWinnerNot && c.expectWinnerNot.includes(winner)) {
    console.error(`FAIL [${c.name}]: winner must NOT be ${winner}`);
    failed += 1;
  }
  if (c.expectCreateBrief && !beatsDisk) {
    console.error(`FAIL [${c.name}]: create brief should beat disk routes`);
    failed += 1;
  }
  if (c.expectParsedName && parsed?.name !== c.expectParsedName) {
    console.error(`FAIL [${c.name}]: expected name ${c.expectParsedName}, got ${parsed?.name ?? 'null'}`);
    failed += 1;
  }
  if (c.expectParsedName === null && parsed) {
    console.error(`FAIL [${c.name}]: expected no project parse, got ${parsed.name}`);
    failed += 1;
  }
  if (c.expectPreferPlanFalse) {
    const intent = parseNewProjectIntent(c.text);
    if (!intent || intent.preferPlan) {
      console.error(`FAIL [${c.name}]: Create project chip must have preferPlan=false`);
      failed += 1;
    }
    const { looksLikeImplementGo } = await import('../src/lib/chatPlanMode.ts');
    if (!looksLikeImplementGo(c.text)) {
      console.error(`FAIL [${c.name}]: Create project chip must count as implement-go`);
      failed += 1;
    }
  }
  if (c.expectNoPlanChips || c.expectConversationalPlan) {
    const { looksLikeConversationalPlanningAsk, buildPlanningStarterReply, parseGreenfieldIdea, buildGreenfieldPlanReply } = await import('../src/lib/chatIdeaIntent.ts');
    if (c.expectConversationalPlan && !looksLikeConversationalPlanningAsk(c.text)) {
      console.error(`FAIL [${c.name}]: should look like conversational planning`);
      failed += 1;
    }
    const planText = buildPlanningStarterReply()
      + '\n'
      + (parseGreenfieldIdea(c.text) ? buildGreenfieldPlanReply(parseGreenfieldIdea(c.text)) : '');
    if (/<!--nova-prompt-chips:|^\s*Create project [A-Za-z]|Keep planning|Add more features to the plan/m.test(planText)) {
      console.error(`FAIL [${c.name}]: planning replies must not embed create/keep-planning chips`);
      failed += 1;
    }
  }
  if (c.name === '3D app conversational planning') {
    const { shouldInspectInChat } = await import('../src/lib/chatStudio.ts');
    const {
      isBarePlanningFollowUp,
      shouldInjectPlanningConversation,
    } = await import('../src/lib/chatIdeaIntent.ts');
    const follow = 'yes give me more details';
    // Bare “more details” is a normal follow-up, not a standalone planning ask.
    if (!isBarePlanningFollowUp(follow)) {
      console.error('FAIL [3D follow-up]: more details should classify as bare planning follow-up');
      failed += 1;
    }
    if (shouldInjectPlanningConversation(follow, { pendingIdea: false })) {
      console.error('FAIL [3D follow-up]: bare more details must not inject planning without a pending idea');
      failed += 1;
    }
    if (!shouldInjectPlanningConversation(follow, { pendingIdea: true })) {
      console.error('FAIL [3D follow-up]: bare more details must stay in planning when a brief is pending');
      failed += 1;
    }
    if (shouldInspectInChat(follow, false)) {
      console.error('FAIL [3D follow-up]: more details must NOT inspect with no attached files');
      failed += 1;
    }
  }
  if (c.expectImplementGo) {
    const { looksLikeImplementGo } = await import('../src/lib/chatPlanMode.ts');
    if (!looksLikeImplementGo(c.text)) {
      console.error(`FAIL [${c.name}]: must count as implement-go`);
      failed += 1;
    }
  }
  if (c.name === 'BrassGate festival landing') {
    const { detectProjectKind } = await import('../src/lib/projectKind.ts');
    const { looksLikeLandingBrief, buildLandingPageFiles } = await import('../src/lib/webLandingFromBrief.ts');
    const { buildScaffoldFiles } = await import('../src/lib/projectScaffolds.ts');
    const { looksLikeImplementGo } = await import('../src/lib/chatPlanMode.ts');
    const { resolveCreateIntentFromThread } = await import('../src/lib/createProjectIntent.ts');
    if (!looksLikeLandingBrief(c.text)) {
      console.error('FAIL [BrassGate]: should look like landing brief');
      failed += 1;
    }
    if (detectProjectKind(c.text) !== 'static-web') {
      console.error(`FAIL [BrassGate]: detectProjectKind should be static-web, got ${detectProjectKind(c.text)}`);
      failed += 1;
    }
    const files = buildScaffoldFiles('static-web', { name: 'BrassGate', summary: c.text });
    const html = files.find((f) => f.path === 'index.html')?.content || '';
    // Scaffolds are blank shells now — festival UI must come from the model, not a canned landing.
    if (/Lineup|Get Your Tickets|Miles Davis|photo-150178|Built with NOVA/i.test(html)) {
      console.error('FAIL [BrassGate]: scaffold must stay blank (no canned festival/landing template)');
      failed += 1;
    }
    if (!html.includes('id="app"') && !html.includes("id='app'")) {
      console.error('FAIL [BrassGate]: blank static scaffold should include #app');
      failed += 1;
    }
    if (!looksLikeImplementGo('lets build this')) {
      console.error('FAIL [BrassGate]: lets build this must be implement-go');
      failed += 1;
    }
    const go = resolveCreateIntentFromThread('lets build this', [c.text, 'lets build this'], {});
    if (!go || go.name !== 'Brassgate' || !/lineup|velvet|ticket/i.test(go.summary)) {
      console.error(`FAIL [BrassGate]: implement-go must recover Brassgate brief, got ${JSON.stringify(go)}`);
      failed += 1;
    }
    const landing = buildLandingPageFiles('BrassGate', c.text);
    if (landing.some((f) => /Lineup|unsplash|photo-/i.test(f.content))) {
      console.error('FAIL [BrassGate]: buildLandingPageFiles must not emit canned lineup/Unsplash');
      failed += 1;
    }
  }
  if (c.name === 'SignalDesk create brief') {
    const { detectProjectKind } = await import('../src/lib/projectKind.ts');
    if (detectProjectKind(c.text) !== 'vite-react') {
      console.error('FAIL [SignalDesk]: detectProjectKind should be vite-react');
      failed += 1;
    }
  }
  if (c.name === 'PlateHouse landing') {
    const { detectProjectKind } = await import('../src/lib/projectKind.ts');
    const { looksLikeLandingBrief, prefersReactAppScaffold, wantsChatAppScaffold } = await import('../src/lib/webLandingFromBrief.ts');
    const { parseGreenfieldIdea } = await import('../src/lib/chatIdeaIntent.ts');
    if (wantsChatAppScaffold(c.text)) {
      console.error('FAIL [PlateHouse]: must not classify as chat app scaffold');
      failed += 1;
    }
    if (prefersReactAppScaffold(c.text)) {
      console.error('FAIL [PlateHouse]: restaurant landing must not prefer React chat scaffold');
      failed += 1;
    }
    if (!looksLikeLandingBrief(c.text)) {
      console.error('FAIL [PlateHouse]: should look like landing brief');
      failed += 1;
    }
    if (detectProjectKind(c.text) !== 'static-web') {
      console.error(`FAIL [PlateHouse]: detectProjectKind should be static-web, got ${detectProjectKind(c.text)}`);
      failed += 1;
    }
    const idea = parseGreenfieldIdea(c.text);
    if (idea && /chat app|servers, channels/i.test(idea.problemLine)) {
      console.error(`FAIL [PlateHouse]: problemLine looks like chat: ${idea.problemLine}`);
      failed += 1;
    }
  }
  if (c.name === 'TaskRail kanban SPA') {
    const { detectProjectKind } = await import('../src/lib/projectKind.ts');
    const { looksLikeLandingBrief, prefersReactAppScaffold } = await import('../src/lib/webLandingFromBrief.ts');
    const { buildScaffoldFiles } = await import('../src/lib/projectScaffolds.ts');
    const { reactUiMicroAskEdits } = await import('../src/lib/webProjectCanon.ts');
    if (looksLikeLandingBrief(c.text)) {
      console.error('FAIL [TaskRail]: kanban must not look like landing brief');
      failed += 1;
    }
    if (!prefersReactAppScaffold(c.text)) {
      console.error('FAIL [TaskRail]: must prefer React scaffold');
      failed += 1;
    }
    if (detectProjectKind(c.text) !== 'vite-react') {
      console.error(`FAIL [TaskRail]: detectProjectKind should be vite-react, got ${detectProjectKind(c.text)}`);
      failed += 1;
    }
    const files = buildScaffoldFiles('vite-react', { name: 'TaskRail', summary: c.text });
    const app = files.find((f) => f.path === 'src/App.jsx')?.content || '';
    // Blank Vite shell only — product UI is model-written, not a canned kanban SPA.
    if (!/className=["']app["']/.test(app) || /kanban-shell|Backlog|draggable|localStorage/.test(app)) {
      console.error('FAIL [TaskRail]: scaffold App.jsx must be empty shell (no canned kanban)');
      failed += 1;
    }
    if (/Direct Messages|hero-inner|Built with NOVA/.test(app)) {
      console.error('FAIL [TaskRail]: App.jsx must not be discord or marketing landing');
      failed += 1;
    }
    const edits = reactUiMicroAskEdits({}, c.text, { projectName: 'TaskRail' });
    if (!edits.some((e) => /kanban-shell|Backlog/.test(e.content))) {
      console.error('FAIL [TaskRail]: reactUiMicroAskEdits must emit kanban');
      failed += 1;
    }
  }
  if (c.name === 'SaltPier restaurant landing') {
    const { detectProjectKind } = await import('../src/lib/projectKind.ts');
    const { looksLikeLandingBrief, prefersReactAppScaffold } = await import('../src/lib/webLandingFromBrief.ts');
    const { buildScaffoldFiles } = await import('../src/lib/projectScaffolds.ts');
    if (prefersReactAppScaffold(c.text)) {
      console.error('FAIL [SaltPier]: must not prefer React SPA scaffold');
      failed += 1;
    }
    if (!looksLikeLandingBrief(c.text)) {
      console.error('FAIL [SaltPier]: should look like landing brief');
      failed += 1;
    }
    if (detectProjectKind(c.text) !== 'static-web') {
      console.error(`FAIL [SaltPier]: detectProjectKind should be static-web, got ${detectProjectKind(c.text)}`);
      failed += 1;
    }
    const files = buildScaffoldFiles(detectProjectKind(c.text), { name: 'SaltPier', summary: c.text });
    const html = files.find((f) => f.path === 'index.html')?.content || '';
    const css = files.find((f) => f.path === 'css/styles.css')?.content || '';
    // Blank static shell only — no restaurant Unsplash / Book CTA template.
    if (/href="#menu"|href="#reserve"|unsplash|photo-150178|Book a table/i.test(html)) {
      console.error('FAIL [SaltPier]: scaffold must not include canned restaurant CTAs/Unsplash');
      failed += 1;
    }
    if (!html.includes('id="app"') && !/<div id="app">/.test(html)) {
      console.error('FAIL [SaltPier]: blank static scaffold should include #app');
      failed += 1;
    }
    if (/id="root"|src\/main\.jsx/.test(html)) {
      console.error('FAIL [SaltPier]: must not scaffold empty Vite shell for restaurant brief');
      failed += 1;
    }
    if (/photo-|unsplash/i.test(css)) {
      console.error('FAIL [SaltPier]: css must not embed stock photo URLs');
      failed += 1;
    }
  }
}

if (failed) {
  console.error(`\n${failed} chat route test(s) failed`);
  process.exit(1);
}

console.log(`OK: ${CASES.length} chat route golden cases passed`);
