"use client";

import {type ReactNode} from "react";

import {errorMessage} from "../lib/format";
import {ModeToggle} from "./ModeToggle";
import {usePropmon} from "./PropmonProvider";
import {StatusStrip} from "./StatusStrip";
import {TopNav} from "./TopNav";
import {WalletPill} from "./WalletPill";

type Props = {
  children: ReactNode;
  statusStrip?: boolean;
};

export function AppShell({children, statusStrip = true}: Props) {
  const {core, actions} = usePropmon();
  const {mode, ready, onWrongChain, switchingChain, setSwitchingChain, ensureMonadTestnet} = core;

  return (
    <main className="appShell">
      <header className="topbar">
        <div className="brand">
          <p className="eyebrow">Monad Testnet</p>
          <h1>Propmon</h1>
        </div>
        <TopNav />
        <div className="topActions">
          <ModeToggle />
          <WalletPill />
        </div>
      </header>

      {mode === "demo" && (
        <section className="banner">
          DEMO MODE — simulated prices &amp; demo fills. The examination ledger is still real on-chain.
        </section>
      )}

      {onWrongChain && (
        <section className="notice">
          Connected to the wrong network. Switch to Monad Testnet before submitting transactions.
          <button
            onClick={() => {
              setSwitchingChain(true);
              ensureMonadTestnet()
                .catch((error) => actions.setActionError(errorMessage(error)))
                .finally(() => setSwitchingChain(false));
            }}
            disabled={switchingChain}
          >
            {switchingChain ? "Switching..." : "Switch network"}
          </button>
        </section>
      )}

      {!ready && (
        <section className="notice">
          Contract addresses are not configured yet. Fill <code>shared/deployments.json</code> or set the{" "}
          <code>NEXT_PUBLIC_*_ADDRESS</code> env vars; the app stays read-only until then.
        </section>
      )}

      {statusStrip && <StatusStrip />}

      {children}
    </main>
  );
}
