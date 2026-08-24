import { NextRequest, NextResponse } from "next/server";
import { rankStoreResults } from "@/lib/store-search";
import { searchStoresInChain } from "@/lib/scrapers";
import type { ChainId } from "@/lib/types";

export const dynamic = "force-dynamic";

const CHAINS: ChainId[] = ["willys", "hemkop", "ica", "coop", "lidl"];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const chain = searchParams.get("chain") as ChainId | null;
  const q = searchParams.get("q") ?? "";

  if (!chain || !CHAINS.includes(chain)) {
    return NextResponse.json({ error: "Ogiltig kedja" }, { status: 400 });
  }

  if (!q.trim()) {
    return NextResponse.json({ stores: [] });
  }

  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  try {
    const stores = rankStoreResults(
      await searchStoresInChain(
        chain,
        q,
        lat ? parseFloat(lat) : undefined,
        lng ? parseFloat(lng) : undefined,
      ),
      q,
    );
    return NextResponse.json({ stores: stores.slice(0, 30) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sökningen misslyckades", stores: [] },
      { status: 500 },
    );
  }
}
