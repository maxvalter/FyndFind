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
    color: "#E30613",
    bgColor: "bg-red-50",
    textColor: "text-red-700",
    blurb: "Lågprisvaruhus",
    defaultStoreId: "2258",
  },
  {
    id: "hemkop",
    name: "Hemköp",
    color: "#005AA0",
    bgColor: "bg-blue-50",
    textColor: "text-blue-700",
    blurb: "Närbutik med fokus på färskvaror",
    defaultStoreId: "4147",
  },
  {
    id: "ica",
    name: "ICA",
    color: "#E30613",
    bgColor: "bg-red-50",
    textColor: "text-red-700",
    blurb: "Sveriges största matkedja",
    defaultStoreId: "ica-nara-roslagstull-1003482",
  },
  {
    id: "coop",
    name: "Coop",
    color: "#00A651",
    bgColor: "bg-green-50",
    textColor: "text-green-700",
    blurb: "Kooperativ matbutik",
    defaultStoreId: "coop/coop-soder",
  },
  {
    id: "lidl",
    name: "Lidl",
    color: "#0050AA",
    bgColor: "bg-blue-50",
    textColor: "text-blue-800",
    blurb: "Europeisk discountkedja",
    defaultStoreId: "SE0335",
  },
];

export function getChainMeta(chain: ChainId): ChainMeta {
  const meta = CHAINS.find((c) => c.id === chain);
  if (!meta) throw new Error(`Unknown chain: ${chain}`);
  return meta;
}
