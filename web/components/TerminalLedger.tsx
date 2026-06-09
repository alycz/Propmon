"use client";

import {marketById} from "../lib/config";
import {formatQuote, shortHash, txUrl} from "../lib/format";
import {usePropmon} from "./PropmonProvider";

export function TerminalLedger() {
  const {account} = usePropmon();
  const {entries} = account;

  return (
    <div className="panel densePanel">
      <div className="densePanelHead">
        <h2>Transactions</h2>
      </div>
      <div className="ledgerTable">
        <div className="ledgerHead">
          <span>Market</span>
          <span>Size</span>
          <span>Mark</span>
          <span>Equity</span>
          <span>Tx</span>
        </div>
        {entries.length === 0 && <p className="helper">No examination entries recorded yet.</p>}
        {entries.slice().reverse().map((entry) => {
          const negative = entry.sizeDelta < 0n;
          return (
            <div className="ledgerLine" key={entry.key}>
              <span>{marketById(entry.marketId)?.symbol ?? `#${entry.marketId}`}</span>
              <span className={`mono ${negative ? "accent-neg" : "accent-pos"}`}>{entry.sizeDelta.toString()}</span>
              <span className="mono">{entry.markPrice.toString()}</span>
              <span className="mono">{formatQuote(entry.equityAfter)}</span>
              <span>{entry.hash ? <a href={txUrl(entry.hash)} target="_blank" rel="noreferrer">{shortHash(entry.hash)}</a> : <small>indexing…</small>}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
