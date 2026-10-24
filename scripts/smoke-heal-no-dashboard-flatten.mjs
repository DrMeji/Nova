/**
 * healMissingLocalImports must not paste marketing into a dashboard Acc.
 *   npx tsx --tsconfig tsconfig.app.json scripts/smoke-heal-no-dashboard-flatten.mjs
 */
import assert from 'node:assert/strict';
import { healMissingLocalImports } from '../src/lib/createBuildQuality.ts';

const dash = {
  'src/App.jsx': `import Header from './components/Header';
import Hero from './components/Hero';
import KpiGrid from './components/KpiGrid';
export default function App(){ return <main><Header/><Hero/><KpiGrid/></main>; }
`,
  'src/App.css': '.dash{display:grid}',
  'package.json': '{"name":"ops","dependencies":{"react":"^18"}}',
};
const before = dash['src/App.jsx'];
const h = healMissingLocalImports(dash, 'Ops', {
  brief: 'Build a React dashboard for sales metrics',
  artifactKind: 'web-app',
});
assert.equal(h.files['src/App.jsx'], before, 'dashboard App must not be assembled/flattened');
assert.equal(
  /quiet luxury|transform your|Get started|Book a demo/i.test(h.files['src/App.jsx'] || ''),
  false,
);

console.log('smoke-heal-no-dashboard-flatten: ok');
