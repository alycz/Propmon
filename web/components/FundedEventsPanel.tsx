"use client";

import {type Address} from "viem";

import {fundedVaultAbi} from "../lib/abi";
import {formatQuote, shortHash, txUrl} from "../lib/format";
import {usePropmon} from "./PropmonProvider";

export function FundedEventsPanel() {
  const {core, account, actions, events} = usePropmon();
  const {ready, accountId, address, fundedAddress, mode} = core;
  const {stateLabel, funded} = account;
  const {writeContractAsync, submit, writePending} = actions;

  return (
    <div className="panel densePanel">
      <div className="densePanelHead">
        <p className="eyebrow">{mode === "demo" ? events.demoFundedLabel : "Live intent + fallback"}</p>
        <h2>Funded Events</h2>
      </div>

      <div className="metricRow">
        <FundedMetric label="Funded equity" value={formatQuote(funded?.equity, true)} />
        <FundedMetric label="Pending orders" value={funded?.pendingOrders?.toString() ?? "--"} />
      </div>

      <div className="buttonRow">
        <button
          className="secondary"
          disabled={!ready || !accountId || stateLabel !== "PASSED" || writePending}
          onClick={() =>
            submit("Activate funded account", () =>
              writeContractAsync({address: fundedAddress, abi: fundedVaultAbi, functionName: "activate", args: [accountId ?? 0n]})
            )
          }
        >
          Activate Funded
        </button>
        <button
          className="secondary"
          disabled={!ready || !accountId || !address || stateLabel !== "FUNDED" || writePending}
          onClick={() =>
            submit("Payout", () =>
              writeContractAsync({address: fundedAddress, abi: fundedVaultAbi, functionName: "payout", args: [accountId ?? 0n, address as Address]})
            )
          }
        >
          Close → Payout
        </button>
      </div>

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
    </div>
  );
}

function FundedMetric({label, value}: {label: string; value: string}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className="mono">{value}</strong>
    </div>
  );
}
