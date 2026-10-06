/**
 * Answer Contract spine smokes — routing must match the frozen product rules.
 * Run: node --experimental-strip-types scripts/smoke-answer-contract.mjs
 */
import { resolveAnswerContract, contractBlocksPlugins } from '../src/lib/answerContract.ts';
import { verifyAnswerReply } from '../src/lib/answerVerify.ts';
import {
  looksLikeWebGroundedAsk,
  looksLikeBareExpandAsk,
  looksLikeThreadFollowUpAsk,
  buildContextualWebQuery,
  repairReplySourceLinks,
  scrubUnverifiedMarkdownLinks,
} from '../src/lib/webSearch.ts';
import {
  looksLikeShoppingOrPartsLinksAsk,
  looksLikeRunawayTokenGarbage,
  scrubPlanExitBleed,
  cutBeforeTokenGarbage,
  looksLikeHowToGuideAsk,
  looksLikeThinHowToOutline,
  scrubMarkdownHashHeadings,
  looksLikeBuildToolingAsk,
  linkLabelMatchesUrl,
  shopSearchUrlForLabel,
} from '../src/lib/replySanity.ts';
import { looksLikeRequirementsAsk } from '../src/lib/chatIdeaIntent.ts';
import { looksLikeBoundProjectAsk, looksLikeProjectOverviewAsk, looksLikeProjectDebugAsk } from '../src/lib/chatProjectDebug.ts';
import { pluginIntentMatches, detectPluginIntent } from '../src/lib/plugins.ts';
import { wantsGithubCatalog } from '../src/lib/chatStudio.ts';
import { pluginMentionsText } from '../src/lib/catalogPlugins.ts';
import { looksLikePlanDiscoveryAsk } from '../src/lib/planReport.ts';

let failed = 0;
function check(name, cond) {
  if (!cond) {
    failed += 1;
    console.error('FAIL', name);
  } else {
    console.log('ok', name);
  }
}

// --- Bound project overview: disk, no web, no plugins ---
for (const ask of [
  'Can you give me more information about this project',
  'Give me a full report on this project',
  'can you tell me what this project is about',
]) {
  const c = resolveAnswerContract({ message: ask, hasBoundFiles: true });
  check(`${ask} → disk`, c.grounding === 'disk' && c.useStudioDisk && !c.allowWeb);
  check(`${ask} → blocks plugins`, contractBlocksPlugins(c));
  check(`${ask} → overview not debug`, looksLikeProjectOverviewAsk(ask) && !looksLikeProjectDebugAsk(ask));
  check(`${ask} → not web`, !looksLikeWebGroundedAsk(ask));
  check(`${ask} → no github catalog`, !wantsGithubCatalog(ask));
  check(`${ask} → no github plugin`, !pluginIntentMatches('github', ask));
  check(`${ask} → detectPlugin null`, detectPluginIntent(ask, ['github']) === null);
}

// --- Debug stays diagnose ---
{
  const ask = "I'm having a problem switching between Settings and Profile";
  const c = resolveAnswerContract({ message: ask, hasBoundFiles: true });
  check('bug ask → diagnose', c.job === 'diagnose' && c.grounding === 'disk');
  check('bug ask → debug gate', looksLikeProjectDebugAsk(ask) && !looksLikeProjectOverviewAsk(ask));
}

// --- Open-world web ---
{
  const ask = 'tell me more about Elon Musk';
  const c = resolveAnswerContract({ message: ask, hasBoundFiles: true });
  check('Elon → web', c.allowWeb && c.grounding === 'web');
  check('Elon → web gate', looksLikeWebGroundedAsk(ask) && !looksLikeBoundProjectAsk(ask));
}

