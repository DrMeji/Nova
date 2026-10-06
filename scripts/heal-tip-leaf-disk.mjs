import fs from 'fs';
import path from 'path';
import { buildDesignPlan, renderDesignShell, lintDesignSystem } from '../src/lib/createDesignSystem.ts';

function heal(root, brief, product) {
  const plan = buildDesignPlan({ brief, productName: product });
  const shell = renderDesignShell(plan);
  const preferJsx = fs.existsSync(path.join(root, 'src/App.jsx'));
  if (preferJsx) {
    fs.writeFileSync(path.join(root, 'src/App.jsx'), shell['src/App.tsx']);
    try { fs.unlinkSync(path.join(root, 'src/App.tsx')); } catch { /* */ }
  } else {
    fs.writeFileSync(path.join(root, 'src/App.tsx'), shell['src/App.tsx']);
  }
  fs.writeFileSync(path.join(root, 'src/App.css'), shell['src/App.css']);
  const files = preferJsx
    ? { 'src/App.jsx': shell['src/App.tsx'], 'src/App.css': shell['src/App.css'] }
    : shell;
  console.log(product, 'family', plan.family, 'lint', lintDesignSystem(files, plan));
}

heal(
  'C:/Users/thoma/Documents/NOVA Projects/TipWise-2',
  'Build a complete tip calculator web app called TipWise. Utility tool UI.',
  'TipWise',
);
heal(
  'C:/Users/thoma/Documents/NOVA Projects/LeafNote-2',
  'Build a complete notes app called LeafNote with sidebar note list, editor, and Settings. Sign-in screen.',
  'LeafNote',
);
