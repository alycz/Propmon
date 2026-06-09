import {createPublicClient, createWalletClient, defineChain, http, type Address, type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";

import {accountRegistryAbi, examinationVaultAbi, fundedVaultAbi} from "./abi.js";
import type {AgentConfig, TradeDecision} from "./types.js";
import {AccountState, VaultSide} from "./types.js";

export function createClients(config: AgentConfig, privateKey: Hex) {
  const chain = defineChain({
    id: config.chainId,
    name: "Monad Testnet",
    nativeCurrency: {name: "MON", symbol: "MON", decimals: 18},
    rpcUrls: {default: {http: [config.rpcUrl]}}
  });
  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({chain, transport: http(config.rpcUrl)});
  const walletClient = createWalletClient({account, chain, transport: http(config.rpcUrl)});
  return {account, publicClient, walletClient};
}

export async function assertAuthorizedSigner(config: AgentConfig): Promise<Address> {
  const {account, publicClient} = createClients(config, config.agentPrivateKey);
  const authorized = await publicClient.readContract({
    address: config.deployments.accountRegistry,
    abi: accountRegistryAbi,
    functionName: "isAuthorizedSigner",
    args: [config.accountId, account.address]
  });
  if (!authorized) {
    throw new Error(`Agent signer ${account.address} is not authorized for account ${config.accountId}`);
  }
  return account.address;
}

export async function getAccountState(config: AgentConfig): Promise<AccountState> {
  const {publicClient} = createClients(config, config.agentPrivateKey);
  const state = await publicClient.readContract({
    address: config.deployments.accountRegistry,
    abi: accountRegistryAbi,
    functionName: "stateOf",
    args: [config.accountId]
  });
  return Number(state) as AccountState;
}

export async function submitExaminationEntry(config: AgentConfig, decision: TradeDecision): Promise<Hex> {
  const {walletClient} = createClients(config, config.agentPrivateKey);
  return walletClient.writeContract({
    address: config.deployments.examinationVault,
    abi: examinationVaultAbi,
    functionName: "recordEntry",
    args: [config.accountId, decision.marketId, decision.side, decision.sizeDelta, decision.collateral]
  });
}

export async function submitFundedDemo(config: AgentConfig, decision: TradeDecision): Promise<Hex> {
  const {walletClient} = createClients(config, config.agentPrivateKey);
  const isClose = decision.collateral === 0n;
  return walletClient.writeContract({
    address: config.deployments.fundedVault,
    abi: fundedVaultAbi,
    functionName: isClose ? "closePositionDemo" : "openPositionDemo",
    args: isClose
      ? [config.accountId, decision.marketId, decision.sizeDelta]
      : [config.accountId, decision.marketId, decision.side, decision.sizeDelta, decision.collateral]
  });
}

export async function submitFundedLiveIntent(config: AgentConfig, decision: TradeDecision): Promise<Hex> {
  const {walletClient} = createClients(config, config.agentPrivateKey);
  const isClose = decision.collateral === 0n;
  return walletClient.writeContract({
    address: config.deployments.fundedVault,
    abi: fundedVaultAbi,
    functionName: isClose ? "closePositionLive" : "openPositionLive",
    args: isClose
      ? [config.accountId, decision.marketId, decision.sizeDelta]
      : [config.accountId, decision.marketId, decision.side, decision.sizeDelta, decision.collateral]
  });
}

export async function reconcileFillOnChain(input: {
  config: AgentConfig;
  accountId: bigint;
  requestId: bigint;
  marketId: bigint;
  sizeDelta: bigint;
  fillPrice: bigint;
}): Promise<Hex> {
  if (!input.config.reconcilerPrivateKey) {
    throw new Error("RECONCILER_PRIVATE_KEY is required to reconcile live Perpl fills");
  }
  const {walletClient} = createClients(input.config, input.config.reconcilerPrivateKey);
  return walletClient.writeContract({
    address: input.config.deployments.fundedVault,
    abi: fundedVaultAbi,
    functionName: "reconcileFill",
    args: [input.accountId, input.requestId, input.marketId, input.sizeDelta, input.fillPrice]
  });
}

export function orderActionFromVaultIntent(input: {side: VaultSide | number; sizeDelta: bigint; isClose: boolean}): 1 | 2 | 3 | 4 {
  if (input.isClose) return input.sizeDelta < 0n ? 3 : 4;
  return input.side === VaultSide.LONG ? 1 : 2;
}
