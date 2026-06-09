"use client";

import {useAgentDemo, type AccountStateLabel} from "./AgentDemoProvider";
import {usePropmon} from "./PropmonProvider";

const steps: AccountStateLabel[] = ["NONE", "EXAMINATION", "PASSED", "FUNDED"];

export function DemoControls() {
  const {core} = usePropmon();
  const {effectiveStateLabel, isSimulated, simulateState, clearSimulatedState} = useAgentDemo();

  if (core.mode !== "demo") return null;

  return (
    <div className="demoControls">
      <span className="demoControlsTag">DEMO</span>
      <span className="demoControlsLabel">Simulate state</span>
      <div className="demoControlsBtns">
        {steps.map((label) => (
          <button
            key={label}
            className={effectiveStateLabel === label ? "demoStep active" : "demoStep"}
            onClick={() => simulateState(label)}
          >
            {label}
          </button>
        ))}
        {isSimulated && (
          <button className="demoStep clear" onClick={clearSimulatedState}>Use on-chain</button>
        )}
      </div>
      <span className="demoControlsNote">demo-only — does not change on-chain state</span>
    </div>
  );
}
