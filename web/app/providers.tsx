"use client";

import "@rainbow-me/rainbowkit/styles.css";

import {getDefaultConfig, RainbowKitProvider} from "@rainbow-me/rainbowkit";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {useState, type ReactNode} from "react";
import {WagmiProvider} from "wagmi";

import {monadTestnet} from "../lib/config";

const wagmiConfig = getDefaultConfig({
  appName: "Propmon",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "propmon-demo",
  chains: [monadTestnet],
  ssr: true
});

export function Providers({children}: {children: ReactNode}) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
