import { fetchJson } from "./http";

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface GeoPlace extends GeoPoint {
  label: string;
  locality?: string;
  city?: string;
}

interface NominatimAddress {
  suburb?: string;
  neighbourhood?: string;
  city_district?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  city?: string;
  municipality?: string;
}

interface NominatimResult {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: NominatimAddress;
}

const NOMINATIM_HEADERS = {
  Accept: "application/json",
  "User-Agent": "VeckansFynd/1.0 (grocery-deals-app)",
};

export function sortByDistance<T extends GeoPoint>(
  items: T[],
  origin: GeoPoint,
): (T & { distanceKm: number })[] {
  return items
    .map((item) => ({
      ...item,
      distanceKm: haversineKm(origin.lat, origin.lng, item.lat, item.lng),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export function nearest<T extends GeoPoint>(
  items: T[],
  origin: GeoPoint,
): (T & { distanceKm: number }) | undefined {
  const sorted = sortByDistance(items, origin);
  return sorted[0];
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeoPlace | null> {
  try {
    const data = await fetchJson<NominatimResult>(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
      { headers: NOMINATIM_HEADERS, timeoutMs: 8000 },
    );
    return toPlace(data, lat, lng);
  } catch {
    return null;
  }
}

export async function geocodePlace(query: string): Promise<GeoPlace | null> {
  const q = query.trim();
  if (!q) return null;

  try {
    const results = await fetchJson<NominatimResult[]>(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`${q}, Sverige`)}&format=json&addressdetails=1&countrycodes=se&limit=5`,
      { headers: NOMINATIM_HEADERS, timeoutMs: 8000 },
    );
    const ranked = [...results]
      .map((hit) => ({
        hit,
        lat: parseFloat(hit.lat ?? ""),
        lng: parseFloat(hit.lon ?? ""),
        score: scoreNominatim(hit, q),
      }))
      .filter((entry) => Number.isFinite(entry.lat) && Number.isFinite(entry.lng))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best) return null;
    return toPlace(best.hit, best.lat, best.lng, q);
  } catch {
    return null;
  }
}

export function searchQueriesForPlace(place: GeoPlace | null, extra?: string): string[] {
  return uniqueStrings([
    extra,
    place?.locality,
    place?.city,
  ]);
}

function scoreNominatim(hit: NominatimResult, query: string): number {
  const q = query.toLowerCase();
  const address = hit.address;
  const fields = [
    address?.suburb,
    address?.neighbourhood,
    address?.city_district,
    address?.town,
    address?.village,
    address?.hamlet,
    address?.city,
    hit.display_name?.split(",")[0],
  ];
  let score = 0;
  for (const field of fields) {
    if (!field) continue;
    const value = field.toLowerCase();
    if (value === q) score += 50;
    else if (value.startsWith(q) || q.startsWith(value)) score += 25;
    else if (value.includes(q)) score += 10;
  }
  return score;
}

function toPlace(
  data: NominatimResult,
  lat: number,
  lng: number,
  fallbackLabel?: string,
): GeoPlace | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const address = data.address;
  const city =
    address?.city ??
    address?.town ??
    address?.village ??
    municipalityCity(address?.municipality);
  const locality =
    districtFromDisplay(data.display_name, city) ??
    address?.suburb ??
    address?.neighbourhood ??
    address?.city_district ??
    address?.town ??
    address?.village ??
    address?.hamlet ??
    fallbackLabel;
  const label =
    locality && city && locality !== city
      ? `${locality}, ${city}`
      : locality ?? city ?? fallbackLabel ?? data.display_name?.split(",")[0]?.trim();

  if (!label) return { lat, lng, label: fallbackLabel ?? "din plats" };

  return { lat, lng, label, locality, city };
}

function districtFromDisplay(displayName: string | undefined, city?: string): string | undefined {
  if (!displayName) return undefined;
  const parts = displayName.split(",").map((part) => part.trim()).filter(Boolean);
  const skip = /^(?:\d|sverige$|.*kommun$|.*län$|.*stadsdelsomr)/i;
  const roadLike = /(?:vägen|gatan|väg|gata|gränd|torg|plan|allén|allé)$/i;
  const named = parts.filter((part) => {
    if (city && part.toLowerCase() === city.toLowerCase()) return false;
    if (skip.test(part)) return false;
    if (/^\d/.test(part)) return false;
    if (roadLike.test(part)) return false;
    return true;
  });
  return named.at(-1);
}

function municipalityCity(municipality?: string): string | undefined {
  if (!municipality) return undefined;
  return municipality.replace(/s?\s+kommun$/i, "").trim() || municipality;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}
