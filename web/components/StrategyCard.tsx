"use client";

import {AGENT_LINES, type AgentStrategy} from "../lib/agentScript";

type Props = {
  strategy: AgentStrategy;
  onAccept: () => void;
  onDecline: () => void;
  decided: boolean;
};

export function StrategyCard({strategy, onAccept, onDecline, decided}: Props) {
  return (
    <div className="strategyCard">
      <div className="strategyHead">
        <span className="strategyName">{strategy.name}</span>
        <span className="strategyTag">STRATEGY</span>
      </div>
      <dl className="strategyRows">
        {strategy.rows.map((row) => (
          <div className="strategyRow" key={row.label}>
            <dt>{row.label}</dt>
            <dd className="mono">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="strategyPrompt">{AGENT_LINES.agentPrompt}</p>
      {!decided && (
        <div className="strategyActions">
          <button className="primary" onClick={onAccept}>Accept Strategy</button>
          <button className="secondary" onClick={onDecline}>Decline</button>
        </div>
      )}
    </div>
  );
}
