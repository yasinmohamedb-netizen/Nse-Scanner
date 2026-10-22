"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, RefreshCw, Search, SlidersHorizontal, Wifi, WifiOff, X } from "lucide-react";
import Link from "next/link";
import StockCard from "../components/StockCard";
import { nseUniverse } from "../lib/nse-universe";

const periods = ["1D", "5D", "1M", "3M", "6M", "1Y", "5Y", "All"];
const intervals = ["5m", "15m", "30m", "1h", "1D", "1W"];
const initialStocks = nseUniverse.map(symbol => ({ symbol, name: symbol, price: 0, volume: 0, change: 0, candles: [] }));
const SCAN_CACHE_KEY = "nse-scanner-latest-scan-v1";
const FILTERS_CACHE_KEY = "nse-scanner-dashboard-filters-v1";

export default function Home() {
  const [filtersRestored, setFiltersRestored] = useState(false);
  const [minPrice, setMinPrice] = useState("100");
  const [maxPrice, setMaxPrice] = useState("250");
  const [minVolume, setMinVolume] = useState("200000");
  const [period, setPeriod] = useState("6M");
  const [interval, setInterval] = useState("1D");
  const [columns, setColumns] = useState("3");
  const [sort, setSort] = useState("price-desc");
  const [query, setQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [liveStocks, setLiveStocks] = useState(initialStocks);
  const [loading, setLoading] = useState(true);
  const [loadErrors, setLoadErrors] = useState(0);
  const [updatedAt, setUpdatedAt] = useState("");
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0 });
  const [universeSource, setUniverseSource] = useState("");
  const [universeWarning, setUniverseWarning] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selectedSearch, setSelectedSearch] = useState(null);
  // Keep searched stocks in the scanner universe even after the search box is cleared.
  const [discoveredStocks, setDiscoveredStocks] = useState([]);
  const selectedSearchSymbolRef = useRef(null);

  // Restore dashboard controls when returning from a stock detail page.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FILTERS_CACHE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (typeof saved.minPrice === "string") setMinPrice(saved.minPrice);
        if (typeof saved.maxPrice === "string") setMaxPrice(saved.maxPrice);
        if (typeof saved.minVolume === "string") setMinVolume(saved.minVolume);
        if (periods.includes(saved.period)) setPeriod(saved.period);
        if (intervals.includes(saved.interval)) setInterval(saved.interval);
        if (["2", "3", "4"].includes(saved.columns)) setColumns(saved.columns);
        if (["price-desc", "price-asc", "volume-desc"].includes(saved.sort)) setSort(saved.sort);
      }
    } catch (e) {
      // Ignore invalid browser preferences and keep defaults.
    } finally {
      setFiltersRestored(true);
    }
  }, []);

  // Save each filter change so navigating to a chart and pressing Back keeps the same view.
  useEffect(() => {
    if (!filtersRestored) return;
    try {
      window.localStorage.setItem(FILTERS_CACHE_KEY, JSON.stringify({
        minPrice, maxPrice, minVolume, period, interval, columns, sort
      }));
    } catch (e) {
      // Storage may be disabled; filters still work for the current page session.
    }
  }, [filtersRestored, minPrice, maxPrice, minVolume, period, interval, columns, sort]);

  useEffect(() => {
    let cancelled = false;
    async function loadQuotes() {
      // Reuse the latest completed/partial scan on normal page loads. Only the
      // explicit Scan Again button (refreshKey > 0) forces a fresh market scan.
      if (refreshKey === 0) {
        try {
          const cachedRaw = window.localStorage.getItem(SCAN_CACHE_KEY);
          if (cachedRaw) {
            const cached = JSON.parse(cachedRaw);
            if (Array.isArray(cached.stocks) && cached.stocks.length) {
              setLiveStocks(cached.stocks);
              setLoadErrors(cached.errors || 0);
              setUpdatedAt(cached.updatedAt || "");
              setScanProgress(cached.progress || { done: cached.stocks.length, total: cached.stocks.length });
              setUniverseSource(cached.source || "Cached latest scan");
              setUniverseWarning(cached.warning || "");
              setLoading(false);
              return;
            }
          }
        } catch (e) {
          // Invalid or unavailable browser cache: fall through to a fresh scan.
        }
      }
      setLoading(true);
      setScanProgress({ done: 0, total: 0 });
      setUniverseWarning("");
      setLoadErrors(0);
      const collected = [];
      let errorCount = 0;
      let source = "";
      let warning = "";
      try {
        const universeResponse = await fetch("/api/market/universe", { cache: "no-store" });
        const universePayload = await universeResponse.json();
        if (!universeResponse.ok) throw new Error(universePayload.error || "Could not load official NSE symbol list.");
        const total = universePayload.count || 0;
        source = universePayload.source || "NSE list";
        warning = (universePayload.warnings || []).join(" ");
        setUniverseSource(source);
        setUniverseWarning(warning);
        setScanProgress({ done: 0, total });
        if (universePayload.fallback) {
          warning = "Official NSE symbol list could not be downloaded. This run uses a limited fallback list, not all NSE stocks. " + (universePayload.warnings || []).join(" ");
          setUniverseWarning(warning);
        }
        const batchSize = 30;
        for (let offset = 0; offset < total; offset += batchSize) {
          if (cancelled) return;
          const response = await fetch(`/api/market/scan?offset=${offset}&limit=${batchSize}`, { cache: "no-store" });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || `Market scan failed at ${offset}.`);
          collected.push(...(payload.data || []).map(item => ({
            symbol: item.symbol, name: item.name || item.symbol, price: item.price || 0,
            volume: item.volume || 0, change: item.change || 0, candles: [], dataError: ""
          })));
          errorCount += (payload.errors || []).length;
          if (!cancelled) {
            const progress = { done: Math.min(offset + (payload.scanned || batchSize), total), total };
            setLiveStocks([...collected]);
            setLoadErrors(errorCount);
            setScanProgress(progress);
            // Persist progress as it arrives, so navigating away or reloading
            // never forces another full scan just to use the current results.
            try {
              window.localStorage.setItem(SCAN_CACHE_KEY, JSON.stringify({
                stocks: collected, errors: errorCount, updatedAt: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
                progress, source, warning
              }));
            } catch (e) { /* Storage may be disabled or full; in-memory results still work. */ }
          }
        }
        if (!cancelled) {
          const timestamp = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          const progress = { done: total, total };
          setUpdatedAt(timestamp);
          setScanProgress(progress);
          setLoading(false);
          try { window.localStorage.setItem(SCAN_CACHE_KEY, JSON.stringify({ stocks: collected, errors: errorCount, updatedAt: timestamp, progress, source, warning })); } catch (e) { /* Cache is best-effort. */ }
        }
      } catch (error) {
        if (!cancelled) {
          setLiveStocks([...collected]);
          setLoadErrors(errorCount);
          setUniverseWarning(error.message || "Unable to scan the market.");
          const timestamp = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          setUpdatedAt(timestamp);
          setLoading(false);
          try { window.localStorage.setItem(SCAN_CACHE_KEY, JSON.stringify({ stocks: collected, errors: errorCount, updatedAt: timestamp, progress: { done: collected.length, total: scanProgress.total }, source, warning: error.message || "Scan ended before completion." })); } catch (e) { /* Cache is best-effort. */ }
        }
      }
    }
    loadQuotes();
    return () => { cancelled = true; };
  }, [refreshKey]);

  useEffect(() => {
    let cancelled = false;
    const term = query.trim();
    setSearchError("");
    if (selectedSearchSymbolRef.current && term === selectedSearchSymbolRef.current) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    if (term.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/market/yahoo-search?q=${encodeURIComponent(term)}`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Search failed.");
        if (!cancelled) {
          setSearchResults(payload.data || []);
          setSearchError(payload.data?.length ? "" : "No NSE equity match found. Try its exact NSE trading symbol.");
        }
      } catch (e) {
        if (!cancelled) {
          setSearchResults([]);
          setSearchError(e.message || "Yahoo Finance search unavailable.");
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  async function chooseSearchResult(item) {
    selectedSearchSymbolRef.current = item.symbol;
    setQuery(item.symbol);
    setSearchResults([]);
    setSearchError("");
    setSearching(true);
    try {
      const response = await fetch(`/api/market/candles?symbol=${encodeURIComponent(item.symbol)}&range=5D&interval=1D`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load this stock.");
      const chosen = { ...item, price: payload.price ?? item.price ?? 0, volume: payload.volume ?? item.volume ?? 0, change: payload.change ?? item.change ?? 0, candles: payload.candles || [], dataError: "" };
      setSelectedSearch(chosen);
      setDiscoveredStocks(previous => [chosen, ...previous.filter(stock => stock.symbol !== chosen.symbol)]);
    } catch (e) {
      const chosen = { ...item, price: item.price || 0, volume: item.volume || 0, change: item.change || 0, candles: [], dataError: e.message || "Chart data unavailable" };
      setSelectedSearch(chosen);
      setDiscoveredStocks(previous => [chosen, ...previous.filter(stock => stock.symbol !== chosen.symbol)]);
    } finally {
      setSearching(false);
    }
  }

  const stocks = useMemo(() => {
    const min = minPrice === "" ? 0 : Number(minPrice);
    const max = maxPrice === "" ? Number.MAX_SAFE_INTEGER : Number(maxPrice);
    const volume = minVolume === "" ? 0 : Number(minVolume);
    if (Number.isFinite(min) && Number.isFinite(max) && min > max) return [];
    // Include a stock the user explicitly searched for in the scanner universe too.
    // Search results remain visible in their own section regardless of filters, but when
    // they satisfy the active price/volume filters they should also appear in the main grid.
    const universe = [...liveStocks];
    for (const discovered of discoveredStocks) {
      const index = universe.findIndex(s => s.symbol === discovered.symbol);
      if (index >= 0) universe[index] = discovered;
      else universe.push(discovered);
    }
    if (selectedSearch) {
      const index = universe.findIndex(s => s.symbol === selectedSearch.symbol);
      if (index >= 0) universe[index] = selectedSearch;
      else universe.push(selectedSearch);
    }
    let result = universe.filter(s => !s.dataError && s.price > 0 && s.price >= min && s.price <= max && s.volume >= volume);
    // When searching, keep other scanner matches visible and add the searched symbol if it qualifies.
    // Do not narrow the entire scanner grid to the search text.
    result = [...result].sort((a, b) => sort === "price-asc" ? a.price - b.price : sort === "volume-desc" ? b.volume - a.volume : b.price - a.price);
    return result;
  }, [liveStocks, discoveredStocks, selectedSearch, minPrice, maxPrice, minVolume, sort]);

  const showSearchResults = query.trim().length >= 2 && !selectedSearch;

  return (
    <main className="app-shell">
      <div className="data-banner"><Wifi size={14} /> Yahoo Finance data · unofficial and may be delayed, rate-limited, or unavailable. NSE list: official downloadable equity + SME files when reachable.</div>
      <section className="topbar">
        <div className="brand">
          <div className="brand-icon"><Activity size={20} /></div>
          <div><h1>NSE <span>Scanner</span></h1><p>Multi-chart candlestick workspace</p></div>
        </div>
        <Link href="/low-base-breakout" style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 12px", border: "1px solid #245541", borderRadius: 8, background: "#10251f", color: "#9ce3c7", textDecoration: "none", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>Low Base Breakout ↗</Link>
        <div className="filters">
          <label>Min price (₹)<input type="number" min="0" value={minPrice} onChange={e => setMinPrice(e.target.value)} /></label>
          <label>Max price (₹)<input type="number" min="0" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} /></label>
          <label>Min volume (shares)<input type="number" min="0" value={minVolume} onChange={e => setMinVolume(e.target.value)} /></label>
          <label className="search-label">Search any NSE stock
            <div className="input-with-icon"><Search size={15}/><input value={query} onChange={e => { selectedSearchSymbolRef.current = null; setSelectedSearch(null); setQuery(e.target.value.toUpperCase()); }} placeholder="Symbol or company name" /><button type="button" className="clear-search" aria-label="Clear search" onClick={() => { selectedSearchSymbolRef.current = null; setQuery(""); setSelectedSearch(null); setSearchResults([]); }}><X size={14}/></button></div>
          </label>
        </div>
      </section>

      {showSearchResults && <section className="search-results-panel">
        <div className="search-results-heading">{searching ? "Searching Yahoo Finance…" : "Search results"} <span>Search results ignore price and volume filters.</span></div>
        {searchResults.map(item => <button className="search-result-row" key={item.yahooSymbol} onClick={() => chooseSearchResult(item)}>
          <span className="search-result-mark">{item.symbol.slice(0,1)}</span><span className="search-result-copy"><b>{item.symbol}</b><small>{item.name}</small></span><span className="search-result-exchange">{item.exchange || "NSE"}</span><span className="search-result-price">{item.price ? `₹${item.price.toFixed(2)}` : "Open chart →"}</span>
        </button>)}
        {!searching && searchError && <div className="search-no-results">{searchError}</div>}
      </section>}

      <section className="toolbar">
        <div className="result-summary"><span className={`live-dot ${loading ? "loading-dot" : loadErrors ? "error-dot" : ""}`} /> <b>{loading ? "…" : stocks.length}</b> matching stocks <span className="separator">/</span> Price ₹{minPrice || "0"}–₹{maxPrice || "∞"} <span className="separator">/</span> Volume ≥ {Number(minVolume || 0).toLocaleString("en-IN")}</div>
        <div className="toolbar-actions">
          <div className="period-control" aria-label="Chart history">{periods.map(p => <button key={p} onClick={() => setPeriod(p)} className={period === p ? "active" : ""}>{p}</button>)}</div>
          <label className="select-label">Candle<select value={interval} onChange={e => setInterval(e.target.value)}>{intervals.map(i => <option key={i} value={i}>{i}</option>)}</select></label>
          <label className="select-label">Sort<select value={sort} onChange={e => setSort(e.target.value)}><option value="price-desc">Price: high to low</option><option value="price-asc">Price: low to high</option><option value="volume-desc">Volume: high to low</option></select></label>
          <div className="columns-control" aria-label="Charts per row">{[2, 3, 4].map(n => <button key={n} onClick={() => setColumns(String(n))} className={columns === String(n) ? "active" : ""}>{n}</button>)}</div>
          <button className="refresh-button" disabled={loading} onClick={() => setRefreshKey(v => v + 1)}><RefreshCw size={14} /> {loading ? "Scanning…" : liveStocks.length ? "Scan Again" : "Scan Market"}</button>
        </div>
      </section>

      {Number(minPrice || 0) > Number(maxPrice || Number.MAX_SAFE_INTEGER) && <div className="inline-warning"><WifiOff size={14}/> Minimum price cannot be greater than maximum price. Set Min price below Max price.</div>}

      {selectedSearch && <section className="searched-stock-section">
        <div className="searched-stock-heading"><div><b>Search result</b><span> · always shown here; also appears in scanner results when it meets your filters</span></div><button className="refresh-button" onClick={() => { selectedSearchSymbolRef.current = null; setSelectedSearch(null); setQuery(""); }}>Clear search</button></div>
        {selectedSearch.dataError && <div className="inline-warning"><WifiOff size={14}/>{selectedSearch.dataError} The stock is still shown; its chart may be unavailable.</div>}
        <section className="stock-grid" style={{ "--grid-columns": columns }}><StockCard stock={selectedSearch} period={period} interval={interval} /></section>
      </section>}

      <section className="grid-heading">
        <div><SlidersHorizontal size={15} /><span>Price + volume scanner</span></div>
        <span className="muted">{loading ? `Scanning ${scanProgress.done.toLocaleString("en-IN")} / ${scanProgress.total.toLocaleString("en-IN")} symbols…` : `Latest scan ${updatedAt || "loaded from cache"}`} · {liveStocks.length.toLocaleString("en-IN")} quotes loaded · {discoveredStocks.length} searched stock(s) added · History: {period} · Candle interval: {interval} · {columns} columns</span>
      </section>

      {scanProgress.total > 0 && <div className="scan-progress-wrap">
        <div className="scan-progress-label"><span>{loading ? "Scanning NSE equities and SME symbols" : "Scan complete"}</span><b>{Math.round((scanProgress.done / scanProgress.total) * 100)}%</b></div>
        <div className="scan-progress-track"><div className="scan-progress-fill" style={{ width: `${Math.round((scanProgress.done / scanProgress.total) * 100)}%` }} /></div>
        <div className="scan-progress-meta">{scanProgress.done.toLocaleString("en-IN")} of {scanProgress.total.toLocaleString("en-IN")} symbols processed · {universeSource}</div>
      </div>}
      {universeWarning && <div className="inline-warning"><WifiOff size={14}/>{universeWarning}</div>}
      {loadErrors > 0 && !loading && <div className="inline-warning"><WifiOff size={14}/> {loadErrors.toLocaleString("en-IN")} symbol(s) failed to load. Yahoo Finance may have throttled requests, so results may be incomplete. Press Scan Again to retry.</div>}

      {stocks.length > 0 ? (
        <section className="stock-grid" style={{ "--grid-columns": columns }}>{stocks.map(stock => <StockCard key={stock.symbol} stock={stock} period={period} interval={interval} />)}</section>
      ) : !showSearchResults && (
        <div className="empty-state"><Search size={28}/><h2>{loading ? "Loading market data…" : "No stocks match these filters"}</h2><p>{loading ? "Loading the latest scan or fetching market data for the first time." : "Try changing the price/volume filters. Filters only use the latest scanned data and do not trigger another scan. Use Scan Again when you want fresh market data, or search any NSE stock above."}</p></div>
      )}
      <footer className="page-footer">Personal NSE scanner · official NSE equity + SME symbol list when available · Yahoo Finance quotes may be incomplete · Not investment advice</footer>
    </main>
  );
}
