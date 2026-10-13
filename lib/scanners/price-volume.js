export const priceVolumeScanner = {
  id: "price-volume",
  name: "Price + Volume",
  description: "Keep stocks inside the selected price range and above minimum volume.",
  defaultEnabled: true,
  matches(stock, settings) {
    const price = Number(stock.price);
    const volume = Number(stock.volume);
    return Number.isFinite(price) &&
      Number.isFinite(volume) &&
      price >= Number(settings.minPrice) &&
      price <= Number(settings.maxPrice) &&
      volume >= Number(settings.minVolume);
  },
};
