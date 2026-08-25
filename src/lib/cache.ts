import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ChainId, ChainStatus, Deal } from "./types";

export const DEALS_TTL_MS = 6 * 60 * 60 * 1000;
export const MAX_STORES_PER_CHAIN = 12;
const KV_TTL_SECONDS = 14 * 24 * 60 * 60;
const INDEX_KEY = "deals:index";
const DATA_DIR = path.join(process.cwd(), ".data", "deals");

export interface StoreCacheEntry {
  chain: ChainId;
  storeId: string;
  deals: Deal[];
  status: ChainStatus;
  fetchedAt: string;
  expiresAt: number;
}

interface StoreIndexEntry {
  chain: ChainId;
  storeId: string;
  lastAccessAt: string;
}

interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, expirationTtl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

const memory = new Map<string, { value: string; expiresAt?: number }>();
let backendPromise: Promise<KvLike> | null = null;
let indexLock: Promise<void> = Promise.resolve();

export function storeCacheKey(chain: ChainId, storeId: string): string {
  return `deals:${chain}:${storeId}`;
}

export function isFresh(entry: StoreCacheEntry): boolean {
  return Date.now() < entry.expiresAt;
}

export async function getCachedStore(
  chain: ChainId,
  storeId: string,
): Promise<StoreCacheEntry | null> {
  const raw = await (await getBackend()).get(storeCacheKey(chain, storeId));
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as StoreCacheEntry;
    if (!entry?.deals || !entry.status) return null;
    return entry;
  } catch {
    return null;
  }
}

export async function setCachedStore(entry: StoreCacheEntry): Promise<void> {
  const kv = await getBackend();
  await kv.put(storeCacheKey(entry.chain, entry.storeId), JSON.stringify(entry), KV_TTL_SECONDS);
  await touchStoreIndex(entry.chain, entry.storeId);
}

export async function cacheGet(key: string): Promise<string | null> {
  return (await getBackend()).get(key);
}

export async function cacheSet(key: string, value: string, ttlSeconds = KV_TTL_SECONDS): Promise<void> {
  await (await getBackend()).put(key, value, ttlSeconds);
}

export async function listKnownStores(): Promise<StoreIndexEntry[]> {
  const kv = await getBackend();
  const raw = await kv.get(INDEX_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as StoreIndexEntry[];
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* fall through */
    }
  }

  const keys = await kv.list("deals:");
  return keys
    .filter((key) => key !== INDEX_KEY)
    .map((key) => {
      const [, chain, ...rest] = key.split(":");
      return {
        chain: chain as ChainId,
        storeId: rest.join(":"),
        lastAccessAt: new Date().toISOString(),
      };
    })
    .filter((entry) => entry.chain && entry.storeId);
}

async function touchStoreIndex(chain: ChainId, storeId: string): Promise<void> {
  const run = indexLock.then(async () => {
    const kv = await getBackend();
    const current = await listKnownStores();
    const lastAccessAt = new Date().toISOString();
    const next = current.filter((entry) => !(entry.chain === chain && entry.storeId === storeId));
    next.push({ chain, storeId, lastAccessAt });

    const { kept, evicted } = evictOldestPerChain(next);
    await kv.put(INDEX_KEY, JSON.stringify(kept), KV_TTL_SECONDS);
    await Promise.all(evicted.map((entry) => kv.delete(storeCacheKey(entry.chain, entry.storeId))));
  });
  indexLock = run.then(
    () => undefined,
    () => undefined,
  );
  await run;
}

function evictOldestPerChain(entries: StoreIndexEntry[]): {
  kept: StoreIndexEntry[];
  evicted: StoreIndexEntry[];
} {
  const kept: StoreIndexEntry[] = [];
  const evicted: StoreIndexEntry[] = [];
  const byChain = new Map<ChainId, StoreIndexEntry[]>();

  for (const entry of entries) {
    const list = byChain.get(entry.chain) ?? [];
    list.push(entry);
    byChain.set(entry.chain, list);
  }

  for (const list of byChain.values()) {
    list.sort((a, b) => Date.parse(b.lastAccessAt) - Date.parse(a.lastAccessAt));
    kept.push(...list.slice(0, MAX_STORES_PER_CHAIN));
    evicted.push(...list.slice(MAX_STORES_PER_CHAIN));
  }

  return { kept, evicted };
}

