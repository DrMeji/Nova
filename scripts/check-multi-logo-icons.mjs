import assert from 'node:assert/strict';
import { finalizeWebEdits } from '../src/lib/webProjectCanon.ts';
import { parseNamedBrandLogos, parseNamedUiIcons } from '../src/lib/brandAssets.ts';

assert.equal(parseNamedBrandLogos('Add Apple, Google, GitHub logos').length, 3);
assert.ok(parseNamedUiIcons('Add icons: menu, search, profile, settings, bell').length >= 5);

const cream = {
  'src/App.tsx': `import './App.css';\nexport default function App(){return <div className="app" />}\n`,
  'src/App.css': '.app { min-height:100vh; margin:0; background:#fef3c7; }\n',
};
let cur = { ...cream };
for (const ask of [
  'Add these company logos in a row in the top left. Keep the cream background. Real brand marks: Apple, Google, GitHub, Discord, Twitch.',
  'Add more logos: Netflix, Spotify, YouTube. Keep cream and existing logos.',
  'Add premium UI icons top right: menu, search, profile, settings, bell. Keep cream and logos.',
  'Add more icons: heart, cart, home, mail, calendar. Keep everything.',
]) {
  const next = { ...cur };
  for (const e of finalizeWebEdits(cur, ask, [])) next[e.path] = e.content;
  cur = next;
}
assert.match(cur['src/App.css'], /#fef3c7/);
assert.match(cur['src/App.tsx'], /brand-rail/);
assert.match(cur['src/App.tsx'], /icon-rail/);
assert.ok(cur['public/logos/apple.svg']);
assert.ok(cur['public/logos/discord.svg']);
assert.ok(cur['public/icons/settings.svg']);
assert.doesNotMatch(cur['src/App.tsx'], /\.nav-tools\s*\{/);
console.log('PASS multi logo+icon', {
  logos: Object.keys(cur).filter((k) => k.startsWith('public/logos')).length,
  icons: Object.keys(cur).filter((k) => k.startsWith('public/icons')).length,
});

import { verifyAsk } from '../src/lib/verifyAsk.ts';
{
  // CSS `.logo` must not satisfy a request for Apple/Google marks that are absent.
  const v = verifyAsk(
    'Add these company logos: Apple, Google, GitHub. Keep the cream background.',
    {
      'src/App.tsx': `import './App.css';\nexport default function App(){return <div className="app" />}\n`,
      'src/App.css': '.app{background:#fef3c7}.logo img{display:block}\n',
    },
  );
  assert.equal(v.ok, false, `expected miss, got ${JSON.stringify(v)}`);
  assert.ok(v.missing.some((m) => /Apple|Google|GitHub|logo/i.test(m)), JSON.stringify(v.missing));

  // Existing nav-icon must not satisfy a request for new named icons.
  const v2 = verifyAsk(
    'Add more icons: heart, cart, home. Keep cream and logos.',
    {
      'src/App.tsx': `import './App.css';\nexport default function App(){return (<div className="app"><div className="icon-rail"><img className="nav-icon" src="/icons/menu.svg" alt="menu" /></div></div>)}\n`,
      'src/App.css': '.app{background:#fef3c7}.nav-icon{display:block}\n',
    },
  );
  assert.equal(v2.ok, false, `expected icon miss, got ${JSON.stringify(v2)}`);
  assert.ok(v2.missing.some((m) => /heart|cart|home/i.test(m)), JSON.stringify(v2.missing));
}
console.log('PASS verifyAsk rejects incomplete logo/icon sets');
