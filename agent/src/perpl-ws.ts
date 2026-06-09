import WebSocket from "ws";

export const PerplMessageType = {
  AuthSignIn: 4,
  OrderRequest: 22,
  Fill: 25,
  Position: 27
} as const;

export const PerplOrderAction = {
  OpenLong: 1,
  OpenShort: 2,
  CloseLong: 3,
  CloseShort: 4,
  Cancel: 5
} as const;

export type PerplOrderAction = typeof PerplOrderAction[keyof typeof PerplOrderAction];

export type PerplOrderRequestInput = {
  rq: bigint | string;
  marketId: bigint | number;
  action: PerplOrderAction;
  sizeDelta: bigint | string;
  collateral: bigint | string;
  leverage: number;
  accountId?: bigint | string;
};

export type ParsedPerplFill = {
  rq: bigint;
  marketId: bigint;
  sizeDelta: bigint;
  fillPrice: bigint;
};

export function buildAuthSignInMessage(nonce: string): Record<string, unknown> {
  return {mt: PerplMessageType.AuthSignIn, nonce};
}

export function buildOrderRequestMessage(input: PerplOrderRequestInput): Record<string, unknown> {
  return {
    mt: PerplMessageType.OrderRequest,
    rq: input.rq.toString(),
    d: {
      mid: Number(input.marketId),
      ot: input.action,
      sz: input.sizeDelta.toString(),
      col: input.collateral.toString(),
      lev: input.leverage,
      ...(input.accountId === undefined ? {} : {aid: input.accountId.toString()})
    }
  };
}

export function parseFillMessage(message: unknown): ParsedPerplFill[] {
  if (!isRecord(message) || message.mt !== PerplMessageType.Fill) return [];

  const payload = message.d;
  const fills = Array.isArray(payload) ? payload : [payload];
  return fills.filter(isRecord).map((fill) => ({
    rq: bigIntField(fill, ["rq", "request_id", "rid"]),
    marketId: bigIntField(fill, ["mid", "market_id", "marketId"]),
    sizeDelta: bigIntField(fill, ["sz", "size", "sizeDelta"]),
    fillPrice: bigIntField(fill, ["px", "price", "fillPrice"])
  }));
}

export class TradingWsClient {
  private ws?: WebSocket;

  constructor(
    private readonly url: string,
    private readonly cookie: string,
    private readonly nonce: string
  ) {}

  async connect(): Promise<void> {
    this.ws = new WebSocket(this.url, {headers: {cookie: this.cookie}});
    await new Promise<void>((resolve, reject) => {
      if (!this.ws) return reject(new Error("WebSocket was not initialized"));
      this.ws.once("open", () => {
        this.send(buildAuthSignInMessage(this.nonce));
        resolve();
      });
      this.ws.once("error", reject);
    });
  }

  send(message: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Perpl trading WebSocket is not open");
    }
    this.ws.send(JSON.stringify(message));
  }

  onMessage(handler: (message: unknown) => void): void {
    if (!this.ws) throw new Error("Perpl trading WebSocket is not open");
    this.ws.on("message", (raw) => {
      try {
        handler(JSON.parse(raw.toString()));
      } catch (error) {
        console.error("Ignoring malformed Perpl WS message", error);
      }
    });
  }

  close(): void {
    this.ws?.close();
  }
}

function bigIntField(payload: Record<string, unknown>, names: string[]): bigint {
  for (const name of names) {
    const value = payload[name];
    if (typeof value === "bigint") return value;
    if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
    if (typeof value === "string" && value.length > 0) return BigInt(value);
  }
  throw new Error(`Perpl fill missing field: ${names.join(" or ")}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
