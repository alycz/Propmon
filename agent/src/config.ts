import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";

import {isAddress, type Address, type Hex} from "viem";

import type {AgentConfig, DemoConfig, DeploymentAddresses, MarketConfig, PropmonMode} from "./types.js";

type AddressBookJson = {
  chainId?: number;
  rpcUrl?: string;
  perpl?: {
    restUrl?: string;
    wsUrl?: string;
    tradingWsPath?: string;
    markets?: Record<string, {
      id: number;
      priceDecimals: number;
      sizeDecimals: number;
      initialMargin: number;
    }>;
  };
  propmon?: Partial<Record<keyof DeploymentAddresses, string | null>>;
};

type DeploymentsJson = Partial<Record<keyof DeploymentAddresses, string | null>>;

export function resolveAgentMode(input?: string): PropmonMode {
  return input === "live" ? "live" : "demo";
}

export function loadAgentConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const addressBookPath = resolveRepoPath(env.ADDRESS_BOOK_PATH ?? "shared/addresses.json");
  const deploymentsPath = resolveRepoPath(env.DEPLOYMENTS_PATH ?? "shared/deployments.json");
  const demoConfigPath = resolveRepoPath(env.DEMO_CONFIG_PATH ?? "shared/demo-config.json");

  const addressBook = readJson<AddressBookJson>(addressBookPath);
  const deploymentsJson = readJson<DeploymentsJson>(deploymentsPath);
  const demoConfig = readJson<DemoConfig>(demoConfigPath);

  const markets = loadMarkets(addressBook, addressBookPath);
  const marketSymbol = env.AGENT_MARKET ?? demoConfig.scriptedPass.entries[0]?.market ?? "MON";
  const market = markets.find((candidate) => candidate.symbol === marketSymbol);
  if (!market) {
    throw new Error(`AGENT_MARKET ${marketSymbol} is not configured in ${addressBookPath}`);
  }

  return {
    mode: resolveAgentMode(env.PROPMON_MODE),
    rpcUrl: env.MONAD_RPC_URL ?? addressBook.rpcUrl ?? "https://testnet-rpc.monad.xyz",
    chainId: integerFromEnv(env.PERPL_CHAIN_ID, addressBook.chainId ?? 10143, "PERPL_CHAIN_ID"),
    perplApiUrl: env.PERPL_API_URL ?? addressBook.perpl?.restUrl ?? "https://testnet.perpl.xyz/api",
    perplWsUrl: env.PERPL_WS_URL ?? addressBook.perpl?.wsUrl ?? "wss://testnet.perpl.xyz",
    tradingWsPath: env.PERPL_TRADING_WS_PATH ?? addressBook.perpl?.tradingWsPath ?? "/ws/v1/trading",
    deployments: loadDeployments(env, deploymentsJson, addressBook, deploymentsPath),
    markets,
    demoConfig,
    agentPrivateKey: requiredPrivateKey(env.AGENT_PRIVATE_KEY, "AGENT_PRIVATE_KEY"),
    reconcilerPrivateKey: optionalPrivateKey(env.RECONCILER_PRIVATE_KEY, "RECONCILER_PRIVATE_KEY"),
    accountId: bigintFromEnv(env.AGENT_ACCOUNT_ID, "AGENT_ACCOUNT_ID"),
    marketSymbol,
    marketId: BigInt(market.id),
    pollIntervalMs: integerFromEnv(env.AGENT_POLL_INTERVAL_MS, 10_000, "AGENT_POLL_INTERVAL_MS"),
    statePath: resolveRepoPath(env.AGENT_STATE_PATH ?? ".context/agent-rq-state.json"),
    perplLfrSeed: bigintFromEnv(env.PERPL_LFR_SEED ?? "0", "PERPL_LFR_SEED"),
    perplLeverageHundredths: integerFromEnv(env.PERPL_LEVERAGE_HUNDREDTHS, 1_000, "PERPL_LEVERAGE_HUNDREDTHS"),
    perplRefCode: bigintFromEnv(env.PERPL_REF_CODE ?? "0", "PERPL_REF_CODE")
  };
}

