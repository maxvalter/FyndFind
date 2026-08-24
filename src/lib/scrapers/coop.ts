import type { Deal, ScraperResult, StoreLocation } from "../types";
import { categorizeDeal } from "../categories";
import { fetchJson, fetchText } from "../http";
import { calcSavingsPercent, slugify } from "../parse";
import { haversineKm } from "../geo";

const COOP_BASE = "https://www.coop.se";
const DKE_KEY = "32895bd5b86e4a5ab6e94fb0bc8ae234";
const STORE_KEY = "990520e65cc44eef89e9e9045b57f4e9";

interface CoopStoreListItem {
  storeId: number;
  ledgerAccountNumber: string;
  name: string;
  conceptName?: string;
  url: string;
}

interface CoopStoreDetail {
  id: number;
  ledgerAccountNumber: string;
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  url?: string;
}

interface DkeOffer {
  id?: string;
  priceInformation?: {
    discountValue?: number;
    isMemberPrice?: boolean;
    unit?: string;
    minimumAmount?: number;
    dealType?: string;
  };
  content?: {
    title?: string;
    brand?: string;
    amountInformation?: string;
    imageUrl?: string;
    onlineProductName?: string;
    enrichedComparisonPrice?: string;
    formattedComparativePriceText?: string;
  };
  categoryTeam?: { name?: string };
  unifiedSplash?: { tag?: string };
  clusterInteriorOffers?: DkeOffer[];
  campaignEndDate?: string;
  campaignStartDate?: string;
}

function storeHeaders(key: string): HeadersInit {
  return {
    Accept: "application/json",
    "Ocp-Apim-Subscription-Key": key,
    Origin: COOP_BASE,
    Referer: `${COOP_BASE}/`,
  };
}

function dkeHeaders(): HeadersInit {
  return {
    Accept: "application/json",
    "ocp-apim-subscription-key": DKE_KEY,
    Origin: COOP_BASE,
    Referer: `${COOP_BASE}/`,
  };
}

export function coopSlugToPath(slug: string): string {
  if (slug.startsWith("coop/") || slug.startsWith("stora-coop/")) {
    return `/butiker-erbjudanden/${slug}/`;
  }
  return `/butiker-erbjudanden/coop/${slug}/`;
}

export async function searchCoopStores(query: string): Promise<StoreLocation[]> {
  const data = await fetchJson<{ stores?: CoopStoreListItem[] }>(
    `https://proxy.api.coop.se/external/store/stores?api-version=v1&query=${encodeURIComponent(query)}`,
    { headers: storeHeaders(STORE_KEY) },
  );

  const stores = (data.stores ?? []).filter(
    (s) => typeof s.url === "string" && s.url.includes("butiker-erbjudanden"),
  );

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const ranked = [...stores].sort((a, b) => scoreCoopStore(b, terms) - scoreCoopStore(a, terms));
  const toEnrich = (terms.length ? ranked.filter((s) => scoreCoopStore(s, terms) > 0) : ranked).slice(0, 40);
  const enrichList = toEnrich.length ? toEnrich : ranked.slice(0, 40);

  const detailed = await Promise.all(
    enrichList.map(async (s) => {
      try {
        const detail = await fetchJson<CoopStoreDetail>(
          `https://proxy.api.coop.se/external/store/stores/${s.ledgerAccountNumber}?api-version=v1`,
          { headers: storeHeaders(STORE_KEY) },
        );
        return mapCoopStore(detail, s.url);
      } catch {
        return mapCoopStoreFromList(s);
      }
    }),
  );

  return detailed;
}

function scoreCoopStore(store: CoopStoreListItem, terms: string[]): number {
  const haystack = store.name.toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 10 : 0), 0);
}

