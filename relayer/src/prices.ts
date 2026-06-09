export type MarketConfig = {
  symbol: string;
  id: number;
  priceDecimals: number;
};

export type PriceUpdate = {
  marketId: number;
  symbol?: string;
  price: bigint;
  decimals: number;
  source: "live-ws" | "live-rest" | "demo";
  rawPrice: string;
};

type MarketStateCandidate = {
  marketId: number;
  mark?: unknown;
  oracle?: unknown;
};

export function marketStateStream(chainId = 10143): string {
  return `market-state@${chainId}`;
}

export function heartbeatStream(chainId = 10143): string {
  return `heartbeat@${chainId}`;
}

export function scalePriceToBigInt(value: string | number, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error(`Invalid price decimals: ${decimals}`);
  }

  const valueText = normalizeDecimal(value);
  const negative = valueText.startsWith("-");
  if (negative) throw new Error(`Price cannot be negative: ${valueText}`);

  const [wholePart, fractionPart = ""] = valueText.split(".");
  const whole = wholePart === "" ? "0" : wholePart;
  const paddedFraction = `${fractionPart}${"0".repeat(decimals)}`.slice(0, decimals);
  const nextDigit = fractionPart[decimals] ? Number(fractionPart[decimals]) : 0;
  let scaled = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(paddedFraction || "0");

  if (nextDigit >= 5) {
    scaled += 1n;
  }

  if (scaled <= 0n) throw new Error(`Scaled price must be positive: ${valueText}`);
  return scaled;
}

export function parseMarketStateMessage(message: unknown, markets: MarketConfig[]): PriceUpdate[] {
  const parsed = typeof message === "string" ? JSON.parse(message) as unknown : message;
  if (!isRecord(parsed) || parsed.mt !== 9) return [];

  const marketById = new Map(markets.map((market) => [market.id, market]));
  const candidates: MarketStateCandidate[] = [];
  collectMarketStateCandidates(parsed.d, candidates);

  return candidates.flatMap((candidate) => {
    const market = marketById.get(candidate.marketId);
    const mark = candidate.mark ?? candidate.oracle;
    if (!market || mark === undefined || mark === null) return [];

    return [{
      marketId: market.id,
      symbol: market.symbol,
      price: scalePriceToBigInt(markToString(mark), market.priceDecimals),
      decimals: market.priceDecimals,
      source: "live-ws" as const,
      rawPrice: markToString(mark)
    }];
  });
}

export function parseRestContextPrices(context: unknown, markets: MarketConfig[]): PriceUpdate[] {
  if (!isRecord(context) || !Array.isArray(context.markets)) return [];

  const marketById = new Map(markets.map((market) => [market.id, market]));
  return context.markets.flatMap((entry: unknown) => {
    if (!isRecord(entry)) return [];

    const id = numberFromUnknown(entry.id);
    const configured = id === undefined ? undefined : marketById.get(id);
    const state = isRecord(entry.state) ? entry.state : undefined;
    const mark = state?.mrk ?? state?.mark ?? state?.orl;
    if (!configured || mark === undefined || mark === null) return [];

    return [{
      marketId: configured.id,
      symbol: configured.symbol,
      price: scalePriceToBigInt(markToString(mark), configured.priceDecimals),
      decimals: configured.priceDecimals,
      source: "live-rest" as const,
      rawPrice: markToString(mark)
    }];
  });
}

function collectMarketStateCandidates(value: unknown, candidates: MarketStateCandidate[], keyedMarketId?: number): void {
  if (Array.isArray(value)) {
    for (const item of value) collectMarketStateCandidates(item, candidates);
    return;
  }

  if (!isRecord(value)) return;

  const explicitMarketId = numberFromUnknown(value.mid ?? value.marketId ?? value.market_id ?? value.id);
  const marketId = explicitMarketId ?? keyedMarketId;
  const mark = value.mrk ?? value.mark;
  const oracle = value.orl ?? value.oracle;
  if (marketId !== undefined && (mark !== undefined || oracle !== undefined)) {
    candidates.push({marketId, mark, oracle});
  }

  for (const [key, nested] of Object.entries(value)) {
    const nestedMarketId = numberFromUnknown(key);
    collectMarketStateCandidates(nested, candidates, nestedMarketId);
  }
}

function markToString(value: unknown): string {
  if (typeof value === "number" || typeof value === "string") return normalizeDecimal(value);
  throw new Error(`Unsupported price value: ${String(value)}`);
}

function normalizeDecimal(value: string | number): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Invalid numeric price: ${value}`);
    return value.toLocaleString("en-US", {useGrouping: false, maximumFractionDigits: 20});
  }

  const trimmed = value.trim();
  if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid decimal price: ${value}`);
  }
  if (!/[eE]/.test(trimmed)) return trimmed;

  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) throw new Error(`Invalid decimal price: ${value}`);
  return numeric.toLocaleString("en-US", {useGrouping: false, maximumFractionDigits: 20});
}

function numberFromUnknown(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
