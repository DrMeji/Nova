import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import {
  archiveRecentChat,
  deleteRecentChatPermanently,
  loadRecentChats,
  loadRecentCreations,
  loadRecentProjects,
  saveRecentChats,
  saveRecentProjects,
  upsertCreation,
  upsertRecentChat,
  type RecentChat,
  type RecentCreation,
  type RecentProject,
} from '@/lib/recentStore';

interface RecentProjectsContextValue {
  recent: RecentProject[];
  creations: RecentCreation[];
  /** All chats including archived (History). */
  chats: RecentChat[];
  /** Sidebar Recent — excludes archived. */
  activeChats: RecentChat[];
  addRecent: (name: string) => RecentProject;
  addCreation: (entry: RecentCreation) => void;
  addChat: (entry: RecentChat) => void;
  archiveChat: (chatId: string) => void;
  deleteChatForever: (chatId: string) => void;
  refreshCreations: () => void;
  refreshChats: () => void;
}

const RecentProjectsContext = createContext<RecentProjectsContextValue | undefined>(undefined);

export function RecentProjectsProvider({ children }: { children: ReactNode }) {
  const [recent, setRecent] = useState<RecentProject[]>(() => loadRecentProjects());
  const [creations, setCreations] = useState<RecentCreation[]>(() => loadRecentCreations());
  const [chats, setChats] = useState<RecentChat[]>(() => loadRecentChats());

  const activeChats = useMemo(() => chats.filter(c => !c.archivedAt), [chats]);

  const refreshCreations = useCallback(() => {
    setCreations(loadRecentCreations());
  }, []);

  const refreshChats = useCallback(() => {
    setChats(loadRecentChats());
  }, []);

  useEffect(() => {
    const syncCreations = () => refreshCreations();
    const syncChats = () => refreshChats();
    window.addEventListener('ark:creations-changed', syncCreations);
    window.addEventListener('ark:chats-changed', syncChats);
    window.addEventListener('focus', syncCreations);
    window.addEventListener('focus', syncChats);

    const pullLibrary = async () => {
      try {
        if (localStorage.getItem('ark:skip-library-sync') === '1') {
          localStorage.removeItem('ark:skip-library-sync');
          try {
            await window.arkDesktop?.mediaClear?.();
          } catch {
            /* ignore */
          }
          setCreations([]);
          setChats([]);
          saveRecentChats([]);
          return;
        }
        const res = await window.arkDesktop?.mediaLibrary?.();
        if (res?.ok && Array.isArray(res.items) && res.items.length) {
          for (const item of res.items.slice(0, 40)) {
            if (!item?.id) continue;
            upsertCreation({
              id: item.id,
              kind: item.kind === 'video' ? 'video' : 'image',
              title: item.title || item.prompt || 'Creation',
              prompt: item.prompt || '',
              modelName: item.modelName || 'ARK Engine',
              dataUrl: item.dataUrl,
              createdAt: item.createdAt || new Date().toISOString(),
              real: item.real,
              source: item.source,
            });
          }
          setCreations(loadRecentCreations());
        } else {
          refreshCreations();
        }
      } catch {
        refreshCreations();
      }
    };

    void pullLibrary();
    const t = window.setTimeout(() => void pullLibrary(), 1200);

    return () => {
      window.clearTimeout(t);
      window.removeEventListener('ark:creations-changed', syncCreations);
      window.removeEventListener('ark:chats-changed', syncChats);
      window.removeEventListener('focus', syncCreations);
      window.removeEventListener('focus', syncChats);
    };
  }, [refreshCreations, refreshChats]);

  const addRecent = useCallback((name: string) => {
    const project: RecentProject = {
      id: `proj-${crypto.randomUUID().slice(0, 8)}`,
      name: name.trim() || 'New Project',
      kind: 'project',
    };
    setRecent(prev => {
      const next = [project, ...prev.filter(p => p.name.toLowerCase() !== project.name.toLowerCase())].slice(0, 30);
      saveRecentProjects(next);
      return next;
    });
    return project;
  }, []);

  const addCreation = useCallback((entry: RecentCreation) => {
    upsertCreation(entry);
    setCreations(loadRecentCreations());
  }, []);

  const addChat = useCallback((entry: RecentChat) => {
    // Keep archived status if re-upserting the same id without clearing it.
    const prev = loadRecentChats().find(c => c.id === entry.id);
    upsertRecentChat({
      ...entry,
      archivedAt: entry.archivedAt ?? prev?.archivedAt,
    });
    setChats(loadRecentChats());
  }, []);

  const archiveChat = useCallback((chatId: string) => {
    archiveRecentChat(chatId);
    setChats(loadRecentChats());
  }, []);

  const deleteChatForever = useCallback((chatId: string) => {
    deleteRecentChatPermanently(chatId);
    setChats(loadRecentChats());
    setCreations(loadRecentCreations());
  }, []);

  return (
    <RecentProjectsContext.Provider
      value={{
        recent,
        creations,
        chats,
        activeChats,
        addRecent,
        addCreation,
        addChat,
        archiveChat,
        deleteChatForever,
        refreshCreations,
        refreshChats,
      }}
    >
      {children}
    </RecentProjectsContext.Provider>
  );
}

export function useRecentProjects() {
  const ctx = useContext(RecentProjectsContext);
  if (!ctx) throw new Error('useRecentProjects must be used within RecentProjectsProvider');
  return ctx;
}

export function projectNameFromPrompt(prompt: string): string {
  const cleaned = prompt.trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'New Project';
  if (cleaned.length <= 32) return cleaned;
  return `${cleaned.slice(0, 28).trim()}…`;
}

export type { RecentChat, RecentCreation, RecentProject };
