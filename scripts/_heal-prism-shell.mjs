/**
 * Repair Prism Latch Acc: strip companion stomp + restore rail shell.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { healModernAtelierCompanionStomp, inventFloorShellId } from '../src/lib/atelierInventShells.ts';

const root = path.join(os.homedir(), 'Documents', 'NOVA Projects', 'prism-latch-atelier');
const files = {};
const walk = (rel) => {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) return;
  if (fs.statSync(full).isDirectory()) {
    for (const n of fs.readdirSync(full)) walk(path.join(rel, n).replace(/\\/g, '/'));
    return;
  }
  if (/\.(jsx?|tsx?|css|svg)$/i.test(rel)) {
    files[rel.replace(/\\/g, '/')] = fs.readFileSync(full, 'utf8');
  }
};
walk('src');
if (fs.existsSync(path.join(root, 'public', 'logo.svg'))) {
  files['public/logo.svg'] = fs.readFileSync(path.join(root, 'public', 'logo.svg'), 'utf8');
}

const before = String(files['src/App.css'] || '').slice(0, 80);
const healed = healModernAtelierCompanionStomp(files, 'Prism Latch Atelier');
const shell = inventFloorShellId('Prism Latch Atelier');
for (const [rel, body] of Object.entries(healed)) {
  if (!/^src\//.test(rel) && rel !== 'public/logo.svg') continue;
  const dest = path.join(root, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, body, 'utf8');
}
console.log(JSON.stringify({
  shell,
  beforeHasCompanion: /novaCompanionSweep/.test(String(files['src/App.css'] || '')),
  afterHasCompanion: /novaCompanionSweep/.test(String(healed['src/App.css'] || '')),
  appCssHead: String(healed['src/App.css'] || '').slice(0, 120),
  heroHasBagArt: /HERO_VISUAL/.test(String(healed['src/sections/HeroSection.jsx'] || '')),
  navClass: (String(healed['src/sections/NavHeaderSection.jsx'] || '').match(/className="([^"]+)"/) || [])[1],
  before: before.slice(0, 60),
}, null, 2));
