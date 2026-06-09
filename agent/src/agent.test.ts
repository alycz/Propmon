import assert from "node:assert/strict";
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";

import type {Hex} from "viem";

import {loadAgentConfig, resolveAgentMode} from "./config.js";
import {connectPerpl, PerplWhitelistError} from "./perpl-auth.js";
import {buildAuthSignInMessage, buildOrderRequestMessage, PerplOrderAction} from "./perpl-ws.js";
import {orderActionFromVaultIntent} from "./chain.js";
import {handleFillMessage} from "./live.js";
import {nextRq, seedRqFromLfr} from "./rq.js";
import {decideNextTrade, fundedExecutionRoute, selectVaultPath} from "./strategy.js";
import {AccountState, type DemoConfig, type MarketConfig, VaultSide} from "./types.js";

const privateKey = `0x${"1".repeat(64)}` as Hex;
const address = "0x0000000000000000000000000000000000000001";

const markets: MarketConfig[] = [
  {symbol: "MON", id: 64, priceDecimals: 5, sizeDecimals: 0, initialMargin: 300},
  {symbol: "BTC", id: 16, priceDecimals: 1, sizeDecimals: 5, initialMargin: 1000}
];

const demoConfig: DemoConfig = {
  mode: "demo",
  seed: "test-seed",
  scriptedPass: {
    accountSize: "10000000000",
    profitTargetBps: 1000,
    entries: [
      {market: "MON", side: "LONG", sizeDelta: "250000", collateral: "250000000", step: 1},
      {market: "MON", side: "SHORT", sizeDelta: "-250000", collateral: "0", step: 2}
    ]
  }
};

test("resolveAgentMode defaults to demo", () => {
  assert.equal(resolveAgentMode(undefined), "demo");
  assert.equal(resolveAgentMode("invalid"), "demo");
  assert.equal(resolveAgentMode("live"), "live");
});