// --- Companion book chat (no research hijack) ---
{
  const ask = "Let's talk about City of Ashes — what did you think of the plot?";
  const c = resolveAnswerContract({ message: ask, hasBoundFiles: false });
  check('book chat → companion', c.stance === 'companion' && !c.allowWeb);
  check('book chat → not web', !looksLikeWebGroundedAsk(ask));
}
{
  const ask = "Let's talk about The Name of the Wind by Patrick Rothfuss — what makes Kvothe's storytelling style interesting? Stay on this book; no shopping links.";
  const c = resolveAnswerContract({ message: ask, hasBoundFiles: false });
  check('name-of-wind → companion no web', c.stance === 'companion' && !c.allowWeb && c.reason.includes('companion'));
}
{
  const ask = 'How should a solo founder validate a niche SaaS idea in 30 days with almost no budget? Give a concrete week-by-week plan.';
  const c = resolveAnswerContract({ message: ask, hasBoundFiles: false });
  check('saas validate → not plan_talk', c.job !== 'plan_talk');
}

// --- Explicit GitHub still works ---
{
  const ask = 'Using GitHub, list my repositories.';
  check('explicit github → plugin match', pluginIntentMatches('github', ask));
  check('explicit github → detect', detectPluginIntent(ask, ['github']) === 'github');
}

// --- repos? must not match “report” ---
check('mention report ≠ github', !pluginMentionsText('github', 'give me a full report on this project'));

// --- Verify rejects invented book links on disk contract ---
{
  const c = resolveAnswerContract({
    message: 'more information about this project',
    hasBoundFiles: true,
  });
  const bad = verifyAnswerReply(
    c,
    'more information about this project',
    '## Links:\n- [City of Ashes](https://example.com/a)\n- [American Film](https://example.com/b)\n- [Big Books](https://example.com/c)',
  );
  check('verify rejects link dump', !bad.ok);
  const good = verifyAnswerReply(
    c,
    'more information about this project',
    'This folder is a Vite React demo for clinic testing. Main areas are Chat and Settings.',
  );
  check('verify accepts disk overview', good.ok);
}

// --- Bare “more info” after a how-it-works ask: expand thread, no phrase web search ---
{
  const prior = [
    {
      role: 'user',
      content: 'Explain how a mechanical keyboard works. switches, matrix scanning, and debounce. in clear detail for a curious beginner.',
    },
    {
      role: 'assistant',
      content: 'Sure — switches close a circuit, the controller scans a matrix, debounce filters bounce…',
    },
  ];
  for (const ask of ['Can you give me more information', 'Gave me more info', 'tell me more', 'more info']) {
    check(`${ask} → bare expand`, looksLikeBareExpandAsk(ask));
    check(`${ask} → follow-up`, looksLikeThreadFollowUpAsk(ask));
    check(`${ask} → not web gate`, !looksLikeWebGroundedAsk(ask));
    const c = resolveAnswerContract({ message: ask, hasBoundFiles: false, priorHistory: prior });
    check(
      `${ask} → thread companion`,
      c.grounding === 'thread' && c.stance === 'companion' && !c.allowWeb && c.reason.includes('followup'),
    );
    const q = buildContextualWebQuery(ask, prior);
    check(`${ask} → query keeps keyboard`, /keyboard/i.test(q) && !/^more\s+info/i.test(q));
  }
  const bleed = verifyAnswerReply(
    resolveAnswerContract({ message: 'Can you give me more information', hasBoundFiles: false, priorHistory: prior }),
    'Can you give me more information',
    'For more depth see [Open Library](https://openlibrary.org/search?q=information) and [7 Polite Ways](https://broadlearners.com/t/7-polite-ways-to-request-more-information-professionally/3187).',
  );
  check('verify rejects phrase-search bleed', !bleed.ok);
}

// --- Bare expand after a real research ask still allows web, but query uses prior topic ---
{
  const prior = [
    { role: 'user', content: 'tell me more about Elon Musk' },
    { role: 'assistant', content: 'Elon Musk is…' },
  ];
  const ask = 'Can you give me more information';
  const c = resolveAnswerContract({ message: ask, hasBoundFiles: false, priorHistory: prior });
  check('Elon follow-up → web expand', c.allowWeb && c.grounding === 'web');
  const q = buildContextualWebQuery(ask, prior);
  check('Elon follow-up → query has Elon', /elon/i.test(q));
}

