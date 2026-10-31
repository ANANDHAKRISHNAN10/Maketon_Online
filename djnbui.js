"use client";

import { useState } from "react";
import { AlertTriangle, TrendingUp, Users, Download } from "lucide-react";

export default function FinancePage() {
  const [leakage, setLeakage] = useState(149.98);
  const [reconciled, setReconciled] = useState(false);

  const report = `# Brightloop Gaming – Executive Report

## Financial Overview
- Monthly Recurring Revenue: $24,850
- Churn Rate: 4.8%
- Detected Revenue Leakage: $${leakage.toFixed(2)}

## Recovery Actions
1. Review subscriptions without invoices.
2. Investigate duplicate invoices.
3. Review expired discount applications.
4. Reconcile unlinked payments.

## Recommendation
Prioritize overdue accounts and investigate suspicious transactions.
`;

  const downloadReport = () => {
    const blob = new Blob([report], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "brightloop-executive-report.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-violet-400">ADMIN / FINANCE</p>
        <h1 className="mt-2 text-3xl font-bold">Financial Intelligence</h1>
        <p className="mt-1 text-gray-400">Revenue monitoring and predictive analytics.</p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-[#141421] p-6">
          <TrendingUp className="text-green-400" />
          <p className="mt-4 text-sm text-gray-400">Monthly Recurring Revenue</p>
          <h2 className="mt-2 text-3xl font-bold">$24,850</h2>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#141421] p-6">
          <Users className="text-violet-400" />
          <p className="mt-4 text-sm text-gray-400">Churn Rate</p>
          <h2 className="mt-2 text-3xl font-bold">4.8%</h2>
        </div>
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6">
          <AlertTriangle className="text-red-400" />
          <p className="mt-4 text-sm text-gray-400">Revenue Leakage Detected</p>
          <h2 className="mt-2 text-3xl font-bold text-red-400">
            ${leakage.toFixed(2)}
          </h2>
          <button
            onClick={() => {
              if (window.confirm("Reconcile all detected demo leakages?")) {
                setLeakage(0);
                setReconciled(true);
              }
            }}
            className="mt-4 w-full rounded-lg bg-red-600 py-2 text-sm font-medium hover:bg-red-500">
            Auto-Reconcile All
          </button>
          {reconciled && <p className="mt-2 text-xs text-green-400">Demo reconciliation completed.</p>}
        </div>
      </div>

      <section className="rounded-2xl border border-white/10 bg-[#141421] p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">AI Executive Report</h2>
            <p className="mt-1 text-sm text-gray-400">Financial performance and recovery strategy.</p>
          </div>
          <button onClick={downloadReport}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm hover:bg-violet-500">
            <Download size={16} /> Export Markdown
          </button>
        </div>

        <pre className="mt-6 whitespace-pre-wrap rounded-xl bg-[#1d1d2b] p-5 text-sm leading-7 text-gray-300">
          {report}
        </pre>
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#141421] p-6">
        <h2 className="text-xl font-semibold">Churn Radar</h2>
        <p className="mt-1 text-sm text-gray-400">High-risk subscribers requiring retention campaigns.</p>

        {[
          { name: "gamer_102", risk: "92%", amount: "$14.99" },
          { name: "gamer_245", risk: "81%", amount: "$29.99" },
          { name: "gamer_310", risk: "74%", amount: "$9.99" },
        ].map((gamer) => (
          <div key={gamer.name} className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-[#1d1d2b] p-4">
            <div>
              <p className="font-semibold">{gamer.name}</p>
              <p className="mt-1 text-xs text-gray-400">Risk score: {gamer.risk} · Subscription: {gamer.amount}</p>
            </div>
            <button
              onClick={() => alert(`Demo: 15% retention promo prepared for ${gamer.name}`)}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm hover:bg-violet-500">
              Send 15% Retention Promo
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}