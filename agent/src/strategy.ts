import {AccountState, type DemoConfig, type FundedExecutionRoute, type MarketConfig, type PropmonMode, type TradeDecision, VaultSide, type VaultPath} from "./types.js";

export function fundedExecutionRoute(mode: string | undefined, whitelisted: boolean): FundedExecutionRoute {
  if (mode === "live" && whitelisted) return "live-perpl-ws";
  return "demo-onchain-fill";
}

export function selectVaultPath(input: {
  state: AccountState | number;
  mode: PropmonMode;
  whitelisted: boolean;
}): VaultPath {
  if (input.state === AccountState.EXAMINATION) return "examination-entry";
  if (input.state === AccountState.FUNDED) {
    return fundedExecutionRoute(input.mode, input.whitelisted) === "live-perpl-ws" ? "funded-live" : "funded-demo";
  }
  return "idle";
}

export function decideNextTrade(input: {
  mode: PropmonMode;
  demoConfig: DemoConfig;
  markets: MarketConfig[];
  executedDemoSteps: number;
  currentPrice?: bigint;
  previousPrice?: bigint;
  defaultMarketSymbol: string;
}): TradeDecision | undefined {
  if (input.mode === "demo") {
    const nextScripted = input.demoConfig.scriptedPass.entries
      .slice()
      .sort((left, right) => left.step - right.step)[input.executedDemoSteps];
    if (!nextScripted) return undefined;
    return tradeFromDemoEntry(nextScripted, input.markets);
  }

  const market = requireMarket(input.markets, input.defaultMarketSymbol);
  const isMomentumUp = input.previousPrice === undefined || input.currentPrice === undefined
    ? true
    : input.currentPrice >= input.previousPrice;

  return {
    marketId: BigInt(market.id),
    side: isMomentumUp ? VaultSide.LONG : VaultSide.SHORT,
    sizeDelta: isMomentumUp ? 1n : -1n,
    collateral: 1_000_000n,
    source: "deterministic-strategy"
  };
}

function tradeFromDemoEntry(entry: DemoConfig["scriptedPass"]["entries"][number], markets: MarketConfig[]): TradeDecision {
  const market = requireMarket(markets, entry.market);
  return {
    marketId: BigInt(market.id),
    side: entry.side === "LONG" ? VaultSide.LONG : VaultSide.SHORT,
    sizeDelta: BigInt(entry.sizeDelta),
    collateral: BigInt(entry.collateral),
    source: "scripted-demo"
  };
}

function requireMarket(markets: MarketConfig[], symbol: string): MarketConfig {
  const market = markets.find((candidate) => candidate.symbol === symbol);
  if (!market) throw new Error(`Market ${symbol} is not configured`);
  return market;
}