// --- Shopping / buy-parts links: web research, never product-plan bleed ---
{
  const ask = 'can you give me some links to where i can buy the parts to build the keyboard';
  check('shopping → bare shopping ask', looksLikeShoppingOrPartsLinksAsk(ask));
  const c = resolveAnswerContract({ message: ask, hasBoundFiles: false });
  check('shopping → web research', c.allowWeb && c.grounding === 'web' && c.job === 'research');
  check('shopping → not plan_talk', c.job !== 'plan_talk');
  const bleed = verifyAnswerReply(
    c,
    ask,
    '1. Key Switches - [Mechanical Key Overall: keep the first version tiny. one core screen and one must-have action. Nail that before extras. Who is the main user, and what is the one action that has to work first?',
  );
  check('shopping → reject plan-exit bleed', !bleed.ok);
  const scrubbed = scrubPlanExitBleed(bleed.honestGap || '');
  check('shopping → scrub removes Overall', !/Overall:\s*keep/i.test(scrubbed));
  const garbage = 'Certainly! Here are links: 0180%2Cfff80181%2Cfff80182%2Cfff80183%2Cfff80184%2Cfff80185%2Cfff80186%2Cfff80187%2Cfff80188%2Cfff80189%2Cfff8018a%2Cfff8018b%2Cfff8018c%2Cfff8018d%2Cfff8018e%2Cfff8018f%2Cfff80190%2Cfff80191%2Cfff80192%2Cfff80193%2Cfff80194%2Cfff80195%2Cfff80196%2Cfff80197%2Cfff80198%2Cfff80199%2Cfff8019a%2Cfff8019b';
  check('shopping → detect runaway garbage', looksLikeRunawayTokenGarbage(garbage));
  const cut = cutBeforeTokenGarbage(garbage);
  check('shopping → cut keeps prose head', /Certainly/i.test(cut) && !/%2Cfff/i.test(cut));
  const gVerify = verifyAnswerReply(c, ask, garbage);
  check('shopping → verify rejects garbage', !gVerify.ok && gVerify.reason === 'runaway-garbage');
}

// --- Same shopping pattern for non-keyboard (general) ---
{
  const ask = 'give me some links where I can buy parts to build a gaming PC';
  const c = resolveAnswerContract({ message: ask, hasBoundFiles: false });
  check('pc parts → web not plan', c.allowWeb && c.job !== 'plan_talk');
}

// --- Shopping links must survive finalize scrub (not retract streamed buy URLs) ---
{
  const withLinks = [
    '## Links to Purchase Parts',
    '',
    '- **Raspberry Pi Zero W:** [Pi Zero](https://www.amazon.com/s?k=Raspberry+Pi+Zero+W)',
    '- **USB Webcams:** [Webcam](https://www.amazon.com/s?k=USB+webcam)',
    '- **Arduino Uno:** [Arduino](https://www.digikey.com/en/products?keywords=arduino+uno)',
  ].join('\n');
  const strict = scrubUnverifiedMarkdownLinks(withLinks, []);
  check('strict scrub without sources drops shop links', !/amazon\.com/i.test(strict));
  const kept = scrubUnverifiedMarkdownLinks(withLinks, [], { allowShopHosts: true, maxLinks: 8 });
  check('shop mode keeps amazon/digikey links', /amazon\.com/i.test(kept) && /digikey\.com/i.test(kept));
  const repaired = repairReplySourceLinks(
    '## Links\n- Raspberry Pi Zero W:\n- USB Webcams:\n- Arduino Uno:',
    [],
    { allowShopHosts: true },
  );
  check('empty part bullets get filled', /amazon\.com\/s\?k=/i.test(repaired) && /Raspberry Pi Zero W/i.test(repaired));
  check('filled bullets are real markdown links', /\[[^\]]+\]\(https:\/\/www\.amazon\.com/i.test(repaired));
}

