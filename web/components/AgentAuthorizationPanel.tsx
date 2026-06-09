"use client";

import {isAddress, type Address} from "viem";

import {accountRegistryAbi} from "../lib/abi";
import {addressUrl, shortHash} from "../lib/format";
import {Panel} from "./ui";
import {usePropmon} from "./PropmonProvider";

export function AgentAuthorizationPanel() {
  const {core, agent, account, actions} = usePropmon();
  const {ready, accountId, registryAddress} = core;
  const {agentSigner, agentSignerStatus} = agent;
  const {authorizedSigner} = account;
  const {writeContractAsync, submit, writePending} = actions;

  const authorized = Boolean(authorizedSigner.data);

  return (
    <Panel title="Agent Authorization" eyebrow="Authorized signer">
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
          className="primary"
          disabled={!ready || !accountId || !isAddress(agentSigner) || authorized || writePending}
          onClick={() =>
            submit("Authorize signer", () =>
              writeContractAsync({address: registryAddress, abi: accountRegistryAbi, functionName: "authorizeSigner", args: [accountId ?? 0n, agentSigner as Address]})
            )
          }
        >
          {authorized ? "Authorized" : "Authorize Agent"}
        </button>
        <div className="metric">
          <span>Status</span>
          <strong className={authorized ? "accent-pos" : "accent-warn"}>{authorized ? "Authorized" : "Not authorized"}</strong>
        </div>
      </div>
      <p className="helper">
        The demo script needs a purchased account with an authorized agent signer. The agent and your wallet call the same on-chain vault functions.
      </p>
    </Panel>
  );
}
