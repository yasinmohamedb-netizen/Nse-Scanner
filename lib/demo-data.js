// Illustrative data only. Replace with a real market-data adapter before trading.
const symbols = [
  ["TATASTEEL", 175.00, 12400000, -1.21],
  ["WIPRO", 169.00, 8600000, -1.06],
  ["UNIONBANK", 172.22, 6300000, 1.23],
  ["GAIL", 168.30, 5800000, -0.56],
  ["SAIL", 172.77, 9100000, -0.95],
  ["HUDCO", 164.16, 4200000, -1.44],
  ["NMDC", 187.45, 6800000, 0.64],
  ["COALINDIA", 239.80, 9500000, -1.30],
  ["IOC", 146.20, 7300000, 0.59],
  ["IRFC", 132.40, 3500000, 0.82],
  ["IDFCFIRSTB", 72.10, 7800000, -0.38],
  ["PFC", 212.80, 2900000, 0.44]
];

function makeCandles(seed, lastPrice, count = 72) {
  let value = lastPrice * (0.94 + (seed % 7) * 0.012);
  const candles = [];
  const start = Date.UTC(2026, 3, 1);
  for (let i = 0; i < count; i++) {
    const wave = Math.sin((i + seed) / 5) * lastPrice * 0.009;
    const drift = (Math.sin((i + seed) / 11) - 0.4) * lastPrice * 0.003;
    const open = value;
    const close = Math.max(1, value + wave + drift);
    const high = Math.max(open, close) + lastPrice * (0.002 + ((i + seed) % 4) * 0.001);
    const low = Math.min(open, close) - lastPrice * (0.002 + ((i + seed) % 3) * 0.001);
    candles.push({
      time: Math.floor((start + i * 86400000) / 1000),
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(Math.max(0.01, low).toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: Math.round(80000 + ((i * 7919 + seed * 131) % 500000))
    });
    value = close;
  }
  // Anchor the final close to the displayed illustrative quote.
  const last = candles[candles.length - 1];
  const delta = lastPrice - last.close;
  for (const c of candles) {
    c.open = Number((c.open + delta).toFixed(2));
    c.high = Number((c.high + delta).toFixed(2));
    c.low = Number(Math.max(0.01, c.low + delta).toFixed(2));
    c.close = Number((c.close + delta).toFixed(2));
  }
  return candles;
}

export const demoStocks = symbols.map(([symbol, price, volume, change], i) => ({
  symbol,
  name: symbol,
  price,
  volume,
  change,
  candles: makeCandles(i + 1, price),
}));
