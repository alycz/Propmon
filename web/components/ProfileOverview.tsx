"use client";

import Link from "next/link";

import {formatQuote} from "../lib/format";
import {usePropmon} from "./PropmonProvider";

export function ProfileOverview() {
  const {core, account} = usePropmon();
  const {accountIdInput, mode} = core;
  const {exam, stateLabel} = account;

  const params = new URLSearchParams();
  params.set("mode", mode);
  if (accountIdInput) params.set("account", accountIdInput);
  const query = params.toString();

  return (
    <section className="examHeader">
      <div className="examHeaderInfo">
        <div className="examHeadCell">
          <span>Account</span>
          <strong className="mono">{accountIdInput ? `#${accountIdInput}` : "—"}</strong>
        </div>
        <div className="examHeadCell">
          <span>State</span>
          <strong className={stateBadge(stateLabel)}>{stateLabel}</strong>
        </div>
        <div className="examHeadCell">
          <span>Challenge tier</span>
          <strong className="mono">{formatQuote(exam?.startingBalance, true)}</strong>
        </div>
        <div className="examHeadCell">
          <span>Mode</span>
          <strong className={mode === "demo" ? "accent-warn" : "accent-pos"}>{mode.toUpperCase()}</strong>
        </div>
      </div>
      <div className="examCta profileLinks">
        <Link className="topnavLink" href={`/terminal?${query}`}>Terminal</Link>
        <Link className="topnavLink" href={`/examination?${query}`}>Examination</Link>
      </div>
    </section>
  );
}

function stateBadge(label: string): string {
  if (label === "FAILED") return "accent-neg";
  if (label === "PASSED" || label === "FUNDED" || label === "PAYOUT") return "accent-pos";
  if (label === "EXAMINATION") return "accent-warn";
  return "";
}
