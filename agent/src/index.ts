export type FundedExecutionRoute = "live-perpl-ws" | "demo-onchain-fill";

export function fundedExecutionRoute(mode: string | undefined, whitelisted: boolean): FundedExecutionRoute {
  if (mode === "live" && whitelisted) {
    return "live-perpl-ws";
  }

  return "demo-onchain-fill";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const route = fundedExecutionRoute(process.env.PROPMON_MODE, process.env.PERPL_AUTH_GO === "true");
  console.log(`Propmon agent scaffold ready. Funded route: ${route}`);
}
