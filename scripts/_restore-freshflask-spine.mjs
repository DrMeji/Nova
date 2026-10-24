/**
 * Restore FreshFlask project files to compose storefront spine (original ivory look).
 * Does not modify Nova source — only writes into the user project folder.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { composeStorefrontSpine } from '@/lib/createStorefrontLadder';
import { ensureViteReactProjectFiles } from '@/lib/createBuildQuality';

const root = path.join(os.homedir(), 'Documents', 'NOVA Projects', 'FreshFlask');
const brief = [
  'insulated bottle e-commerce storefront cart checkout',
  'exactly 9 bottles cream ivory welcoming',
  'About Careers Help support email',
].join(' ');

let files = composeStorefrontSpine('FreshFlask', brief, 'restore');
files = ensureViteReactProjectFiles(files, 'FreshFlask').files;

for (const [rel, content] of Object.entries(files)) {
  if (!content || typeof content !== 'string') continue;
  if (rel.startsWith('.__')) continue;
  const abs = path.join(root, rel.replace(/\//g, path.sep));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  console.log('wrote', rel, content.length);
}

console.log('restored', root);
console.log('marker', /nova-storefront-spine/i.test(files['src/data/products.ts'] || ''));
console.log('bg', (files['src/App.css'] || '').match(/--bg:\s*([^;]+)/)?.[1]);
