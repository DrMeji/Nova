/**
 * WAVE 2 — delete dead general/code mid-ladder; keep try/catch(fatal) + media IIFE.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'src', 'views', 'AIChat.tsx');
const bak = `${file}.wave2bak`;

if (!fs.existsSync(bak)) {
  fs.copyFileSync(file, bak);
  console.log('backup →', bak);
}

const s = fs.readFileSync(file, 'utf8');
const nl = s.includes('\r\n') ? '\r\n' : '\n';
const start = s.indexOf('const ownedAlreadyResolved = false;');
const end = s.indexOf('    } catch (fatal) {', start);
if (start < 0 || end < 0) {
  console.error('markers missing', { start, end });
  process.exit(1);
}

const keep = [
  '    // WAVE 2: mid-ladder deleted. Media IIFE helpers only (general/code returned above).',
  '    chatRouteSeedRef.current = {',
  '      history: buildRouterHistory(',
  "        messagesRef.current.filter((m) => m.role === 'user' || m.role === 'assistant'),",
  '        content,',
  '        undefined,',
  "        { keepContinuity: true, kind: 'chat' },",
  '      ),',
  "      sticky: pinnedModel.source === 'auto' ? threadBrainRef.current : null,",
  '    };',
  '',
  '    const clearGeneratingIfMine = () => {',
  '      clearGeneratingIfMineEarly();',
  '    };',
  '',
  '    const finalizeAssistant = (finalText: string, provider: string, libraryId?: string) => {',
  '      const supersededHere = mySeq !== genSeqRef.current',
  '        && activeGenChatIdRef.current === activeChatId;',
  '      if (supersededHere) return;',
  "      if (provider && provider !== 'NOVA · setup needed') {",
  '        setLocalPrefs({ lastAnsweredLabel: provider });',
  '      }',
  '      const threadChatId = activeChatId;',
  '      const viewingThisThread = Boolean(threadChatId && routeChatIdRef.current === threadChatId);',
  '      const cleaned = String(finalText || "").trim() || "Done.";',
  '      const next = messagesRef.current.map((m) => (',
  '        m.id === assistantId',
  '          ? { ...m, content: cleaned, provider_used: provider || "NOVA", library_id: libraryId }',
  '          : m',
  '      ));',
  '      messagesRef.current = next;',
  '      persistModeThread(mode, next, { chatId: threadChatId });',
  '      setMessages((prev) => (viewingThisThread ? next : prev));',
  '      notifyChatDone(threadChatId);',
  '      clearGeneratingIfMine();',
  '    };',
  '',
  '    chatTurnCtlRef.current = {',
  '      clearGenerating: clearGeneratingIfMine,',
  '      finalizeAssistant,',
  '      pushStatus: pushAssistantStatus,',
  '    };',
  '',
  '    ',
].join(nl);

const out = s.slice(0, start) + keep + s.slice(end);
fs.writeFileSync(file, out);
console.log(`deleted mid-ladder; lines ${s.split(/\r?\n/).length} → ${out.split(/\r?\n/).length}`);
