import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Check,
  CreditCard,
  Download,
  Lock,
  PauseCircle,
  PlayCircle,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  User,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { downloadInvoicePdf, InvoiceRecord } from '../utils/pdfGenerator';

export function GamerDashboard() {
  const { user, authFetch, refreshUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'battlepass' | 'invoices' | 'payments' | 'parental' | 'settings'>('battlepass');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Pause Modal State
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pauseDuration, setPauseDuration] = useState<7 | 14 | 30>(14);
  const [pauseReason, setPauseReason] = useState('Taking a break from competitive queue');
  const [actionLoading, setActionLoading] = useState(false);

  // Upgrade / Renew Modal State with Parental Safety Gate PIN
  const [upgradePlanId, setUpgradePlanId] = useState<string | null>(null);
  const [parentalPinInput, setParentalPinInput] = useState('');
  const [promoCodeInput, setPromoCodeInput] = useState('');

  // Invoice Search & Filter
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('ALL');

  // Parental Settings Form
  const [parentEmailForm, setParentEmailForm] = useState('');
  const [newPinForm, setNewPinForm] = useState('4210');
  const [gateEnabledForm, setGateEnabledForm] = useState(false);

  // Profile Settings Form
  const [profileName, setProfileName] = useState('');

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/gamer/dashboard');
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setParentEmailForm(json.profile?.parentEmail || '');
        setGateEnabledForm(Boolean(json.profile?.parentalGateOn));
        setProfileName(json.profile?.name || '');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [user?.id]);

  const subscription = data?.subscription;
  const profile = data?.profile;
  const invoices: InvoiceRecord[] = data?.invoices || [];
  const payments: any[] = data?.payments || [];
  const availablePlans: any[] = data?.availablePlans || [];

  const handlePauseConfirm = async () => {
    if (!subscription) return;
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await authFetch(`/api/subscriptions/${subscription.id}/pause`, {
        method: 'POST',
        body: JSON.stringify({
          durationDays: pauseDuration,
          reason: pauseReason,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', message: json.error || 'Could not pause subscription.' });
      } else {
        setShowPauseModal(false);
        setFeedback({
          type: 'success',
          message: `Subscription paused for ${pauseDuration} days. Battlepass perks frozen. Next billing date recalculated to ${new Date(
            json.projectedNextBillingDate
          ).toLocaleDateString()}.`,
        });
        await loadDashboard();
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleResumeSubscription = async () => {
    if (!subscription) return;
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await authFetch(`/api/subscriptions/${subscription.id}/resume`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', message: json.error || 'Could not resume subscription.' });
      } else {
        setFeedback({
          type: 'success',
          message: `Subscription resumed! Battlepass perks restored and billing period extended by ${json.daysExtended} paused days to ${new Date(
            json.newNextBillingDate
          ).toLocaleDateString()}.`,
        });
        await loadDashboard();
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!subscription) return;
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await authFetch(`/api/subscriptions/${subscription.id}/cancel`, {
        method: 'POST',
      });
      const json = await res.json();
      if (res.ok) {
        setFeedback({ type: 'success', message: json.message });
        await loadDashboard();
      } else {
        setFeedback({ type: 'error', message: json.error || 'Could not cancel subscription.' });
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpgradeOrRenew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upgradePlanId) return;
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await authFetch('/api/gamer/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          planId: upgradePlanId,
          discountCode: promoCodeInput.trim() || undefined,
          parentalPin: parentalPinInput || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', message: json.message || json.error || 'Upgrade failed.' });
      } else {
        setUpgradePlanId(null);
        setParentalPinInput('');
        setFeedback({
          type: 'success',
          message: `${json.message} Invoice ${json.invoiceNumber} ($${(json.totalAmount / 100).toFixed(2)}) generated.`,
        });
        await loadDashboard();
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handlePayInvoice = async (invoiceId: string) => {
    setFeedback(null);
    const pin = profile?.parentalGateOn ? parentalPinInput || '4210' : undefined;
    const res = await authFetch(`/api/gamer/invoices/${invoiceId}/pay`, {
      method: 'POST',
      body: JSON.stringify({ parentalPin: pin }),
    });
    const json = await res.json();
    if (res.ok) {
      setFeedback({ type: 'success', message: json.message });
      await loadDashboard();
    } else {
      setFeedback({ type: 'error', message: json.message || json.error });
    }
  };

  const handleSaveParentalGate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await authFetch('/api/gamer/parental-settings', {
      method: 'POST',
      body: JSON.stringify({
        parentEmail: parentEmailForm,
        parentalPin: newPinForm,
        parentalGateOn: gateEnabledForm,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      setFeedback({ type: 'success', message: json.message });
      await loadDashboard();
      await refreshUser();
    } else {
      setFeedback({ type: 'error', message: json.error || 'Could not save Parental Safety Gate.' });
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await authFetch('/api/gamer/profile', {
      method: 'PUT',
      body: JSON.stringify({
        name: profileName,
        parentEmail: parentEmailForm,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      setFeedback({ type: 'success', message: json.message });
      await loadDashboard();
      await refreshUser();
    } else {
      setFeedback({ type: 'error', message: json.error });
    }
  };

  if (loading && !data) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12 space-y-6">
        <div className="h-36 bg-orange-100/50 rounded-3xl animate-pulse" />
        <div className="h-96 bg-white border border-orange-100 rounded-3xl animate-pulse" />
      </div>
    );
  }

  const currentPeriodEndMs = subscription ? new Date(subscription.currentPeriodEnd).getTime() : Date.now();
  const projectedBillingDateAfterPause = new Date(currentPeriodEndMs + pauseDuration * 86400000);

  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(invoiceSearch.toLowerCase()) ||
      inv.billingPeriodKey.toLowerCase().includes(invoiceSearch.toLowerCase());
    const matchesStatus = invoiceStatusFilter === 'ALL' || inv.status === invoiceStatusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-[#FFFBF5] pb-20">
      {/* Gamer Hero Header */}
      <div className="bg-gradient-to-r from-[#FF6B00] via-[#FF881B] to-[#FFB800] text-white py-10 px-6 bg-dots-pattern">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <p className="text-xs font-semibold text-orange-100">
              Gamer Self-Service Portal · /gamer
            </p>
            <h1 className="font-display text-3xl font-extrabold tracking-tight mt-1">
              {profile?.name}&apos;s Battlepass & Billing Hub
            </h1>
            <p className="text-sm text-orange-50 mt-1">
              {profile?.email} · Account ID: <span className="font-mono">{profile?.id}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {profile?.parentalGateOn && (
              <div className="px-4 py-2 bg-white/20 backdrop-blur-xs border border-white/30 rounded-2xl text-xs font-semibold flex items-center gap-2">
                <Lock className="w-4 h-4" />
                <span>Parental Safety Gate Active (PIN Protected)</span>
              </div>
            )}
            {profile?.isFrozen && (
              <div className="px-4 py-2 bg-red-600 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-md">
                <ShieldAlert className="w-4 h-4" />
                <span>48h Geo-IP Trade Lock Active</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-8 space-y-6">
        {/* Feedback Banner */}
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
              className="text-xs font-semibold underline ml-4 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-orange-100/80 rounded-2xl w-fit">
          {[
            { id: 'battlepass', label: 'My Battlepass & Subscription' },
            { id: 'invoices', label: `Invoices & PDF Receipts (${invoices.length})` },
            { id: 'payments', label: `Payment History (${payments.length})` },
            { id: 'parental', label: 'Parental Safety Gate' },
            { id: 'settings', label: 'Profile Settings' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id as any)}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === t.id
                  ? 'bg-white text-orange-600 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* TAB 1: MY BATTLEPASS & SUBSCRIPTION */}
        {activeTab === 'battlepass' && subscription && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 bg-white rounded-3xl border border-orange-200/80 p-8 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-stone-100">
                <div>
                  <div className="flex items-center gap-2 text-xs text-stone-500">
                    <span>Current Tier</span>
                    <span>·</span>
                    <span
                      className={`font-bold ${
                        subscription.status === 'ACTIVE'
                          ? 'text-emerald-700'
                          : subscription.status === 'PAUSED'
                          ? 'text-amber-700'
                          : 'text-red-700'
                      }`}
                    >
                      Status: {subscription.status}
                    </span>
                    {subscription.perksFrozen && (
                      <>
                        <span>·</span>
                        <span className="text-amber-700 font-semibold">Perks Frozen During Pause</span>
                      </>
                    )}
                  </div>
                  <h2 className="font-display text-2xl font-extrabold text-stone-900 mt-1">
                    {subscription.planName}
                  </h2>
                  <p className="text-sm text-stone-600 mt-1">{subscription.planTagline}</p>
                </div>

                <div className="text-left sm:text-right">
                  <p className="font-mono text-3xl font-extrabold text-orange-600 tabular-nums">
                    ${(subscription.planPrice / 100).toFixed(2)}
                  </p>
                  <p className="text-xs text-stone-500">
                    per {subscription.billingPeriod.toLowerCase()} (+18% GST)
                  </p>
                </div>
              </div>

              {/* Billing Cycle & Recalculated Next Billing Date */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-amber-50/70 rounded-2xl p-5 border border-orange-100">
                <div>
                  <p className="text-xs text-stone-500">Current Period Start</p>
                  <p className="font-mono text-sm font-bold text-stone-900 mt-1 tabular-nums">
                    {new Date(subscription.currentPeriodStart).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-stone-500">
                    {subscription.status === 'PAUSED' ? 'Paused Until (Auto-Resume)' : 'Next Billing Date'}
                  </p>
                  <p className="font-mono text-sm font-bold text-orange-700 mt-1 tabular-nums flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    {subscription.status === 'PAUSED' && subscription.pauseResumeDate
                      ? new Date(subscription.pauseResumeDate).toLocaleDateString()
                      : new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-stone-500">Pause Allowance</p>
                  <p className="text-sm font-bold text-stone-900 mt-1">
                    {subscription.allowPause ? `Up to ${subscription.maxPauseDays} days` : 'Not permitted'}
                  </p>
                </div>
              </div>

              {/* Battlepass Perks List */}
              <div>
                <h3 className="font-display text-sm font-bold text-stone-900 mb-3">
                  Included Battlepass Perks & Benefits {subscription.perksFrozen ? '(Frozen While Paused)' : '(Active)'}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {subscription.perks.map((perk: string, idx: number) => (
                    <div
                      key={idx}
                      className={`p-3.5 rounded-2xl border text-sm flex items-start gap-2.5 ${
                        subscription.perksFrozen
                          ? 'bg-stone-50 border-stone-200 text-stone-400 line-through'
                          : 'bg-white border-orange-100 text-stone-800'
                      }`}
                    >
                      <Check
                        className={`w-4 h-4 shrink-0 mt-0.5 ${
                          subscription.perksFrozen ? 'text-stone-400' : 'text-orange-600'
                        }`}
                      />
                      <span>{perk}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Self-Service Action Controls */}
              <div className="pt-4 border-t border-stone-100 flex flex-wrap items-center gap-3">
                {subscription.status === 'ACTIVE' && subscription.allowPause && (
                  <button
                    type="button"
                    onClick={() => setShowPauseModal(true)}
                    className="px-4 py-2.5 bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold text-xs rounded-xl flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <PauseCircle className="w-4 h-4" />
                    <span>Pause Subscription (7 / 14 / 30 Days)</span>
                  </button>
                )}

                {subscription.status === 'PAUSED' && (
                  <button
                    type="button"
                    onClick={handleResumeSubscription}
                    disabled={actionLoading}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <PlayCircle className="w-4 h-4" />
                    <span>{actionLoading ? 'Resuming...' : 'Resume Now & Extend Billing Date'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setUpgradePlanId('plan_annual_legend')}
                  className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs rounded-xl flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Upgrade or Renew Plan</span>
                </button>

                {subscription.status !== 'CLOSED' && (
                  <button
                    type="button"
                    onClick={handleCancelSubscription}
                    disabled={actionLoading}
                    className="px-4 py-2.5 bg-stone-100 hover:bg-red-50 text-stone-600 hover:text-red-700 font-semibold text-xs rounded-xl flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ml-auto"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Cancel Plan</span>
                  </button>
                )}
              </div>
            </div>

            {/* Right Sidebar: Pause History & Quick Plan Switch */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white rounded-3xl border border-orange-200/80 p-6 shadow-sm">
                <h3 className="font-display text-base font-bold text-stone-900 mb-2">
                  Pause & Billing Extension Log
                </h3>
                <p className="text-xs text-stone-600 mb-4">
                  When a pause ends, your next billing date is automatically extended by the paused duration.
                </p>

                {data?.pauseHistory?.length === 0 ? (
                  <p className="text-xs text-stone-500 py-4 text-center bg-stone-50 rounded-2xl">
                    No pause events recorded for this subscription yet.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {data?.pauseHistory?.map((ph: any) => (
                      <div key={ph.id} className="p-3 rounded-2xl bg-amber-50/60 border border-orange-100 text-xs">
                        <div className="flex justify-between font-semibold text-stone-900">
                          <span>{ph.daysPaused} Days Pause</span>
                          <span className="font-mono text-orange-700">
                            {ph.actualResume ? 'Resumed' : 'Active Pause'}
                          </span>
                        </div>
                        <p className="text-stone-600 mt-1">{ph.reason}</p>
                        <p className="text-[11px] font-mono text-stone-500 mt-1">
                          Started: {new Date(ph.pauseStart).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-3xl border border-orange-200/80 p-6 shadow-sm">
                <h3 className="font-display text-base font-bold text-stone-900 mb-3">
                  Switch or Upgrade Tier
                </h3>
                <div className="space-y-2.5">
                  {availablePlans.map((p) => (
                    <div
                      key={p.id}
                      className="p-3.5 rounded-2xl border border-stone-200/80 flex items-center justify-between gap-2"
                    >
                      <div>
                        <p className="text-xs font-bold text-stone-900">{p.name}</p>
                        <p className="text-xs font-mono text-orange-600 tabular-nums">
                          ${(p.price / 100).toFixed(2)} / {p.billingPeriod.toLowerCase()}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setUpgradePlanId(p.id)}
                        className="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 font-semibold text-xs rounded-xl cursor-pointer whitespace-nowrap"
                      >
                        Select
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: INVOICES & PDF RECEIPTS */}
        {activeTab === 'invoices' && (
          <div className="bg-white rounded-3xl border border-orange-200/80 p-8 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-xl font-bold text-stone-900">
                  Invoice & GST Receipt History
                </h2>
                <p className="text-xs text-stone-600 mt-1">
                  Download official itemized 18% GST tax invoices as PDF or settle open balances.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                  placeholder="Search invoice # or period..."
                  className="px-3.5 py-2 text-xs border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <select
                  value={invoiceStatusFilter}
                  onChange={(e) => setInvoiceStatusFilter(e.target.value)}
                  className="px-3 py-2 text-xs border border-stone-200 rounded-xl bg-white"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PAID">PAID</option>
                  <option value="CONFIRMED">CONFIRMED</option>
                  <option value="OVERDUE">OVERDUE</option>
                  <option value="DRAFT">DRAFT</option>
                </select>
              </div>
            </div>

            {filteredInvoices.length === 0 ? (
              <div className="py-12 text-center text-sm text-stone-500 bg-stone-50 rounded-2xl">
                No invoices match your filter criteria.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-stone-200 text-xs text-stone-500">
                      <th className="py-3 px-4">Invoice #</th>
                      <th className="py-3 px-4">Period</th>
                      <th className="py-3 px-4 text-right">Subtotal</th>
                      <th className="py-3 px-4 text-right">Discount</th>
                      <th className="py-3 px-4 text-right">18% GST</th>
                      <th className="py-3 px-4 text-right">Total</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-sm">
                    {filteredInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-amber-50/40">
                        <td className="py-3.5 px-4 font-mono font-semibold text-stone-900">
                          {inv.invoiceNumber}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs text-stone-600">
                          {inv.billingPeriodKey}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                          ${(inv.amountSubtotal / 100).toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-emerald-700">
                          {inv.discountAmount > 0 ? `-$${(inv.discountAmount / 100).toFixed(2)}` : '$0.00'}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-stone-600">
                          ${(inv.taxAmount / 100).toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-stone-900 tabular-nums">
                          ${(inv.totalAmount / 100).toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 text-xs font-bold">
                          <span
                            className={
                              inv.status === 'PAID'
                                ? 'text-emerald-700'
                                : inv.status === 'OVERDUE'
                                ? 'text-red-600'
                                : 'text-amber-700'
                            }
                          >
                            {inv.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                          {(inv.status === 'OVERDUE' || inv.status === 'CONFIRMED') && (
                            <button
                              type="button"
                              onClick={() => handlePayInvoice(inv.id)}
                              className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                            >
                              Pay Now
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              downloadInvoicePdf(
                                inv,
                                profile?.name || 'Gamer',
                                profile?.email || '',
                                subscription?.planName || 'Brightloop Pass'
                              )
                            }
                            className="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>PDF</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: PAYMENT HISTORY */}
        {activeTab === 'payments' && (
          <div className="bg-white rounded-3xl border border-orange-200/80 p-8 shadow-sm space-y-6">
            <div>
              <h2 className="font-display text-xl font-bold text-stone-900">Payment Ledger</h2>
              <p className="text-xs text-stone-600 mt-1">
                Complete history of card, UPI, and wallet transactions associated with your account.
              </p>
            </div>

            {payments.length === 0 ? (
              <div className="py-12 text-center text-sm text-stone-500 bg-stone-50 rounded-2xl">
                No payment transactions recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-stone-200 text-xs text-stone-500">
                      <th className="py-3 px-4">Reference</th>
                      <th className="py-3 px-4">Linked Invoice</th>
                      <th className="py-3 px-4">Method</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-sm">
                    {payments.map((pay) => (
                      <tr key={pay.id} className="hover:bg-amber-50/40">
                        <td className="py-3.5 px-4 font-mono font-semibold text-stone-900">
                          {pay.referenceCode}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs text-stone-600">
                          {pay.invoiceNumber || 'Unlinked Settlement'}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-stone-700">{pay.method}</td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums">
                          ${(pay.amount / 100).toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 text-xs font-bold">
                          <span
                            className={
                              pay.status === 'SUCCESS'
                                ? 'text-emerald-700'
                                : 'text-red-600'
                            }
                          >
                            {pay.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs text-stone-500 tabular-nums">
                          {new Date(pay.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: PARENTAL SAFETY GATE */}
        {activeTab === 'parental' && (
          <div className="bg-white rounded-3xl border border-orange-200/80 p-8 shadow-sm max-w-2xl space-y-6">
            <div className="flex items-center gap-2.5 text-orange-600 text-xs font-semibold">
              <ShieldCheck className="w-5 h-5" />
              <span>Family Renewal & Upgrade Protection</span>
            </div>
            <h2 className="font-display text-2xl font-bold text-stone-900">
              Parental Safety Gate (4-Digit PIN)
            </h2>
            <p className="text-sm text-stone-600">
              When active, any subscription renewal, tier upgrade, or overdue invoice checkout requires the 4-digit Parental PIN.
            </p>

            <form onSubmit={handleSaveParentalGate} className="space-y-4">
              <label className="flex items-center gap-3 p-4 rounded-2xl bg-amber-50/80 border border-orange-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={gateEnabledForm}
                  onChange={(e) => setGateEnabledForm(e.target.checked)}
                  className="w-4 h-4 accent-orange-600"
                />
                <span className="text-sm font-semibold text-stone-900">
                  Require 4-digit Parental PIN before any subscription renewal or upgrade
                </span>
              </label>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Parent / Guardian Notification Email
                </label>
                <input
                  type="email"
                  value={parentEmailForm}
                  onChange={(e) => setParentEmailForm(e.target.value)}
                  placeholder="parent.rivera@family.org"
                  className="w-full px-4 py-2.5 text-sm border border-stone-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Set / Update 4-Digit Parental PIN
                </label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  value={newPinForm}
                  onChange={(e) => setNewPinForm(e.target.value.replace(/\D/g, ''))}
                  placeholder="4210"
                  className="w-full px-4 py-2.5 text-lg font-mono tracking-widest border border-stone-200 rounded-xl"
                />
              </div>

              <button
                type="submit"
                className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white font-display font-bold text-sm rounded-xl cursor-pointer"
              >
                Save Parental Safety Gate Settings
              </button>
            </form>
          </div>
        )}

        {/* TAB 5: PROFILE SETTINGS */}
        {activeTab === 'settings' && (
          <div className="bg-white rounded-3xl border border-orange-200/80 p-8 shadow-sm max-w-2xl space-y-6">
            <div className="flex items-center gap-2 text-orange-600 text-xs font-semibold">
              <User className="w-4 h-4" />
              <span>Account & Security Profile</span>
            </div>
            <h2 className="font-display text-2xl font-bold text-stone-900">
              Gamer Profile Settings
            </h2>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm border border-stone-200 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Email Address</label>
                <input
                  type="email"
                  disabled
                  value={profile?.email || ''}
                  className="w-full px-4 py-2.5 text-sm border border-stone-200 bg-stone-50 text-stone-500 rounded-xl"
                />
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2 text-xs text-stone-600">
                <div className="p-3.5 bg-stone-50 rounded-xl">
                  <span className="block text-stone-400">Last Login IP</span>
                  <span className="font-mono font-semibold text-stone-800">
                    {profile?.lastLoginIp || '203.0.113.45'} ({profile?.lastLoginCountry || 'US'})
                  </span>
                </div>
                <div className="p-3.5 bg-stone-50 rounded-xl">
                  <span className="block text-stone-400">Trade Lock Status</span>
                  <span className="font-semibold text-stone-800">
                    {profile?.isFrozen ? 'Frozen (48h Geo-IP Lock)' : 'Unlocked & Verified'}
                  </span>
                </div>
              </div>
              <button
                type="submit"
                className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white font-display font-bold text-sm rounded-xl cursor-pointer"
              >
                Update Profile
              </button>
            </form>
          </div>
        )}
      </div>

      {/* PAUSE SUBSCRIPTION MODAL (7, 14, 30 DAYS) */}
      {showPauseModal && subscription && (
        <div className="fixed inset-0 z-50 bg-stone-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 border border-orange-200 shadow-2xl space-y-5">
            <div className="flex items-center gap-2 text-amber-700 text-xs font-semibold">
              <PauseCircle className="w-4 h-4" />
              <span>Self-Service Membership Pause</span>
            </div>
            <h3 className="font-display text-xl font-bold text-stone-900">
              Pause {subscription.planName}
            </h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              While paused, your Battlepass perks are temporarily frozen and you will not be billed. When resumed, your next billing date automatically shifts forward by the paused duration.
            </p>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-2">
                Select Pause Duration:
              </label>
              <div className="grid grid-cols-3 gap-3">
                {([7, 14, 30] as const).map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setPauseDuration(days)}
                    className={`py-3 rounded-2xl font-mono font-bold text-sm border transition-all cursor-pointer ${
                      pauseDuration === days
                        ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                        : 'bg-orange-50/60 text-stone-800 border-orange-200 hover:bg-orange-100'
                    }`}
                  >
                    {days} Days
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Pause Reason (Optional)
              </label>
              <input
                type="text"
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                className="w-full px-3.5 py-2 text-xs border border-stone-200 rounded-xl"
              />
            </div>

            <div className="p-4 rounded-2xl bg-amber-50 border border-orange-200 text-xs space-y-1.5">
              <div className="flex justify-between text-stone-600">
                <span>Current Billing Date:</span>
                <span className="font-mono">{new Date(subscription.currentPeriodEnd).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between font-bold text-orange-800">
                <span>Recalculated Next Billing Date (+{pauseDuration}d):</span>
                <span className="font-mono">{projectedBillingDateAfterPause.toLocaleDateString()}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowPauseModal(false)}
                className="px-4 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePauseConfirm}
                disabled={actionLoading}
                className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                {actionLoading ? 'Pausing...' : `Confirm ${pauseDuration}-Day Pause`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UPGRADE / RENEW MODAL WITH PARENTAL PIN GATE */}
      {upgradePlanId && (
        <div className="fixed inset-0 z-50 bg-stone-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleUpgradeOrRenew}
            className="bg-white rounded-3xl max-w-md w-full p-6 border border-orange-200 shadow-2xl space-y-4"
          >
            <div className="flex items-center gap-2 text-orange-600 text-xs font-semibold">
              <CreditCard className="w-4 h-4" />
              <span>Upgrade or Renew Subscription</span>
            </div>
            <h3 className="font-display text-xl font-bold text-stone-900">
              Confirm Plan Change
            </h3>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Select Plan</label>
              <select
                value={upgradePlanId}
                onChange={(e) => setUpgradePlanId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-stone-200 rounded-xl bg-white"
              >
                {availablePlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — ${(p.price / 100).toFixed(2)} / {p.billingPeriod.toLowerCase()} (+18% GST)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Discount Code (Optional, e.g. BRIGHT20)
              </label>
              <input
                type="text"
                value={promoCodeInput}
                onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                placeholder="BRIGHT20"
                className="w-full px-3.5 py-2 text-sm font-mono border border-stone-200 rounded-xl"
              />
            </div>

            {profile?.parentalGateOn && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-orange-200 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-orange-800">
                  <Lock className="w-4 h-4" />
                  <span>Parental Safety Gate PIN Required</span>
                </div>
                <p className="text-xs text-stone-600">
                  Enter your 4-digit Parental PIN to authorize this renewal (Alex Rivera default: <code className="font-mono font-bold">4210</code>).
                </p>
                <input
                  type="password"
                  maxLength={4}
                  required
                  value={parentalPinInput}
                  onChange={(e) => setParentalPinInput(e.target.value)}
                  placeholder="4210"
                  className="w-full px-3.5 py-2 text-center font-mono text-lg tracking-widest bg-white border border-orange-300 rounded-xl"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setUpgradePlanId(null)}
                className="px-4 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                {actionLoading ? 'Authorizing...' : 'Confirm & Issue GST Invoice'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
