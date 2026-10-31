import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Brightloop Gaming — Subscription & Billing Management OS",
  description:
    "Production-ready Gaming Subscription & Billing Management System featuring token-bucket bot defense, revenue leakage scanner, Battlepass management, and financial AI intelligence.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-slate-100 min-h-screen flex flex-col antialiased">
        <Navbar />
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
        <footer className="border-t border-border bg-[#070a10] py-6 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div>
              <span className="font-semibold text-slate-400">Brightloop Gaming Platform</span> &copy; 2026. Built with Next.js 15, Prisma ORM & Tailwind CSS.
            </div>
            <div className="flex items-center space-x-4 text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                SQLite Engine Active
              </span>
              <span>18% Statutory GST Configured</span>
              <span>Token-Bucket Bot Radar Armed</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
