"use client";

import {MONAD_TESTNET_CHAIN_ID} from "../lib/config";
import {addressUrl, shortHash} from "../lib/format";
import {Metric, Panel} from "./ui";
import {usePropmon} from "./PropmonProvider";

export function WalletProfileCard() {
  const {core} = usePropmon();
  const {address, chainId, onWrongChain, isConnected} = core;

  return (
    <Panel title="Wallet" eyebrow="Identity">
      <div className="metricRow">
        <Metric label="Address" value={address ? shortHash(address) : "Not connected"} />
        <Metric label="Connected" value={isConnected ? "Yes" : "No"} accent={isConnected ? "pos" : undefined} />
      </div>
      <div className="metricRow">
        <Metric label="Chain" value={chainId ? String(chainId) : "--"} accent={onWrongChain ? "neg" : chainId ? "pos" : undefined} />
        <Metric label="Expected" value={`${MONAD_TESTNET_CHAIN_ID} (Monad)`} />
      </div>
      {address && (
        <p className="helper">
          Explorer: <a href={addressUrl(address)} target="_blank" rel="noreferrer">{shortHash(address)}</a>
        </p>
      )}
      {onWrongChain && <p className="errorText">Wrong network — switch to Monad Testnet to transact.</p>}
    </Panel>
  );
}
