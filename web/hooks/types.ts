import {type Hex} from "viem";

export type LedgerRow = {
  key: string;
  marketId: bigint;
  sizeDelta: bigint;
  markPrice: bigint;
  equityAfter?: bigint;
  timestamp?: bigint;
  hash?: Hex;
};

export type FundedEvent = {
  key: string;
  label: string;
  detail: string;
  hash?: Hex;
};

export type PriceCell = {
  market: import("../lib/config").MarketConfig;
  price?: bigint;
  decimals?: number;
  updatedAt?: bigint;
};

export type ChartPoint = {
  time: number;
  value: number;
};
