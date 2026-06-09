import WebSocket from "ws";
import {type Address, type Hex, type PublicClient, type WalletClient} from "viem";

import {pushPriceUpdate} from "./chain.js";
import {type DemoConfig, demoPricesAtStep} from "./demo.js";
import {
  heartbeatStream,
  type MarketConfig,
  marketStateStream,
  parseMarketStateMessage,
  parseRestContextPrices,
  type PriceUpdate
} from "./prices.js";

export type RelayOptions = {
  mode: "live" | "demo";
  chainId: number;
  wsUrl: string;
  apiUrl: string;
  adapterAddress: Address;
  publicClient: PublicClient;
  walletClient: WalletClient;
  markets: MarketConfig[];
  demoConfig: DemoConfig;
  pushIntervalMs: number;
  minMoveBps: number;
  pollIntervalMs: number;
  reconnectBaseMs: number;
};

type LastPush = {
  price: bigint;
  pushedAt: number;
};

export class PriceRelayer {
  private readonly lastPush = new Map<number, LastPush>();
  private demoStep = 0;
  private reconnectAttempt = 0;

  constructor(private readonly options: RelayOptions) {}

  async start(): Promise<void> {
    if (this.options.mode === "demo") {
      await this.startDemoLoop();
      return;
    }

    this.connectLiveWebSocket();
    setInterval(() => {
      void this.pollRestFallback().catch((error) => {
        console.error("REST fallback failed", error);
      });
    }, this.options.pollIntervalMs);
  }

  private async startDemoLoop(): Promise<void> {
    await this.pushUpdates(demoPricesAtStep(this.options.demoConfig, this.options.markets, this.demoStep));
    setInterval(() => {
      this.demoStep += 1;
      void this.pushUpdates(demoPricesAtStep(this.options.demoConfig, this.options.markets, this.demoStep));
    }, this.options.pushIntervalMs);
  }

  private connectLiveWebSocket(): void {
    const ws = new WebSocket(`${this.options.wsUrl}/ws/v1/market-data`);

    ws.on("open", () => {
      this.reconnectAttempt = 0;
      ws.send(JSON.stringify({
        mt: 5,
        subs: [
          {stream: heartbeatStream(this.options.chainId), subscribe: true},
          {stream: marketStateStream(this.options.chainId), subscribe: true}
        ]
      }));
      console.log(`Subscribed to ${marketStateStream(this.options.chainId)}`);
    });

    ws.on("message", (data) => {
      void this.pushUpdates(parseMarketStateMessage(data.toString(), this.options.markets)).catch((error) => {
        console.error("WS price push failed", error);
      });
    });

    ws.on("close", () => this.scheduleReconnect());
    ws.on("error", (error) => {
      console.error("Perpl WS error", error);
      ws.close();
    });
  }

  private scheduleReconnect(): void {
    this.reconnectAttempt += 1;
    const delayMs = Math.min(this.options.reconnectBaseMs * 2 ** (this.reconnectAttempt - 1), 30_000);
    console.error(`Perpl WS closed; reconnecting in ${delayMs}ms`);
    setTimeout(() => this.connectLiveWebSocket(), delayMs);
  }

  private async pollRestFallback(): Promise<void> {
    const response = await fetch(`${this.options.apiUrl}/v1/pub/context`);
    if (!response.ok) {
      throw new Error(`Perpl context returned ${response.status}`);
    }
    await this.pushUpdates(parseRestContextPrices(await response.json(), this.options.markets));
  }

  private async pushUpdates(updates: PriceUpdate[]): Promise<void> {
    for (const update of updates) {
      if (!this.shouldPush(update)) continue;

      const hash = await pushPriceUpdate(
        this.options.publicClient,
        this.options.walletClient,
        this.options.adapterAddress,
        update
      );
      this.lastPush.set(update.marketId, {price: update.price, pushedAt: Date.now()});
      console.log([
        `mode=${this.options.mode}`,
        `source=${update.source}`,
        `market=${update.symbol ?? update.marketId}`,
        `marketId=${update.marketId}`,
        `price=${update.price.toString()}`,
        `decimals=${update.decimals}`,
        `tx=${hash}`
      ].join(" "));
    }
  }

  private shouldPush(update: PriceUpdate): boolean {
    const previous = this.lastPush.get(update.marketId);
    if (!previous) return true;

    const ageMs = Date.now() - previous.pushedAt;
    if (ageMs >= this.options.pushIntervalMs) return true;

    const diff = update.price > previous.price ? update.price - previous.price : previous.price - update.price;
    const moveBps = (diff * 10_000n) / previous.price;
    return moveBps >= BigInt(this.options.minMoveBps);
  }
}
