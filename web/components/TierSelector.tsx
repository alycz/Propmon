"use client";

import {useState} from "react";

import {examinationVaultAbi} from "../lib/abi";
import {tierOptions} from "../lib/config";
import {formatNative, shortHash, txUrl} from "../lib/format";
import {Panel} from "./ui";
import {usePropmon} from "./PropmonProvider";

export function TierSelector() {
  const {core, actions} = usePropmon();
  const {ready, isConnected, onWrongChain, examinationAddress, accountIdInput, setAccountIdInput} = core;
  const {writeContractAsync, submit, writePending, receiptPending, lastHash, lastAction, actionError} = actions;

  const [selectedTier, setSelectedTier] = useState(0);
  const selectedTierData = tierOptions[selectedTier] ?? tierOptions[0];
  const expectedFee = (selectedTierData.accountSize * 100n) / 10_000n;

  return (
    <Panel title="Buy Examination" eyebrow="Choose your challenge tier" className="anchorPanel">
      <span id="tiers" className="anchor" />
      <div className="tierGrid">
        {tierOptions.map((tier, index) => (
          <button key={tier.label} className={selectedTier === index ? "tier active" : "tier"} onClick={() => setSelectedTier(index)}>
            <span>{tier.label}</span>
            <strong className="mono">fee {formatNative((tier.accountSize * 100n) / 10_000n)}</strong>
          </button>
        ))}
      </div>
      <button
        className="primary"
        disabled={!ready || !isConnected || onWrongChain || writePending}
        onClick={() =>
          submit("Buy examination", () =>
            writeContractAsync({
              address: examinationAddress,
              abi: examinationVaultAbi,
              functionName: "buyExamination",
              args: [selectedTierData.accountSize],
              value: expectedFee
            })
          )
        }
      >
        Buy Examination — {selectedTierData.label}
      </button>
      <p className="helper">Entry fee is 1% of the paper balance: {formatNative(expectedFee)}. The account ID is auto-filled from the purchase receipt.</p>
      <label className="field">
        <span>Account ID</span>
        <input inputMode="numeric" value={accountIdInput} onChange={(event) => setAccountIdInput(event.target.value.replace(/\D/g, ""))} placeholder="Auto-filled after buy or enter manually" />
      </label>
      {lastHash && (
        <p className="helper">
          {receiptPending ? `${lastAction} pending: ` : `${lastAction} confirmed: `}
          <a href={txUrl(lastHash)} target="_blank" rel="noreferrer">{shortHash(lastHash)}</a>
        </p>
      )}
      {actionError && <p className="errorText">{actionError}</p>}
    </Panel>
  );
}
