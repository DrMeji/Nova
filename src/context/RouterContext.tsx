import { createContext, useContext, useState, type ReactNode } from 'react';

export type Route =
  | { name: 'dashboard' }
  | { name: 'projects' }
  | { name: 'project'; id: string }
  | { name: 'chat' }
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
  const [route, setRoute] = useState<Route>({ name: 'dashboard' });
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
