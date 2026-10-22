import { NextResponse } from "next/server";
import { loadNseUniverse } from "../../../../lib/nse-universe-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function istDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

function istMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find(p => p.type === "hour")?.value || 0);
  const minute = Number(parts.find(p => p.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

async function fetchDaily(symbol) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol + ".NS")}`);
  url.searchParams.set("range", "3mo");
  url.searchParams.set("interval", "1d");
  url.searchParams.set("includePrePost", "false");
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) return { symbol, error: `Yahoo Finance HTTP ${response.status}` };
    const payload = await response.json();
    const result = payload?.chart?.result?.[0];
    if (payload?.chart?.error || !result) return { symbol, error: payload?.chart?.error?.description || "No daily candles" };
    const quote = result.indicators?.quote?.[0] || {};
    const timestamps = result.timestamp || [];
    const candles = timestamps.map((time, i) => ({
      date: istDate(new Date(time * 1000)),
      open: quote.open?.[i], high: quote.high?.[i], low: quote.low?.[i],
      close: quote.close?.[i], volume: quote.volume?.[i] || 0,
    })).filter(c => [c.open, c.high, c.low, c.close].every(Number.isFinite));
    if (candles.length < 20) return { symbol, error: "Not enough daily history" };

    const today = istDate();
    const afterClose = istMinutes() >= 15 * 60 + 35;
    const latest = candles[candles.length - 1];
    const confirmedToday = afterClose && latest.date === today;
    if (!confirmedToday) return { symbol, noSignal: true, latestDate: latest.date };

    const todayCandle = candles[candles.length - 1];
    const prior = candles.slice(0, -1);
    const meta = result.meta || {};
    return {
      symbol,
      name: meta.longName || meta.shortName || symbol,
      price: todayCandle.close,
      volume: todayCandle.volume,
      change: prior.length ? ((todayCandle.close - prior[prior.length - 1].close) / prior[prior.length - 1].close) * 100 : 0,
      latestDate: todayCandle.date,
      candles: candles.slice(-35),
      history: prior,
    };
  } catch (error) {
    return { symbol, error: error?.name === "TimeoutError" ? "Yahoo Finance timed out" : "Yahoo Finance unavailable" };
  }
}

function evaluateBase(item, days) {
  if (!item.history || !item.price) return null;
  const history = item.history;
  if (history.length < days + 12) return null;
  const base = history.slice(-days);
  const beforeBase = history.slice(-(days + 12), -days);
  const resistance = Math.max(...base.map(c => c.high));
  const baseLow = Math.min(...base.map(c => c.low));
  const baseRangePct = baseLow > 0 ? ((resistance - baseLow) / baseLow) * 100 : Infinity;
  const earlierClose = beforeBase[0]?.close;
  const lastPriorClose = beforeBase[beforeBase.length - 1]?.close;
  const downtrend = Number.isFinite(earlierClose) && Number.isFinite(lastPriorClose) && lastPriorClose < earlierClose;
  const tightBase = baseRangePct <= 10;
  const confirmed = item.price > resistance;
  if (!downtrend || !tightBase || !confirmed) return null;
  const { history: _history, ...publicItem } = item;
  return {
    ...publicItem, resistance, baseLow, baseRangePct: Number(baseRangePct.toFixed(2)),
    baseDays: days, breakoutPct: Number((((item.price - resistance) / resistance) * 100).toFixed(2)),
    signal: "Confirmed close above resistance",
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const offset = Math.max(0, Number.parseInt(searchParams.get("offset") || "0", 10) || 0);
  const requestedLimit = Number.parseInt(searchParams.get("limit") || "20", 10) || 20;
  const limit = Math.min(30, Math.max(1, requestedLimit));
  const requestedDays = Number.parseInt(searchParams.get("days") || "5", 10) || 5;
  const days = Math.min(9, Math.max(3, requestedDays));
  const universe = await loadNseUniverse();
  const batch = universe.stocks.slice(offset, offset + limit);
  const results = [];
  const concurrency = 3;
  for (let i = 0; i < batch.length; i += concurrency) {
    results.push(...await Promise.all(batch.slice(i, i + concurrency).map(stock => fetchDaily(stock.symbol))));
  }
  const data = results.map(item => evaluateBase(item, days)).filter(Boolean);
  const errors = results.filter(item => item.error).map(({ symbol, error }) => ({ symbol, error }));
  const now = new Date();
  const marketDate = istDate(now);
  const canConfirmToday = istMinutes(now) >= 15 * 60 + 35;
  return NextResponse.json({
    data, errors, offset, scanned: batch.length, total: universe.stocks.length,
    nextOffset: offset + batch.length < universe.stocks.length ? offset + batch.length : null,
    universeSource: universe.source, fallbackUniverse: universe.fallback, universeWarnings: universe.warnings,
    fetchedAt: now.toISOString(), marketDate, canConfirmToday,
    note: canConfirmToday ? "Signals require today's completed daily candle." : "Daily-close signals are available after 3:35 PM India time and once Yahoo Finance publishes today's completed candle.",
    source: "Yahoo Finance unofficial daily candles",
  }, { headers: { "Cache-Control": "no-store" } });
}
