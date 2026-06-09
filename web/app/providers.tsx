"use client";

import {PrivyProvider} from "@privy-io/react-auth";
import {createConfig, WagmiProvider} from "@privy-io/wagmi";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {useState, type ReactNode} from "react";
import {http} from "wagmi";

import {monadTestnet} from "../lib/config";

const buildSafePrivyAppId = "clpropmonmissingappid0000";

const wagmiConfig = createConfig({
  chains: [monadTestnet],
  transports: {
    [monadTestnet.id]: http(monadTestnet.rpcUrls.default.http[0])
  },
  ssr: true
});

export function Providers({children}: {children: ReactNode}) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || buildSafePrivyAppId}
      config={{
        defaultChain: monadTestnet,
        supportedChains: [monadTestnet],
        loginMethods: ["email", "google", "wallet"],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets"
          }
        },
        appearance: {
          walletChainType: "ethereum-only",
          walletList: ["detected_ethereum_wallets", "metamask", "coinbase_wallet", "wallet_connect"]
        }
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
