import { cookies } from "next/headers";
import type { StoreSelection } from "./types";
import { DEFAULT_STORES } from "./types";

export const STORES_COOKIE = "fynd-stores";
export const STORES_COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 days

export function parseStoreSelection(raw: string | undefined): StoreSelection {
  if (!raw) return { ...DEFAULT_STORES };

  try {
    const parsed = JSON.parse(raw) as StoreSelection;
    return {
      willys: parsed.willys ?? DEFAULT_STORES.willys,
      hemkop: parsed.hemkop ?? DEFAULT_STORES.hemkop,
      ica: parsed.ica ?? DEFAULT_STORES.ica,
      coop: parsed.coop ?? DEFAULT_STORES.coop,
      lidl: parsed.lidl ?? DEFAULT_STORES.lidl,
    };
  } catch {
    return { ...DEFAULT_STORES };
  }
}

export async function readStoresCookie(): Promise<StoreSelection> {
  const cookieStore = await cookies();
  const value = cookieStore.get(STORES_COOKIE)?.value;
  return parseStoreSelection(value);
}

export function serializeStoreSelection(selection: StoreSelection): string {
  return JSON.stringify(selection);
}

export function storesCookieHeader(selection: StoreSelection): string {
  return `${STORES_COOKIE}=${encodeURIComponent(serializeStoreSelection(selection))}; Path=/; Max-Age=${STORES_COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function mergeStoreSelection(
  current: StoreSelection,
  update: Partial<StoreSelection>,
): StoreSelection {
  return { ...current, ...update };
}
