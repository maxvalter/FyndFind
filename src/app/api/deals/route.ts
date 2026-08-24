import { NextRequest, NextResponse } from "next/server";
import { getCachedDeals, selectionCacheKey, setCachedDeals } from "@/lib/cache";
import { scrapeAllChains } from "@/lib/scrapers";
import { DEFAULT_STORES, type StoreSelection } from "@/lib/types";

export const dynamic = "force-dynamic";

function parseSelection(searchParams: URLSearchParams): StoreSelection {
  return {
    willys: searchParams.get("willys") ?? DEFAULT_STORES.willys,
    hemkop: searchParams.get("hemkop") ?? DEFAULT_STORES.hemkop,
    ica: searchParams.get("ica") ?? DEFAULT_STORES.ica,
    coop: searchParams.get("coop") ?? DEFAULT_STORES.coop,
    lidl: searchParams.get("lidl") ?? DEFAULT_STORES.lidl,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const selection = parseSelection(searchParams);
  const refresh = searchParams.get("refresh") === "1";
  const cacheKey = selectionCacheKey(selection);

  if (!refresh) {
    const cached = getCachedDeals(cacheKey);
    if (cached) {
      return NextResponse.json({
        deals: cached.deals,
        statuses: cached.statuses,
        fetchedAt: cached.fetchedAt,
        fromCache: true,
      });
    }
  }

  const { deals, statuses } = await scrapeAllChains(selection);
  const fetchedAt = new Date().toISOString();

  setCachedDeals(cacheKey, { deals, statuses, fetchedAt });

  return NextResponse.json({
    deals,
    statuses,
    fetchedAt,
    fromCache: false,
  });
}
