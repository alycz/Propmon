"use client";

import {useState} from "react";

import {examinationVaultAbi} from "../lib/abi";
import {tierOptions} from "../lib/config";
import {formatQuote, shortHash, txUrl} from "../lib/format";
import {useAgentDemo} from "./AgentDemoProvider";
import {Modal} from "./Modal";
import {Panel} from "./ui";
import {usePropmon} from "./PropmonProvider";

export function TierSelector() {
  const {core, actions} = usePropmon();
  const {ready, isConnected, onWrongChain, examinationAddress, accountIdInput, setAccountIdInput, mode} = core;
  const isDemo = mode === "demo";
  const {writeContractAsync, submit, writePending, receiptPending, lastHash, lastAction, actionError} = actions;
  const {simulateState} = useAgentDemo();

  const [selectedTier, setSelectedTier] = useState(0);
  const [congrats, setCongrats] = useState(false);
  const selectedTierData = tierOptions[selectedTier] ?? tierOptions[0];
  const expectedFee = (selectedTierData.accountSize * 100n) / 10_000n;

  // Demo buy: optimistically open an examination account and celebrate, then
  // route the trader to the Examination page to start demo funding & trading.
  function buyDemoExamination() {
    if (!accountIdInput) setAccountIdInput("1");
    simulateState("EXAMINATION");
    setCongrats(true);
  }

  const examQuery = `mode=${mode}&account=${accountIdInput || "1"}`;

  return (
    <Panel title="Buy Examination" eyebrow="Choose your challenge tier" className="anchorPanel">
      <span id="tiers" className="anchor" />
      <div className="tierGrid">
        {tierOptions.map((tier, index) => (
          <button key={tier.label} className={selectedTier === index ? "tier active" : "tier"} onClick={() => setSelectedTier(index)}>
            <span>{tier.label.split(" — ")[0]}</span>
            <strong className="mono">{formatQuote(tier.examFee, true)}</strong>
          </button>
        ))}
      </div>
      <button
        className="primary"
        disabled={writePending || (!isDemo && (!ready || !isConnected || onWrongChain))}
        onClick={() => {
          if (isDemo) {
            buyDemoExamination();
            return;
          }
          submit("Buy examination", () =>
            writeContractAsync({
              address: examinationAddress,
              abi: examinationVaultAbi,
              functionName: "buyExamination",
              args: [selectedTierData.accountSize],
              value: expectedFee
            })
          );
        }}
      >
        Buy Examination — {formatQuote(selectedTierData.examFee, true)}
      </button>
      <p className="helper">
        Examination price: {formatQuote(selectedTierData.examFee, true)} for a {selectedTierData.label.split(" — ")[1]} paper account.
        {isDemo ? " Demo mode — buy any tier and start trading instantly." : " The account ID is auto-filled from the purchase receipt."}
      </p>
      {!isDemo && (
        <label className="field">
          <span>Account ID</span>
          <input inputMode="numeric" value={accountIdInput} onChange={(event) => setAccountIdInput(event.target.value.replace(/\D/g, ""))} placeholder="Auto-filled after buy or enter manually" />
        </label>
      )}
      {lastHash && (
        <p className="helper">
          {receiptPending ? `${lastAction} pending: ` : `${lastAction} confirmed: `}
          <a href={txUrl(lastHash)} target="_blank" rel="noreferrer">{shortHash(lastHash)}</a>
        </p>
      )}
      {actionError && <p className="errorText">{actionError}</p>}

      <Modal
        open={congrats}
        lock={false}
        title="🎉 Congrats — examination purchased!"
        onClose={() => setCongrats(false)}
        primaryLabel="Go to Examination"
        primaryHref={`/examination?${examQuery}`}
      >
        <p>
          Your {selectedTierData.label.split(" — ")[0]} examination account is ready. Head to the Examination page to
          start demo funding and demo trading.
        </p>
      </Modal>
    </Panel>
  );
}
