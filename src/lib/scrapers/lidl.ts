import type { Deal, ScraperResult, StoreLocation } from "../types";
import { categorizeDeal } from "../categories";
import { cacheGet, cacheSet } from "../cache";
import { storeOffersUrl } from "../chains";
import { sortByDistance, type GeoPoint } from "../geo";
import { fetchJson, fetchJsonSafe } from "../http";
import { calcSavingsPercent, slugify } from "../parse";

const COUNTRY = "SE";
const STORES_BASE = "https://stores.lidlplus.com/api";
const LEAFLET_BASE = "https://digital-leaflet.lidlplus.com/api/v1";
const APP_VERSION = "17.0.5";
const LIDL_CATALOG_KEY = "catalog:lidl";
const LIDL_CATALOG_TTL_SECONDS = 24 * 60 * 60;

const NON_GROCERY_CAMPAIGN = [
  "blommor",
  "leksak",
  "baby",
  "inredning",
  "kök &",
  "hushåll",
  "verktyg",
  "trädgård",
  "mode",
];

const NON_GROCERY_TITLE = [
  "verktyg",
  "inredning",
  "kläder",
  "mode",
  "leksak",
  "sport",
  "trädgård",
  "hem &",
  "möbler",
  "textil",
  "elektronik",
];

interface LidlStore {
  storeKey?: string;
  name?: string;
  address?: string;
  locality?: string;
  postalCode?: string;
  distance?: number;
  location?: { latitude?: number; longitude?: number };
}

interface LidlCampaignRef {
  id?: string;
  title?: string;
  subtitle?: string;
  kind?: string;
}

interface LidlCampaignGroups {
  groups?: { title?: string; campaigns?: LidlCampaignRef[] }[];
}

interface LidlCampaign {
  id?: string;
  title?: string;
  subtitle?: string;
  products?: LidlLeafletProduct[];
}

interface LidlMainPrice {
  price?: number | null;
  oldPrice?: number | null;
  discount?: string | null;
  priceType?: string | null;
  title?: string | null;
  disclaimers?: string[];
}

interface LidlLeafletProduct {
  id?: string;
  wawiId?: string;
  articleNumber?: string;
  title?: string;
  subtitle?: string;
  additionalInfo?: string;
  imageUrl?: string;
  brand?: string;
  mainPrice?: LidlMainPrice;
  badges?: { type?: string; title?: string }[];
}

function lidlHeaders(): HeadersInit {
  return {
    Accept: "application/json",
    "Accept-Language": "sv-SE",
    "User-Agent": `LidlPlus/${APP_VERSION} Android okhttp/4.12.0`,
    "X-Client-Platform": "android",
    "X-Client-Version": APP_VERSION,
  };
}

export async function searchLidlStores(
  query: string,
  lat = 59.33,
  lng = 18.07,
): Promise<StoreLocation[]> {
  const stores = await fetchJson<LidlStore[]>(
    `${STORES_BASE}/v1/autocomplete/${COUNTRY}?input=${encodeURIComponent(query)}&language=sv&latitude=${lat}&longitude=${lng}`,
    { headers: lidlHeaders() },
  );

  if (stores.length) return stores.map(mapLidlStore);

  const catalog = await loadLidlCatalog();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = terms.length
    ? catalog.filter((store) => {
        const hay = `${store.name} ${store.city ?? ""} ${store.address ?? ""}`.toLowerCase();
        return terms.every((term) => hay.includes(term));
      })
    : catalog;

  if (filtered.length) return filtered.slice(0, 20);
  return findNearestLidlStores({ lat, lng }, 10);
}

export async function findNearestLidlStores(
  origin: GeoPoint,
  limit = 5,
): Promise<(StoreLocation & { distanceKm: number })[]> {
  const catalog = await loadLidlCatalog();
  const withCoords = catalog.filter(
    (store): store is StoreLocation & { lat: number; lng: number } =>
      store.lat != null && store.lng != null,
  );
  return sortByDistance(withCoords, origin).slice(0, limit);
}

async function loadLidlCatalog(): Promise<StoreLocation[]> {
  const cached = await cacheGet(LIDL_CATALOG_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as StoreLocation[];
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {
      /* refetch */
    }
  }

  const catalog = await fetchJson<LidlStore[]>(`${STORES_BASE}/v4/${COUNTRY}`, {
    headers: lidlHeaders(),
  });
  const stores = catalog.map(mapLidlStore);
  await cacheSet(LIDL_CATALOG_KEY, JSON.stringify(stores), LIDL_CATALOG_TTL_SECONDS);
  return stores;
}

function mapLidlStore(store: LidlStore): StoreLocation {
  return {
    chain: "lidl",
    id: store.storeKey ?? slugify(store.name ?? "lidl"),
    name: store.name ?? "Lidl",
    address: store.address,
    city: store.locality,
    lat: store.location?.latitude,
    lng: store.location?.longitude,
    distanceKm: store.distance ? store.distance / 1000 : undefined,
    url: "https://www.lidl.se/",
  };
}

export async function getLidlStore(storeKey: string): Promise<StoreLocation> {
  const catalog = await loadLidlCatalog();
  const found = catalog.find((store) => store.id === storeKey);
  if (found) return found;
  return {
    chain: "lidl",
    id: storeKey,
    name: storeKey,
    url: "https://www.lidl.se/",
  };
}

