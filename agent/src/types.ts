import type {Address, Hex} from "viem";

export type PropmonMode = "live" | "demo";

export type DeploymentAddresses = {
  accountRegistry: Address;
  examinationVault: Address;
  fundedVault: Address;
  perplPriceAdapter: Address;
};

export type MarketConfig = {
  symbol: string;
  id: number;
  priceDecimals: number;
  sizeDecimals: number;
  initialMargin: number;
};

export type DemoScriptEntry = {
  market: string;
  side: "LONG" | "SHORT";
  sizeDelta: string;
  collateral: string;
  step: number;
};

export type DemoConfig = {
  mode?: PropmonMode;
  seed: string;
  scriptedPass: {
    accountSize: string;
    profitTargetBps: number;
    entries: DemoScriptEntry[];
  };
  fundedDemo?: {
    label: string;
    profitSplitBps: {trader: number; protocol: number};
    settlementSource: string;
  };
};

export type AgentConfig = {
  mode: PropmonMode;
  rpcUrl: string;
  chainId: number;
  perplApiUrl: string;
  perplWsUrl: string;
  tradingWsPath: string;
  deployments: DeploymentAddresses;
  markets: MarketConfig[];
  demoConfig: DemoConfig;
  agentPrivateKey: Hex;
  reconcilerPrivateKey?: Hex;
  accountId: bigint;
  marketSymbol: string;
  marketId: bigint;
  pollIntervalMs: number;
  statePath: string;
  perplLfrSeed: bigint;
  perplLeverageHundredths: number;
  perplRefCode: bigint;
};

export enum AccountState {
  NONE = 0,
  EXAMINATION = 1,
  PASSED = 2,
  FUNDED = 3,
  FAILED = 4,
  PAYOUT = 5
}

export enum VaultSide {
  LONG = 0,
  SHORT = 1
}

export type TradeDecision = {
  marketId: bigint;
  side: VaultSide;
  sizeDelta: bigint;
  collateral: bigint;
  source: "scripted-demo" | "deterministic-strategy";
};

export type FundedExecutionRoute = "live-perpl-ws" | "demo-onchain-fill";

export type VaultPath = "examination-entry" | "funded-live" | "funded-demo" | "idle";
