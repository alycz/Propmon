"use client";

import {useMemo} from "react";
import {formatUnits} from "viem";

import {usePropmon} from "./PropmonProvider";

const LEVELS = 9;
const STEP_BPS = 5;

type Level = {price: number; size: number; total: number};

export function OrderBookPanel() {
  const {core, prices} = usePropmon();
  const active = prices.activePrice;
  const base = active?.price !== undefined && active.decimals !== undefined ? Number(formatUnits(active.price, active.decimals)) : undefined;
  const priceDecimals = active?.market.priceDecimals ?? 2;

  const {asks, bids, maxTotal, spread} = useMemo(() => buildBook(base, core.selectedMarketId), [base, core.selectedMarketId]);

  return (
    <div className="book">
      <div className="bookHead">
        <span>Order Book</span>
        <span className="bookTag">SIMULATED DEPTH</span>
      </div>
      <div className="bookCols">
        <span>Price</span>
        <span>Size</span>
        <span>Total</span>
      </div>
      <div className="bookSide asks">
        {asks.map((level, index) => (
          <Row key={`ask-${index}`} level={level} side="ask" maxTotal={maxTotal} priceDecimals={priceDecimals} />
        ))}
      </div>
      <div className="bookMid mono">
        {base ? formatNum(base, priceDecimals) : "--"}
        {spread ? <span className="bookSpread">spread {spread.toFixed(2)} bps</span> : null}
      </div>
      <div className="bookSide bids">
        {bids.map((level, index) => (
          <Row key={`bid-${index}`} level={level} side="bid" maxTotal={maxTotal} priceDecimals={priceDecimals} />
        ))}
      </div>
    </div>
  );
}

function Row({level, side, maxTotal, priceDecimals}: {level: Level; side: "ask" | "bid"; maxTotal: number; priceDecimals: number}) {
  const fill = maxTotal > 0 ? Math.round((level.total / maxTotal) * 100) : 0;
  return (
    <div className={`bookRow ${side}`}>
      <div className="bookDepth" style={{width: `${fill}%`}} />
      <span className={`bookPrice mono ${side === "ask" ? "accent-neg" : "accent-pos"}`}>{formatNum(level.price, priceDecimals)}</span>
      <span className="bookSize mono">{level.size.toFixed(3)}</span>
      <span className="bookTotal mono">{level.total.toFixed(2)}</span>
    </div>
  );
}

function buildBook(base: number | undefined, marketId: number): {asks: Level[]; bids: Level[]; maxTotal: number; spread: number} {
  if (!base || base <= 0) return {asks: [], bids: [], maxTotal: 0, spread: 0};
  const rand = mulberry32(marketId * 911382323);
  const step = (base * STEP_BPS) / 10_000;
  const asks: Level[] = [];
  const bids: Level[] = [];
  let askTotal = 0;
  let bidTotal = 0;
  for (let i = 1; i <= LEVELS; i += 1) {
    const askSize = 0.4 + rand() * 4.6;
    const bidSize = 0.4 + rand() * 4.6;
    askTotal += askSize;
    bidTotal += bidSize;
    asks.push({price: base + step * i, size: askSize, total: askTotal});
    bids.push({price: base - step * i, size: bidSize, total: bidTotal});
  }
  asks.reverse(); // highest ask at the top, best ask just above the spread
  const maxTotal = Math.max(askTotal, bidTotal);
  return {asks, bids, maxTotal, spread: STEP_BPS};
}

function formatNum(value: number, decimals: number): string {
  return value.toLocaleString(undefined, {minimumFractionDigits: decimals, maximumFractionDigits: decimals});
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
