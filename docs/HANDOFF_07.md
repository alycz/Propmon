# Handoff 07

Agent 07 implemented the judge-facing Propmon frontend in `web/`.

## Dashboard

- Next.js app with Privy, wagmi, viem, and Monad Testnet chain ID `10143`.
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
NEXT_PUBLIC_PRIVY_APP_ID=...
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
3. Start the Agent API with the Privy server-wallet signer:
   ```bash
   AGENT_SIGNER_MODE=privy-server-wallet \
   PRIVY_APP_ID=... \
   PRIVY_APP_SECRET=... \
   PRIVY_SERVER_WALLET_ID=... \
   PRIVY_AUTHORIZATION_PRIVATE_KEY=... \
   AGENT_ACCOUNT_ID=1 \
   pnpm agent:server
   ```
4. Open the public web URL with `?mode=demo`.
5. Connect with Privy, buy a `$10,000` examination, authorize the discovered `/agent-signer` address, then click `Run demo script`.
6. After pass, activate funded, use the labeled `DEMO FILL` path, then run payout when the account has profit and no open positions.

## Agent API Status

Agent 08 added the minimal local service expected by `/api/demo-script`:

```http
POST http://127.0.0.1:8787/demo-script
content-type: application/json
x-propmon-mode: demo

{"mode":"demo","accountId":"1"}
```

Set `NEXT_PUBLIC_AGENT_API_URL` to the deployed Agent API URL for Vercel. The endpoint rejects live mode and requires the supplied account to have authorized the configured Agent 09 signer returned by `GET /agent-signer`.

## Public URL

Vercel deployment is pending project access. Once deployed, record the public URL here and set the env vars above in the Vercel project.
