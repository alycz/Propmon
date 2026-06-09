"use client";

import {marketById} from "../lib/config";
import {formatQuote, shortHash, txUrl} from "../lib/format";
import {Panel} from "./ui";
import {usePropmon} from "./PropmonProvider";

export function ExaminationLedger() {
  const {account} = usePropmon();
  const {entries} = account;

  return (
    <Panel title="Examination Ledger" eyebrow="Verifiable on-chain entries" className="anchorPanel">
      <div className="ledgerTable">
        <div className="ledgerHead examLedgerCols">
          <span>Market</span>
          <span>Side</span>
          <span>Size</span>
          <span>Mark</span>
          <span>Equity after</span>
          <span>Tx</span>
        </div>
        {entries.length === 0 && <p className="helper">No examination entries recorded yet.</p>}
        {entries.slice().reverse().map((entry) => {
          const short = entry.sizeDelta < 0n;
          return (
            <div className="ledgerLine examLedgerCols" key={entry.key}>
              <span>{marketById(entry.marketId)?.symbol ?? `#${entry.marketId}`}</span>
              <span className={short ? "accent-neg" : "accent-pos"}>{short ? "SHORT" : "LONG"}</span>
              <span className="mono">{entry.sizeDelta.toString()}</span>
              <span className="mono">{entry.markPrice.toString()}</span>
              <span className="mono">{formatQuote(entry.equityAfter)}</span>
              <span>{entry.hash ? <a href={txUrl(entry.hash)} target="_blank" rel="noreferrer">{shortHash(entry.hash)}</a> : <small>indexing…</small>}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
