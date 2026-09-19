import { reactSurgicalMicroAskEdits } from '../src/lib/webProjectCanon.ts';
import { stripModelProseFromSource } from '../src/lib/createBuildQuality.ts';

const shell = `import "./App.css";

export default function App() {
  return (
    <div className="app">
      <h1 className="center-word">SOL Gear</h1>
    </div>
  );
}
`;
const files = {
  'src/App.jsx': shell,
  'src/App.css': '.app{min-height:100vh;margin:0;background:#000000;display:flex;align-items:center;justify-content:center}\n.center-word{color:#fff}\n',
};
const edits = reactSurgicalMicroAskEdits(
  files,
  'Add a dark sticky nav with Products, Specs, and Buy — keep the black background.',
);
const app = edits.find((e) => e.path.includes('App.jsx'))?.content || '';
if (!/sticky-nav/.test(app) || !/Products/.test(app) || !/SOL Gear/.test(app)) {
  console.error('FAIL sticky nav preserve brand', app);
  process.exit(2);
}
const brandOnly = reactSurgicalMicroAskEdits(
  {
    'src/App.jsx': `import "./App.css";\nexport default function App(){return <div className="app" />;\n}\n`,
    'src/App.css': '.app{min-height:100vh;background:#000}\n',
  },
  'Put the brand name ORBIT Gear centered in the middle in clean white text.',
);
const brandApp = brandOnly.find((e) => e.path.includes('App.jsx'))?.content || '';
if (!/<h1 className="center-word">ORBIT Gear<\/h1>/.test(brandApp)) {
  console.error('FAIL brand label', brandApp);
  process.exit(2);
}

const mouseEdits = reactSurgicalMicroAskEdits(
  files,
  'Add a gaming mouse product photo in the hero. use a real https image URL, not example.com or path/to.',
);
const mouseApp = mouseEdits.find((e) => e.path.includes('App.jsx'))?.content || '';
if (!/https:\/\/images\.unsplash\.com\//.test(mouseApp) || /example\.com|path\/to/.test(mouseApp)) {
  console.error('FAIL mouse https photo', mouseApp);
  process.exit(2);
}
if (!/SOL Gear/.test(mouseApp)) {
  console.error('FAIL mouse edit wiped brand', mouseApp);
  process.exit(2);
}
const heroBlock = mouseApp.match(/<section\b[^>]*className=["']hero["'][^>]*>[\s\S]*?<\/section>/i)?.[0] || '';
if (!/center-word/.test(heroBlock)) {
  console.error('FAIL brand not nested in hero after mouse', mouseApp);
  process.exit(2);
}
const mouseCss = mouseEdits.find((e) => e.path.includes('App.css'))?.content || '';
if (/center-word\{[^}]*position\s*:\s*absolute/i.test(mouseCss.replace(/\s+/g, ''))) {
  console.error('FAIL absolute brand after mouse', mouseCss);
  process.exit(2);
}

const stacked = {
  'src/App.jsx': mouseApp,
  'src/App.css': mouseCss || files['src/App.css'],
};
const afterNav = reactSurgicalMicroAskEdits(
  stacked,
  'Add a dark sticky nav with Products, Specs, and Buy. keep the black background.',
);
const navApp = afterNav.find((e) => e.path.includes('App.jsx'))?.content || '';
const navCss = afterNav.find((e) => e.path.includes('App.css'))?.content || '';
const navHero = navApp.match(/<section\b[^>]*className=["']hero["'][^>]*>[\s\S]*?<\/section>/i)?.[0] || '';
if (!/sticky-nav/.test(navApp) || !/center-word/.test(navHero)) {
  console.error('FAIL sticky nav un-nested brand', navApp);
  process.exit(2);
}
if (/center-word\{[^}]*position\s*:\s*absolute/i.test(navCss.replace(/\s+/g, ''))) {
  console.error('FAIL sticky nav re-absolute brand', navCss);
  process.exit(2);
}

const { extractBrandLabel } = await import('../src/lib/brandLabel.ts');
const brand = extractBrandLabel('Put the brand name VOID Peripherals centered in the middle in clean white text.');
if (brand !== 'VOID Peripherals') {
  console.error('FAIL extractBrandLabel', brand);
  process.exit(2);
}
const badCss = `### Explanation of Changes:\n1. **Added a nav**\n\`\`\`css\n.x{}\n\`\`\`\n`;
const stripped = stripModelProseFromSource('src/App.css', badCss);
if (stripped.trim()) {
  console.error('FAIL css prose', stripped);
  process.exit(2);
}
console.log('PASS surgical brand + hero nest + sticky nav preserve + css prose strip');
