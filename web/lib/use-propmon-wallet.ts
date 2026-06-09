"use client";

import {getEmbeddedConnectedWallet, usePrivy, useSignMessage, useWallets, type ConnectedWallet} from "@privy-io/react-auth";
import {useMemo} from "react";
import {type Address, type Hex} from "viem";

import {MONAD_TESTNET_CHAIN_ID} from "./config";

export type PropmonWallet = {
  ready: boolean;
  authenticated: boolean;
  address?: Address;
  walletId?: string;
  chainId?: number;
  login: () => void;
  logout: () => Promise<void>;
  ensureMonadTestnet: () => Promise<void>;
  signMessage: (message: string) => Promise<Hex>;
};

export function usePropmonWallet(): PropmonWallet {
  const {ready, authenticated, login, logout} = usePrivy();
  const {wallets, ready: walletsReady} = useWallets();
  const {signMessage: signPrivyMessage} = useSignMessage();

  const wallet = useMemo(() => selectWallet(wallets), [wallets]);
  const chainId = parseCaip2ChainId(wallet?.chainId);

  return {
    ready: ready && walletsReady,
    authenticated,
    address: wallet?.address as Address | undefined,
    walletId: wallet?.walletIndex !== undefined ? `${wallet.walletClientType}:${wallet.walletIndex}` : undefined,
    chainId,
    login: () => login(),
    logout,
    ensureMonadTestnet: async () => {
      if (!wallet) throw new Error("Connect a wallet before switching networks.");
      if (parseCaip2ChainId(wallet.chainId) !== MONAD_TESTNET_CHAIN_ID) {
        await wallet.switchChain(MONAD_TESTNET_CHAIN_ID);
      }
    },
    signMessage: async (message: string) => {
      if (!wallet) throw new Error("Connect a wallet before signing messages.");
      const {signature} = await signPrivyMessage({message}, {address: wallet.address});
      return signature as Hex;
    }
  };
}

function selectWallet(wallets: ConnectedWallet[]): ConnectedWallet | undefined {
  return getEmbeddedConnectedWallet(wallets) ?? wallets[0];
}

function parseCaip2ChainId(chainId: string | undefined): number | undefined {
  if (!chainId) return undefined;
  const decimal = chainId.startsWith("eip155:") ? chainId.slice("eip155:".length) : chainId;
  const parsed = Number(decimal);
  return Number.isInteger(parsed) ? parsed : undefined;
}
