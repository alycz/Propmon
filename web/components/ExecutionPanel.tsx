"use client";

import {useState} from "react";

import {AgentChatPanel} from "./AgentChatPanel";
import {useAgentDemo} from "./AgentDemoProvider";
import {TradeTicket} from "./TradeTicket";
import type {SurfaceKind} from "./TradingSurface";

type ExecMode = "human" | "agentic";

export function ExecutionPanel({surface}: {surface: SurfaceKind}) {
  const [execMode, setExecMode] = useState<ExecMode>("human");
  const {stop} = useAgentDemo();

  function changeMode(next: ExecMode) {
    if (next === "human") stop();
    setExecMode(next);
  }

  return (
    <div className="execPanel">
      <div className="execHead">
        <span className="execLabel">Execution</span>
        <select className="execSelect" value={execMode} onChange={(event) => changeMode(event.target.value as ExecMode)}>
          <option value="human">Human</option>
          <option value="agentic">Agentic</option>
        </select>
      </div>
      {execMode === "human" ? <TradeTicket /> : <AgentChatPanel surface={surface} />}
    </div>
  );
}
