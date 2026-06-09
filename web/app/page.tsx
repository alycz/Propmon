"use client";

import {useState} from "react";
import {isAddress, type Address, type Hex} from "viem";

import {accountRegistryAbi, examinationVaultAbi, fundedVaultAbi} from "../lib/abi";
import {demoConfig, marketById, markets, tierOptions} from "../lib/config";
import {
  addressUrl,
  errorMessage,
  formatBps,
  formatNative,
  formatPrice,
  formatQuote,
  formatSignedQuote,
  parseQuoteInput,
  shortHash,
  txUrl
} from "../lib/format";
import {usePropmon} from "../components/PropmonProvider";

const sideOptions = [
  {label: "Long", value: 0},
  {label: "Short", value: 1}
] as const;

function Dashboard() {
  const {core, prices, agent, events, account, actions, demo} = usePropmon();
  const {
    wallet,
    address,
    isConnected,
    onWrongChain,
    switchingChain,
    setSwitchingChain,
    ensureMonadTestnet,
    mode,
    setMode,
    ready,
    examinationAddress,
    registryAddress,
    fundedAddress,
    accountId,
    accountIdInput,
    setAccountIdInput,
    selectedMarketId,
    setSelectedMarketId
  } = core;
  const {writeContractAsync, submit, writePending, receiptPending, lastHash, lastAction, actionError} = actions;
  const {agentSigner, agentSignerStatus} = agent;
  const {demoFundedLabel} = events;
  const {exam, funded, stateLabel, drawdown, passedFailed, entries, authorizedSigner} = account;
  const {runDemoScript, demoStatus} = demo;
  const {prices: priceCells, activePrice} = prices;

  const [selectedTier, setSelectedTier] = useState(0);
  const [tradeSide, setTradeSide] = useState<0 | 1>(0);
  const [sizeDelta, setSizeDelta] = useState("250000");
  const [collateral, setCollateral] = useState("250");
  const [fundedSizeDelta, setFundedSizeDelta] = useState("250000");
  const [fundedCollateral, setFundedCollateral] = useState("250");

  const selectedTierData = tierOptions[selectedTier] ?? tierOptions[0];
  const expectedFee = (selectedTierData.accountSize * 100n) / 10_000n;

  return (
    <main className="appShell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Monad Testnet</p>
          <h1>Propmon</h1>
        </div>
        <div className="topActions">
          <div className="modeToggle" aria-label="Mode toggle">
            <button className={mode === "demo" ? "active" : ""} onClick={() => setMode("demo")}>DEMO</button>
            <button className={mode === "live" ? "active" : ""} onClick={() => setMode("live")}>LIVE</button>
          </div>
          {address ? (
            <a className="walletPill" href={addressUrl(address)} target="_blank" rel="noreferrer">{shortHash(address)}</a>
          ) : null}
          <button className="secondary" onClick={() => (wallet.authenticated ? void wallet.logout() : wallet.login())} disabled={!wallet.ready}>
            {wallet.authenticated ? "Logout" : "Connect"}
          </button>
        </div>
      </header>

      {mode === "demo" && (
        <section className="banner">DEMO MODE - simulated prices & demo fills. Examination ledger is still real on-chain.</section>
      )}

      {onWrongChain && (
        <section className="notice">
          Connected to the wrong network. Switch to Monad Testnet before submitting transactions.
          <button
            onClick={() => {
              setSwitchingChain(true);
              ensureMonadTestnet().catch((error) => actions.setActionError(errorMessage(error))).finally(() => setSwitchingChain(false));
            }}
            disabled={switchingChain}
          >
            {switchingChain ? "Switching..." : "Switch network"}
          </button>
        </section>
      )}

      {!ready && <DeploymentNotice />}

      <section className="marketStrip">
        {priceCells.map(({market, price, decimals, updatedAt}) => (
          <button
            key={market.id}
            className={market.id === selectedMarketId ? "marketPill active" : "marketPill"}
            onClick={() => setSelectedMarketId(market.id)}
          >
            <span>{market.symbol}</span>
            <strong>{formatPrice(price, decimals)}</strong>
            <small>{updatedAt ? `pushed ${new Date(Number(updatedAt) * 1000).toLocaleTimeString()}` : "no on-chain price"}</small>
          </button>
        ))}
      </section>

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
                <strong>{formatNative((tier.accountSize * 100n) / 10_000n)}</strong>
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
        </Panel>

        <Panel title="Account Status" eyebrow="State">
          <div className="metricRow">
            <Metric label="Registry state" value={stateLabel} />
            <Metric label="Rule result" value={passedFailed?.[1] ? "FAILED" : passedFailed?.[0] ? "PASSED" : "ACTIVE"} />
          </div>
          <div className="metricRow">
            <Metric label="Balance" value={formatQuote(exam?.startingBalance, true)} />
            <Metric label="Equity" value={formatQuote(exam?.equity, true)} />
          </div>
          {lastHash && (
            <p className="helper">
              {receiptPending ? `${lastAction} pending: ` : `${lastAction} confirmed: `}
              <a href={txUrl(lastHash)} target="_blank" rel="noreferrer">{shortHash(lastHash)}</a>
            </p>
          )}
          {actionError && <p className="errorText">{actionError}</p>}
        </Panel>
      </section>

      <section className="grid dashboardGrid">
        <Panel title="Live Drawdown Meter" eyebrow="Risk">
          <DrawdownMeter label="Daily" value={drawdown?.[0]} limit={500} />
          <DrawdownMeter label="Total" value={drawdown?.[1]} limit={1000} />
          <div className="ruleGrid">
            <Metric label="Open positions" value={exam?.openPositions?.toString() ?? "--"} />
            <Metric label="Collateral" value={formatQuote(exam?.committedCollateral)} />
            <Metric label="Realized P&L" value={formatSignedQuote(exam?.realizedPnl)} />
            <Metric label="Target" value={`${demoConfig.scriptedPass.profitTargetBps / 100}%`} />
          </div>
        </Panel>

        <Panel title="Trade Controls" eyebrow="On-chain paper ledger">
          <div className="tradeGrid">
            <label className="field">
              <span>Market</span>
              <select value={selectedMarketId} onChange={(event) => setSelectedMarketId(Number(event.target.value))}>
                {markets.map((market) => <option key={market.id} value={market.id}>{market.symbol}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Side</span>
              <select value={tradeSide} onChange={(event) => setTradeSide(Number(event.target.value) as 0 | 1)}>
                {sideOptions.map((side) => <option key={side.value} value={side.value}>{side.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Size delta</span>
              <input value={sizeDelta} onChange={(event) => setSizeDelta(event.target.value)} />
            </label>
            <label className="field">
              <span>Collateral (USD)</span>
              <input value={collateral} onChange={(event) => setCollateral(event.target.value)} />
            </label>
          </div>
          <button
            className="primary"
            disabled={!ready || !accountId || !isConnected || onWrongChain || writePending}
            onClick={() =>
              submit("Record entry", () =>
                writeContractAsync({
                  address: examinationAddress,
                  abi: examinationVaultAbi,
                  functionName: "recordEntry",
                  args: [
                    accountId ?? 0n,
                    BigInt(selectedMarketId),
                    tradeSide,
                    signedSizeDelta(sizeDelta, tradeSide),
                    parseQuoteInput(collateral)
                  ]
                })
              )
            }
          >
            Record Entry
          </button>
          <p className="helper">Selected mark: {formatPrice(activePrice?.price, activePrice?.decimals)} from the on-chain adapter.</p>
        </Panel>

        <Panel title="On-chain Ledger" eyebrow="Verify">
          <div className="ledger">
            {entries.length === 0 && <p className="helper">No examination entries recorded yet.</p>}
            {entries.slice().reverse().map((entry) => (
              <div className="ledgerRow" key={entry.key}>
                <div>
                  <strong>{marketById(entry.marketId)?.symbol ?? `Market ${entry.marketId}`}</strong>
                  <span>{entry.sizeDelta.toString()} units at {entry.markPrice.toString()}</span>
                </div>
                <div>
                  <span>{formatQuote(entry.equityAfter)}</span>
                  {entry.hash ? <a href={txUrl(entry.hash)} target="_blank" rel="noreferrer">{shortHash(entry.hash)}</a> : <small>tx indexing...</small>}
                </div>
              </div>
            ))}
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
                  writeContractAsync({
                    address: registryAddress,
                    abi: accountRegistryAbi,
                    functionName: "authorizeSigner",
                    args: [accountId ?? 0n, agentSigner as Address]
                  })
                )
              }
            >
              Authorize
            </button>
            <button className="secondary" disabled={!isAddress(agentSigner)}>
              {authorizedSigner.data ? "Authorized" : "Not authorized"}
            </button>
          </div>
          <p className="helper">Manual wallet and agent signer submit the same vault functions.</p>
        </Panel>

        <Panel title="Run Demo Script" eyebrow="Agent 06">
          <button className="primary" disabled={mode !== "demo" || !accountId} onClick={runDemoScript}>Run demo script</button>
          <p className="helper">{demoStatus || "Calls the external Agent 06 service through the Next.js proxy."}</p>
          <ol className="scriptList">
            {demoConfig.scriptedPass.entries.map((entry) => (
              <li key={`${entry.step}-${entry.sizeDelta}`}>
                Step {entry.step}: {entry.side} {entry.sizeDelta} {entry.market}
              </li>
            ))}
          </ol>
        </Panel>
      </section>

      <section className="grid two">
        <Panel title="Funded Lifecycle" eyebrow={mode === "demo" ? demoFundedLabel : "Live intent + fallback"}>
          <div className="metricRow">
            <Metric label="Funded equity" value={formatQuote(funded?.equity, true)} />
            <Metric label="Pending orders" value={funded?.pendingOrders?.toString() ?? "--"} />
          </div>
          <div className="buttonRow">
            <button
              className="secondary"
              disabled={!ready || !accountId || stateLabel !== "PASSED" || writePending}
              onClick={() =>
                submit("Activate funded account", () =>
                  writeContractAsync({
                    address: fundedAddress,
                    abi: fundedVaultAbi,
                    functionName: "activate",
                    args: [accountId ?? 0n]
                  })
                )
              }
            >
              Activate Funded
            </button>
            <button
              className="secondary"
              disabled={!ready || !accountId || stateLabel !== "FUNDED" || writePending}
              onClick={() =>
                submit(mode === "live" ? "Open live intent" : demoFundedLabel, () =>
                  writeContractAsync({
                    address: fundedAddress,
                    abi: fundedVaultAbi,
                    functionName: mode === "live" ? "openPositionLive" : "openPositionDemo",
                    args: [
                      accountId ?? 0n,
                      BigInt(selectedMarketId),
                      tradeSide,
                      signedSizeDelta(fundedSizeDelta, tradeSide),
                      parseQuoteInput(fundedCollateral)
                    ]
                  })
                )
              }
            >
              {mode === "live" ? "Open Live Intent" : "Open Demo Fill"}
            </button>
          </div>
          <div className="tradeGrid compact">
            <label className="field">
              <span>Funded size</span>
              <input value={fundedSizeDelta} onChange={(event) => setFundedSizeDelta(event.target.value)} />
            </label>
            <label className="field">
              <span>Funded collateral</span>
              <input value={fundedCollateral} onChange={(event) => setFundedCollateral(event.target.value)} />
            </label>
          </div>
          <p className="helper">
            {mode === "live"
              ? "Live mode records an on-chain intent and waits for Agent 06 Perpl reconciliation. Use the demo fill fallback if whitelist access is unavailable."
              : "Demo fills settle synchronously on-chain against the adapter price."}
          </p>
        </Panel>

        <Panel title="Payout" eyebrow="Profit split">
          <div className="metricRow">
            <Metric label="Trader split" value={`${demoConfig.fundedDemo?.profitSplitBps.trader ?? 8000} bps`} />
            <Metric label="Firm split" value={`${demoConfig.fundedDemo?.profitSplitBps.protocol ?? 2000} bps`} />
          </div>
          <button
            className="primary"
            disabled={!ready || !accountId || !address || stateLabel !== "FUNDED" || writePending}
            onClick={() =>
              submit("Payout", () =>
                writeContractAsync({
                  address: fundedAddress,
                  abi: fundedVaultAbi,
                  functionName: "payout",
                  args: [accountId ?? 0n, address as Address]
                })
              )
            }
          >
            Close in Profit {"->"} Payout
          </button>
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

      <footer className="footer">
        <span>Explorer: <a href={addressUrl(examinationAddress)} target="_blank" rel="noreferrer">ExaminationVault</a></span>
        <span>Mode: {mode}</span>
      </footer>
    </main>
  );
}

function DeploymentNotice() {
  return (
    <section className="notice">
      Contract addresses are not configured yet. Fill `shared/deployments.json` or set the `NEXT_PUBLIC_*_ADDRESS`
      env vars; the dashboard will stay read-only until then.
    </section>
  );
}

function Panel({title, eyebrow, children}: {title: string; eyebrow: string; children: React.ReactNode}) {
  return (
    <section className="panel">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Metric({label, value}: {label: string; value: string}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DrawdownMeter({label, value, limit}: {label: string; value: bigint | undefined; limit: number}) {
  const numeric = Number(value ?? 0n);
  const pct = Math.min(100, Math.round((numeric / limit) * 100));
  const state = pct >= 100 ? "breach" : pct >= 70 ? "warning" : "safe";
  return (
    <div className={`meter ${state}`}>
      <div className="meterLabel">
        <strong>{label}</strong>
        <span>{formatBps(value)} / {formatBps(limit)}</span>
      </div>
      <div className="meterTrack"><div style={{width: `${pct}%`}} /></div>
    </div>
  );
}

function signedSizeDelta(value: string, side: 0 | 1): bigint {
  const clean = BigInt(value.trim() || "0");
  const abs = clean < 0n ? -clean : clean;
  return side === 0 ? abs : -abs;
}

export default function Page() {
  return <Dashboard />;
}
