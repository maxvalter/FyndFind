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
