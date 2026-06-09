"use client";

import Link from "next/link";

import {fundedVaultAbi} from "../lib/abi";
import {formatQuote, titleCase} from "../lib/format";
import {usePropmon} from "./PropmonProvider";

export function ExaminationOverview() {
  const {core, account, actions} = usePropmon();
  const {accountIdInput, mode, accountId, ready, fundedAddress} = core;
  const {exam, stateLabel} = account;
  const {writeContractAsync, submit, writePending} = actions;

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
          <strong className={stateBadge(stateLabel)}>{titleCase(stateLabel)}</strong>
        </div>
        <div className="examHeadCell">
          <span>Account size</span>
          <strong className="mono">{formatQuote(exam?.startingBalance, true)}</strong>
        </div>
        <div className="examHeadCell">
          <span>Mode</span>
          <strong className={mode === "demo" ? "accent-warn" : "accent-pos"}>{(mode.charAt(0).toUpperCase() + mode.slice(1))}</strong>
        </div>
      </div>

      <div className="examCta">
        {stateLabel === "EXAMINATION" ? (
          <Link className="primary cta" href={`/terminal?${query}`}>Continue Trading</Link>
        ) : stateLabel === "PASSED" ? (
          <button
            className="primary cta"
            disabled={!ready || !accountId || writePending}
            onClick={() =>
              submit("Activate funded account", () =>
                writeContractAsync({address: fundedAddress, abi: fundedVaultAbi, functionName: "activate", args: [accountId ?? 0n]})
              )
            }
          >
            Activate Funded
          </button>
        ) : stateLabel === "FUNDED" ? (
          <Link className="primary cta" href={`/terminal?${query}`}>Go to Terminal</Link>
        ) : stateLabel === "PAYOUT" ? (
          <Link className="primary cta" href={`/terminal?${query}`}>View Payout</Link>
        ) : (
          <a className="primary cta" href="#tiers">{stateLabel === "FAILED" ? "Buy New Exam" : "Buy Exam"}</a>
        )}
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
