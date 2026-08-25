import type { ChainId } from "./types";

export interface ChainMeta {
  id: ChainId;
  name: string;
  color: string;
  bgColor: string;
  textColor: string;
  blurb: string;
  defaultStoreId: string;
}

export const CHAINS: ChainMeta[] = [
  {
    id: "willys",
    name: "Willys",
    color: "#6B7280",
    bgColor: "bg-zinc-50",
    textColor: "text-zinc-700",
    blurb: "Lågprisvaruhus",
    defaultStoreId: "2219",
  },
  {
    id: "hemkop",
    name: "Hemköp",
    color: "#E30613",
    bgColor: "bg-red-50",
    textColor: "text-red-700",
    blurb: "Närbutik med fokus på färskvaror",
    defaultStoreId: "4938",
  },
  {
    id: "ica",
    name: "Ica",
    color: "#F07070",
    bgColor: "bg-red-50",
    textColor: "text-red-500",
    blurb: "Sveriges största matkedja",
    defaultStoreId: "ica-nara-alvsjo-1004436",
  },
  {
    id: "coop",
    name: "Coop",
    color: "#00A651",
    bgColor: "bg-green-50",
    textColor: "text-green-700",
    blurb: "Kooperativ matbutik",
    defaultStoreId: "coop/coop-alvsjo",
  },
  {
    id: "lidl",
    name: "Lidl",
    color: "#0050AA",
    bgColor: "bg-blue-50",
    textColor: "text-blue-800",
    blurb: "Europeisk discountkedja",
    defaultStoreId: "SE0258",
  },
];

export function getChainMeta(chain: ChainId): ChainMeta {
  const meta = CHAINS.find((c) => c.id === chain);
  if (!meta) throw new Error(`Unknown chain: ${chain}`);
  return meta;
}

export function coopStorePath(slug: string): string {
  const clean = slug.replace(/^\/+|\/+$/g, "");
  if (clean.startsWith("coop/") || clean.startsWith("stora-coop/")) {
    return `/butiker-erbjudanden/${clean}/`;
  }
  return `/butiker-erbjudanden/coop/${clean}/`;
}

export function storeOffersUrl(chain: ChainId, storeId?: string): string | undefined {
  switch (chain) {
    case "willys":
      return storeId ? `https://www.willys.se/erbjudanden/butik/${storeId}` : undefined;
    case "hemkop":
      return storeId ? `https://www.hemkop.se/erbjudanden/${storeId}` : undefined;
    case "ica": {
      if (!storeId) return undefined;
      const slug = storeId.includes("/") ? storeId.split("/").pop()! : storeId;
      return `https://www.ica.se/erbjudanden/${slug}/`;
    }
    case "coop":
      return storeId ? `https://www.coop.se${coopStorePath(storeId)}` : undefined;
    case "lidl":
      return "https://www.lidl.se/c/reklamblad/s10018018";
  }
}
