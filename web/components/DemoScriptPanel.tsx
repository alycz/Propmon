"use client";

import {demoConfig} from "../lib/config";
import {useAgentDemo} from "./AgentDemoProvider";
import {Panel} from "./ui";
import {usePropmon} from "./PropmonProvider";

export function DemoScriptPanel() {
  const {core, demo} = usePropmon();
  const {mode, accountId} = core;
  const {runDemoScript, demoStatus} = demo;
  const {simulateState} = useAgentDemo();

  async function run() {
    await runDemoScript();
    // Optimistically reflect the scripted pass so the Terminal unlock shows live
    // on stage even if the on-chain read lags. Demo-only; never touches chain state.
    if (mode === "demo") simulateState("PASSED");
  }

  return (
    <Panel title="Demo Script" eyebrow="Agent 06 — deterministic challenge path">
      <button className="primary" disabled={mode !== "demo" || !accountId} onClick={run}>
        Run demo script
      </button>
      <p className="helper">{demoStatus || "Calls the external Agent 06 service through the Next.js proxy."}</p>
      <p className="helper">
        Demo mode only changes the <strong>price source</strong>, the <strong>pass timing</strong>, and the <strong>funded demo-fill path</strong>. The examination ledger remains real on-chain.
      </p>
      <ol className="scriptList">
        {demoConfig.scriptedPass.entries.map((entry) => (
          <li key={`${entry.step}-${entry.sizeDelta}`}>
            Step {entry.step}: {entry.side} {entry.sizeDelta} {entry.market}
          </li>
        ))}
      </ol>
    </Panel>
  );
}
