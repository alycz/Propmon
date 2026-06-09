"use client";

import {useEffect, useRef, useState} from "react";
import {formatUnits, type Address} from "viem";
import {useReadContracts} from "wagmi";

import {priceAdapterAbi} from "../lib/abi";
import {demoConfig, markets, type PropmonMode} from "../lib/config";
import type {ChartPoint, PriceCell} from "./types";

const MAX_POINTS = 120;
const DEMO_STEP_SECONDS = 60; // virtual spacing between plotted points (x-axis only)
const DEMO_TICK_MS = 1500; // UI refresh cadence
const DEMO_SAMPLE_DT = DEMO_TICK_MS / 1000; // real seconds sampled per point when seeding history

type Params = {
  ready: boolean;
  priceAddress: Address;
  selectedMarketId: number;
  mode: PropmonMode;
};

export type PropmonPrices = ReturnType<typeof usePropmonPrices>;

export function usePropmonPrices({ready, priceAddress, selectedMarketId, mode}: Params) {
  const isDemo = mode === "demo";

  // Live mode reads spot prices on-chain. Demo mode never touches the chain — it
  // runs a fully client-side simulation so the chart, market list, and order book
  // are populated and ticking the instant the page loads.
  const priceReads = useReadContracts({
    contracts: markets.map((market) => ({
      address: priceAddress,
      abi: priceAdapterAbi,
      functionName: "getPrice",
      args: [BigInt(market.id)]
    })),
    query: {enabled: ready && !isDemo, refetchInterval: 5000}
  });

  // Per-market spot-tick buffer. There is NO on-chain price history, so the chart
  // series is accumulated from polled spot reads (live) or simulated ticks (demo).
  const buffers = useRef<Map<number, ChartPoint[]>>(new Map());
  const [version, setVersion] = useState(0);
  const [demoPrices, setDemoPrices] = useState<PriceCell[]>([]);

  // ---- Demo simulation loop ----
  // The demo price is a pure function of wall-clock time (see priceAt). That makes
  // the market behave as if it has been running continuously 24/7: it never resets
  // to the start price on reload, every visitor sees the same price at the same
  // moment, and it keeps advancing no matter how long any tab has been open. Even if
  // the browser throttles this interval in a background tab, each tick recomputes
  // from the real clock, so the price is always current — never frozen or stale.
  useEffect(() => {
    if (!isDemo) return;
    buffers.current.clear();

    function tick() {
      const now = Date.now() / 1000;
      const next: PriceCell[] = markets.map((market) => {
        const cfg = demoMarketConfig(market.symbol);
        const value = Math.max(priceAt(market.symbol, cfg, now), cfg.startPrice * 0.4);

        let buffer = buffers.current.get(market.id);
        if (!buffer || buffer.length === 0) {
          // Seed a full window by sampling the time-anchored curve in the recent past
          // so the chart is populated and continuous the instant the page loads.
          buffer = [];
          const baseTime = Math.floor(now);
          for (let i = MAX_POINTS - 1; i >= 0; i -= 1) {
            const sampled = Math.max(priceAt(market.symbol, cfg, now - i * DEMO_SAMPLE_DT), cfg.startPrice * 0.4);
            buffer.push({time: baseTime - i * DEMO_STEP_SECONDS, value: sampled});
          }
          buffers.current.set(market.id, buffer);
        } else {
          const last = buffer[buffer.length - 1];
          buffer.push({time: last.time + DEMO_STEP_SECONDS, value});
          if (buffer.length > MAX_POINTS) buffer.splice(0, buffer.length - MAX_POINTS);
        }

        const decimals = market.priceDecimals;
        const price = BigInt(Math.max(0, Math.round(value * 10 ** decimals)));
        return {market, price, decimals, updatedAt: BigInt(Math.floor(now))};
      });
      setDemoPrices(next);
      setVersion((v) => v + 1);
    }

    tick();
    const id = setInterval(tick, DEMO_TICK_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo]);

  // ---- Live spot-read accumulation ----
  const liveCells: PriceCell[] = markets.map((market, index) => {
    const result = priceReads.data?.[index]?.result as readonly [bigint, number, bigint] | undefined;
    return {market, price: result?.[0], decimals: result?.[1], updatedAt: result?.[2]};
  });

  useEffect(() => {
    if (isDemo) return;
    let changed = false;
    for (const cell of liveCells) {
      if (cell.price === undefined || cell.decimals === undefined) continue;
      const value = Number(formatUnits(cell.price, cell.decimals));
      if (!Number.isFinite(value)) continue;
      const time = cell.updatedAt ? Number(cell.updatedAt) : 0;
      let buffer = buffers.current.get(cell.market.id);
      if (!buffer) {
        buffer = [];
        buffers.current.set(cell.market.id, buffer);
        changed = true;
      }
      const last = buffer[buffer.length - 1];
      if (!last || time > last.time) {
        buffer.push({time: time || (last ? last.time + 1 : 0), value});
        if (buffer.length > MAX_POINTS) buffer.splice(0, buffer.length - MAX_POINTS);
        changed = true;
      } else if (last && time === last.time && value !== last.value) {
        last.value = value;
        changed = true;
      }
    }
    if (changed) setVersion((v) => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceReads.dataUpdatedAt, isDemo]);

  const prices = isDemo ? demoPrices : liveCells;
  const activePrice = prices.find((item) => item.market.id === selectedMarketId);
  const series = buffers.current.get(selectedMarketId) ?? [];

  return {prices, activePrice, series, version, isLoading: !isDemo && priceReads.isLoading};
}

function demoMarketConfig(symbol: string) {
  const cfg = demoConfig.priceSeries.markets[symbol as keyof typeof demoConfig.priceSeries.markets];
  return {
    startPrice: cfg?.startPrice ?? 100,
    driftBpsPerStep: cfg?.driftBpsPerStep ?? 16,
    volatilityBps: cfg?.volatilityBps ?? 12
  };
}

// Deterministic, wall-clock-anchored price. Combines fractal value noise across
// several time scales (for lively, market-like wandering) with a slow sinusoidal
// drift. Because the result depends only on real time and the market symbol, the
// curve is identical for every visitor and continuous across reloads.
function priceAt(symbol: string, cfg: ReturnType<typeof demoMarketConfig>, t: number): number {
  const seed = symbolSeed(symbol);
  let n = 0;
  n += valueNoise(seed, t / 41) * 1.0;
  n += valueNoise(seed + 17, t / 13) * 0.5;
  n += valueNoise(seed + 37, t / 5) * 0.25;
  n += valueNoise(seed + 71, t / 3) * 0.12; // fast octave keeps the line visibly moving
  n /= 1.87;
  const amplitude = (cfg.volatilityBps / 10_000) * 9;
  const drift = Math.sin(t / 540 + seed) * (cfg.driftBpsPerStep / 10_000) * 8;
  return cfg.startPrice * (1 + n * amplitude + drift);
}

function symbolSeed(symbol: string): number {
  let h = 2166136261;
  for (let i = 0; i < symbol.length; i += 1) {
    h ^= symbol.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 1000;
}

function hashUnit(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453123;
  return s - Math.floor(s);
}

// 1D coherent (value) noise in [-1, 1] with smoothstep interpolation between
// integer lattice points seeded per octave.
function valueNoise(seed: number, x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hashUnit(i + seed * 1.7);
  const b = hashUnit(i + 1 + seed * 1.7);
  return (a + (b - a) * u) * 2 - 1;
}
