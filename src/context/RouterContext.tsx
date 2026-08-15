import { createContext, useContext, useState, type ReactNode } from 'react';

export type ChatMode = 'general' | 'image' | 'video' | 'code';

export type Route =
  | { name: 'dashboard' }
  | { name: 'projects' }
  | { name: 'project'; id: string }
  | { name: 'creation'; id: string }
  | { name: 'chat'; mode?: ChatMode; creationId?: string; chatId?: string }
  | { name: 'models' }
  | { name: 'build' }
  | { name: 'local-ai' }
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
