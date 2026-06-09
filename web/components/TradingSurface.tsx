"use client";

import {useState} from "react";

import {marketById} from "../lib/config";
import {ExecutionPanel} from "./ExecutionPanel";
import {FundedEventsPanel} from "./FundedEventsPanel";
import {MarketStrip} from "./MarketStrip";
import {OrderBookPanel} from "./OrderBookPanel";
import {PriceChart} from "./PriceChart";
import {usePropmon} from "./PropmonProvider";
import {TerminalLedger} from "./TerminalLedger";
import {TerminalShell} from "./TerminalShell";

export type SurfaceKind = "examination" | "terminal";

const timeframes = ["1m", "5m", "15m", "1h"] as const;

export function TradingSurface({surface}: {surface: SurfaceKind}) {
  const {core, prices} = usePropmon();
  const market = marketById(core.selectedMarketId);
  const [timeframe, setTimeframe] = useState<(typeof timeframes)[number]>("5m");

  const isExam = surface === "examination";
  const badgeText = isExam ? "EXAMINATION — simulated balance" : "TERMINAL — funded";

  return (
    <div className="surface">
      <div className={`surfaceBadge ${isExam ? "exam" : "funded"}`}>
        <span className="surfaceBadgeLabel">{badgeText}</span>
        <span className="surfaceBadgeNote">
          {isExam
            ? "Evaluation context — PnL is simulated / scored against the examination rules."
            : core.mode === "demo"
              ? "Funded context — demo mode: fills are simulated, clearly labeled, not live execution."
              : "Funded context — funded trading."}
        </span>
      </div>

      <TerminalShell
        market={<MarketStrip />}
        chart={
          <div className="chartPanel">
            <div className="chartControls">
              <div className="chartTitle">
                <strong>{market?.symbol ?? "--"}</strong>
                <span className="chartFeedTag">{core.mode === "demo" ? "DEMO SERIES" : "LIVE SPOT TICKS"}</span>
              </div>
              <div className="timeframes">
                {timeframes.map((tf) => (
                  <button key={tf} className={tf === timeframe ? "tf active" : "tf"} onClick={() => setTimeframe(tf)}>
                    {tf}
                  </button>
                ))}
              </div>
            </div>
            <PriceChart
              series={prices.series}
              symbol={market?.symbol ?? "--"}
              decimals={market?.priceDecimals ?? 2}
              height={360}
            />
            <p className="chartFootnote">
              Series is derived from on-chain spot reads (no historical price feed exists on-chain)
              {core.mode === "demo" ? ", seeded with a deterministic demo path" : ""}.
            </p>
          </div>
        }
        book={<OrderBookPanel />}
        ticket={<ExecutionPanel surface={surface} />}
        ledger={<TerminalLedger />}
        events={<FundedEventsPanel />}
      />
    </div>
  );
}
