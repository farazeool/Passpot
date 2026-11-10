import type { Metadata } from "next";
import { Suspense } from "react";
import "@fontsource-variable/familjen-grotesk";
import "@fontsource-variable/public-sans";
import "@near-wallet-selector/modal-ui/styles.css";
import "./globals.css";
import { Header } from "@/components/Header";
import { WalletProvider } from "@/lib/wallet";

export const metadata: Metadata = {
  title: "Rota — the savings circle nobody can run off with",
  description:
    "Run a circle (ROSCA) on NEAR. The pot sits in its own Sputnik DAO and pays out by rule: an on-chain draw, holdback that covers missed payments, and a reputation you can carry.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="antialiased">
      <body className="min-h-dvh flex flex-col">
        <WalletProvider>
          <Suspense fallback={<div className="h-16 border-b border-rule" />}>
            <Header />
          </Suspense>
          <main className="flex-1">{children}</main>
          <footer className="border-t border-rule mt-24 print:hidden">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 text-sm text-muted flex flex-wrap gap-x-6 gap-y-2">
              <span>Rota runs on NEAR testnet. Test dollars have no value.</span>
              {process.env.NEXT_PUBLIC_REPO_URL && (
                <a className="link" href={process.env.NEXT_PUBLIC_REPO_URL} rel="noreferrer">
                  Source code
                </a>
              )}
              <span>Built at NEAR HACKATHON</span>
            </div>
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
