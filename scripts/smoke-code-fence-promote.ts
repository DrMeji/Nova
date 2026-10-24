import { promoteLooseCodeFences } from '../src/lib/chatMarkdown';
import { looksLikeCodeEditAsk } from '../src/lib/chatAgentTurn';

const sample = "Of course! Here's HTML and CSS: <!DOCTYPE html><html><body>Oak</body></html> header { background-color: #4CAF50; color: white; padding: 10px 20px; text-align: left; position: fixed; top: 0; left: 0; width: 100%; }";
const out = promoteLooseCodeFences(sample);
const fenced = /```(?:html|css)/i.test(out);
console.log(fenced ? 'FENCED_OK' : 'FENCED_MISS');
console.log(
  'edit',
  looksLikeCodeEditAsk(
    'Nice, blank white page works. Can you put the name Oak and Bean up in the top left corner? Just the text for now',
  ),
);
console.log('---');
console.log(out.slice(0, 500));
