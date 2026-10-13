import { NextResponse } from "next/server";

const RANGE_MAP = {
  "1D": "1d", "5D": "5d", "1M": "1mo", "3M": "3mo",
  "6M": "6mo", "1Y": "1y", "5Y": "5y", "All": "max",
};
const INTERVAL_MAP = {
  "1m": "1m", "3m": "5m", "5m": "5m", "15m": "15m",
  "30m": "30m", "1h": "60m", "1D": "1d", "1W": "1wk", "1M": "1mo",
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const rawSymbol = (searchParams.get("symbol") || "").trim().toUpperCase();
  const rangeLabel = searchParams.get("range") || "6M";
  const intervalLabel = searchParams.get("interval") || "1D";

  if (!/^[A-Z0-9&._-]{1,30}$/.test(rawSymbol)) {
    return NextResponse.json({ error: "Provide a valid NSE stock symbol." }, { status: 400 });
  }

  const symbol = rawSymbol.endsWith(".NS") ? rawSymbol : `${rawSymbol}.NS`;
  let range = RANGE_MAP[rangeLabel] || "6mo";
  const interval = INTERVAL_MAP[intervalLabel] || "1d";
  // Yahoo limits intraday history: 1m is generally limited to about 7 days;
  // other intraday intervals are generally limited to about 60 days.
  if (interval === "1m" && !["1d", "5d"].includes(range)) range = "7d";
  else if (["5m", "15m", "30m", "60m"].includes(interval) && ["3mo", "6mo", "1y", "5y", "max"].includes(range)) range = "60d";

  // Yahoo Finance's chart endpoint is undocumented and may be rate-limited or changed.
  // This route keeps requests server-side; it is not an official or guaranteed feed.
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("range", range);
  url.searchParams.set("interval", interval);
  url.searchParams.set("includePrePost", "false");
  url.searchParams.set("events", "div,splits");

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      return NextResponse.json({ error: `Yahoo Finance returned HTTP ${response.status}. Try again later.` }, { status: 502 });
    }
    const payload = await response.json();
    const result = payload?.chart?.result?.[0];
    if (payload?.chart?.error || !result) {
      return NextResponse.json({ error: payload?.chart?.error?.description || `No Yahoo Finance data found for ${symbol}.` }, { status: 404 });
    }

    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const candles = timestamps.map((time, index) => ({
      time,
      open: quote.open?.[index],
      high: quote.high?.[index],
      low: quote.low?.[index],
      close: quote.close?.[index],
      volume: quote.volume?.[index] || 0,
    })).filter(c => [c.open, c.high, c.low, c.close].every(Number.isFinite));

    const meta = result.meta || {};
    const last = candles[candles.length - 1];
    const previous = candles[candles.length - 2];
    const price = Number.isFinite(meta.regularMarketPrice) ? meta.regularMarketPrice : last?.close;
    const previousClose = Number.isFinite(meta.chartPreviousClose) ? meta.chartPreviousClose : previous?.close;
    const change = Number.isFinite(price) && Number.isFinite(previousClose) && previousClose !== 0
      ? ((price - previousClose) / previousClose) * 100 : 0;

    return NextResponse.json({
      symbol: rawSymbol,
      yahooSymbol: symbol,
      currency: meta.currency || "INR",
      price: Number.isFinite(price) ? price : null,
      volume: last?.volume || 0,
      change,
      candles,
      marketState: meta.marketState || "UNKNOWN",
      exchangeTimezoneName: meta.exchangeTimezoneName || "Asia/Kolkata",
      fetchedAt: new Date().toISOString(),
      source: "Yahoo Finance chart endpoint (unofficial)",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error?.name === "TimeoutError" ? "Yahoo Finance request timed out." : "Unable to reach Yahoo Finance right now." }, { status: 502 });
  }
}