async function getBackend(): Promise<KvLike> {
  backendPromise ??= resolveBackend();
  return backendPromise;
}

async function resolveBackend(): Promise<KvLike> {
  const binding = getCloudflareKvBinding();
  if (binding) return cloudflareBackend(binding);
  try {
    await mkdir(DATA_DIR, { recursive: true });
    return fileBackend();
  } catch {
    return memoryBackend();
  }
}

interface CloudflareKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ keys: { name: string }[] }>;
}

function getCloudflareKvBinding(): CloudflareKv | null {
  const fromGlobal = (globalThis as { DEALS_KV?: CloudflareKv }).DEALS_KV;
  if (fromGlobal) return fromGlobal;
  const env = (process.env as { DEALS_KV?: CloudflareKv }).DEALS_KV;
  return env ?? null;
}

function cloudflareBackend(kv: CloudflareKv): KvLike {
  return {
    get: (key) => kv.get(key),
    put: (key, value, expirationTtl) => kv.put(key, value, expirationTtl ? { expirationTtl } : undefined),
    delete: (key) => kv.delete(key),
    list: async (prefix) => {
      const listed = await kv.list({ prefix });
      return listed.keys.map((entry) => entry.name);
    },
  };
}

function fileBackend(): KvLike {
  const fileFor = (key: string) => path.join(DATA_DIR, `${safeFileStem(key)}.json`);
  const legacyFileFor = (key: string) =>
    path.join(DATA_DIR, `${key.replace(/[^a-zA-Z0-9._:-]/g, "_")}.json`);

  return {
    async get(key) {
      try {
        const raw = await readFile(fileFor(key), "utf8").catch(() => readFile(legacyFileFor(key), "utf8"));
        const parsed = JSON.parse(raw) as { value: string; expiresAt?: number };
        if (parsed.expiresAt && Date.now() > parsed.expiresAt) return null;
        return parsed.value;
      } catch {
        return memory.get(key)?.value ?? null;
      }
    },
    async put(key, value, expirationTtl) {
      const expiresAt = expirationTtl ? Date.now() + expirationTtl * 1000 : undefined;
      memory.set(key, { value, expiresAt });
      await mkdir(DATA_DIR, { recursive: true });
      await writeFile(fileFor(key), JSON.stringify({ value, expiresAt }), "utf8");
    },
    async delete(key) {
      memory.delete(key);
      await unlink(fileFor(key)).catch(() => undefined);
      await unlink(legacyFileFor(key)).catch(() => undefined);
    },
    async list(prefix) {
      try {
        const files = await readdir(DATA_DIR);
        return files
          .filter((name) => name.endsWith(".json"))
          .map((name) => {
            const stem = name.slice(0, -5);
            try {
              return decodeURIComponent(stem);
            } catch {
              return stem.replace(/__slash__/g, "/");
            }
          })
          .filter((key) => key.startsWith(prefix));
      } catch {
        return [...memory.keys()].filter((key) => key.startsWith(prefix));
      }
    },
  };
}

/** macOS/APFS file names max out at 255 bytes; encodeURIComponent can blow past that. */
function safeFileStem(key: string): string {
  const encoded = encodeURIComponent(key);
  if (encoded.length <= 180) return encoded;
  return `h-${createHash("sha256").update(key).digest("hex")}`;
}

function memoryBackend(): KvLike {
  return {
    async get(key) {
      const entry = memory.get(key);
      if (!entry) return null;
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        memory.delete(key);
        return null;
      }
      return entry.value;
    },
    async put(key, value, expirationTtl) {
      memory.set(key, {
        value,
        expiresAt: expirationTtl ? Date.now() + expirationTtl * 1000 : undefined,
      });
    },
    async delete(key) {
      memory.delete(key);
    },
    async list(prefix) {
      return [...memory.keys()].filter((key) => key.startsWith(prefix));
    },
  };
}
