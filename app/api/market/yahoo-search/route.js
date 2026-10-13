import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim().slice(0, 80);
  if (!q || q.length < 2) return NextResponse.json({ data: [] });

  try {
    const url = new URL("https://query1.finance.yahoo.com/v1/finance/search");
    url.searchParams.set("q", q);
    url.searchParams.set("quotesCount", "12");
    url.searchParams.set("newsCount", "0");
    url.searchParams.set("enableFuzzyQuery", "true");
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return NextResponse.json({ error: `Yahoo Finance search returned HTTP ${response.status}.` }, { status: 502 });
    }
    const payload = await response.json();
    const data = (payload?.quotes || [])
      .filter(item => item.quoteType === "EQUITY" && (item.symbol?.endsWith(".NS") || item.exchange === "NSI"))
      .map(item => ({
        yahooSymbol: item.symbol,
        symbol: item.symbol.replace(/\.NS$/i, ""),
        name: item.shortname || item.longname || item.symbol,
        exchange: item.exchange || "NSE",
        price: Number(item.regularMarketPrice) || 0,
        change: Number(item.regularMarketChangePercent) || 0,
        volume: Number(item.regularMarketVolume) || 0,
      }));
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch {
    return NextResponse.json({ error: "Could not search Yahoo Finance right now. Try the exact NSE symbol, such as RELIANCE." }, { status: 502 });
  }
}
