"use client";

import {useEffect, useState} from "react";
import {type Address} from "viem";
import {usePublicClient} from "wagmi";

import {examinationVaultAbi, fundedVaultAbi} from "../lib/abi";
import {demoConfig, marketById} from "../lib/config";
import {errorMessage, formatQuote} from "../lib/format";
import type {FundedEvent, LedgerRow} from "./types";

const demoFundedLabel = demoConfig.fundedDemo?.label ?? "DEMO FILL";

type Params = {
  ready: boolean;
  examinationAddress: Address;
  fundedAddress: Address;
  accountId?: bigint;
  blockNumber?: bigint;
  onError?: (message: string) => void;
};

export type PropmonEvents = ReturnType<typeof usePropmonEvents>;

export function usePropmonEvents({ready, examinationAddress, fundedAddress, accountId, blockNumber, onError}: Params) {
  const publicClient = usePublicClient();
  const [ledgerHashes, setLedgerHashes] = useState<LedgerRow[]>([]);
  const [fundedEvents, setFundedEvents] = useState<FundedEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function loadEvents() {
      if (!publicClient || !ready || !accountId) return;
      const [entries, liveIntents, fills, demoFills, payouts] = await Promise.all([
        publicClient.getContractEvents({
          address: examinationAddress,
          abi: examinationVaultAbi,
          eventName: "EntryRecorded",
          args: {accountId},
          fromBlock: 0n
        }),
        publicClient.getContractEvents({
          address: fundedAddress,
          abi: fundedVaultAbi,
          eventName: "LivePositionIntent",
          args: {accountId},
          fromBlock: 0n
        }),
        publicClient.getContractEvents({
          address: fundedAddress,
          abi: fundedVaultAbi,
          eventName: "PositionFilled",
          args: {accountId},
          fromBlock: 0n
        }),
        publicClient.getContractEvents({
          address: fundedAddress,
          abi: fundedVaultAbi,
          eventName: "DemoFill",
          args: {accountId},
          fromBlock: 0n
        }),
        publicClient.getContractEvents({
          address: fundedAddress,
          abi: fundedVaultAbi,
          eventName: "PayoutClaimed",
          args: {accountId},
          fromBlock: 0n
        })
      ]);
      if (cancelled) return;
      setLedgerHashes(
        entries.map((event, index) => ({
          key: `${event.transactionHash}-${event.logIndex ?? index}`,
          marketId: event.args.marketId ?? 0n,
          sizeDelta: event.args.sizeDelta ?? 0n,
          markPrice: event.args.markPrice ?? 0n,
          equityAfter: event.args.newEquity,
          hash: event.transactionHash
        }))
      );
      setFundedEvents([
        ...liveIntents.map((event, index) => ({
          key: `intent-${event.transactionHash}-${event.logIndex ?? index}`,
          label: "LIVE INTENT",
          detail: `${marketById(event.args.marketId ?? 0n)?.symbol ?? "Market"} request ${event.args.requestId?.toString() ?? "--"} pending Perpl fill`,
          hash: event.transactionHash
        })),
        ...fills.map((event, index) => ({
          key: `fill-${event.transactionHash}-${event.logIndex ?? index}`,
          label: Number(event.args.mode ?? 0) === 1 ? demoFundedLabel : "LIVE FILL",
          detail: `${marketById(event.args.marketId ?? 0n)?.symbol ?? "Market"} filled at ${event.args.fillPrice?.toString() ?? "--"}`,
          hash: event.transactionHash
        })),
        ...demoFills.map((event, index) => ({
          key: `demo-${event.transactionHash}-${event.logIndex ?? index}`,
          label: demoFundedLabel,
          detail: `${marketById(event.args.marketId ?? 0n)?.symbol ?? "Market"} demo fill at ${event.args.price?.toString() ?? "--"}`,
          hash: event.transactionHash
        })),
        ...payouts.map((event, index) => ({
          key: `payout-${event.transactionHash}-${event.logIndex ?? index}`,
          label: "PAYOUT",
          detail: `Trader ${formatQuote(event.args.traderAmount)} / firm ${formatQuote(event.args.protocolAmount)}`,
          hash: event.transactionHash
        }))
      ]);
    }
    loadEvents().catch((error) => onError?.(errorMessage(error)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicClient, ready, accountId, blockNumber, examinationAddress, fundedAddress]);

  return {ledgerHashes, fundedEvents, demoFundedLabel};
}
