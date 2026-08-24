import type { StoreLocation } from "./types";

/** Rank store search results by query term relevance. */
export function rankStoreResults(
  stores: StoreLocation[],
  query: string,
): StoreLocation[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return stores;

  return [...stores].sort((a, b) => score(b, terms) - score(a, terms));
}

function score(store: StoreLocation, terms: string[]): number {
  const haystack = `${store.name} ${store.address ?? ""} ${store.city ?? ""}`.toLowerCase();
  let points = 0;
  for (const term of terms) {
    if (haystack.includes(term)) points += 10;
    if (store.name.toLowerCase().includes(term)) points += 5;
    if (store.city?.toLowerCase().includes(term)) points += 3;
  }
  return points;
}
