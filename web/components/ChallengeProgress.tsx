"use client";

import {demoConfig} from "../lib/config";
import {formatQuote, formatSignedQuote} from "../lib/format";
import {DrawdownMeter, Metric, Panel} from "./ui";
import {usePropmon} from "./PropmonProvider";

const profitTargetBps = demoConfig.scriptedPass.profitTargetBps;

export function ChallengeProgress() {
  const {account} = usePropmon();
  const {exam, drawdown, passedFailed} = account;

  const starting = exam?.startingBalance ?? 0n;
  const equity = exam?.equity ?? 0n;
  const pnl = equity - starting;
  const targetGain = (starting * BigInt(profitTargetBps)) / 10_000n;
  const progressPct = targetGain > 0n ? clamp(Number((pnl * 100n) / targetGain)) : 0;
  const targetEquity = starting + targetGain;

  const passed = Boolean(passedFailed?.[0]);
  const failed = Boolean(passedFailed?.[1]);

  return (
    <Panel title="Challenge Progress" eyebrow="Profit target &amp; risk">
      <div className="metricRow">
        <Metric label="Initial equity" value={formatQuote(starting, true)} />
        <Metric label="Current equity" value={formatQuote(equity, true)} accent={pnl < 0n ? "neg" : pnl > 0n ? "pos" : undefined} />
      </div>

      <div className="progressBlock">
        <div className="progressLabel">
          <span>Profit target ({profitTargetBps / 100}%)</span>
          <span className="mono">{formatSignedQuote(pnl)} / {formatQuote(targetGain, true)}</span>
        </div>
        <div className="progressTrack">
          <div className={`progressFill ${progressPct >= 100 ? "done" : ""}`} style={{width: `${progressPct}%`}} />
        </div>
        <p className="helper">Target equity {formatQuote(targetEquity, true)}.</p>
      </div>

      <DrawdownMeter label="Daily drawdown" value={drawdown?.[0]} limit={500} />
      <DrawdownMeter label="Total drawdown" value={drawdown?.[1]} limit={1000} />

      <div className="ruleGrid">
        <Metric label="Entries" value={exam?.entryCount?.toString() ?? "--"} />
        <Metric label="Open positions" value={exam?.openPositions?.toString() ?? "--"} />
        <Metric label="Realized P&L" value={formatSignedQuote(exam?.realizedPnl)} accent={(exam?.realizedPnl ?? 0n) < 0n ? "neg" : (exam?.realizedPnl ?? 0n) > 0n ? "pos" : undefined} />
        <Metric label="Result" value={failed ? "Failed" : passed ? "Passed" : "Active"} accent={failed ? "neg" : passed ? "pos" : undefined} />
      </div>
    </Panel>
  );
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}
