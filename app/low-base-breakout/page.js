"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowLeft, ExternalLink, RefreshCw, Search, ShieldCheck, WifiOff } from "lucide-react";
import "./low-base-breakout.css";

const CACHE_KEY = "nse-low-base-prebreakout-v2";

export default function LowBaseBreakoutPage() {
  const [minPrice, setMinPrice] = useState("0");
  const [maxPrice, setMaxPrice] = useState("");
  const [minVolume, setMinVolume] = useState("0");
  const [sort, setSort] = useState("breakout");
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [errors, setErrors] = useState(0);
  const [updatedAt, setUpdatedAt] = useState("");
  const [warning, setWarning] = useState("");
  const [note, setNote] = useState("");
  const [loadedCache, setLoadedCache] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw);
        if (Array.isArray(cached.stocks)) {
          setStocks(cached.stocks);
          setProgress(cached.progress || { done: 0, total: 0 });
          setErrors(cached.errors || 0);
          setUpdatedAt(cached.updatedAt || "");
          setWarning(cached.warning || "");
          setNote(cached.note || "");
        }
      }
    } catch (_) {
      // Ignore invalid browser cache.
    } finally {
      setLoadedCache(true);
    }
  }, []);

  async function scanAll() {
    setLoading(true);
    setWarning("");
    setErrors(0);
    setStocks([]);
    setProgress({ done: 0, total: 0 });
    const found = [];
    let errorCount = 0;
    let offset = 0;
    let total = 0;
    let sourceWarning = "";
    let scanNote = "";
    try {
      while (true) {
        const response = await fetch(`/api/market/low-base-breakout?offset=${offset}&limit=15`, { cache: "no-store" });
        const responseText = await response.text();
        let payload;
        try {
          payload = responseText ? JSON.parse(responseText) : {};
        } catch (_) {
          payload = {};
        }
        if (!response.ok) {
          throw new Error(payload.error || `Scanner API returned HTTP ${response.status}. Please retry in a moment.`);
        }
        if (!responseText || !payload || typeof payload !== "object") {
          throw new Error("Scanner API returned an empty response. This can happen if the server is busy; please try Scan Again.");
        }
        total = payload.total || total;
        scanNote = payload.note || "";
        sourceWarning = (payload.universeWarnings || []).join(" ");
        if (payload.fallbackUniverse) sourceWarning = "The official NSE universe was unavailable; this scan uses the limited fallback symbol list. " + sourceWarning;
        found.push(...(payload.data || []));
        errorCount += (payload.errors || []).length;
        offset = payload.nextOffset;
        const nextProgress = { done: Math.min(payload.offset + payload.scanned, total), total };
        setStocks([...found]);
        setProgress(nextProgress);
        setErrors(errorCount);
        setNote(scanNote);
        setWarning(sourceWarning);
        const stamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
        setUpdatedAt(stamp);
        try {
          window.localStorage.setItem(CACHE_KEY, JSON.stringify({
            stocks: found, progress: nextProgress, errors: errorCount, updatedAt: stamp,
            warning: sourceWarning, note: scanNote,
          }));
        } catch (_) {
          // Keep results in memory if local storage fills up.
        }
        if (offset === null || offset === undefined) break;
      }
    } catch (error) {
      setWarning([sourceWarning, error.message || "The scan stopped before completion."].filter(Boolean).join(" "));
    } finally {
      setLoading(false);
    }
  }

  const filteredStocks = useMemo(() => {
    const min = minPrice === "" ? 0 : Number(minPrice);
    const max = maxPrice === "" ? Number.MAX_SAFE_INTEGER : Number(maxPrice);
    const volume = minVolume === "" ? 0 : Number(minVolume);
    if (min > max) return [];
    return stocks.filter(s => s.price >= min && s.price <= max && (s.volume || 0) >= volume)
      .sort((a, b) => sort === "price-asc" ? a.price - b.price : sort === "volume-desc" ? (b.volume || 0) - (a.volume || 0) : (a.distanceToBreakoutPct ?? 100) - (b.distanceToBreakoutPct ?? 100));
  }, [stocks, minPrice, maxPrice, minVolume, sort]);

  const progressPct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <main className="lbb-shell">
      <div className="lbb-data-banner"><Activity size={14} /> Yahoo Finance daily candles · unofficial source · pre-breakout setups only</div>
      <header className="lbb-header">
        <div className="lbb-brand">
          <div className="lbb-brand-icon"><Activity size={21}/></div>
          <div><h1>NSE <span>Scanner</span></h1><p>LOW BASE BREAKOUT STRATEGY</p></div>
        </div>
        <nav className="lbb-nav">
          <Link href="/" className="lbb-nav-link"><ArrowLeft size={14}/> Main Scanner</Link>
          <span className="lbb-nav-active">Low Base Breakout</span>
        </nav>
      </header>

      <section className="lbb-intro">
        <div>
          <div className="lbb-eyebrow">STRATEGY SCANNER / DAILY CHARTS</div>
          <h2>Low Base Breakout</h2>
          <p>Find stocks after a downtrend, consolidating near a swing low for 3–9 trading days. Show only setups still below resistance—not stocks that have already broken out.</p>
        </div>
        <button className="lbb-scan-button" onClick={scanAll} disabled={loading}>
          <RefreshCw size={16} className={loading ? "lbb-spin" : ""}/>
          {loading ? "Scanning…" : stocks.length ? "Scan Again" : "Scan All Stocks"}
        </button>
      </section>

      <section className="lbb-settings">
        <div className="lbb-setting">
          <label>Consolidation duration</label>
          <div className="lbb-auto-duration">Automatic · 3–9 trading days</div>
          <small>The scanner tests each base length and selects the matching setup automatically.</small>
        </div>
        <div className="lbb-setting">
          <label htmlFor="lbb-min-price">Minimum price (₹)</label>
          <input id="lbb-min-price" type="number" min="0" value={minPrice} onChange={e => setMinPrice(e.target.value)} />
        </div>
        <div className="lbb-setting">
          <label htmlFor="lbb-max-price">Maximum price (₹)</label>
          <input id="lbb-max-price" type="number" min="0" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} placeholder="No maximum" />
        </div>
        <div className="lbb-setting">
          <label htmlFor="lbb-min-volume">Minimum volume</label>
          <input id="lbb-min-volume" type="number" min="0" value={minVolume} onChange={e => setMinVolume(e.target.value)} />
        </div>
      </section>

      {Number(minPrice || 0) > Number(maxPrice || Number.MAX_SAFE_INTEGER) && <div className="lbb-warning"><WifiOff size={15}/> Minimum price must be less than or equal to maximum price.</div>}
      {note && <div className="lbb-note"><ShieldCheck size={16}/><span>{note}</span></div>}
      {warning && <div className="lbb-warning"><WifiOff size={15}/><span>{warning}</span></div>}

      <section className="lbb-summary">
        <div><span>Pre-breakout setups</span><strong>{filteredStocks.length.toLocaleString("en-IN")}</strong></div>
        <div><span>Symbols scanned</span><strong>{progress.done.toLocaleString("en-IN")}<small> / {progress.total.toLocaleString("en-IN") || "—"}</small></strong></div>
        <div><span>Failed symbols</span><strong>{errors.toLocaleString("en-IN")}</strong></div>
        <div><span>Base duration</span><strong>3–9 <small>auto</small></strong></div>
      </section>

      {progress.total > 0 && <section className="lbb-progress">
        <div><span>{loading ? "Scanning mainboard + SME symbols" : progress.done >= progress.total ? "Scan finished" : "Scan incomplete"}</span><b>{progressPct}%</b></div>
        <div className="lbb-progress-track"><div style={{width: `${progressPct}%`}}/></div>
        <small>{progress.done.toLocaleString("en-IN")} of {progress.total.toLocaleString("en-IN")} symbols processed{updatedAt ? ` · Updated ${updatedAt}` : ""}</small>
      </section>}

      <section className="lbb-results-head">
        <div><h3>Stocks building a low base</h3><p>Prior downtrend + swing low + 3–9 day base. Current price remains below resistance.</p></div>
        <label>Sort by <select value={sort} onChange={e => setSort(e.target.value)}><option value="breakout">Closest to breakout</option><option value="price-asc">Price: low to high</option><option value="volume-desc">Volume: high to low</option></select></label>
      </section>

      {filteredStocks.length ? <section className="lbb-stock-grid">
        {filteredStocks.map(stock => <article className="lbb-stock-card" key={stock.symbol}>
          <div className="lbb-stock-top">
            <div><div className="lbb-symbol">{stock.symbol}</div><div className="lbb-name">{stock.name}</div></div>
            <div className="lbb-price"><strong>₹{stock.price.toLocaleString("en-IN", {maximumFractionDigits:2})}</strong><span>+{(stock.distanceToBreakoutPct ?? (stock.resistance ? ((stock.resistance - stock.price) / stock.resistance) * 100 : 0)).toFixed(2)}% to resistance</span></div>
          </div>
          <div className="lbb-mini-chart" aria-label="Illustrative candle summary">
            <div className="lbb-resistance"><span>Resistance ₹{stock.resistance.toFixed(2)}</span></div>
            <div className="lbb-base-range"><span>Base range</span><b>₹{stock.baseLow.toFixed(2)} – ₹{stock.resistance.toFixed(2)}</b></div>
            <div className="lbb-breakout-line"><span>Today's close</span><b>₹{stock.price.toFixed(2)}</b></div>
          </div>
          <div className="lbb-stats">
            <div><span>Pivot low</span><b>₹{(stock.pivotLow ?? stock.baseLow).toFixed(2)}</b></div>
            <div><span>Inside bars</span><b>{stock.insideBars ?? "—"}</b></div>
            <div><span>Base length</span><b>{stock.baseDays} days</b></div>
            <div><span>Range width</span><b>{stock.baseRangePct.toFixed(2)}%</b></div>
            <div><span>Volume</span><b>{(stock.volume || 0).toLocaleString("en-IN")}</b></div>
          </div>
          <Link href={`/stock/${encodeURIComponent(stock.symbol)}`} className="lbb-chart-link">Open stock chart <ExternalLink size={13}/></Link>
        </article>)}
      </section> : <section className="lbb-empty">
        <Search size={28}/>
        <h3>{loading ? "Scanning the NSE universe…" : loadedCache && !stocks.length && !progress.total ? "Ready to scan" : "No pre-breakout setups match your filters"}</h3>
        <p>{loading ? "Results will appear as each batch completes. Price filters apply instantly to the scanned results." : !progress.total ? "Press Scan All Stocks to check the official NSE mainboard and SME lists." : "Try a wider price range or lower the minimum volume. Filters do not trigger a new scan; press Scan Again to refresh market data."}</p>
        {!loading && !progress.total && <button className="lbb-scan-button" onClick={scanAll}><RefreshCw size={15}/> Scan All Stocks</button>}
      </section>}

      <footer className="lbb-footer">Low Base Pre-Breakout · Daily close confirmation · Yahoo Finance data may be delayed, incomplete or rate-limited. Not investment advice.</footer>
    </main>
  );
}
