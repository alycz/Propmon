export type ProprietaryXMode = "live" | "demo";

export function resolveMode(input?: string): ProprietaryXMode {
  return input === "live" ? "live" : "demo";
}

export function marketStateStream(chainId = 10143): string {
  return `market-state@${chainId}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = resolveMode(process.env.PROPRIETARYX_MODE);
  console.log(`ProprietaryX relayer scaffold ready in ${mode} mode.`);
  console.log(`Perpl market stream: ${marketStateStream(Number(process.env.PERPL_CHAIN_ID ?? "10143"))}`);
}
