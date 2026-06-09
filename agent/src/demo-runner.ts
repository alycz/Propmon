import {encodeFunctionData, type Hex} from "viem";

import {examinationVaultAbi} from "./abi.js";
import {createPublicClientForConfig, getAccountState, submitExaminationEntryWithSigner, submitFundedDemoWithSigner} from "./chain.js";
import {createAgentSigner} from "./signer.js";
import {decideNextTrade} from "./strategy.js";
import {AccountState, type AgentConfig, type TradeDecision} from "./types.js";

export type DemoRunnerResult = {
  ok: boolean;
  mode: "demo";
  accountId: string;
  signer: string;
  stateBefore: string;
  stateAfter: string;
  examinationTxs: Hex[];
  fundedTxs: Hex[];
  message: string;
};

export type DemoRunnerOptions = {
  beforeStep?: (step: number) => Promise<void>;
};

export async function runDemoScript(config: AgentConfig, options: DemoRunnerOptions = {}): Promise<DemoRunnerResult> {
  if (config.mode !== "demo") {
    throw new Error("runDemoScript only supports PROPMON_MODE=demo");
  }

  const signer = createAgentSigner(config);
  const signerAddress = await signer.getAddress();
  const publicClient = createPublicClientForConfig(config);
  const authorized = await publicClient.readContract({
    address: config.deployments.accountRegistry,
    abi: (await import("./abi.js")).accountRegistryAbi,
    functionName: "isAuthorizedSigner",
    args: [config.accountId, signerAddress]
  });
  if (!authorized) {
    throw new Error(`Agent signer ${signerAddress} is not authorized for account ${config.accountId}`);
  }

  const stateBefore = await getAccountState(config);
  const examinationTxs: Hex[] = [];
  const fundedTxs: Hex[] = [];
  let executedDemoSteps = 0;

  if (stateBefore === AccountState.EXAMINATION) {
    for (const step of scriptedDecisions(config)) {
      await options.beforeStep?.(step.demoStep);
      const hash = await submitExaminationEntryWithSigner(signer, config, step.decision);
      await publicClient.waitForTransactionReceipt({hash});
      examinationTxs.push(hash);
      executedDemoSteps += 1;

      const state = await getAccountState(config);
      if (state !== AccountState.EXAMINATION) break;
    }

    const postEntriesState = await getAccountState(config);
    if (postEntriesState === AccountState.EXAMINATION) {
      const hash = await signer.sendTransaction({
        to: config.deployments.examinationVault,
        data: encodeFunctionData({
          abi: examinationVaultAbi,
          functionName: "resolve",
          args: [config.accountId]
        })
      });
      await publicClient.waitForTransactionReceipt({hash});
      examinationTxs.push(hash);
    }
  }

  const stateAfterExam = await getAccountState(config);
  if (stateAfterExam === AccountState.FUNDED) {
    const decision = firstFundedDecision(config);
    if (decision) {
      const openHash = await submitFundedDemoWithSigner(signer, config, decision);
      await publicClient.waitForTransactionReceipt({hash: openHash});
      fundedTxs.push(openHash);
    }
  }

  const stateAfter = await getAccountState(config);
  return {
    ok: stateAfter === AccountState.PASSED || stateAfter === AccountState.FUNDED || stateAfter === AccountState.PAYOUT,
    mode: "demo",
    accountId: config.accountId.toString(),
    signer: signerAddress,
    stateBefore: AccountState[stateBefore],
    stateAfter: AccountState[stateAfter],
    examinationTxs,
    fundedTxs,
    message: `Executed ${executedDemoSteps} scripted examination step(s).`
  };
}

function scriptedDecisions(config: AgentConfig): Array<{demoStep: number; decision: TradeDecision}> {
  const decisions: Array<{demoStep: number; decision: TradeDecision}> = [];
  const entries = config.demoConfig.scriptedPass.entries.slice().sort((left, right) => left.step - right.step);
  for (let executedDemoSteps = 0; executedDemoSteps < entries.length; executedDemoSteps++) {
    const decision = decideNextTrade({
      mode: "demo",
      demoConfig: config.demoConfig,
      markets: config.markets,
      executedDemoSteps,
      defaultMarketSymbol: config.marketSymbol
    });
    if (decision) decisions.push({demoStep: entries[executedDemoSteps].step, decision});
  }
  return decisions;
}

function firstFundedDecision(config: AgentConfig): TradeDecision | undefined {
  return decideNextTrade({
    mode: "demo",
    demoConfig: config.demoConfig,
    markets: config.markets,
    executedDemoSteps: 0,
    defaultMarketSymbol: config.marketSymbol
  });
}