export async function getCoopStore(slug: string): Promise<StoreLocation> {
  const path = coopSlugToPath(slug);
  const html = await fetchText(`${COOP_BASE}${path}`);
  const ledger = html.match(/ledgerAccountNumber["\']?\s*:\s*"?(\d{6})"?/i)?.[1];
  if (ledger) {
    const detail = await fetchJson<CoopStoreDetail>(
      `https://proxy.api.coop.se/external/store/stores/${ledger}?api-version=v1`,
      { headers: storeHeaders(STORE_KEY) },
    );
    return mapCoopStore(detail, path);
  }
  const name = html.match(/<title>([^|<]+)/)?.[1]?.trim() ?? "Coop-butik";
  return {
    chain: "coop",
    id: slug,
    name,
    url: `${COOP_BASE}${path}`,
  };
}

function mapCoopStore(detail: CoopStoreDetail, urlPath: string): StoreLocation {
  const slugMatch = urlPath.match(/butiker-erbjudanden\/(.+)\/?$/);
  return {
    chain: "coop",
    id: slugMatch?.[1] ?? detail.ledgerAccountNumber,
    name: detail.name,
    address: detail.address?.split(",")[0]?.trim(),
    city: detail.address?.split(",").pop()?.trim(),
    lat: detail.latitude,
    lng: detail.longitude,
    url: `${COOP_BASE}${urlPath.startsWith("/") ? urlPath : `/${urlPath}`}`,
  };
}

function mapCoopStoreFromList(item: CoopStoreListItem): StoreLocation {
  const slugMatch = item.url.match(/butiker-erbjudanden\/(.+)\/?$/);
  return {
    chain: "coop",
    id: slugMatch?.[1] ?? item.ledgerAccountNumber,
    name: item.name,
    url: `${COOP_BASE}${item.url}`,
  };
}

async function resolveLedgerAccount(slug: string): Promise<string> {
  const path = coopSlugToPath(slug);
  const html = await fetchText(`${COOP_BASE}${path}`);
  const ledger = html.match(/ledgerAccountNumber["\']?\s*:\s*"?(\d{6})"?/i)?.[1];
  if (!ledger) throw new Error(`Kunde inte hitta Coop-butik för ${slug}`);
  return ledger;
}

export async function scrapeCoop(slug: string): Promise<ScraperResult> {
  const store = await getCoopStore(slug);
  const ledger = await resolveLedgerAccount(slug);

  const data = await fetchJson<{ sortingGroups?: { id: string; offers?: DkeOffer[]; offerAmount?: number }[] }>(
    `https://external.api.coop.se/dke/offers/sorting-groups/${ledger}?api-version=v2&clustered=true&grouped=true`,
    { headers: dkeHeaders() },
  );

  const group = data.sortingGroups?.find((g) => g.id === "alla") ?? data.sortingGroups?.[0];
  const offers = group?.offers ?? [];

  const deals: Deal[] = [];
  const seen = new Set<string>();

  for (const offer of offers) {
    const cluster = [offer, ...(offer.clusterInteriorOffers ?? [])];
    for (const entry of cluster) {
      const deal = parseDkeOffer(entry, slug);
      if (deal && !seen.has(deal.id)) {
        seen.add(deal.id);
        deals.push(deal);
      }
    }
  }

  return { store, deals };
}

function parseDkeOffer(offer: DkeOffer, slug: string): Deal | null {
  const content = offer.content ?? {};
  const priceInfo = offer.priceInformation ?? {};
  const title = content.title?.trim();
  if (!title) return null;

  const brand = content.brand?.trim();
  const name = brand && !title.toLowerCase().includes(brand.toLowerCase())
    ? `${title}, ${brand}`
    : title;

  const totalPrice = priceInfo.discountValue ?? 0;
  if (totalPrice <= 0) return null;

  const quantity = priceInfo.minimumAmount ?? 1;
  const price = quantity > 1 ? Math.round((totalPrice / quantity) * 100) / 100 : totalPrice;

  let imageUrl = content.imageUrl;
  if (imageUrl?.startsWith("//")) imageUrl = `https:${imageUrl}`;

  const memberOnly = Boolean(priceInfo.isMemberPrice);
  const promotionLabel = offer.unifiedSplash?.tag ?? (quantity > 1 ? `${quantity} för ${totalPrice} kr` : undefined);

  const compareText = content.enrichedComparisonPrice ?? content.formattedComparativePriceText;
  let originalPrice: number | undefined;
  if (compareText) {
    const match = compareText.match(/([\d,\.]+)/);
    if (match) {
      const perUnit = parseFloat(match[1].replace(",", "."));
      const amount = content.amountInformation ?? "";
      const grams = amount.match(/([\d,\.]+)\s*g/i);
      if (grams && compareText.includes("/kg")) {
        originalPrice = Math.round(perUnit * (parseFloat(grams[1].replace(",", ".")) / 1000) * 100) / 100;
      }
    }
  }

  const rawCategory = offer.categoryTeam?.name;

  return {
    id: `coop-${offer.id ?? slugify(name)}`,
    chain: "coop",
    name,
    brand,
    volume: content.amountInformation,
    price,
    originalPrice: originalPrice && originalPrice > price ? originalPrice : undefined,
    savingsPercent: calcSavingsPercent(price, originalPrice),
    promotionLabel,
    memberOnly,
    category: categorizeDeal(name, rawCategory),
    imageUrl,
    productUrl: `${COOP_BASE}${coopSlugToPath(slug)}`,
    validFrom: offer.campaignStartDate?.split("T")[0],
    validTo: offer.campaignEndDate?.split("T")[0],
    rawCategory,
  };
}

export async function findNearestCoopStores(
  lat: number,
  lng: number,
  limit = 5,
): Promise<(StoreLocation & { distanceKm: number })[]> {
  const city = (await reverseGeocodeCity(lat, lng)) ?? "Stockholm";
  const citySlug = city
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o");

  const data = await fetchJson<{ stores?: CoopStoreListItem[] }>(
    `https://proxy.api.coop.se/external/store/stores?api-version=v1&query=${encodeURIComponent(city)}`,
    { headers: storeHeaders(STORE_KEY) },
  );

  const pool = (data.stores ?? []).filter(
    (s) =>
      typeof s.url === "string" &&
      s.url.includes("butiker-erbjudanden") &&
      (s.url.toLowerCase().includes(citySlug) ||
        s.name.toLowerCase().includes(city.toLowerCase())),
  );

  const detailed = await Promise.all(
    pool.slice(0, 30).map(async (s) => {
      try {
        const detail = await fetchJson<CoopStoreDetail>(
          `https://proxy.api.coop.se/external/store/stores/${s.ledgerAccountNumber}?api-version=v1`,
          { headers: storeHeaders(STORE_KEY) },
        );
        return mapCoopStore(detail, s.url);
      } catch {
        return null;
      }
    }),
  );

  return detailed
    .filter((s): s is StoreLocation => s != null && s.lat != null && s.lng != null)
    .map((s) => ({ ...s, distanceKm: haversineKm(lat, lng, s.lat!, s.lng!) }))
    .filter((s) => s.distanceKm <= 35)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

export async function reverseGeocodeCity(lat: number, lng: number): Promise<string | null> {
  try {
    const data = await fetchJson<{ address?: { city?: string; town?: string; village?: string } }>(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "VeckansFynd/1.0 (grocery-deals-app)",
        },
      },
    );
    return data.address?.city ?? data.address?.town ?? data.address?.village ?? null;
  } catch {
    return null;
  }
}

export const coopScraper = { searchStores: searchCoopStores, scrape: scrapeCoop, findNearest: findNearestCoopStores };
