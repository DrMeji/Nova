/** Sidebar / nav “something finished while you were away” pulses. */

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
  call: false,
};

const listeners = new Set<Listener>();

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
}

export function getActivityFlags(): Readonly<Record<ActivityKey, boolean>> {
  return flags;
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
