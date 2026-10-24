import fs from 'fs';
import path from 'path';
import os from 'os';
import { gradeStorefrontQuality } from '@/lib/createStorefrontLadder';
import { appHasCommerceCart } from '@/lib/createBuildQuality';

const root = path.join(os.homedir(), 'Documents', 'NOVA Projects', 'SpineFlask');
const files = {};
for (const rel of [
  'src/App.jsx',
  'src/App.css',
  'src/index.css',
  'src/data/products.ts',
  'public/logo.svg',
  'public/heroes/spineflask-hero.svg',
]) {
  const p = path.join(root, rel);
  if (fs.existsSync(p)) files[rel] = fs.readFileSync(p, 'utf8');
}
const brief = [
  'insulated bottle e-commerce cart checkout exactly 9 bottles cream ivory',
  'About Careers Help',
].join(' ');
const g = gradeStorefrontQuality(files, brief, 'SpineFlask');
console.log(JSON.stringify(g, null, 2));
console.log('cart', appHasCommerceCart(files));
console.log('ivory', /#f7f3eb/i.test(files['src/App.css'] || ''));
console.log('hero', Boolean(files['public/heroes/spineflask-hero.svg']));
console.log('logoMusic', /M9 18V5l12-2v13/i.test(files['public/logo.svg'] || ''));
console.log('logoWine', /M12 15a5 5 0 0 0 5-5c0-2/i.test(files['public/logo.svg'] || ''));
