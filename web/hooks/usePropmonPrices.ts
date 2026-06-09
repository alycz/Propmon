"use client";

import {useEffect, useRef, useState} from "react";
import {formatUnits, type Address} from "viem";
import {useReadContracts} from "wagmi";

import {priceAdapterAbi} from "../lib/abi";
import {demoConfig, markets, type PropmonMode} from "../lib/config";
import type {ChartPoint, PriceCell} from "./types";

const MAX_POINTS = 120;
const DEMO_SEED_POINTS = 64;
const DEMO_STEP_SECONDS = 60;
const DEMO_TICK_MS = 1500;

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
  const demoValues = useRef<Map<number, number>>(new Map());
  const [version, setVersion] = useState(0);
  const [demoPrices, setDemoPrices] = useState<PriceCell[]>([]);

  // ---- Demo simulation loop ----
  useEffect(() => {
    if (!isDemo) return;
    demoValues.current.clear();

    function tick() {
      const now = Math.floor(Date.now() / 1000);
      const next: PriceCell[] = markets.map((market) => {
        const cfg = demoMarketConfig(market.symbol);
        let value = demoValues.current.get(market.id);
        if (value === undefined) {
          value = cfg.startPrice;
          demoValues.current.set(market.id, value);
          buffers.current.set(market.id, seedDemoSeries(market.id, value, now, cfg.volatilityBps));
        } else {
          const vol = cfg.volatilityBps / 10_000;
          const drift = (cfg.driftBpsPerStep / 10_000) * 0.04;
          const shock = (Math.random() - 0.5) * 2 * vol + drift;
          value = Math.max(value * (1 + shock), cfg.startPrice * 0.4);
          demoValues.current.set(market.id, value);
          const buffer = buffers.current.get(market.id) ?? [];
          const last = buffer[buffer.length - 1];
          buffer.push({time: last ? last.time + DEMO_STEP_SECONDS : now, value});
          if (buffer.length > MAX_POINTS) buffer.splice(0, buffer.length - MAX_POINTS);
          buffers.current.set(market.id, buffer);
        }
        const decimals = market.priceDecimals;
        const price = BigInt(Math.max(0, Math.round(value * 10 ** decimals)));
        return {market, price, decimals, updatedAt: BigInt(now)};
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

function seedDemoSeries(marketId: number, currentValue: number, latestTime: number, volatilityBps: number): ChartPoint[] {
  if (!Number.isFinite(currentValue) || currentValue <= 0) return [];
  const rand = mulberry32(marketId * 2654435761);
  const baseTime = (latestTime || Math.floor(DEMO_SEED_POINTS * DEMO_STEP_SECONDS)) - DEMO_SEED_POINTS * DEMO_STEP_SECONDS;
  const points: ChartPoint[] = [];
  // Walk backwards from the current value so the synthetic tail meets the live point.
  let value = currentValue;
  const walk: number[] = [value];
  for (let i = 0; i < DEMO_SEED_POINTS; i += 1) {
    const shock = (rand() - 0.5) * 2 * (volatilityBps / 10_000);
    value = value / (1 + shock);
    walk.push(value);
  }
  walk.reverse();
  for (let i = 0; i < walk.length; i += 1) {
    points.push({time: baseTime + i * DEMO_STEP_SECONDS, value: walk[i]});
  }
  return points;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
