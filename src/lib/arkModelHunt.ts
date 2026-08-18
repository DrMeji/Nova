/**
 * Hunt Hugging Face for GGUF brains that fit this PC.
 * ARK Engine remains the runtime — this only finds and downloads weights.
 */

import { getHardwareClass, parseRamGb, type HardwareInfo } from '@/lib/api';
import { getLocalPrefs, getProviderApiKeys } from '@/lib/localPrefs';

export type HuntedModel = {
  id: string;
  name: string;
  repo: string;
  url: string;
  sizeGb: number;
  category: 'coding' | 'chat';
  detail: string;
  downloads?: number;
};

const CACHE_KEY = 'ark:model-hunt-cache';
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

async function hfGet(url: string): Promise<unknown> {
  if (window.arkDesktop?.httpGet) {
    const res = await window.arkDesktop.httpGet(url, hfHeaders());
    if (!res.ok) throw new Error(`Hugging Face ${res.status}`);
    return res.data;
  }
  const res = await fetch(url, { headers: hfHeaders() });
  if (!res.ok) throw new Error(`Hugging Face ${res.status}`);
  return res.json();
}

function pickGgufFile(
  siblings: { rfilename?: string; size?: number }[] | undefined,
  capBytes: number,
): { file: string; bytes: number } | null {
  const files = (siblings || [])
    .filter(s => /\.gguf$/i.test(s.rfilename || '') && !/mmproj|encoder|vision/i.test(s.rfilename || ''))
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

function resolveUrl(repo: string, file: string) {
  const encoded = file.split('/').map(encodeURIComponent).join('/');
  return `https://huggingface.co/${repo}/resolve/main/${encoded}`;
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

export async function huntModelsForPc(hw: HardwareInfo, opts?: { force?: boolean }): Promise<HuntedModel[]> {
  if (!getLocalPrefs().huntInternetModels && !opts?.force) {
    return loadHuntCache()?.models || [];
  }
  if (!opts?.force) {
    const cached = loadHuntCache();
    if (cached?.models.length) return cached.models.filter(m => fits(m.sizeGb, hw));
  }

  const capGb = maxSizeGb(hw);
  const capBytes = capGb * 1024 ** 3;
  const rows: Record<string, {
    id: string;
    tags: string[];
    downloads: number;
    siblings?: { rfilename?: string; size?: number }[];
  }> = {};

  for (const q of SEARCHES) {
    const url = `https://huggingface.co/api/models?search=${encodeURIComponent(q)}&filter=gguf&sort=downloads&direction=-1&limit=10`;
    try {
      const data = await hfGet(url);
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
        const detail = await hfGet(`https://huggingface.co/api/models/${row.id}`) as {
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
    if (isKnownCatalog(row.id, file.file)) continue;
    const sizeGb = Math.round((file.bytes / 1024 ** 3) * 10) / 10;
    if (!fits(sizeGb, hw)) continue;
    const category = isCodingRepo(row.id, row.tags) ? 'coding' : 'chat';
    found.push({
      id: slugId(row.id, file.file),
      name: row.id.split('/')[1] || row.id,
      repo: row.id,
      url: resolveUrl(row.id, file.file),
      sizeGb,
      category,
      downloads: row.downloads,
      detail: `${category === 'coding' ? 'Coding' : 'Chat'} · ${sizeGb} GB · ${row.id}`,
    });
    if (found.length >= 8) break;
  }

  const fitted = found.filter(m => fits(m.sizeGb, hw));
  saveHuntCache(fitted);
  return fitted;
}

export function bestCodingHunt(models: HuntedModel[]) {
  return models.filter(m => m.category === 'coding').sort((a, b) => b.sizeGb - a.sizeGb)[0]
    || models.sort((a, b) => b.sizeGb - a.sizeGb)[0]
    || null;
}

export function looksLikeCoderId(id: string) {
  return /coder|starcoder|codestral|codellama|devstral|deepseek-coder/i.test(id);
}
