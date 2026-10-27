import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { SiteNav } from "@/components/SiteNav";

export const metadata: Metadata = {
  title: "Poker Trainer",
  description: "Personal NLHE cash drill trainer — static strategy packs, no solvers.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>
          <SiteNav />
          {children}
          <footer className="site-footer">
            Static packs only · solvers never ship to Vercel · personal-first
          </footer>
        </main>
      </body>
    </html>
  );
}
