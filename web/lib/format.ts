import {formatEther, formatUnits, parseUnits, type BaseError} from "viem";

import {explorerBaseUrl} from "./config";

export function titleCase(value: string | undefined): string {
  if (!value) return "--";
  return value.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export function formatQuote(value: bigint | number | undefined, compact = false): string {
  if (value === undefined) return "--";
  const amount = typeof value === "bigint" ? Number(formatUnits(value, 6)) : value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: compact ? 0 : 2
  }).format(amount);
}

export function formatSignedQuote(value: bigint | undefined): string {
  if (value === undefined) return "--";
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  return `${sign}${formatQuote(abs)}`;
}

export function formatBps(value: bigint | number | undefined): string {
  if (value === undefined) return "--";
  return `${(Number(value) / 100).toFixed(2)}%`;
}

export function formatPrice(price: bigint | undefined, decimals: number | undefined): string {
  if (price === undefined || decimals === undefined) return "--";
  const value = Number(formatUnits(price, decimals));
  if (!Number.isFinite(value)) return "--";
  return value >= 1 ? `$${value.toLocaleString(undefined, {maximumFractionDigits: 2})}` : `$${value.toFixed(5)}`;
}

export function formatNative(value: bigint | undefined): string {
  if (value === undefined) return "--";
  return `${formatEther(value)} MON`;
}

export function parseQuoteInput(value: string): bigint {
  if (!value.trim()) return 0n;
  return parseUnits(value.replace(/,/g, ""), 6);
}

export function txUrl(hash: string | undefined): string | undefined {
  return hash ? `${explorerBaseUrl}/tx/${hash}` : undefined;
}

export function addressUrl(address: string | undefined): string | undefined {
  return address ? `${explorerBaseUrl}/address/${address}` : undefined;
}

export function shortHash(value: string | undefined): string {
  if (!value) return "--";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function errorMessage(error: unknown): string {
  if (!error) return "";
  const base = error as BaseError;
  const text = base.shortMessage || base.message || String(error);
  const stableReason = [
    "MAX_LEVERAGE",
    "MAX_NOTIONAL",
    "MAX_CONCENTRATION",
    "CAPITAL_DEPLOYED",
    "ACCOUNT_NOT_CONFIGURED",
    "RULESET_NOT_CONFIGURED"
  ].find((reason) => text.includes(reason));
  return stableReason ? `Trade blocked on-chain: ${stableReason}` : text;
}
