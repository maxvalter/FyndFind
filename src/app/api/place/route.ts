import { NextRequest, NextResponse } from "next/server";
import { geocodePlace, reverseGeocode } from "@/lib/geo";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const query = searchParams.get("q")?.trim() ?? "";
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");

  if (query) {
    const place = await geocodePlace(query);
    if (!place) {
      return NextResponse.json({ error: "Kunde inte hitta området" }, { status: 404 });
    }
    return NextResponse.json(place);
  }

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const place = await reverseGeocode(lat, lng);
    return NextResponse.json(place ?? { lat, lng, label: "Vald plats" });
  }

  return NextResponse.json({ error: "q eller lat och lng krävs" }, { status: 400 });
}
