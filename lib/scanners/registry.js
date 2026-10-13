import { priceVolumeScanner } from "./price-volume";

// Register new scanner modules here. Each scanner owns its own matching logic.
export const scannerRegistry = [
  priceVolumeScanner,
];

export function runScanners(stocks, settings, enabledScannerIds = ["price-volume"]) {
  const active = scannerRegistry.filter((scanner) => enabledScannerIds.includes(scanner.id));
  return stocks.filter((stock) => active.every((scanner) => scanner.matches(stock, settings)));
}
