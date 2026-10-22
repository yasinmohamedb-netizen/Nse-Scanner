import { NextResponse } from "next/server";
import { loadNseUniverse } from "../../../../lib/nse-universe-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function istDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
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
    })).filter(c =>
      [c.open, c.high, c.low, c.close].every(Number.isFinite) &&
      c.open > 0 && c.low > 0 && c.high >= Math.max(c.open, c.close, c.low) &&
      c.low <= Math.min(c.open, c.close, c.high)
    );

    if (candles.length < 30) return { symbol, error: "Not enough valid daily history" };

    // A signal is only evaluated from a completed daily candle dated today in India.
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

/*
 * Low-base breakout setup:
 * 1) A local swing low forms after a preceding decline.
 * 2) Price then consolidates for the selected 3–9 completed sessions.
 * 3) The base stays above the swing low, is tight, and shows inside/range-bound trade.
 * 4) Today's completed candle closes above the entire base resistance.
 */
function evaluateBase(item, days) {
  if (!item.history || !item.price) return null;
  const history = item.history;
  // Need a prior downtrend, a pivot low, and the full consolidation window.
  if (history.length < days + 18) return null;

  const baseStart = history.length - days;
  const base = history.slice(baseStart);
  const preBase = history.slice(0, baseStart);
  if (preBase.length < 15 || base.length !== days) return null;

  const resistance = Math.max(...base.map(c => c.high));
  const baseLow = Math.min(...base.map(c => c.low));
  const baseRangePct = baseLow > 0 ? ((resistance - baseLow) / baseLow) * 100 : Infinity;

  // Search for a confirmed local pivot low 3–12 sessions before the base.
  // Two candles on either side must have lows above the pivot; keep the pivot
  // close enough to the base that it represents the setup's recent low.
  let pivot = null;
  const pivotSearchStart = Math.max(2, preBase.length - 15);
  const pivotSearchEnd = preBase.length - 3;
  for (let i = pivotSearchStart; i <= pivotSearchEnd; i++) {
    const c = preBase[i];
    const left = preBase.slice(i - 2, i);
    const right = preBase.slice(i + 1, i + 3);
    if (left.length !== 2 || right.length !== 2) continue;
    const localLow = [...left, ...right].every(other => other.low > c.low);
    if (localLow && (!pivot || c.low < pivot.low)) pivot = { ...c, index: i };
  }
  if (!pivot) return null;

  const beforePivot = preBase.slice(Math.max(0, pivot.index - 12), pivot.index);
  if (beforePivot.length < 6) return null;
  // The setup should arrive at the pivot from a meaningful downswing.
  const downtrend = beforePivot[0].close > pivot.low * 1.04;
  if (!downtrend) return null;

  // Base must hold above the low and remain compact; avoid a wide or falling base.
  const baseHoldsLow = base.every(c => c.low >= pivot.low * 0.985);
  const tightBase = baseRangePct <= 8;
  const baseCloses = base.map(c => c.close);
  const closeDriftPct = baseCloses.length > 1
    ? ((Math.max(...baseCloses) - Math.min(...baseCloses)) / Math.min(...baseCloses)) * 100
    : Infinity;
  const sideways = closeDriftPct <= 7;

  // Count true inside bars: current day's high/low both sit inside the previous
  // day's range. Require at least one for a 3-day base, two for longer bases.
  let insideBars = 0;
  for (let i = 1; i < base.length; i++) {
    if (base[i].high <= base[i - 1].high && base[i].low >= base[i - 1].low) insideBars++;
  }
  const requiredInsideBars = days <= 3 ? 1 : 2;
  const insideTrade = insideBars >= requiredInsideBars;

  // The breakout must be a bullish daily candle that closes above the base high.
  const todayCandle = item.candles?.[item.candles.length - 1];
  const bullishBreakout = todayCandle && todayCandle.close > todayCandle.open;
  const confirmed = item.price > resistance;

  if (!downtrend || !baseHoldsLow || !tightBase || !sideways || !insideTrade || !bullishBreakout || !confirmed) return null;

  const { history: _history, ...publicItem } = item;
  return {
    ...publicItem,
    resistance,
    baseLow,
    pivotLow: Number(pivot.low.toFixed(2)),
    baseRangePct: Number(baseRangePct.toFixed(2)),
    baseDays: days,
    insideBars,
    breakoutPct: Number((((item.price - resistance) / resistance) * 100).toFixed(2)),
    signal: "Swing low + inside consolidation + bullish close above resistance",
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const offset = Math.max(0, Number.parseInt(searchParams.get("offset") || "0", 10) || 0);
  const requestedLimit = Number.parseInt(searchParams.get("limit") || "20", 10) || 20;
  const limit = Math.min(15, Math.max(1, requestedLimit));
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
    note: canConfirmToday
      ? "Signals require today's completed daily candle, a recent swing low, a compact 3–9 session inside consolidation, and a bullish close above base resistance."
      : "Daily-close signals are available after 3:35 PM India time and once Yahoo Finance publishes today's completed candle.",
    source: "Yahoo Finance unofficial daily candles",
  }, { headers: { "Cache-Control": "no-store" } });
}
