"use client";

import {useState} from "react";

import {examinationVaultAbi, fundedVaultAbi} from "../lib/abi";
import {marketById} from "../lib/config";
import {formatPrice, parseQuoteInput, shortHash, txUrl} from "../lib/format";
import {signedSizeDelta} from "../lib/trade";
import {usePropmon} from "./PropmonProvider";

export function TradeTicket() {
  const {core, prices, account, actions, events} = usePropmon();
  const {ready, isConnected, onWrongChain, accountId, selectedMarketId, examinationAddress, fundedAddress, mode} = core;
  const {stateLabel} = account;
  const {writeContractAsync, submit, writePending, receiptPending, lastHash, lastAction, actionError} = actions;

  const [side, setSide] = useState<0 | 1>(0);
  const [size, setSize] = useState("250000");
  const [collateral, setCollateral] = useState("250");

  const market = marketById(selectedMarketId);
  const isFunded = stateLabel === "FUNDED";
  const canExam = ready && Boolean(accountId) && isConnected && !onWrongChain && !writePending;

  return (
    <div className="ticket">
      <div className="ticketHead">
        <span className="ticketMarket">{market?.symbol ?? "--"}</span>
        <span className="ticketMark mono">{formatPrice(prices.activePrice?.price, prices.activePrice?.decimals)}</span>
      </div>

      <div className="sideToggle">
        <button className={side === 0 ? "sideBtn long active" : "sideBtn long"} onClick={() => setSide(0)}>Long</button>
        <button className={side === 1 ? "sideBtn short active" : "sideBtn short"} onClick={() => setSide(1)}>Short</button>
      </div>

      <label className="field">
        <span>Size delta</span>
        <input className="mono" value={size} onChange={(event) => setSize(event.target.value)} />
      </label>
      <label className="field">
        <span>Collateral (USD)</span>
        <input className="mono" value={collateral} onChange={(event) => setCollateral(event.target.value)} />
      </label>

      <button
        className="primary"
        disabled={!canExam}
        onClick={() =>
          submit("Record entry", () =>
            writeContractAsync({
              address: examinationAddress,
              abi: examinationVaultAbi,
              functionName: "recordEntry",
              args: [accountId ?? 0n, BigInt(selectedMarketId), side, signedSizeDelta(size, side), parseQuoteInput(collateral)]
            })
          )
        }
      >
        Record Examination Entry
      </button>
      <p className="ticketNote">On-chain paper trade against the adapter mark. Updates equity &amp; drawdown.</p>

      <div className="ticketDivider">
        <span>Funded execution</span>
        {isFunded ? <span className="pill pos">FUNDED</span> : <span className="pill muted">state must be FUNDED</span>}
      </div>
      <button
        className="secondary full"
        disabled={!ready || !accountId || !isFunded || writePending}
        onClick={() =>
          submit(mode === "live" ? "Open live intent" : events.demoFundedLabel, () =>
            writeContractAsync({
              address: fundedAddress,
              abi: fundedVaultAbi,
              functionName: mode === "live" ? "openPositionLive" : "openPositionDemo",
              args: [accountId ?? 0n, BigInt(selectedMarketId), side, signedSizeDelta(size, side), parseQuoteInput(collateral)]
            })
          )
        }
      >
        {mode === "live" ? "Open Live Perpl Intent" : "Open Demo Fill"}
      </button>
      <p className="ticketNote">
        {mode === "live"
          ? "Records an on-chain LivePositionIntent; Agent 06 reconciles the Perpl fill."
          : "Demo fill settles synchronously on-chain against the adapter price — clearly labeled, not live execution."}
      </p>

      {lastHash && (
        <p className="helper">
          {receiptPending ? `${lastAction} pending: ` : `${lastAction} confirmed: `}
          <a href={txUrl(lastHash)} target="_blank" rel="noreferrer">{shortHash(lastHash)}</a>
        </p>
      )}
      {actionError && <p className="errorText">{actionError}</p>}
    </div>
  );
}
