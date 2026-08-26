import { createContext, useContext, useState, type ReactNode } from 'react';

export type ChatMode = 'general' | 'image' | 'video' | 'voice' | 'code';

export type Route =
  | { name: 'dashboard' }
  | { name: 'projects' }
  | { name: 'project'; id: string }
  | { name: 'code'; session?: string }
  | { name: 'creation'; id: string }
  | { name: 'chat'; mode?: ChatMode; creationId?: string; chatId?: string }
  | { name: 'models'; tab?: 'for-pc' | 'local' | 'cloud' | 'engine' }
  | { name: 'build' }
  | { name: 'local-ai' }
  | { name: 'mcp' }
  | { name: 'networking' }
  | { name: 'message'; peer?: string; groupId?: string }
  | { name: 'notifications' }
  | { name: 'call'; peer?: string; incoming?: boolean }
  | { name: 'settings' };

interface RouterContextValue {
  route: Route;
  navigate: (route: Route) => void;
}

const RouterContext = createContext<RouterContextValue | undefined>(undefined);

export function RouterProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>({ name: 'chat' });
  const navigate = (r: Route) => setRoute(r);
  return (
    <RouterContext.Provider value={{ route, navigate }}>
      {children}
    </RouterContext.Provider>
  );
}

export function useRouter() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used within RouterProvider');
  return ctx;
}
