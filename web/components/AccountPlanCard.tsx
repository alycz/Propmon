"use client";

import {marketById} from "../lib/config";
import {formatBps, formatQuote, formatSignedQuote, titleCase} from "../lib/format";
import {Metric, Panel} from "./ui";
import {usePropmon} from "./PropmonProvider";

export function AccountPlanCard() {
  const {core, account} = usePropmon();
  const {accountIdInput, selectedMarketId, mode} = core;
  const {exam, drawdown, stateLabel, stateIndex, passedFailed, entries} = account;

  const selectedSymbol = marketById(selectedMarketId)?.symbol ?? "--";
  const ruleResult = passedFailed?.[1] ? "FAILED" : passedFailed?.[0] ? "PASSED" : "ACTIVE";

  return (
    <Panel title="Propmon Account" eyebrow="Plan = challenge tier, not a subscription">
      <div className="metricRow">
        <Metric label="Account ID" value={accountIdInput ? `#${accountIdInput}` : "—"} />
        <Metric label="State" value={titleCase(stateLabel)} accent={stateLabel === "FAILED" ? "neg" : stateIndex >= 2 ? "pos" : undefined} />
      </div>
      <div className="metricRow">
        <Metric label="Challenge tier" value={formatQuote(exam?.startingBalance, true)} />
        <Metric label="Selected market" value={selectedSymbol} />
      </div>
      <div className="metricRow">
        <Metric label="Equity" value={formatQuote(exam?.equity, true)} />
        <Metric label="Realized P&L" value={formatSignedQuote(exam?.realizedPnl)} accent={(exam?.realizedPnl ?? 0n) < 0n ? "neg" : (exam?.realizedPnl ?? 0n) > 0n ? "pos" : undefined} />
      </div>
      <div className="metricRow">
        <Metric label="Total drawdown" value={formatBps(drawdown?.[1])} />
        <Metric label="Entries" value={String(entries.length)} />
      </div>
      <div className="metricRow">
        <Metric label="Rule result" value={titleCase(ruleResult)} accent={ruleResult === "FAILED" ? "neg" : ruleResult === "PASSED" ? "pos" : undefined} />
        <Metric label="Mode" value={(mode.charAt(0).toUpperCase() + mode.slice(1))} accent={mode === "demo" ? "warn" : "pos"} />
      </div>
    </Panel>
  );
}
