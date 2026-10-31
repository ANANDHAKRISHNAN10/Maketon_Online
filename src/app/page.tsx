"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Gamepad2,
  Sliders,
  ShieldAlert,
  BarChart3,
  Sparkles,
  Zap,
  ArrowRight,
  Lock,
  Layers,
  Bot,
  Activity,
  CheckCircle2,
  DollarSign,
  TrendingUp,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default function HomePage() {
  const [stats, setStats] = useState({
    activeGamers: 5,
    mrr: 211.97,
    threatsBlocked: 1,
    leakageDetected: 94.98,
  });

  useEffect(() => {
    // Fetch live figures from executive report & security logs
    Promise.all([
      fetch("/api/intelligence/executive-report").then((r) => r.json()).catch(() => null),
      fetch("/api/intelligence/revenue-leakage").then((r) => r.json()).catch(() => null),
      fetch("/api/security/logs").then((r) => r.json()).catch(() => null),
    ]).then(([exec, leak, sec]) => {
      if (exec?.success) {
        setStats((prev) => ({
          ...prev,
          mrr: exec.kpis?.mrr || prev.mrr,
          activeGamers: exec.kpis?.totalGamers || prev.activeGamers,
        }));
      }
      if (leak?.success) {
        setStats((prev) => ({
          ...prev,
          leakageDetected: leak.totalImpactAmount ?? prev.leakageDetected,
        }));
      }
      if (sec?.success) {
        setStats((prev) => ({
          ...prev,
          threatsBlocked: sec.counts?.cardBotAttacks ?? prev.threatsBlocked,
        }));
      }
    });
  }, []);

  const featureCards = [
    {
      title: "Gamer Self-Service Portal",
      badge: "Player Portal",
      href: "/gamer",
      icon: Gamepad2,
      accent: "cyan",
      borderColor: "border-cyan-500/40 hover:border-cyan-400",
      glow: "shadow-neon-cyan",
      description:
        "Battlepass tier tracking, live perks countdown ticker, 7/14/30-day pause modal with dynamic date recalculation, statutory 18% GST receipts, and Parental Safety Gate.",
      highlights: ["Battlepass XP Boost", "Interactive Pause", "Parental 4-Digit PIN", "18% GST Receipts"],
    },
    {
      title: "Admin Control Center",
      badge: "Catalog & Pricing",
      href: "/admin",
      icon: Sliders,
      accent: "indigo",
      borderColor: "border-indigo-500/40 hover:border-indigo-400",
      glow: "shadow-card-glow",
      description:
        "Product & Plan Configurator with billing intervals (Daily, Weekly, Monthly, Yearly), auto-close flags, pause day limits, and live Discount Profitability Simulator.",
      highlights: ["Product Variants", "Interval Schedules", "Unit Economic Simulator", "Net Margin Calculator"],
    },
    {
      title: "Security & Fraud Center",
      badge: "Real-time Defense",
      href: "/admin/security",
      icon: ShieldAlert,
      accent: "rose",
      borderColor: "border-rose-500/40 hover:border-rose-400",
      glow: "shadow-lg",
      description:
        "Geo-IP Jump Tracker highlighting impossible travel in under 1 hour with instant 48h Trade Lock trigger, plus Token-Bucket Card Bot Radar blocking automated testers after 3 attempts.",
      highlights: ["Geo-IP Jump Detection", "48h Trade Lock Out", "Token-Bucket Rate Limiter", "Bot Attack Radar"],
    },
    {
      title: "Financial Intelligence & Leakage",
      badge: "Revenue Assurance",
      href: "/admin/finance",
      icon: BarChart3,
      accent: "emerald",
      borderColor: "border-emerald-500/40 hover:border-emerald-400",
      glow: "shadow-neon-emerald",
      description:
        "4-tier revenue leakage detection scanner with One-Click Auto-Reconcile, multi-factor Churn Prediction Radar (0-100), and automated AI Executive Financial Markdown Reports.",
      highlights: ["One-Click Auto Reconcile", "Churn Prediction Radar", "Ranked Collection Dunning", "Markdown Export"],
    },
  ];

  return (
    <div className="space-y-12 animate-in fade-in duration-300">
      {/* Hero Header */}
      <div className="relative text-center max-w-4xl mx-auto space-y-6 pt-4 sm:pt-8">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>Brightloop Gaming Subscription &amp; Billing Operating System</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight leading-tight">
          Next-Gen Gaming <br className="hidden sm:inline" />
          <span className="text-gradient-cyan">Billing &amp; Revenue Intelligence</span>
        </h1>

        <p className="text-slate-300 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
          Production-grade subscription architecture featuring automated 18% GST invoicing, token-bucket bot protection, impossible travel fraud locks, and instant one-click ledger reconciliation.
        </p>

        {/* Live System Stat Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl mx-auto pt-2">
          <div className="bg-surface-card/80 border border-border p-3 rounded-xl text-center">
            <div className="text-[11px] text-slate-400 uppercase font-semibold">Monthly Run Rate</div>
            <div className="text-xl font-extrabold text-white font-mono mt-0.5">
              {formatCurrency(stats.mrr)}
            </div>
          </div>
          <div className="bg-surface-card/80 border border-border p-3 rounded-xl text-center">
            <div className="text-[11px] text-slate-400 uppercase font-semibold">Active Base</div>
            <div className="text-xl font-extrabold text-emerald-400 font-mono mt-0.5">
              {stats.activeGamers} Gamers
            </div>
          </div>
          <div className="bg-surface-card/80 border border-border p-3 rounded-xl text-center">
            <div className="text-[11px] text-slate-400 uppercase font-semibold">Bot Attacks Blocked</div>
            <div className="text-xl font-extrabold text-rose-400 font-mono mt-0.5">
              {stats.threatsBlocked} Blocked
            </div>
          </div>
          <div className="bg-surface-card/80 border border-border p-3 rounded-xl text-center">
            <div className="text-[11px] text-slate-400 uppercase font-semibold">Detected Leakage</div>
            <div className="text-xl font-extrabold text-cyan-400 font-mono mt-0.5">
              {formatCurrency(stats.leakageDetected)}
            </div>
          </div>
        </div>
      </div>

      {/* 4 Mission Control Hub Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
        {featureCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={card.href}
              className={`group relative rounded-2xl bg-[#0e1422] border ${card.borderColor} p-7 transition-all duration-300 hover:-translate-y-1 ${card.glow} flex flex-col justify-between`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-xl bg-surface border border-border flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Icon className="w-6 h-6 text-cyan-400" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-surface border border-border text-slate-300 font-mono">
                    {card.badge}
                  </span>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-white group-hover:text-cyan-400 transition-colors flex items-center gap-1.5">
                    {card.title}
                    <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                  </h3>
                  <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                    {card.description}
                  </p>
                </div>

                {/* Highlights tags */}
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {card.highlights.map((h, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-2 py-0.5 rounded bg-surface border border-border/80 text-slate-400 font-medium"
                    >
                      {h}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-border/60 flex items-center justify-between text-xs font-semibold text-cyan-400">
                <span>Launch Hub &rarr;</span>
                <span className="text-slate-500 font-mono text-[11px]">{card.href}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
