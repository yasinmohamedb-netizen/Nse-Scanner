import { jsonError, upstoxGet } from "../../../../lib/market-data/upstox";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("q") || "").trim().slice(0, 50);
    if (!query) {
      return Response.json({ ok: false, error: "Provide a stock symbol or company name using ?q=RELIANCE" }, { status: 400 });
    }

    const payload = await upstoxGet("/v2/instruments/search", {
      query,
      exchanges: "NSE",
      segments: "EQ",
      page_number: 1,
      records: 30,
    });

    const instruments = (payload?.data || [])
      .filter((item) => item.exchange === "NSE" && item.segment === "NSE_EQ" && item.instrument_type === "EQ")
      .map((item) => ({
        symbol: item.trading_symbol,
        name: item.name,
        instrumentKey: item.instrument_key,
        segment: item.segment,
      }));

    return Response.json({ ok: true, provider: "upstox", data: instruments }, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
