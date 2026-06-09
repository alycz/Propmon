"use client";

import {ConnectButton} from "@rainbow-me/rainbowkit";
import {Suspense, useEffect, useMemo, useState} from "react";
import {decodeEventLog, isAddress, zeroAddress, type Address, type Hex} from "viem";
import {
  useAccount,
  useBlockNumber,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWatchContractEvent,
  useWriteContract
} from "wagmi";
import {usePathname, useRouter, useSearchParams} from "next/navigation";

import {accountRegistryAbi, examinationVaultAbi, fundedVaultAbi, priceAdapterAbi} from "../lib/abi";
import {
  accountStates,
  contractsReady,
  defaultMarket,
  demoConfig,
  getContractAddresses,
  marketById,
  markets,
  MONAD_TESTNET_CHAIN_ID,
  monadTestnet,
  parseMode,
  tierOptions,
  type PropmonMode
} from "../lib/config";
import {
  addressUrl,
  errorMessage,
  formatBps,
  formatNative,
  formatPrice,
  formatQuote,
  formatSignedQuote,
  parseQuoteInput,
  shortHash,
  txUrl
} from "../lib/format";

type LedgerRow = {
  key: string;
  marketId: bigint;
  sizeDelta: bigint;
  markPrice: bigint;
  equityAfter?: bigint;
  timestamp?: bigint;
  hash?: Hex;
};

type FundedEvent = {
  key: string;
  label: string;
  detail: string;
  hash?: Hex;
};

const sideOptions = [
  {label: "Long", value: 0},
  {label: "Short", value: 1}
] as const;

const demoFundedLabel = demoConfig.fundedDemo?.label ?? "DEMO FILL";

function Dashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const publicClient = usePublicClient();
  const {address, chainId, isConnected} = useAccount();
  const {switchChain, isPending: switchingChain} = useSwitchChain();
  const {data: blockNumber} = useBlockNumber({watch: true});
  const addresses = useMemo(() => getContractAddresses(), []);
  const ready = contractsReady(addresses);
  const [mode, setMode] = useState<PropmonMode>(() => parseMode(searchParams.get("mode")));
  const [selectedTier, setSelectedTier] = useState(0);
  const [accountIdInput, setAccountIdInput] = useState("");
  const [agentSigner, setAgentSigner] = useState("");
  const [selectedMarketId, setSelectedMarketId] = useState(defaultMarket.id);
  const [tradeSide, setTradeSide] = useState<0 | 1>(0);
  const [sizeDelta, setSizeDelta] = useState("250000");
  const [collateral, setCollateral] = useState("250");
  const [fundedSizeDelta, setFundedSizeDelta] = useState("250000");
  const [fundedCollateral, setFundedCollateral] = useState("250");
  const [lastHash, setLastHash] = useState<Hex>();
  const [lastAction, setLastAction] = useState("");
  const [actionError, setActionError] = useState("");
  const [demoStatus, setDemoStatus] = useState("");
  const [ledgerHashes, setLedgerHashes] = useState<LedgerRow[]>([]);
  const [fundedEvents, setFundedEvents] = useState<FundedEvent[]>([]);

  const accountId = accountIdInput.trim() ? BigInt(accountIdInput.trim()) : undefined;
  const selectedTierData = tierOptions[selectedTier] ?? tierOptions[0];
  const expectedFee = (selectedTierData.accountSize * 100n) / 10_000n;
  const onWrongChain = isConnected && chainId !== MONAD_TESTNET_CHAIN_ID;

  const {writeContractAsync, isPending: writePending} = useWriteContract();
  const {data: receipt, isLoading: receiptPending} = useWaitForTransactionReceipt({hash: lastHash});

  const registryAddress = ready ? addresses.accountRegistry : zeroAddress;
  const examinationAddress = ready ? addresses.examinationVault : zeroAddress;
  const fundedAddress = ready ? addresses.fundedVault : zeroAddress;
  const priceAddress = ready ? addresses.perplPriceAdapter : zeroAddress;

  const priceReads = useReadContracts({
    contracts: markets.map((market) => ({
      address: priceAddress,
      abi: priceAdapterAbi,
      functionName: "getPrice",
      args: [BigInt(market.id)]
    })),
    query: {enabled: ready, refetchInterval: 5000}
  });

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
    const nextMode = parseMode(searchParams.get("mode"));
    setMode(nextMode);
  }, [searchParams]);

  useEffect(() => {
    examAccount.refetch();
    examDrawdown.refetch();
    examEntries.refetch();
    ruleStatus.refetch();
    registryState.refetch();
    fundedAccount.refetch();
  }, [blockNumber]);

  useEffect(() => {
    if (!receipt || !ready) return;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({abi: examinationVaultAbi, data: log.data, topics: log.topics});
        if (decoded.eventName === "ExaminationPurchased") {
          setAccountIdInput(decoded.args.accountId.toString());
        }
      } catch {
        continue;
      }
    }
  }, [receipt, ready]);

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
    loadEvents().catch((error) => setActionError(errorMessage(error)));
    return () => {
      cancelled = true;
    };
  }, [publicClient, ready, accountId, blockNumber, examinationAddress, fundedAddress]);

  useWatchContractEvent({
    address: examinationAddress,
    abi: examinationVaultAbi,
    eventName: "EntryRecorded",
    enabled: ready,
    onLogs: () => examEntries.refetch()
  });

  function setUrlMode(nextMode: PropmonMode) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", nextMode);
    setMode(nextMode);
    router.replace(`${pathname}?${params.toString()}`, {scroll: false});
  }

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

  async function runDemoScript() {
    if (!accountId) {
      setDemoStatus("Enter or buy an account first.");
      return;
    }
    setDemoStatus("Triggering external Agent 06 demo script...");
    const response = await fetch("/api/demo-script", {
      method: "POST",
      headers: {"content-type": "application/json", "x-propmon-mode": mode},
      body: JSON.stringify({mode, accountId: accountId.toString()})
    });
    const body = await response.json().catch(() => ({}));
    setDemoStatus(response.ok ? "Demo script accepted by Agent 06." : body.error ?? "Demo script service unavailable.");
  }

  const prices = markets.map((market, index) => {
    const result = priceReads.data?.[index]?.result as readonly [bigint, number, bigint] | undefined;
    return {market, price: result?.[0], decimals: result?.[1], updatedAt: result?.[2]};
  });
  const activePrice = prices.find((item) => item.market.id === selectedMarketId);
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

  return (
    <main className="appShell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Monad Testnet</p>
          <h1>Propmon</h1>
        </div>
        <div className="topActions">
          <div className="modeToggle" aria-label="Mode toggle">
            <button className={mode === "demo" ? "active" : ""} onClick={() => setUrlMode("demo")}>DEMO</button>
            <button className={mode === "live" ? "active" : ""} onClick={() => setUrlMode("live")}>LIVE</button>
          </div>
          <ConnectButton chainStatus="name" accountStatus="address" showBalance={false} />
        </div>
      </header>

      {mode === "demo" && (
        <section className="banner">DEMO MODE - simulated prices & demo fills. Examination ledger is still real on-chain.</section>
      )}

      {onWrongChain && (
        <section className="notice">
          Connected to the wrong network. Switch to Monad Testnet before submitting transactions.
          <button onClick={() => switchChain({chainId: monadTestnet.id})} disabled={switchingChain}>
            {switchingChain ? "Switching..." : "Switch network"}
          </button>
        </section>
      )}

      {!ready && <DeploymentNotice />}

      <section className="marketStrip">
        {prices.map(({market, price, decimals, updatedAt}) => (
          <button
            key={market.id}
            className={market.id === selectedMarketId ? "marketPill active" : "marketPill"}
            onClick={() => setSelectedMarketId(market.id)}
          >
            <span>{market.symbol}</span>
            <strong>{formatPrice(price, decimals)}</strong>
            <small>{updatedAt ? `pushed ${new Date(Number(updatedAt) * 1000).toLocaleTimeString()}` : "no on-chain price"}</small>
          </button>
        ))}
      </section>

      <section className="grid two">
        <Panel title="Buy Examination" eyebrow="Entry">
          <div className="tierGrid">
            {tierOptions.map((tier, index) => (
              <button
                key={tier.label}
                className={selectedTier === index ? "tier active" : "tier"}
                onClick={() => setSelectedTier(index)}
              >
                <span>{tier.label}</span>
                <strong>{formatNative((tier.accountSize * 100n) / 10_000n)}</strong>
              </button>
            ))}
          </div>
          <button
            className="primary"
            disabled={!ready || !isConnected || onWrongChain || writePending}
            onClick={() =>
              submit("Buy examination", () =>
                writeContractAsync({
                  address: examinationAddress,
                  abi: examinationVaultAbi,
                  functionName: "buyExamination",
                  args: [selectedTierData.accountSize],
                  value: expectedFee
                })
              )
            }
          >
            Buy Examination
          </button>
          <p className="helper">Fee is 1%: {formatNative(expectedFee)} for {selectedTierData.label} paper balance.</p>
          <label className="field">
            <span>Account ID</span>
            <input inputMode="numeric" value={accountIdInput} onChange={(event) => setAccountIdInput(event.target.value.replace(/\D/g, ""))} placeholder="Auto-filled after buy or enter manually" />
          </label>
        </Panel>

        <Panel title="Account Status" eyebrow="State">
          <div className="metricRow">
            <Metric label="Registry state" value={stateLabel} />
            <Metric label="Rule result" value={passedFailed?.[1] ? "FAILED" : passedFailed?.[0] ? "PASSED" : "ACTIVE"} />
          </div>
          <div className="metricRow">
            <Metric label="Balance" value={formatQuote(exam?.startingBalance, true)} />
            <Metric label="Equity" value={formatQuote(exam?.equity, true)} />
          </div>
          {lastHash && (
            <p className="helper">
              {receiptPending ? `${lastAction} pending: ` : `${lastAction} confirmed: `}
              <a href={txUrl(lastHash)} target="_blank" rel="noreferrer">{shortHash(lastHash)}</a>
            </p>
          )}
          {actionError && <p className="errorText">{actionError}</p>}
        </Panel>
      </section>

      <section className="grid dashboardGrid">
        <Panel title="Live Drawdown Meter" eyebrow="Risk">
          <DrawdownMeter label="Daily" value={drawdown?.[0]} limit={500} />
          <DrawdownMeter label="Total" value={drawdown?.[1]} limit={1000} />
          <div className="ruleGrid">
            <Metric label="Open positions" value={exam?.openPositions?.toString() ?? "--"} />
            <Metric label="Collateral" value={formatQuote(exam?.committedCollateral)} />
            <Metric label="Realized P&L" value={formatSignedQuote(exam?.realizedPnl)} />
            <Metric label="Target" value={`${demoConfig.scriptedPass.profitTargetBps / 100}%`} />
          </div>
        </Panel>

        <Panel title="Trade Controls" eyebrow="On-chain paper ledger">
          <div className="tradeGrid">
            <label className="field">
              <span>Market</span>
              <select value={selectedMarketId} onChange={(event) => setSelectedMarketId(Number(event.target.value))}>
                {markets.map((market) => <option key={market.id} value={market.id}>{market.symbol}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Side</span>
              <select value={tradeSide} onChange={(event) => setTradeSide(Number(event.target.value) as 0 | 1)}>
                {sideOptions.map((side) => <option key={side.value} value={side.value}>{side.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Size delta</span>
              <input value={sizeDelta} onChange={(event) => setSizeDelta(event.target.value)} />
            </label>
            <label className="field">
              <span>Collateral (USD)</span>
              <input value={collateral} onChange={(event) => setCollateral(event.target.value)} />
            </label>
          </div>
          <button
            className="primary"
            disabled={!ready || !accountId || !isConnected || onWrongChain || writePending}
            onClick={() =>
              submit("Record entry", () =>
                writeContractAsync({
                  address: examinationAddress,
                  abi: examinationVaultAbi,
                  functionName: "recordEntry",
                  args: [
                    accountId ?? 0n,
                    BigInt(selectedMarketId),
                    tradeSide,
                    signedSizeDelta(sizeDelta, tradeSide),
                    parseQuoteInput(collateral)
                  ]
                })
              )
            }
          >
            Record Entry
          </button>
          <p className="helper">Selected mark: {formatPrice(activePrice?.price, activePrice?.decimals)} from the on-chain adapter.</p>
        </Panel>

        <Panel title="On-chain Ledger" eyebrow="Verify">
          <div className="ledger">
            {entries.length === 0 && <p className="helper">No examination entries recorded yet.</p>}
            {entries.slice().reverse().map((entry) => (
              <div className="ledgerRow" key={entry.key}>
                <div>
                  <strong>{marketById(entry.marketId)?.symbol ?? `Market ${entry.marketId}`}</strong>
                  <span>{entry.sizeDelta.toString()} units at {entry.markPrice.toString()}</span>
                </div>
                <div>
                  <span>{formatQuote(entry.equityAfter)}</span>
                  {entry.hash ? <a href={txUrl(entry.hash)} target="_blank" rel="noreferrer">{shortHash(entry.hash)}</a> : <small>tx indexing...</small>}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <section className="grid two">
        <Panel title="Connect an Agent" eyebrow="Authorized signer">
          <label className="field">
            <span>Agent signer address</span>
            <input value={agentSigner} onChange={(event) => setAgentSigner(event.target.value)} placeholder="0x..." />
          </label>
          <div className="buttonRow">
            <button
              className="secondary"
              disabled={!ready || !accountId || !isAddress(agentSigner) || writePending}
              onClick={() =>
                submit("Authorize signer", () =>
                  writeContractAsync({
                    address: registryAddress,
                    abi: accountRegistryAbi,
                    functionName: "authorizeSigner",
                    args: [accountId ?? 0n, agentSigner as Address]
                  })
                )
              }
            >
              Authorize
            </button>
            <button className="secondary" disabled={!isAddress(agentSigner)}>
              {authorizedSigner.data ? "Authorized" : "Not authorized"}
            </button>
          </div>
          <p className="helper">Manual wallet and agent signer submit the same vault functions.</p>
        </Panel>

        <Panel title="Run Demo Script" eyebrow="Agent 06">
          <button className="primary" disabled={mode !== "demo" || !accountId} onClick={runDemoScript}>Run demo script</button>
          <p className="helper">{demoStatus || "Calls the external Agent 06 service through the Next.js proxy."}</p>
          <ol className="scriptList">
            {demoConfig.scriptedPass.entries.map((entry) => (
              <li key={`${entry.step}-${entry.sizeDelta}`}>
                Step {entry.step}: {entry.side} {entry.sizeDelta} {entry.market}
              </li>
            ))}
          </ol>
        </Panel>
      </section>

      <section className="grid two">
        <Panel title="Funded Lifecycle" eyebrow={mode === "demo" ? demoFundedLabel : "Live intent + fallback"}>
          <div className="metricRow">
            <Metric label="Funded equity" value={formatQuote(funded?.equity, true)} />
            <Metric label="Pending orders" value={funded?.pendingOrders?.toString() ?? "--"} />
          </div>
          <div className="buttonRow">
            <button
              className="secondary"
              disabled={!ready || !accountId || stateLabel !== "PASSED" || writePending}
              onClick={() =>
                submit("Activate funded account", () =>
                  writeContractAsync({
                    address: fundedAddress,
                    abi: fundedVaultAbi,
                    functionName: "activate",
                    args: [accountId ?? 0n]
                  })
                )
              }
            >
              Activate Funded
            </button>
            <button
              className="secondary"
              disabled={!ready || !accountId || stateLabel !== "FUNDED" || writePending}
              onClick={() =>
                submit(mode === "live" ? "Open live intent" : demoFundedLabel, () =>
                  writeContractAsync({
                    address: fundedAddress,
                    abi: fundedVaultAbi,
                    functionName: mode === "live" ? "openPositionLive" : "openPositionDemo",
                    args: [
                      accountId ?? 0n,
                      BigInt(selectedMarketId),
                      tradeSide,
                      signedSizeDelta(fundedSizeDelta, tradeSide),
                      parseQuoteInput(fundedCollateral)
                    ]
                  })
                )
              }
            >
              {mode === "live" ? "Open Live Intent" : "Open Demo Fill"}
            </button>
          </div>
          <div className="tradeGrid compact">
            <label className="field">
              <span>Funded size</span>
              <input value={fundedSizeDelta} onChange={(event) => setFundedSizeDelta(event.target.value)} />
            </label>
            <label className="field">
              <span>Funded collateral</span>
              <input value={fundedCollateral} onChange={(event) => setFundedCollateral(event.target.value)} />
            </label>
          </div>
          <p className="helper">
            {mode === "live"
              ? "Live mode records an on-chain intent and waits for Agent 06 Perpl reconciliation. Use the demo fill fallback if whitelist access is unavailable."
              : "Demo fills settle synchronously on-chain against the adapter price."}
          </p>
        </Panel>

        <Panel title="Payout" eyebrow="Profit split">
          <div className="metricRow">
            <Metric label="Trader split" value={`${demoConfig.fundedDemo?.profitSplitBps.trader ?? 8000} bps`} />
            <Metric label="Firm split" value={`${demoConfig.fundedDemo?.profitSplitBps.protocol ?? 2000} bps`} />
          </div>
          <button
            className="primary"
            disabled={!ready || !accountId || !address || stateLabel !== "FUNDED" || writePending}
            onClick={() =>
              submit("Payout", () =>
                writeContractAsync({
                  address: fundedAddress,
                  abi: fundedVaultAbi,
                  functionName: "payout",
                  args: [accountId ?? 0n, address as Address]
                })
              )
            }
          >
            Close in Profit {"->"} Payout
          </button>
          <div className="timeline">
            {fundedEvents.length === 0 && <p className="helper">No funded events indexed yet.</p>}
            {fundedEvents.slice().reverse().map((event) => (
              <div className="timelineItem" key={event.key}>
                <strong>{event.label}</strong>
                <span>{event.detail}</span>
                {event.hash && <a href={txUrl(event.hash)} target="_blank" rel="noreferrer">{shortHash(event.hash)}</a>}
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <footer className="footer">
        <span>Explorer: <a href={addressUrl(examinationAddress)} target="_blank" rel="noreferrer">ExaminationVault</a></span>
        <span>Mode: {mode}</span>
      </footer>
    </main>
  );
}

function DeploymentNotice() {
  return (
    <section className="notice">
      Contract addresses are not configured yet. Fill `shared/deployments.json` or set the `NEXT_PUBLIC_*_ADDRESS`
      env vars; the dashboard will stay read-only until then.
    </section>
  );
}

function Panel({title, eyebrow, children}: {title: string; eyebrow: string; children: React.ReactNode}) {
  return (
    <section className="panel">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Metric({label, value}: {label: string; value: string}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DrawdownMeter({label, value, limit}: {label: string; value: bigint | undefined; limit: number}) {
  const numeric = Number(value ?? 0n);
  const pct = Math.min(100, Math.round((numeric / limit) * 100));
  const state = pct >= 100 ? "breach" : pct >= 70 ? "warning" : "safe";
  return (
    <div className={`meter ${state}`}>
      <div className="meterLabel">
        <strong>{label}</strong>
        <span>{formatBps(value)} / {formatBps(limit)}</span>
      </div>
      <div className="meterTrack"><div style={{width: `${pct}%`}} /></div>
    </div>
  );
}

function signedSizeDelta(value: string, side: 0 | 1): bigint {
  const clean = BigInt(value.trim() || "0");
  const abs = clean < 0n ? -clean : clean;
  return side === 0 ? abs : -abs;
}

export default function Page() {
  return (
    <Suspense fallback={<main className="appShell"><section className="panel">Loading Propmon...</section></main>}>
      <Dashboard />
    </Suspense>
  );
}
