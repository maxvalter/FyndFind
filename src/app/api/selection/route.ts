import { NextRequest, NextResponse } from "next/server";
import { applyStoresCookie, mergeStoreSelection } from "@/lib/stores-cookie";
import { DEFAULT_STORES, type StoreSelection } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: Partial<StoreSelection> = {};
  try {
    body = (await request.json()) as Partial<StoreSelection>;
  } catch {
    body = {};
  }

  const selection = mergeStoreSelection(DEFAULT_STORES, body);

  const response = NextResponse.json({ ok: true, selection });
  applyStoresCookie(response, selection);
  return response;
}
