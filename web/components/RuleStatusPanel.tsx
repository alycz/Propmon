"use client";

import {demoConfig} from "../lib/config";
import {Panel} from "./ui";
import {usePropmon} from "./PropmonProvider";

const stateMachine = ["NONE", "EXAMINATION", "PASSED", "FUNDED", "PAYOUT"];

export function RuleStatusPanel() {
  const {account} = usePropmon();
  const {passedFailed, stateLabel} = account;
  const passed = Boolean(passedFailed?.[0]);
  const failed = Boolean(passedFailed?.[1]);

  return (
    <Panel title="Rules" eyebrow="Pass / fail conditions">
      <div className="ruleList">
        <RuleRow
          name="Profit target"
          detail={`Reach +${demoConfig.scriptedPass.profitTargetBps / 100}% equity to pass.`}
          status={passed ? "met" : failed ? "failed" : "active"}
        />
        <RuleRow
          name="Drawdown limit"
          detail="Stay within the daily (5%) and total (10%) drawdown caps. Breaching either fails the exam."
          status={failed ? "failed" : "active"}
        />
      </div>

      <div className="stateMachine">
        {stateMachine.map((step, index) => {
          const active = step === stateLabel;
          const cleared = stateMachine.indexOf(stateLabel) > index;
          return (
            <div key={step} className={`stateStep ${active ? "active" : cleared ? "cleared" : ""}`}>
              <span className="stateDot" />
              <span>{step}</span>
            </div>
          );
        })}
      </div>
      <p className="helper">
        Pass when the profit target is met within the drawdown rules → state advances to PASSED, then FUNDED on activation. Breach a drawdown cap and the exam resolves to FAILED.
      </p>
    </Panel>
  );
}

function RuleRow({name, detail, status}: {name: string; detail: string; status: "met" | "failed" | "active"}) {
  const label = status === "met" ? "Met" : status === "failed" ? "Failed" : "Active";
  const accent = status === "met" ? "pos" : status === "failed" ? "neg" : "warn";
  return (
    <div className="ruleRow">
      <div>
        <strong>{name}</strong>
        <p className="helper">{detail}</p>
      </div>
      <span className={`pill ${accent === "pos" ? "pos" : "muted"} accent-${accent}`}>{label}</span>
    </div>
  );
}
