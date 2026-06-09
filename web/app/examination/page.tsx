"use client";

import {useState} from "react";
import {isAddress, type Address} from "viem";

import {accountRegistryAbi, examinationVaultAbi} from "../../lib/abi";
import {demoConfig, tierOptions} from "../../lib/config";
import {addressUrl, formatNative, formatQuote, formatSignedQuote, shortHash, txUrl} from "../../lib/format";
import {AppShell} from "../../components/AppShell";
import {usePropmon} from "../../components/PropmonProvider";
import {DrawdownMeter, Metric, Panel} from "../../components/ui";

export default function ExaminationPage() {
  const {core, agent, account, actions, demo} = usePropmon();
  const {ready, isConnected, onWrongChain, accountId, accountIdInput, setAccountIdInput, examinationAddress, registryAddress, mode} = core;
  const {agentSigner, agentSignerStatus} = agent;
  const {exam, stateLabel, drawdown, passedFailed, authorizedSigner} = account;
  const {writeContractAsync, submit, writePending, lastHash, lastAction, receiptPending, actionError} = actions;
  const {runDemoScript, demoStatus} = demo;

  const [selectedTier, setSelectedTier] = useState(0);
  const selectedTierData = tierOptions[selectedTier] ?? tierOptions[0];
  const expectedFee = (selectedTierData.accountSize * 100n) / 10_000n;
  const ruleResult = passedFailed?.[1] ? "FAILED" : passedFailed?.[0] ? "PASSED" : "ACTIVE";

  return (
    <AppShell>
      <section className="grid two">
        <Panel title="Buy Examination" eyebrow="Entry">
          <div className="tierGrid">
            {tierOptions.map((tier, index) => (
              <button
                key={tier.label}
                className={selectedTier === index ? "tier active" : "tier"}
                onClick={() => setSelectedTier(index)}
              >
                <span>{tier.label}</span>
                <strong className="mono">{formatNative((tier.accountSize * 100n) / 10_000n)}</strong>
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
            Buy Examination
          </button>
          <p className="helper">Fee is 1%: {formatNative(expectedFee)} for {selectedTierData.label} paper balance.</p>
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

        <Panel title="Challenge Progress" eyebrow="State">
          <div className="metricRow">
            <Metric label="Registry state" value={stateLabel} />
            <Metric label="Rule result" value={ruleResult} accent={ruleResult === "FAILED" ? "neg" : ruleResult === "PASSED" ? "pos" : undefined} />
          </div>
          <div className="metricRow">
            <Metric label="Starting balance" value={formatQuote(exam?.startingBalance, true)} />
            <Metric label="Equity" value={formatQuote(exam?.equity, true)} />
          </div>
          <DrawdownMeter label="Daily drawdown" value={drawdown?.[0]} limit={500} />
          <DrawdownMeter label="Total drawdown" value={drawdown?.[1]} limit={1000} />
          <div className="ruleGrid">
            <Metric label="Open positions" value={exam?.openPositions?.toString() ?? "--"} />
            <Metric label="Entries" value={exam?.entryCount?.toString() ?? "--"} />
            <Metric label="Realized P&L" value={formatSignedQuote(exam?.realizedPnl)} />
            <Metric label="Profit target" value={`${demoConfig.scriptedPass.profitTargetBps / 100}%`} />
          </div>
        </Panel>
      </section>

      <section className="grid two">
        <Panel title="Connect an Agent" eyebrow="Authorized signer">
          <div className="agentSignerBox">
            <span>Agent signer</span>
            {isAddress(agentSigner) ? (
              <a href={addressUrl(agentSigner)} target="_blank" rel="noreferrer">{shortHash(agentSigner)}</a>
            ) : (
              <strong>Unavailable</strong>
            )}
            <small>{agentSignerStatus}</small>
          </div>
          <div className="buttonRow">
            <button
              className="secondary"
              disabled={!ready || !accountId || !isAddress(agentSigner) || writePending}
              onClick={() =>
                submit("Authorize signer", () =>
                  writeContractAsync({address: registryAddress, abi: accountRegistryAbi, functionName: "authorizeSigner", args: [accountId ?? 0n, agentSigner as Address]})
                )
              }
            >
              Authorize
            </button>
            <button className="secondary" disabled={!isAddress(agentSigner)}>
              {authorizedSigner.data ? "Authorized" : "Not authorized"}
            </button>
          </div>
          <p className="helper">The demo script needs a purchased account with an authorized agent signer.</p>
        </Panel>

        <Panel title="Run Demo Script" eyebrow="Agent 06">
          <button className="primary" disabled={mode !== "demo" || !accountId} onClick={runDemoScript}>Run demo script</button>
          <p className="helper">{demoStatus || "Calls the external Agent 06 service through the Next.js proxy. Demo changes only the price source, pass timing, and funded demo-fill path."}</p>
          <ol className="scriptList">
            {demoConfig.scriptedPass.entries.map((entry) => (
              <li key={`${entry.step}-${entry.sizeDelta}`}>
                Step {entry.step}: {entry.side} {entry.sizeDelta} {entry.market}
              </li>
            ))}
          </ol>
        </Panel>
      </section>
    </AppShell>
  );
}
