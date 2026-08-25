import type { Deal, ScraperResult, StoreLocation } from "../types";
import { categorizeDeal } from "../categories";
import { coopStorePath, storeOffersUrl } from "../chains";
import { fetchJson, fetchText } from "../http";
import { slugify } from "../parse";
import { cacheGet, cacheSet } from "../cache";
import { sortByDistance, type GeoPoint } from "../geo";

const COOP_BASE = "https://www.coop.se";
const DKE_KEY = "32895bd5b86e4a5ab6e94fb0bc8ae234";
const STORE_KEY = "990520e65cc44eef89e9e9045b57f4e9";
const COOP_CATALOG_KEY = "catalog:coop:v2";
const COOP_CATALOG_TTL_SECONDS = 24 * 60 * 60;
const COOP_ENRICH_CONCURRENCY = 8;

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
    comparativePriceText?: string;
  };
  categoryTeam?: { name?: string };
  unifiedSplash?: { tag?: string; prefix?: string; value?: string };
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
  return coopStorePath(slug);
}

export async function searchCoopStores(query: string): Promise<StoreLocation[]> {
  const catalog = await loadCoopCatalog();
  const terms = expandCoopTerms(query);
  if (!terms.length) return catalog.slice(0, 40);
  const matched = catalog
    .map((store) => ({ store, score: scoreCoopLocation(store, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.store);
  return matched.slice(0, 40);
}

export async function findNearestCoopStores(
  lat: number,
  lng: number,
  limit = 5,
): Promise<(StoreLocation & { distanceKm: number })[]> {
  return nearestCoopStores({ lat, lng }, await loadCoopCatalog(), limit);
}

function nearestCoopStores(
  origin: GeoPoint,
  stores: StoreLocation[],
  limit: number,
): (StoreLocation & { distanceKm: number })[] {
  const withCoords = stores.filter(
    (store): store is StoreLocation & { lat: number; lng: number } =>
      store.lat != null && store.lng != null,
  );
  return sortByDistance(withCoords, origin).slice(0, limit);
}

async function loadCoopCatalog(): Promise<StoreLocation[]> {
  const cached = await cacheGet(COOP_CATALOG_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as StoreLocation[];
      if (Array.isArray(parsed) && parsed.length > 50) return parsed;
    } catch {
      /* refetch */
    }
  }

  const data = await fetchJson<{ stores?: CoopStoreListItem[] }>(
    "https://proxy.api.coop.se/external/store/stores?api-version=v1&query=coop",
    { headers: storeHeaders(STORE_KEY) },
  );
  const list = (data.stores ?? []).filter(
    (store) => typeof store.url === "string" && store.url.includes("butiker-erbjudanden"),
  );

  const detailed: StoreLocation[] = [];
  const enrich = async (store: CoopStoreListItem): Promise<StoreLocation> => {
    try {
      const detail = await fetchJson<CoopStoreDetail>(
        `https://proxy.api.coop.se/external/store/stores/${store.ledgerAccountNumber}?api-version=v1`,
        { headers: storeHeaders(STORE_KEY), timeoutMs: 12000 },
      );
      const mapped = mapCoopStore(detail, store.url);
      if (mapped.lat != null && mapped.lng != null) return mapped;
    } catch {
      /* retry below */
    }
    return mapCoopStoreFromList(store);
  };

  for (let i = 0; i < list.length; i += COOP_ENRICH_CONCURRENCY) {
    const chunk = list.slice(i, i + COOP_ENRICH_CONCURRENCY);
    detailed.push(...(await Promise.all(chunk.map(enrich))));
  }

  const missing = list.filter((_, index) => detailed[index]?.lat == null || detailed[index]?.lng == null);
  if (missing.length) {
    const retried = await Promise.all(missing.map(enrich));
    let retryIndex = 0;
    for (let i = 0; i < detailed.length; i += 1) {
      if (detailed[i]?.lat == null || detailed[i]?.lng == null) {
        detailed[i] = retried[retryIndex]!;
        retryIndex += 1;
      }
    }
  }

  await cacheSet(COOP_CATALOG_KEY, JSON.stringify(detailed), COOP_CATALOG_TTL_SECONDS);
  return detailed;
}

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o");
}

function expandCoopTerms(query: string): string[] {
  const raw = query.toLowerCase().trim();
  const ascii = fold(raw);
  const terms = new Set<string>();
  for (const token of [raw, ascii, ...raw.split(/[\s-/]+/), ...ascii.split(/[\s-/]+/)]) {
    if (token.length < 3) continue;
    terms.add(token);
    if (token.length >= 7) terms.add(token.slice(0, 5));
  }
  return [...terms];
}

function scoreCoopLocation(store: StoreLocation, terms: string[]): number {
  const haystack = fold(`${store.name} ${store.address ?? ""} ${store.city ?? ""} ${store.url ?? ""}`);
  return terms.reduce((score, term) => score + (haystack.includes(fold(term)) ? 10 : 0), 0);
}

export async function getCoopStore(slug: string): Promise<StoreLocation> {
  const path = coopSlugToPath(slug);
  const html = await fetchText(`${COOP_BASE}${path}`);
  const ledger = extractLedgerAccount(html);
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
  const slugMatch = urlPath.match(/butiker-erbjudanden\/(.+?)\/?$/);
  return {
    chain: "coop",
    id: (slugMatch?.[1] ?? detail.ledgerAccountNumber).replace(/\/+$/, ""),
    name: detail.name,
    address: detail.address?.split(",")[0]?.trim(),
    city: detail.address?.split(",").pop()?.trim(),
    lat: detail.latitude,
    lng: detail.longitude,
    url: `${COOP_BASE}${urlPath.startsWith("/") ? urlPath : `/${urlPath}`}`,
  };
}

function mapCoopStoreFromList(item: CoopStoreListItem): StoreLocation {
  const slugMatch = item.url.match(/butiker-erbjudanden\/(.+?)\/?$/);
  return {
    chain: "coop",
    id: (slugMatch?.[1] ?? item.ledgerAccountNumber).replace(/\/+$/, ""),
    name: item.name,
    url: `${COOP_BASE}${item.url}`,
  };
}

function extractLedgerAccount(html: string): string | undefined {
  const pageId = html.match(/store_page_id"\s*:\s*"(\d{4,6})"/i)?.[1];
  const raw =
    pageId ?? html.match(/ledgerAccountNumber["']?\s*:\s*"?(\d{4,6})"?/i)?.[1];
  return raw ? raw.padStart(6, "0") : undefined;
}

async function resolveLedgerAccount(slug: string): Promise<string> {
  const path = coopSlugToPath(slug);
  const html = await fetchText(`${COOP_BASE}${path}`);
  const ledger = extractLedgerAccount(html);
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
    const interiors = offer.clusterInteriorOffers ?? [];
    const deal = parseDkeOffer(offer, slug, interiors.length);
    if (deal && !seen.has(deal.id)) {
      seen.add(deal.id);
      deals.push(deal);
    }
  }

  return { store, deals };
}

function formatCoopComparisonPrice(raw?: string): string | undefined {
  if (!raw) return undefined;
  const text = raw.replace(/\u00a0/g, " ").replace(/\s+/g, " ").replace(/\.+$/, "").trim();
  if (!text) return undefined;

  const units = [...text.matchAll(/\/\s*(kg|hg|g|liter|l|st|ml|cl)\b/gi)];
  if (units.length > 1) return undefined;

  let formatted = text.replace(/\s*kr\s*/gi, " kr ").replace(/\s+/g, " ").trim();
  if (!/kr/i.test(formatted)) {
    formatted = formatted.replace(
      /(\d(?:[\d\s,.]*(?:[-–][\d\s,.]+)?)?)\s*(\/)/,
      "$1 kr$2",
    );
  }
  formatted = formatted.replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ").trim();
  return formatted || undefined;
}

function parseDkeOffer(offer: DkeOffer, slug: string, variantCount = 1): Deal | null {
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
  const splash = offer.unifiedSplash;
  const promotionLabel =
    quantity > 1
      ? splash?.prefix && splash?.value
        ? `${splash.prefix} ${splash.value}`
        : `${quantity} för ${totalPrice} kr`
      : undefined;

  const rawCategory = offer.categoryTeam?.name;

  return {
    id: `coop-${offer.id ?? slugify(name)}`,
    chain: "coop",
    name,
    brand,
    volume: content.amountInformation,
    price,
    promotionLabel,
    comparisonPrice: formatCoopComparisonPrice(
      content.formattedComparativePriceText ??
        content.enrichedComparisonPrice ??
        content.comparativePriceText,
    ),
    memberOnly,
    category: categorizeDeal(name, rawCategory),
    imageUrl,
    productUrl: storeOffersUrl("coop", slug),
    validFrom: offer.campaignStartDate?.split("T")[0],
    validTo: offer.campaignEndDate?.split("T")[0],
    rawCategory,
    variantCount: variantCount > 1 ? variantCount : undefined,
  };
}

export const coopScraper = { searchStores: searchCoopStores, scrape: scrapeCoop, findNearest: findNearestCoopStores };

