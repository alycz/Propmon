"use client";

import {isAddress, type Address} from "viem";

import {accountRegistryAbi} from "../lib/abi";
import {Panel} from "./ui";
import {usePropmon} from "./PropmonProvider";

export function AgentAuthorizationPanel() {
  const {core, agent, actions} = usePropmon();
  const {ready, accountId, registryAddress} = core;
  const {agentSigner} = agent;
  const {writeContractAsync, submit, writePending} = actions;

  // Demo: the agent is authorized to trade by default.
  const authorized = true;

  return (
    <Panel title="Agent Authorization" eyebrow="Authorized signer">
      <div className="agentSignerBox">
        <span>Agent</span>
        <strong className="accent-pos">OpenAI API is connected</strong>
        <small className="accent-pos">Authorized to trade</small>
      </div>
      <div className="buttonRow">
        <button
          className="primary"
          disabled={authorized || writePending || !ready || !accountId || !isAddress(agentSigner)}
          onClick={() =>
            submit("Authorize signer", () =>
              writeContractAsync({address: registryAddress, abi: accountRegistryAbi, functionName: "authorizeSigner", args: [accountId ?? 0n, agentSigner as Address]})
            )
          }
        >
          Authorized
        </button>
        <div className="metric">
          <span>Status</span>
          <strong className="accent-pos">Authorized</strong>
        </div>
      </div>
      <p className="helper">
        The OpenAI API agent is connected and authorized to trade. The agent and your wallet call the same on-chain vault functions.
      </p>
    </Panel>
  );
}
