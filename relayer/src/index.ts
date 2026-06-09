import {createMonadClients} from "./chain.js";
import {loadDemoConfig, loadMarketConfig, loadRuntimeConfig, resolveMode} from "./config.js";
import {marketStateStream} from "./prices.js";
import {PriceRelayer} from "./relayer.js";

export {resolveMode, marketStateStream};

async function main(): Promise<void> {
  const config = loadRuntimeConfig();
  const markets = loadMarketConfig();
  const demoConfig = loadDemoConfig();
  const {publicClient, walletClient} = createMonadClients(
    config.rpcUrl,
    config.chainId,
    config.relayerPrivateKey
  );

  console.log(`Propmon relayer starting in ${config.mode} mode.`);
  console.log(`Perpl market stream: ${config.marketStream}`);
  console.log(`Markets: ${markets.map((market) => `${market.symbol}=${market.id}`).join(", ")}`);

  const relayer = new PriceRelayer({
    mode: config.mode,
    chainId: config.chainId,
    wsUrl: config.perplWsUrl,
    apiUrl: config.perplApiUrl,
    adapterAddress: config.adapterAddress,
    publicClient,
    walletClient,
    markets,
    demoConfig,
    pushIntervalMs: config.pushIntervalMs,
    minMoveBps: config.minMoveBps,
    pollIntervalMs: config.pollIntervalMs,
    reconnectBaseMs: config.reconnectBaseMs
  });
  await relayer.start();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
