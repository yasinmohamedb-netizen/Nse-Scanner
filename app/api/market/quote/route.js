import { jsonError, upstoxGet } from "../../../../lib/market-data/upstox";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const instrumentKey = searchParams.get("instrument_key");
    if (!instrumentKey || instrumentKey.length > 150) {
      return Response.json({ ok: false, error: "Provide a valid instrument_key from the instrument search endpoint." }, { status: 400 });
    }

    const payload = await upstoxGet("/v2/market-quote/quotes", { instrument_key: instrumentKey });
    const raw = payload?.data ? Object.values(payload.data)[0] : null;
    if (!raw) {
      return Response.json({ ok: false, error: "No quote returned for this instrument." }, { status: 404 });
    }

    return Response.json({
      ok: true,
      provider: "upstox",
      data: {
        symbol: raw.instrument_token ? instrumentKey : instrumentKey,
        instrumentKey,
        lastPrice: raw.last_price ?? null,
        open: raw.ohlc?.open ?? null,
        high: raw.ohlc?.high ?? null,
        low: raw.ohlc?.low ?? null,
        close: raw.ohlc?.close ?? null,
        volume: raw.volume ?? raw.total_volume ?? null,
        averagePrice: raw.average_price ?? null,
        lastTradeTime: raw.last_trade_time ?? null,
        timestamp: new Date().toISOString(),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
