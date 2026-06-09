import {createHash} from "node:crypto";

import {type MarketConfig, type PriceUpdate, scalePriceToBigInt} from "./prices.js";

export type DemoMarketSeries = {
  startPrice: number;
  driftBpsPerStep: number;
  volatilityBps: number;
};

export type DemoConfig = {
  seed: string;
  priceSeries: {
    markets: Record<string, DemoMarketSeries>;
  };
};

export function demoPriceAtStep(
  demoConfig: DemoConfig,
  market: MarketConfig,
  step: number
): PriceUpdate {
  const series = demoConfig.priceSeries.markets[market.symbol];
  if (!series) {
    throw new Error(`Demo config missing price series for ${market.symbol}`);
  }

  const noiseBps = deterministicNoiseBps(demoConfig.seed, market.symbol, step, series.volatilityBps);
  const totalBps = (series.driftBpsPerStep * step) + noiseBps;
  const price = series.startPrice * (1 + totalBps / 10_000);
  const rawPrice = price.toFixed(Math.min(market.priceDecimals + 8, 18));

  return {
    marketId: market.id,
    symbol: market.symbol,
    price: scalePriceToBigInt(rawPrice, market.priceDecimals),
    decimals: market.priceDecimals,
    source: "demo",
    rawPrice
  };
}

export function demoPricesAtStep(
  demoConfig: DemoConfig,
  markets: MarketConfig[],
  step: number
): PriceUpdate[] {
  return markets.map((market) => demoPriceAtStep(demoConfig, market, step));
}

function deterministicNoiseBps(seed: string, symbol: string, step: number, volatilityBps: number): number {
  if (volatilityBps === 0) return 0;

  const hash = createHash("sha256").update(`${seed}:${symbol}:${step}`).digest();
  const sample = hash.readUInt32BE(0) / 0xffffffff;
  return Math.round((sample * 2 - 1) * volatilityBps);
}