export async function scrapeLidl(storeKey: string): Promise<ScraperResult> {
  const store = await getLidlStore(storeKey);
  const data = await fetchJson<LidlCampaignGroups>(`${LEAFLET_BASE}/${COUNTRY}/campaignGroups`);
  const current =
    data.groups?.find((group) => /den här veckan/i.test(group.title ?? "")) ?? data.groups?.[0];
  const campaignRefs = (current?.campaigns ?? []).filter((campaign) =>
    isGroceryCampaign(campaign.title),
  );

  if (!campaignRefs.length) {
    throw new Error("Inga Lidl-kampanjer hittades");
  }

  const campaigns = await Promise.all(
    campaignRefs.map((campaign) =>
      fetchJsonSafe<LidlCampaign>(`${LEAFLET_BASE}/${COUNTRY}/campaigns/${campaign.id}`),
    ),
  );

  const seen = new Set<string>();
  const deals: Deal[] = [];

  for (const campaign of campaigns) {
    if (!campaign) continue;
    for (const product of campaign.products ?? []) {
      const deal = parseLidlProduct(product, campaign);
      if (!deal) continue;
      const key = product.articleNumber ?? product.wawiId ?? deal.id;
      if (seen.has(key)) continue;
      seen.add(key);
      deals.push(deal);
    }
  }

  if (!deals.length) {
    throw new Error("Inga Lidl-erbjudanden i reklambladet");
  }

  return { store, deals };
}

function isGroceryCampaign(title?: string): boolean {
  const hay = title?.toLowerCase() ?? "";
  return !NON_GROCERY_CAMPAIGN.some((kw) => hay.includes(kw));
}

function isGroceryProduct(product: LidlLeafletProduct): boolean {
  const title = `${product.title ?? ""} ${product.brand ?? ""}`.toLowerCase();
  return !NON_GROCERY_TITLE.some((kw) => title.includes(kw));
}

function parseLidlProduct(product: LidlLeafletProduct, campaign: LidlCampaign): Deal | null {
  const title = product.title?.trim();
  if (!title || !isGroceryProduct(product)) return null;

  const brand = product.brand?.trim();
  const name =
    brand && brand !== "." && !title.toLowerCase().includes(brand.toLowerCase())
      ? `${title}, ${brand}`
      : title;

  const box = product.mainPrice;
  const price = box?.price ?? 0;
  if (price <= 0) return null;

  const originalPrice =
    box?.oldPrice && box.oldPrice > price ? box.oldPrice : undefined;
  const memberOnly = box?.priceType === "LidlPlus";
  const discount = box?.discount?.trim();
  const { volume, comparisonPrice } = parseLidlPackaging(
    product.additionalInfo,
    box?.disclaimers,
  );
  const dates = parseLidlDateRange(
    product.badges?.find((badge) => badge.type === "AvailableInStoreFrom")?.title ??
      campaign.subtitle,
  );

  return {
    id: `lidl-${product.articleNumber ?? product.wawiId ?? product.id ?? slugify(name)}`,
    chain: "lidl",
    name,
    brand: brand && brand !== "." ? brand : undefined,
    volume,
    price,
    originalPrice,
    savingsPercent: calcSavingsPercent(price, originalPrice),
    promotionLabel: discount || undefined,
    comparisonPrice,
    memberOnly,
    category: categorizeDeal(name),
    imageUrl: product.imageUrl,
    productUrl: storeOffersUrl("lidl"),
    validFrom: dates.from,
    validTo: dates.to,
  };
}

function parseLidlPackaging(
  additionalInfo?: string,
  disclaimers?: string[],
): { volume?: string; comparisonPrice?: string } {
  const chunks = [additionalInfo, ...(disclaimers ?? [])]
    .filter(Boolean)
    .join(" | ")
    .replace(/\u00a0/g, " ")
    .split("|")
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  let volume: string | undefined;
  let comparisonPrice: string | undefined;

  for (const part of chunks) {
    if (/jfr/i.test(part) || /kr\s*\/\s*(kg|hg|g|l|liter|st|ml)/i.test(part)) {
      comparisonPrice ??= part.replace(/^jfr\.?\s*/i, "").trim();
    } else if (!volume) {
      volume = part;
    }
  }

  return { volume, comparisonPrice };
}

function parseLidlDateRange(text?: string): { from?: string; to?: string } {
  if (!text) return {};
  const match = text.match(
    /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*[-–]\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/,
  );
  if (!match) return {};

  const now = new Date();
  const defaultYear = now.getFullYear();
  const fromMonth = Number(match[2]);
  const toMonth = Number(match[5]);
  const fromYear = match[3] ? normalizeYear(match[3], defaultYear) : defaultYear;
  let toYear = match[6] ? normalizeYear(match[6], defaultYear) : fromYear;
  if (!match[3] && !match[6] && toMonth < fromMonth) toYear = fromYear + 1;

  return {
    from: toIsoDate(fromYear, fromMonth, Number(match[1])),
    to: toIsoDate(toYear, toMonth, Number(match[4])),
  };
}

function normalizeYear(value: string, fallback: number): number {
  const year = Number(value);
  if (!Number.isFinite(year)) return fallback;
  return year < 100 ? 2000 + year : year;
}

function toIsoDate(year: number, month: number, day: number): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return date.toISOString().slice(0, 10);
}

export const lidlScraper = { searchStores: searchLidlStores, scrape: scrapeLidl };
