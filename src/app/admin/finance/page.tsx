"use client";

import React, { useState, useEffect } from "react";
import {
  BarChart3,
  DollarSign,
  AlertOctagon,
  Wrench,
  Download,
  Copy,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Send,
  TrendingDown,
  TrendingUp,
  FileText,
  Sparkles,
  Zap,
  Tag,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";
import confetti from "canvas-confetti";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function FinancialIntelligencePage() {
  const [loading, setLoading] = useState(true);
  const [leakageData, setLeakageData] = useState<any>(null);
  const [churnData, setChurnData] = useState<any>(null);
  const [reportData, setReportData] = useState<any>(null);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [isReconciling, setIsReconciling] = useState(false);
  const [isGeneratingInvoices, setIsGeneratingInvoices] = useState(false);
  const [promoLoading, setPromoLoading] = useState<string | null>(null);
  const [copiedReport, setCopiedReport] = useState(false);

  const fetchFinanceData = async () => {
    try {
      setLoading(true);
      const [leakageRes, churnRes, reportRes] = await Promise.all([
        fetch("/api/intelligence/revenue-leakage"),
        fetch("/api/intelligence/churn-prediction"),
        fetch("/api/intelligence/executive-report"),
      ]);

      const [leakageJson, churnJson, reportJson] = await Promise.all([
        leakageRes.json(),
        churnRes.json(),
        reportRes.json(),
      ]);

      if (leakageJson.success) setLeakageData(leakageJson);
      if (churnJson.success) setChurnData(churnJson);
      if (reportJson.success) setReportData(reportJson);
    } catch (err) {
      console.error("Failed to load financial intelligence data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFinanceData();
  }, []);

  // One-Click Auto-Reconcile All Leakages
  const handleAutoReconcileAll = async (type?: string, id?: string) => {
    try {
      setIsReconciling(true);
      setActionMessage(null);
      const url = type && id
        ? `/api/intelligence/revenue-leakage/reconcile?type=${type}&id=${id}`
        : "/api/intelligence/revenue-leakage/reconcile";

      const res = await fetch(url, { method: "POST" });
      const result = await res.json();
      if (result.success) {
        confetti({ particleCount: 70, spread: 60, origin: { y: 0.5 } });
        setActionMessage({ type: "success", text: result.message });
        fetchFinanceData();
      } else {
        setActionMessage({ type: "error", text: result.error });
      }
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Reconciliation failed" });
    } finally {
      setIsReconciling(false);
    }
  };

  // Run Billing Invoice Generation
  const handleGenerateInvoices = async () => {
    try {
      setIsGeneratingInvoices(true);
      setActionMessage(null);
      const res = await fetch("/api/billing/generate-invoices", { method: "POST" });
      const result = await res.json();
      if (result.success) {
        setActionMessage({ type: "success", text: result.message });
        fetchFinanceData();
      } else {
        setActionMessage({ type: "error", text: result.error });
      }
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Failed to generate invoices" });
    } finally {
      setIsGeneratingInvoices(false);
    }
  };

  // Dispatch 15% VIP Retention Promo Code
  const handleSendRetentionPromo = async (userId: string, userEmail: string) => {
    try {
      setPromoLoading(userId);
      setActionMessage(null);
      const res = await fetch("/api/retention-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, userEmail, discountPercent: 15 }),
      });
      const result = await res.json();
      if (result.success) {
        setActionMessage({
          type: "success",
          text: `VIP 15% retention promo coupon '${result.discountCode}' dispatched to ${userEmail}!`,
        });
        fetchFinanceData();
      } else {
        setActionMessage({ type: "error", text: result.error });
      }
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Failed to dispatch promo" });
    } finally {
      setPromoLoading(null);
    }
  };

  // Export Executive Report as Markdown File
  const handleDownloadMarkdown = () => {
    if (!reportData?.markdownReport) return;
    const blob = new Blob([reportData.markdownReport], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Brightloop-Executive-Financial-Report-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Copy Markdown to Clipboard
  const handleCopyMarkdown = () => {
    if (!reportData?.markdownReport) return;
    navigator.clipboard.writeText(reportData.markdownReport);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2000);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Alert banner */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between border ${
            actionMessage.type === "success"
              ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
              : "bg-rose-950/40 border-rose-500/40 text-rose-300"
          }`}
        >
          <div className="flex items-center space-x-3">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-medium">{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-slate-400 hover:text-white"
          >
            &times;
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Financial Intelligence & AI Reporting
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-xs text-slate-400">Ledger Health & Retention Hub</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight mt-1 flex items-center gap-2">
            Revenue Leakage & Churn Radar
            <BarChart3 className="w-6 h-6 text-emerald-400" />
          </h1>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleGenerateInvoices}
            disabled={isGeneratingInvoices}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-surface border border-border text-xs text-slate-200 hover:text-white hover:bg-surface-hover transition-colors"
          >
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
            <span>{isGeneratingInvoices ? "Billing..." : "Run Renewal Invoicing"}</span>
          </button>

          <button
            onClick={fetchFinanceData}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-surface border border-border text-xs text-slate-300 hover:text-white hover:bg-surface-hover transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: LIVE REVENUE LEAKAGE CARD */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#121820] via-[#102022] to-[#0a1215] border border-cyan-500/40 p-6 md:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-xl">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
              <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">
                Automated Ledger Audit Scanner
              </span>
            </div>

            <div>
              <div className="text-xs text-slate-400">Total Uncaptured / Leaking Capital:</div>
              <div className="text-4xl md:text-5xl font-extrabold font-mono text-gradient-cyan mt-1">
                {formatCurrency(leakageData?.totalImpactAmount || 0)}
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Detected across <span className="font-bold text-white">{leakageData?.totalLeakageCount || 0} issue(s)</span>: Unbilled active subscriptions, orphaned success payments, and unauthorized draft discount deductions.
            </p>
          </div>

          {/* Action Trigger */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-3 min-w-[240px]">
            <button
              onClick={() => handleAutoReconcileAll()}
              disabled={isReconciling || (leakageData?.totalLeakageCount === 0)}
              className="py-3 px-5 rounded-xl bg-gradient-to-r from-cyan-400 via-emerald-400 to-teal-400 hover:from-cyan-500 hover:to-emerald-500 text-black font-extrabold text-sm transition-all shadow-neon-cyan flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              <Wrench className="w-4 h-4" />
              <span>{isReconciling ? "Reconciling..." : "Auto-Reconcile All"}</span>
            </button>
            <div className="text-center text-[10px] text-slate-400">
              One-click atomic ledger fix via Prisma transaction
            </div>
          </div>
        </div>

        {/* 4 Leakage Categories Breakdown */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 pt-6 border-t border-border/80 text-xs">
          <div className="bg-surface/60 p-3 rounded-lg border border-border/60">
            <div className="text-slate-400 text-[11px]">Active Sub w/o Invoice</div>
            <div className="text-base font-bold text-white font-mono mt-0.5">
              {formatCurrency(leakageData?.breakdown?.activeSubWithoutInvoice?.amount || 0)}
            </div>
            <div className="text-[10px] text-rose-400 mt-0.5">
              {leakageData?.breakdown?.activeSubWithoutInvoice?.count || 0} account(s)
            </div>
          </div>

          <div className="bg-surface/60 p-3 rounded-lg border border-border/60">
            <div className="text-slate-400 text-[11px]">Duplicate Invoices</div>
            <div className="text-base font-bold text-white font-mono mt-0.5">
              {formatCurrency(leakageData?.breakdown?.duplicateInvoices?.amount || 0)}
            </div>
            <div className="text-[10px] text-amber-400 mt-0.5">
              {leakageData?.breakdown?.duplicateInvoices?.count || 0} duplicate(s)
            </div>
          </div>

          <div className="bg-surface/60 p-3 rounded-lg border border-border/60">
            <div className="text-slate-400 text-[11px]">Expired Discount Applied</div>
            <div className="text-base font-bold text-white font-mono mt-0.5">
              {formatCurrency(leakageData?.breakdown?.expiredDiscountApplied?.amount || 0)}
            </div>
            <div className="text-[10px] text-amber-400 mt-0.5">
              {leakageData?.breakdown?.expiredDiscountApplied?.count || 0} invoice(s)
            </div>
          </div>

          <div className="bg-surface/60 p-3 rounded-lg border border-border/60">
            <div className="text-slate-400 text-[11px]">Unlinked Success Payment</div>
            <div className="text-base font-bold text-white font-mono mt-0.5">
              {formatCurrency(leakageData?.breakdown?.unlinkedSuccessPayment?.amount || 0)}
            </div>
            <div className="text-[10px] text-cyan-400 mt-0.5">
              {leakageData?.breakdown?.unlinkedSuccessPayment?.count || 0} payment(s)
            </div>
          </div>
        </div>

        {/* Itemized Leakage Table */}
        {leakageData?.items?.length > 0 && (
          <div className="mt-6 bg-[#0a0f18] rounded-xl border border-border/80 overflow-hidden">
            <div className="px-4 py-2.5 bg-[#0e1522] border-b border-border text-xs font-semibold text-slate-200">
              Detected Leakage Audit Items
            </div>
            <div className="divide-y divide-border/60">
              {leakageData.items.map((item: any) => (
                <div
                  key={item.id}
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface/40 transition-colors text-xs"
                >
                  <div className="space-y-0.5 max-w-xl">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-white">{item.entityName}</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-surface border border-border font-mono text-slate-400">
                        {item.type}
                      </span>
                    </div>
                    <p className="text-slate-300">{item.description}</p>
                    <div className="text-[10px] text-cyan-400 font-medium">
                      Action: {item.suggestedAction}
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <span className="font-mono font-bold text-rose-400 text-sm">
                      {formatCurrency(item.impactAmount)}
                    </span>
                    <button
                      onClick={() => handleAutoReconcileAll(item.type, item.entityId)}
                      className="px-2.5 py-1 rounded bg-surface hover:bg-surface-hover border border-border hover:border-cyan-500/50 text-[11px] font-semibold text-cyan-300 transition-colors"
                    >
                      Fix Item
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: CHURN RADAR */}
      <div className="rounded-xl bg-surface-card border border-border p-6 shadow-card-glow space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/80 pb-3">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-rose-400" />
              Subscriber Churn Radar (Multi-Factor Scoring 0–100)
            </h3>
            <p className="text-xs text-slate-400">
              Evaluates: Failed Payments (30%) + Pause Frequency (25%) + Days to Expiry (20%) + Account Tenure (25%)
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Avg Risk: <strong className="text-white">{churnData?.averageRiskScore || 0}/100</strong>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0b101c] text-slate-400 uppercase text-[10px] tracking-wider border-b border-border">
              <tr>
                <th className="py-3 px-4 font-semibold">Subscriber / Gamer</th>
                <th className="py-3 px-4 font-semibold">Current Plan</th>
                <th className="py-3 px-4 font-semibold">Risk Score</th>
                <th className="py-3 px-4 font-semibold">Risk Factors (Fail / Pause / Exp / Ten)</th>
                <th className="py-3 px-4 font-semibold">Recommendation</th>
                <th className="py-3 px-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 text-slate-300">
              {churnData?.predictions?.map((gamer: any) => {
                const b = gamer.breakdown;
                return (
                  <tr key={gamer.userId} className="hover:bg-surface/50">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white">{gamer.email}</div>
                      <div className="text-[10px] text-slate-400">
                        Tenure: {gamer.metrics.accountAgeDays}d • Expires in: {gamer.metrics.daysUntilExpiry}d
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-200">
                      {gamer.currentPlan}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`font-mono font-extrabold text-sm px-2 py-0.5 rounded border ${
                            gamer.riskScore >= 70
                              ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                              : gamer.riskScore >= 50
                              ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                              : gamer.riskScore >= 30
                              ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/40"
                              : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                          }`}
                        >
                          {gamer.riskScore}/100
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">
                          {gamer.riskLevel}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-400">
                      <span className="text-rose-400" title="Failed Payments (30%)">
                        {b.failedPaymentsFactor}
                      </span>{" "}
                      /{" "}
                      <span className="text-amber-400" title="Pause Frequency (25%)">
                        {b.pauseFrequencyFactor}
                      </span>{" "}
                      /{" "}
                      <span className="text-cyan-400" title="Days to Expiry (20%)">
                        {b.daysToExpiryFactor}
                      </span>{" "}
                      /{" "}
                      <span className="text-purple-400" title="Account Tenure (25%)">
                        {b.accountTenureFactor}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-300 text-[11px]">
                      {gamer.recommendation}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleSendRetentionPromo(gamer.userId, gamer.email)}
                        disabled={promoLoading === gamer.userId}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white font-semibold text-xs transition-colors shadow-sm"
                      >
                        <Tag className="w-3.5 h-3.5 text-cyan-300" />
                        <span>
                          {promoLoading === gamer.userId ? "Sending..." : "Send 15% Retention Promo"}
                        </span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 3: AI EXECUTIVE REPORT VIEWER */}
      <div className="rounded-xl bg-surface-card border border-border p-6 shadow-card-glow space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <FileText className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">AI Financial Executive Briefing</h3>
              <p className="text-xs text-slate-400">
                MRR trajectory, churn diagnostics, and ranked collections priority matrix
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopyMarkdown}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-hover border border-border text-xs text-slate-200 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedReport ? "Copied!" : "Copy Markdown"}</span>
            </button>
            <button
              onClick={handleDownloadMarkdown}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-black font-bold text-xs transition-colors shadow-neon-cyan"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export .md</span>
            </button>
          </div>
        </div>

        {/* Rendered Markdown Preview Area */}
        <div className="bg-[#090d15] rounded-xl p-5 border border-border font-mono text-xs text-slate-200 overflow-x-auto max-h-[460px] overflow-y-auto leading-relaxed whitespace-pre-wrap selection:bg-cyan-500/30">
          {reportData?.markdownReport || "Generating report..."}
        </div>
      </div>
    </div>
  );
}
