import { NextRequest, NextResponse } from "next/server";
import { findNearestStores } from "@/lib/scrapers";
import { storesCookieHeader } from "@/lib/stores-cookie";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat och lng krävs" }, { status: 400 });
  }

  try {
    const { stores, ...selection } = await findNearestStores(lat, lng);
    const response = NextResponse.json({ selection, stores });
    response.headers.set("Set-Cookie", storesCookieHeader(selection));
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunde inte hitta butiker" },
      { status: 500 },
    );
  }
}
