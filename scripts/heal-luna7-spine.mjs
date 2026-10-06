import fs from 'fs';
import path from 'path';
import {
  buildDesignPlan,
  lintDesignSystem,
  healDesignShell,
} from '../src/lib/createDesignSystem.ts';

const root = 'C:/Users/thoma/Documents/NOVA Projects/Luna-7';
const files = {
  'src/App.tsx': fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8'),
  'src/App.css': fs.readFileSync(path.join(root, 'src/App.css'), 'utf8'),
};
const plan = buildDesignPlan({
  brief: 'Design a premium visual homepage for a skincare brand called Luna',
  productName: 'Luna',
  copy: {
    brand: 'Luna',
    headline: 'Nourish Your Skin, Embrace Radiance',
    support: 'A quiet ritual for real mornings.',
    ctas: ['Begin'],
    // Intentionally omit band titles so defaults (not Band 01) bake in
  },
});
console.log('before', lintDesignSystem(files, plan));
const healed = healDesignShell(files, plan);
console.log('healed', healed.changed, lintDesignSystem(healed.files, plan));
fs.writeFileSync(path.join(root, 'src/App.tsx'), healed.files['src/App.tsx']);
fs.writeFileSync(path.join(root, 'src/App.css'), healed.files['src/App.css']);
const app = healed.files['src/App.tsx'];
console.log('titles', [...app.matchAll(/split-title">([^<]+)</g)].map((m) => m[1]));
console.log('site-band', (app.match(/site-band/g) || []).length);
console.log('wrote', root);
