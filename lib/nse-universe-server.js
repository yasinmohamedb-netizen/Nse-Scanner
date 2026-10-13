import { nseUniverse as fallbackSymbols } from "./nse-universe";

const MAINBOARD_CSV = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv";
const SME_CSV = "https://nsearchives.nseindia.com/emerge/corporates/content/SME_EQUITY_L.csv";

function parseCsvLine(line) {
  const fields = [];
  let current = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      fields.push(current.trim()); current = "";
    } else current += ch;
  }
  fields.push(current.trim());
  return fields;
}

function parseSymbols(csv, isSme = false) {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]).map(x => x.toUpperCase().replace(/[^A-Z0-9]/g, ""));
  const symbolIndex = headers.indexOf("SYMBOL");
  const seriesIndex = headers.indexOf("SERIES");
  const nameIndex = headers.findIndex(x => x.includes("COMPANY") || x.includes("NAME"));
  if (symbolIndex < 0) return [];
  const symbols = [];
  for (const line of lines.slice(1)) {
    const row = parseCsvLine(line);
    const symbol = (row[symbolIndex] || "").trim().toUpperCase();
    const series = seriesIndex >= 0 ? (row[seriesIndex] || "").trim().toUpperCase() : "";
    if (!/^[A-Z0-9&._-]{1,30}$/.test(symbol)) continue;
    // Mainboard EQ shares only. SME list is already an equity-only source; retain its listed symbols.
    if (!isSme && series && series !== "EQ") continue;
    if (["SYMBOL", "TOTAL", "NA", "N/A"].includes(symbol)) continue;
    symbols.push({ symbol, name: (row[nameIndex] || symbol).trim() || symbol, market: isSme ? "SME" : "NSE" });
  }
  return symbols;
}

async function getCsv(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; NSEScanner/1.0)", Accept: "text/csv,*/*" },
    cache: "force-cache",
    next: { revalidate: 86400 },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Official NSE symbol list returned HTTP ${response.status}`);
  return response.text();
}

export async function loadNseUniverse() {
  const failures = [];
  let main = [], sme = [];
  try { main = parseSymbols(await getCsv(MAINBOARD_CSV)); } catch (e) { failures.push(e.message); }
  try { sme = parseSymbols(await getCsv(SME_CSV), true); } catch (e) { failures.push(e.message); }

  const merged = new Map();
  for (const item of [...main, ...sme]) merged.set(item.symbol, item);
  if (merged.size) {
    return { stocks: [...merged.values()].sort((a, b) => a.symbol.localeCompare(b.symbol)), source: "official NSE downloadable equity and SME symbol lists", fallback: false, warnings: failures };
  }
  return {
    stocks: fallbackSymbols.map(symbol => ({ symbol, name: symbol, market: "fallback" })),
    source: "built-in fallback list",
    fallback: true,
    warnings: [...failures, "Could not download the official NSE lists. The fallback list is not the full NSE universe."],
  };
}
