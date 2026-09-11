/** Parse Swedish price strings like "29,90 kr", "2 för 50:-", "39:-/kg" */
export function parseSwedishPrice(input: string | number | null | undefined): number | undefined {
  if (input == null) return undefined;
  if (typeof input === "number") return Number.isFinite(input) ? input : undefined;

  const cleaned = input
    .replace(/\u00a0/g, " ")
    .replace(/kr\.?/gi, "")
    .replace(/:-/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Multi-buy: "2 för 50" -> per-unit not needed for display price usually handled separately
  const multiMatch = cleaned.match(/^(\d+)\s*f[öo]r\s*([\d\s,\.]+)/i);
  if (multiMatch) {
    const count = parseInt(multiMatch[1], 10);
    const total = parsePriceNumber(multiMatch[2]);
    if (count > 0 && total != null) return Math.round((total / count) * 100) / 100;
  }

  const perKgMatch = cleaned.match(/^([\d\s,\.]+)\s*\/?\s*kg/i);
  if (perKgMatch) {
    return parsePriceNumber(perKgMatch[1]);
  }

  return parsePriceNumber(cleaned);
}

function parsePriceNumber(value: string): number | undefined {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const num = parseFloat(normalized);
  return Number.isFinite(num) ? num : undefined;
}

/** True for min–max strings like "15,95-22,66 kr" or "Spara 3,60-10,85 kr". */
export function hasPriceRange(input: string): boolean {
  return /\d(?:[\d\s,]*)\s*[-–]\s*\d/.test(input);
}

/**
 * Parse a single comparable price. Returns undefined for ranges so callers
 * do not invent one number from "15,95–22,66 kr".
 */
export function parseComparablePrice(
  input: string | number | null | undefined,
): number | undefined {
  if (input == null) return undefined;
  if (typeof input === "number") return Number.isFinite(input) ? input : undefined;
  if (hasPriceRange(input)) return undefined;
  return parseSwedishPrice(input);
}

/**
 * Lowest price from Axfood 30-day strings like "47,95 kr/st" or "20,35-23,62 kr/st".
 * For ranges, uses the lower bound (the true "lägsta" among variants).
 */
export function parseLowestHistoricalPrice(
  input: string | number | null | undefined,
): number | undefined {
  if (input == null) return undefined;
  if (typeof input === "number") return Number.isFinite(input) ? input : undefined;

  const rangeMatch = input.match(/(\d[\d\s,]*)\s*[-–]\s*(\d[\d\s,]*)/);
  if (rangeMatch) {
    const low = parsePriceNumber(rangeMatch[1]);
    const high = parsePriceNumber(rangeMatch[2]);
    if (low == null || high == null) return undefined;
    return Math.min(low, high);
  }

  return parseSwedishPrice(input);
}

export function formatSek(amount: number | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "–";
  return `${amount.toFixed(2).replace(".", ",")} kr`;
}

export type ParsedUnitPrice = { amount: number; unit: "kg" | "st" | "l" };

/** Parse "46,56 kr/kg", "149/kg", "99 kr/kg", "14,90/st", "100-137,93 kr/kg". */
export function parsePricePerUnit(text?: string): ParsedUnitPrice | undefined {
  if (!text) return undefined;
  const source = text.replace(/\u00a0/g, " ");
  const match = source.match(
    /([\d\s]+(?:[.,]\d+)?)\s*(?:[-–]\s*([\d\s]+(?:[.,]\d+)?))?\s*(?:kr)?\s*\/\s*(kg|hg|st|l|liter|100\s*g)\b/i,
  );
  if (!match) return undefined;

  const first = parsePriceNumber(match[1]);
  const second = match[2] ? parsePriceNumber(match[2]) : undefined;
  if (first == null || first <= 0) return undefined;
  const amount = second != null && second > 0 ? Math.min(first, second) : first;
  const rawUnit = match[3].toLowerCase().replace(/\s+/g, "");

  if (rawUnit === "kg") return { amount, unit: "kg" };
  if (rawUnit === "hg" || rawUnit === "100g") return { amount: amount * 10, unit: "kg" };
  if (rawUnit === "st") return { amount, unit: "st" };
  if (rawUnit === "l" || rawUnit === "liter") return { amount, unit: "l" };
  return undefined;
}

/** True when the volume field marks the *price* as per kilo, e.g. Lidl "/kg (Ca 1 kg)". */
export function volumeImpliesPerKg(volume?: string): boolean {
  if (!volume) return false;
  return /^\s*\/\s*kg\b/i.test(volume);
}

export function kilosFromVolume(volume?: string): number | undefined {
  if (!volume) return undefined;
  const text = volume.replace(/\u00a0/g, " ").toLowerCase().replace(/,/g, ".");

  const multi = text.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|hg|g)\b/);
  if (multi) {
    const count = parseFloat(multi[1]);
    const kilos = toKilos(parseFloat(multi[2]), multi[3]);
    if (count > 0 && kilos != null) return count * kilos;
  }

  const range = text.match(
    /(\d+(?:\.\d+)?)\s*(kg|hg|g)?\s*[-–]\s*(\d+(?:\.\d+)?)\s*(kg|hg|g)\b/,
  );
  if (range) {
    const unitB = range[4];
    const unitA = range[2] || unitB;
    const a = toKilos(parseFloat(range[1]), unitA);
    const b = toKilos(parseFloat(range[3]), unitB);
    if (a != null && b != null) return (a + b) / 2;
  }

  const single = text.match(/(\d+(?:\.\d+)?)\s*(kg|hg|g)\b/);
  if (!single) return undefined;
  return toKilos(parseFloat(single[1]), single[2]);
}

/**
 * Best-effort kr/kg for ranking. Prefers jämförelsepris / "kr/kg" labels, then
 * pack price divided by weight. Returns undefined when nothing comparable exists.
 */
export function comparableKrPerKg(deal: {
  price: number;
  volume?: string;
  comparisonPrice?: string;
  promotionLabel?: string;
}): number | undefined {
  const labeled =
    parsePricePerUnit(deal.comparisonPrice) ?? parsePricePerUnit(deal.promotionLabel);
  if (labeled?.unit === "kg") return labeled.amount;
  if (volumeImpliesPerKg(deal.volume)) return deal.price;

  const kilos = kilosFromVolume(deal.volume);
  if (labeled?.unit === "st" && kilos && kilos > 0) {
    return labeled.amount / kilos;
  }
  if (kilos && kilos > 0) return deal.price / kilos;
  return undefined;
}

export function formatKrPerKg(amount: number): string {
  return `${formatSek(Math.round(amount * 100) / 100)}/kg`;
}

function toKilos(amount: number, unit: string): number | undefined {
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  if (unit === "kg") return amount;
  if (unit === "hg") return amount / 10;
  if (unit === "g") return amount / 1000;
  return undefined;
}

export function calcSavingsPercent(price: number, original?: number): number | undefined {
  if (original == null || original <= 0 || price >= original) return undefined;
  return Math.round(((original - price) / original) * 100);
}

export function extractJsonFromScript(html: string, marker: string): unknown | null {
  const idx = html.indexOf(marker);
  if (idx === -1) return null;

  const start = html.indexOf("{", idx);
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function extractNextData(html: string): unknown | null {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function isoDate(d: Date = new Date()): string {
  return d.toISOString();
}

export function parseIsoDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
