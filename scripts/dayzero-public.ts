import WebSocket from "ws";

const API_URL = process.env.PERPL_API_URL ?? "https://testnet.perpl.xyz/api";
const WS_URL = process.env.PERPL_WS_URL ?? "wss://testnet.perpl.xyz";
const RPC_URL = process.env.MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz";
const CHAIN_ID = Number(process.env.PERPL_CHAIN_ID ?? "10143");

type Context = {
  chain: { chain_id: number; block_explorer_urls?: string[] };
  instances: Array<{
    id: number;
    address: string;
    collateral_token_id: number;
    min_account_open_amount: string;
    min_deposit_amount: string;
  }>;
  tokens: Array<{ id: number; address: string; symbol: string; decimals: number }>;
  markets: Array<{
    id: number;
    symbol: string;
    config: { price_decimals: number; size_decimals: number; initial_margin: number };
    state?: { orl: number; mrk: number };
  }>;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return (await response.json()) as T;
}

async function checkContext(): Promise<Context> {
  const context = await fetchJson<Context>(`${API_URL}/v1/pub/context`);
  if (context.chain.chain_id !== CHAIN_ID) {
    throw new Error(`Perpl context chain_id ${context.chain.chain_id} did not match ${CHAIN_ID}`);
  }

  const exchange = context.instances[0];
  const token = context.tokens.find((candidate) => candidate.id === exchange.collateral_token_id);
  if (!token) {
    throw new Error(`No collateral token found for token id ${exchange.collateral_token_id}`);
  }

  const markets = context.markets.map((market) => `${market.symbol}=${market.id}`).join(", ");
  console.log(`Perpl context OK: chain=${context.chain.chain_id}, exchange=${exchange.address}`);
  console.log(`Collateral: ${token.symbol} ${token.address} decimals=${token.decimals}`);
  console.log(`Markets: ${markets}`);
  return context;
}

async function checkRpc(): Promise<void> {
  const response = await fetchJson<{ result: string }>(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] })
  });
  const chainId = Number.parseInt(response.result, 16);
  if (chainId !== CHAIN_ID) {
    throw new Error(`RPC chainId ${chainId} did not match ${CHAIN_ID}`);
  }
  console.log(`Monad RPC OK: eth_chainId=${response.result} (${chainId})`);
}

async function checkMarketDataWs(): Promise<void> {
  const marketStream = `market-state@${CHAIN_ID}`;
  const heartbeatStream = `heartbeat@${CHAIN_ID}`;

  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(`${WS_URL}/ws/v1/market-data`);
    let sawHeartbeat = false;
    let sawMarketState = false;
    let settled = false;

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error(`Timed out waiting for ${heartbeatStream} and ${marketStream}`));
    }, 12_000);

    ws.on("open", () => {
      ws.send(JSON.stringify({
        mt: 5,
        subs: [
          { stream: heartbeatStream, subscribe: true },
          { stream: marketStream, subscribe: true }
        ]
      }));
    });

    ws.on("message", (data) => {
      const message = JSON.parse(data.toString()) as { mt: number; d?: unknown };
      if (message.mt === 100) sawHeartbeat = true;
      if (message.mt === 9 && message.d) sawMarketState = true;

      if (sawHeartbeat && sawMarketState) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        ws.close();
        console.log(`Perpl WS OK: ${heartbeatStream}, ${marketStream}`);
        resolve();
      }
    });

    ws.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function maybeCheckAuth(): Promise<void> {
  const address = process.env.OWNER_ADDRESS;
  const privateKey = process.env.OWNER_PRIVATE_KEY;

  if (!address || !privateKey) {
    console.log("Perpl auth/account checks skipped: OWNER_ADDRESS and OWNER_PRIVATE_KEY are not set.");
    console.log("Funded live trading verdict: PENDING/NO-GO until a whitelisted wallet validates auth and account creation.");
    return;
  }

  console.log("Wallet env vars are present. Auth/account validation is intentionally left to Agent 06's SIWE client to avoid duplicating signing logic here.");
  console.log("Funded live trading verdict: PENDING until authenticated Perpl connect and createAccount are confirmed.");
}

async function main(): Promise<void> {
  await checkContext();
  await checkRpc();
  await checkMarketDataWs();
  await maybeCheckAuth();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
