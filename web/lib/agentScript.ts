export type ChatRole = "user" | "agent";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  mono?: boolean;
};

export type AgentStrategy = {
  name: string;
  rows: {label: string; value: string}[];
  risk: string;
};

// The scripted strategy the demo agent "designs". Deterministic, honest about
// respecting the examination rule limits.
export const DEMO_STRATEGY: AgentStrategy = {
  name: "MON-USD Adaptive Market Maker",
  rows: [
    {label: "Base spread", value: "8 bps (widens with volatility)"},
    {label: "Quote sizing", value: "inventory-aware skew"},
    {label: "Inventory cap", value: "±40,000 MON"},
    {label: "Max position", value: "250,000 MON notional"},
    {label: "Refresh interval", value: "1.2s two-sided"}
  ],
  risk: "Respects the examination rule limits — daily/total drawdown caps and max concentration."
};

// Scripted lines, keyed by step so the panel state machine can render them.
export const AGENT_LINES = {
  userAsk: "Build me a market-making strategy for MON-USD.",
  agentThinking:
    "On it. Designing a two-sided quoting strategy around the mark price with inventory-aware skew…",
  agentDeployed: "Strategy deployed. Quoting both sides now.",
  agentDeclined: "No problem — tell me what to change and I'll redesign it.",
  agentPrompt: "Accept this strategy to deploy it to the demo terminal?"
} as const;
