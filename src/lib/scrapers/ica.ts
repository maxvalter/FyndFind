import type { Deal, ScraperResult, StoreLocation } from "../types";
import { categorizeDeal } from "../categories";
import { fetchJson, fetchText } from "../http";
import { calcSavingsPercent, parseSwedishPrice, slugify } from "../parse";

const ICA_STORE_SEARCH = "https://www.ica.se/api/store/search";

interface IcaStoreDoc {
  Id: number;
  Name: string;
  MarketingName?: string;
  VisitingAddress?: string;
  VisitingCity?: string;
  Latitude?: string;
  Longitude?: string;
  Url?: string;
  Urls?: { Type?: string; Url?: string }[];
}

interface IcaOffer {
  id: string;
  details?: {
    name?: string;
    brand?: string;
    packageInformation?: string;
    mechanicInfo?: string;
  };
  category?: { articleGroupName?: string };
  parsedMechanics?: {
    type?: string;
    value1?: string;
    value2?: string;
    quantity?: number;
  };
  stores?: {
    regularPrice?: string;
    referencePriceText?: string;
    storeMarketingName?: string;
  }[];
  picture?: { baseUrl?: string; fileName?: string };
  validTo?: string;
  restriction?: string;
  comparisonPrice?: string;
}

function offerSlugFromStoreId(storeSlug: string): string {
  // storeSlug like ica-nara-roslagstull-1003482
  return storeSlug.includes("/") ? storeSlug.split("/").pop()! : storeSlug;
}

export async function searchIcaStores(query: string): Promise<StoreLocation[]> {
  const text = await fetchText(`${ICA_STORE_SEARCH}?q=${encodeURIComponent(query)}`, {
    headers: { Accept: "application/json" },
  });
  const jsonStart = text.indexOf('{"Documents"');
  if (jsonStart === -1) return [];
  const data = JSON.parse(text.slice(jsonStart)) as { Documents: IcaStoreDoc[] };

  return data.Documents.map((doc) => {
    const offerUrl = doc.Urls?.find((u) => u.Type === "Erbjudande")?.Url;
    const slug = offerUrl?.match(/\/erbjudanden\/([^/]+)/)?.[1] ?? slugFromUrl(doc.Url);
    return {
      chain: "ica" as const,
      id: slug ?? String(doc.Id),
      name: doc.MarketingName || doc.Name,
      address: doc.VisitingAddress,
      city: doc.VisitingCity,
      lat: doc.Latitude ? parseFloat(doc.Latitude) : undefined,
      lng: doc.Longitude ? parseFloat(doc.Longitude) : undefined,
      url: offerUrl ?? doc.Url,
    };
  });
}

function slugFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const match = url.match(/\/butiker\/[^/]+\/[^/]+\/([^/]+)/);
  return match?.[1];
}

export async function scrapeIca(storeSlug: string): Promise<ScraperResult> {
  const slug = offerSlugFromStoreId(storeSlug);
  const pageUrl = `https://www.ica.se/erbjudanden/${slug}/`;
  const html = await fetchText(pageUrl);

  const store = parseStoreFromHtml(html, slug, pageUrl);
  const weeklyOffers = extractWeeklyOffers(html);

  const deals = weeklyOffers
    .map((offer) => parseIcaOffer(offer, slug))
    .filter((d): d is Deal => d != null);

  return { store, deals };
}

function parseStoreFromHtml(html: string, slug: string, pageUrl: string): StoreLocation {
  const nameMatch = html.match(/"storeName":"([^"]+)"/);
  const latMatch = html.match(/"Latitude":"([^"]+)"/);
  const lngMatch = html.match(/"Longitude":"([^"]+)"/);
  const addressMatch = html.match(/"VisitingAddress":"([^"]+)"/);
  const cityMatch = html.match(/"VisitingCity":"([^"]+)"/);

  return {
    chain: "ica",
    id: slug,
    name: decodeUnicode(nameMatch?.[1]) ?? "ICA-butik",
    address: decodeUnicode(addressMatch?.[1]),
    city: decodeUnicode(cityMatch?.[1]),
    lat: latMatch ? parseFloat(latMatch[1]) : undefined,
    lng: lngMatch ? parseFloat(lngMatch[1]) : undefined,
    url: pageUrl,
  };
}

function decodeUnicode(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value;
  }
}

function extractWeeklyOffers(html: string): IcaOffer[] {
  const marker = '"weeklyOffers":[';
  const idx = html.indexOf(marker);
  if (idx === -1) return [];

  const start = html.indexOf("[", idx);
  let depth = 0;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        const blob = html.slice(start, i + 1)
          .replace(/\bundefined\b/g, "null")
          .replace(/new Map\(\[\]\)/g, "[]");
        try {
          return JSON.parse(blob) as IcaOffer[];
        } catch {
          return [];
        }
      }
    }
  }
  return [];
}

function parseIcaOffer(offer: IcaOffer, storeSlug: string): Deal | null {
  const details = offer.details ?? {};
  const name = [details.name, details.brand].filter(Boolean).join(", ").trim();
  if (!name) return null;

  const storeInfo = offer.stores?.[0];
  const regularRange = storeInfo?.regularPrice ?? "";
  const originalPrice = parsePriceRangeHigh(regularRange);
  const mechanics = offer.parsedMechanics;

  let price = originalPrice ?? 0;
  let promotionLabel = details.mechanicInfo || offer.comparisonPrice;

  if (mechanics?.value1 && mechanics.value2) {
    promotionLabel = `${mechanics.value1} ${mechanics.value2}`.trim();
    if (mechanics.quantity && mechanics.quantity > 1) {
      const total = parseSwedishPrice(mechanics.value2);
      if (total) price = Math.round((total / mechanics.quantity) * 100) / 100;
    } else {
      price = parseSwedishPrice(mechanics.value2) ?? price;
    }
  }

  if (price <= 0 && originalPrice) {
    price = originalPrice * 0.85;
  }
  if (price <= 0) return null;

  const imageUrl =
    offer.picture?.baseUrl && offer.picture.fileName
      ? `https://assets.icanet.se/${offer.picture.fileName}`
      : undefined;

  const rawCategory = offer.category?.articleGroupName;

  return {
    id: `ica-${offer.id}`,
    chain: "ica",
    name,
    brand: details.brand,
    volume: details.packageInformation,
    price,
    originalPrice: originalPrice && originalPrice > price ? originalPrice : undefined,
    savingsPercent: calcSavingsPercent(price, originalPrice),
    promotionLabel: promotionLabel ?? undefined,
    memberOnly: /stammis/i.test(offer.restriction ?? ""),
    category: categorizeDeal(name, rawCategory),
    imageUrl,
    productUrl: `https://www.ica.se/erbjudanden/${storeSlug}/`,
    validTo: offer.validTo?.split("T")[0],
    rawCategory,
  };
}

function parsePriceRangeHigh(value: string): number | undefined {
  const parts = value.replace(/:/g, ",").split("-");
  const nums = parts.map((p) => parseSwedishPrice(p)).filter((n): n is number => n != null);
  if (!nums.length) return undefined;
  return Math.max(...nums);
}

export const icaScraper = { searchStores: searchIcaStores, scrape: scrapeIca };
