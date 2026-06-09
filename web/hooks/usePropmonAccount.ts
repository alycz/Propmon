"use client";

import {useEffect} from "react";
import {isAddress, zeroAddress, type Address} from "viem";
import {useReadContract, useWatchContractEvent} from "wagmi";

import {accountRegistryAbi, examinationVaultAbi, fundedVaultAbi} from "../lib/abi";
import {accountStates} from "../lib/config";
import type {LedgerRow} from "./types";

type Params = {
  ready: boolean;
  registryAddress: Address;
  examinationAddress: Address;
  fundedAddress: Address;
  accountId?: bigint;
  agentSigner: string;
  ledgerHashes: LedgerRow[];
  blockNumber?: bigint;
};

export type PropmonAccount = ReturnType<typeof usePropmonAccount>;

export function usePropmonAccount({
  ready,
  registryAddress,
  examinationAddress,
  fundedAddress,
  accountId,
  agentSigner,
  ledgerHashes,
  blockNumber
}: Params) {
  const examAccount = useReadContract({
    address: examinationAddress,
    abi: examinationVaultAbi,
    functionName: "getAccount",
    args: [accountId ?? 0n],
    query: {enabled: ready && Boolean(accountId), refetchInterval: 4000}
  });
  const examDrawdown = useReadContract({
    address: examinationAddress,
    abi: examinationVaultAbi,
    functionName: "getDrawdown",
    args: [accountId ?? 0n],
    query: {enabled: ready && Boolean(accountId), refetchInterval: 4000}
  });
  const examEntries = useReadContract({
    address: examinationAddress,
    abi: examinationVaultAbi,
    functionName: "getEntries",
    args: [accountId ?? 0n],
    query: {enabled: ready && Boolean(accountId), refetchInterval: 4000}
  });
  const ruleStatus = useReadContract({
    address: examinationAddress,
    abi: examinationVaultAbi,
    functionName: "getRuleStatus",
    args: [accountId ?? 0n],
    query: {enabled: ready && Boolean(accountId), refetchInterval: 4000}
  });
  const registryState = useReadContract({
    address: registryAddress,
    abi: accountRegistryAbi,
    functionName: "stateOf",
    args: [accountId ?? 0n],
    query: {enabled: ready && Boolean(accountId), refetchInterval: 4000}
  });
  const authorizedSigner = useReadContract({
    address: registryAddress,
    abi: accountRegistryAbi,
    functionName: "isAuthorizedSigner",
    args: [accountId ?? 0n, isAddress(agentSigner) ? (agentSigner as Address) : zeroAddress],
    query: {enabled: ready && Boolean(accountId) && isAddress(agentSigner), refetchInterval: 6000}
  });
  const fundedAccount = useReadContract({
    address: fundedAddress,
    abi: fundedVaultAbi,
    functionName: "getAccount",
    args: [accountId ?? 0n],
    query: {enabled: ready && Boolean(accountId) && Number(registryState.data ?? 0) >= 3, refetchInterval: 4000}
  });

  useEffect(() => {
    examAccount.refetch();
    examDrawdown.refetch();
    examEntries.refetch();
    ruleStatus.refetch();
    registryState.refetch();
    fundedAccount.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockNumber]);

  useWatchContractEvent({
    address: examinationAddress,
    abi: examinationVaultAbi,
    eventName: "EntryRecorded",
    enabled: ready,
    onLogs: () => examEntries.refetch()
  });

  const exam = examAccount.data;
  const funded = fundedAccount.data;
  const stateIndex = Number(registryState.data ?? exam?.state ?? 0);
  const stateLabel = accountStates[stateIndex] ?? "UNKNOWN";
  const drawdown = examDrawdown.data;
  const passedFailed = ruleStatus.data;

  const entries = (examEntries.data ?? []).map((entry, index) => {
    const event = ledgerHashes[index];
    return {
      key: event?.key ?? `${entry.timestamp}-${index}`,
      marketId: entry.marketId,
      sizeDelta: entry.sizeDelta,
      markPrice: entry.markPrice,
      timestamp: entry.timestamp,
      equityAfter: entry.equityAfter,
      hash: event?.hash
    };
  });

  return {
    examAccount,
    examDrawdown,
    examEntries,
    ruleStatus,
    registryState,
    authorizedSigner,
    fundedAccount,
    exam,
    funded,
    stateIndex,
    stateLabel,
    drawdown,
    passedFailed,
    entries
  };
}
