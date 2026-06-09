import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Propmon",
  description: "Verifiable on-chain prop trading on Monad."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
