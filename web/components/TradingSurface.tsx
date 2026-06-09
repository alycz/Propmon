"use client";

import {useState} from "react";

import {marketById} from "../lib/config";
import {useAgentDemo} from "./AgentDemoProvider";
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
  const {mm} = useAgentDemo();
  const market = marketById(core.selectedMarketId);
  const [timeframe, setTimeframe] = useState<(typeof timeframes)[number]>("5m");

  return (
    <div className="surface">
      <TerminalShell
        market={<MarketStrip />}
        chart={
          <div className="chartPanel">
            <div className="chartControls">
              <div className="chartTitle">
                <strong>{market?.symbol ?? "--"}</strong>
                <span className="chartFeedTag">{core.mode === "demo" ? "DEMO SERIES" : "LIVE SPOT TICKS"}</span>
                {mm.active && (
                  <span className="chartAgentTag">
                    <span className="agentPillDot" /> Agent market-making (demo)
                  </span>
                )}
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
              marketMaking={{active: mm.active, spreadBps: mm.spreadBps, tick: mm.tick}}
            />
            <p className="chartFootnote">
              Spot-read series{core.mode === "demo" ? " · seeded demo path" : ""}.
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
