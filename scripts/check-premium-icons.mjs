import assert from 'node:assert/strict';
import { finalizeWebEdits } from '../src/lib/webProjectCanon.ts';
import { formatCodeChatReply, sanitizeAppliedWebContent } from '../src/lib/projectCodeEdit.ts';
import { wireBrandAssetsIntoSource } from '../src/lib/brandAssets.ts';

const cream = {
  'src/App.tsx': `import './App.css';\nexport default function App(){return <div className="app" />}\n`,
  'src/App.css': `.app {\n  min-height: 100vh;\n  margin: 0;\n  background: #fef3c7;\n}\n`,
};

{
  const ask = 'Add a premium menu icon near the logo in the top left. Keep the cream background and the logo.';
  const reply = formatCodeChatReply(ask, ['src/App.tsx', 'public/icons/menu.svg'], '', { surface: 'chat' });
  assert.match(reply, /added the icon/i);
  assert.doesNotMatch(reply, /background and colors/i);
}

{
  const broken = `import './App.css';\nexport default function App() {\n  return (\n    <div className="app" />\n  );\n}\n.nav-tools { display:flex; }\n.nav-icon { display:block; }\n`;
  const healedWire = wireBrandAssetsIntoSource(broken, { projectName: 'x', slots: [] }, 'src/App.tsx');
  assert.doesNotMatch(healedWire, /\.nav-tools/);
  const healedWrite = sanitizeAppliedWebContent('src/App.tsx', broken);
  assert.doesNotMatch(healedWrite, /\.nav-tools/);
  assert.match(healedWrite, /export default function App/);
}

{
  const after = { ...cream };
  for (const e of finalizeWebEdits(cream, 'Add a premium logo in the top left. Keep the cream background.', [])) {
    after[e.path] = e.content;
  }
  assert.match(after['src/App.css'], /#fef3c7/i);
  assert.doesNotMatch(after['src/App.css'], /#8[Bb]4513/);
  assert.doesNotMatch(after['src/App.css'], /filter:\s*invert\(1\)/i);
  assert.match(after['src/App.tsx'], /logo\.svg|corner-logo/i);
  assert.ok(after['public/logo.svg'], 'logo.svg materializes');
  assert.match(after['public/logo.svg'], /#1a1a1a|stroke="#1a1a1a"/i);
}

{
  let cur = { ...cream };
  for (const ask of [
    'Add a premium logo in the top left. Keep the cream background.',
    'Add a premium menu icon near the logo in the top left. Keep the cream background and the logo.',
  ]) {
    const next = { ...cur };
    for (const e of finalizeWebEdits(cur, ask, [])) next[e.path] = e.content;
    cur = next;
  }
  assert.match(cur['src/App.css'], /#fef3c7/i);
  assert.match(cur['src/App.tsx'], /logo\.svg/i);
  assert.match(cur['src/App.tsx'], /menu\.svg|nav-icon/i);
  assert.doesNotMatch(cur['src/App.tsx'], /\.nav-tools\s*\{/);
  assert.ok(cur['public/icons/menu.svg'] || /menu\.svg/i.test(cur['src/App.tsx']));
}

console.log('PASS  premium logo + icon on cream');
