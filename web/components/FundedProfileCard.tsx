"use client";

import {formatQuote, shortHash, txUrl} from "../lib/format";
import {Metric, Panel} from "./ui";
import {usePropmon} from "./PropmonProvider";

export function FundedProfileCard() {
  const {account, events} = usePropmon();
  const {funded, stateIndex} = account;

  if (stateIndex < 3) return null;

  return (
    <section className="grid two">
      <Panel title="Funded Status" eyebrow="Live &amp; demo execution">
        <div className="metricRow">
          <Metric label="Funded equity" value={formatQuote(funded?.equity, true)} />
          <Metric label="Pending orders" value={funded?.pendingOrders?.toString() ?? "--"} />
        </div>
        <div className="metricRow">
          <Metric label="Open positions" value={funded?.openPositions?.toString() ?? "--"} />
          <Metric label="Reserved collateral" value={formatQuote(funded?.reservedCollateral)} />
        </div>
        <div className="metricRow">
          <Metric label="Realized P&L" value={formatQuote(funded?.realizedPnl)} />
          <Metric label="Committed collateral" value={formatQuote(funded?.committedCollateral)} />
        </div>
      </Panel>

      <Panel title="Funded Events" eyebrow="Intents, fills, payouts">
        <div className="timeline">
          {events.fundedEvents.length === 0 && <p className="helper">No funded events indexed yet.</p>}
          {events.fundedEvents.slice().reverse().map((event) => (
            <div className="timelineItem" key={event.key}>
              <strong>{event.label}</strong>
              <span>{event.detail}</span>
              {event.hash && <a href={txUrl(event.hash)} target="_blank" rel="noreferrer">{shortHash(event.hash)}</a>}
            </div>
          ))}
        </div>
      </Panel>
    </section>
  );
}
