/**
 * Invent Acc: registry of every Missing-item UI home (where the control lives in Nova).
 * Attached on invent so projects know which shell surfaces were placed.
 */
import { MISSING_ITEMS, MISSING_HOME_LABEL } from '@/lib/missingItemsCatalog';

export function inventUiHomesPlacedFiles(brand: string): Record<string, string> {
  const b = String(brand || 'App').trim() || 'App';
  const placedAt = new Date().toISOString();
  const byHome: Record<string, Array<{ id: string; title: string; critical: boolean }>> = {};
  for (const item of MISSING_ITEMS) {
    const key = item.eventualHome;
    if (!byHome[key]) byHome[key] = [];
    byHome[key]!.push({ id: item.id, title: item.title, critical: item.critical });
  }
  return {
    '.nova/ui-homes-placed.json': `${JSON.stringify({
      version: 1,
      brand: b,
      placedAt,
      count: MISSING_ITEMS.length,
      note: 'Every Missing-item control has a real Nova home (Agents / Automations / Integrations / Settings / Studio / Help / Code). Toggles opt-in per PC.',
      homes: Object.fromEntries(
        Object.entries(byHome).map(([home, items]) => [
          home,
          { label: MISSING_HOME_LABEL[home as keyof typeof MISSING_HOME_LABEL] || home, items },
        ]),
      ),
    }, null, 2)}\n`,
    '.nova/ui-homes-placed.md': `# UI homes placed — ${b}

${MISSING_ITEMS.length} controls mapped to shell homes.

| Home | Count |
|------|------:|
${Object.entries(byHome)
  .map(([h, items]) => `| ${MISSING_HOME_LABEL[h as keyof typeof MISSING_HOME_LABEL] || h} | ${items.length} |`)
  .join('\n')}

Turn a switch on in its home only when you need that surface. Invent/coding works with them Off.
`,
  };
}

export function attachHomesPackFiles(
  files: Record<string, string>,
  opts: { brand: string },
): Record<string, string> {
  return { ...files, ...inventUiHomesPlacedFiles(opts.brand) };
}
