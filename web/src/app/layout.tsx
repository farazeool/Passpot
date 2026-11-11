import type { Metadata } from "next";
import { Suspense } from "react";
import "@fontsource-variable/inter";
import "@near-wallet-selector/modal-ui/styles.css";
import "./globals.css";
import { Header } from "@/components/Header";
import { ToastProvider } from "@/components/Toast";
import { themeScript } from "@/components/ThemeToggle";
import { WalletProvider } from "@/lib/wallet";
import { REPO_URL } from "@/lib/config";

export const metadata: Metadata = {
  title: "Passpot — the savings circle nobody can run off with",
  description:
    "Run a circle (ROSCA) on NEAR. The pot sits in its own Sputnik DAO and pays out by rule: an on-chain draw, holdback that covers missed payments, and a reputation you can carry.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="antialiased" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)" />
      </head>
      <body className="min-h-dvh flex flex-col">
        <WalletProvider>
          <ToastProvider>
          <Suspense fallback={<div className="h-16 border-b border-rule" />}>
            <Header />
          </Suspense>
          <main className="flex-1">{children}</main>
          <footer className="border-t border-rule mt-24 print:hidden">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 text-sm text-muted flex flex-wrap gap-x-6 gap-y-2">
              <span>Passpot runs on NEAR testnet. Test dollars have no value.</span>
              {REPO_URL && (
                <a className="link" href={REPO_URL} rel="noreferrer">
                  Source code
                </a>
              )}
              <span>Built for the NEAR Hackathon</span>
            </div>
          </footer>
          </ToastProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
