import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import type { SavedPlace, StoreSelection } from "./types";
import { DEFAULT_STORES } from "./types";

export const STORES_COOKIE = "fynd-stores";
export const PLACE_COOKIE = "fynd-place";
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

export function applyStoresCookie(response: NextResponse, selection: StoreSelection): void {
  response.cookies.set(STORES_COOKIE, serializeStoreSelection(selection), {
    path: "/",
    maxAge: STORES_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
}

export function parseSavedPlace(raw: string | undefined): SavedPlace | null {
  if (!raw) return null;
  const candidates = [raw];
  try {
    candidates.unshift(decodeURIComponent(raw));
  } catch {
    // Cookie may already be decoded JSON.
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Partial<SavedPlace>;
      if (
        typeof parsed.label !== "string" ||
        !parsed.label.trim() ||
        !Number.isFinite(parsed.lat) ||
        !Number.isFinite(parsed.lng)
      ) {
        continue;
      }
      return { label: parsed.label.trim(), lat: parsed.lat!, lng: parsed.lng! };
    } catch {
      continue;
    }
  }
  return null;
}

export async function readPlaceCookie(): Promise<SavedPlace | null> {
  const cookieStore = await cookies();
  return parseSavedPlace(cookieStore.get(PLACE_COOKIE)?.value);
}

export function applyPlaceCookie(response: NextResponse, place: SavedPlace): void {
  response.cookies.set(PLACE_COOKIE, encodeURIComponent(JSON.stringify(place)), {
    path: "/",
    maxAge: STORES_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
}

export function mergeStoreSelection(
  current: StoreSelection,
  update: Partial<StoreSelection>,
): StoreSelection {
  return { ...current, ...update };
}
