import { NextRequest, NextResponse } from "next/server";
import { refreshStoredDeals } from "@/lib/deals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const force = request.nextUrl.searchParams.get("force") === "1";
  const result = await refreshStoredDeals({ includeDefaults: true, force });
  return NextResponse.json({
    ok: true,
    ...result,
    ranAt: new Date().toISOString(),
  });
}

export const POST = GET;
