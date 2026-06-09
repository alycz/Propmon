"use client";

import {addressUrl, shortHash} from "../lib/format";
import {Panel} from "./ui";
import {usePropmon} from "./PropmonProvider";

export function PermissionsCard() {
  const {core} = usePropmon();
  const {addresses} = core;

  return (
    <Panel title="Permissions" eyebrow="Signers &amp; contracts">
      <div className="agentSignerBox">
        <span>Agent signer</span>
        <strong className="accent-pos">OpenAI API is connected</strong>
        <small className="accent-pos">Authorized for this account</small>
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
      {address ? <a className="mono" href={addressUrl(address)} target="_blank" rel="noreferrer">{shortHash(address)}</a> : <small className="accent-pos">Connected</small>}
    </div>
  );
}
