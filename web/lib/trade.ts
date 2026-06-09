export const sideOptions = [
  {label: "Long", value: 0},
  {label: "Short", value: 1}
] as const;

export function signedSizeDelta(value: string, side: 0 | 1): bigint {
  const clean = BigInt(value.trim() || "0");
  const abs = clean < 0n ? -clean : clean;
  return side === 0 ? abs : -abs;
}
