"use client";

import {type ReactNode} from "react";

type Props = {
  market: ReactNode;
  chart: ReactNode;
  book: ReactNode;
  ticket: ReactNode;
  ledger: ReactNode;
  events: ReactNode;
};

export function TerminalShell({market, chart, book, ticket, ledger, events}: Props) {
  return (
    <div className="terminal">
      <div className="terminalTop">
        <div className="terminalCell terminalMarket">{market}</div>
        <div className="terminalCell terminalChart">{chart}</div>
        <div className="terminalCell terminalBook">{book}</div>
        <div className="terminalCell terminalTicket">{ticket}</div>
      </div>
      <div className="terminalBottom">
        {ledger}
        {events}
      </div>
    </div>
  );
}