// --- How-to / DIY build guides: depth + web, never thin software plan_talk ---
{
  const ask = "hey do me a favor, I'm trying to build a camera for like a web camera. I need to know exactly how to build one of those";
  check('howto → guide ask', looksLikeHowToGuideAsk(ask));
  check('howto → not requirements plan', !looksLikeRequirementsAsk(ask));
  const c = resolveAnswerContract({ message: ask, hasBoundFiles: false });
  check('howto → web depth', c.allowWeb && c.grounding === 'web' && c.reason === 'howto-guide');
  check('howto → not plan_talk', c.job !== 'plan_talk');
  const thin = [
    'Sure! Building a webcam:',
    '1. Hardware Components - Camera Module',
    '2. Software Setup - Microcontroller Code',
    '3. Integration - Connecting Components',
    '4. Testing and Debugging',
    '',
    'Would you like to start with the hardware setup or the software development?',
  ].join('\n');
  check('howto → thin outline detected', looksLikeThinHowToOutline(thin, ask));
  const thinV = verifyAnswerReply(c, ask, thin);
  check('howto → verify rejects thin outline', !thinV.ok && thinV.reason === 'thin-howto-outline');
}

// --- No #### / ATX hashtags in chat replies ---
{
  const hashed = [
    'To build a webcam:',
    '#### Option 1: Easier Prototype',
    '1. Sensor',
    '2. Microcontroller',
    'A simple enclosure. - #### Rough Price Bands - Sensor (OV5647): $10 - #### Signal Flow',
    '- ### Option 2: Advanced',
  ].join('\n');
  const clean = scrubMarkdownHashHeadings(hashed);
  check('hash scrub → no #### left', !/#{1,}/.test(clean));
  check('hash scrub → keeps titles as bold', /\*\*Option 1/i.test(clean) || /\*\*Rough Price/i.test(clean) || /Option 1/i.test(clean));
  check('hash scrub → keeps part names', /OV5647/i.test(clean));

  // Wrong product page → rewrite to label search
  const wrongAdafruit = '- **OV5647 Sensor:** [Adafruit OV5647 Camera Module](https://www.adafruit.com/product/1234)';
  const fixed = scrubUnverifiedMarkdownLinks(wrongAdafruit, [], { allowShopHosts: true, maxLinks: 8 });
  check('wrong adafruit → not product/1234', !/adafruit\.com\/product\/1234/i.test(fixed));
  check('wrong adafruit → search embeds label', /amazon\.com\/s\?k=/i.test(fixed) && /OV5647|Camera/i.test(decodeURIComponent(fixed)));
  check('label match → OV5647 in search url', linkLabelMatchesUrl('Adafruit OV5647 Camera Module', 'https://www.amazon.com/s?k=Adafruit+OV5647+Camera+Module'));
  check('label mismatch → random product', !linkLabelMatchesUrl('Adafruit OV5647 Camera Module', 'https://www.adafruit.com/product/9999'));
  check('shopSearchUrl embeds label', /OV5647/i.test(shopSearchUrlForLabel('Adafruit OV5647 Camera Module')));

  // Tooling ask must not be Plan / plan_talk
  const tooling = 'Can you tell me what program I can use to build this? Do I need like Python or VS Code? How do I actually build this out';
  check('tooling → build tooling ask', looksLikeBuildToolingAsk(tooling));
  check('tooling → howto (actually build)', looksLikeHowToGuideAsk(tooling));
  const tc = resolveAnswerContract({ message: tooling, hasBoundFiles: false });
  check('tooling → not plan_talk', tc.job !== 'plan_talk');
  check('tooling → not requirements', !looksLikeRequirementsAsk(tooling));
  check('tooling → no plan discovery nudge', !looksLikePlanDiscoveryAsk(tooling));
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nok answer-contract');
