import { NextRequest, NextResponse } from "next/server";
import { geocodePlace } from "@/lib/geo";
import { findNearestStores } from "@/lib/scrapers";
import { applyPlaceCookie, applyStoresCookie } from "@/lib/stores-cookie";
import type { SavedPlace, StoreSelection } from "@/lib/types";
import { shortPlaceName } from "@/lib/utils-app";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const query = searchParams.get("q")?.trim() ?? "";
  let lat = parseFloat(searchParams.get("lat") ?? "");
  let lng = parseFloat(searchParams.get("lng") ?? "");

  if (query && (!Number.isFinite(lat) || !Number.isFinite(lng))) {
    const place = await geocodePlace(query);
    if (!place) {
      return NextResponse.json({ error: "Kunde inte hitta området" }, { status: 404 });
    }
    lat = place.lat;
    lng = place.lng;
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat och lng eller q krävs" }, { status: 400 });
  }

  try {
    const result = await findNearestStores(lat, lng, query || undefined);
    const selection: StoreSelection = {
      willys: result.willys,
      hemkop: result.hemkop,
      ica: result.ica,
      coop: result.coop,
      lidl: result.lidl,
    };
    const place: SavedPlace = {
      label: shortPlaceName(result) || result.label || query || "Din plats",
      lat: result.lat,
      lng: result.lng,
    };
    const response = NextResponse.json({
      selection,
      stores: result.stores,
      label: result.label,
      locality: result.locality,
      city: result.city,
      lat: result.lat,
      lng: result.lng,
    });
    applyStoresCookie(response, selection);
    applyPlaceCookie(response, place);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunde inte hitta butiker" },
      { status: 500 },
    );
  }
}
