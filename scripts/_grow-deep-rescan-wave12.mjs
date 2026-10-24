/**
 * Wave 12 — keep going: React patterns, hooks, forms, state, routing, data fetching.
 */
import fs from 'fs';

const path =
  'C:/Users/thoma/.cursor/projects/c-Users-thoma-Desktop-Projects-Nova/canvases/nova-deep-rescan.canvas.tsx';
let t = fs.readFileSync(path, 'utf8');
const existing = new Set(
  [...t.matchAll(/capability: '([^']+)'/g)].map((m) => m[1].toLowerCase()),
);

/** @type {Array<[string, 'coding'|'product'|'protocol', 'worst'|'weak'|'partial'|'strong', string, string, string]>} */
const batch = [];
function add(cap, lane, nova, leader, how, now) {
  if (existing.has(cap.toLowerCase())) return;
  existing.add(cap.toLowerCase());
  batch.push([cap, lane, nova, leader, how, now]);
}

const hooks = [
  'useState', 'useEffect', 'useEffectEvent', 'useLayoutEffect', 'useMemo',
  'useCallback', 'useRef', 'useImperativeHandle', 'useContext', 'useReducer',
  'useId', 'useDeferredValue', 'useTransition', 'useSyncExternalStore',
  'useOptimistic', 'useActionState', 'useFormStatus', 'use', 'custom useLocalStorage',
  'custom useMediaQuery', 'custom useDebounce', 'custom useThrottle',
  'custom usePrevious', 'custom useOnClickOutside', 'custom useKeyPress',
  'custom useIntersection', 'custom useFetch', 'custom usePagination',
];
for (const h of hooks) {
  add(`React ${h} invent correct`, 'coding', 'partial', 'React docs', 'Correct use', 'Partial');
  add(`React ${h} lint rule`, 'coding', 'weak', 'eslint-plugin-react-hooks', 'Lint', 'Partial');
  add(`React ${h} heal misuse`, 'coding', 'weak', 'Nova heal', 'Heal', 'Partial');
}

const patterns = [
  'compound components', 'render props', 'HOC', 'headless component',
  'controlled input', 'uncontrolled input', 'lifting state', 'colocation',
  'state machine', 'xstate invent', 'error boundary', 'suspense boundary',
  'lazy route', 'code split', 'portal modal', 'forwardRef',
  'polymorphic as=', 'slot pattern', 'context provider split',
  'server component', 'client component boundary', 'streaming RSC',
];
for (const p of patterns) {
  add(`React pattern ${p} invent`, 'coding', 'weak', 'React field', p, 'Partial');
  add(`React pattern ${p} edit safe`, 'coding', 'weak', 'agent', 'Edit', 'Partial');
}

const forms = [
  'react-hook-form', 'formik', 'final-form', 'conform', 'remix forms',
  'native form action', 'zod resolver', 'yup resolver', 'valibot',
  'field array', 'dependent fields', 'multi-step form', 'wizard',
  'file upload field', 'mask input', 'phone input', 'credit card input',
  'address autocomplete', 'captcha field', 'honeypot',
];
for (const f of forms) {
  add(`Form ${f} invent`, 'coding', 'weak', 'RHF / Conform', f, 'Partial');
  add(`Form ${f} validate UX`, 'coding', 'weak', 'field', 'UX', 'Partial');
  add(`Form ${f} a11y errors`, 'coding', 'weak', 'a11y', 'Errors', 'a11y Acc');
}

const state = [
  'Zustand', 'Jotai', 'Recoil', 'Redux Toolkit', 'MobX', 'Valtio',
  'Context only', 'URL state', 'nuqs', 'TanStack Query', 'SWR',
  'RTK Query', 'Apollo Client', 'urql', 'tRPC client', 'Relay',
];
for (const s of state) {
  add(`State ${s} invent`, 'coding', 'weak', s, 'Store', 'Partial');
  add(`State ${s} persist`, 'coding', 'weak', s, 'Persist', 'Partial');
  add(`State ${s} devtools`, 'coding', 'weak', s, 'Devtools', 'Partial');
}

