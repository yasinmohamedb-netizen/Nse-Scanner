import { NextResponse } from "next/server";
import { loadNseUniverse } from "../../../../lib/nse-universe-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  try {
    const universe = await loadNseUniverse();
    return NextResponse.json({
      stocks: universe.stocks,
      count: universe.stocks.length,
      source: universe.source,
      fallback: universe.fallback,
      warnings: universe.warnings,
      fetchedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Unable to load NSE stock list." }, { status: 502 });
  }
}
