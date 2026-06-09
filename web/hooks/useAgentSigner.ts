"use client";

import {useEffect, useState} from "react";
import {isAddress} from "viem";

import {errorMessage, shortHash} from "../lib/format";

export type AgentSigner = ReturnType<typeof useAgentSigner>;

export function useAgentSigner() {
  const [agentSigner, setAgentSigner] = useState("");
  const [agentSignerStatus, setAgentSignerStatus] = useState("Loading agent signer...");

  useEffect(() => {
    let cancelled = false;
    async function loadAgentSigner() {
      setAgentSignerStatus("Loading agent signer...");
      try {
        const response = await fetch("/api/agent-signer", {cache: "no-store"});
        const body = (await response.json().catch(() => ({}))) as {address?: string; mode?: string; error?: string};
        if (cancelled) return;
        if (!response.ok || !body.address || !isAddress(body.address)) {
          setAgentSigner("");
          setAgentSignerStatus(body.error ?? "Agent signer service unavailable.");
          return;
        }
        setAgentSigner(body.address);
        setAgentSignerStatus(`${body.mode ?? "agent"} ${shortHash(body.address)}`);
      } catch (error) {
        if (!cancelled) {
          setAgentSigner("");
          setAgentSignerStatus(errorMessage(error));
        }
      }
    }
    void loadAgentSigner();
    return () => {
      cancelled = true;
    };
  }, []);

  return {agentSigner, agentSignerStatus};
}
