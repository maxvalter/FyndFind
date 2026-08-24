import type { Deal, ScraperResult, StoreLocation } from "../types";
import { categorizeDeal } from "../categories";
import { fetchJson } from "../http";
import { calcSavingsPercent, slugify } from "../parse";

const COUNTRY = "SE";
const STORES_BASE = "https://stores.lidlplus.com/api";
const OFFERS_BASE = "https://offers.lidlplus.com/app/api";
const APP_VERSION = "17.0.5";

const GROCERY_CATEGORIES = new Set([
  "Store",
  "Food",
  "Fresh",
  "Fruit",
  "Vegetables",
  "Meat",
  "Dairy",
  "Bakery",
  "Frozen",
  "Drinks",
  "Snacks",
]);

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

interface LidlOffer {
  id?: string;
  title?: string;
  brand?: string;
  category?: string;
  imageUrl?: string;
  priceBox?: {
    priceSymbol?: string;
    discountMessage?: string;
    largePartNumeric?: number;
    smallPartNumeric?: number;
  };
  startValidityDate?: string;
  endValidityDate?: string;
  packaging?: string;
  pricePerUnit?: string;
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

  if (!stores.length) {
    const catalog = await fetchJson<LidlStore[]>(`${STORES_BASE}/v4/${COUNTRY}`, {
      headers: lidlHeaders(),
    });
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = catalog.filter((s) => {
      const hay = `${s.name} ${s.locality} ${s.address}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
    return filtered.slice(0, 20).map(mapLidlStore);
  }

  return stores.map(mapLidlStore);
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
  const catalog = await fetchJson<LidlStore[]>(`${STORES_BASE}/v4/${COUNTRY}`, {
    headers: lidlHeaders(),
  });
  const found = catalog.find((s) => s.storeKey === storeKey);
  if (found) return mapLidlStore(found);
  return {
    chain: "lidl",
    id: storeKey,
    name: storeKey,
    url: "https://www.lidl.se/",
  };
}

export async function scrapeLidl(storeKey: string): Promise<ScraperResult> {
  const store = await getLidlStore(storeKey);
  const data = await fetchJson<{ offers?: LidlOffer[]; totalOffers?: number }>(
    `${OFFERS_BASE}/v4/${COUNTRY}/${storeKey}/offers`,
    { headers: lidlHeaders() },
  );

  const deals = (data.offers ?? [])
    .filter(isGroceryOffer)
    .map((offer) => parseLidlOffer(offer, storeKey))
    .filter((d): d is Deal => d != null);

  return { store, deals };
}

function isGroceryOffer(offer: LidlOffer): boolean {
  const title = `${offer.title ?? ""} ${offer.brand ?? ""}`.toLowerCase();
  if (NON_GROCERY_TITLE.some((kw) => title.includes(kw))) return false;
  if (offer.category && !GROCERY_CATEGORIES.has(offer.category)) {
    if (offer.category === "NonFood") return false;
  }
  return true;
}

function parseLidlOffer(offer: LidlOffer, storeKey: string): Deal | null {
  const title = offer.title?.trim();
  if (!title) return null;

  const brand = offer.brand?.trim();
  const name = brand && brand !== "." && !title.toLowerCase().includes(brand.toLowerCase())
    ? `${title}, ${brand}`
    : title;

  const box = offer.priceBox;
  const price = box?.largePartNumeric ?? 0;
  if (price <= 0) return null;

  const originalPrice = box?.smallPartNumeric && box.smallPartNumeric > price
    ? box.smallPartNumeric
    : undefined;

  const promotionLabel = box?.discountMessage
    ? `${box.discountMessage}${box.priceSymbol ? ` ${box.priceSymbol}` : ""}`
    : undefined;

  return {
    id: `lidl-${offer.id ?? slugify(name)}`,
    chain: "lidl",
    name,
    brand: brand && brand !== "." ? brand : undefined,
    volume: offer.packaging ?? undefined,
    price,
    originalPrice,
    savingsPercent: calcSavingsPercent(price, originalPrice),
    promotionLabel,
    memberOnly: true,
    category: categorizeDeal(name),
    imageUrl: offer.imageUrl,
    productUrl: `https://www.lidl.se/c/lidl-plus-erbjudanden/s10017715`,
    validFrom: offer.startValidityDate?.split("T")[0],
    validTo: offer.endValidityDate?.split("T")[0],
  };
}

export const lidlScraper = { searchStores: searchLidlStores, scrape: scrapeLidl };