test("loadAgentConfig reads shared files and env overrides", () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-config-"));
  try {
    const addressBookPath = join(dir, "addresses.json");
    const deploymentsPath = join(dir, "deployments.json");
    const demoConfigPath = join(dir, "demo-config.json");
    writeFileSync(addressBookPath, JSON.stringify({
      chainId: 10143,
      rpcUrl: "https://rpc.example",
      perpl: {
        restUrl: "https://perpl.example/api",
        wsUrl: "wss://perpl.example",
        tradingWsPath: "/ws/v1/trading",
        markets: {
          MON: {id: 64, priceDecimals: 5, sizeDecimals: 0, initialMargin: 300}
        }
      }
    }));
    writeFileSync(deploymentsPath, JSON.stringify({
      accountRegistry: address,
      examinationVault: address,
      fundedVault: address,
      perplPriceAdapter: address
    }));
    writeFileSync(demoConfigPath, JSON.stringify(demoConfig));

    const config = loadAgentConfig({
      ADDRESS_BOOK_PATH: addressBookPath,
      DEPLOYMENTS_PATH: deploymentsPath,
      DEMO_CONFIG_PATH: demoConfigPath,
      AGENT_PRIVATE_KEY: privateKey,
      AGENT_ACCOUNT_ID: "7",
      AGENT_MARKET: "MON"
    });

    assert.equal(config.mode, "demo");
    assert.equal(config.accountId, 7n);
    assert.equal(config.marketId, 64n);
    assert.equal(config.deployments.fundedVault, address);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test("loadAgentConfig fails fast when deployments are missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-config-missing-"));
  try {
    const addressBookPath = join(dir, "addresses.json");
    const deploymentsPath = join(dir, "deployments.json");
    const demoConfigPath = join(dir, "demo-config.json");
    writeFileSync(addressBookPath, JSON.stringify({
      perpl: {markets: {MON: {id: 64, priceDecimals: 5, sizeDecimals: 0, initialMargin: 300}}}
    }));
    writeFileSync(deploymentsPath, JSON.stringify({fundedVault: null}));
    writeFileSync(demoConfigPath, JSON.stringify(demoConfig));

    assert.throws(() => loadAgentConfig({
      ADDRESS_BOOK_PATH: addressBookPath,
      DEPLOYMENTS_PATH: deploymentsPath,
      DEMO_CONFIG_PATH: demoConfigPath,
      AGENT_PRIVATE_KEY: privateKey,
      AGENT_ACCOUNT_ID: "7"
    }), /Missing accountRegistry deployment address/);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test("Perpl SIWE auth extracts message, cookie, and nonce", async () => {
  const seenBodies: unknown[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    seenBodies.push(JSON.parse(init?.body?.toString() ?? "{}"));
    if (url.toString().endsWith("/v1/auth/payload")) {
      return new Response(JSON.stringify({message: "Sign in to Perpl"}), {
        status: 200,
        headers: {"set-cookie": "payload=abc; Path=/"}
      });
    }
    return new Response(JSON.stringify({nonce: "nonce-1"}), {
      status: 200,
      headers: {"set-cookie": "auth=def; Path=/"}
    });
  };

  const session = await connectPerpl({
    apiUrl: "https://perpl.example/api",
    address,
    chainId: 10143,
    signMessage: async (message) => {
      assert.equal(message, "Sign in to Perpl");
      return `0x${"a".repeat(130)}` as Hex;
    },
    fetchImpl: fetcher
  });

  assert.equal(session.nonce, "nonce-1");
  assert.equal(session.cookie, "auth=def");
  assert.equal(seenBodies.length, 2);
});

test("Perpl whitelist failures are typed and graceful", async () => {
  const fetcher: typeof fetch = async () => new Response("no", {status: 418});
  await assert.rejects(() => connectPerpl({
    apiUrl: "https://perpl.example/api",
    address,
    chainId: 10143,
    signMessage: async () => "0x0",
    fetchImpl: fetcher
  }), PerplWhitelistError);
});

test("request ids seed from lfr and remain strictly increasing after reload", () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-rq-"));
  try {
    const statePath = join(dir, "state.json");
    assert.equal(seedRqFromLfr("41"), 41n);
    assert.equal(nextRq({statePath, accountKey: "1", lfr: 41n}), 42n);
    assert.equal(nextRq({statePath, accountKey: "1", lfr: 10n}), 43n);
    const saved = JSON.parse(readFileSync(statePath, "utf8")) as {accounts: Record<string, {lastRq: string}>};
    assert.equal(saved.accounts["1"]?.lastRq, "43");
    assert.equal(nextRq({statePath, accountKey: "1", lfr: 100n}), 101n);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test("WebSocket message encoders produce Perpl auth and order payloads", () => {
  assert.deepEqual(buildAuthSignInMessage("n-1"), {mt: 4, nonce: "n-1"});

  const openLong = buildOrderRequestMessage({
    rq: 1n,
    marketId: 64n,
    action: PerplOrderAction.OpenLong,
    sizeDelta: 5n,
    collateral: 1_000n,
    leverage: 1_000,
    accountId: 7n
  });
  assert.deepEqual(openLong, {
    mt: 22,
    rq: "1",
    d: {mid: 64, ot: 1, sz: "5", col: "1000", lev: 1000, aid: "7"}
  });

  const closeShort = buildOrderRequestMessage({
    rq: "2",
    marketId: 64,
    action: PerplOrderAction.CloseShort,
    sizeDelta: "-5",
    collateral: "0",
    leverage: 1_000
  });
  assert.equal((closeShort.d as {ot: number}).ot, 4);
});

test("mock fill messages dispatch reconcile calls with correct args", async () => {
  const calls: unknown[] = [];
  const count = await handleFillMessage({
    message: {mt: 25, d: {rq: "9", mid: 64, sz: "-5", px: "2083"}},
    accountId: 7n,
    reconcile: async (fill) => calls.push(fill)
  });

  assert.equal(count, 1);
  assert.deepEqual(calls, [{
    requestId: 9n,
    marketId: 64n,
    sizeDelta: -5n,
    fillPrice: 2083n
  }]);
});

test("mock fill messages can map Perpl rq back to Propmon request ids", async () => {
  const calls: unknown[] = [];
  await handleFillMessage({
    message: {mt: 25, d: {rq: "9001", mid: 64, sz: "5", px: "2083"}},
    accountId: 7n,
    resolveRequestId: (fill) => fill.rq === 9001n ? 3n : undefined,
    reconcile: async (fill) => calls.push(fill)
  });

  assert.deepEqual(calls, [{
    requestId: 3n,
    marketId: 64n,
    sizeDelta: 5n,
    fillPrice: 2083n
  }]);
});

test("deterministic strategy and demo script produce stable decisions", () => {
  const first = decideNextTrade({
    mode: "demo",
    demoConfig,
    markets,
    executedDemoSteps: 0,
    defaultMarketSymbol: "MON"
  });
  assert.deepEqual(first, {
    marketId: 64n,
    side: VaultSide.LONG,
    sizeDelta: 250000n,
    collateral: 250000000n,
    source: "scripted-demo"
  });

  const live = decideNextTrade({
    mode: "live",
    demoConfig,
    markets,
    executedDemoSteps: 0,
    currentPrice: 10n,
    previousPrice: 11n,
    defaultMarketSymbol: "MON"
  });
  assert.equal(live?.side, VaultSide.SHORT);
  assert.equal(live?.source, "deterministic-strategy");
});

test("vault path selection honors account state and funded execution route", () => {
  assert.equal(fundedExecutionRoute("live", true), "live-perpl-ws");
  assert.equal(fundedExecutionRoute("live", false), "demo-onchain-fill");
  assert.equal(selectVaultPath({state: AccountState.EXAMINATION, mode: "demo", whitelisted: false}), "examination-entry");
  assert.equal(selectVaultPath({state: AccountState.FUNDED, mode: "live", whitelisted: true}), "funded-live");
  assert.equal(selectVaultPath({state: AccountState.FUNDED, mode: "live", whitelisted: false}), "funded-demo");
  assert.equal(selectVaultPath({state: AccountState.PAYOUT, mode: "demo", whitelisted: false}), "idle");
});

test("vault intents map to the correct Perpl order actions", () => {
  assert.equal(orderActionFromVaultIntent({side: VaultSide.LONG, sizeDelta: 5n, isClose: false}), PerplOrderAction.OpenLong);
  assert.equal(orderActionFromVaultIntent({side: VaultSide.SHORT, sizeDelta: -5n, isClose: false}), PerplOrderAction.OpenShort);
  assert.equal(orderActionFromVaultIntent({side: VaultSide.SHORT, sizeDelta: -5n, isClose: true}), PerplOrderAction.CloseLong);
  assert.equal(orderActionFromVaultIntent({side: VaultSide.LONG, sizeDelta: 5n, isClose: true}), PerplOrderAction.CloseShort);
});
