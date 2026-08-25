import type { DealCategory } from "./types";

/** Short/ambiguous stems that must not match inside other words (nöt → nötter). */
const WHOLE_WORD_ONLY = new Set([
  "bär",
  "färs",
  "fil",
  "kaka",
  "kex",
  "mjöl",
  "nöt",
  "olja",
  "ost",
  "paj",
  "ris",
  "sop",
  "te",
  "tork",
  "vatten",
  "vin",
  "öl",
]);

const RULES: { category: DealCategory; keywords: string[] }[] = [
  {
    category: "Kött & chark",
    keywords: [
      "kött",
      "fläsk",
      "nöt",
      "nötkött",
      "nötfärs",
      "nötbog",
      "kyckling",
      "korv",
      "falukorv",
      "prinskorv",
      "grillkorv",
      "wienerkorv",
      "bacon",
      "skinka",
      "färs",
      "köttfärs",
      "biff",
      "oxfilé",
      "oxbringa",
      "lamm",
      "kalkon",
      "chark",
      "salami",
      "entrecote",
      "ytterfilé",
      "innanlår",
      "karré",
      "kotlett",
      "kassler",
      "högrev",
      "revben",
      "hamburgare",
    ],
  },
  {
    category: "Fisk & skaldjur",
    keywords: [
      "fisk",
      "lax",
      "laxfilé",
      "torsk",
      "räk",
      "räka",
      "räkor",
      "skaldjur",
      "sill",
      "makrill",
      "krabba",
      "musslor",
      "tonfisk",
      "sej",
      "kolja",
      "scampi",
    ],
  },
  {
    category: "Frukt & grönt",
    keywords: [
      "frukt",
      "grönt",
      "äpple",
      "banan",
      "tomat",
      "gurka",
      "sallad",
      "potatis",
      "färskpotatis",
      "lök",
      "rödlök",
      "purjolök",
      "salladslök",
      "morot",
      "morötter",
      "paprika",
      "bär",
      "citron",
      "avokado",
      "broccoli",
      "spenat",
      "svamp",
      "kål",
      "blomkål",
      "vitkål",
      "rödkål",
      "grönkål",
      "päron",
      "melon",
      "vindruv",
      "jordgubb",
      "hallon",
      "mango",
      "ananas",
      "kiwi",
      "zucchini",
      "aubergine",
      "sparris",
    ],
  },
  {
    category: "Mejeri & ost",
    keywords: [
      "mjölk",
      "ost",
      "yoghurt",
      "grädde",
      "smör",
      "fil",
      "kvarg",
      "créme",
      "crème",
      "bregott",
      "keso",
      "ägg",
      "margarin",
    ],
  },
  {
    category: "Bröd & bakverk",
    keywords: [
      "bröd",
      "limpa",
      "fralla",
      "knäcke",
      "kaka",
      "bullar",
      "muffins",
      "tårta",
      "bakverk",
      "croissant",
      "baguette",
      "pizza",
      "paj",
    ],
  },
  {
    category: "Skafferi",
    keywords: [
      "pasta",
      "ris",
      "risgryn",
      "jasminris",
      "basmatiris",
      "konserv",
      "sås",
      "olja",
      "olivolja",
      "rapsolja",
      "krydda",
      "soppa",
      "müsli",
      "flingor",
      "havregryn",
      "mjöl",
      "vetemjöl",
      "socker",
      "kaffe",
      "te",
      "marmelad",
      "honung",
      "buljong",
    ],
  },
  {
    category: "Fryst",
    keywords: ["fryst", "frysta", "glass", "färskfryst", "fryspizza"],
  },
  {
    category: "Dryck",
    keywords: [
      "dryck",
      "läsk",
      "juice",
      "vatten",
      "öl",
      "vin",
      "cider",
      "saft",
      "energidryck",
      "kolsyrad",
      "smoothie",
    ],
  },
  {
    category: "Snacks & godis",
    keywords: [
      "chips",
      "godis",
      "choklad",
      "snacks",
      "nötter",
      "popcorn",
      "kex",
      "gelé",
      "lakrits",
      "marabou",
    ],
  },
  {
    category: "Hushåll",
    keywords: [
      "disk",
      "tvätt",
      "papper",
      "servett",
      "städ",
      "blöja",
      "toalett",
      "hushåll",
      "soppåse",
      "rengöring",
      "tork",
      "dukar",
    ],
  },
];

export function hasKeyword(text: string, keyword: string): boolean {
  if (!keyword) return false;
  const haystack = normalizeHaystack(text);
  const kw = keyword.toLowerCase();
  const escaped = escapeRegExp(kw);
  const wholeWordOnly = WHOLE_WORD_ONLY.has(kw) || [...kw].length < 3;
  const letter = "\\p{L}\\p{N}";
  const pattern = wholeWordOnly
    ? `(?<![${letter}])${escaped}(?![${letter}])`
    : `(?<![${letter}])${escaped}|${escaped}(?![${letter}])`;
  return new RegExp(pattern, "iu").test(haystack);
}

export function categorizeDeal(name: string, rawCategory?: string): DealCategory {
  const haystack = `${name} ${rawCategory ?? ""}`;

  for (const rule of RULES) {
    if (rule.keywords.some((kw) => hasKeyword(haystack, kw))) {
      return rule.category;
    }
  }

  return "Övrigt";
}

function normalizeHaystack(text: string): string {
  return text.toLowerCase().replace(/[-_/]+/g, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
