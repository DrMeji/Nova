/** Sidebar / nav “something finished while you were away” highlight (no pulse). */

export type ActivityKey =
  | 'chat'
  | 'image'
  | 'video'
  | 'code'
  | 'models'
  | 'local-ai'
  | 'plugins'
  | 'networking'
  | 'message'
  | 'notifications'
  | 'call';

type Listener = () => void;

const flags: Record<ActivityKey, boolean> = {
  chat: false,
  image: false,
  video: false,
  code: false,
  models: false,
  'local-ai': false,
  plugins: false,
  networking: false,
  message: false,
  notifications: false,
  call: false,
};

const listeners = new Set<Listener>();

/** Recent chat ids that finished while the user was looking elsewhere. */
const doneChatIds = new Set<string>();

/** What the user is looking at right now (updated by shell / views). */
let viewing: { route: string; mode?: string; chatId?: string } = { route: 'chat' };

function emit() {
  listeners.forEach(l => l());
}

export function setActivityViewing(next: { route: string; mode?: string; chatId?: string }) {
  viewing = {
    route: next.route,
    mode: next.mode,
    chatId: next.chatId,
  };
  if (next.route === 'chat' && next.chatId && doneChatIds.has(next.chatId)) {
    doneChatIds.delete(next.chatId);
    emit();
  }
}

export function getActivityFlags(): Readonly<Record<ActivityKey, boolean>> {
  return flags;
}

export function getDoneChatIds(): ReadonlySet<string> {
  return doneChatIds;
}

export function clearChatDone(chatId: string) {
  if (!doneChatIds.has(chatId)) return;
  doneChatIds.delete(chatId);
  emit();
}

/** Light the Recent row for this thread — never the New Chat nav item. */
export function notifyChatDone(chatId: string | undefined) {
  if (!chatId) return;
  const onThisThread = viewing.route === 'chat' && viewing.chatId === chatId;
  if (onThisThread) return;
  if (doneChatIds.has(chatId)) return;
  doneChatIds.add(chatId);
  emit();
}

export function subscribeActivity(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearActivity(key: ActivityKey) {
  if (!flags[key]) return;
  flags[key] = false;
  emit();
}

export function clearAllActivity() {
  let changed = false;
  (Object.keys(flags) as ActivityKey[]).forEach(k => {
    if (flags[k]) {
      flags[k] = false;
      changed = true;
    }
  });
  if (changed) emit();
}

/** Pulse a nav item when work finished and the user is not already on that surface. */
export function notifyWorkDone(key: ActivityKey) {
  const onSurface =
    (key === 'chat' && viewing.route === 'chat' && (!viewing.mode || viewing.mode === 'general'))
    || (key === 'image' && viewing.route === 'chat' && viewing.mode === 'image')
    || (key === 'video' && viewing.route === 'chat' && viewing.mode === 'video')
    || (key === 'code' && (viewing.route === 'project' || viewing.route === 'projects'))
    || (key === 'models' && viewing.route === 'models')
    || (key === 'local-ai' && viewing.route === 'local-ai')
    || (key === 'plugins' && viewing.route === 'build')
    || (key === 'networking' && viewing.route === 'networking')
    || (key === 'message' && viewing.route === 'message')
    || (key === 'notifications' && viewing.route === 'notifications')
    || (key === 'call' && viewing.route === 'call');

  if (onSurface) return;
  if (flags[key]) return;
  flags[key] = true;
  emit();
}

export function activityKeyForChatMode(mode: 'general' | 'code' | 'image' | 'video'): ActivityKey {
  if (mode === 'image') return 'image';
  if (mode === 'video') return 'video';
  if (mode === 'code') return 'code';
  return 'chat';
}
