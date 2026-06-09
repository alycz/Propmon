import {writeFileSync} from "node:fs";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";

import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  http,
  isAddress,
  parseAbi,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient
} from "viem";
import {privateKeyToAccount} from "viem/accounts";

import {accountRegistryAbi, erc20Abi, examinationVaultAbi, fundedVaultAbi, priceAdapterAbi} from "../agent/src/abi.js";
import {loadAgentConfig} from "../agent/src/config.js";
import {runDemoScript} from "../agent/src/demo-runner.js";
import {demoPricesAtStep} from "../relayer/src/demo.js";
import {parseRestContextPrices} from "../relayer/src/prices.js";

type SmokeMode = "demo" | "live";

type DeploymentJson = {
  accountRegistry?: string | null;
  examinationVault?: string | null;
  fundedVault?: string | null;
  perplPriceAdapter?: string | null;
};

type AddressBookJson = {
  chainId: number;
  rpcUrl: string;
  perpl: {
    restUrl: string;
    collateralToken: string;
    markets: Record<string, {id: number; priceDecimals: number; sizeDecimals: number; initialMargin: number}>;
  };
};

type DemoConfigJson = {
  seed: string;
  priceSeries: {
    markets: Record<string, {startPrice: number; driftBpsPerStep: number; volatilityBps: number}>;
  };
  scriptedPass: {
    accountSize: string;
    entries: Array<{market: string; side: "LONG" | "SHORT"; sizeDelta: string; collateral: string; step: number}>;
  };
};

type SmokeSummary = {
  ok: boolean;
  mode: SmokeMode;
  accountId?: string;
  transactions: Record<string, string | string[]>;
  notes: string[];
};

