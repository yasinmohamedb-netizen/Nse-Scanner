"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, ArrowDownRight, WifiOff } from "lucide-react";
import StockChart from "../../../components/StockChart";

const intervals = ["1m", "3m", "5m", "15m", "30m", "1h", "1D", "1W"];
const periods = ["1D", "5D", "1M", "3M", "6M", "1Y", "5Y", "All"];

export default function StockDetail({ params }) {
  const symbol = decodeURIComponent(params.symbol || "").toUpperCase();
  const [interval, setInterval] = useState("1D");
  const [period, setPeriod] = useState("6M");
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [returnPath, setReturnPath] = useState("/");

  useEffect(() => {
    try {
      const from = new URLSearchParams(window.location.search).get("from");
      if (from && from.startsWith("/") && !from.startsWith("//")) setReturnPath(from);
    } catch (_) {
      // Keep the main scanner as the safe fallback.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setError("");
        const response = await fetch(`/api/market/candles?symbol=${encodeURIComponent(symbol)}&range=5D&interval=1D`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Yahoo Finance data unavailable.");
        if (!cancelled) setQuote(data);
      } catch (e) {
        if (!cancelled) setError(e.message || "Yahoo Finance data unavailable.");
      }
    }
    load();
    return () => { cancelled = true; };
  }, [symbol, refreshKey]);

  const positive = (quote?.change ?? 0) >= 0;
  return (
    <main className="detail-page">
      <div className="data-banner detail-banner"><WifiOff size={14}/> Yahoo Finance data · may be delayed or unavailable; not an official guaranteed live feed.</div>
      <header className="detail-topbar">
        <Link href={returnPath} className="back-link"><ArrowLeft size={16}/> {returnPath.startsWith("/low-base-breakout") ? "Low Base Scanner" : "Scanner"}</Link>
        <div className="detail-title">
          <span className="ticker-mark large-mark">{symbol.slice(0,1)}</span>
          <div><h1>{symbol}</h1><p>NSE · {quote?.yahooSymbol || `${symbol}.NS`}</p></div>
        </div>
        <div className="detail-quote">
          <strong>{quote?.price != null ? `₹${quote.price.toFixed(2)}` : "—"}</strong>
          {quote && <span className={positive ? "positive" : "negative"}>{positive ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>} {Math.abs(quote.change).toFixed(2)}%</span>}
        </div>
      </header>

      {error && <div className="inline-warning"><WifiOff size={14}/> {error} <button className="refresh-button" onClick={() => setRefreshKey(v => v + 1)}>Retry</button></div>}

      <section className="detail-toolbar">
        <div className="period-control">
          {periods.map(p => <button key={p} onClick={() => setPeriod(p)} className={period === p ? "active" : ""}>{p}</button>)}
        </div>
        <div className="interval-control">
          <span>Candle interval</span>
          {intervals.map(i => <button key={i} onClick={() => setInterval(i)} className={interval === i ? "active" : ""}>{i}</button>)}
        </div>
      </section>

      <section className="detail-chart-panel">
        <div className="chart-panel-heading"><div><b>{symbol}</b><span> · Yahoo Finance candlestick chart</span></div><span className="muted">Selected interval: {interval} · Period: {period}</span></div>
        <div className="detail-chart">
          <StockChart stock={{ symbol }} period={period} interval={interval} compact={false} />
        </div>
        <div className="chart-notice">Yahoo Finance chart data is unofficial and may be delayed, throttled, or changed without notice. Verify prices with your broker before trading.</div>
      </section>
      <section className="detail-stats">
        <div><span>Latest price</span><b>{quote?.price != null ? `₹${quote.price.toFixed(2)}` : "—"}</b></div>
        <div><span>Latest candle volume</span><b>{quote ? Number(quote.volume || 0).toLocaleString("en-IN") : "—"}</b></div>
        <div><span>Change</span><b className={positive ? "positive" : "negative"}>{quote ? `${positive ? "+" : "-"}${Math.abs(quote.change).toFixed(2)}%` : "—"}</b></div>
      </section>
    </main>
  );
}
