import type { ChainId, Deal, ScraperResult, StoreLocation } from "../types";
import { categorizeDeal } from "../categories";
import { fetchJson } from "../http";
import {
  calcSavingsPercent,
  parseSwedishPrice,
  slugify,
} from "../parse";

const BASE = "https://www.willys.se";
const PAGE_SIZE = 400;

interface AxfoodStore {
  storeId: string;
  name: string;
  address?: { line1?: string; town?: string; postalCode?: string };
  geoPoint?: { latitude?: number; longitude?: number };
}

interface CampaignItem {
  name?: string;
  price?: string;
  priceValue?: number;
  priceUnit?: string;
  displayVolume?: string;
  manufacturer?: string;
  image?: { url?: string };
  code?: string;
  potentialPromotions?: Promotion[];
  offlinePromotionLowestHistoricalPrice?: string;
  savingsAmount?: string | number;
}

interface Promotion {
  code?: string;
  name?: string;
  description?: string;
  savePrice?: string;
  rewardLabel?: string;
  conditionLabel?: string;
  conditionLabelFormatted?: string;
  qualifyingCount?: number;
  mainProductCode?: string;
  cartLabel?: string;
  endDate?: string;
  startDate?: string;
  campaignType?: string;
}

function axfoodHeaders(base: string): HeadersInit {
  return {
    Accept: "application/json",
    Referer: `${base}/erbjudanden`,
    Origin: base,
    "X-Requested-With": "XMLHttpRequest",
  };
}

export async function searchWillysStores(query: string): Promise<StoreLocation[]> {
  const stores = await fetchJson<AxfoodStore[]>(
    `${BASE}/axfood/rest/store?query=${encodeURIComponent(query)}`,
    { headers: axfoodHeaders(BASE) },
  );
  return stores
    .filter((s) => s.name && s.geoPoint?.latitude && s.geoPoint?.longitude)
    .map(mapAxfoodStore);
}

export async function getWillysStore(storeId: string): Promise<StoreLocation> {
  const store = await fetchJson<AxfoodStore>(`${BASE}/axfood/rest/store/${storeId}`, {
    headers: axfoodHeaders(BASE),
  });
  return mapAxfoodStore(store);
}

function mapAxfoodStore(store: AxfoodStore): StoreLocation {
  return {
    chain: "willys",
    id: store.storeId,
    name: store.name,
    address: store.address?.line1,
    city: store.address?.town,
    lat: store.geoPoint?.latitude,
    lng: store.geoPoint?.longitude,
    url: `${BASE}/erbjudanden/butik/${store.storeId}`,
  };
}

export async function scrapeWillys(storeId: string): Promise<ScraperResult> {
  const store = await getWillysStore(storeId);
  const data = await fetchJson<{ results?: CampaignItem[] }>(
    `${BASE}/search/campaigns/offline?q=${encodeURIComponent(storeId)}&type=PERSONAL_GENERAL&page=0&size=${PAGE_SIZE}`,
    { headers: axfoodHeaders(BASE) },
  );

  const deals: Deal[] = [];
  for (const item of data.results ?? []) {
    const deal = parseAxfoodCampaignItem(item, "willys", BASE);
    if (deal) deals.push(deal);
  }

  return { store, deals };
}

export function parseAxfoodCampaignItem(
  item: CampaignItem,
  chain: ChainId,
  baseUrl: string,
): Deal | null {
  const promo = item.potentialPromotions?.[0];
  const nameParts = [item.name, promo?.description, item.manufacturer].filter(Boolean);
  const name = nameParts.join(" ").trim();
  if (!name) return null;

  let price = parseSwedishPrice(item.price) ?? item.priceValue ?? 0;
  let originalPrice: number | undefined;
  let promotionLabel = promo?.rewardLabel || promo?.cartLabel || promo?.savePrice;
  let memberOnly = promo?.campaignType === "LOYALTY";

  if (promo) {
    const qualifyingCount = promo.qualifyingCount;
    const rewardPrice = parseSwedishPrice(promo.rewardLabel?.split("/")[0]);

    if (qualifyingCount && qualifyingCount > 1) {
      const total = parseSwedishPrice(promo.rewardLabel?.split("/")[0]);
      if (total) {
        price = Math.round((total / qualifyingCount) * 100) / 100;
        promotionLabel = promo.conditionLabelFormatted || `${qualifyingCount} för ${total} kr`;
      }
    } else if (rewardPrice && rewardPrice > 0 && rewardPrice < price) {
      originalPrice = price;
      price = rewardPrice;
    }

    const historical = parseSwedishPrice(item.offlinePromotionLowestHistoricalPrice);
    if (historical && historical > price) {
      originalPrice = historical;
    }

    const savePrice = promo.savePrice ?? "";
    if (savePrice.toLowerCase().includes("spara")) {
      const savings = parseSwedishPrice(savePrice.replace(/spara/i, ""));
      if (savings && !originalPrice) originalPrice = price + savings;
    }

    if (savePrice.toLowerCase().includes("tillfälligt") && price > 0) {
      originalPrice = price * 2;
    }
  }

  if (!originalPrice && item.priceValue && item.priceValue > price) {
    originalPrice = item.priceValue;
  }

  const productCode = promo?.mainProductCode || item.code;
  const rawCategory = promo?.name ?? item.name;

  return {
    id: `${chain}-${slugify(name)}-${productCode ?? dealsFallbackId(name, price)}`,
    chain,
    name,
    brand: item.manufacturer,
    volume: item.displayVolume,
    price,
    originalPrice,
    savingsPercent: calcSavingsPercent(price, originalPrice),
    promotionLabel: promotionLabel ?? undefined,
    memberOnly,
    category: categorizeDeal(name, rawCategory),
    imageUrl: item.image?.url,
    productUrl: productCode ? `${baseUrl}/produkt/${productCode}` : `${baseUrl}/erbjudanden/butik`,
    validTo: promo?.endDate,
    validFrom: promo?.startDate,
    rawCategory,
  };
}

function dealsFallbackId(name: string, price: number): string {
  return `${slugify(name)}-${price}`;
}

export const willysScraper = { searchStores: searchWillysStores, scrape: scrapeWillys };
