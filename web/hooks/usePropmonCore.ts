"use client";

import {useEffect, useMemo, useState} from "react";
import {zeroAddress, type Address} from "viem";
import {useBlockNumber, usePublicClient} from "wagmi";
import {usePathname, useRouter, useSearchParams} from "next/navigation";

import {
  contractsReady,
  defaultMarket,
  getContractAddresses,
  MONAD_TESTNET_CHAIN_ID,
  parseMode,
  type PropmonMode
} from "../lib/config";
import {usePropmonWallet} from "../lib/use-propmon-wallet";

export type PropmonCore = ReturnType<typeof usePropmonCore>;

export function usePropmonCore() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const publicClient = usePublicClient();
  const wallet = usePropmonWallet();
  const {address, chainId, authenticated: isConnected} = wallet;

  const {data: blockNumber} = useBlockNumber({watch: true});
  const addresses = useMemo(() => getContractAddresses(), []);
  const ready = contractsReady(addresses);

  const [mode, setModeState] = useState<PropmonMode>(() => parseMode(searchParams.get("mode")));
  const [switchingChain, setSwitchingChain] = useState(false);
  const [accountIdInput, setAccountIdInput] = useState(() => sanitizeId(searchParams.get("account")));
  const [selectedMarketId, setSelectedMarketId] = useState(() => {
    const fromUrl = Number(searchParams.get("market"));
    return Number.isInteger(fromUrl) && fromUrl > 0 ? fromUrl : defaultMarket.id;
  });

  const accountId = accountIdInput.trim() ? BigInt(accountIdInput.trim()) : undefined;
  const onWrongChain = isConnected && chainId !== MONAD_TESTNET_CHAIN_ID;

  const registryAddress = ready ? addresses.accountRegistry : zeroAddress;
  const examinationAddress = ready ? addresses.examinationVault : zeroAddress;
  const fundedAddress = ready ? addresses.fundedVault : zeroAddress;
  const priceAddress = ready ? addresses.perplPriceAdapter : zeroAddress;

  useEffect(() => {
    setModeState(parseMode(searchParams.get("mode")));
  }, [searchParams]);

  function setMode(nextMode: PropmonMode) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", nextMode);
    setModeState(nextMode);
    router.replace(`${pathname}?${params.toString()}`, {scroll: false});
  }

  return {
    wallet,
    address: address as Address | undefined,
    chainId,
    isConnected,
    onWrongChain,
    switchingChain,
    setSwitchingChain,
    ensureMonadTestnet: wallet.ensureMonadTestnet,
    mode,
    setMode,
    addresses,
    ready,
    registryAddress,
    examinationAddress,
    fundedAddress,
    priceAddress,
    accountIdInput,
    setAccountIdInput,
    accountId,
    selectedMarketId,
    setSelectedMarketId,
    blockNumber,
    publicClient
  };
}

function sanitizeId(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}