const routers = [
  'react-router v6', 'react-router v7', 'TanStack Router', 'Next App Router',
  'Next Pages Router', 'Remix routes', 'Vue Router', 'SvelteKit routes',
  'Nuxt routes', 'Astro routes', 'wouter', 'reach router legacy',
];
for (const r of routers) {
  add(`Router ${r} invent`, 'coding', 'weak', r, 'Routes', 'Partial');
  add(`Router ${r} nested`, 'coding', 'weak', r, 'Nested', 'Partial');
  add(`Router ${r} loaders`, 'coding', 'weak', r, 'Loaders', 'Partial');
  add(`Router ${r} guards`, 'coding', 'weak', r, 'Guards', 'Partial');
  add(`Router ${r} 404`, 'coding', 'weak', r, '404', 'Partial');
}

const fetch = [
  'GET list', 'GET detail', 'POST create', 'PUT update', 'PATCH update',
  'DELETE', 'optimistic update', 'invalidate cache', 'prefetch',
  'infinite scroll', 'cursor pagination', 'offset pagination',
  'retry backoff', 'timeout', 'abort on unmount', 'dedupe',
  'stale-while-revalidate', 'polling', 'websocket sync',
];
for (const f of fetch) {
  add(`Data ${f} invent`, 'coding', 'weak', 'TanStack Query', f, 'Partial');
  add(`Data ${f} error UX`, 'coding', 'weak', 'field', 'Error UX', 'Partial');
  add(`Data ${f} loading UX`, 'coding', 'partial', 'field', 'Loading', 'Partial');
}

// Animation libs
const motion = [
  'CSS transition', 'CSS animation', 'WAAPI', 'Framer Motion', 'Motion One',
  'GSAP', 'Anime.js', 'Lottie', 'Rive', 'Three animation', 'scroll reveal',
  'parallax', 'stagger children', 'layout animation', 'exit animation',
  'gesture drag', 'spring', 'reduce-motion respect',
];
for (const m of motion) {
  add(`Motion ${m} invent`, 'coding', 'partial', 'Motion field', m, 'craft soft');
  add(`Motion ${m} kill in Gray`, 'product', 'strong', 'Nova Gray', 'Static', 'ThemeContext');
  add(`Motion ${m} keep in Fun`, 'product', 'strong', 'Nova Fun', 'Orbs/motion', 'ThemeContext');
}

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

const lines = batch.map(
  ([cap, lane, nova, leader, how, now]) =>
    `  {\n    capability: '${esc(cap)}',\n    lane: '${lane}',\n    nova: '${nova}',\n    leader: '${esc(leader)}',\n    howTheyDoIt: '${esc(how)}',\n    novaNow: '${esc(now)}',\n  },`,
);

const marker = '  // —— STRONG (real Nova wiring) ——';
const idx = t.indexOf(marker);
if (idx < 0) throw new Error('marker missing');
t = `${t.slice(0, idx)}${lines.join('\n')}\n\n${t.slice(idx)}`;

t = t.replace(
  /Wave 11 deep research · scripts\/env\/config\/monorepo\/WebAPI · keep growing/g,
  'Wave 12 deep research · React/forms/state/router/data/motion · keep growing',
);
t = t.replace(
  /Wave 11 grown\. Open = \{open\}\. Still growing — no artificial stop\./g,
  'Wave 12 grown. Open = {open}. Still growing — no artificial stop.',
);

fs.writeFileSync(path, t);
const g = (k) => [...t.matchAll(new RegExp(`nova: '${k}'`, 'g'))].length;
console.log({
  added: batch.length,
  rows: [...t.matchAll(/capability: '/g)].length,
  worst: g('worst'),
  weak: g('weak'),
  partial: g('partial'),
  strong: g('strong'),
  open: g('worst') + g('weak') + g('partial'),
});
