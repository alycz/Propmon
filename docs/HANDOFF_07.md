# Handoff 07

Agent 07 implemented the judge-facing Propmon frontend in `web/`.

## Dashboard

- Next.js app with wagmi, RainbowKit, viem, and Monad Testnet chain ID `10143`.
- Mode toggle is URL-backed with `?mode=demo|live`; missing or invalid mode defaults to `demo`.
- Demo mode shows the persistent honesty banner: `DEMO MODE - simulated prices & demo fills. Examination ledger is still real on-chain.`
- The app contains no direct `localStorage` or `sessionStorage` usage.
- Contract reads degrade to a configured-warning state while `shared/deployments.json` contains null addresses.

## Environment

Public frontend overrides:

```bash
NEXT_PUBLIC_ACCOUNT_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_EXAMINATION_VAULT_ADDRESS=0x...
NEXT_PUBLIC_FUNDED_VAULT_ADDRESS=0x...
NEXT_PUBLIC_PRICE_ADAPTER_ADDRESS=0x...
NEXT_PUBLIC_AGENT_API_URL=https://agent-host.example
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
```

The frontend also reads `shared/addresses.json`, `shared/deployments.json`, and `shared/demo-config.json` at build time.

## Mode And Agent API Contract

`DEMO` and `LIVE` are the only frontend modes. Shared links should use:

```text
/?mode=demo
/?mode=live
```

The `Run demo script` button calls the local Next.js route:

```http
POST /api/demo-script
content-type: application/json
x-propmon-mode: demo

{"mode":"demo","accountId":"1"}
```

That route proxies to:

```text
${NEXT_PUBLIC_AGENT_API_URL}/demo-script
```

It forwards both the JSON `mode` field and `x-propmon-mode` header. The web app does not hold or use Agent 06 private keys.

## Demo Run

1. Deploy contracts and fill `shared/deployments.json`, or set the public address env overrides above.
2. Run the relayer in demo mode so `PerplPriceAdapter` receives deterministic prices.
3. Start the external Agent 06 service with a user-authorized signer.
4. Open the public web URL with `?mode=demo`.
5. Connect wallet, buy a `$10,000` examination, authorize the agent signer, then click `Run demo script`.
6. After pass, activate funded, use the labeled `DEMO FILL` path, then run payout when the account has profit and no open positions.

## Public URL

Vercel deployment is pending project access. Once deployed, record the public URL here and set the env vars above in the Vercel project.
