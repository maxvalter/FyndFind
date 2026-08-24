import type { ChainId, ChainStatus, Deal, ScraperResult, StoreLocation, StoreSelection } from "../types";
import { DEFAULT_STORES } from "../types";
import { findNearestCoopStores, reverseGeocodeCity, scrapeCoop, searchCoopStores } from "./coop";
import { scrapeHemkop, searchHemkopStores } from "./hemkop";
import { scrapeIca, searchIcaStores } from "./ica";
import { scrapeLidl, searchLidlStores } from "./lidl";
import { scrapeWillys, searchWillysStores } from "./willys";
import { nearest, sortByDistance } from "../geo";

type ScraperFn = (storeId: string) => Promise<ScraperResult>;
type SearchFn = (query: string, lat?: number, lng?: number) => Promise<StoreLocation[]>;

const SCRAPERS: Record<ChainId, ScraperFn> = {
  willys: scrapeWillys,
  hemkop: scrapeHemkop,
  ica: scrapeIca,
  coop: scrapeCoop,
  lidl: scrapeLidl,
};

const SEARCH: Record<ChainId, SearchFn> = {
  willys: (q) => searchWillysStores(q),
  hemkop: (q) => searchHemkopStores(q),
  ica: (q) => searchIcaStores(q),
  coop: (q) => searchCoopStores(q),
  lidl: (q, lat, lng) => searchLidlStores(q, lat, lng),
};

export async function scrapeChain(
  chain: ChainId,
  storeId: string,
): Promise<{ result?: ScraperResult; status: ChainStatus }> {
  const started = Date.now();
  try {
    const result = await SCRAPERS[chain](storeId);
    return {
      result,
      status: {
        chain,
        ok: true,
        storeName: result.store.name,
        dealCount: result.deals.length,
        durationMs: Date.now() - started,
      },
    };
  } catch (error) {
    return {
      status: {
        chain,
        ok: false,
        error: error instanceof Error ? error.message : "Okänt fel",
        durationMs: Date.now() - started,
      },
    };
  }
}

export async function scrapeAllChains(selection: StoreSelection): Promise<{
  deals: Deal[];
  statuses: ChainStatus[];
}> {
  const merged = { ...DEFAULT_STORES, ...selection };
  const chains = Object.keys(SCRAPERS) as ChainId[];

  const results = await Promise.all(
    chains.map((chain) => scrapeChain(chain, merged[chain]!)),
  );

  const deals: Deal[] = [];
  const statuses: ChainStatus[] = [];

  for (const { result, status } of results) {
    statuses.push(status);
    if (result) deals.push(...result.deals);
  }

  deals.sort((a, b) => {
    const savingsA = a.savingsPercent ?? 0;
    const savingsB = b.savingsPercent ?? 0;
    if (savingsB !== savingsA) return savingsB - savingsA;
    return a.name.localeCompare(b.name, "sv");
  });

  return { deals, statuses };
}

export async function searchStoresInChain(
  chain: ChainId,
  query: string,
  lat?: number,
  lng?: number,
): Promise<StoreLocation[]> {
  return SEARCH[chain](query, lat, lng);
}

export async function findNearestStores(
  lat: number,
  lng: number,
): Promise<StoreSelection & { stores: StoreLocation[] }> {
  const city = (await reverseGeocodeCity(lat, lng)) ?? "Stockholm";

  const [willys, hemkop, ica, lidlStores, coopNearest] = await Promise.all([
    searchWillysStores(city),
    searchHemkopStores(city),
    searchIcaStores(city),
    searchLidlStores(city, lat, lng),
    findNearestCoopStores(lat, lng, 10),
  ]);

  const withCoords = (stores: StoreLocation[]) =>
    stores.filter(
      (s): s is StoreLocation & { lat: number; lng: number } =>
        s.lat != null && s.lng != null,
    );

  const willysSorted = sortByDistance(withCoords(willys), { lat, lng });
  const hemkopSorted = sortByDistance(withCoords(hemkop), { lat, lng });
  const icaSorted = sortByDistance(withCoords(ica), { lat, lng });

  const nearestWillys = willysSorted[0] ?? (await searchWillysStores("stockholm"))[0];
  const nearestHemkop = hemkopSorted[0] ?? (await searchHemkopStores("stockholm"))[0];
  const nearestIca = nearest(icaSorted, { lat, lng }) ?? ica[0];
  const nearestLidl = lidlStores[0] ?? (await searchLidlStores("stockholm", lat, lng))[0];
  const nearestCoop = coopNearest[0] ?? null;

  const stores = [nearestWillys, nearestHemkop, nearestIca, nearestCoop, nearestLidl].filter(Boolean) as StoreLocation[];

  return {
    willys: nearestWillys?.id ?? DEFAULT_STORES.willys,
    hemkop: nearestHemkop?.id ?? DEFAULT_STORES.hemkop,
    ica: nearestIca?.id ?? DEFAULT_STORES.ica,
    coop: nearestCoop?.id ?? DEFAULT_STORES.coop,
    lidl: nearestLidl?.id ?? DEFAULT_STORES.lidl,
    stores,
  };
}

export { SCRAPERS, SEARCH };
