import { reactSurgicalMicroAskEdits } from '../src/lib/webProjectCanon.ts';
import { verifyAsk } from '../src/lib/verifyAsk.ts';

const files = {
  'src/App.tsx': `import './App.css';
export default function App(){
  return (
    <div className="app">
      <section className="hero">
        <h1 className="center-word">VOLT Kit</h1>
      </section>
    </div>
  );
}
`,
  'src/App.css': '.app{min-height:100vh;background:#000000;color:#fff}\n.center-word{color:#fff}\n',
};
const ask = 'Shift the page background to a deep charcoal with a soft red accent glow behind the hero.';
const before = verifyAsk(ask, files);
if (before.ok) {
  console.error('FAIL should not already-apply charcoal', before);
  process.exit(2);
}
const edits = reactSurgicalMicroAskEdits(files, ask);
if (!edits.length) {
  console.error('FAIL no charcoal surgical edits');
  process.exit(2);
}
const next = { ...files };
for (const e of edits) next[e.path] = e.content;
const after = verifyAsk(ask, next);
if (!after.ok) {
  console.error('FAIL charcoal verify after', after, next['src/App.css']);
  process.exit(2);
}
if (!/#141414|radial-gradient|rgba\(220,\s*38,\s*38/i.test(next['src/App.css'] || '')) {
  console.error('FAIL charcoal css content', next['src/App.css']);
  process.exit(2);
}
console.log('PASS charcoal surgical + verifyAsk');
