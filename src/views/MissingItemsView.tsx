/**
 * Staging parking lot — every missing button/setting/panel lives here first.
 * Mirror of Notifications: full-page from sidebar. Mark “Placed” when moved home.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Check, ClipboardList, Filter, Search, PackageOpen,
} from 'lucide-react';
import {
  MISSING_HOME_LABEL,
  MISSING_ITEMS,
  DISCOVERED_MISSING_TOTAL,
  countMissingOpen,
  loadMissingPlaced,
  saveMissingPlaced,
  type MissingHome,
  type MissingItem,
} from '@/lib/missingItemsCatalog';

type FilterMode = 'open' | 'placed' | 'all' | 'critical';

export function MissingItemsView() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('open');
  const [placed, setPlaced] = useState<Set<string>>(() => loadMissingPlaced());
  const [homeFilter, setHomeFilter] = useState<MissingHome | 'all'>('all');

  useEffect(() => {
    const bump = () => setPlaced(loadMissingPlaced());
    window.addEventListener('NOVA:missing-items-changed', bump);
    return () => window.removeEventListener('NOVA:missing-items-changed', bump);
  }, []);

  const openCount = useMemo(() => countMissingOpen(), [placed]);
  const criticalOpen = useMemo(
    () => MISSING_ITEMS.filter((i) => i.critical && !placed.has(i.id)).length,
    [placed],
  );

  const homes = useMemo(() => {
    const set = new Set<MissingHome>();
    for (const i of MISSING_ITEMS) set.add(i.eventualHome);
    return [...set];
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MISSING_ITEMS.filter((item) => {
      const isPlaced = placed.has(item.id);
      if (filter === 'open' && isPlaced) return false;
      if (filter === 'placed' && !isPlaced) return false;
      if (filter === 'critical' && (!item.critical || isPlaced)) return false;
      if (homeFilter !== 'all' && item.eventualHome !== homeFilter) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q)
        || item.why.toLowerCase().includes(q)
        || item.homeLabel.toLowerCase().includes(q)
        || item.id.includes(q)
      );
    });
  }, [query, filter, homeFilter, placed]);

  const grouped = useMemo(() => {
    const map = new Map<MissingHome, MissingItem[]>();
    for (const item of visible) {
      const list = map.get(item.eventualHome) || [];
      list.push(item);
      map.set(item.eventualHome, list);
    }
    return [...map.entries()];
  }, [visible]);

  function togglePlaced(id: string) {
    const next = new Set(placed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPlaced(next);
    saveMissingPlaced(next);
  }

  return (
    <div className="h-full min-h-0 flex flex-col bg-surface-base text-content-primary">
      <header className="shrink-0 border-b border-stroke-subtle px-6 py-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-amber-200/90 mb-1">
              <PackageOpen className="w-5 h-5" />
              <span className="text-xs font-semibold uppercase tracking-[0.14em]">Staging</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Missing items</h1>
            <p className="mt-1 text-sm text-content-secondary max-w-2xl">
              This screen shows a <span className="text-content-primary">UI slice</span> only
              (not the full research archive). Deep research keeps piling into the archive even
              when Still open looks “full” at the slice cap. Homes are mounted
              (Agents, Automations, Integrations, Settings, Studio +, Code, Help).
              Items auto-mark <span className="text-content-primary">Placed</span> when routed home.
            </p>
          </div>
          <div className="flex gap-3 shrink-0 flex-wrap justify-end">
            <StatChip label="Still open (this list)" value={String(openCount)} danger />
            <StatChip label="Critical (this list)" value={String(criticalOpen)} danger={criticalOpen > 0} />
            <StatChip label="Shown in UI" value={String(MISSING_ITEMS.length)} />
            <StatChip
              label="Full archive"
              value={Number(DISCOVERED_MISSING_TOTAL || 0).toLocaleString()}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search missing UI…"
              className="w-full rounded-lg border border-stroke-subtle bg-surface-raised pl-8 pr-3 py-2 text-sm outline-none focus:border-amber-400/40"
            />
          </label>
          {([
            ['open', 'Open'],
            ['critical', 'Critical'],
            ['placed', 'Placed'],
            ['all', 'All'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                filter === id
                  ? 'border-amber-400/40 bg-amber-400/10 text-amber-100'
                  : 'border-stroke-subtle text-content-secondary hover:text-content-primary'
              }`}
            >
              {label}
            </button>
          ))}
          <label className="flex items-center gap-1.5 text-xs text-content-secondary ml-1">
            <Filter className="w-3.5 h-3.5" />
            <select
              value={homeFilter}
              onChange={(e) => setHomeFilter(e.target.value as MissingHome | 'all')}
              className="rounded-md border border-stroke-subtle bg-surface-raised px-2 py-1.5 text-xs outline-none"
            >
              <option value="all">All homes</option>
              {homes.map((h) => (
                <option key={h} value={h}>{MISSING_HOME_LABEL[h]}</option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-8">
        {grouped.length === 0 ? (
          <div className="rounded-xl border border-stroke-subtle bg-surface-raised/60 px-6 py-12 text-center">
            <Check className="w-8 h-8 mx-auto text-emerald-400 mb-3" />
            <p className="text-sm text-content-secondary">
              {filter === 'open' || filter === 'critical'
                ? 'Nothing open in this filter — mark items Placed as you relocate them, or switch to All.'
                : 'No matches.'}
            </p>
          </div>
        ) : (
          grouped.map(([home, items]) => (
            <section key={home}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-content-muted mb-3 flex items-center gap-2">
                <ClipboardList className="w-3.5 h-3.5" />
                Eventually → {MISSING_HOME_LABEL[home]}
                <span className="text-content-muted/70 normal-case tracking-normal font-normal">
                  ({items.length})
                </span>
              </h2>
              <ul className="space-y-2">
                {items.map((item) => {
                  const isPlaced = placed.has(item.id);
                  return (
                    <li
                      key={item.id}
                      className={`rounded-xl border px-4 py-3 flex gap-3 items-start ${
                        isPlaced
                          ? 'border-stroke-subtle/60 bg-surface-raised/40 opacity-70'
                          : 'border-amber-400/20 bg-amber-400/[0.04]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => togglePlaced(item.id)}
                        className={`mt-0.5 shrink-0 w-5 h-5 rounded border flex items-center justify-center ${
                          isPlaced
                            ? 'border-emerald-400/50 bg-emerald-400/20 text-emerald-300'
                            : 'border-stroke-strong hover:border-amber-300/50'
                        }`}
                        title={isPlaced ? 'Mark still missing' : 'Mark placed in real home'}
                        aria-label={isPlaced ? 'Mark still missing' : 'Mark placed'}
                      >
                        {isPlaced ? <Check className="w-3 h-3" /> : null}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-medium text-content-primary">{item.title}</h3>
                          {item.critical ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-rose-300/90">
                              <AlertTriangle className="w-3 h-3" /> Critical
                            </span>
                          ) : null}
                          {item.diskFilesOnly ? (
                            <span className="text-[10px] font-medium uppercase tracking-wide text-sky-300/80">
                              Files on disk · screen control was missing
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-content-secondary leading-relaxed">{item.why}</p>
                        <p className="mt-1.5 text-[11px] text-content-muted">
                          Home: {item.homeLabel}
                          <span className="mx-1.5 opacity-40">·</span>
                          id: {item.id}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function StatChip({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2 min-w-[88px] ${
      danger ? 'border-rose-400/30 bg-rose-400/8' : 'border-stroke-subtle bg-surface-raised/70'
    }`}
    >
      <div className={`text-lg font-semibold tabular-nums ${danger ? 'text-rose-200' : 'text-content-primary'}`}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-content-muted">{label}</div>
    </div>
  );
}
