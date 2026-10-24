import { composeInventDemoSite } from '@/lib/createInventDemo';
import { thinBlocksLivePreview, thinLiveVisualDeficits, filesHaveInventDemoSite } from '@/lib/createThinPath';
import { previewReadyForBrief } from '@/lib/createBuildQuality';

const d = composeInventDemoSite({ brand: 'CedarLoom X', brief: 'textile atelier landing contact form' });
// Acc may lack public/logo.svg (disk-only) — Live must still clear for invent-demo.
const filesNoLogoKey = {
  'src/App.jsx': d.files['src/App.jsx'],
  'src/App.css': d.files['src/App.css'],
  'src/main.jsx': d.files['src/main.jsx'],
  'src/index.css': d.files['src/index.css'],
  'index.html': d.files['index.html'],
  'package.json': '{"name":"x","dependencies":{"react":"18","react-dom":"18"},"devDependencies":{"vite":"5","@vitejs/plugin-react":"4"}}',
  'vite.config.js': "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({ plugins: [react()] });\n",
};
const files = { ...filesNoLogoKey, 'public/logo.svg': d.files['public/logo.svg'] };
for (const [label, f] of [['full', files], ['noLogoKey', filesNoLogoKey]]) {
  const blocked = thinBlocksLivePreview(f, 'textile atelier landing', 'CedarLoom X');
  const deficits = thinLiveVisualDeficits(f, 'textile atelier landing', 'CedarLoom X');
  const ready = previewReadyForBrief(f, { productName: 'CedarLoom X', brief: 'textile atelier landing contact form' });
  console.log(label, { inventDemo: filesHaveInventDemoSite(f), blocked, deficits, previewReady: ready.ok, reasons: ready.reasons?.slice(0, 3) });
  if (blocked || deficits.length || !ready.ok) process.exit(1);
}
console.log('smoke-invent-demo-live: ok');
