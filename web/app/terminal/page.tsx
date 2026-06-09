"use client";

import {useState} from "react";

import {marketById} from "../../lib/config";
import {AppShell} from "../../components/AppShell";
import {FundedEventsPanel} from "../../components/FundedEventsPanel";
import {MarketStrip} from "../../components/MarketStrip";
import {OrderBookPanel} from "../../components/OrderBookPanel";
import {PriceChart} from "../../components/PriceChart";
import {usePropmon} from "../../components/PropmonProvider";
import {TerminalLedger} from "../../components/TerminalLedger";
import {TerminalShell} from "../../components/TerminalShell";
import {TradeTicket} from "../../components/TradeTicket";

const timeframes = ["1m", "5m", "15m", "1h"] as const;

export default function TerminalPage() {
  const {core, prices} = usePropmon();
  const market = marketById(core.selectedMarketId);
  const [timeframe, setTimeframe] = useState<(typeof timeframes)[number]>("5m");

  return (
    <AppShell>
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
              Series is derived from on-chain spot reads (no historical price feed exists on-chain){core.mode === "demo" ? ", seeded with a deterministic demo path" : ""}.
            </p>
          </div>
        }
        book={<OrderBookPanel />}
        ticket={<TradeTicket />}
        ledger={<TerminalLedger />}
        events={<FundedEventsPanel />}
      />
    </AppShell>
  );
}
