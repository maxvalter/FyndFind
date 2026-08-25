import type { Deal, ScraperResult, StoreLocation } from "../types";
import { storeOffersUrl } from "../chains";
import { fetchJson } from "../http";
import { parseAxfoodCampaignItem } from "./willys";

const BASE = "https://www.hemkop.se";
const PAGE_SIZE = 400;

interface AxfoodStore {
  storeId: string;
  name: string;
  address?: { line1?: string; town?: string };
  geoPoint?: { latitude?: number; longitude?: number };
}

function headers(): HeadersInit {
  return {
    Accept: "application/json",
    Referer: `${BASE}/erbjudanden`,
    Origin: BASE,
    "X-Requested-With": "XMLHttpRequest",
  };
}

export async function searchHemkopStores(query: string): Promise<StoreLocation[]> {
  const stores = await fetchJson<AxfoodStore[]>(
    `${BASE}/axfood/rest/store?query=${encodeURIComponent(query)}`,
    { headers: headers() },
  );
  return stores
    .filter((s) => s.name && s.geoPoint?.latitude && s.geoPoint?.longitude)
    .map(mapStore);
}

export async function getHemkopStore(storeId: string): Promise<StoreLocation> {
  const store = await fetchJson<AxfoodStore>(`${BASE}/axfood/rest/store/${storeId}`, {
    headers: headers(),
  });
  return mapStore(store);
}

function mapStore(store: AxfoodStore): StoreLocation {
  return {
    chain: "hemkop",
    id: store.storeId,
    name: store.name,
    address: store.address?.line1,
    city: store.address?.town,
    lat: store.geoPoint?.latitude,
    lng: store.geoPoint?.longitude,
    url: storeOffersUrl("hemkop", store.storeId),
  };
}

export async function scrapeHemkop(storeId: string): Promise<ScraperResult> {
  const store = await getHemkopStore(storeId);
  const data = await fetchJson<{ results?: Parameters<typeof parseAxfoodCampaignItem>[0][] }>(
    `${BASE}/search/campaigns/offline?q=${encodeURIComponent(storeId)}&type=PERSONAL_GENERAL&page=0&size=${PAGE_SIZE}`,
    { headers: headers() },
  );

  const deals: Deal[] = [];
  const storeUrl = store.url ?? storeOffersUrl("hemkop", storeId) ?? `${BASE}/erbjudanden`;
  for (const item of data.results ?? []) {
    const deal = parseAxfoodCampaignItem(item, "hemkop", storeUrl);
    if (deal) deals.push(deal);
  }

  return { store, deals };
}

export const hemkopScraper = { searchStores: searchHemkopStores, scrape: scrapeHemkop };
