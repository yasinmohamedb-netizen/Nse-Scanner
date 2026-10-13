import { NextResponse } from "next/server";
import { loadNseUniverse } from "../../../../lib/nse-universe-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function fetchQuote(stock) {
  const symbol = stock.symbol;
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol + ".NS")}`);
  url.searchParams.set("range", "5d");
  url.searchParams.set("interval", "1d");
  url.searchParams.set("includePrePost", "false");
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) return { symbol, error: `Yahoo Finance HTTP ${response.status}` };
    const payload = await response.json();
    const result = payload?.chart?.result?.[0];
    if (payload?.chart?.error || !result) return { symbol, error: payload?.chart?.error?.description || "No data" };
    const quote = result.indicators?.quote?.[0] || {};
    const timestamps = result.timestamp || [];
    let lastIndex = -1;
    for (let i = timestamps.length - 1; i >= 0; i--) {
      if (Number.isFinite(quote.close?.[i])) { lastIndex = i; break; }
    }
    const meta = result.meta || {};
    const close = lastIndex >= 0 ? quote.close[lastIndex] : null;
    const price = Number.isFinite(meta.regularMarketPrice) ? meta.regularMarketPrice : close;
    const volume = lastIndex >= 0 ? (quote.volume?.[lastIndex] || 0) : 0;
    const previousClose = Number.isFinite(meta.chartPreviousClose) ? meta.chartPreviousClose : (lastIndex > 0 ? quote.close[lastIndex - 1] : null);
    const change = Number.isFinite(price) && Number.isFinite(previousClose) && previousClose
      ? ((price - previousClose) / previousClose) * 100 : 0;
    if (!Number.isFinite(price)) return { symbol, error: "No valid price returned" };
    return { symbol, name: stock.name || symbol, market: stock.market, price, volume, change, error: null };
  } catch (e) {
    return { symbol, error: e?.name === "TimeoutError" ? "Yahoo Finance timed out" : "Yahoo Finance unavailable" };
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const offset = Math.max(0, Number.parseInt(searchParams.get("offset") || "0", 10) || 0);
  const requestedLimit = Number.parseInt(searchParams.get("limit") || "30", 10) || 30;
  const limit = Math.min(40, Math.max(1, requestedLimit));
  const universe = await loadNseUniverse();
  const batch = universe.stocks.slice(offset, offset + limit);
  const concurrency = 5;
  const results = [];
  for (let i = 0; i < batch.length; i += concurrency) {
    results.push(...await Promise.all(batch.slice(i, i + concurrency).map(fetchQuote)));
  }
  return NextResponse.json({
    data: results.filter(item => !item.error),
    errors: results.filter(item => item.error).map(({ symbol, error }) => ({ symbol, error })),
    offset, scanned: batch.length, total: universe.stocks.length,
    nextOffset: offset + batch.length < universe.stocks.length ? offset + batch.length : null,
    universeSource: universe.source, fallbackUniverse: universe.fallback, universeWarnings: universe.warnings,
    fetchedAt: new Date().toISOString(), source: "Yahoo Finance unofficial chart endpoint",
  }, { headers: { "Cache-Control": "no-store" } });
}
