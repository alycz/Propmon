"use client";

import {isAddress} from "viem";

import {addressUrl, shortHash} from "../lib/format";
import {Panel} from "./ui";
import {usePropmon} from "./PropmonProvider";

export function PermissionsCard() {
  const {core, agent, account} = usePropmon();
  const {addresses} = core;
  const {agentSigner} = agent;
  const authorized = Boolean(account.authorizedSigner.data);

  return (
    <Panel title="Permissions" eyebrow="Signers &amp; contracts">
      <div className="agentSignerBox">
        <span>Agent signer</span>
        {isAddress(agentSigner) ? (
          <a href={addressUrl(agentSigner)} target="_blank" rel="noreferrer">{shortHash(agentSigner)}</a>
        ) : (
          <strong>Unavailable</strong>
        )}
        <small className={authorized ? "accent-pos" : "accent-warn"}>{authorized ? "Authorized for this account" : "Not authorized"}</small>
      </div>
      <div className="linkList">
        <ContractLink label="AccountRegistry" address={addresses.accountRegistry} />
        <ContractLink label="ExaminationVault" address={addresses.examinationVault} />
        <ContractLink label="FundedVault" address={addresses.fundedVault} />
        <ContractLink label="PerplPriceAdapter" address={addresses.perplPriceAdapter} />
      </div>
    </Panel>
  );
}

function ContractLink({label, address}: {label: string; address?: string}) {
  return (
    <div className="linkRow">
      <span>{label}</span>
      {address ? <a className="mono" href={addressUrl(address)} target="_blank" rel="noreferrer">{shortHash(address)}</a> : <small>not configured</small>}
    </div>
  );
}
