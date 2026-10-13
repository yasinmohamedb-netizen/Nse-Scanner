# NSE Multi-Chart Scanner

A Next.js starter for a personal NSE watchlist scanner. The charts use green/red candlesticks, wicks, dotted grid lines, and volume bars, styled to resemble the screenshot supplied in the chat.

## Data source status

The app calls Yahoo Finance's chart endpoint server-side for NSE tickers (for example `TCS.NS`). This endpoint is undocumented and is **not an official guaranteed live-market API**. Data may be delayed, unavailable, throttled, or change without notice. Yahoo's terms and usage rules apply; check whether your intended use is permitted before deploying or relying on this feed. Do not treat it as exchange-grade live data or use it as the sole basis for trading.

The dashboard currently scans only the small starter watchlist in `lib/demo-data.js` (the symbol list is reused; its old sample prices/candles are no longer used for quotes). It does not yet discover every NSE listing or stream tick-by-tick prices. The Refresh button reloads quotes; chart controls request the selected history/interval.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Deploy to Vercel

Import the project into Vercel and deploy. No API key is currently configured in this starter because this adapter calls the undocumented Yahoo Finance chart endpoint. If Yahoo blocks the request from your deployment region/IP, the app will show an error instead of silently using demo prices.

## Supported controls

- Price and volume filters (latest returned Yahoo candle volume)
- Period: 1D, 5D, 1M, 3M, 6M, 1Y, 5Y, All
- Candle interval: 1m, 3m (mapped to Yahoo 5m), 5m, 15m, 30m, 1h, daily, weekly, monthly
- Multi-chart grid and full-size stock detail page
- Modular scanner registry remains in `lib/scanners/`

Yahoo intraday history limits vary by interval and some selected period/interval combinations may not return data. A licensed market-data provider is recommended for a production scanner, especially if you need dependable real-time data or full-market scanning.


## Search any NSE stock
The search box calls a Yahoo Finance search endpoint and lists NSE equity matches independently of the dashboard price and volume filters. Selecting a result loads it in a dedicated “Search result” section even when its price is outside the filter range or its volume is below the threshold. Yahoo Finance search and chart endpoints are unofficial and may be throttled or unavailable. Automatic scanning is still limited to the starter watchlist.


### Searched stocks and scanner filters
When a user searches and selects an NSE stock, that stock is added to the scanner universe as well as being shown in its dedicated search-result section. If its latest price and volume satisfy the current filters, it also appears in the main scanner grid. The dedicated search-result card remains visible even if it falls outside the filter range.


### Persistent searched-stock universe
A selected stock is now retained in the scanner universe after the search field is cleared. It appears in the main filtered grid whenever its loaded price and latest candle volume satisfy the current filters. The separate Search result card can be dismissed without removing the stock from the scanner universe for the current page session.


### Main grid rendering fix
The main filtered scanner grid is rendered even while a search-result card is selected. Previously, the selected-search state accidentally hid the main grid, despite the matching-stock count including the selected stock.


## Automatic price-range scanning
The dashboard now requests a batch scan of an editable 100+ symbol NSE starter universe in `lib/nse-universe.js`. Changing minimum/maximum price and minimum volume filters this returned quote list immediately. The scanner is not yet the entire NSE market: add symbols to `lib/nse-universe.js` to expand coverage. The server scan calls Yahoo Finance chart endpoints with modest concurrency; requests can be throttled, so the returned list may be incomplete. A licensed market-data provider and official full symbol master are recommended for a reliable all-NSE scanner.


## Full NSE universe scan (best effort)
- `/api/market/universe` downloads the official NSE mainboard equity CSV and SME equity CSV when reachable, filters mainboard to EQ series, merges symbols, and exposes fallback warnings if the official files cannot be reached.
- `/api/market/scan?offset=0&limit=30` scans one batch. The dashboard iterates through the entire returned universe in batches and displays partial results plus a progress bar.
- This is a best-effort personal scanner. Yahoo Finance's chart endpoint is unofficial and may throttle or omit symbols; failed symbols are reported and the scan can be incomplete. Scanning thousands of symbols one-by-one can take minutes and is not exchange-grade live data. For reliable full-market live scanning, use a licensed provider's bulk market-data product. NSE publishes its official mainboard and SME downloadable symbol lists on its Securities Available for Trading page.

### Scan caching and manual refresh

The dashboard scans automatically only when no saved scan is available. Scan results are cached in the browser's local storage as batches arrive, and the price/volume filters operate on those saved results without calling the market scan API again. Use **Scan Again** to manually fetch a fresh set of quotes; the latest scan replaces the cached results as new batches arrive. The cache is browser-specific and can be cleared by clearing this site's local storage.
