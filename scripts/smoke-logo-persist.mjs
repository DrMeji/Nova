/** Smoke: after wireCreatePublicAssets adds public/logo.svg to the in-memory map,
 * the depth-loop-exit persist step must write it to disk (the systemic fix for
 * hero-as-logo). Simulates the thin create flow: model writes App.jsx with
 * hero-as-logo, wireCreatePublicAssets fixes nav + synthesizes logo, then the
 * persist step writes every public/ file to disk via workspaceWriteFile.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

// Stub bridge so workspaceWriteFile drops files into a real temp folder.
const tmpRoot = mkdtempSync(join(tmpdir(), 'nova-logo-persist-'));
globalThis.window = { novaDesktop: { workspaceWriteFile: async ({ targetPath, content }) => {
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, String(content ?? ''), 'utf8');
  return { ok: true, path: targetPath };
} } };

const { wireCreatePublicAssets } = await import('../src/lib/createBuildQuality.ts');
const BRIEF = 'Build a website for a small-batch matcha brand called Verdigris Matcha Co. Invent an original brand page with mountain origin story, a tin hero, tasting notes, and Shop + Steep CTAs.';

const files = {
  'src/App.jsx': [
    "import React from 'react';",
    "import './App.css';",
    'const App = () => (',
    '  <div className="app">',
    '    <nav className="nav">',
    '      <img src="/heroes/verdigris-matcha-co-hero.svg" alt="Verdigris Matcha Co" className="nav-logo" />',
    '      <ul className="nav-links"><li>Shop</li></ul>',
    '    </nav>',
    '    <section className="section origin-story"><h2>Our Mountain Origin Story</h2></section>',
    '  </div>',
    ');',
    'export default App;',
    '',
  ].join('\n'),
  'src/App.css': '.app{background:#0f1419}.nav{display:flex}',
  'public/heroes/verdigris-matcha-co-hero.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
};

// Step 1: wireCreatePublicAssets fixes the nav + synthesizes public/logo.svg in memory.
const wired = wireCreatePublicAssets(files, 'Verdigris Matcha Co', BRIEF);
assert.ok(wired.changed.includes('public/logo.svg'), 'logo.svg materialized in-memory');
assert.ok(/src=["']\/logo\.svg["']/.test(wired.files['src/App.jsx']), 'nav rewired to /logo.svg in-memory');

// Step 2: depth-loop-exit persist writes every public/ file to disk.
{
  const bridge = globalThis.window.novaDesktop;
  // Keys are "public/logo.svg" — match ^(public/), not /public/ (leading-slash miss was the P0).
  const publicKeys = Object.keys(wired.files).filter((k) => {
    const norm = k.replace(/\\/g, '/');
    return /^(?:public\/)/i.test(norm) && typeof wired.files[k] === 'string';
  });
  assert.ok(publicKeys.includes('public/logo.svg'), 'persist filter includes public/logo.svg');
  for (const rel of publicKeys) {
    const sep = tmpRoot.includes('\\') ? '\\' : '/';
    const targetPath = `${tmpRoot.replace(/[/\\]+$/, '')}${sep}${rel.replace(/^[/\\]+/, '').replace(/\//g, sep)}`;
    await bridge.workspaceWriteFile({ targetPath, content: wired.files[rel] });
  }
}

// Step 3: verify logo.svg landed on disk AND nav points to /logo.svg.
const logoPath = join(tmpRoot, 'public', 'logo.svg');
assert.ok(existsSync(logoPath), 'public/logo.svg exists on disk after persist step');
const diskLogo = readFileSync(logoPath, 'utf8');
assert.ok(diskLogo.includes('<svg'), 'disk logo.svg has a real body');
assert.ok(wired.files['public/logo.svg'] === diskLogo, 'disk bytes match in-memory logo');

// Hero image must still exist on disk (not clobbered).
const heroPath = join(tmpRoot, 'public', 'heroes', 'verdigris-matcha-co-hero.svg');
assert.ok(existsSync(heroPath), 'hero image still on disk');

// Cleanup.
rmSync(tmpRoot, { recursive: true, force: true });
console.log('ok logo-persist');
