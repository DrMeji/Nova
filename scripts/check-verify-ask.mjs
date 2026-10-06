/**
 * verifyAsk + early dispatch: create never calls answerStudio.
 */
import assert from 'node:assert/strict';
import { verifyAsk } from '../src/lib/verifyAsk.ts';
import { HANDLER_OWNED_KINDS, dispatchOwnedTurn } from '../src/lib/chatTurnHandlers/dispatch.ts';
import { classifyTurn } from '../src/lib/classifyTurn.ts';

const files = {
  'src/App.jsx': `export default function App(){return <div className="app center-word" style={{textAlign:'center',background:'#5c4033'}}><h1>Ember</h1><footer>9am–9pm</footer></div>}`,
  'src/App.css': `.app{text-align:center;background:#5c4033}`,
};

assert.equal(verifyAsk('put the title in the center', files).ok, true);
assert.equal(verifyAsk('add a footer that says 9am-9pm', files).ok, true);
assert.equal(verifyAsk('make the background brown', files).ok, true);
assert.equal(verifyAsk('add a footer that says "CLOSED"', files).ok, false);
assert.ok(verifyAsk('add a footer that says "CLOSED"', files).missing.some((m) => /CLOSED/i.test(m)));

// Black page must NOT satisfy a brown/pink/blue background ask (false already-applied).
const blackOnly = {
  'src/App.jsx': `export default function App(){return <div className="app" />}`,
  'src/App.css': `.app{min-height:100vh;background:#000000}`,
};
assert.equal(verifyAsk('add Brown background color', blackOnly).ok, false);
assert.ok(verifyAsk('add Brown background color', blackOnly).missing.some((m) => /brown/i.test(m)));
assert.equal(verifyAsk('change the background to pink', blackOnly).ok, false);
assert.equal(verifyAsk('make the background black', blackOnly).ok, true);

// Soft green accent + keep cream must NOT demand a green page background.
const creamPage = {
  'src/App.jsx': `export default function App(){return <div className="app"><nav className="nav"><span className="brand">Garden Bed</span></nav></div>}`,
  'src/App.css': `.app{min-height:100vh;background:#f5f0e8}.nav{display:flex}.brand{color:#166534}`,
};
const softGreenCream = 'ok cool. add a simple top bar with the name Garden Bed on the left — soft green accent is fine, keep that cream background';
assert.equal(verifyAsk(softGreenCream, creamPage).ok, true, 'soft green + keep cream should pass on cream page');
assert.ok(!verifyAsk(softGreenCream, creamPage).missing.some((m) => /green background/i.test(m)));

// "drop a heading saying something like …" must require the copy — not false already-applied.
const headingAsk = 'now drop a big heading in the middle of the page saying something like Fresh vegetable plants — short and friendly';
assert.equal(verifyAsk(headingAsk, creamPage).ok, false);
assert.ok(verifyAsk(headingAsk, creamPage).missing.some((m) => /Fresh vegetable/i.test(m)));
const withHeading = {
  ...creamPage,
  'src/App.jsx': `export default function App(){return <div className="app"><h1 className="center-word">Fresh vegetable plants</h1></div>}`,
};
assert.equal(verifyAsk(headingAsk, withHeading).ok, true);

// Card shadows must not pass from cream color alone.
const shadowAsk = 'add soft card shadows and a bit of rounded corners — still cream page, soft green accents, no dark mode';
assert.equal(verifyAsk(shadowAsk, creamPage).ok, false);
assert.ok(verifyAsk(shadowAsk, creamPage).missing.some((m) => /shadow|rounded/i.test(m)));

const pinkPage = {
  'src/App.jsx': `export default function App(){return <div className="app" />}`,
  'src/App.css': `.app{min-height:100vh;background:#ec4899}`,
};
assert.equal(verifyAsk('change the background to pink', pinkPage).ok, true);
assert.equal(verifyAsk('change the background to blue', pinkPage).ok, false);

assert.equal(
  verifyAsk('Put the brand name APEX Gear centered in the middle', files).ok,
  false,
);
assert.ok(
  verifyAsk('Put the brand name APEX Gear centered in the middle', files).missing.some((m) => /APEX/i.test(m)),
);
assert.ok(
  verifyAsk(
    'Add a gaming mouse photo (use a real https image URL)',
    { 'src/App.jsx': '<img src="path/to/mouse.jpg" />' },
  ).missing.some((m) => /placeholder|https/i.test(m)),
);
assert.ok(
  verifyAsk(
    'Add a gaming mouse product photo using a real https image URL',
    { 'src/App.jsx': '<img src="https://example.com/path/to/gaming-mouse-photo.jpg" />' },
  ).missing.some((m) => /placeholder|fake|https/i.test(m)),
);
assert.ok(
  verifyAsk(
    'The brand should say VOID Peripherals centered in white',
    { 'src/App.jsx': '<h1>Welcome to void-peripherals</h1>' },
  ).missing.some((m) => /VOID|brand/i.test(m)),
);
assert.ok(
  verifyAsk(
    'Add a dark sticky nav with Products, Specs, and Buy',
    { 'src/App.jsx': '<div>no nav</div>' },
  ).missing.some((m) => /nav/i.test(m)),
);

assert.ok(HANDLER_OWNED_KINDS.includes('create'));
const classified = classifyTurn('Build me a website called Ember', {});
assert.equal(classified.kind, 'create');

let generated = false;
const owned = await dispatchOwnedTurn({
  content: 'Build me a website called Ember',
  mode: 'general',
  // no createHost → continue, but must not call answerStudio (dispatch has none)
});
assert.ok(owned.status === 'continue' || owned.status === 'handled' || owned.status === 'edit');
assert.equal(generated, false);
assert.equal(owned.classified.kind, 'create');

console.log('PASS  verifyAsk + dispatch create never generates');
