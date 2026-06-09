"use client";

import {useState} from "react";
import {type Address} from "viem";

import {examinationVaultAbi, fundedVaultAbi} from "../../lib/abi";
import {marketById, markets} from "../../lib/config";
import {formatPrice, formatQuote, parseQuoteInput, shortHash, txUrl} from "../../lib/format";
import {sideOptions, signedSizeDelta} from "../../lib/trade";
import {AppShell} from "../../components/AppShell";
import {usePropmon} from "../../components/PropmonProvider";
import {Metric, Panel} from "../../components/ui";

export default function TerminalPage() {
  const {core, prices, events, account, actions} = usePropmon();
  const {ready, isConnected, onWrongChain, accountId, examinationAddress, fundedAddress, selectedMarketId, setSelectedMarketId, mode} = core;
  const {prices: priceCells, activePrice} = prices;
  const {stateLabel, funded, entries} = account;
  const {writeContractAsync, submit, writePending} = actions;
  const {demoFundedLabel} = events;

  const [tradeSide, setTradeSide] = useState<0 | 1>(0);
  const [sizeDelta, setSizeDelta] = useState("250000");
  const [collateral, setCollateral] = useState("250");
  const [fundedSizeDelta, setFundedSizeDelta] = useState("250000");
  const [fundedCollateral, setFundedCollateral] = useState("250");

  return (
    <AppShell>
      <section className="marketStrip">
        {priceCells.map(({market, price, decimals, updatedAt}) => (
          <button
            key={market.id}
            className={market.id === selectedMarketId ? "marketPill active" : "marketPill"}
            onClick={() => setSelectedMarketId(market.id)}
          >
            <span>{market.symbol}</span>
            <strong className="mono">{formatPrice(price, decimals)}</strong>
            <small>{updatedAt ? `pushed ${new Date(Number(updatedAt) * 1000).toLocaleTimeString()}` : "no on-chain price"}</small>
          </button>
        ))}
      </section>

      <section className="grid two">
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
                  args: [accountId ?? 0n, BigInt(selectedMarketId), tradeSide, signedSizeDelta(sizeDelta, tradeSide), parseQuoteInput(collateral)]
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
                  <span className="mono">{entry.sizeDelta.toString()} units at {entry.markPrice.toString()}</span>
                </div>
                <div>
                  <span className="mono">{formatQuote(entry.equityAfter)}</span>
                  {entry.hash ? <a href={txUrl(entry.hash)} target="_blank" rel="noreferrer">{shortHash(entry.hash)}</a> : <small>tx indexing...</small>}
                </div>
              </div>
            ))}
          </div>
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
                  writeContractAsync({address: fundedAddress, abi: fundedVaultAbi, functionName: "activate", args: [accountId ?? 0n]})
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
                    args: [accountId ?? 0n, BigInt(selectedMarketId), tradeSide, signedSizeDelta(fundedSizeDelta, tradeSide), parseQuoteInput(fundedCollateral)]
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

        <Panel title="Funded Events" eyebrow="Payouts &amp; fills">
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
          <button
            className="primary"
            disabled={!ready || !accountId || !core.address || stateLabel !== "FUNDED" || writePending}
            onClick={() =>
              submit("Payout", () =>
                writeContractAsync({address: fundedAddress, abi: fundedVaultAbi, functionName: "payout", args: [accountId ?? 0n, core.address as Address]})
              )
            }
          >
            Close in Profit {"->"} Payout
          </button>
        </Panel>
      </section>
    </AppShell>
  );
}
