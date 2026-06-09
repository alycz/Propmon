"use client";

import {AccessGuard} from "../../components/AccessGuard";
import {AppShell} from "../../components/AppShell";
import {TradingSurface} from "../../components/TradingSurface";

export default function TerminalPage() {
  return (
    <AppShell>
      <AccessGuard href="/terminal">
        <TradingSurface surface="terminal" />
      </AccessGuard>
    </AppShell>
  );
}
