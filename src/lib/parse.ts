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

export function formatSek(amount: number | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "–";
  return `${amount.toFixed(2).replace(".", ",")} kr`;
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
