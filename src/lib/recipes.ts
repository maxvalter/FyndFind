import { hasKeyword } from "./categories";
import type { ChainId, Deal, RecipeDish, RecipeIngredient, RecipeRole } from "./types";

const PROTEIN_KEYWORDS = [
  "kyckling",
  "fläsk",
  "nötkött",
  "nötfärs",
  "nötbog",
  "oxfilé",
  "oxbringa",
  "entrecote",
  "ytterfilé",
  "innanlår",
  "biff",
  "lamm",
  "kalkon",
  "köttfärs",
  "färs",
  "hamburgare",
  "högrev",
  "karré",
  "kotlett",
  "kassler",
  "bacon",
  "skinka",
  "korv",
  "falukorv",
  "prinskorv",
  "grillkorv",
  "wienerkorv",
  "revben",
  "kött",
];

const PROTEIN_EXCLUDE = [
  "salami",
  "pepperoni",
  "leverpastej",
  "pastej",
  "paté",
  "pincho",
  "chips",
  "snacks",
  "godis",
  "korvbröd",
  "buljong",
  "fond",
];

const VEGETABLE_KEYWORDS = [
  "potatis",
  "färskpotatis",
  "lök",
  "rödlök",
  "purjolök",
  "salladslök",
  "morot",
  "morötter",
  "broccoli",
  "tomat",
  "paprika",
  "gurka",
  "sallad",
  "spenat",
  "svamp",
  "champinjon",
  "kål",
  "blomkål",
  "vitkål",
  "rödkål",
  "grönkål",
  "brysselkål",
  "zucchini",
  "squash",
  "aubergine",
  "sparris",
  "ärtor",
  "sockerärtor",
  "haricots",
  "majs",
  "selleri",
  "palsternacka",
  "kålrot",
  "rödbetor",
  "fänkål",
  "ruccola",
  "rucola",
  "mangold",
];

const VEGETABLE_EXCLUDE = [
  "chips",
  "snacks",
  "pommes",
  "krisp",
  "godis",
  "potatismos",
  "potatisgratäng",
  "oliver",
  "oliv",
];

const FRUIT_KEYWORDS = [
  "banan",
  "äpple",
  "päron",
  "apelsin",
  "vindruv",
  "melon",
  "mango",
  "ananas",
  "kiwi",
  "jordgubb",
  "hallon",
  "blåbär",
  "nektarin",
  "persika",
  "plommon",
  "klementin",
  "mandarin",
  "grapefrukt",
  "vattenmelon",
];

const MAX_VEGETABLES = 16;
export const MAX_PROTEINS = 3;

export interface RecipePick {
  proteins: Deal[];
  vegetables: Deal[];
}

export function recipeRole(deal: Pick<Deal, "name" | "brand">): RecipeRole | null {
  const haystack = `${deal.name} ${deal.brand ?? ""}`;
  if (matchesAny(haystack, PROTEIN_EXCLUDE)) return null;
  if (matchesAny(haystack, PROTEIN_KEYWORDS)) return "protein";
  if (matchesAny(haystack, FRUIT_KEYWORDS)) return null;
  if (matchesAny(haystack, VEGETABLE_EXCLUDE)) return null;
  if (matchesAny(haystack, VEGETABLE_KEYWORDS)) return "vegetable";
  return null;
}

export function vegetableType(deal: Pick<Deal, "name" | "brand">): string {
  const haystack = `${deal.name} ${deal.brand ?? ""}`;
  for (const keyword of VEGETABLE_KEYWORDS) {
    if (hasKeyword(haystack, keyword)) return keyword;
  }
  return deal.name.toLowerCase();
}

export function proteinType(deal: Pick<Deal, "name" | "brand">): string {
  const haystack = `${deal.name} ${deal.brand ?? ""}`;
  for (const keyword of PROTEIN_KEYWORDS) {
    if (hasKeyword(haystack, keyword)) return keyword;
  }
  return deal.name.toLowerCase();
}

export function pickRecipeIngredients(deals: Deal[], seed: number): RecipePick {
  const proteinDeals = deals.filter((deal) => recipeRole(deal) === "protein");
  const vegDeals = deals.filter((deal) => recipeRole(deal) === "vegetable");
  const uniqueVeg = uniqueVegetablesByType(vegDeals).sort(compareDealValue).slice(0, MAX_VEGETABLES);

  return {
    proteins: pickProteins(proteinDeals, seed),
    vegetables: uniqueVeg,
  };
}

