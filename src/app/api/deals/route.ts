import { NextRequest, NextResponse } from "next/server";
import { getDealsForSelection } from "@/lib/deals";
import { DEFAULT_STORES, type StoreSelection } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  const payload = await getDealsForSelection(selection, { refresh });
  return NextResponse.json(payload);
}
