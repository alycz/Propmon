"use client";

import {useEffect, useRef, useState} from "react";

import {AGENT_LINES, DEMO_STRATEGY} from "../lib/agentScript";
import {formatQuote} from "../lib/format";
import {useAgentDemo} from "./AgentDemoProvider";
import {usePropmon} from "./PropmonProvider";
import {StrategyCard} from "./StrategyCard";
import type {SurfaceKind} from "./TradingSurface";

type Phase = "idle" | "thinking" | "presented" | "deployed" | "declined";
type Message = {id: number; role: "user" | "agent"; kind: "text" | "strategy"; text?: string};

const THINK_MS = 1600;

export function AgentChatPanel({surface}: {surface: SurfaceKind}) {
  const {core} = usePropmon();
  const {mm, startMarketMaking, stop} = useAgentDemo();
  const isDemo = core.mode === "demo";

  const [phase, setPhase] = useState<Phase>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const idRef = useRef(0);
  const thinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const nextId = () => (idRef.current += 1);
  const push = (msg: Omit<Message, "id">) => setMessages((prev) => [...prev, {...msg, id: nextId()}]);

  useEffect(() => {
    threadRef.current?.scrollTo({top: threadRef.current.scrollHeight, behavior: "smooth"});
  }, [messages, phase]);

  useEffect(() => {
    return () => {
      if (thinkTimer.current) clearTimeout(thinkTimer.current);
    };
  }, []);

  function runDemo() {
    setMessages([]);
    push({role: "user", kind: "text", text: AGENT_LINES.userAsk});
    push({role: "agent", kind: "text", text: AGENT_LINES.agentThinking});
    setPhase("thinking");
    if (thinkTimer.current) clearTimeout(thinkTimer.current);
    thinkTimer.current = setTimeout(() => {
      push({role: "agent", kind: "strategy"});
      setPhase("presented");
    }, THINK_MS);
  }

  function accept() {
    push({role: "agent", kind: "text", text: AGENT_LINES.agentDeployed});
    setPhase("deployed");
    startMarketMaking(8);
  }

  function decline() {
    push({role: "agent", kind: "text", text: AGENT_LINES.agentDeclined});
    setPhase("declined");
    stop();
  }

  const deployed = phase === "deployed";
  const pill = deployed ? "Agent active — market making (demo)" : "Demo agent connected";

  return (
    <div className="agentChat">
      <div className="agentChatHead">
        <div className="agentChatTitle">
          <strong>Agentic Trading</strong>
          <span className="agentChatSub">connect your agent</span>
        </div>
        <span className={`agentPill ${deployed ? "live" : ""}`}>
          <span className="agentPillDot" />
          {pill}
        </span>
      </div>

      <div className="agentThread" ref={threadRef}>
        {messages.length === 0 && (
          <p className="agentEmpty">
            {isDemo
              ? "Scripted demo: ask the agent to build a strategy, review it, and deploy it to the chart."
              : "Connect an agent service to chat live."}
          </p>
        )}
        {messages.map((msg) =>
          msg.kind === "strategy" ? (
            <div className="bubble agent strategyBubble" key={msg.id}>
              <StrategyCard strategy={DEMO_STRATEGY} onAccept={accept} onDecline={decline} decided={phase !== "presented"} />
            </div>
          ) : (
            <div className={`bubble ${msg.role}`} key={msg.id}>
              {msg.text}
            </div>
          )
        )}
        {phase === "thinking" && (
          <div className="bubble agent thinking">
            <span className="shimmer">Compiling strategy</span>
            <span className="dots"><i /><i /><i /></span>
          </div>
        )}
      </div>

      {deployed && (
        <div className="agentActivity">
          <div className="agentStat">
            <span>Quotes</span>
            <strong className="mono">{mm.quotesPlaced}</strong>
          </div>
          <div className="agentStat">
            <span>Fills</span>
            <strong className="mono">{mm.fills}</strong>
          </div>
          <div className="agentStat">
            <span>Sim. PnL</span>
            <strong className="mono accent-pos">+{formatQuote(mm.pnl)}</strong>
          </div>
        </div>
      )}

      {isDemo ? (
        <div className="agentControls">
          {(phase === "idle" || phase === "declined") && (
            <button className="primary" onClick={runDemo}>Run agent demo</button>
          )}
          {deployed && (
            <button className="secondary full" onClick={() => { stop(); setPhase("idle"); setMessages([]); }}>
              Reset demo
            </button>
          )}
          <input className="agentInput" disabled placeholder="Demo mode — scripted walkthrough. Live chat soon." />
        </div>
      ) : (
        <div className="agentControls">
          <p className="agentLiveNote">
            Live agent chat requires a connected agent service (NEXT_PUBLIC_AGENT_API_URL). Demo mode shows a scripted walkthrough.
          </p>
          <input className="agentInput" disabled placeholder="Connect an agent service to chat live." />
        </div>
      )}
    </div>
  );
}
