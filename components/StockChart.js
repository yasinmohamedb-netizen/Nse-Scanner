"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, HistogramSeries, ColorType, LineStyle } from "lightweight-charts";

export default function StockChart({ stock, period = "6M", interval = "1D", height, compact = true }) {
  const hostRef = useRef(null);
  const [candlesData, setCandlesData] = useState([]);
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
        if (!cancelled) {
          const normalized = (Array.isArray(payload.candles) ? payload.candles : []).map(candle => {
            let time = candle.time;
            if (typeof time === "string" && /^\\d{4}-\\d{2}-\\d{2}$/.test(time)) {
              const parts = time.split("-").map(Number);
              time = { year: parts[0], month: parts[1], day: parts[2] };
            } else if (typeof time === "number") {
              time = Math.floor(time);
            }
            return { ...candle, time };
          }).filter(candle => {
            const t = candle.time;
            const validTime = (typeof t === "number" && Number.isFinite(t) && t > 0) ||
              (t && typeof t === "object" && Number.isFinite(t.year) && Number.isFinite(t.month) && Number.isFinite(t.day));
            return validTime && [candle.open, candle.high, candle.low, candle.close].every(value => Number.isFinite(Number(value)));
          });
          setCandlesData(normalized);
        }
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
    const validCandles = candlesData.filter(c => {
      const t = c?.time;
      return ((typeof t === "number" && Number.isFinite(t) && t > 0) ||
        (t && typeof t === "object" && Number.isFinite(t.year) && Number.isFinite(t.month) && Number.isFinite(t.day))) &&
        [c.open, c.high, c.low, c.close].every(value => Number.isFinite(Number(value)));
    });
    if (!validCandles.length) return;
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
    candleSeries.setData(validCandles.map(({ time, open, high, low, close }) => ({
      time, open: Number(open), high: Number(high), low: Number(low), close: Number(close)
    })));

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volumeSeries.setData(validCandles.map((c) => ({
      time: c.time,
      value: Number(c.volume) || 0,
      color: Number(c.close) >= Number(c.open) ? "rgba(8,153,129,0.55)" : "rgba(242,54,69,0.55)",
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
