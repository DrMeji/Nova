/**
 * Live-window ownership contract for electron/novaPreview.cjs setActiveLiveChat (no Electron).
 *  - new owner hides every *other* web Live window
 *  - {} (empty payload) clears ownership
 *  - the owner's own window is never hidden
 * Non-web (device) windows are left alone.
 */
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Stub `electron` so novaPreview.cjs loads under plain node.
const origLoad = Module._load;
Module._load = function patched(request, ...rest) {
  if (request === 'electron') {
    return {
      app: { getPath: () => '.', on() {}, whenReady: () => Promise.resolve() },
      BrowserWindow: class {},
      session: { fromPartition: () => ({}) },
    };
  }
  return origLoad.call(this, request, ...rest);
};

const preview = require('../electron/novaPreview.cjs');
Module._load = origLoad;

assert.equal(typeof preview.setActiveLiveChat, 'function', 'setActiveLiveChat exported');
const t = preview.__test;
assert.ok(t?.previewWindows instanceof Map, '__test.previewWindows exported');

function fakeWindow(visible = true) {
  return {
    __novaPreviewUserVisible: true,
    _visible: visible,
    hideCalls: 0,
    isDestroyed: () => false,
    isVisible() { return this._visible; },
    hide() { this._visible = false; this.hideCalls += 1; },
  };
}

function reset() {
  t.previewWindows.clear();
  t.setActiveLiveOwnerId(null);
}

// 1. New owner hides other web Live windows; own window untouched; device window untouched.
reset();
const a = fakeWindow();
const b = fakeWindow();
const device = fakeWindow();
t.previewWindows.set('chat-alpha', a);
t.previewWindows.set('chat-beta', b);
t.previewWindows.set('device-preview', device);

let res = preview.setActiveLiveChat({ projectId: 'beta' });
assert.equal(res.ok, true);
assert.equal(res.activeLiveOwnerId, 'chat-beta');
assert.equal(t.getActiveLiveOwnerId(), 'chat-beta');
assert.equal(a._visible, false, 'other chat Live hidden');
assert.equal(a.__novaPreviewUserVisible, false, 'other chat Live flagged not user-visible');
assert.equal(a.hideCalls, 1);
assert.equal(b._visible, true, "owner's own window not hidden");
assert.equal(b.__novaPreviewUserVisible, true, "owner's own window stays user-visible");
assert.equal(b.hideCalls, 0);
assert.equal(device._visible, true, 'device window not touched');
assert.equal(device.hideCalls, 0);

// 2. Switching owner flips who is hidden; re-asserting the same owner is a no-op for it.
b.__novaPreviewUserVisible = true;
a._visible = true;
a.__novaPreviewUserVisible = true;
res = preview.setActiveLiveChat({ chatId: 'alpha' });
assert.equal(res.activeLiveOwnerId, 'chat-alpha');
assert.equal(a._visible, true, 'new owner window visible');
assert.equal(b._visible, false, 'previous owner now hidden');
preview.setActiveLiveChat({ projectId: 'alpha' });
assert.equal(a.hideCalls, 1, 'owner never hidden by repeat set (only the earlier switch)');

// 3. {} clears ownership and hides nothing.
const hidesBefore = a.hideCalls + b.hideCalls;
res = preview.setActiveLiveChat({});
assert.deepEqual(res, { ok: true, activeLiveOwnerId: null });
assert.equal(t.getActiveLiveOwnerId(), null, 'ownership cleared');
assert.equal(a.hideCalls + b.hideCalls, hidesBefore, 'clear hides nothing');
assert.equal(a._visible, true, 'owner window still visible after clear');

// null / undefined payloads clear as well.
t.setActiveLiveOwnerId('chat-alpha');
assert.equal(preview.setActiveLiveChat(undefined).activeLiveOwnerId, null);
assert.equal(t.getActiveLiveOwnerId(), null);

// 4. Destroyed windows are skipped without throwing.
reset();
const dead = fakeWindow();
dead.isDestroyed = () => true;
dead.hide = () => { throw new Error('must not hide destroyed window'); };
t.previewWindows.set('chat-dead', dead);
assert.doesNotThrow(() => preview.setActiveLiveChat({ projectId: 'live' }));

reset();
console.log('smoke:live-ownership OK');
