/**
 * Ask-fidelity families: classify → edit, surgical non-empty, no false icon:*, rewords.
 * Run: npx tsx --tsconfig tsconfig.app.json scripts/smoke-ask-families.mjs
 */
import assert from 'node:assert/strict';
import { classifyTurn } from '@/lib/classifyTurn';
import { planUiAsk, verifyUiAskPlan, isMicroFidelityPlan } from '@/lib/uiAskPlan';
import {
  finalizeWebEdits,
  isUiShellAsk,
  verifyMicroAskApplied,
} from '@/lib/webProjectCanon';
import { isBrokenReactAppSource } from '@/lib/freshSpaFromBrief';
import { resolveConversationalEditAsk, rememberLastEditTopic } from '@/lib/editAskResolve';
import { classifyDiskIntent } from '@/lib/chatDiskIntent';
import { looksLikeCodeEditAsk } from '@/lib/chatAgentTurn';

const DISK = 'C:/Users/thoma/Documents/NOVA projects/AskFidelitySmoke';

const blank = {
  'src/App.jsx': `import './App.css'\nexport default function App() {\n  return <div className="app"><h1 className="title">Hello</h1><button type="button">Click me</button></div>\n}\n`,
  'src/App.css': `.app { min-height: 100vh; background: #ffffff; color: #111; }\nbutton { background: #2563eb; color: #fff; }\n`,
  'src/index.css': `html, body, #root { margin: 0; min-height: 100%; }\n`,
  'index.html': `<!doctype html><html><body><div id="root"></div></body></html>\n`,
};

