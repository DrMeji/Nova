import type { Route } from '@/context/RouterContext';

export function titleForRoute(route: Route, extras?: { projectName?: string; chatTitle?: string }): string {
  switch (route.name) {
    case 'chat': {
      // Don't show "ARK · Chat" in the title bar. just "ARK" is cleaner.
      const mode = route.mode === 'image' ? 'Image'
        : route.mode === 'video' ? 'Video'
        : route.mode === 'voice' ? 'Voice'
        : '';
      const thread = extras?.chatTitle?.trim();
      if (!mode && !thread) return '';
      return thread ? (mode ? `${mode} · ${thread}` : thread) : mode;
    }
    case 'code':
      return 'Code';
    case 'project':
      return extras?.projectName ? `Code · ${extras.projectName}` : 'Code';
    case 'projects':
      return 'Projects';
    case 'dashboard':
      return 'History';
    case 'models':
      return 'Models';
    case 'local-ai':
      return 'Models · Engine';
    case 'build':
      return 'Plugins';
    case 'creation':
      return 'Creation';
    case 'networking':
      return 'Networking';
    case 'message':
      return 'Message';
    case 'call':
      return 'Call';
    case 'settings':
      return 'Settings';
    default:
      return 'ARK';
  }
}
