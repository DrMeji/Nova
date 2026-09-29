import { looksLikeBoundProjectAsk, looksLikeProjectOverviewAsk, looksLikeProjectDebugAsk } from '../src/lib/chatProjectDebug.ts';
import { looksLikeWebGroundedAsk } from '../src/lib/webSearch.ts';

const cases = [
  'can you tell me what my projects is about',
  'Can you give me more information about this project',
  'Give me a full report on this project',
  "I'm having a problem switching between Settings and Profile",
  'tell me more about Elon Musk',
];

let ok = true;
for (const c of cases) {
  const bound = looksLikeBoundProjectAsk(c);
  const overview = looksLikeProjectOverviewAsk(c);
  const debug = looksLikeProjectDebugAsk(c);
  const web = looksLikeWebGroundedAsk(c);
  const aboutProject = /this project|my projects|full report on this/i.test(c);
  const aboutWeb = /Elon Musk/i.test(c);
  const aboutBug = /having a problem/i.test(c);
  const pass = aboutProject
    ? (bound && overview && !web && !debug)
    : aboutWeb
      ? (web && !bound)
      : aboutBug
        ? (debug && !web && !overview)
        : true;
  if (!pass) ok = false;
  console.log(JSON.stringify({ ask: c, bound, overview, debug, web, pass }));
}
if (!ok) process.exit(1);
console.log('ok');
