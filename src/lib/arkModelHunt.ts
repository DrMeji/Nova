/**
 * Hunt GGUF brains from more than one file host.
 * ARK Engine remains the runtime. this only finds and downloads weights.
 */

import { getHardwareClass, parseRamGb, type HardwareInfo } from '@/lib/api';
import { getLocalPrefs, getProviderApiKeys } from '@/lib/localPrefs';
import { loadSavedSpeed } from '@/lib/speedTest';

export type HuntSource = 'huggingface' | 'modelscope';

export type HuntedModel = {
  id: string;
  name: string;
  repo: string;
  url: string;
  sizeGb: number;
  category: 'coding' | 'chat';
  detail: string;
  source: HuntSource;
  downloads?: number;
};

const CACHE_KEY = 'ark:model-hunt-cache-v2';
const CACHE_MS = 6 * 60 * 60 * 1000;

const QUANT_PREF = [/q4_k_m/i, /q4_k_s/i, /q5_k_m/i, /iq4_xs/i, /q4_0/i, /q5_0/i];

/** Skip Hub hits that are already the pinned ARK Engine catalog. */
const KNOWN_CATALOG = [
  'qwen2.5-1.5b-instruct',
  'llama-3.2-3b-instruct',
  'qwen2.5-coder-7b-instruct',
  'qwen2.5-coder-14b-instruct',
  'qwen2.5-coder-32b-instruct',
  'deepseek-coder-v2-lite-instruct',
  'starcoder2-7b',
  'qwen2.5-7b-instruct',
  'meta-llama-3.1-8b-instruct',
  'mistral-7b-instruct-v0.3',
  'gemma-2-2b-it',
  'phi-3-mini-4k-instruct',
  'deepseek-r1-distill-llama-8b',
];

const SEARCHES = [
  'Qwen3-Coder-GGUF',
  'Qwen2.5-Coder-GGUF',
  'DeepSeek-Coder-V2-GGUF',
  'StarCoder2-GGUF',
  'code instruct GGUF',
];

const MS_SEEDS = [
  'Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF',
  'Qwen/Qwen2.5-Coder-3B-Instruct-GGUF',
  'Qwen/Qwen2.5-3B-Instruct-GGUF',
  'Qwen/Qwen3-1.7B-GGUF',
  'Qwen/Qwen3-4B-GGUF',
  'Qwen/Qwen2.5-Coder-7B-Instruct-GGUF',
];

export function huntSourceLabel(source?: HuntSource) {
  return source === 'modelscope' ? 'ModelScope' : 'Hugging Face';
}

export function huntSourceBadge(source?: HuntSource) {
  return source === 'modelscope' ? 'MS' : 'HF';
}

function slugId(repo: string, file: string) {
  const base = `${repo}-${file}`
    .toLowerCase()
    .replace(/\.gguf$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 56);
  return `hunt-${base}`;
}

function maxSizeGb(hw: HardwareInfo) {
  const ram = parseRamGb(hw);
  const pc = getHardwareClass(hw);
  if (pc === 'light' || ram < 10) return Math.min(3.6, Math.max(1.2, ram * 0.28));
  if (pc === 'standard' || ram < 20) return Math.min(9.5, ram * 0.42);
  return Math.min(20, ram * 0.5);
}

function fits(sizeGb: number, hw: HardwareInfo) {
  const ram = parseRamGb(hw);
  if (sizeGb > maxSizeGb(hw)) return false;
  return ram >= sizeGb * 1.35 + 4 || sizeGb < 2;
}

function isKnownCatalog(repo: string, file: string) {
  const blob = `${repo} ${file}`.toLowerCase();
  return KNOWN_CATALOG.some(k => blob.includes(k));
}

function hfHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = getProviderApiKeys().huggingface || getProviderApiKeys()['huggingface-inference'];
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function jsonGet(url: string, headers?: Record<string, string>): Promise<unknown> {
  const merged = { Accept: 'application/json', ...headers };
  if (window.arkDesktop?.httpGet) {
    const res = await window.arkDesktop.httpGet(url, merged);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.data;
  }
  const res = await fetch(url, { headers: merged });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function jsonRequest(url: string, method: string, body?: unknown): Promise<unknown> {
  if (window.arkDesktop?.httpRequest) {
    const res = await window.arkDesktop.httpRequest(url, {
      method,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body == null ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.data;
  }
  const res = await fetch(url, {
    method,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body == null ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function hfApi(path: string): Promise<unknown> {
  const bases = ['https://huggingface.co', 'https://hf-mirror.com'];
  let lastErr: Error | null = null;
  for (const base of bases) {
    try {
      return await jsonGet(`${base}${path}`, hfHeaders());
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastErr || new Error('Hugging Face API failed');
}

function pickGgufFile(
  siblings: { rfilename?: string; size?: number }[] | undefined,
  capBytes: number,
): { file: string; bytes: number } | null {
  const files = (siblings || [])
    .filter(s => /\.gguf$/i.test(s.rfilename || '') && !/mmproj|encoder|vision/i.test(s.rfilename || ''))
    .filter(s => !/\d+-of-\d+/i.test(s.rfilename || ''))
    .map(s => ({ file: String(s.rfilename), bytes: Number(s.size) || 0 }))
    .filter(s => s.bytes > 50 * 1024 * 1024 && s.bytes <= capBytes);
  if (!files.length) return null;
  for (const re of QUANT_PREF) {
    const hit = files.find(f => re.test(f.file));
    if (hit) return hit;
  }
  return files.sort((a, b) => a.bytes - b.bytes)[0] || null;
}

function isCodingRepo(repo: string, tags: string[]) {
  const blob = `${repo} ${tags.join(' ')}`.toLowerCase();
  return /coder|coding|code-|starcoder|codellama|codestral|devstral|deepseek-coder/.test(blob);
}

function resolveHfUrl(repo: string, file: string) {
  const encoded = file.split('/').map(encodeURIComponent).join('/');
  const host = loadSavedSpeed()?.preferredHost === 'hf-mirror'
    ? 'https://hf-mirror.com'
    : 'https://huggingface.co';
  return `${host}/${repo}/resolve/main/${encoded}`;
}

function resolveMsUrl(repo: string, file: string) {
  const encoded = file.split('/').map(encodeURIComponent).join('/');
  return `https://www.modelscope.cn/models/${repo}/resolve/master/${encoded}`;
}

function toHunted(
  repo: string,
  file: { file: string; bytes: number },
  tags: string[],
  downloads: number,
  source: HuntSource,
): HuntedModel | null {
  if (isKnownCatalog(repo, file.file)) return null;
  const sizeGb = Math.round((file.bytes / 1024 ** 3) * 10) / 10;
  const category = isCodingRepo(repo, tags) ? 'coding' : 'chat';
  const label = huntSourceLabel(source);
  return {
    id: slugId(repo, file.file),
    name: repo.split('/')[1] || repo,
    repo,
    url: source === 'modelscope' ? resolveMsUrl(repo, file.file) : resolveHfUrl(repo, file.file),
    sizeGb,
    category,
    downloads,
    source,
    detail: `${category === 'coding' ? 'Coding' : 'Chat'} · ${sizeGb} GB · ${label} · ${repo}`,
  };
}

export function loadHuntCache(): { at: number; models: HuntedModel[] } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number; models?: HuntedModel[] };
    if (!parsed.at || !Array.isArray(parsed.models)) return null;
    if (Date.now() - parsed.at > CACHE_MS) return null;
    return { at: parsed.at, models: parsed.models };
  } catch {
    return null;
  }
}

function saveHuntCache(models: HuntedModel[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), models }));
  } catch {
    /* ignore */
  }
}

async function huntHuggingFace(hw: HardwareInfo, capBytes: number): Promise<HuntedModel[]> {
  const rows: Record<string, {
    id: string;
    tags: string[];
    downloads: number;
    siblings?: { rfilename?: string; size?: number }[];
  }> = {};

  for (const q of SEARCHES) {
    try {
      const data = await hfApi(
        `/api/models?search=${encodeURIComponent(q)}&filter=gguf&sort=downloads&direction=-1&limit=10`,
      );
      const list = Array.isArray(data) ? data : [];
      for (const row of list) {
        const id = String(row.id || row.modelId || '');
        if (!id || row.gated === true || row.private === true) continue;
        if (!rows[id]) {
          rows[id] = {
            id,
            tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
            downloads: Number(row.downloads) || 0,
            siblings: Array.isArray(row.siblings) ? row.siblings : undefined,
          };
        }
      }
    } catch {
      /* try next query */
    }
  }

  const ranked = Object.values(rows).sort((a, b) => b.downloads - a.downloads).slice(0, 18);
  const details: Array<typeof ranked[number] | null> = [];
  for (let i = 0; i < ranked.length; i += 4) {
    const chunk = await Promise.all(ranked.slice(i, i + 4).map(async (row) => {
      if (row.siblings?.length) return row;
      try {
        const detail = await hfApi(`/api/models/${row.id}`) as {
          siblings?: { rfilename?: string; size?: number }[];
          gated?: boolean;
        };
        if (detail.gated) return null;
        return { ...row, siblings: detail.siblings };
      } catch {
        return null;
      }
    }));
    details.push(...chunk);
  }

  const found: HuntedModel[] = [];
  for (const row of details) {
    if (!row) continue;
    const file = pickGgufFile(row.siblings, capBytes);
    if (!file) continue;
    const hit = toHunted(row.id, file, row.tags, row.downloads, 'huggingface');
    if (!hit || !fits(hit.sizeGb, hw)) continue;
    found.push(hit);
    if (found.length >= 8) break;
  }
  return found;
}

function msModelId(row: Record<string, unknown>) {
  const path = String(row.Path || row.path || '');
  const name = String(row.Name || row.name || row.ChineseName || '');
  if (path && name) return `${path}/${name}`;
  return String(row.Id || row.id || row.modelId || '');
}

async function huntModelScopeIds(): Promise<string[]> {
  const ids = new Set<string>(MS_SEEDS);
  for (const q of ['GGUF coder', 'Qwen3-Coder GGUF', 'Qwen2.5-Coder GGUF']) {
    try {
      const data = await jsonRequest('https://www.modelscope.cn/api/v1/dolphin/models', 'PUT', {
        PageSize: 12,
        PageNumber: 1,
        SortBy: 'DownloadCount',
        Target: '',
        Name: q,
        SingleCriterion: [],
      }) as { Data?: { Model?: { Models?: Record<string, unknown>[] }; Models?: Record<string, unknown>[] } };
      const list = data?.Data?.Model?.Models || data?.Data?.Models || [];
      for (const row of list) {
        const id = msModelId(row);
        if (id.includes('/')) ids.add(id);
      }
    } catch {
      /* try GET name search */
      try {
        const data = await jsonGet(
          `https://www.modelscope.cn/api/v1/models?Name=${encodeURIComponent(q)}&PageSize=8&PageNumber=1`,
        ) as { Data?: { Models?: Record<string, unknown>[] } | Record<string, unknown>[] };
        const list = Array.isArray(data?.Data) ? data.Data : data?.Data?.Models || [];
        for (const row of list) {
          const id = msModelId(row);
          if (id.includes('/')) ids.add(id);
        }
      } catch {
        /* keep seeds */
      }
    }
  }
  return [...ids];
}

async function huntModelScope(hw: HardwareInfo, capBytes: number): Promise<HuntedModel[]> {
  const ids = await huntModelScopeIds();
  const found: HuntedModel[] = [];
  for (let i = 0; i < ids.length && found.length < 8; i += 3) {
    const chunk = ids.slice(i, i + 3);
    const rows = await Promise.all(chunk.map(async (id) => {
      try {
        const data = await jsonGet(
          `https://www.modelscope.cn/api/v1/models/${id}/repo/files?Revision=master&Recursive=1`,
        ) as {
          Data?: { Files?: { Name?: string; Path?: string; Size?: number; Type?: string }[] };
        };
        const files = (data?.Data?.Files || [])
          .filter(f => f.Type !== 'tree')
          .map(f => ({ rfilename: f.Path || f.Name, size: f.Size }));
        const file = pickGgufFile(files, capBytes);
        if (!file) return null;
        return toHunted(id, file, [id], 0, 'modelscope');
      } catch {
        return null;
      }
    }));
    for (const hit of rows) {
      if (!hit || !fits(hit.sizeGb, hw)) continue;
      found.push(hit);
      if (found.length >= 8) break;
    }
  }
  return found;
}

function dedupe(models: HuntedModel[]) {
  const seen = new Set<string>();
  const out: HuntedModel[] = [];
  for (const row of models) {
    const key = row.name.toLowerCase().replace(/-gguf$/i, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export async function huntModelsForPc(hw: HardwareInfo, opts?: { force?: boolean }): Promise<HuntedModel[]> {
  if (!getLocalPrefs().huntInternetModels && !opts?.force) {
    return loadHuntCache()?.models || [];
  }
  if (!opts?.force) {
    const cached = loadHuntCache();
    if (cached?.models.length) return cached.models.filter(m => fits(m.sizeGb, hw));
  }

  const capBytes = maxSizeGb(hw) * 1024 ** 3;
  const [hf, ms] = await Promise.all([
    huntHuggingFace(hw, capBytes).catch(() => [] as HuntedModel[]),
    huntModelScope(hw, capBytes).catch(() => [] as HuntedModel[]),
  ]);

  const preferred = loadSavedSpeed()?.preferredHost;
  const merged = dedupe(preferred === 'modelscope' ? [...ms, ...hf] : [...hf, ...ms])
    .filter(m => fits(m.sizeGb, hw))
    .slice(0, 10);

  saveHuntCache(merged);
  return merged;
}

export function bestCodingHunt(models: HuntedModel[]) {
  return models.filter(m => m.category === 'coding').sort((a, b) => b.sizeGb - a.sizeGb)[0]
    || models.sort((a, b) => b.sizeGb - a.sizeGb)[0]
    || null;
}

export function looksLikeCoderId(id: string) {
  return /coder|starcoder|codestral|codellama|devstral|deepseek-coder/i.test(id);
}
