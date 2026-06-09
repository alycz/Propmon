"use client";

import {formatBps, formatQuote} from "../lib/format";
import {usePropmon} from "./PropmonProvider";

export function StatusStrip() {
  const {core, account} = usePropmon();
  const {exam, drawdown, stateLabel} = account;
  const ruleResult = account.passedFailed?.[1] ? "FAILED" : account.passedFailed?.[0] ? "PASSED" : "ACTIVE";
  return (
    <section className="statusStrip" aria-label="Account status">
      <StatusCell label="Account" value={core.accountIdInput ? `#${core.accountIdInput}` : "—"} mono />
      <StatusCell label="State" value={stateLabel} accent={stateClass(stateLabel)} />
      <StatusCell label="Equity" value={formatQuote(exam?.equity, true)} mono />
      <StatusCell label="Total DD" value={formatBps(drawdown?.[1])} mono />
      <StatusCell label="Rule" value={ruleResult} accent={ruleResult === "FAILED" ? "neg" : ruleResult === "PASSED" ? "pos" : undefined} />
      <StatusCell label="Mode" value={core.mode.toUpperCase()} accent={core.mode === "demo" ? "warn" : "pos"} />
    </section>
  );
}

function StatusCell({label, value, mono, accent}: {label: string; value: string; mono?: boolean; accent?: string}) {
  return (
    <div className="statusCell">
      <span>{label}</span>
      <strong className={`${mono ? "mono " : ""}${accent ? `accent-${accent}` : ""}`}>{value}</strong>
    </div>
  );
}

function stateClass(label: string): string | undefined {
  if (label === "FAILED") return "neg";
  if (label === "PASSED" || label === "FUNDED" || label === "PAYOUT") return "pos";
  if (label === "EXAMINATION") return "warn";
  return undefined;
}
