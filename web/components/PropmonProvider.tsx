"use client";

import {createContext, useContext, type ReactNode} from "react";

import {useAgentSigner} from "../hooks/useAgentSigner";
import {useDemoScript} from "../hooks/useDemoScript";
import {usePropmonAccount} from "../hooks/usePropmonAccount";
import {usePropmonActions} from "../hooks/usePropmonActions";
import {usePropmonCore} from "../hooks/usePropmonCore";
import {usePropmonEvents} from "../hooks/usePropmonEvents";
import {usePropmonPrices} from "../hooks/usePropmonPrices";

function usePropmonValue() {
  // Order matters: each hook may depend on values produced by an earlier one.
  const core = usePropmonCore();
  const prices = usePropmonPrices({
    ready: core.ready,
    priceAddress: core.priceAddress,
    selectedMarketId: core.selectedMarketId,
    mode: core.mode
  });
  const agent = useAgentSigner();
  const events = usePropmonEvents({
    ready: core.ready,
    examinationAddress: core.examinationAddress,
    fundedAddress: core.fundedAddress,
    accountId: core.accountId,
    blockNumber: core.blockNumber
  });
  const account = usePropmonAccount({
    ready: core.ready,
    registryAddress: core.registryAddress,
    examinationAddress: core.examinationAddress,
    fundedAddress: core.fundedAddress,
    accountId: core.accountId,
    agentSigner: agent.agentSigner,
    ledgerHashes: events.ledgerHashes,
    blockNumber: core.blockNumber
  });
  const actions = usePropmonActions({
    ready: core.ready,
    onExaminationPurchased: core.setAccountIdInput
  });
  const demo = useDemoScript({mode: core.mode, accountId: core.accountId});

  return {core, prices, agent, events, account, actions, demo};
}

export type PropmonValue = ReturnType<typeof usePropmonValue>;

const PropmonContext = createContext<PropmonValue | null>(null);

export function PropmonProvider({children}: {children: ReactNode}) {
  const value = usePropmonValue();
  return <PropmonContext.Provider value={value}>{children}</PropmonContext.Provider>;
}

export function usePropmon(): PropmonValue {
  const value = useContext(PropmonContext);
  if (!value) {
    throw new Error("usePropmon must be used within a PropmonProvider");
  }
  return value;
}
