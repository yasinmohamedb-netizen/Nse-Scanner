"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, HistogramSeries, ColorType, LineStyle } from "lightweight-charts";

export default function StockChart({ stock, period = "6M", interval = "1D", height, compact = true }) {
  const hostRef = useRef(null);
  const [candlesData, setCandlesData] = useState(stock?.candles || []);
  const [chartError, setChartError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!stock?.symbol) return;
      try {
        setChartError("");
        const response = await fetch(`/api/market/candles?symbol=${encodeURIComponent(stock.symbol)}&range=${encodeURIComponent(period)}&interval=${encodeURIComponent(interval)}`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Could not load Yahoo Finance candles.");
        if (!cancelled) setCandlesData(payload.candles || []);
      } catch (error) {
        if (!cancelled) {
          setChartError(error.message || "Live candles unavailable");
          setCandlesData([]);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [stock?.symbol, period, interval]);

  useEffect(() => {
    if (!hostRef.current || !candlesData?.length) return;
    const host = hostRef.current;
    const chart = createChart(host, {
      width: host.clientWidth,
      height: height || (compact ? 220 : 520),
      layout: {
        background: { type: ColorType.Solid, color: "#080808" },
        textColor: compact ? "#737373" : "#a3a3a3",
        fontFamily: "Inter, ui-sans-serif, system-ui",
        fontSize: compact ? 9 : 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "#292929", style: LineStyle.Dotted },
        horzLines: { color: "#292929", style: LineStyle.Dotted },
      },
      rightPriceScale: {
        visible: !compact,
        borderVisible: false,
        scaleMargins: { top: 0.12, bottom: 0.22 },
      },
      leftPriceScale: { visible: false },
      timeScale: {
        visible: !compact,
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 1,
        barSpacing: compact ? 7 : 10,
      },
      crosshair: {
        vertLine: { color: "#737373", style: LineStyle.Dashed, labelVisible: !compact },
        horzLine: { color: "#737373", style: LineStyle.Dashed, labelVisible: !compact },
      },
      handleScroll: true,
      handleScale: true,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#089981",
      downColor: "#f23645",
      borderUpColor: "#089981",
      borderDownColor: "#f23645",
      wickUpColor: "#089981",
      wickDownColor: "#f23645",
      priceLineVisible: false,
      lastValueVisible: !compact,
    });
    candleSeries.setData(candlesData.map(({ time, open, high, low, close }) => ({
      time: typeof time === "number" ? time : time,
      open, high, low, close
    })));

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volumeSeries.setData(candlesData.map((c) => ({
      time: c.time,
      value: c.volume || 0,
      color: c.close >= c.open ? "rgba(8,153,129,0.55)" : "rgba(242,54,69,0.55)",
    })));
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
      visible: false,
      borderVisible: false,
    });
    chart.timeScale().fitContent();

    const observer = new ResizeObserver(() => chart.applyOptions({ width: host.clientWidth }));
    observer.observe(host);
    return () => { observer.disconnect(); chart.remove(); };
  }, [candlesData, height, compact]);

  return (
    <div className="chart-wrap">
      <div className="chart-canvas" ref={hostRef} style={{ height: height || (compact ? 220 : 520) }} aria-label={`${stock.symbol} live candlestick chart`} />
      {chartError && <div className="chart-error">{chartError}</div>}
      {!chartError && !candlesData.length && <div className="chart-loading">Loading Yahoo Finance candles…</div>}
    </div>
  );
}
