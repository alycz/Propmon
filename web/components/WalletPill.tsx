"use client";

import {addressUrl, shortHash} from "../lib/format";
import {usePropmon} from "./PropmonProvider";

export function WalletPill() {
  const {core} = usePropmon();
  const {wallet, address} = core;
  return (
    <div className="walletGroup">
      {address ? (
        <a className="walletPill" href={addressUrl(address)} target="_blank" rel="noreferrer">{shortHash(address)}</a>
      ) : null}
      <button
        className="secondary"
        onClick={() => (wallet.authenticated ? void wallet.logout() : wallet.login())}
        disabled={!wallet.ready}
      >
        {wallet.authenticated ? "Logout" : "Connect"}
      </button>
    </div>
  );
}
