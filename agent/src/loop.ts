import {assertAuthorizedSigner, getAccountState, submitExaminationEntry, submitFundedDemo, submitFundedLiveIntent} from "./chain.js";
import {PerplWhitelistError} from "./perpl-auth.js";
import {decideNextTrade, selectVaultPath} from "./strategy.js";
import type {AgentConfig} from "./types.js";

export async function runAgentLoop(config: AgentConfig): Promise<void> {
  const signer = await assertAuthorizedSigner(config);
  console.log(`Agent signer authorized: ${signer}`);

  let executedDemoSteps = 0;
  while (true) {
    executedDemoSteps = await runAgentOnce(config, executedDemoSteps);
    await sleep(config.pollIntervalMs);
  }
}

export async function runAgentOnce(config: AgentConfig, executedDemoSteps = 0): Promise<number> {
  const state = await getAccountState(config);
  const decision = decideNextTrade({
    mode: config.mode,
    demoConfig: config.demoConfig,
    markets: config.markets,
    executedDemoSteps,
    defaultMarketSymbol: config.marketSymbol
  });
  if (!decision) {
    console.log("No agent trade decision available for this tick");
    return executedDemoSteps;
  }

  const path = selectVaultPath({state, mode: config.mode, whitelisted: config.mode === "live"});
  try {
    if (path === "examination-entry") {
      const hash = await submitExaminationEntry(config, decision);
      console.log(`Submitted examination entry tx=${hash}`);
      return decision.source === "scripted-demo" ? executedDemoSteps + 1 : executedDemoSteps;
    }
    if (path === "funded-demo") {
      const hash = await submitFundedDemo(config, decision);
      console.log(`Submitted funded demo fill tx=${hash}`);
      return decision.source === "scripted-demo" ? executedDemoSteps + 1 : executedDemoSteps;
    }
    if (path === "funded-live") {
      const hash = await submitFundedLiveIntent(config, decision);
      console.log(`Submitted funded live intent tx=${hash}`);
      return executedDemoSteps;
    }
    console.log(`Account is not tradeable in state=${state}`);
    return executedDemoSteps;
  } catch (error) {
    if (error instanceof PerplWhitelistError) {
      console.error(error.message);
      return executedDemoSteps;
    }
    console.error("Agent trade skipped after contract/client rejection", error);
    return executedDemoSteps;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
