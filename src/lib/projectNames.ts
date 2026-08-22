/** Shared project / disk target name helpers — keep dependency-free to avoid import cycles. */

const DISK_TARGET_BLOCKLIST = new Set([
  'it',
  'this',
  'that',
  'the',
  'this project',
  'the project',
  'the folder',
  'project folder',
  'projects folder',
  'folder',
  'project',
  'entire',
  'whole',
  'inside',
  'please',
]);

const DISK_TARGET_TAIL_RE =
  /\s+(?:inside(?:\s+the)?|on|in|within|that's|that is|please|can you|go ahead and|go and)\b[\s\S]*$/i;

export function slugifyProjectName(name: string): string {
  const s = String(name || '').trim();
  if (!s) return 'new-project';
  if (/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(s)) return s;
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'new-project';
}

export function nameVariants(name: string): string[] {
  const trimmed = String(name || '').trim();
  if (!trimmed) return [];
  const slug = slugifyProjectName(trimmed);
  const compact = trimmed.replace(/\s+/g, '');
  return [...new Set([trimmed, compact, slug].filter(Boolean))];
}

export function namesRoughlyMatch(a: string, b: string): boolean {
  const variantsA = nameVariants(a).map(v => v.toLowerCase());
  const variantsB = nameVariants(b).map(v => v.toLowerCase());
  return variantsA.some(va => variantsB.some(vb => va === vb || va.includes(vb) || vb.includes(va)));
}

export function isBlockedDiskTargetName(name: string): boolean {
  const n = String(name || '').trim().toLowerCase();
  if (!n || n.length < 2) return true;
  if (DISK_TARGET_BLOCKLIST.has(n)) return true;
  if (/^(this|the|that)\s+(project|folder)$/.test(n)) return true;
  return false;
}

export function cleanDiskTargetName(raw: string): string | null {
  let s = String(raw || '').trim().replace(/[?.!,;:]+$/g, '');
  s = s.replace(DISK_TARGET_TAIL_RE, '').trim();
  s = s.replace(/\s+(?:project|folder|directory)\s*$/i, '').trim();
  if (isBlockedDiskTargetName(s)) return null;
  return s;
}

/** Extract explicit called/named target or a name before "delete it". */
export function extractNamedDiskTarget(text: string): string | null {
  const t = String(text || '').trim();
  const patterns = [
    /\b(?:called|named|name(?:d)?\s+it)\s+["“']([^"”']+)["”']/i,
    /\b(?:file|project|folder)\s+(?:called|named)\s+["“']([^"”']+)["”']/i,
    /\b(?:file|project|folder)\s+(?:called|named)\s+([A-Za-z][A-Za-z0-9 _.-]{1,48})/i,
    /\b(?:called|named)\s+([A-Za-z][A-Za-z0-9 _.-]{1,48})/i,
    /\b([A-Za-z][A-Za-z0-9 _-]{2,48})\b[\s,]+(?:that(?:'s| is)|which is)[\s\S]{0,60}\bdelete\b/i,
    /\b([A-Za-z][A-Za-z0-9 _-]{2,48})\b[\s,]+(?:inside|in)\b[\s\S]{0,60}\bdelete\b/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) {
      const cleaned = cleanDiskTargetName(m[1]);
      if (cleaned) return cleaned;
    }
  }
  return null;
}

export function defaultFileExtension(fileName: string): string {
  const base = String(fileName || '').trim();
  if (!base) return '.txt';
  if (/\.[A-Za-z0-9]{1,12}$/.test(base)) return '';
  if (/\breadme\b/i.test(base)) return '.md';
  return '.txt';
}

export function normalizeDiskFileName(raw: string): string {
  const cleaned = cleanDiskTargetName(raw) || String(raw || '').trim();
  const ext = defaultFileExtension(cleaned);
  return ext && !cleaned.includes('.') ? `${cleaned}${ext}` : cleaned;
}