/** @type {{ family: string, asks: string[], expectSurgical?: boolean, expectEdit?: boolean, forbidIcons?: boolean, forbidSolidBgOp?: boolean }[]} */
const FAMILIES = [
  {
    family: 'solid-bg',
    expectEdit: true,
    expectSurgical: true,
    asks: [
      'Change the background color to light blue.',
      'Please set the page background to cream.',
      'Can you make the background purple?',
      'Change the background color to teal.',
    ],
  },
  {
    family: 'words-place-move',
    expectEdit: true,
    expectSurgical: true,
    asks: [
      'Show the word Hello on the screen.',
      'Put Hello on the left and Goodbye on the right.',
      'Move Hello to the top-left corner.',
      'Stack three short sentences vertically with space between them.',
      'Put a title at the top and a short paragraph under it.',
    ],
  },
  {
    family: 'icons-click',
    expectEdit: true,
    expectSurgical: true,
    asks: [
      'Add a settings gear icon in the top-right corner.',
      'Please put a home icon top left.',
      'Can you add a search icon next to a Search label?',
    ],
  },
  {
    family: 'buttons',
    expectEdit: true,
    expectSurgical: true,
    forbidSolidBgOp: true,
    asks: [
      'Change all buttons to green.',
      'Please make the buttons green.',
      'Can you turn every button green?',
      'Change all buttons to orange.',
    ],
  },
  {
    family: 'forms',
    expectEdit: true,
    expectSurgical: true,
    forbidIcons: true,
    asks: [
      'Add a text input with the placeholder Type here.',
      'Add an email input and a password input.',
      'Disable Submit until all required fields are filled.',
    ],
  },
  {
    family: 'nav-sidebar-modal',
    expectEdit: true,
    expectSurgical: true,
    forbidIcons: true,
    asks: [
      'Add a top navigation bar with Home, Products, and Contact.',
      'Make the sidebar collapse and expand with a button.',
      'Add a modal that opens when I click Open dialog.',
    ],
  },
  {
    family: 'cards-gallery',
    expectEdit: true,
    expectSurgical: true,
    forbidIcons: true,
    asks: [
      'Show three cards in a row with a title and short text each.',
      'Make a 2-by-2 card grid.',
      'Add an image gallery with a large preview and thumbnails.',
    ],
  },
  {
    family: 'title-contact-hide',
    expectEdit: true,
    expectSurgical: true,
    forbidIcons: true,
    asks: [
      'Make the title red and larger.',
      'Delete the Contact link from the nav.',
      'Hide the sidebar but keep the main content.',
    ],
  },
  {
    family: 'undo-redo',
    expectEdit: true,
    expectSurgical: false,
    asks: [
      'Undo the last change.',
      'Please undo my last change.',
      'Redo the last undone change.',
    ],
  },
  {
    family: 'sections-responsive',
    expectEdit: true,
    expectSurgical: true,
    forbidIcons: true,
    asks: [
      'Build a page with Hero, Features, and Footer sections.',
      'Make the nav turn into a hamburger menu on mobile.',
      'Add a pricing section with three plans under Features.',
    ],
  },
  {
    family: 'counter-dark-todo',
    expectEdit: true,
    expectSurgical: true,
    forbidIcons: true,
    asks: [
      'Add a counter that starts at 0 and increases when I click Plus.',
      'Add a dark mode toggle that stays on after I click around the page.',
      'Build a todo app with add, complete, and delete.',
    ],
  },
  {
    family: 'nest-profile-toast',
    expectEdit: true,
    expectSurgical: true,
    forbidIcons: true,
    asks: [
      'Nest a card inside a section inside a page layout.',
      'Add a profile card that contains an avatar, name, and action buttons.',
      'Add toast notifications that appear after Submit.',
    ],
  },
  {
    family: 'search-table-sticky',
    expectEdit: true,
    expectSurgical: true,
    forbidIcons: true,
    asks: [
      'Add a search box that filters the card list as I type.',
      'Add a data table with Name, Role, and Status columns.',
      'Add a sticky header that stays at the top while scrolling.',
    ],
  },
  {
    family: 'login-dash-settings-upload',
    expectEdit: true,
    expectSurgical: true,
    forbidIcons: true,
    asks: [
      'Build a login page with email, password, and Sign in.',
      'After Sign in, go to a dashboard view.',
      'Add a settings page with toggles for notifications and dark mode.',
      'Add a file upload drop zone that shows the file name after drop.',
    ],
  },
  {
    family: 'carousel-breadcrumbs-multistep',
    expectEdit: true,
    expectSurgical: true,
    forbidIcons: true,
    asks: [
      'Add a carousel with previous and next arrows.',
      'Add breadcrumbs: Home / Products / Details.',
      'Add a multi-step form: Account, Profile, Confirm.',
    ],
  },
  {
    family: 'dnd-kanban-chat-palette',
    expectEdit: true,
    expectSurgical: true,
    forbidIcons: true,
    asks: [
      'Add drag-and-drop reordering for a list of items.',
      'Build a kanban board with To do, Doing, and Done columns.',
      'Add a chat-style message list with an input at the bottom.',
      'Add a command palette opened with a Search button that filters actions.',
      'Add infinite scroll that loads more cards when I reach the bottom.',
      'Add skeleton placeholders while content is loading.',
    ],
  },
  {
    family: 'thumbnail-click',
    expectEdit: true,
    expectSurgical: true,
    forbidIcons: true,
    asks: [
      'Clicking a thumbnail changes the large preview.',
      'Please make clicking a thumbnail update the large preview.',
    ],
  },
  {
    family: 'landing-saas-twitter',
    expectEdit: true,
    expectSurgical: true,
    forbidIcons: true,
    asks: [
      'Build a full landing page: hero, logos, features, testimonials, pricing, FAQ, footer.',
      'Please build a SaaS app shell with auth screen, dashboard, settings, and billing page linked by nav.',
      'From a blank screen, build a mini Twitter clone with feed, compose box, likes, and profile tab in one go.',
      'Make the whole app feel polished: consistent spacing, hover states, focus rings, and smooth transitions everywhere.',
      'Rebuild the same app with a completely different visual style from one prompt.',
    ],
  },
];

let failures = 0;

