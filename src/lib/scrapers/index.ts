import type { ChainId, ChainStatus, Deal, ScraperResult, StoreLocation, StoreSelection } from "../types";
import { DEFAULT_STORES } from "../types";
import { findNearestCoopStores, scrapeCoop, searchCoopStores } from "./coop";
import { scrapeHemkop, searchHemkopStores } from "./hemkop";
import { findNearestIcaStores, scrapeIca, searchIcaStores } from "./ica";
import { findNearestLidlStores, scrapeLidl, searchLidlStores } from "./lidl";
import { scrapeWillys, searchWillysStores } from "./willys";
import {
  geocodePlace,
  reverseGeocode,
  searchQueriesForPlace,
  sortByDistance,
  type GeoPlace,
  type GeoPoint,
} from "../geo";

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
  ica: (q, lat, lng) => searchIcaStores(q, lat, lng),
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
  placeHint?: string,
): Promise<
  StoreSelection & {
    stores: StoreLocation[];
    label?: string;
    locality?: string;
    city?: string;
    lat: number;
    lng: number;
  }
> {
  const place = placeHint
    ? await geocodePlace(placeHint)
    : await reverseGeocode(lat, lng);
  const origin: GeoPoint =
    placeHint && place ? { lat: place.lat, lng: place.lng } : { lat, lng };
  const queries = searchQueriesForPlace(place, placeHint);
  const searchQueries = queries.length ? queries : ["Stockholm"];

  const [
    nearestWillys,
    nearestHemkop,
    icaGeo,
    icaNamed,
    lidlGeo,
    lidlNamed,
    coopGeo,
    coopNamed,
  ] = await Promise.all([
    nearestFromQueries(searchWillysStores, searchQueries, origin),
    nearestFromQueries(searchHemkopStores, searchQueries, origin),
    findNearestIcaStores(origin, 1).then((stores) => stores[0]),
    nearestFromQueries((query) => searchIcaStores(query), searchQueries, origin),
    findNearestLidlStores(origin, 1).then((stores) => stores[0]),
    nearestFromQueries(
      (query) => searchLidlStores(query, origin.lat, origin.lng),
      searchQueries,
      origin,
    ),
    findNearestCoopStores(origin.lat, origin.lng, 1).then((stores) => stores[0]),
    nearestFromQueries(searchCoopStores, searchQueries, origin),
  ]);

  const nearestIca = chooseStore(icaGeo, icaNamed, Boolean(placeHint));
  const nearestLidl = chooseStore(lidlGeo, lidlNamed, Boolean(placeHint));
  const nearestCoop = chooseStore(coopGeo, coopNamed, Boolean(placeHint));
  const stores = [nearestWillys, nearestHemkop, nearestIca, nearestCoop, nearestLidl].filter(
    Boolean,
  ) as StoreLocation[];

  return {
    willys: nearestWillys?.id ?? DEFAULT_STORES.willys,
    hemkop: nearestHemkop?.id ?? DEFAULT_STORES.hemkop,
    ica: nearestIca?.id ?? DEFAULT_STORES.ica,
    coop: nearestCoop?.id ?? DEFAULT_STORES.coop,
    lidl: nearestLidl?.id ?? DEFAULT_STORES.lidl,
    stores,
    label: placeLabel(place, placeHint),
    locality: place?.locality,
    city: place?.city,
    lat: origin.lat,
    lng: origin.lng,
  };
}

const PLACE_NAME_MAX_KM = 8;
const GEO_MAX_KM = 40;

function chooseStore(
  geo: StoreLocation | undefined,
  named: StoreLocation | undefined,
  preferName: boolean,
): StoreLocation | undefined {
  const geoKm = geo?.distanceKm ?? Infinity;
  const namedKm = named?.distanceKm ?? Infinity;

  if (preferName && named && namedKm <= PLACE_NAME_MAX_KM) return named;
  if (geo && geoKm <= GEO_MAX_KM) return geo;
  if (named && namedKm < geoKm) return named;
  return geo ?? named;
}

async function nearestFromQueries(
  search: (query: string) => Promise<StoreLocation[]>,
  queries: string[],
  origin: GeoPoint,
): Promise<StoreLocation | undefined> {
  const pools = await Promise.all(
    queries.slice(0, 2).map((query) => search(query).catch(() => [] as StoreLocation[])),
  );
  const merged = dedupeStores(pools.flat()).filter(
    (store): store is StoreLocation & { lat: number; lng: number } =>
      store.lat != null && store.lng != null,
  );
  return sortByDistance(merged, origin)[0];
}

function dedupeStores(stores: StoreLocation[]): StoreLocation[] {
  const seen = new Set<string>();
  return stores.filter((store) => {
    const key = `${store.chain}:${store.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function placeLabel(place: GeoPlace | null, fallback?: string): string | undefined {
  return place?.label ?? fallback?.trim() ?? undefined;
}

export { SCRAPERS, SEARCH };
