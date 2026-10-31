import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Search,
  Sparkles,
  TrendingDown,
  Wrench,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AdminSubnav } from '../components/AdminSubnav';

export function AdminFinancePage() {
  const { user, authFetch } = useAuth();

  const [leakageData, setLeakageData] = useState<any>(null);
  const [churnData, setChurnData] = useState<any>(null);
  const [execReport, setExecReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [investigatedIssue, setInvestigatedIssue] = useState<any | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [activeTab, setActiveTab] = useState<'leakage' | 'churn' | 'report'>('leakage');

  const loadFinanceIntelligence = async () => {
    setLoading(true);
    try {
      const [leakRes, churnRes, repRes] = await Promise.all([
        authFetch('/api/intelligence/revenue-leakage'),
        authFetch('/api/intelligence/churn-prediction'),
        authFetch('/api/intelligence/executive-report'),
      ]);
      if (leakRes.ok) setLeakageData(await leakRes.json());
      if (churnRes.ok) setChurnData(await churnRes.json());
      if (repRes.ok) setExecReport(await repRes.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && (user.role === 'ADMIN' || user.role === 'STAFF')) {
      loadFinanceIntelligence();
    }
  }, [user?.id, user?.role]);

  const handleFixSingleIssue = async (issueId: string) => {
    setReconciling(true);
    setFeedback(null);
    try {
      const res = await authFetch('/api/intelligence/fix-leakage', {
        method: 'POST',
        body: JSON.stringify({ issueId }),
      });
      const json = await res.json();
      if (res.ok) {
        setFeedback({
          type: 'success',
          message: `Fixed Issue: ${json.resolutionSummary} (Recovered $${(json.recoveredCents / 100).toFixed(2)})`,
        });
        setInvestigatedIssue(null);
        await loadFinanceIntelligence();
      } else {
        setFeedback({ type: 'error', message: json.error || 'Could not fix leakage issue.' });
      }
    } finally {
      setReconciling(false);
    }
  };

  const handleAutoReconcileAll = async () => {
    setReconciling(true);
    setFeedback(null);
    try {
      const res = await authFetch('/api/intelligence/auto-reconcile', {
        method: 'POST',
      });
      const json = await res.json();
      if (res.ok) {
        setFeedback({
          type: 'success',
          message: `Auto-Reconcile Complete: Resolved ${json.reconciledCount} anomalies and recovered $${(
            json.totalRecoveredCents / 100
          ).toFixed(2)} in billing ledger value.`,
        });
        await loadFinanceIntelligence();
      } else {
        setFeedback({ type: 'error', message: json.error || 'Auto-reconcile failed.' });
      }
    } finally {
      setReconciling(false);
    }
  };

  const handleApplyRetentionPromo = async (subscriptionId: string, customerName: string) => {
    setFeedback(null);
    const res = await authFetch('/api/intelligence/apply-retention', {
      method: 'POST',
      body: JSON.stringify({ subscriptionId }),
    });
    const json = await res.json();
    if (res.ok) {
      setFeedback({
        type: 'success',
        message: `15% Retention Promo (RETENTION15) activated for ${customerName}.`,
      });
      await loadFinanceIntelligence();
    } else {
      setFeedback({ type: 'error', message: json.error });
    }
  };

  const handleExportMarkdown = () => {
    if (!execReport?.markdown) return;
    const blob = new Blob([execReport.markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Brightloop-Executive-Report-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleResetSeed = async () => {
    const res = await authFetch('/api/admin/reset-seed', { method: 'POST' });
    if (res.ok) {
      setFeedback({
        type: 'success',
        message: 'Seed data restored! All 4 revenue leakage anomalies are ready for demonstration again.',
      });
      await loadFinanceIntelligence();
    }
  };

  if (user?.role === 'GAMER') {
    return <AdminSubnav />;
  }

  const issues: any[] = leakageData?.issues || [];
  const subscribers: any[] = churnData?.subscribers || [];

  return (
    <div className="min-h-screen bg-[#FFFBF5] pb-20">
      <AdminSubnav onResetSeed={handleResetSeed} />

      <div className="max-w-7xl mx-auto px-6 mt-8 space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-orange-600">
              Revenue Assurance, Churn Prediction & Executive Brief · /admin/finance
            </p>
            <h1 className="font-display text-3xl font-extrabold text-stone-900 tracking-tight">
              Revenue Intelligence & Churn Center
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {issues.length > 0 && (
              <button
                type="button"
                onClick={handleAutoReconcileAll}
                disabled={reconciling}
                className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-display font-bold text-xs rounded-xl shadow-sm flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Wrench className="w-4 h-4" />
                <span>
                  {reconciling
                    ? 'Reconciling Ledger...'
                    : `Auto-Reconcile All (${issues.length} Issues · $${(
                        (leakageData?.totalLeakageCents || 0) / 100
                      ).toFixed(2)})`}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={handleExportMarkdown}
              className="px-4 py-2.5 bg-white border border-orange-300 hover:bg-orange-50 text-orange-700 font-display font-bold text-xs rounded-xl flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              <span>Export Executive Report (.md)</span>
            </button>
          </div>
        </div>

        {feedback && (
          <div
            className={`p-4 rounded-2xl text-sm font-medium flex items-center justify-between ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                : 'bg-red-50 text-red-900 border border-red-200'
            }`}
          >
            <span>{feedback.message}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-xs underline ml-4 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Sub-navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-orange-100/80 rounded-2xl w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('leakage')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
              activeTab === 'leakage' ? 'bg-white text-orange-600 shadow-xs' : 'text-stone-600'
            }`}
          >
            Revenue Leakage Detector ({issues.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('churn')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
              activeTab === 'churn' ? 'bg-white text-orange-600 shadow-xs' : 'text-stone-600'
            }`}
          >
            Churn Prediction (0–100 Weighted Score)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('report')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
              activeTab === 'report' ? 'bg-white text-orange-600 shadow-xs' : 'text-stone-600'
            }`}
          >
            Executive Financial Markdown Report
          </button>
        </div>

        {/* TAB 1: REVENUE LEAKAGE DETECTION & RECONCILIATION */}
        {activeTab === 'leakage' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl border border-orange-200/80 p-5">
                <p className="text-xs text-stone-500">Total Detected Leakage</p>
                <p className="font-mono text-2xl font-extrabold text-red-600 mt-1 tabular-nums">
                  ${((leakageData?.totalLeakageCents || 0) / 100).toFixed(2)}
                </p>
                <p className="text-xs text-stone-500 mt-1">{issues.length} anomalies open</p>
              </div>
              <div className="bg-white rounded-2xl border border-orange-200/80 p-5">
                <p className="text-xs text-stone-500">Uninvoiced Active Subs</p>
                <p className="font-mono text-xl font-bold text-stone-900 mt-1 tabular-nums">
                  ${((leakageData?.summaryByType?.ACTIVE_SUB_WITHOUT_INVOICE || 0) / 100).toFixed(2)}
                </p>
              </div>
              <div className="bg-white rounded-2xl border border-orange-200/80 p-5">
                <p className="text-xs text-stone-500">Duplicate & Expired Promos</p>
                <p className="font-mono text-xl font-bold text-stone-900 mt-1 tabular-nums">
                  $
                  {(
                    ((leakageData?.summaryByType?.DUPLICATE_PERIOD_INVOICE || 0) +
                      (leakageData?.summaryByType?.EXPIRED_DISCOUNT_ON_DRAFT || 0)) /
                    100
                  ).toFixed(2)}
                </p>
              </div>
              <div className="bg-white rounded-2xl border border-orange-200/80 p-5">
                <p className="text-xs text-stone-500">Unlinked Settlements</p>
                <p className="font-mono text-xl font-bold text-stone-900 mt-1 tabular-nums">
                  ${((leakageData?.summaryByType?.UNLINKED_SUCCESS_PAYMENT || 0) / 100).toFixed(2)}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-orange-200/80 p-6 shadow-sm">
              <h2 className="font-display text-xl font-bold text-stone-900 mb-4">
                Detected Billing & Settlement Anomalies
              </h2>

              {issues.length === 0 ? (
                <div className="py-12 text-center space-y-3 bg-emerald-50/50 rounded-2xl border border-emerald-200">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                  <p className="font-display font-bold text-base text-emerald-950">
                    All Revenue Ledgers Reconciled ($0.00 Leakage)
                  </p>
                  <p className="text-xs text-emerald-800">
                    Use the &ldquo;Reset Demo Seed Data&rdquo; button in the top bar if you want to re-run the leakage reconciliation demo.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-stone-200 text-xs text-stone-500">
                        <th className="py-3 px-4">Anomaly Type</th>
                        <th className="py-3 px-4">Affected Customer</th>
                        <th className="py-3 px-4 text-right">Financial Impact</th>
                        <th className="py-3 px-4">Severity</th>
                        <th className="py-3 px-4">Suggested Correction</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 text-sm">
                      {issues.map((issue) => (
                        <tr key={issue.id} className="hover:bg-amber-50/40">
                          <td className="py-4 px-4">
                            <p className="font-bold text-stone-900">{issue.title}</p>
                            <p className="text-xs font-mono text-stone-500">{issue.issueType}</p>
                          </td>
                          <td className="py-4 px-4">
                            <p className="font-semibold text-stone-900">{issue.customerName}</p>
                            <p className="text-xs font-mono text-stone-500">{issue.customerEmail}</p>
                          </td>
                          <td className="py-4 px-4 text-right font-mono font-bold text-red-600 tabular-nums">
                            ${(issue.financialImpactCents / 100).toFixed(2)}
                          </td>
                          <td className="py-4 px-4 text-xs font-bold">
                            <span
                              className={
                                issue.severity === 'CRITICAL' ? 'text-red-600' : 'text-amber-700'
                              }
                            >
                              {issue.severity}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-xs text-stone-600 max-w-xs">
                            {issue.suggestedCorrection}
                          </td>
                          <td className="py-4 px-4 text-right space-x-2 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setInvestigatedIssue(issue)}
                              className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold rounded-lg inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Search className="w-3.5 h-3.5" />
                              <span>Investigate</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleFixSingleIssue(issue.id)}
                              disabled={reconciling}
                              className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Wrench className="w-3.5 h-3.5" />
                              <span>Fix Issue</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: CHURN PREDICTION ENGINE */}
        {activeTab === 'churn' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-3xl border border-red-200 p-6">
                <p className="text-xs font-bold text-red-600">High Risk Subscribers (60–100)</p>
                <p className="font-mono text-3xl font-extrabold text-stone-900 mt-1 tabular-nums">
                  {churnData?.groups?.highRisk?.length || 0}
                </p>
                <p className="text-xs text-stone-600 mt-1">
                  Eligible for immediate 15% retention promo (RETENTION15)
                </p>
              </div>
              <div className="bg-white rounded-3xl border border-amber-200 p-6">
                <p className="text-xs font-bold text-amber-700">Medium Risk Subscribers (35–59)</p>
                <p className="font-mono text-3xl font-extrabold text-stone-900 mt-1 tabular-nums">
                  {churnData?.groups?.mediumRisk?.length || 0}
                </p>
                <p className="text-xs text-stone-600 mt-1">
                  Monitor pause frequency & upcoming expiry window
                </p>
              </div>
              <div className="bg-white rounded-3xl border border-emerald-200 p-6">
                <p className="text-xs font-bold text-emerald-700">Low Risk Subscribers (0–34)</p>
                <p className="font-mono text-3xl font-extrabold text-stone-900 mt-1 tabular-nums">
                  {churnData?.groups?.lowRisk?.length || 0}
                </p>
                <p className="text-xs text-stone-600 mt-1">
                  Strong tenure and clean payment history
                </p>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-orange-200/80 p-6 shadow-sm">
              <div className="mb-4">
                <h2 className="font-display text-xl font-bold text-stone-900">
                  Subscriber Churn Risk Matrix
                </h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Weighted Model: Failed Payments (30%) · Pause Frequency (25%) · Days to Expiry (20%) · Account Tenure (25%)
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-stone-200 text-xs text-stone-500">
                      <th className="py-3 px-4">Subscriber</th>
                      <th className="py-3 px-4">Plan</th>
                      <th className="py-3 px-4 text-right">Risk Score (0–100)</th>
                      <th className="py-3 px-4">Weight Breakdown (30/25/20/25)</th>
                      <th className="py-3 px-4">Suggested Retention Action</th>
                      <th className="py-3 px-4 text-right">Intervention</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-sm">
                    {subscribers.map((sub) => (
                      <tr key={sub.subscriptionId} className="hover:bg-amber-50/40">
                        <td className="py-4 px-4">
                          <p className="font-semibold text-stone-900">{sub.userName}</p>
                          <p className="text-xs font-mono text-stone-500">{sub.userEmail}</p>
                        </td>
                        <td className="py-4 px-4 text-xs">
                          <span className="font-semibold text-stone-900">{sub.planName}</span>
                          <span className="block font-mono text-stone-500">
                            ${(sub.planPriceCents / 100).toFixed(2)}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-right font-mono font-extrabold tabular-nums">
                          <span
                            className={
                              sub.riskTier === 'HIGH'
                                ? 'text-red-600'
                                : sub.riskTier === 'MEDIUM'
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                            }
                          >
                            {sub.riskScore}/100 ({sub.riskTier})
                          </span>
                        </td>
                        <td className="py-4 px-4 text-xs font-mono text-stone-600">
                          Fail:{sub.factors.failedPayments} (+{sub.factors.failedPaymentWeightScore}) · Pause:
                          {sub.factors.pauseFrequency} (+{sub.factors.pauseWeightScore}) · Exp:
                          {sub.factors.daysToExpiry}d (+{sub.factors.expiryWeightScore}) · Tenure:
                          {sub.factors.tenureDays}d (+{sub.factors.tenureWeightScore})
                        </td>
                        <td className="py-4 px-4 text-xs text-stone-600 max-w-xs">
                          {sub.suggestedAction}
                        </td>
                        <td className="py-4 px-4 text-right whitespace-nowrap">
                          {sub.retentionPromoApplied ? (
                            <span className="text-xs font-bold text-emerald-700">
                              RETENTION15 Applied ✓
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleApplyRetentionPromo(sub.subscriptionId, sub.userName)}
                              className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Apply 15% Promo</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: EXECUTIVE FINANCIAL MARKDOWN REPORT */}
        {activeTab === 'report' && execReport && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-5 bg-white rounded-3xl border border-orange-200/80 p-6 shadow-sm space-y-4">
              <h2 className="font-display text-lg font-bold text-stone-900">
                Overdue Collection Priorities (Amount × Days Overdue)
              </h2>
              <p className="text-xs text-stone-600">
                Ranked automatically to maximize immediate cash-flow recovery.
              </p>

              <div className="space-y-3">
                {execReport.rankedOverdue?.map((o: any, idx: number) => (
                  <div
                    key={o.id}
                    className="p-4 rounded-2xl bg-amber-50/70 border border-orange-200 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-xs font-bold text-orange-800">
                        Priority #{idx + 1} · {o.invoiceNumber}
                      </p>
                      <p className="text-sm font-bold text-stone-900 mt-0.5">{o.customerName}</p>
                      <p className="text-xs text-stone-500">
                        ${(o.totalAmount / 100).toFixed(2)} · {o.daysOverdue} days overdue
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] text-stone-500 block">Priority Score</span>
                      <span className="font-mono text-lg font-extrabold text-red-600 tabular-nums">
                        {o.priorityScore.toFixed(1)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-7 bg-white rounded-3xl border border-orange-200/80 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-orange-600 text-xs font-semibold">
                  <FileText className="w-4 h-4" />
                  <span>Live Markdown Source Preview</span>
                </div>
                <button
                  type="button"
                  onClick={handleExportMarkdown}
                  className="px-3.5 py-1.5 bg-orange-600 text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Download .md File
                </button>
              </div>
              <pre className="p-5 bg-stone-900 text-orange-50 rounded-2xl text-xs font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[520px]">
                {execReport.markdown}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* INVESTIGATE FORENSIC MODAL */}
      {investigatedIssue && (
        <div className="fixed inset-0 z-50 bg-stone-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 border border-orange-200 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-red-600 text-xs font-bold">
              <AlertTriangle className="w-4 h-4" />
              <span>Forensic Ledger Inspection · {investigatedIssue.severity}</span>
            </div>
            <h3 className="font-display text-xl font-bold text-stone-900">
              {investigatedIssue.title}
            </h3>
            <p className="text-xs text-stone-600">
              Customer: <strong>{investigatedIssue.customerName}</strong> ({investigatedIssue.customerEmail}) · Impact:{' '}
              <strong className="font-mono text-red-600">
                ${(investigatedIssue.financialImpactCents / 100).toFixed(2)}
              </strong>
            </p>

            <div className="p-4 bg-stone-900 text-amber-100 rounded-2xl text-xs font-mono overflow-x-auto">
              <pre>{JSON.stringify(investigatedIssue.forensicDetails, null, 2)}</pre>
            </div>

            <p className="text-xs text-stone-700 bg-amber-50 p-3.5 rounded-xl border border-orange-200">
              <strong>Recommended Action:</strong> {investigatedIssue.suggestedCorrection}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setInvestigatedIssue(null)}
                className="px-4 py-2 text-xs font-semibold text-stone-600 cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => handleFixSingleIssue(investigatedIssue.id)}
                disabled={reconciling}
                className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                {reconciling ? 'Applying Fix...' : 'Execute Database Fix Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