for (const fam of FAMILIES) {
  for (const ask of fam.asks) {
    const label = `${fam.family}: ${ask.slice(0, 72)}`;
    try {
      assert.equal(isUiShellAsk(ask), true, `${label} — isUiShellAsk`);

      if (fam.expectEdit !== false) {
        const c = classifyTurn(ask, { diskRoot: DISK });
        assert.equal(c.kind, 'edit', `${label} — classify ${c.kind}/${c.reason}`);
      }

      if (fam.forbidSolidBgOp) {
        const plan = planUiAsk(ask);
        assert.ok(!plan.ops.some((o) => o.kind === 'solid-bg'), `${label} — stolen solid-bg`);
      }

      if (fam.expectSurgical !== false) {
        const edits = finalizeWebEdits(blank, ask, [], { projectName: 'Smoke' });
        assert.ok(edits.length > 0, `${label} — empty surgical`);
        const next = { ...blank };
        for (const e of edits) next[e.path] = e.content;
        const app = next['src/App.jsx'] || next['src/App.tsx'] || '';
        assert.equal(isBrokenReactAppSource(app), false, `${label} — App flagged broken`);
        const blob = Object.values(next).join('\n');
        if (fam.forbidIcons) {
          const v = verifyMicroAskApplied(ask, next);
          const iconMiss = (v.missing || []).filter((m) => /^icon:/i.test(m) || m === 'icon-rail');
          assert.equal(iconMiss.length, 0, `${label} — false icons ${iconMiss.join(',')}`);
          assert.ok(!/\/icons\/(?:search|settings|trash|bell|grid)\.svg/i.test(blob) || /\bicons?\b/i.test(ask), `${label} — unexpected icon path`);
        }
      }
    } catch (err) {
      failures += 1;
      console.error(`FAIL ${label}\n  ${err.message}`);
    }
  }
}

// Keep original dual/pizza fidelity checks green too
{
  const ask = 'Change the background to brown and put the words I LIKE PIZZA in the top left';
  const edits = finalizeWebEdits(blank, ask, [], { projectName: 'Smoke' });
  assert.ok(edits.length, 'pizza multi-op surgical');
}

