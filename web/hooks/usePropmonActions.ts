"use client";

import {useEffect, useState} from "react";
import {decodeEventLog, type Hex} from "viem";
import {useWaitForTransactionReceipt, useWriteContract} from "wagmi";

import {examinationVaultAbi} from "../lib/abi";
import {errorMessage} from "../lib/format";

type Params = {
  ready: boolean;
  onExaminationPurchased?: (accountId: string) => void;
};

export type PropmonActions = ReturnType<typeof usePropmonActions>;

export function usePropmonActions({ready, onExaminationPurchased}: Params) {
  const {writeContractAsync, isPending: writePending} = useWriteContract();
  const [lastHash, setLastHash] = useState<Hex>();
  const [lastAction, setLastAction] = useState("");
  const [actionError, setActionError] = useState("");
  const {data: receipt, isLoading: receiptPending} = useWaitForTransactionReceipt({hash: lastHash});

  useEffect(() => {
    if (!receipt || !ready) return;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({abi: examinationVaultAbi, data: log.data, topics: log.topics});
        if (decoded.eventName === "ExaminationPurchased") {
          onExaminationPurchased?.(decoded.args.accountId.toString());
        }
      } catch {
        continue;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt, ready]);

  async function submit(label: string, fn: () => Promise<Hex>) {
    setActionError("");
    setLastAction(label);
    try {
      const hash = await fn();
      setLastHash(hash);
    } catch (error) {
      setActionError(errorMessage(error));
    }
  }

  return {
    writeContractAsync,
    submit,
    writePending,
    receiptPending,
    receipt,
    lastHash,
    lastAction,
    actionError,
    setActionError
  };
}
