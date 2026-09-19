import { reactSurgicalMicroAskEdits } from '../src/lib/webProjectCanon.ts';

// Monkey: reimplement the centeredWord chain from source for this ask
const t = "Can you change the name that's in the middle to local only";
const { extractBrandLabel } = await import('../src/lib/brandLabel.ts');

const hits = [];
const tryM = (label, re) => {
  const m = t.match(re);
  if (m?.[1]) hits.push([label, m[1]]);
};

tryM('1', /\b(?:words?|text|phrase|copy|line)\s+(?:that\s+)?(?:says?|reading)\s*[:\s]+["“']([^"”']{2,80})["”']/i);
tryM('2', /\b(?:says?|reading)\s+["“']([^"”']{2,80})["”']/i);
tryM('3', /\b(?:says?|reading)\s+([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,6})\b/);
tryM('4', /\b(?:put|add|place|write|show)\b[\s\S]{0,48}\b(?:words?|text|phrase)\b[\s\S]{0,24}["“']([^"”']{2,80})["”']/i);
tryM('5', /\b(?:put|add|place|write|show)\b[\s\S]{0,40}\b(?:words?|text|title)\s+["“']([^"”']{2,80})["”']/i);
tryM('6', /\b(?:put|add|place|write|show)\b[\s\S]{0,48}\b(?:words?|text|phrase|title)\s+([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,6})\b/);
tryM('7', /\b(?:change|rename|set|update)\b[\s\S]{0,48}\b(?:centered\s+)?(?:words?|title|text)\s+(?:to|into)\s+["“']?([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,6})\b/);
tryM('brand', new RegExp(extractBrandLabel(t) ? '.*' : '(?!)'), );
hits.push(['brandLabel', extractBrandLabel(t) || '']);
tryM('8', /\b(?:put|add|place|write|show)\b[\s\S]{0,40}\b(?:word|text|title)\s+["“']?([A-Za-z][A-Za-z0-9_-]{1,40})\b/i);
tryM('9', /\b(?:word|text)\s+["“']?([A-Za-z][A-Za-z0-9_-]{1,40})["”']?\s+(?:in|on|at)\b/i);

console.log('hits', hits);

const files = {
  'src/App.jsx': `import './App.css';\nexport default function App(){return (<div className="app"><h1 className="center-word">Cursor</h1></div>)}\n`,
  'src/App.css': '.app{min-height:100vh;background:#fef3c7}.center-word{color:#fff}\n',
};
const edits = reactSurgicalMicroAskEdits(files, t);
const app = edits.find((e) => /App\.jsx/i.test(e.path))?.content || '';
console.log('result label', app.match(/center-word[^>]*>([^<]+)/)?.[1]);
