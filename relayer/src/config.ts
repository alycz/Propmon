import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {isAddress, type Address, type Hex} from "viem";

import {type DemoConfig} from "./demo.js";
import {type MarketConfig} from "./prices.js";

export type PropmonMode = "live" | "demo";

export type RuntimeConfig = {
  mode: PropmonMode;
  rpcUrl: string;
  perplApiUrl: string;
  perplWsUrl: string;
  chainId: number;
  marketStream: string;
  heartbeatStream: string;
  adapterAddress: Address;
  relayerPrivateKey: Hex;
  pushIntervalMs: number;
  minMoveBps: number;
  pollIntervalMs: number;
  reconnectBaseMs: number;
};

export function resolveMode(input?: string): PropmonMode {
  return input === "live" ? "live" : "demo";
}

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const chainId = integerFromEnv(env.PERPL_CHAIN_ID, 10143, "PERPL_CHAIN_ID");
  const adapterAddress = requiredAddress(env.PRICE_ADAPTER_ADDRESS, "PRICE_ADAPTER_ADDRESS");
  const relayerPrivateKey = requiredPrivateKey(env.RELAYER_PRIVATE_KEY, "RELAYER_PRIVATE_KEY");

  return {
    mode: resolveMode(env.PROPMON_MODE),
    rpcUrl: env.MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz",
    perplApiUrl: env.PERPL_API_URL ?? "https://testnet.perpl.xyz/api",
    perplWsUrl: env.PERPL_WS_URL ?? "wss://testnet.perpl.xyz",
    chainId,
    marketStream: `market-state@${chainId}`,
    heartbeatStream: `heartbeat@${chainId}`,
    adapterAddress,
    relayerPrivateKey,
    pushIntervalMs: integerFromEnv(env.PRICE_PUSH_INTERVAL_MS, 5_000, "PRICE_PUSH_INTERVAL_MS"),
    minMoveBps: integerFromEnv(env.PRICE_MIN_MOVE_BPS, 5, "PRICE_MIN_MOVE_BPS"),
    pollIntervalMs: integerFromEnv(env.PRICE_POLL_INTERVAL_MS, 10_000, "PRICE_POLL_INTERVAL_MS"),
    reconnectBaseMs: integerFromEnv(env.PRICE_RECONNECT_BASE_MS, 1_000, "PRICE_RECONNECT_BASE_MS")
  };
}

export function loadMarketConfig(path = resolve(process.cwd(), "../shared/addresses.json")): MarketConfig[] {
  const addressBook = JSON.parse(readFileSync(path, "utf8")) as {
    perpl?: { markets?: Record<string, { id: number; priceDecimals: number }> };
  };

  const markets = addressBook.perpl?.markets;
  if (!markets) throw new Error(`No Perpl markets found in ${path}`);

  return Object.entries(markets).map(([symbol, market]) => ({
    symbol,
    id: market.id,
    priceDecimals: market.priceDecimals
  }));
}

export function loadDemoConfig(path = resolve(process.cwd(), "../shared/demo-config.json")): DemoConfig {
  return JSON.parse(readFileSync(path, "utf8")) as DemoConfig;
}

function requiredAddress(value: string | undefined, name: string): Address {
  if (!value || !isAddress(value)) {
    throw new Error(`${name} must be set to a valid Monad address before submitting price transactions`);
  }
  return value;
}

function requiredPrivateKey(value: string | undefined, name: string): Hex {
  if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} must be set to a 0x-prefixed private key before submitting price transactions`);
  }
  return value as Hex;
}

function integerFromEnv(value: string | undefined, defaultValue: number, name: string): number {
  if (value === undefined || value === "") return defaultValue;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}
