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
  comparisonPrice?: string;
  memberOnly?: boolean;
  category: string;
  imageUrl?: string;
  productUrl?: string;
  validFrom?: string;
  validTo?: string;
  rawCategory?: string;
  /** Number of product variants included in this offer (e.g. Coop clusters). */
  variantCount?: number;
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

export interface SavedPlace {
  label: string;
  lat: number;
  lng: number;
}

export interface ScraperResult {
  store: StoreLocation;
  deals: Deal[];
}

export type RecipeRole = "protein" | "vegetable";

export interface RecipeIngredient {
  id: string;
  name: string;
  chain: ChainId;
  price: number;
  imageUrl?: string;
  volume?: string;
  savingsPercent?: number;
}

export interface RecipeDish {
  title: string;
  whyCheap: string;
  extraIngredients: string[];
  recipeUrl: string;
}

export interface RecipesResponse {
  dishes: RecipeDish[];
  fromCache: boolean;
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
  willys: "2219",
  hemkop: "4938",
  ica: "ica-nara-alvsjo-1004436",
  coop: "coop/coop-alvsjo",
  lidl: "SE0258",
};
