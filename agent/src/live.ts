import {fundedVaultAbi} from "./abi.js";
import {createPublicClientForConfig, orderActionFromVaultIntent, reconcileFillOnChain} from "./chain.js";
import {connectPerpl, PerplWhitelistError} from "./perpl-auth.js";
import {buildOrderRequestMessage, parseFillMessage, TradingWsClient} from "./perpl-ws.js";
import {nextRq} from "./rq.js";
import {createAgentSigner} from "./signer.js";
import type {AgentConfig} from "./types.js";

export type LiveIntent = {
  accountId: bigint;
  requestId: bigint;
  marketId: bigint;
  side: number;
  sizeDelta: bigint;
  collateral: bigint;
  isClose?: boolean;
};

export async function handleFillMessage(input: {
  message: unknown;
  accountId: bigint;
  resolveRequestId?: (fill: {rq: bigint; marketId: bigint; sizeDelta: bigint; fillPrice: bigint}) => bigint | undefined;
  reconcile: (fill: {requestId: bigint; marketId: bigint; sizeDelta: bigint; fillPrice: bigint}) => Promise<unknown>;
}): Promise<number> {
  const fills = parseFillMessage(input.message);
  let reconciled = 0;
  for (const fill of fills) {
    const requestId = input.resolveRequestId?.(fill) ?? fill.rq;
    await input.reconcile({
      requestId,
      marketId: fill.marketId,
      sizeDelta: fill.sizeDelta,
      fillPrice: fill.fillPrice
    });
    reconciled += 1;
  }
  return reconciled;
}

export async function startLiveIntentWatcher(config: AgentConfig): Promise<() => void> {
  const signer = createAgentSigner(config);
  const signerAddress = await signer.getAddress();
  const publicClient = createPublicClientForConfig(config);

  const auth = await connectPerpl({
    apiUrl: config.perplApiUrl,
    address: signerAddress,
    chainId: config.chainId,
    signMessage: (message) => signer.signMessage(message)
  }).catch((error: unknown) => {
    if (error instanceof PerplWhitelistError) {
      console.error(error.message);
      return undefined;
    }
    throw error;
  });

  if (!auth) return () => undefined;

  const wsUrl = `${config.perplWsUrl}${config.tradingWsPath}`;
  const tradingClient = new TradingWsClient(wsUrl, auth.cookie, auth.nonce);
  const pendingRequests = new Map<string, bigint>();
  await tradingClient.connect();
  tradingClient.onMessage((message) => {
    void handleFillMessage({
      message,
      accountId: config.accountId,
      resolveRequestId: (fill) => {
        const requestId = pendingRequests.get(fill.rq.toString());
        if (requestId !== undefined) pendingRequests.delete(fill.rq.toString());
        return requestId;
      },
      reconcile: (fill) => reconcileFillOnChain({
        config,
        accountId: config.accountId,
        requestId: fill.requestId,
        marketId: fill.marketId,
        sizeDelta: fill.sizeDelta,
        fillPrice: fill.fillPrice
      })
    }).catch((error) => console.error("Failed to reconcile Perpl fill", error));
  });

  const unwatch = publicClient.watchContractEvent({
    address: config.deployments.fundedVault,
    abi: fundedVaultAbi,
    eventName: "LivePositionIntent",
    onLogs: (logs) => {
      for (const log of logs) {
        const args = log.args;
        if (
          args.accountId === undefined ||
          args.requestId === undefined ||
          args.marketId === undefined ||
          args.side === undefined ||
          args.sizeDelta === undefined ||
          args.collateral === undefined
        ) {
          continue;
        }
        const intent: LiveIntent = {
          accountId: args.accountId,
          requestId: args.requestId,
          marketId: args.marketId,
          side: args.side,
          sizeDelta: args.sizeDelta,
          collateral: args.collateral,
          isClose: args.collateral === 0n
        };
        const rq = submitLiveIntent(config, tradingClient, intent);
        pendingRequests.set(rq.toString(), intent.requestId);
      }
    }
  });

  return () => {
    unwatch();
    tradingClient.close();
  };
}

export function submitLiveIntent(config: AgentConfig, tradingClient: Pick<TradingWsClient, "send">, intent: LiveIntent): bigint {
  const rq = nextRq({
    statePath: config.statePath,
    accountKey: intent.accountId.toString(),
    lfr: config.perplLfrSeed
  });
  const message = buildOrderRequestMessage({
    rq,
    marketId: intent.marketId,
    action: orderActionFromVaultIntent({
      side: intent.side,
      sizeDelta: intent.sizeDelta,
      isClose: intent.isClose ?? intent.collateral === 0n
    }),
    sizeDelta: intent.sizeDelta,
    collateral: intent.collateral,
    leverage: config.perplLeverageHundredths,
    accountId: intent.accountId
  });
  tradingClient.send(message);
  console.log(`Submitted Perpl order rq=${rq} for Propmon requestId=${intent.requestId}`);
  return rq;
}
