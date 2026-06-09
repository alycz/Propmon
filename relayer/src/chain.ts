import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient
} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {defineChain} from "viem/utils";

import {type PriceUpdate} from "./prices.js";

export const priceAdapterAbi = [
  {
    type: "function",
    name: "pushPrice",
    stateMutability: "nonpayable",
    inputs: [
      {name: "marketId", type: "uint256"},
      {name: "price", type: "uint256"},
      {name: "decimals", type: "uint8"}
    ],
    outputs: []
  }
] as const;

export function createMonadClients(
  rpcUrl: string,
  chainId: number,
  relayerPrivateKey: Hex
): { publicClient: PublicClient; walletClient: WalletClient } {
  const chain = defineChain({
    id: chainId,
    name: "Monad Testnet",
    nativeCurrency: {name: "Monad", symbol: "MON", decimals: 18},
    rpcUrls: {default: {http: [rpcUrl]}}
  });
  const account = privateKeyToAccount(relayerPrivateKey);

  return {
    publicClient: createPublicClient({chain, transport: http(rpcUrl)}),
    walletClient: createWalletClient({account, chain, transport: http(rpcUrl)})
  };
}

export async function pushPriceUpdate(
  publicClient: PublicClient,
  walletClient: WalletClient,
  adapterAddress: Address,
  update: PriceUpdate
): Promise<Hex> {
  const hash = await walletClient.writeContract({
    address: adapterAddress,
    abi: priceAdapterAbi,
    functionName: "pushPrice",
    args: [BigInt(update.marketId), update.price, update.decimals],
    account: walletClient.account!,
    chain: walletClient.chain
  });

  await publicClient.waitForTransactionReceipt({hash});
  return hash;
}
