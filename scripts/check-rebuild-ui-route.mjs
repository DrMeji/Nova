import { classifyTurn } from '../src/lib/classifyTurn.ts';
import { looksLikeInPlaceRebuildAsk } from '../src/lib/chatBuildIntent.ts';
import { codingFileEditTimeoutMs } from '../src/lib/studioAnswerEngine.ts';

const msg = 'rebuild the UI. fix the broken JSX tags, write a full premium App.css';
const bound = { files: { 'src/App.tsx': 'x'.repeat(50) }, projectId: 'p', diskRoot: 'C:/x' };
console.log('inplace', looksLikeInPlaceRebuildAsk(msg));
console.log('classify', classifyTurn(msg, bound));
console.log('budget', codingFileEditTimeoutMs(msg));
