import { cn } from "@/lib/utils";

export function formatPrice(amount: number | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "–";
  return `${amount.toFixed(2).replace(".", ",")} kr`;
}

export function formatDistance(km: number | undefined): string {
  if (km == null || !Number.isFinite(km)) return "";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export function filterDeals<T extends { name: string; brand?: string; category: string }>(
  deals: T[],
  search: string,
  category: string,
): T[] {
  const q = search.trim().toLowerCase();
  return deals.filter((deal) => {
    if (category !== "Alla" && deal.category !== category) return false;
    if (!q) return true;
    const haystack = `${deal.name} ${deal.brand ?? ""}`.toLowerCase();
    return haystack.includes(q);
  });
}

export function chainBadgeClass(chain: string): string {
  const map: Record<string, string> = {
    willys: "bg-red-100 text-red-800 border-red-200",
    hemkop: "bg-blue-100 text-blue-800 border-blue-200",
    ica: "bg-red-100 text-red-800 border-red-200",
    coop: "bg-green-100 text-green-800 border-green-200",
    lidl: "bg-blue-100 text-blue-900 border-blue-200",
  };
  return cn("border", map[chain] ?? "bg-muted text-muted-foreground");
}