export function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function localDayStamp(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toRecipeIngredient(deal: Deal): RecipeIngredient {
  return {
    id: deal.id,
    name: deal.name,
    chain: deal.chain,
    price: deal.price,
    imageUrl: deal.imageUrl,
    volume: deal.volume,
    savingsPercent: deal.savingsPercent,
  };
}

export function icaRecipeUrl(title: string): string {
  return `https://www.ica.se/recept/?q=${encodeURIComponent(title.trim())}`;
}

export function fallbackRecipeUrl(
  proteins: RecipeIngredient[],
  vegetables: RecipeIngredient[],
): string {
  const parts = [
    ...proteins.slice(0, 2).map((item) => item.name),
    ...vegetables.slice(0, 2).map((veg) => veg.name),
  ];
  return icaRecipeUrl(parts.join(" "));
}

export function buildRecipePrompt(
  proteins: RecipeIngredient[],
  vegetables: RecipeIngredient[],
): string {
  const vegList =
    vegetables.length > 0
      ? vegetables.map((veg) => formatIngredientLine(veg)).join("\n")
      : "(inga grönsaker på rea just nu)";
  const proteinList = proteins.map((item) => formatIngredientLine(item)).join("\n");

  return `Du är en svensk hushållskock. Föreslå exakt 3 billiga vardagsrätter baserat på dessa rea-varor.

Köttförslag (upp till tre — använd ett i varje rätt, gärna olika kött i de tre rätterna):
${proteinList}

Alla grönsaker på rea (använd de som passar, gärna flera olika i varje rätt):
${vegList}

Regler:
- Svenska vardagsrätter som går att laga hemma
- Föreslå exakt 3 rätter
- Varje rätt ska använda ett av köttförslagen
- Om det finns flera kött, variera så att olika rätter använder olika kött när det går
- Plocka från listan med grönsaker — nämn dem i titeln när de är en tydlig del av rätten
- Få extraingredienser, bara vanligt skafferi (olja, salt, peppar, ris, pasta)
- Ingen recepttext, inga steg, inga länkar
- Svara med strikt JSON: {"dishes":[{"title":"...","whyCheap":"...","extraIngredients":["ris"]}]}
- title är rättens namn på svenska (t.ex. "Ugnskyckling med broccoli")
- whyCheap är en kort mening om varför det blir billigt
- extraIngredients är bara det som inte redan finns bland rea-varorna`;
}

export function parseRecipeDishes(payload: unknown): RecipeDish[] {
  const root =
    payload && typeof payload === "object" && "dishes" in payload
      ? (payload as { dishes: unknown }).dishes
      : payload;
  if (!Array.isArray(root)) return [];

  const dishes: RecipeDish[] = [];
  for (const item of root.slice(0, 3)) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title.trim() : "";
    if (!title) continue;
    const whyCheap = typeof record.whyCheap === "string" ? record.whyCheap.trim() : "";
    const extraIngredients = Array.isArray(record.extraIngredients)
      ? record.extraIngredients
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          .map((value) => value.trim())
      : [];
    dishes.push({
      title,
      whyCheap,
      extraIngredients,
      recipeUrl: icaRecipeUrl(title),
    });
  }
  return dishes;
}

export function extractJsonPayload(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : trimmed).trim();
  return JSON.parse(raw) as unknown;
}

export function isRecipeIngredient(value: unknown): value is RecipeIngredient {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    item.id.length > 0 &&
    typeof item.name === "string" &&
    item.name.length > 0 &&
    isChainId(item.chain) &&
    typeof item.price === "number" &&
    Number.isFinite(item.price)
  );
}

function isChainId(value: unknown): value is ChainId {
  return value === "willys" || value === "hemkop" || value === "ica" || value === "coop" || value === "lidl";
}

function matchesAny(text: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => hasKeyword(text, keyword));
}

function pickProteins(deals: Deal[], seed: number): Deal[] {
  if (deals.length === 0) return [];

  const unique = uniqueByType(deals, proteinType).sort(compareDealValue);
  const rotatedUnique = rotate(unique, seed);
  const picked = rotatedUnique.slice(0, MAX_PROTEINS);
  if (picked.length >= MAX_PROTEINS) return picked;

  const remaining = deals
    .filter((deal) => !picked.some((item) => item.id === deal.id))
    .sort(compareDealValue);
  return [...picked, ...rotate(remaining, seed).slice(0, MAX_PROTEINS - picked.length)];
}

function uniqueVegetablesByType(deals: Deal[]): Deal[] {
  return uniqueByType(deals, vegetableType);
}

function uniqueByType(deals: Deal[], typeOf: (deal: Deal) => string): Deal[] {
  const byType = new Map<string, Deal>();
  for (const deal of deals) {
    const type = typeOf(deal);
    const existing = byType.get(type);
    if (!existing || compareDealValue(deal, existing) < 0) {
      byType.set(type, deal);
    }
  }
  return [...byType.values()];
}

function rotate<T>(items: T[], seed: number): T[] {
  if (items.length === 0) return [];
  const start = mod(seed, items.length);
  return items.slice(start).concat(items.slice(0, start));
}

function compareDealValue(a: Deal, b: Deal): number {
  const savings = (b.savingsPercent ?? 0) - (a.savingsPercent ?? 0);
  if (savings !== 0) return savings;
  return a.price - b.price;
}

function formatIngredientLine(item: RecipeIngredient): string {
  const volume = item.volume ? `, ${item.volume}` : "";
  const saving =
    item.savingsPercent != null && item.savingsPercent > 0 ? `, −${Math.round(item.savingsPercent)}%` : "";
  return `- ${item.name}${volume} (${item.chain}, ${item.price} kr${saving})`;
}

function mod(value: number, n: number): number {
  return ((value % n) + n) % n;
}