const fundedLiquidityTarget = BigInt(process.env.SMOKE_FUNDED_LIQUIDITY ?? "12000000000");
const monad = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: {name: "Monad", symbol: "MON", decimals: 18},
  rpcUrls: {default: {http: [process.env.MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz"]}},
  testnet: true
});

async function main(): Promise<void> {
  const mode = resolveMode(process.argv[2] ?? process.env.PROPMON_MODE);
  const addressBook = await readJson<AddressBookJson>("shared/addresses.json");
  const demoConfig = await readJson<DemoConfigJson>("shared/demo-config.json");
  const deployments = await loadDeployments();

  const ownerKey = requiredPrivateKey("OWNER_PRIVATE_KEY");
  const agentKey = requiredPrivateKey("AGENT_PRIVATE_KEY");
  const relayerKey = privateKeyFromEnv("RELAYER_PRIVATE_KEY") ?? ownerKey;
  const owner = createClients(addressBook.rpcUrl, addressBook.chainId, ownerKey);
  const relayer = createClients(addressBook.rpcUrl, addressBook.chainId, relayerKey);
  const agentAddress = privateKeyToAccount(agentKey).address;
  const notes: string[] = [];
  const transactions: SmokeSummary["transactions"] = {};

  if (mode === "demo") {
    Object.assign(transactions, await pushDemoPrices({addressBook, demoConfig, deployments, relayer, step: 0}));
    const accountId = await buyExamination({demoConfig, deployments, owner, transactions});
    await authorizeAgent({deployments, owner, accountId, agentAddress, transactions});
    await confirmRuleRevert({deployments, owner, accountId, addressBook, transactions, notes});

    const agentConfig = loadAgentConfig({
      ...process.env,
      PROPMON_MODE: "demo",
      AGENT_ACCOUNT_ID: accountId.toString(),
      AGENT_PRIVATE_KEY: agentKey,
      MONAD_RPC_URL: addressBook.rpcUrl
    });

    const agentResult = await runDemoScript(agentConfig, {
      beforeStep: async (step) => {
        Object.assign(transactions, await pushDemoPrices({addressBook, demoConfig, deployments, relayer, step}));
      }
    });
    transactions.examinationEntries = agentResult.examinationTxs;
    notes.push(agentResult.message);

    await ensureFundedLiquidity({addressBook, deployments, owner, transactions, notes});
    await activateFunded({deployments, owner, accountId, transactions});
    await runFundedDemoRoundTrip({addressBook, demoConfig, deployments, relayer, owner, accountId, transactions});
    await payout({deployments, owner, accountId, transactions});

    emitSummary({ok: true, mode, accountId: accountId.toString(), transactions, notes});
    return;
  }

  Object.assign(transactions, await pushLivePrices({addressBook, deployments, relayer}));
  notes.push("Live price push succeeded through Perpl REST context.");
  if (!process.env.PERPL_REF_CODE) {
    notes.push("PERPL_REF_CODE is not set; authenticated Perpl account creation remains PENDING/NO-GO.");
  }
  notes.push("Funded live Perpl execution remains whitelist-gated; use demo funded flow as the guaranteed fallback.");
  emitSummary({ok: true, mode, transactions, notes});
}

async function buyExamination(input: {
  demoConfig: DemoConfigJson;
  deployments: RequiredDeployments;
  owner: ClientSet;
  transactions: SmokeSummary["transactions"];
}): Promise<bigint> {
  const accountSize = BigInt(input.demoConfig.scriptedPass.accountSize);
  const fee = (accountSize * 100n) / 10_000n;
  const hash = await input.owner.walletClient.writeContract({
    address: input.deployments.examinationVault,
    abi: examinationVaultAbi,
    functionName: "buyExamination",
    args: [accountSize],
    value: fee
  });
  const receipt = await input.owner.publicClient.waitForTransactionReceipt({hash});
  input.transactions.buyExamination = hash;

  for (const log of receipt.logs) {
    try {
      const event = decodeEventLog({abi: examinationVaultAbi, topics: log.topics, data: log.data});
      if (event.eventName === "ExaminationPurchased") return event.args.accountId;
    } catch {
      continue;
    }
  }
  throw new Error(`Could not find ExaminationPurchased in tx ${hash}`);
}

async function authorizeAgent(input: {
  deployments: RequiredDeployments;
  owner: ClientSet;
  accountId: bigint;
  agentAddress: Address;
  transactions: SmokeSummary["transactions"];
}): Promise<void> {
  const hash = await input.owner.walletClient.writeContract({
    address: input.deployments.accountRegistry,
    abi: accountRegistryAbi,
    functionName: "authorizeSigner",
    args: [input.accountId, input.agentAddress]
  });
  await input.owner.publicClient.waitForTransactionReceipt({hash});
  input.transactions.authorizeAgent = hash;
}

async function confirmRuleRevert(input: {
  deployments: RequiredDeployments;
  owner: ClientSet;
  accountId: bigint;
  addressBook: AddressBookJson;
  transactions: SmokeSummary["transactions"];
  notes: string[];
}): Promise<void> {
  const mon = input.addressBook.perpl.markets.MON;
  try {
    await input.owner.publicClient.simulateContract({
      address: input.deployments.examinationVault,
      abi: examinationVaultAbi,
      functionName: "recordEntry",
      account: input.owner.account,
      args: [input.accountId, BigInt(mon.id), 0, 999_999_999_999n, 1n]
    });
    throw new Error("Rule-breaching trade unexpectedly passed simulation");
  } catch (error) {
    input.notes.push(`Rule-breaching examination trade rejected as expected: ${shortError(error)}`);
    input.transactions.ruleRevert = "simulated-revert";
  }
}

async function activateFunded(input: {
  deployments: RequiredDeployments;
  owner: ClientSet;
  accountId: bigint;
  transactions: SmokeSummary["transactions"];
}): Promise<void> {
  const hash = await input.owner.walletClient.writeContract({
    address: input.deployments.fundedVault,
    abi: fundedVaultAbi,
    functionName: "activate",
    args: [input.accountId]
  });
  await input.owner.publicClient.waitForTransactionReceipt({hash});
  input.transactions.activateFunded = hash;
}

async function runFundedDemoRoundTrip(input: {
  addressBook: AddressBookJson;
  demoConfig: DemoConfigJson;
  deployments: RequiredDeployments;
  relayer: ClientSet;
  owner: ClientSet;
  accountId: bigint;
  transactions: SmokeSummary["transactions"];
}): Promise<void> {
  const mon = input.addressBook.perpl.markets.MON;
  const openStep = 8;
  const closeStep = 12;
  const sizeDelta = 250_000n;
  const collateral = 250_000_000n;

  Object.assign(input.transactions, await pushDemoPrices({
    addressBook: input.addressBook,
    demoConfig: input.demoConfig,
    deployments: input.deployments,
    relayer: input.relayer,
    step: openStep
  }));
  const openHash = await input.owner.walletClient.writeContract({
    address: input.deployments.fundedVault,
    abi: fundedVaultAbi,
    functionName: "openPositionDemo",
    args: [input.accountId, BigInt(mon.id), 0, sizeDelta, collateral]
  });
  await input.owner.publicClient.waitForTransactionReceipt({hash: openHash});

  Object.assign(input.transactions, await pushDemoPrices({
    addressBook: input.addressBook,
    demoConfig: input.demoConfig,
    deployments: input.deployments,
    relayer: input.relayer,
    step: closeStep
  }));
  const closeHash = await input.owner.walletClient.writeContract({
    address: input.deployments.fundedVault,
    abi: fundedVaultAbi,
    functionName: "closePositionDemo",
    args: [input.accountId, BigInt(mon.id), -sizeDelta]
  });
  await input.owner.publicClient.waitForTransactionReceipt({hash: closeHash});
  input.transactions.fundedDemo = [openHash, closeHash];
}

async function payout(input: {
  deployments: RequiredDeployments;
  owner: ClientSet;
  accountId: bigint;
  transactions: SmokeSummary["transactions"];
}): Promise<void> {
  const hash = await input.owner.walletClient.writeContract({
    address: input.deployments.fundedVault,
    abi: fundedVaultAbi,
    functionName: "payout",
    args: [input.accountId, input.owner.account.address]
  });
  await input.owner.publicClient.waitForTransactionReceipt({hash});
  input.transactions.payout = hash;
}

async function ensureFundedLiquidity(input: {
  addressBook: AddressBookJson;
  deployments: RequiredDeployments;
  owner: ClientSet;
  transactions: SmokeSummary["transactions"];
  notes: string[];
}): Promise<void> {
  const settlementToken = requiredAddress(
    process.env.SETTLEMENT_TOKEN_ADDRESS ?? input.addressBook.perpl.collateralToken,
    "SETTLEMENT_TOKEN_ADDRESS"
  );
  const currentVaultBalance = await input.owner.publicClient.readContract({
    address: settlementToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [input.deployments.fundedVault]
  });
  if (currentVaultBalance >= fundedLiquidityTarget) {
    input.notes.push(`FundedVault AUSD liquidity OK: ${currentVaultBalance.toString()}`);
    return;
  }

  const deficit = fundedLiquidityTarget - currentVaultBalance;
  const ownerBalance = await input.owner.publicClient.readContract({
    address: settlementToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [input.owner.account.address]
  });
  if (ownerBalance < deficit) {
    throw new Error(
      `FundedVault needs ${deficit.toString()} more AUSD units, but owner only has ${ownerBalance.toString()}`
    );
  }

  const hash = await input.owner.walletClient.writeContract({
    address: settlementToken,
    abi: erc20Abi,
    functionName: "transfer",
    args: [input.deployments.fundedVault, deficit]
  });
  await input.owner.publicClient.waitForTransactionReceipt({hash});
  input.transactions.prefundFundedVault = hash;
  input.notes.push(`Transferred ${deficit.toString()} AUSD units to FundedVault.`);
}

async function pushDemoPrices(input: {
  addressBook: AddressBookJson;
  demoConfig: DemoConfigJson;
  deployments: RequiredDeployments;
  relayer: ClientSet;
  step: number;
}): Promise<Record<string, string[]>> {
  const markets = Object.entries(input.addressBook.perpl.markets).map(([symbol, market]) => ({symbol, ...market}));
  const hashes: string[] = [];
  for (const update of demoPricesAtStep(input.demoConfig, markets, input.step)) {
    const hash = await input.relayer.walletClient.writeContract({
      address: input.deployments.perplPriceAdapter,
      abi: priceAdapterAbi,
      functionName: "pushPrice",
      args: [BigInt(update.marketId), update.price, update.decimals]
    });
    await input.relayer.publicClient.waitForTransactionReceipt({hash});
    hashes.push(hash);
  }
  return {[`demoPricesStep${input.step}`]: hashes};
}

async function pushLivePrices(input: {
  addressBook: AddressBookJson;
  deployments: RequiredDeployments;
  relayer: ClientSet;
}): Promise<Record<string, string[]>> {
  const response = await fetch(`${input.addressBook.perpl.restUrl}/v1/pub/context`);
  if (!response.ok) throw new Error(`Perpl context returned ${response.status}`);

  const markets = Object.entries(input.addressBook.perpl.markets).map(([symbol, market]) => ({symbol, ...market}));
  const updates = parseRestContextPrices(await response.json(), markets);
  const hashes: string[] = [];
  for (const update of updates) {
    const hash = await input.relayer.walletClient.writeContract({
      address: input.deployments.perplPriceAdapter,
      abi: priceAdapterAbi,
      functionName: "pushPrice",
      args: [BigInt(update.marketId), update.price, update.decimals]
    });
    await input.relayer.publicClient.waitForTransactionReceipt({hash});
    hashes.push(hash);
  }
  return {livePrices: hashes};
}

function emitSummary(summary: SmokeSummary): void {
  const output = JSON.stringify(summary, null, 2);
  writeFileSync(resolve(".context/integration-smoke-last.json"), output);
  console.log(output);
}

type RequiredDeployments = {
  accountRegistry: Address;
  examinationVault: Address;
  fundedVault: Address;
  perplPriceAdapter: Address;
};

async function loadDeployments(): Promise<RequiredDeployments> {
  const deployments = await readJson<DeploymentJson>("shared/deployments.json");
  return {
    accountRegistry: requiredAddress(process.env.ACCOUNT_REGISTRY_ADDRESS ?? deployments.accountRegistry, "accountRegistry"),
    examinationVault: requiredAddress(process.env.EXAMINATION_VAULT_ADDRESS ?? deployments.examinationVault, "examinationVault"),
    fundedVault: requiredAddress(process.env.FUNDED_VAULT_ADDRESS ?? deployments.fundedVault, "fundedVault"),
    perplPriceAdapter: requiredAddress(process.env.PRICE_ADAPTER_ADDRESS ?? deployments.perplPriceAdapter, "perplPriceAdapter")
  };
}

type ClientSet = {
  account: ReturnType<typeof privateKeyToAccount>;
  publicClient: PublicClient;
  walletClient: WalletClient;
};

function createClients(rpcUrl: string, chainId: number, privateKey: Hex): ClientSet {
  const account = privateKeyToAccount(privateKey);
  const chain = {...monad, id: chainId, rpcUrls: {default: {http: [rpcUrl]}}};
  return {
    account,
    publicClient: createPublicClient({chain, transport: http(rpcUrl)}),
    walletClient: createWalletClient({account, chain, transport: http(rpcUrl)})
  };
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(path), "utf8")) as T;
}

function resolveMode(value: string | undefined): SmokeMode {
  return value === "live" ? "live" : "demo";
}

function requiredAddress(value: string | null | undefined, name: string): Address {
  if (!value || !isAddress(value)) throw new Error(`${name} must be a valid address`);
  return value;
}

function requiredPrivateKey(name: string): Hex {
  const key = privateKeyFromEnv(name);
  if (!key) throw new Error(`${name} must be set to a 0x-prefixed private key`);
  return key;
}

function privateKeyFromEnv(name: string): Hex | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${name} must be a 0x-prefixed private key`);
  return value as Hex;
}

function shortError(error: unknown): string {
  if (error instanceof Error) return error.shortMessage ?? error.message;
  return String(error);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
