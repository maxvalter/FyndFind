import { DEALS_TTL_MS, getCachedStore, isFresh, listKnownStores, setCachedStore } from "./cache";
import { categorizeDeal } from "./categories";
import { scrapeChain } from "./scrapers";
import { DEFAULT_STORES, type ChainId, type ChainStatus, type Deal, type StoreSelection } from "./types";

const CHAINS: ChainId[] = ["willys", "hemkop", "ica", "coop", "lidl"];

export async function getDealsForSelection(
  selection: StoreSelection,
  options?: { refresh?: boolean },
): Promise<{
  deals: Deal[];
  statuses: ChainStatus[];
  fetchedAt: string;
  fromCache: boolean;
}> {
  const merged = { ...DEFAULT_STORES, ...selection };
  const parts = await Promise.all(
    CHAINS.map((chain) => loadChainDeals(chain, merged[chain]!, options?.refresh === true)),
  );

  const deals: Deal[] = [];
  const statuses: ChainStatus[] = [];
  let fetchedAt = "";
  let fromCache = true;

  for (const part of parts) {
    statuses.push(part.status);
    deals.push(...part.deals);
    if (part.fetchedAt > fetchedAt) fetchedAt = part.fetchedAt;
    if (!part.fromCache) fromCache = false;
  }

  for (const deal of deals) {
    deal.category = categorizeDeal(deal.name, deal.rawCategory);
  }

  deals.sort((a, b) => {
    const savingsA = a.savingsPercent ?? 0;
    const savingsB = b.savingsPercent ?? 0;
    if (savingsB !== savingsA) return savingsB - savingsA;
    return a.name.localeCompare(b.name, "sv");
  });

  return {
    deals,
    statuses,
    fetchedAt: fetchedAt || new Date().toISOString(),
    fromCache,
  };
}

export async function refreshStoredDeals(options?: {
  includeDefaults?: boolean;
  force?: boolean;
}): Promise<{ refreshed: number; skipped: number; failed: number }> {
  const known = await listKnownStores();
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const wanted = new Map<string, { chain: ChainId; storeId: string }>();

  for (const entry of known) {
    if (Date.parse(entry.lastAccessAt) >= cutoff) {
      wanted.set(`${entry.chain}:${entry.storeId}`, entry);
    }
  }

  if (options?.includeDefaults !== false) {
    for (const chain of CHAINS) {
      const storeId = DEFAULT_STORES[chain]!;
      wanted.set(`${chain}:${storeId}`, { chain, storeId });
    }
  }

  let refreshed = 0;
  let skipped = 0;
  let failed = 0;

  for (const { chain, storeId } of wanted.values()) {
    if (!options?.force) {
      const cached = await getCachedStore(chain, storeId);
      if (cached && isFresh(cached)) {
        skipped += 1;
        continue;
      }
    }

    const loaded = await scrapeAndStore(chain, storeId);
    if (loaded.status.ok) refreshed += 1;
    else failed += 1;
  }

  return { refreshed, skipped, failed };
}

async function loadChainDeals(
  chain: ChainId,
  storeId: string,
  refresh: boolean,
): Promise<{
  deals: Deal[];
  status: ChainStatus;
  fetchedAt: string;
  fromCache: boolean;
}> {
  if (!refresh) {
    const cached = await getCachedStore(chain, storeId);
    if (cached && isFresh(cached)) {
      return {
        deals: cached.deals,
        status: cached.status,
        fetchedAt: cached.fetchedAt,
        fromCache: true,
      };
    }
  }

  return scrapeAndStore(chain, storeId);
}

async function scrapeAndStore(chain: ChainId, storeId: string) {
  const { result, status } = await scrapeChain(chain, storeId);
  const fetchedAt = new Date().toISOString();
  const deals = result?.deals ?? [];

  if (status.ok) {
    await setCachedStore({
      chain,
      storeId,
      deals,
      status,
      fetchedAt,
      expiresAt: Date.now() + DEALS_TTL_MS,
    });
  }

  return { deals, status, fetchedAt, fromCache: false };
}
