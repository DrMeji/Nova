process.env.NOVA_ALLOW_INVENT_DEMO = '1';
import { applyInventDemoToFiles, appLooksLikeInventIncomplete } from '@/lib/createInventDemo';
import { thinBlocksLivePreview } from '@/lib/createThinPath';
import { previewReadyForBrief } from '@/lib/createBuildQuality';

const thinShell = {
  '.__novaGenericInventAsk': 'invent me a textile atelier',
  'src/App.jsx': `import './App.css';
import NavHeaderSection from './sections/NavHeaderSection.jsx';
import HeroSection from './sections/HeroSection.jsx';
export default function App() {
  return (
    <div className="app">
      <NavHeaderSection />
      <HeroSection />
    </div>
  );
}
`,
  'src/App.css': '.app{min-height:100vh}',
  'src/sections/NavHeaderSection.jsx': 'export default function NavHeaderSection(){return <header data-nova-scaffold="1">More authored detail for this band so the file clears</header>}',
  'src/sections/HeroSection.jsx': 'export default function HeroSection(){return <section data-nova-scaffold="1">More authored detail for this band so the file clears</section>}',
  'package.json': '{"name":"x","dependencies":{"react":"18","react-dom":"18"},"devDependencies":{"vite":"5","@vitejs/plugin-react":"4"}}',
  'vite.config.js': "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({ plugins: [react()] });\n",
};

if (!appLooksLikeInventIncomplete(thinShell)) {
  console.error('expected incomplete compositional shell');
  process.exit(1);
}

const salvaged = applyInventDemoToFiles(thinShell, 'CedarLoom Salvage', 'textile atelier landing contact form', { force: true });
if (!salvaged.applied) {
  console.error('expected salvage apply');
  process.exit(1);
}
const files = salvaged.files;
const blocked = thinBlocksLivePreview(files, 'textile atelier landing', 'CedarLoom Salvage');
const ready = previewReadyForBrief(files, {
  productName: 'CedarLoom Salvage',
  brief: 'textile atelier landing contact form',
});
console.log({
  applied: salvaged.applied,
  hasDemo: /data-nova-invent-demo/.test(files['src/App.jsx'] || ''),
  sectionsGone: !Object.keys(files).some((k) => /src\/sections\//.test(k)),
  blocked,
  previewReady: ready.ok,
  reasons: ready.reasons?.slice(0, 4),
});
if (blocked || !ready.ok || !/data-nova-invent-demo/.test(files['src/App.jsx'] || '')) {
  process.exit(1);
}
console.log('smoke-invent-demo-salvage: ok');
