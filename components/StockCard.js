 "use client";

import Link from "next/link";
import StockChart from "./StockChart";
import { ArrowDownRight, ArrowUpRight, ExternalLink } from "lucide-react";

export default function StockCard({ stock, period, interval }) {
  const positive = stock.change >= 0;
  return (
    <Link href={`/stock/${encodeURIComponent(stock.symbol)}`} className="stock-card-link" aria-label={`Open full chart for ${stock.symbol}`}>
      <article className="stock-card">
        <header className="stock-card-header">
          <div className="stock-identity">
            <span className="ticker-mark">{stock.symbol.slice(0, 1)}</span>
            <div>
              <div className="ticker">{stock.symbol} <ExternalLink size={11} className="open-chart-icon" /></div>
              <div className="stock-subtitle">NSE · YAHOO FINANCE</div>
            </div>
          </div>
          <div className="quote-block">
            <strong>₹{stock.price.toFixed(2)}</strong>
            <span className={positive ? "positive" : "negative"}>
              {positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              {Math.abs(stock.change).toFixed(2)}%
            </span>
          </div>
        </header>
        <StockChart stock={stock} period={period} interval={interval} compact />
        <footer className="stock-card-footer">
          <span>Volume <b>{(stock.volume / 1000000).toFixed(2)}M</b></span>
          <span>Click chart to open <b>↗</b></span>
        </footer>
      </article>
    </Link>
  );
}
