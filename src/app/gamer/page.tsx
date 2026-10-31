"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Gamepad2,
  Clock,
  Calendar,
  PauseCircle,
  PlayCircle,
  Lock,
  Unlock,
  Download,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Receipt,
  Printer,
  X,
  CreditCard,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import confetti from "canvas-confetti";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

export default function GamerPortalPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [activeGamerEmail, setActiveGamerEmail] = useState<string>("valkyrie_99@brightloop.gg");

  // Countdown timer state
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  // Pause modal state
  const [isPauseModalOpen, setIsPauseModalOpen] = useState(false);
  const [pauseDays, setPauseDays] = useState(14);
  const [pauseLoading, setPauseLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Parental Safety Gate state
  const [parentalPin, setParentalPin] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);

  // Receipt Modal state
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);

  // Fetch gamer profile
  const fetchGamerProfile = useCallback(async (email: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/gamer/user?email=${encodeURIComponent(email)}`);
      const json = await res.json();
      if (json.success) {
        setData(json);
        setParentEmail(json.currentUser?.parentEmail || "");
      }
    } catch (err) {
      console.error("Failed to load gamer profile", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("brightloop_active_gamer") || "valkyrie_99@brightloop.gg";
    setActiveGamerEmail(saved);
    fetchGamerProfile(saved);

    const handleGamerChange = (e: any) => {
      const email = e.detail;
      setActiveGamerEmail(email);
      fetchGamerProfile(email);
    };

    window.addEventListener("gamerPersonaChanged", handleGamerChange);
    return () => window.removeEventListener("gamerPersonaChanged", handleGamerChange);
  }, [fetchGamerProfile]);

  // Real-time Countdown Timer effect
  useEffect(() => {
    if (!data?.activeSubscription?.currentPeriodEnd) return;

    const target = new Date(data.activeSubscription.currentPeriodEnd).getTime();

    const updateCountdown = () => {
      const now = Date.now();
      const difference = target - now;

      if (difference <= 0 || data.activeSubscription.status === "PAUSED") {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      setTimeLeft({ days, hours, minutes, seconds });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [data?.activeSubscription]);

  // Handle Pause Subscription
  const handlePauseSubscription = async () => {
    if (!data?.activeSubscription?.id) return;
    try {
      setPauseLoading(true);
      setActionMessage(null);
      const res = await fetch(`/api/subscriptions/${data.activeSubscription.id}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pauseDays }),
      });
      const result = await res.json();
      if (result.success) {
        setActionMessage({ type: "success", text: result.message });
        setIsPauseModalOpen(false);
        fetchGamerProfile(activeGamerEmail);
      } else {
        setActionMessage({ type: "error", text: result.error });
      }
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Failed to pause subscription" });
    } finally {
      setPauseLoading(false);
    }
  };

  // Handle Resume Subscription
  const handleResumeSubscription = async () => {
    if (!data?.activeSubscription?.id) return;
    try {
      setPauseLoading(true);
      setActionMessage(null);
      const res = await fetch(`/api/subscriptions/${data.activeSubscription.id}/resume`, {
        method: "POST",
      });
      const result = await res.json();
      if (result.success) {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
        setActionMessage({ type: "success", text: result.message });
        fetchGamerProfile(activeGamerEmail);
      } else {
        setActionMessage({ type: "error", text: result.error });
      }
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Failed to resume subscription" });
    } finally {
      setPauseLoading(false);
    }
  };

  // Handle Parental Safety Gate Toggle
  const handleToggleParentalPin = async (enable: boolean) => {
    try {
      setPinLoading(true);
      const res = await fetch("/api/gamer/parental-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: data.currentUser.id,
          pin: enable ? parentalPin : "",
          enabled: enable,
          parentEmail,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setIsPinModalOpen(false);
        setParentalPin("");
        setActionMessage({ type: "success", text: result.message });
        fetchGamerProfile(activeGamerEmail);
      } else {
        setActionMessage({ type: "error", text: result.error });
      }
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Failed to update PIN" });
    } finally {
      setPinLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-slate-400">Loading Battlepass credentials...</span>
      </div>
    );
  }

  const sub = data?.activeSubscription;
  const plan = sub?.plan;
  const isFrozen = data?.currentUser?.isFrozen;
  const hasParentalPin = data?.currentUser?.hasParentalPin;

  // Real-time calculation of next charge date for pause modal
  const calculateProjectedNewChargeDate = () => {
    if (!sub?.currentPeriodEnd) return "N/A";
    const currentEnd = new Date(sub.currentPeriodEnd).getTime();
    const projected = new Date(currentEnd + pauseDays * 24 * 60 * 60 * 1000);
    return formatDate(projected);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Banner / Alerts */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between border ${
            actionMessage.type === "success"
              ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
              : "bg-rose-950/40 border-rose-500/40 text-rose-300"
          }`}
        >
          <div className="flex items-center space-x-3">
            {actionMessage.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            )}
            <span className="text-sm font-medium">{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Account Frozen Alert if 48h Trade Lock is Active */}
      {isFrozen && (
        <div className="p-4 rounded-xl bg-amber-950/50 border border-amber-500/60 text-amber-200 flex items-center justify-between shadow-lg">
          <div className="flex items-center space-x-3">
            <Lock className="w-6 h-6 text-amber-400 animate-bounce" />
            <div>
              <div className="font-bold text-sm">SECURITY TRADE LOCK ACTIVE (48H LOCKOUT)</div>
              <div className="text-xs text-amber-300/80">
                A suspicious cross-continent login was detected. In-game item trading, marketplace purchases, and credential transfers are frozen for your protection.
              </div>
            </div>
          </div>
          <span className="text-xs px-2.5 py-1 rounded bg-amber-500/20 border border-amber-500/40 font-mono font-bold">
            FROZEN
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Gamer Self-Service Portal
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-xs text-slate-400 font-mono">{data?.currentUser?.email}</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight mt-1 flex items-center gap-2">
            My Battlepass & Billing Hub
            <Sparkles className="w-6 h-6 text-cyan-400" />
          </h1>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => fetchGamerProfile(activeGamerEmail)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-surface border border-border text-xs text-slate-300 hover:text-white hover:bg-surface-hover transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: MY BATTLEPASS HERO CARD */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#101728] via-[#141e33] to-[#0a0f1d] border border-cyan-500/30 p-6 md:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Plan Info */}
          <div className="space-y-4 max-w-xl">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-neon-cyan">
                <Gamepad2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-2xl font-bold text-white tracking-wide font-sans">
                    {plan?.name || "No Active Battlepass"}
                  </h2>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${
                      sub?.status === "ACTIVE"
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                        : sub?.status === "PAUSED"
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                        : "bg-slate-700 text-slate-300 border-slate-600"
                    }`}
                  >
                    {sub?.status || "INACTIVE"}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Billing Period: <span className="font-semibold text-slate-300">{plan?.billingPeriod || "N/A"}</span> • Next Renewal:{" "}
                  <span className="font-semibold text-slate-300">{formatDate(sub?.currentPeriodEnd)}</span>
                </p>
              </div>
            </div>

            {/* Perks Status Matrix */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2">
              <div className="p-2.5 rounded-lg bg-surface/70 border border-border">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  Battlepass XP Boost
                </div>
                <div className="text-sm font-bold text-cyan-400 mt-0.5">
                  {sub?.status === "PAUSED" ? "⏸️ Frozen (+0%)" : isFrozen ? "🔒 Locked" : "⚡ +100% Boost"}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-surface/70 border border-border">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  Monthly Gem Drop
                </div>
                <div className="text-sm font-bold text-purple-400 mt-0.5">
                  {sub?.status === "ACTIVE" ? "💎 1,200 Gems" : "⏸️ Suspended"}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-surface/70 border border-border col-span-2 sm:col-span-1">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  Pause Protection
                </div>
                <div className="text-sm font-bold text-emerald-400 mt-0.5">
                  {plan?.allowPause ? `Allowed (${plan.maxPauseDays}d max)` : "❌ Not Eligible"}
                </div>
              </div>
            </div>
          </div>

          {/* Perks Countdown Timer Card */}
          <div className="bg-[#0b101c]/90 border border-border/80 rounded-xl p-5 sm:min-w-[320px] shadow-xl">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-3 pb-2 border-b border-border/60">
              <span className="flex items-center space-x-1.5 font-semibold text-slate-300">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span>PERKS ACTIVE COUNTDOWN</span>
              </span>
              <span className="text-[11px] font-mono text-cyan-400">
                {sub?.status === "PAUSED" ? "PAUSED" : "LIVE"}
              </span>
            </div>

            {sub?.status === "PAUSED" ? (
              <div className="text-center py-3">
                <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold">
                  <PauseCircle className="w-4 h-4" />
                  <span>Subscription is Currently Paused</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  Resume Date: <span className="font-semibold text-slate-200">{formatDate(sub.pauseResumeDate)}</span>
                </p>
                <button
                  onClick={handleResumeSubscription}
                  disabled={pauseLoading}
                  className="mt-3 w-full py-2 px-4 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 font-bold text-xs text-black transition-all shadow-neon-emerald flex items-center justify-center space-x-1.5"
                >
                  <PlayCircle className="w-4 h-4" />
                  <span>{pauseLoading ? "Resuming..." : "Resume Perks Now"}</span>
                </button>
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-surface/80 rounded-lg p-2 border border-border/60">
                    <div className="text-xl font-extrabold text-white font-mono">{timeLeft.days}</div>
                    <div className="text-[9px] uppercase tracking-wider text-slate-400 mt-0.5">Days</div>
                  </div>
                  <div className="bg-surface/80 rounded-lg p-2 border border-border/60">
                    <div className="text-xl font-extrabold text-white font-mono">{timeLeft.hours}</div>
                    <div className="text-[9px] uppercase tracking-wider text-slate-400 mt-0.5">Hours</div>
                  </div>
                  <div className="bg-surface/80 rounded-lg p-2 border border-border/60">
                    <div className="text-xl font-extrabold text-white font-mono">{timeLeft.minutes}</div>
                    <div className="text-[9px] uppercase tracking-wider text-slate-400 mt-0.5">Mins</div>
                  </div>
                  <div className="bg-surface/80 rounded-lg p-2 border border-border/60">
                    <div className="text-xl font-extrabold text-cyan-400 font-mono animate-pulse">{timeLeft.seconds}</div>
                    <div className="text-[9px] uppercase tracking-wider text-slate-400 mt-0.5">Secs</div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                  <span>Current Charge Rate:</span>
                  <span className="font-bold text-white text-sm font-mono">
                    {formatCurrency(plan?.price || 0)} / {plan?.billingPeriod?.toLowerCase()}
                  </span>
                </div>

                {/* Pause Button */}
                {plan?.allowPause && sub?.status === "ACTIVE" && (
                  <button
                    onClick={() => setIsPauseModalOpen(true)}
                    className="mt-3 w-full py-2 px-3 rounded-lg bg-surface hover:bg-surface-hover border border-border hover:border-amber-500/40 text-xs font-semibold text-slate-200 transition-colors flex items-center justify-center space-x-1.5"
                  >
                    <PauseCircle className="w-3.5 h-3.5 text-amber-400" />
                    <span>Pause Subscription (7, 14, 30 Days)</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 2: PARENTAL SAFETY GATE & SECURITY SETTINGS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-xl bg-surface-card border border-border p-6 shadow-card-glow">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Parental Safety Gate</h3>
                <p className="text-xs text-slate-400">Require 4-digit PIN for renewals & game store checkouts</p>
              </div>
            </div>

            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                hasParentalPin
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                  : "bg-slate-700/50 text-slate-400 border-slate-600"
              }`}
            >
              {hasParentalPin ? "ENABLED" : "DISABLED"}
            </span>
          </div>

          <div className="mt-5 space-y-3">
            <p className="text-xs text-slate-300 leading-relaxed">
              When enabled, a secret 4-digit numeric code must be entered before any subscription renewal, tier upgrade, or in-game coin pack is authorized.
            </p>

            <div className="flex items-center justify-between pt-2 border-t border-border/60">
              <div className="text-xs text-slate-400">
                Guardian Email: <span className="font-mono text-slate-200">{data?.currentUser?.parentEmail || "Not set"}</span>
              </div>
              <button
                onClick={() => setIsPinModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-hover border border-border hover:border-indigo-500/40 text-xs font-semibold text-indigo-300 transition-colors"
              >
                {hasParentalPin ? "Configure / Change PIN" : "Setup Parental PIN"}
              </button>
            </div>
          </div>
        </div>

        {/* Payment Methods Card */}
        <div className="rounded-xl bg-surface-card border border-border p-6 shadow-card-glow">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Billing & Payment Method</h3>
                <p className="text-xs text-slate-400">Primary billing instrument for automatic renewal</p>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              VISA •••• 4242
            </span>
          </div>

          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-300 bg-surface/50 p-2.5 rounded-lg border border-border/60">
              <div>
                <div className="font-semibold text-slate-200">Statutory Tax Compliance</div>
                <div className="text-[11px] text-slate-400">18% GST collected on all digital gaming services</div>
              </div>
              <span className="font-mono text-cyan-400 text-xs font-bold">18% GST</span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs text-slate-400">
              <span>Account Status:</span>
              <span className={`font-semibold ${isFrozen ? "text-amber-400 font-bold" : "text-emerald-400"}`}>
                {isFrozen ? "Trade Locked (48h)" : "Normal / Verified"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: INVOICES & RECEIPTS DOWNLOAD LIST */}
      <div className="rounded-xl bg-surface-card border border-border p-6 shadow-card-glow">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Receipt className="w-5 h-5 text-cyan-400" />
              Invoices & Billing History
            </h3>
            <p className="text-xs text-slate-400">
              Download tax invoices and receipts with statutory 18% GST breakdown
            </p>
          </div>
          <span className="text-xs text-slate-400">
            {data?.invoices?.length || 0} invoice(s) recorded
          </span>
        </div>

        {data?.invoices?.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            No invoices on record for this account.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0b101c] text-slate-400 uppercase text-[10px] tracking-wider border-b border-border">
                <tr>
                  <th className="py-3 px-4 font-semibold">Invoice ID</th>
                  <th className="py-3 px-4 font-semibold">Date Due / Issued</th>
                  <th className="py-3 px-4 font-semibold">Subtotal</th>
                  <th className="py-3 px-4 font-semibold">18% GST</th>
                  <th className="py-3 px-4 font-semibold">Total Amount</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 text-slate-300">
                {data.invoices.map((inv: any) => (
                  <tr key={inv.id} className="hover:bg-surface/50 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-200">
                      #{inv.id.slice(0, 8)}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">{formatDate(inv.dueDate)}</td>
                    <td className="py-3.5 px-4 font-mono">{formatCurrency(inv.amountSubtotal)}</td>
                    <td className="py-3.5 px-4 font-mono text-cyan-400/90">{formatCurrency(inv.taxAmount)}</td>
                    <td className="py-3.5 px-4 font-mono font-bold text-white">
                      {formatCurrency(inv.totalAmount)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                          inv.status === "PAID"
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                            : inv.status === "OVERDUE"
                            ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                            : inv.status === "CONFIRMED"
                            ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
                            : "bg-slate-700/50 text-slate-400 border-slate-600"
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => setSelectedInvoice(inv)}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-surface hover:bg-surface-hover border border-border text-xs text-slate-200 transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5 text-cyan-400" />
                        <span>View Receipt</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: PAUSE SUBSCRIPTION MODAL */}
      {isPauseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0f172a] border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center space-x-2">
                <PauseCircle className="w-5 h-5 text-amber-400" />
                <h3 className="text-lg font-bold text-white">Pause Battlepass Subscription</h3>
              </div>
              <button
                onClick={() => setIsPauseModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Taking a break from the arena? Freeze your billing and game perks. We will automatically advance your renewal date by the exact pause duration.
            </p>

            {/* Select Duration */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">Select Pause Duration:</label>
              <div className="grid grid-cols-3 gap-2">
                {[7, 14, 30].map((days) => {
                  const isExceeded = plan && days > plan.maxPauseDays;
                  return (
                    <button
                      key={days}
                      disabled={isExceeded}
                      onClick={() => setPauseDays(days)}
                      className={`p-3 rounded-xl border text-center transition-all ${
                        pauseDays === days && !isExceeded
                          ? "bg-amber-500/20 border-amber-500 text-amber-300 shadow-sm"
                          : isExceeded
                          ? "bg-surface/30 border-border/40 text-slate-600 cursor-not-allowed"
                          : "bg-surface border-border text-slate-300 hover:border-slate-500"
                      }`}
                    >
                      <div className="text-base font-bold">{days} Days</div>
                      <div className="text-[10px] mt-0.5 text-slate-400">
                        {isExceeded ? "Exceeds Plan" : "Pause Window"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Real-time Recalculation Preview */}
            <div className="bg-surface/70 rounded-xl p-3.5 border border-border/80 space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Current Expiry Date:</span>
                <span className="font-mono text-slate-200">{formatDate(sub?.currentPeriodEnd)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Selected Pause Duration:</span>
                <span className="font-mono text-amber-400 font-bold">+{pauseDays} Days</span>
              </div>
              <div className="pt-2 border-t border-border flex justify-between font-semibold">
                <span className="text-white">Projected Next Charge Date:</span>
                <span className="font-mono text-cyan-400 font-bold text-sm">
                  {calculateProjectedNewChargeDate()}
                </span>
              </div>
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setIsPauseModalOpen(false)}
                className="flex-1 py-2.5 rounded-lg bg-surface hover:bg-surface-hover border border-border text-xs font-semibold text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pauseLoading}
                onClick={handlePauseSubscription}
                className="flex-1 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs transition-colors flex items-center justify-center space-x-1.5"
              >
                <PauseCircle className="w-4 h-4" />
                <span>{pauseLoading ? "Pausing..." : "Confirm Pause"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: PARENTAL SAFETY PIN SETUP MODAL */}
      {isPinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0f172a] border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center space-x-2">
                <Lock className="w-5 h-5 text-indigo-400" />
                <h3 className="text-lg font-bold text-white">Parental Safety Gate Configuration</h3>
              </div>
              <button
                onClick={() => setIsPinModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Parent / Guardian Email:
                </label>
                <input
                  type="email"
                  value={parentEmail}
                  onChange={(e) => setParentEmail(e.target.value)}
                  placeholder="parent@example.com"
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  4-Digit Numeric PIN:
                </label>
                <input
                  type="password"
                  maxLength={4}
                  value={parentalPin}
                  onChange={(e) => setParentalPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="e.g. 1234"
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-center text-xl tracking-[0.5em] font-mono text-cyan-400 focus:outline-none focus:border-indigo-500"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Must be exactly 4 digits. Required on subscription renewal.
                </span>
              </div>
            </div>

            <div className="flex space-x-3 pt-3">
              {hasParentalPin && (
                <button
                  type="button"
                  disabled={pinLoading}
                  onClick={() => handleToggleParentalPin(false)}
                  className="py-2.5 px-4 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-300 font-semibold text-xs transition-colors"
                >
                  Disable PIN
                </button>
              )}
              <button
                type="button"
                disabled={pinLoading || parentalPin.length !== 4}
                onClick={() => handleToggleParentalPin(true)}
                className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 font-bold text-xs text-white transition-colors disabled:opacity-50"
              >
                {pinLoading ? "Saving..." : hasParentalPin ? "Update PIN" : "Enable Safety Gate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: INVOICE / RECEIPT VIEWER WITH STATUTORY 18% GST */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0f172a] border border-cyan-500/40 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center space-x-2">
                <Receipt className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-bold text-white">Official Tax Invoice & Receipt</h3>
              </div>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Receipt Card */}
            <div className="bg-[#0b101d] border border-border p-5 rounded-xl space-y-4 text-xs">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-extrabold text-base text-white tracking-wider font-mono">
                    BRIGHT<span className="text-cyan-400">LOOP</span> GAMING
                  </div>
                  <div className="text-[10px] text-slate-400">Statutory GSTIN: 27AABCB1234F1Z8</div>
                  <div className="text-[10px] text-slate-400">Digital Gaming Subscription Services</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-cyan-400 font-bold">#{selectedInvoice.id.slice(0, 8)}</div>
                  <div className="text-[10px] text-slate-400">{formatDate(selectedInvoice.dueDate)}</div>
                  <span
                    className={`inline-block mt-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
                      selectedInvoice.status === "PAID"
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                        : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                    }`}
                  >
                    {selectedInvoice.status}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-border/80">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  Billed To:
                </div>
                <div className="font-semibold text-slate-200">{data?.currentUser?.email}</div>
                <div className="text-slate-400">Gaming Account ID: {data?.currentUser?.id.slice(0, 12)}</div>
              </div>

              {/* Line items */}
              <div className="space-y-1.5 pt-2 border-t border-border/80">
                <div className="flex justify-between text-slate-300">
                  <span>Gaming Pass Tier Access</span>
                  <span className="font-mono">{formatCurrency(selectedInvoice.amountSubtotal)}</span>
                </div>
                {selectedInvoice.discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-400">
                    <span>Promotional Discount Applied</span>
                    <span className="font-mono">-{formatCurrency(selectedInvoice.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-400">
                  <span>CGST (9.0%) + SGST (9.0%) [18% GST]</span>
                  <span className="font-mono text-cyan-400">{formatCurrency(selectedInvoice.taxAmount)}</span>
                </div>
                <div className="pt-2 border-t border-border flex justify-between text-sm font-bold text-white">
                  <span>Total Amount Paid / Due:</span>
                  <span className="font-mono text-cyan-400">{formatCurrency(selectedInvoice.totalAmount)}</span>
                </div>
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 rounded-lg bg-surface hover:bg-surface-hover border border-border text-xs font-semibold text-slate-200 transition-colors flex items-center justify-center space-x-1.5"
              >
                <Printer className="w-4 h-4 text-cyan-400" />
                <span>Print Receipt</span>
              </button>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-black font-bold text-xs transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
