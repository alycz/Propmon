import {PrivyClient, type AuthorizationContext} from "@privy-io/node";
import {createWalletClient, defineChain, http, toHex, type Address, type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";

import type {AgentConfig, AgentSignerMode} from "./types.js";

export type AgentSignerTransaction = {
  to: Address;
  data: Hex;
  value?: bigint;
};

export type AgentSigner = {
  readonly mode: AgentSignerMode;
  getAddress(): Promise<Address>;
  sendTransaction(transaction: AgentSignerTransaction): Promise<Hex>;
  signMessage(message: string): Promise<Hex>;
};

type PrivyEthereumWallets = {
  signMessage(walletId: string, input: {
    message: string;
    authorization_context?: AuthorizationContext;
  }): Promise<{signature: string}>;
  sendTransaction(walletId: string, input: ReturnType<typeof buildPrivyTransactionInput>): Promise<{hash: string}>;
};

type PrivyWallets = {
  get(walletId: string): Promise<{address: string}>;
  ethereum(): PrivyEthereumWallets;
};

type PrivyLike = {
  wallets(): PrivyWallets;
};

export function createAgentSigner(config: AgentConfig, privyClient?: PrivyLike): AgentSigner {
  if (config.agentSignerMode === "private-key") return new PrivateKeyAgentSigner(config);
  return new PrivyServerWalletAgentSigner(config, privyClient);
}

export function requireAgentPrivateKey(config: AgentConfig): Hex {
  if (!config.agentPrivateKey) {
    throw new Error("AGENT_PRIVATE_KEY must be set when AGENT_SIGNER_MODE=private-key");
  }
  return config.agentPrivateKey;
}

export function buildPrivyTransactionInput(config: AgentConfig, transaction: AgentSignerTransaction) {
  return {
    caip2: `eip155:${config.chainId}` as const,
    params: {
      transaction: {
        to: transaction.to,
        data: transaction.data,
        chain_id: config.chainId,
        ...(transaction.value !== undefined ? {value: toHex(transaction.value)} : {})
      }
    },
    authorization_context: authorizationContext(config)
  };
}

function authorizationContext(config: AgentConfig): AuthorizationContext {
  if (!config.privyAuthorizationPrivateKey) {
    throw new Error("PRIVY_AUTHORIZATION_PRIVATE_KEY must be set when AGENT_SIGNER_MODE=privy-server-wallet");
  }
  return {authorization_private_keys: [config.privyAuthorizationPrivateKey]};
}

class PrivateKeyAgentSigner implements AgentSigner {
  readonly mode = "private-key" as const;

  private readonly account;
  private readonly walletClient;

  constructor(private readonly config: AgentConfig) {
    const chain = defineChain({
      id: config.chainId,
      name: "Monad Testnet",
      nativeCurrency: {name: "MON", symbol: "MON", decimals: 18},
      rpcUrls: {default: {http: [config.rpcUrl]}}
    });
    this.account = privateKeyToAccount(requireAgentPrivateKey(config));
    this.walletClient = createWalletClient({account: this.account, chain, transport: http(config.rpcUrl)});
  }

  async getAddress(): Promise<Address> {
    return this.account.address;
  }

  async sendTransaction(transaction: AgentSignerTransaction): Promise<Hex> {
    return this.walletClient.sendTransaction({
      to: transaction.to,
      data: transaction.data,
      value: transaction.value
    });
  }

  async signMessage(message: string): Promise<Hex> {
    return this.account.signMessage({message});
  }
}

class PrivyServerWalletAgentSigner implements AgentSigner {
  readonly mode = "privy-server-wallet" as const;
  private cachedAddress?: Address;
  private readonly privy: PrivyLike;

  constructor(private readonly config: AgentConfig, privyClient?: PrivyLike) {
    if (!config.privyAppId) throw new Error("PRIVY_APP_ID must be set when AGENT_SIGNER_MODE=privy-server-wallet");
    if (!config.privyAppSecret) throw new Error("PRIVY_APP_SECRET must be set when AGENT_SIGNER_MODE=privy-server-wallet");
    if (!config.privyServerWalletId) {
      throw new Error("PRIVY_SERVER_WALLET_ID must be set when AGENT_SIGNER_MODE=privy-server-wallet");
    }
    this.privy = privyClient ?? new PrivyClient({appId: config.privyAppId, appSecret: config.privyAppSecret});
  }

  async getAddress(): Promise<Address> {
    if (this.cachedAddress) return this.cachedAddress;
    const wallet = await this.privy.wallets().get(this.config.privyServerWalletId!);
    this.cachedAddress = wallet.address as Address;
    return this.cachedAddress;
  }

  async sendTransaction(transaction: AgentSignerTransaction): Promise<Hex> {
    const response = await this.privy.wallets().ethereum().sendTransaction(
      this.config.privyServerWalletId!,
      buildPrivyTransactionInput(this.config, transaction)
    );
    return response.hash as Hex;
  }

  async signMessage(message: string): Promise<Hex> {
    const response = await this.privy.wallets().ethereum().signMessage(this.config.privyServerWalletId!, {
      message,
      authorization_context: authorizationContext(this.config)
    });
    return response.signature as Hex;
  }
}
