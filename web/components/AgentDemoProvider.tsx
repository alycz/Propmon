"use client";

import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode} from "react";

import {accountStates} from "../lib/config";
import {usePropmon} from "./PropmonProvider";

export type AccountStateLabel = (typeof accountStates)[number];

export type MarketMakingState = {
  active: boolean;
  spreadBps: number;
  tick: number;
  quotesPlaced: number;
  fills: number;
  pnl: number;
};

const IDLE_MM: MarketMakingState = {active: false, spreadBps: 8, tick: 0, quotesPlaced: 0, fills: 0, pnl: 0};
const TICK_MS = 1200;

function useAgentDemoValue() {
  const {core, account} = usePropmon();
  const demoMode = core.mode === "demo";

  // ---- Demo gating override (demo mode only; never touches on-chain reads) ----
  const [demoOverride, setDemoOverride] = useState<AccountStateLabel | null>(null);
  const effectiveStateLabel: AccountStateLabel =
    demoMode && demoOverride ? demoOverride : (account.stateLabel as AccountStateLabel);
  const effectiveStateIndex = Math.max(0, accountStates.indexOf(effectiveStateLabel));

  const simulateState = useCallback((label: AccountStateLabel) => setDemoOverride(label), []);
  const clearSimulatedState = useCallback(() => setDemoOverride(null), []);

  // ---- Simulated market-making animation state ----
  const [mm, setMm] = useState<MarketMakingState>(IDLE_MM);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    setMm((prev) => (prev.active ? {...prev, active: false} : prev));
  }, []);

  const startMarketMaking = useCallback((spreadBps = 8) => {
    if (timer.current) clearInterval(timer.current);
    setMm({active: true, spreadBps, tick: 0, quotesPlaced: 0, fills: 0, pnl: 0});
    timer.current = setInterval(() => {
      setMm((prev) => {
        if (!prev.active) return prev;
        const tick = prev.tick + 1;
        // Deterministic, modest upward PnL — stays well within examination rules.
        const pnl = prev.pnl + 0.8 + (tick % 3) * 0.35;
        return {
          ...prev,
          tick,
          quotesPlaced: prev.quotesPlaced + 2,
          fills: prev.fills + 1,
          pnl
        };
      });
    }, TICK_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  // Stop the animation if the user leaves demo mode.
  useEffect(() => {
    if (!demoMode) stop();
  }, [demoMode, stop]);

  return useMemo(
    () => ({
      demoMode,
      effectiveStateLabel,
      effectiveStateIndex,
      realStateLabel: account.stateLabel as AccountStateLabel,
      isSimulated: demoMode && demoOverride != null,
      simulateState,
      clearSimulatedState,
      mm,
      startMarketMaking,
      stop
    }),
    [demoMode, effectiveStateLabel, effectiveStateIndex, account.stateLabel, demoOverride, simulateState, clearSimulatedState, mm, startMarketMaking, stop]
  );
}

export type AgentDemoValue = ReturnType<typeof useAgentDemoValue>;

const AgentDemoContext = createContext<AgentDemoValue | null>(null);

export function AgentDemoProvider({children}: {children: ReactNode}) {
  const value = useAgentDemoValue();
  return <AgentDemoContext.Provider value={value}>{children}</AgentDemoContext.Provider>;
}

export function useAgentDemo(): AgentDemoValue {
  const value = useContext(AgentDemoContext);
  if (!value) {
    throw new Error("useAgentDemo must be used within an AgentDemoProvider");
  }
  return value;
}
