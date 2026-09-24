/**
 * Create craft tool policy — greenfield create must not thrash on .gitignore / lockfiles.
 */

const CREATE_READ_ALLOW =
  /^(?:src\/App\.(?:jsx|tsx)|src\/App\.css|src\/index\.css|src\/main\.(?:jsx|tsx)|index\.html|package\.json|vite\.config\.\w+)$/i;

const CREATE_READ_BAN =
  /(?:^|\/)(?:\.gitignore|\.gitattributes|\.npmrc|\.editorconfig|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|tsconfig[\w.]*\.json|README\.md|LICENSE)$/i;

/** Paths create craft may READ. */
export function isCreateCraftReadablePath(path: string): boolean {
  const p = String(path || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!p) return false;
  if (CREATE_READ_BAN.test(p)) return false;
  if (CREATE_READ_ALLOW.test(p)) return true;
  // Allow other src/* for patches once craft is underway
  if (/^src\/[\w./-]+\.(?:tsx?|jsx?|css)$/i.test(p)) return true;
  return false;
}

/** Paths create craft may WRITE/PATCH. */
export function isCreateCraftWritablePath(path: string): boolean {
  const p = String(path || '').replace(/\\/g, '/').replace(/^\.\//, '');
  return /^src\/[\w./-]+\.(?:tsx?|jsx?|css)$/i.test(p)
    || /^index\.html$/i.test(p)
    || /^public\/[\w./-]+$/i.test(p);
}

export type CreateCraftToolPolicy = {
  /** Restrict list/read/write/patch for greenfield create. */
  createCraftMode?: boolean;
  /** App still thin after this many idle list/read steps → hand off. */
  maxIdleListRead?: number;
  /** App byte floor for “still a stub”. */
  thinAppBytes?: number;
};

export const DEFAULT_CREATE_CRAFT_POLICY: Required<CreateCraftToolPolicy> = {
  createCraftMode: true,
  maxIdleListRead: 2,
  thinAppBytes: 2000,
};
