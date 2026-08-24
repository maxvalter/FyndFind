import type { StoreSelection } from "./types";

interface CacheEntry {
  deals: import("./types").Deal[];
  statuses: import("./types").ChainStatus[];
  fetchedAt: string;
  expiresAt: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

export function selectionCacheKey(selection: StoreSelection): string {
  return JSON.stringify({
    willys: selection.willys ?? "",
    hemkop: selection.hemkop ?? "",
    ica: selection.ica ?? "",
    coop: selection.coop ?? "",
    lidl: selection.lidl ?? "",
  });
}

export function getCachedDeals(key: string): CacheEntry | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry;
}

export function setCachedDeals(
  key: string,
  payload: Omit<CacheEntry, "expiresAt">,
): void {
  cache.set(key, {
    ...payload,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

export function clearDealsCache(): void {
  cache.clear();
}
