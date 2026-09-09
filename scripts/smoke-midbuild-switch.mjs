import {
  shouldKeepBackgroundTurn,
  shouldPaintStudioLive,
} from '../src/lib/chatTurnIsolation.ts';

const issues = [];

if (shouldPaintStudioLive('chat-a', 'chat-a') !== true) issues.push('same chat must paint');
if (shouldPaintStudioLive('chat-b', 'chat-a') !== false) issues.push('other chat must not paint');
if (shouldPaintStudioLive(null, 'chat-a') !== false) issues.push('blank starter must not paint');
if (shouldPaintStudioLive('', 'chat-a') !== false) issues.push('empty route must not paint');
if (shouldPaintStudioLive('chat-a', null) !== false) issues.push('missing origin must not paint');

if (shouldKeepBackgroundTurn('chat-b', 'chat-a', true) !== true) issues.push('left chat should keep background turn');
if (shouldKeepBackgroundTurn('chat-a', 'chat-a', true) !== false) issues.push('viewing origin is not background');
if (shouldKeepBackgroundTurn(null, 'chat-a', true) !== true) issues.push('blank starter keeps background');
if (shouldKeepBackgroundTurn('chat-b', 'chat-a', false) !== false) issues.push('idle must not keep background');

console.log(JSON.stringify({ issues }, null, 2));
if (issues.length) {
  console.error('FAIL', issues);
  process.exit(1);
}
console.log('OK #7 mid-build chat switch isolation');
