import type { ChainId, Deal, ScraperResult, StoreLocation } from "../types";
import { categorizeDeal } from "../categories";
import { storeOffersUrl } from "../chains";
import { fetchJson } from "../http";
import {
  calcSavingsPercent,
  formatKrPerKg,
  formatSek,
  kilosFromVolume,
  parseLowestHistoricalPrice,
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
    url: storeOffersUrl("willys", store.storeId),
  };
}

export async function scrapeWillys(storeId: string): Promise<ScraperResult> {
  const store = await getWillysStore(storeId);
  const data = await fetchJson<{ results?: CampaignItem[] }>(
    `${BASE}/search/campaigns/offline?q=${encodeURIComponent(storeId)}&type=PERSONAL_GENERAL&page=0&size=${PAGE_SIZE}`,
    { headers: axfoodHeaders(BASE) },
  );

  const deals: Deal[] = [];
  const seen = new Set<string>();
  const storeUrl = store.url ?? storeOffersUrl("willys", storeId) ?? `${BASE}/erbjudanden`;
  for (const item of data.results ?? []) {
    const deal = parseAxfoodCampaignItem(item, "willys", storeUrl);
    if (!deal || seen.has(deal.id)) continue;
    seen.add(deal.id);
    deals.push(deal);
  }

  return { store, deals };
}

export function parseAxfoodCampaignItem(
  item: CampaignItem,
  chain: ChainId,
  storeUrl: string,
): Deal | null {
  const promo = item.potentialPromotions?.[0];
  const name = item.name?.trim() ?? "";
  if (!name) return null;

  const shelfPrice = parseSwedishPrice(item.price) ?? item.priceValue;
  const savePrice = promo?.savePrice ?? "";
  const isTemporaryOffer = /tillfälligt/i.test(savePrice);

  let price = shelfPrice ?? 0;
  let originalPrice: number | undefined;
  let promotionLabel: string | undefined;
  const memberOnly = promo?.campaignType === "LOYALTY";

  if (promo) {
    const qualifyingCount = promo.qualifyingCount ?? 0;
    const rewardPrice = parseSwedishPrice(promo.rewardLabel?.split("/")[0]);

    if (qualifyingCount > 1) {
      const total = rewardPrice;
      if (total) {
        price = Math.round((total / qualifyingCount) * 100) / 100;
        promotionLabel =
          promo.conditionLabelFormatted ||
          promo.cartLabel ||
          `${qualifyingCount} för ${total} kr`;
      }
    } else if (rewardPrice && rewardPrice > 0) {
      price = rewardPrice;
    }

    // Only the advertised 30-day lowest price (incl. lower bound of ranges).
    // Catalog/compare prices like item.price are not ordinarie on the flyer.
    const historical = parseLowestHistoricalPrice(item.offlinePromotionLowestHistoricalPrice);
    if (historical && historical > price) originalPrice = historical;

    if (!promotionLabel) {
      promotionLabel = isTemporaryOffer
        ? savePrice
        : promo.cartLabel || promo.rewardLabel || savePrice || undefined;
    }
  }

  if (originalPrice != null && originalPrice <= price) {
    originalPrice = undefined;
  }
  if (price <= 0) return null;

  const productCode = promo?.mainProductCode || item.code;

  return {
    id: `${chain}-${slugify(name)}-${productCode ?? dealsFallbackId(name, price)}`,
    chain,
    name,
    brand: item.manufacturer,
    volume: item.displayVolume,
    price,
    originalPrice,
    savingsPercent: calcSavingsPercent(price, originalPrice),
    promotionLabel: promotionLabel || undefined,
    comparisonPrice: axfoodComparisonPrice(price, item.priceUnit, item.displayVolume),
    memberOnly,
    category: categorizeDeal(name),
    imageUrl: item.image?.url,
    productUrl: storeUrl,
    validTo: promo?.endDate,
    validFrom: promo?.startDate,
  };
}

function axfoodComparisonPrice(
  price: number,
  priceUnit?: string,
  volume?: string,
): string | undefined {
  if (!priceUnit) return undefined;
  const unit = priceUnit.replace(/\s+/g, "").toLowerCase();
  if (unit === "kr/kg" || unit === "kr/hg" || unit === "kr/l") {
    return `${formatSek(price)}/${unit.slice(3)}`;
  }
  if (unit === "kr/st") {
    const kilos = kilosFromVolume(volume);
    if (kilos && kilos > 0) return formatKrPerKg(price / kilos);
    return `${formatSek(price)}/st`;
  }
  return undefined;
}

function dealsFallbackId(name: string, price: number): string {
  return `${slugify(name)}-${price}`;
}

export const willysScraper = { searchStores: searchWillysStores, scrape: scrapeWillys };
