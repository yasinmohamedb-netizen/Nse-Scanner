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
 * Low-base PRE-breakout setup: confirm a preceding decline and swing low,
 * test trailing bases of 3–9 sessions including the latest completed session,
 * and return only candidates that remain below base resistance.
 */
function detectDowntrend(candles, pivotIndex) {
  const segment = candles.slice(Math.max(0, pivotIndex - 15), pivotIndex + 1);
  if (segment.length < 8) return null;
  const firstClose = segment[0].close;
  const lastClose = segment[segment.length - 1].close;
  if (!(firstClose > 0 && lastClose > 0)) return null;
  const declinePct = ((firstClose - lastClose) / firstClose) * 100;
  const highs = segment.map(c => c.high);
  let lowerHighSteps = 0;
  for (let i = 1; i < highs.length; i++) {
    if (highs[i] < highs[i - 1]) lowerHighSteps++;
  }
  const closes = segment.map(c => c.close);
  const meanX = (closes.length - 1) / 2;
  const meanY = closes.reduce((sum, value) => sum + value, 0) / closes.length;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < closes.length; i++) {
    numerator += (i - meanX) * (closes[i] - meanY);
    denominator += (i - meanX) ** 2;
  }
  const slope = denominator ? numerator / denominator : 0;
  const enoughLowerHighs = lowerHighSteps >= Math.floor((segment.length - 1) * 0.4);
  if (declinePct < 5 || slope >= 0 || !enoughLowerHighs) return null;
  return {
    declinePct: Number(declinePct.toFixed(2)),
    startDate: segment[0].date,
    endDate: segment[segment.length - 1].date,
  };
}

function evaluateBase(item) {
  if (!item.history || !item.price || !item.candles?.length) return null;
  const history = item.history;
  if (history.length < 30) return null;
  const latest = item.candles[item.candles.length - 1];
  if (!latest) return null;

  for (let days = 9; days >= 3; days--) {
    if (history.length < days + 18) continue;
    const base = [...history.slice(-(days - 1)), latest];
    if (base.length !== days) continue;
    const preBase = history.slice(0, history.length - (days - 1));
    if (preBase.length < 15) continue;

    let pivot = null;
    const pivotSearchStart = Math.max(2, preBase.length - 18);
    const pivotSearchEnd = preBase.length - 3;
    for (let i = pivotSearchStart; i <= pivotSearchEnd; i++) {
      const c = preBase[i];
      const left = preBase.slice(i - 2, i);
      const right = preBase.slice(i + 1, i + 3);
      if (left.length !== 2 || right.length !== 2) continue;
      if ([...left, ...right].every(other => other.low > c.low)) {
        const downtrend = detectDowntrend(preBase, i);
        if (downtrend && (!pivot || c.low < pivot.low)) pivot = { ...c, index: i, downtrend };
      }
    }
    if (!pivot) continue;

    const resistance = Math.max(...base.map(c => c.high));
    const baseLow = Math.min(...base.map(c => c.low));
    const baseRangePct = baseLow > 0 ? ((resistance - baseLow) / baseLow) * 100 : Infinity;

    // Pre-breakout only: current close must still be below base resistance.
    if (!(item.price < resistance) || baseRangePct > 8) continue;
    if (!base.every(c => c.low >= pivot.low * 0.985)) continue;

    const closes = base.map(c => c.close);
    const closeDriftPct = ((Math.max(...closes) - Math.min(...closes)) / Math.min(...closes)) * 100;
    if (closeDriftPct > 7) continue;

    let insideBars = 0;
    for (let i = 1; i < base.length; i++) {
      if (base[i].high <= base[i - 1].high && base[i].low >= base[i - 1].low) insideBars++;
    }
    if (insideBars < 1) continue;

    const { history: _history, ...publicItem } = item;
    return {
      ...publicItem,
      resistance,
      baseLow,
      pivotLow: Number(pivot.low.toFixed(2)),
      downtrendPct: pivot.downtrend.declinePct,
      downtrendStart: pivot.downtrend.startDate,
      downtrendEnd: pivot.downtrend.endDate,
      baseRangePct: Number(baseRangePct.toFixed(2)),
      baseDays: days,
      insideBars,
      distanceToBreakoutPct: Number((((resistance - item.price) / resistance) * 100).toFixed(2)),
      signal: "Prior downtrend → swing low → 3–9 day base → still below resistance",
      status: "In base · pre-breakout",
    };
  }
  return null;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const offset = Math.max(0, Number.parseInt(searchParams.get("offset") || "0", 10) || 0);
  const requestedLimit = Number.parseInt(searchParams.get("limit") || "20", 10) || 20;
  const limit = Math.min(15, Math.max(1, requestedLimit));
    const universe = await loadNseUniverse();
  const batch = universe.stocks.slice(offset, offset + limit);
  const results = [];
  const concurrency = 3;
  for (let i = 0; i < batch.length; i += concurrency) {
    results.push(...await Promise.all(batch.slice(i, i + concurrency).map(stock => fetchDaily(stock.symbol))));
  }
  const data = results.map(item => evaluateBase(item)).filter(Boolean);
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
      ? "Signals require today's completed daily candle, a recent swing low, and an automatically detected 3–9 session base that remains below resistance."
      : "Pre-breakout scans are available after 3:35 PM India time and once Yahoo Finance publishes today's completed candle.",
    source: "Yahoo Finance unofficial daily candles",
  }, { headers: { "Cache-Control": "no-store" } });
}
