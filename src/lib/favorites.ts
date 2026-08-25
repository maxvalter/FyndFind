import type { Deal } from "./types";

export const FAVORITES_STORAGE_KEY = "fynd-favorites";

function isFavoriteDeal(value: unknown): value is Deal {
  if (!value || typeof value !== "object") return false;
  const deal = value as Deal;
  return (
    typeof deal.id === "string" &&
    typeof deal.name === "string" &&
    typeof deal.chain === "string" &&
    typeof deal.price === "number"
  );
}

export function readFavoriteDeals(): Deal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isFavoriteDeal);
  } catch {
    return [];
  }
}

export function writeFavoriteDeals(deals: Deal[]): void {
  try {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(deals));
  } catch {
    // Private mode or quota — keep favorites in memory for the session.
  }
}

export function refreshFavoriteDeals(favorites: Deal[], latest: Deal[]): Deal[] {
  if (favorites.length === 0 || latest.length === 0) return favorites;
  const byId = new Map(latest.map((deal) => [deal.id, deal]));
  let changed = false;
  const next = favorites.map((fav) => {
    const fresh = byId.get(fav.id);
    if (!fresh) return fav;
    if (
      fresh.price === fav.price &&
      fresh.originalPrice === fav.originalPrice &&
      fresh.savingsPercent === fav.savingsPercent &&
      fresh.promotionLabel === fav.promotionLabel &&
      fresh.name === fav.name &&
      fresh.imageUrl === fav.imageUrl
    ) {
      return fav;
    }
    changed = true;
    return fresh;
  });
  return changed ? next : favorites;
}
