export type ChainId = "willys" | "hemkop" | "ica" | "coop" | "lidl";

export interface StoreLocation {
  chain: ChainId;
  id: string;
  name: string;
  address?: string;
  city?: string;
  lat?: number;
  lng?: number;
  distanceKm?: number;
  url?: string;
}

export interface Deal {
  id: string;
  chain: ChainId;
  name: string;
  brand?: string;
  volume?: string;
  price: number;
  originalPrice?: number;
  savingsPercent?: number;
  promotionLabel?: string;
  memberOnly?: boolean;
  category: string;
  imageUrl?: string;
  productUrl?: string;
  validFrom?: string;
  validTo?: string;
  rawCategory?: string;
}

export interface ChainStatus {
  chain: ChainId;
  ok: boolean;
  storeName?: string;
  dealCount?: number;
  error?: string;
  durationMs?: number;
}

export interface DealsResponse {
  deals: Deal[];
  statuses: ChainStatus[];
  fetchedAt: string;
  fromCache: boolean;
}

export interface StoreSelection {
  willys?: string;
  hemkop?: string;
  ica?: string;
  coop?: string;
  lidl?: string;
}

export interface ScraperResult {
  store: StoreLocation;
  deals: Deal[];
}

export type DealCategory =
  | "Alla"
  | "Kött & chark"
  | "Fisk & skaldjur"
  | "Frukt & grönt"
  | "Mejeri & ost"
  | "Bröd & bakverk"
  | "Skafferi"
  | "Fryst"
  | "Dryck"
  | "Snacks & godis"
  | "Hushåll"
  | "Övrigt";

export const DEAL_CATEGORIES: DealCategory[] = [
  "Alla",
  "Kött & chark",
  "Fisk & skaldjur",
  "Frukt & grönt",
  "Mejeri & ost",
  "Bröd & bakverk",
  "Skafferi",
  "Fryst",
  "Dryck",
  "Snacks & godis",
  "Hushåll",
  "Övrigt",
];

export const DEFAULT_STORES: StoreSelection = {
  willys: "2258",
  hemkop: "4147",
  ica: "ica-nara-roslagstull-1003482",
  coop: "coop/coop-soder",
  lidl: "SE0335",
};
