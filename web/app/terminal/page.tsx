"use client";

import {AppShell} from "../../components/AppShell";
import {TradingSurface} from "../../components/TradingSurface";

export default function TerminalPage() {
  return (
    <AppShell>
      <TradingSurface surface="terminal" />
    </AppShell>
  );
}
