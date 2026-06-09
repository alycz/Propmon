"use client";

import dynamic from "next/dynamic";

import type {ChartPoint} from "../hooks/types";

export type MarketMakingViz = {
  active: boolean;
  spreadBps: number;
  tick: number;
};

export type PriceChartProps = {
  series: ChartPoint[];
  symbol: string;
  height?: number;
  decimals?: number;
  marketMaking?: MarketMakingViz;
};

// lightweight-charts is browser-only — load it with no SSR so it never runs on
// the server. The prop contract is stable, so this file can be swapped for a
// dependency-free SVG implementation without touching any caller.
const PriceChartImpl = dynamic(() => import("./PriceChartImpl"), {
  ssr: false,
  loading: () => <div className="chartCanvas chartLoading">Loading chart…</div>
});

export function PriceChart(props: PriceChartProps) {
  return <PriceChartImpl {...props} />;
}
