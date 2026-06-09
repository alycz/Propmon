import assert from "node:assert/strict";
import test from "node:test";

import {loadRuntimeConfig} from "./config.js";
import {demoPricesAtStep, type DemoConfig} from "./demo.js";
import {
  type MarketConfig,
  parseMarketStateMessage,
  parseRestContextPrices,
  scalePriceToBigInt
} from "./prices.js";

const markets: MarketConfig[] = [
  {symbol: "BTC", id: 16, priceDecimals: 1},
  {symbol: "MON", id: 64, priceDecimals: 5}
];

test("parses market-state WS messages using mark price", () => {
  const updates = parseMarketStateMessage({
    mt: 9,
    d: [
      {mid: 16, orl: "61401.0", mrk: "61402.4"},
      {mid: 64, orl: "0.02081", mrk: "0.02083"}
    ]
  }, markets);

  assert.equal(updates.length, 2);
  assert.equal(updates[0]?.marketId, 16);
  assert.equal(updates[0]?.price, 614024n);
  assert.equal(updates[0]?.decimals, 1);
  assert.equal(updates[1]?.price, 2083n);
});

test("parses keyed market-state payloads", () => {
  const updates = parseMarketStateMessage({
    mt: 9,
    d: {
      64: {orl: "0.02081", mrk: "0.02083"}
    }
  }, markets);

  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.marketId, 64);
  assert.equal(updates[0]?.price, 2083n);
});

test("demo mode produces deterministic seeded price series", () => {
  const demoConfig: DemoConfig = {
    seed: "fixed-seed",
    priceSeries: {
      markets: {
        BTC: {startPrice: 61400, driftBpsPerStep: 18, volatilityBps: 12},
        MON: {startPrice: 0.0208, driftBpsPerStep: 35, volatilityBps: 18}
      }
    }
  };

  const first = demoPricesAtStep(demoConfig, markets, 3);
  const second = demoPricesAtStep(demoConfig, markets, 3);

  assert.deepEqual(first, second);
  assert.equal(first.length, 2);
});

test("parses REST context fallback prices", () => {
  const updates = parseRestContextPrices({
    markets: [
      {id: 16, state: {orl: 61401.0, mrk: 61402.4}},
      {id: 64, state: {orl: 0.02081, mrk: 0.02083}}
    ]
  }, markets);

  assert.equal(updates.length, 2);
  assert.equal(updates[0]?.source, "live-rest");
  assert.equal(updates[0]?.price, 614024n);
  assert.equal(updates[1]?.price, 2083n);
});

test("config validation requires submission credentials", () => {
  assert.throws(() => loadRuntimeConfig({}), /PRICE_ADAPTER_ADDRESS/);
  assert.throws(() => loadRuntimeConfig({
    PRICE_ADAPTER_ADDRESS: "0x0000000000000000000000000000000000000001"
  }), /RELAYER_PRIVATE_KEY/);
});

test("scales decimal strings with configured decimals", () => {
  assert.equal(scalePriceToBigInt("0.020835", 5), 2084n);
  assert.equal(scalePriceToBigInt("61402.44", 1), 614024n);
});
