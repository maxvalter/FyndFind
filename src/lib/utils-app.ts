import { cn } from "@/lib/utils";
import { parseSwedishPrice } from "@/lib/parse";

export function formatPrice(amount: number | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "–";
  return `${amount.toFixed(2).replace(".", ",")} kr`;
}

const MULTI_BUY_RE = /(\d+)\s*f[öo]r\s*([\d\s]+(?:[,.]\d+)?)\s*(?::-|kr)?/i;

export function parseMultiBuyOffer(label?: string): { count: number; total: number } | null {
  if (!label) return null;
  const match = label.match(MULTI_BUY_RE);
  if (!match) return null;
  const count = parseInt(match[1], 10);
  const total = parseFloat(match[2].replace(/\s/g, "").replace(",", "."));
  if (count < 2 || !Number.isFinite(total) || total <= 0) return null;
  return { count, total };
}

export function formatCompactSek(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  if (Number.isInteger(rounded)) return `${rounded} kr`;
  return `${rounded.toFixed(2).replace(".", ",")} kr`;
}

export function formatMultiBuyHero(offer: { count: number; total: number }): string {
  return `${offer.count} för ${formatCompactSek(offer.total)}`;
}

export function isTemporaryOfferLabel(label?: string): boolean {
  return Boolean(label && /tillfälligt/i.test(label));
}

export function isRedundantPriceLabel(label: string | undefined, price: number): boolean {
  if (!label) return true;
  const parsed = parseSwedishPrice(label.split("/")[0]);
  if (parsed == null) return false;
  return Math.abs(parsed - price) < 0.05;
}

export function formatDistance(km: number | undefined): string {
  if (km == null || !Number.isFinite(km)) return "";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export const DISCOUNT_LEVELS = [
  { value: 0, label: "Alla" },
  { value: 10, label: "10 %+" },
  { value: 20, label: "20 %+" },
  { value: 30, label: "30 %+" },
  { value: 50, label: "50 %+" },
] as const;

export type MinDiscount = (typeof DISCOUNT_LEVELS)[number]["value"];

export function filterDeals<
  T extends {
    name: string;
    brand?: string;
    category: string;
    chain?: string;
    savingsPercent?: number;
  },
>(
  deals: T[],
  search: string,
  category: string,
  options?: {
    chains?: ReadonlySet<string> | readonly string[];
    minDiscount?: number;
  },
): T[] {
  const q = search.trim().toLowerCase();
  const chainOption = options?.chains;
  const chains =
    chainOption == null
      ? null
      : chainOption instanceof Set
        ? chainOption
        : new Set(chainOption);
  const minDiscount = options?.minDiscount ?? 0;

  return deals.filter((deal) => {
    if (chains && (deal.chain == null || !chains.has(deal.chain))) return false;
    if (minDiscount > 0 && (deal.savingsPercent ?? 0) < minDiscount) return false;
    if (category !== "Alla" && deal.category !== category) return false;
    if (!q) return true;
    const haystack = `${deal.name} ${deal.brand ?? ""} ${deal.category}`.toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    return terms.every((term) => haystack.includes(term));
  });
}

export function chainBadgeClass(chain: string): string {
  const map: Record<string, string> = {
    willys: "bg-zinc-100 text-zinc-700 border-zinc-300",
    hemkop: "bg-red-100 text-red-800 border-red-200",
    ica: "bg-red-50 text-red-500 border-red-200",
    coop: "bg-green-100 text-green-800 border-green-200",
    lidl: "bg-blue-100 text-blue-900 border-blue-200",
  };
  return cn("border", map[chain] ?? "bg-muted text-muted-foreground");
}

export function shortPlaceName(
  place?: { label?: string; locality?: string; city?: string } | null,
): string {
  const locality = place?.locality?.trim();
  if (locality) return locality;
  const city = place?.city?.trim();
  if (city) return city;
  const label = place?.label?.trim();
  if (!label) return "";
  return label.split(",")[0]?.trim() ?? label;
}

export function formatVariantCount(count: number): string {
  return count === 1 ? "1 variant" : `${count} varianter`;
}
