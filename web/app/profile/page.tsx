"use client";

import Link from "next/link";
import {isAddress} from "viem";

import {marketById, MONAD_TESTNET_CHAIN_ID} from "../../lib/config";
import {addressUrl, formatBps, formatQuote, formatSignedQuote, shortHash} from "../../lib/format";
import {AppShell} from "../../components/AppShell";
import {usePropmon} from "../../components/PropmonProvider";
import {Metric, Panel} from "../../components/ui";

export default function ProfilePage() {
  const {core, agent, account, events} = usePropmon();
  const {address, chainId, onWrongChain, accountIdInput, selectedMarketId, mode, addresses} = core;
  const {agentSigner} = agent;
  const {exam, funded, drawdown, stateLabel, stateIndex, passedFailed, entries, authorizedSigner} = account;

  const params = new URLSearchParams();
  params.set("mode", mode);
  if (accountIdInput) params.set("account", accountIdInput);
  const query = params.toString();
  const selectedSymbol = marketById(selectedMarketId)?.symbol ?? "--";
  const ruleResult = passedFailed?.[1] ? "FAILED" : passedFailed?.[0] ? "PASSED" : "ACTIVE";

  return (
    <AppShell statusStrip={false}>
      <section className="grid two">
        <Panel title="Wallet" eyebrow="Identity">
          <div className="metricRow">
            <Metric label="Address" value={address ? shortHash(address) : "Not connected"} />
            <Metric label="Connected" value={core.isConnected ? "Yes" : "No"} accent={core.isConnected ? "pos" : undefined} />
          </div>
          <div className="metricRow">
            <Metric label="Chain" value={chainId ? String(chainId) : "--"} accent={onWrongChain ? "neg" : "pos"} />
            <Metric label="Expected" value={String(MONAD_TESTNET_CHAIN_ID)} />
          </div>
          {address && (
            <p className="helper">
              Explorer: <a href={addressUrl(address)} target="_blank" rel="noreferrer">{shortHash(address)}</a>
            </p>
          )}
        </Panel>

        <Panel title="Propmon Account" eyebrow="Plan = challenge tier">
          <div className="metricRow">
            <Metric label="Account ID" value={accountIdInput ? `#${accountIdInput}` : "—"} />
            <Metric label="State" value={stateLabel} accent={stateLabel === "FAILED" ? "neg" : stateIndex >= 2 ? "pos" : undefined} />
          </div>
          <div className="metricRow">
            <Metric label="Challenge tier" value={formatQuote(exam?.startingBalance, true)} />
            <Metric label="Selected market" value={selectedSymbol} />
          </div>
          <p className="helper">&quot;Plan&quot; is the funded challenge tier / account size, not a subscription.</p>
        </Panel>
      </section>

      <section className="grid two">
        <Panel title="Examination Status" eyebrow="Challenge">
          <div className="metricRow">
            <Metric label="Equity" value={formatQuote(exam?.equity, true)} />
            <Metric label="Realized P&L" value={formatSignedQuote(exam?.realizedPnl)} />
          </div>
          <div className="metricRow">
            <Metric label="Total drawdown" value={formatBps(drawdown?.[1])} />
            <Metric label="Rule result" value={ruleResult} accent={ruleResult === "FAILED" ? "neg" : ruleResult === "PASSED" ? "pos" : undefined} />
          </div>
          <Metric label="Entries recorded" value={String(entries.length)} />
        </Panel>

        <Panel title="Permissions" eyebrow="Signers &amp; contracts">
          <div className="agentSignerBox">
            <span>Agent signer</span>
            {isAddress(agentSigner) ? (
              <a href={addressUrl(agentSigner)} target="_blank" rel="noreferrer">{shortHash(agentSigner)}</a>
            ) : (
              <strong>Unavailable</strong>
            )}
            <small>{authorizedSigner.data ? "Authorized for this account" : "Not authorized"}</small>
          </div>
          <div className="linkList">
            <ContractLink label="AccountRegistry" address={addresses.accountRegistry} />
            <ContractLink label="ExaminationVault" address={addresses.examinationVault} />
            <ContractLink label="FundedVault" address={addresses.fundedVault} />
            <ContractLink label="PerplPriceAdapter" address={addresses.perplPriceAdapter} />
          </div>
        </Panel>
      </section>

      {stateIndex >= 3 && (
        <section className="grid two">
          <Panel title="Funded Status" eyebrow="Live &amp; demo">
            <div className="metricRow">
              <Metric label="Funded equity" value={formatQuote(funded?.equity, true)} />
              <Metric label="Pending orders" value={funded?.pendingOrders?.toString() ?? "--"} />
            </div>
            <div className="metricRow">
              <Metric label="Open positions" value={funded?.openPositions?.toString() ?? "--"} />
              <Metric label="Reserved collateral" value={formatQuote(funded?.reservedCollateral)} />
            </div>
          </Panel>

          <Panel title="Funded Events" eyebrow="Intents, fills, payouts">
            <div className="timeline">
              {events.fundedEvents.length === 0 && <p className="helper">No funded events indexed yet.</p>}
              {events.fundedEvents.slice().reverse().map((event) => (
                <div className="timelineItem" key={event.key}>
                  <strong>{event.label}</strong>
                  <span>{event.detail}</span>
                </div>
              ))}
            </div>
          </Panel>
        </section>
      )}

      <section className="grid two">
        <Panel title="Quick Links" eyebrow="Navigate">
          <div className="linkList">
            <Link className="topnavLink" href={`/terminal?${query}`}>Open Terminal</Link>
            <Link className="topnavLink" href={`/examination?${query}`}>Open Examination</Link>
          </div>
        </Panel>
      </section>
    </AppShell>
  );
}

function ContractLink({label, address}: {label: string; address?: string}) {
  if (!address) return <div className="linkRow"><span>{label}</span><small>not configured</small></div>;
  return (
    <div className="linkRow">
      <span>{label}</span>
      <a href={addressUrl(address)} target="_blank" rel="noreferrer">{shortHash(address)}</a>
    </div>
  );
}
