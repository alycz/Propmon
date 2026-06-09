"use client";

import {formatPrice} from "../lib/format";
import {usePropmon} from "./PropmonProvider";

export function MarketStrip() {
  const {core, prices} = usePropmon();
  const {selectedMarketId, setSelectedMarketId} = core;

  return (
    <div className="marketList">
      <div className="marketListHead">Markets</div>
      {prices.prices.map(({market, price, decimals, updatedAt}) => (
        <button
          key={market.id}
          className={market.id === selectedMarketId ? "marketRow active" : "marketRow"}
          onClick={() => setSelectedMarketId(market.id)}
        >
          <span className="marketRowSym">{market.symbol}</span>
          <span className="marketRowPrice mono">{formatPrice(price, decimals)}</span>
          <span className="marketRowMeta">{updatedAt ? new Date(Number(updatedAt) * 1000).toLocaleTimeString() : "no feed"}</span>
        </button>
      ))}
    </div>
  );
}
