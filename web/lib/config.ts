import {defineChain, isAddress, type Address} from "viem";

import addressBook from "../../shared/addresses.json";
import demoConfigJson from "../../shared/demo-config.json";
import deploymentsJson from "../../shared/deployments.json";

export type PropmonMode = "demo" | "live";

export type MarketSymbol = keyof typeof addressBook.perpl.markets;

export type MarketConfig = {
  symbol: string;
  id: number;
  priceDecimals: number;
  sizeDecimals: number;
  initialMargin: number;
};

export type ContractAddresses = {
  accountRegistry?: Address;
  examinationVault?: Address;
  fundedVault?: Address;
  perplPriceAdapter?: Address;
};

export const MONAD_TESTNET_CHAIN_ID = 10143;

export const monadTestnet = defineChain({
  id: MONAD_TESTNET_CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: {name: "MON", symbol: "MON", decimals: 18},
  rpcUrls: {
    default: {http: [addressBook.rpcUrl]},
    public: {http: [addressBook.rpcUrl]}
  },
  blockExplorers: {
    default: {name: "MonadScan", url: addressBook.blockExplorerUrl.replace(/\/$/, "")}
  },
  testnet: true
});

export const explorerBaseUrl = addressBook.blockExplorerUrl.replace(/\/$/, "");
export const markets: MarketConfig[] = Object.entries(addressBook.perpl.markets).map(([symbol, market]) => ({
  symbol,
  ...market
}));
export const defaultMarket = markets.find((market) => market.symbol === "MON") ?? markets[0];
export const demoConfig = demoConfigJson;
export const accountStates = ["NONE", "EXAMINATION", "PASSED", "FUNDED", "FAILED", "PAYOUT"] as const;

export const tierOptions = [
  {label: "$10,000", accountSize: 10_000_000_000n},
  {label: "$25,000", accountSize: 25_000_000_000n},
  {label: "$50,000", accountSize: 50_000_000_000n}
];

export function parseMode(value: string | null | undefined): PropmonMode {
  return value === "live" ? "live" : "demo";
}

export function getContractAddresses(): ContractAddresses {
  return {
    accountRegistry: readAddress(
      process.env.NEXT_PUBLIC_ACCOUNT_REGISTRY_ADDRESS,
      deploymentsJson.accountRegistry,
      addressBook.propmon.accountRegistry
    ),
    examinationVault: readAddress(
      process.env.NEXT_PUBLIC_EXAMINATION_VAULT_ADDRESS,
      deploymentsJson.examinationVault,
      addressBook.propmon.examinationVault
    ),
    fundedVault: readAddress(
      process.env.NEXT_PUBLIC_FUNDED_VAULT_ADDRESS,
      deploymentsJson.fundedVault,
      addressBook.propmon.fundedVault
    ),
    perplPriceAdapter: readAddress(
      process.env.NEXT_PUBLIC_PRICE_ADAPTER_ADDRESS,
      deploymentsJson.perplPriceAdapter,
      addressBook.propmon.perplPriceAdapter
    )
  };
}

export function contractsReady(addresses: ContractAddresses): addresses is Required<ContractAddresses> {
  return Boolean(
    addresses.accountRegistry &&
      addresses.examinationVault &&
      addresses.fundedVault &&
      addresses.perplPriceAdapter
  );
}

export function marketById(marketId: bigint | number): MarketConfig | undefined {
  const id = Number(marketId);
  return markets.find((market) => market.id === id);
}

function readAddress(...values: Array<string | null | undefined>): Address | undefined {
  const value = values.find((candidate) => candidate && isAddress(candidate));
  return value as Address | undefined;
}