export function resolveRepoPath(relativeOrAbsolute: string, cwd = process.cwd()): string {
  if (relativeOrAbsolute.startsWith("/")) return relativeOrAbsolute;

  const direct = resolve(cwd, relativeOrAbsolute);
  if (existsSync(direct)) return direct;

  const fromParent = resolve(cwd, "..", relativeOrAbsolute);
  if (existsSync(fromParent)) return fromParent;

  if (relativeOrAbsolute.startsWith(".context/")) return resolve(cwd, "..", relativeOrAbsolute);
  return direct;
}

function loadMarkets(addressBook: AddressBookJson, path: string): MarketConfig[] {
  const markets = addressBook.perpl?.markets;
  if (!markets) throw new Error(`No Perpl markets found in ${path}`);

  return Object.entries(markets).map(([symbol, market]) => ({
    symbol,
    id: market.id,
    priceDecimals: market.priceDecimals,
    sizeDecimals: market.sizeDecimals,
    initialMargin: market.initialMargin
  }));
}

function loadDeployments(
  env: NodeJS.ProcessEnv,
  deployments: DeploymentsJson,
  addressBook: AddressBookJson,
  deploymentsPath: string
): DeploymentAddresses {
  return {
    accountRegistry: deploymentAddress(
      env.ACCOUNT_REGISTRY_ADDRESS,
      deployments.accountRegistry,
      addressBook.propmon?.accountRegistry,
      "accountRegistry",
      deploymentsPath
    ),
    examinationVault: deploymentAddress(
      env.EXAMINATION_VAULT_ADDRESS,
      deployments.examinationVault,
      addressBook.propmon?.examinationVault,
      "examinationVault",
      deploymentsPath
    ),
    fundedVault: deploymentAddress(
      env.FUNDED_VAULT_ADDRESS,
      deployments.fundedVault,
      addressBook.propmon?.fundedVault,
      "fundedVault",
      deploymentsPath
    ),
    perplPriceAdapter: deploymentAddress(
      env.PRICE_ADAPTER_ADDRESS,
      deployments.perplPriceAdapter,
      addressBook.propmon?.perplPriceAdapter,
      "perplPriceAdapter",
      deploymentsPath
    )
  };
}

function deploymentAddress(
  envValue: string | undefined,
  deploymentValue: string | null | undefined,
  addressBookValue: string | null | undefined,
  name: keyof DeploymentAddresses,
  deploymentsPath: string
): Address {
  const value = envValue || deploymentValue || addressBookValue;
  if (!value || !isAddress(value)) {
    throw new Error(
      `Missing ${name} deployment address. Fill ${deploymentsPath} or set ${deploymentEnvName(name)} before running Agent 06.`
    );
  }
  return value;
}

function deploymentEnvName(name: keyof DeploymentAddresses): string {
  if (name === "accountRegistry") return "ACCOUNT_REGISTRY_ADDRESS";
  if (name === "examinationVault") return "EXAMINATION_VAULT_ADDRESS";
  if (name === "fundedVault") return "FUNDED_VAULT_ADDRESS";
  return "PRICE_ADAPTER_ADDRESS";
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function requiredPrivateKey(value: string | undefined, name: string): Hex {
  const privateKey = optionalPrivateKey(value, name);
  if (!privateKey) throw new Error(`${name} must be set to a 0x-prefixed private key`);
  return privateKey;
}

function optionalPrivateKey(value: string | undefined, name: string): Hex | undefined {
  if (value === undefined || value === "") return undefined;
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} must be a 0x-prefixed private key`);
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

function bigintFromEnv(value: string | undefined, name: string): bigint {
  if (value === undefined || value === "") {
    throw new Error(`${name} must be set`);
  }
  try {
    const parsed = BigInt(value);
    if (parsed < 0n) throw new Error("negative");
    return parsed;
  } catch {
    throw new Error(`${name} must be a non-negative integer`);
  }
}
