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

type Params = {
  ready: boolean;
  priceAddress: Address;
  selectedMarketId: number;
  mode: PropmonMode;
};

export type PropmonPrices = ReturnType<typeof usePropmonPrices>;

export function usePropmonPrices({ready, priceAddress, selectedMarketId, mode}: Params) {
  const priceReads = useReadContracts({
    contracts: markets.map((market) => ({
      address: priceAddress,
      abi: priceAdapterAbi,
      functionName: "getPrice",
      args: [BigInt(market.id)]
    })),
    query: {enabled: ready, refetchInterval: 5000}
  });

  const prices: PriceCell[] = markets.map((market, index) => {
    const result = priceReads.data?.[index]?.result as readonly [bigint, number, bigint] | undefined;
    return {market, price: result?.[0], decimals: result?.[1], updatedAt: result?.[2]};
  });
  const activePrice = prices.find((item) => item.market.id === selectedMarketId);

  // Per-market spot-tick buffer. There is NO on-chain price history (getPrice is
  // spot only), so the chart series is accumulated from polled spot reads, with a
  // seeded deterministic demo series prepended so the chart is populated instantly.
  const buffers = useRef<Map<number, ChartPoint[]>>(new Map());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let changed = false;
    for (const cell of prices) {
      if (cell.price === undefined || cell.decimals === undefined) continue;
      const value = Number(formatUnits(cell.price, cell.decimals));
      if (!Number.isFinite(value)) continue;
      const time = cell.updatedAt ? Number(cell.updatedAt) : 0;
      let buffer = buffers.current.get(cell.market.id);
      if (!buffer) {
        buffer = seedDemoSeries(cell.market.id, value, time, mode);
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
  }, [priceReads.dataUpdatedAt, mode]);

  const series = buffers.current.get(selectedMarketId) ?? [];

  return {prices, activePrice, series, version, isLoading: priceReads.isLoading};
}

function seedDemoSeries(marketId: number, currentValue: number, latestTime: number, mode: PropmonMode): ChartPoint[] {
  if (mode !== "demo" || !Number.isFinite(currentValue) || currentValue <= 0) return [];
  const symbol = markets.find((m) => m.id === marketId)?.symbol;
  const market = symbol ? demoConfig.priceSeries.markets[symbol as keyof typeof demoConfig.priceSeries.markets] : undefined;
  const volatilityBps = market?.volatilityBps ?? 12;
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
