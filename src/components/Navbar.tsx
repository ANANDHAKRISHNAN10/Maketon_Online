"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Gamepad2,
  ShieldAlert,
  BarChart3,
  Sliders,
  User,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Sparkles,
} from "lucide-react";

export const GAMER_PERSONAS = [
  {
    email: "valkyrie_99@brightloop.gg",
    name: "Valkyrie99",
    tag: "Active Champion",
    badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  },
  {
    email: "ninja_kai@brightloop.gg",
    name: "NinjaKai",
    tag: "Paused Sub",
    badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  },
  {
    email: "pixel_hunter@brightloop.gg",
    name: "PixelHunter",
    tag: "High Churn Risk (3 Fails)",
    badgeColor: "bg-rose-500/20 text-rose-300 border-rose-500/30",
  },
  {
    email: "shadow_mage@brightloop.gg",
    name: "ShadowMage",
    tag: "Geo-IP Jump Alert",
    badgeColor: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  },
  {
    email: "apex_legend@brightloop.gg",
    name: "ApexLegend",
    tag: "Induced Leakage (Unbilled)",
    badgeColor: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  },
];

export default function Navbar() {
  const pathname = usePathname();
  const [selectedGamer, setSelectedGamer] = useState(GAMER_PERSONAS[0]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("brightloop_active_gamer");
    if (saved) {
      const matched = GAMER_PERSONAS.find((g) => g.email === saved);
      if (matched) setSelectedGamer(matched);
    }
  }, []);

  const handleSelectGamer = (gamer: typeof GAMER_PERSONAS[0]) => {
    setSelectedGamer(gamer);
    localStorage.setItem("brightloop_active_gamer", gamer.email);
    setIsDropdownOpen(false);
    // Dispatch custom event so pages can refresh instantly
    window.dispatchEvent(new CustomEvent("gamerPersonaChanged", { detail: gamer.email }));
  };

  const navLinks = [
    { href: "/gamer", label: "Gamer Portal", icon: Gamepad2 },
    { href: "/admin", label: "Admin Config", icon: Sliders },
    { href: "/admin/security", label: "Security & Fraud", icon: ShieldAlert },
    { href: "/admin/finance", label: "Finance & Leakage", icon: BarChart3 },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-[#0a0e17]/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center space-x-3 group">
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-600 to-cyan-400 p-[2px] shadow-neon-cyan">
            <div className="w-full h-full bg-[#0d1322] rounded-[10px] flex items-center justify-center">
              <Gamepad2 className="w-5 h-5 text-cyan-400 group-hover:scale-110 transition-transform duration-200" />
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-extrabold tracking-wider text-lg text-white font-mono">
                BRIGHT<span className="text-cyan-400">LOOP</span>
              </span>
              <span className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30">
                PROD
              </span>
            </div>
            <span className="text-[11px] text-slate-400 block -mt-1">
              Gaming Subscription & Billing OS
            </span>
          </div>
        </Link>

        {/* Navigation Tabs */}
        <nav className="hidden md:flex items-center space-x-1">
          {navLinks.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-surface-card text-cyan-400 border border-cyan-500/40 shadow-sm"
                    : "text-slate-300 hover:text-white hover:bg-surface"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-cyan-400" : "text-slate-400"}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Persona Switcher Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center space-x-2.5 px-3 py-1.5 rounded-lg bg-surface-card hover:bg-surface-hover border border-border text-xs text-slate-200 transition-colors"
            title="Switch gamer persona to test different states"
          >
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <User className="w-3.5 h-3.5 text-cyan-400" />
            <div className="text-left hidden sm:block">
              <span className="font-semibold text-slate-100">{selectedGamer.name}</span>
              <span className="text-[10px] text-slate-400 block truncate max-w-[130px]">
                {selectedGamer.tag}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-72 rounded-xl bg-[#0f172a] border border-border shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-2 py-1.5 border-b border-border/60 mb-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center space-x-1">
                  <Sparkles className="w-3 h-3 text-cyan-400 mr-1" />
                  Select Test Gamer Persona
                </span>
                <span className="text-[10px] text-slate-500 block">
                  Simulate different subscription, churn & fraud states
                </span>
              </div>
              <div className="space-y-1">
                {GAMER_PERSONAS.map((gamer) => (
                  <button
                    key={gamer.email}
                    onClick={() => handleSelectGamer(gamer)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left text-xs transition-colors ${
                      selectedGamer.email === gamer.email
                        ? "bg-cyan-500/15 border border-cyan-500/30 text-white"
                        : "hover:bg-surface text-slate-300"
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-slate-100">{gamer.name}</div>
                      <div className="text-[10px] text-slate-400">{gamer.email}</div>
                    </div>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${gamer.badgeColor}`}
                    >
                      {gamer.tag}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