// Regression locks from reworded HARD_FAILs (#10 stack, #26 input, #45 teal, #46 sticky buttons)
{
  const stack = 'Stack three short sentences vertically with space between them.';
  const stackEdits = finalizeWebEdits(blank, stack, [], { projectName: 'Smoke' });
  const stackApp = stackEdits.find((e) => /App\.jsx/.test(e.path))?.content || '';
  assert.ok(/sentence-stack/.test(stackApp), 'reg #10 sentence-stack');
  assert.equal(isBrokenReactAppSource(stackApp), false, 'reg #10 not broken');

  const inputAsk = 'Add a text input with the placeholder Type here.';
  const inputPlan = planUiAsk(inputAsk);
  assert.equal(isMicroFidelityPlan(inputPlan), false, 'reg #26 no micro place-word steal');
  assert.ok(!inputPlan.ops.some((o) => o.kind === 'place-word'), 'reg #26 no place-word op');

  const tealAsk = 'Change the background color to teal.';
  const tealPlan = planUiAsk(tealAsk);
  assert.ok(tealPlan.ops.some((o) => o.kind === 'solid-bg' && o.hex === '#0f766e'), 'reg #45 teal hex');
  const tealFiles = { ...blank };
  for (const e of finalizeWebEdits(blank, tealAsk, [], { projectName: 'Smoke' })) {
    tealFiles[e.path] = e.content;
  }
  const tealCheck = verifyUiAskPlan(tealPlan, tealFiles);
  assert.equal(tealCheck.ok, true, `reg #45 teal verify ${tealCheck.missing.join(';')}`);

  const chatId = 'smoke-sticky-bg-buttons';
  rememberLastEditTopic({
    chatId,
    kind: 'background',
    ask: 'Change the background color to teal.',
    value: 'teal',
    priorValue: 'white',
    at: Date.now(),
  });
  const resolved = resolveConversationalEditAsk({
    message: 'Change all buttons to orange.',
    chatId,
    workspaceBound: true,
    messages: [],
  });
  assert.ok(!/background color to orange/i.test(resolved.content), `reg #46 sticky steal → ${resolved.content}`);
  assert.match(resolved.content, /buttons?/i, 'reg #46 keeps buttons ask');

  // #82 upload drop zone must stay a UI edit — never disk create Home.txt
  const uploadAsk = 'Add a file upload drop zone that shows the file name after drop.';
  assert.equal(classifyDiskIntent(uploadAsk).type, 'none', 'reg #82 upload not add_file');
  assert.equal(looksLikeCodeEditAsk(uploadAsk), true, 'reg #82 upload is code edit');
  assert.equal(isUiShellAsk(uploadAsk), true, 'reg #82 upload is ui shell');
  const uploadEdits = finalizeWebEdits(blank, uploadAsk, [], { projectName: 'Smoke' });
  const uploadApp = uploadEdits.find((e) => /App\.jsx/.test(e.path))?.content || '';
  assert.ok(/drop|onDrop|type=["']file["']/i.test(uploadApp), 'reg #82 upload shell');

  // Teal after cards/hero/thumbnail chain (live first-try shape)
  let chain = { ...blank };
  for (const step of [
    'Show three cards in a row with a title and short text each.',
    'Make a 2-by-2 card grid.',
    'Add an image in the hero area.',
    'Place a small thumbnail next to each card title.',
  ]) {
    for (const e of finalizeWebEdits(chain, step, [], { projectName: 'Smoke' })) {
      chain[e.path] = e.content;
    }
  }
  for (const e of finalizeWebEdits(chain, tealAsk, [], { projectName: 'Smoke' })) {
    chain[e.path] = e.content;
  }
  assert.equal(verifyUiAskPlan(tealPlan, chain).ok, true, 'reg #45 teal after cards chain');
  assert.ok(!/;\s*fff\s*;/i.test(chain['src/App.css'] || ''), 'reg #45 no orphan hex tail');
}

// Velvet Hour vibe create — must classify create unbound + bound (do not edit + footer/hero/cards).
{
  const velvetAsk = [
    'Create a new website project called Velvet Hour on disk now.',
    'Brand-new project — do not edit any open folder.',
    'Late-dusk cocktail lounge / listening room vibe page (not SaaS, not dashboard, not auth shell).',
    'Deep plum-black canvas, warm amber accent, soft atmosphere.',
    'Full-bleed hero: brand name "Velvet Hour" large, line "Stay for the last song.", button "Reserve a seat".',
    'Tonight strip with three cards: Vinyl Hour, Low Lights, Quiet Corner — title + one line each.',
    'Footer with hours Tue–Sun 6pm–2am and an email field.',
    'Skip Plan — scaffold Vite React on disk and finish the page.',
  ].join(' ');

  const unbound = classifyTurn(velvetAsk, {});
  assert.equal(unbound.kind, 'create', `velvet unbound classify ${unbound.kind}/${unbound.reason}`);

  const bound = classifyTurn(velvetAsk, { diskRoot: DISK });
  assert.equal(bound.kind, 'create', `velvet bound classify ${bound.kind}/${bound.reason}`);

  // Brand-new lounge creates invent — no canned vibe twin paste.
  const loungeCreateAsk = [
    'Create a new website project called Velvet Hour zx9 on disk now.',
    'Brand-new project — do not edit any open folder.',
    'Late-dusk cocktail lounge / listening room vibe page (not SaaS, not dashboard, not auth shell).',
    'Full-bleed hero: brand name "Velvet Hour zx9" large, line "Stay for the last song.", button "Reserve a seat".',
  ].join(' ');
  const loungeCreateEdits = finalizeWebEdits(blank, loungeCreateAsk, [], { projectName: 'Velvet Hour' });
  const loungeCreateApp = loungeCreateEdits.find((e) => /App\.(jsx|tsx)$/i.test(e.path))?.content || '';
  assert.ok(!/className=["'][^"']*\bapp\s+vibe\b/i.test(loungeCreateApp), 'brand-new create no lounge twin paste');

  // Lounge surgical shell — rebuild/edit only; brand/CTA/cards, not SaaS twin.
  const loungeAsk = [
    'Rebuild Velvet Hour as a late-dusk cocktail lounge / listening room vibe page (not SaaS, not dashboard, not auth shell).',
    'Full-bleed hero: brand name "Velvet Hour" large, line "Stay for the last song.", button "Reserve a seat".',
    'Tonight strip with three cards: Vinyl Hour, Low Lights, Quiet Corner.',
    'Footer with hours Tue–Sun 6pm–2am and an email field.',
  ].join(' ');
  const loungeEdits = finalizeWebEdits(blank, loungeAsk, [], { projectName: 'Velvet Hour' });
  assert.ok(loungeEdits.length > 0, 'velvet lounge surgical non-empty');
  const loungeNext = { ...blank };
  for (const e of loungeEdits) loungeNext[e.path] = e.content;
  const loungeApp = loungeNext['src/App.jsx'] || loungeNext['src/App.tsx'] || '';
  const loungeCss = loungeNext['src/App.css'] || '';
  const loungeBlob = Object.values(loungeNext).join('\n');
  assert.ok(/Velvet Hour/i.test(loungeApp), 'velvet lounge brand');
  assert.ok(!/["“]Velvet Hour[^"”]*["”]\s*large/i.test(loungeApp), 'velvet lounge no quoted brand+large in H1');
  assert.ok(!/>\s*["“]Velvet Hour/i.test(loungeApp), 'velvet lounge H1 not quote-wrapped');
  assert.ok(/Stay for the last song/i.test(loungeApp), 'velvet lounge tag line');
  assert.ok(/Reserve a seat/i.test(loungeBlob), 'velvet lounge CTA');
  assert.ok(/Vinyl Hour/i.test(loungeBlob), 'velvet lounge Vinyl Hour card');
  assert.ok(/Low Lights/i.test(loungeBlob), 'velvet lounge Low Lights card');
  assert.ok(/Quiet Corner/i.test(loungeBlob), 'velvet lounge Quiet Corner card');
  assert.ok(!/\bBilling\b/i.test(loungeBlob), 'velvet lounge not Billing SaaS');
  assert.ok(!/\bDashboard\b/i.test(loungeBlob), 'velvet lounge not Dashboard SaaS');
  assert.ok(!/\bSign in\b/i.test(loungeBlob), 'velvet lounge not auth Sign in');
  assert.ok(!/\.hero\s*\{[^}]*min-height:\s*78vh/i.test(loungeCss), 'velvet lounge hero not 78vh gap');
}

// Thin depth idle guards — quiet abort must fire so create can finishPlainReply.
{
  const { makeThinDepthStreamGuards, THIN_DEPTH_IDLE_MS, THIN_DEPTH_FIRST_TOKEN_MS } = await import('@/lib/createThinPath');
  assert.ok(THIN_DEPTH_IDLE_MS >= 45_000, 'thin depth idle wall present');
  assert.ok(THIN_DEPTH_FIRST_TOKEN_MS >= 30_000, 'thin depth first-token wall present');
  const g = makeThinDepthStreamGuards(() => false);
  assert.equal(typeof g.wasQuietAbort, 'function', 'wasQuietAbort exported');
  assert.equal(g.wasQuietAbort(), false, 'quiet abort starts false');
  g.onDelta('xx');
  assert.equal(g.shouldAbort(), false, 'recent tokens not idle');
}

if (failures) {
  console.error(`\nsmoke-ask-families: ${failures} failure(s)`);
  process.exit(1);
}
console.log(`OK smoke-ask-families (${FAMILIES.reduce((n, f) => n + f.asks.length, 0)} asks + regressions + velvet vibe)`);
