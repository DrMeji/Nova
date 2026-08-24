/**
 * Static chat message routing — documents handler priority and powers smoke tests.
 *
 * Priority (highest first):
 *  1. Disk delete / add file
 *  2. PC restore point
 *  3. Greenfield chips (keep planning)
 *  4. Greenfield plan
 *  5. Work on existing folder
 *  6. Folder catalog / PC explore  — blocked by isProjectCreateBrief
 *  7. Create project              — blocked by isProjectCreateBrief upstream
 *  8. PC read file                — AFTER create; blocked by isProjectCreateBrief
 *  9. Folder path open / catalog
 * 10. Agent / LLM fallback
 */

import { classifyDiskIntent } from './chatDiskIntent';
import { looksLikeGreenfieldIdea, looksLikeGreenfieldKeepPlanning } from './chatIdeaIntent';
import { looksLikeRestorePointAsk } from './chatPcTasks';
import { looksLikeFolderCatalogAsk, looksLikeProjectsInventoryAsk, looksLikeStartWorkOnFolderAsk } from './folderCatalog';
import { looksLikePcExploreAsk } from './pcExplore';
import { looksLikeFolderPathAsk, parseFolderPathAsk } from './folderPathAsk';
import { looksLikeCreateProjectBrief, parseNewProjectIntent } from './createProjectIntent';
import { isProjectCreateBrief } from './chatCreateBrief';
import {
  shouldRouteReadFile,
  shouldRouteFolderCatalog,
  shouldRoutePcExplore,
} from './chatRouteGuards';

export type ChatRouteKind =
  | 'disk'
  | 'pc_restore'
  | 'greenfield_chip'
  | 'greenfield_plan'
  | 'work_on_folder'
  | 'folder_catalog'
  | 'pc_explore'
  | 'create_project'
  | 'read_file'
  | 'folder_path'
  | 'general';

export type ChatRouteMatch = {
  route: ChatRouteKind;
  priority: number;
};

const ROUTE_PRIORITY: Record<ChatRouteKind, number> = {
  disk: 100,
  pc_restore: 90,
  greenfield_chip: 80,
  greenfield_plan: 70,
  work_on_folder: 65,
  folder_catalog: 50,
  pc_explore: 45,
  create_project: 60,
  read_file: 20,
  folder_path: 15,
  general: 0,
};

export type ClassifyChatRouteOpts = {
  workspaceEmpty?: boolean;
  recentUserMessages?: string[];
};

/** Returns all matching routes sorted by priority (winner = first). For tests and diagnostics. */
export function classifyChatRoutes(
  text: string,
  opts: ClassifyChatRouteOpts = {},
): ChatRouteMatch[] {
  const t = String(text || '').trim();
  if (!t) return [{ route: 'general', priority: ROUTE_PRIORITY.general }];

  const matches: ChatRouteMatch[] = [];
  const push = (route: ChatRouteKind) => {
    matches.push({ route, priority: ROUTE_PRIORITY[route] });
  };

  const createBrief = isProjectCreateBrief(t);

  const diskIntent = classifyDiskIntent(t, {
    recentUserMessages: opts.recentUserMessages || [],
    pendingAddFile: null,
    stickyDiskTarget: null,
  });
  if (!createBrief && (diskIntent.type === 'delete_file' || diskIntent.type === 'delete_project' || diskIntent.type === 'add_file')) {
    push('disk');
  }

  if (looksLikeRestorePointAsk(t)) push('pc_restore');

  if (
    looksLikeGreenfieldKeepPlanning(t)
    || /\badd\s+more\s+features\s+to\s+the\s+plan\b/i.test(t)
    || /\bexpand\s+the\s+plan\b/i.test(t)
  ) {
    push('greenfield_chip');
  }

  if (looksLikeGreenfieldIdea(t)) push('greenfield_plan');

  if (looksLikeStartWorkOnFolderAsk(t)) push('work_on_folder');

  if (shouldRouteFolderCatalog(t) && (looksLikeFolderCatalogAsk(t) || looksLikeProjectsInventoryAsk(t))) {
    push('folder_catalog');
  }

  if (shouldRoutePcExplore(t) && looksLikePcExploreAsk(t)
    && !looksLikeFolderCatalogAsk(t) && !looksLikeProjectsInventoryAsk(t)) {
    push('pc_explore');
  }

  if (isProjectCreateBrief(t) || parseNewProjectIntent(t) || looksLikeCreateProjectBrief(t)) {
    push('create_project');
  }

  if (shouldRouteReadFile(t)) push('read_file');

  if (opts.workspaceEmpty !== false && parseFolderPathAsk(t) && looksLikeFolderPathAsk(t)) {
    push('folder_path');
  }

  if (!matches.length) push('general');

  return matches.sort((a, b) => b.priority - a.priority);
}

/** Winning route for a message (highest priority match). */
export function winningChatRoute(text: string, opts?: ClassifyChatRouteOpts): ChatRouteKind {
  return classifyChatRoutes(text, opts)[0]?.route ?? 'general';
}

/** True when create/build must beat read-file and catalog routes (smoke-test helper). */
export function createBriefBeatsDiskRoutes(text: string): boolean {
  if (!isProjectCreateBrief(text)) return false;
  const routes = classifyChatRoutes(text);
  const winner = routes[0]?.route;
  return winner === 'create_project' || winner === 'greenfield_plan' || winner === 'greenfield_chip';
}
