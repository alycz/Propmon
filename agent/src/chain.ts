import {createPublicClient, createWalletClient, defineChain, encodeFunctionData, http, type Address, type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";

import {accountRegistryAbi, examinationVaultAbi, fundedVaultAbi} from "./abi.js";
import {createAgentSigner, requireAgentPrivateKey, type AgentSigner} from "./signer.js";
import type {AgentConfig, TradeDecision} from "./types.js";
import {AccountState, VaultSide} from "./types.js";

export function createChain(config: AgentConfig) {
  return defineChain({
    id: config.chainId,
    name: "Monad Testnet",
    nativeCurrency: {name: "MON", symbol: "MON", decimals: 18},
    rpcUrls: {default: {http: [config.rpcUrl]}}
  });
}

export function createPublicClientForConfig(config: AgentConfig) {
  return createPublicClient({chain: createChain(config), transport: http(config.rpcUrl)});
}

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
  const signer = createAgentSigner(config);
  const signerAddress = await signer.getAddress();
  const publicClient = createPublicClientForConfig(config);
  const authorized = await publicClient.readContract({
    address: config.deployments.accountRegistry,
    abi: accountRegistryAbi,
    functionName: "isAuthorizedSigner",
    args: [config.accountId, signerAddress]
  });
  if (!authorized) {
    throw new Error(`Agent signer ${signerAddress} is not authorized for account ${config.accountId}`);
  }
  return signerAddress;
}

export async function getAccountState(config: AgentConfig): Promise<AccountState> {
  const publicClient = createPublicClientForConfig(config);
  const state = await publicClient.readContract({
    address: config.deployments.accountRegistry,
    abi: accountRegistryAbi,
    functionName: "stateOf",
    args: [config.accountId]
  });
  return Number(state) as AccountState;
}

export async function submitExaminationEntry(config: AgentConfig, decision: TradeDecision): Promise<Hex> {
  return submitExaminationEntryWithSigner(createAgentSigner(config), config, decision);
}

export async function submitExaminationEntryWithSigner(
  signer: AgentSigner,
  config: AgentConfig,
  decision: TradeDecision
): Promise<Hex> {
  return signer.sendTransaction({
    to: config.deployments.examinationVault,
    data: encodeFunctionData({
      abi: examinationVaultAbi,
      functionName: "recordEntry",
      args: [config.accountId, decision.marketId, decision.side, decision.sizeDelta, decision.collateral]
    })
  });
}

export async function submitFundedDemo(config: AgentConfig, decision: TradeDecision): Promise<Hex> {
  return submitFundedDemoWithSigner(createAgentSigner(config), config, decision);
}

export async function submitFundedDemoWithSigner(
  signer: AgentSigner,
  config: AgentConfig,
  decision: TradeDecision
): Promise<Hex> {
  const isClose = decision.collateral === 0n;
  return signer.sendTransaction({
    to: config.deployments.fundedVault,
    data: encodeFunctionData({
      abi: fundedVaultAbi,
      functionName: isClose ? "closePositionDemo" : "openPositionDemo",
      args: isClose
        ? [config.accountId, decision.marketId, decision.sizeDelta]
        : [config.accountId, decision.marketId, decision.side, decision.sizeDelta, decision.collateral]
    })
  });
}

export async function submitFundedLiveIntent(config: AgentConfig, decision: TradeDecision): Promise<Hex> {
  return submitFundedLiveIntentWithSigner(createAgentSigner(config), config, decision);
}

export async function submitFundedLiveIntentWithSigner(
  signer: AgentSigner,
  config: AgentConfig,
  decision: TradeDecision
): Promise<Hex> {
  const isClose = decision.collateral === 0n;
  return signer.sendTransaction({
    to: config.deployments.fundedVault,
    data: encodeFunctionData({
      abi: fundedVaultAbi,
      functionName: isClose ? "closePositionLive" : "openPositionLive",
      args: isClose
        ? [config.accountId, decision.marketId, decision.sizeDelta]
        : [config.accountId, decision.marketId, decision.side, decision.sizeDelta, decision.collateral]
    })
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

export function createFallbackPrivateKeyClients(config: AgentConfig) {
  return createClients(config, requireAgentPrivateKey(config));
}

export function orderActionFromVaultIntent(input: {side: VaultSide | number; sizeDelta: bigint; isClose: boolean}): 1 | 2 | 3 | 4 {
  if (input.isClose) return input.sizeDelta < 0n ? 3 : 4;
  return input.side === VaultSide.LONG ? 1 : 2;
}
