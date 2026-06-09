export {loadAgentConfig, resolveAgentMode, resolveAgentSignerMode} from "./config.js";
export {PerplWhitelistError, connectPerpl} from "./perpl-auth.js";
export {buildAuthSignInMessage, buildOrderRequestMessage, parseFillMessage} from "./perpl-ws.js";
export {nextRq, seedRqFromLfr} from "./rq.js";
export {decideNextTrade, fundedExecutionRoute, selectVaultPath} from "./strategy.js";
export {runAgentLoop, runAgentOnce} from "./loop.js";
export {runDemoScript} from "./demo-runner.js";
export {handleFillMessage, startLiveIntentWatcher} from "./live.js";
export {buildPrivyTransactionInput, createAgentSigner} from "./signer.js";
export type {AgentConfig, AgentSignerMode, FundedExecutionRoute, TradeDecision, VaultPath} from "./types.js";
export type {AgentSigner, AgentSignerTransaction} from "./signer.js";

import {loadAgentConfig} from "./config.js";
import {runAgentLoop} from "./loop.js";
import {startLiveIntentWatcher} from "./live.js";

async function main(): Promise<void> {
  const config = loadAgentConfig();
  console.log(`Propmon Agent 06 starting in ${config.mode} mode for account ${config.accountId}`);

  if (config.mode === "live") {
    await startLiveIntentWatcher(config);
  }
  await runAgentLoop(config);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
