import React, { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Calculator,
  FileSpreadsheet,
  Plus,
  Receipt,
  Trash2,
  Users,
  Edit3,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AdminSubnav } from '../components/AdminSubnav';

export function AdminControlCenter({ initialSection = 'overview', embedded = false }: { initialSection?: 'overview' | 'configurator' | 'discounts' | 'users'; embedded?: boolean }) {
  const { user, authFetch } = useAuth();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [activeSection, setActiveSection] = useState<'overview' | 'configurator' | 'discounts' | 'users'>(initialSection);

  // Plan Configurator Form
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [planName, setPlanName] = useState('');
  const [planTagline, setPlanTagline] = useState('');
  const [planPeriod, setPlanPeriod] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [planPriceDollars, setPlanPriceDollars] = useState('19.99');
  const [planCostDollars, setPlanCostDollars] = useState('5.50');
  const [planPerksText, setPlanPerksText] = useState('180+ cloud games\nMonthly 1,500 Gems\nPriority servers');
  const [planAllowPause, setPlanAllowPause] = useState(true);
  const [planMaxPauseDays, setPlanMaxPauseDays] = useState(30);
  const [planAutoClose, setPlanAutoClose] = useState(false);

  // Product & Variant Configurator Form
  const [prodName, setProdName] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodCategory, setProdCategory] = useState('Expansion Pack');
  const [prodPriceDollars, setProdPriceDollars] = useState('24.99');
  const [prodCostDollars, setProdCostDollars] = useState('6.00');
  const [prodVariantsText, setProdVariantsText] = useState('Standard Edition:0\nDeluxe Collector Pack:10.00');

  // Discount & Profitability Simulator State
  const [discCode, setDiscCode] = useState('WINTERCHAMP25');
  const [discDesc, setDiscDesc] = useState('Winter Championship 25% promotional campaign');
  const [discType, setDiscType] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [discValue, setDiscValue] = useState(25);
  const [discMaxUses, setDiscMaxUses] = useState(200);
  const [simPlanId, setSimPlanId] = useState('plan_monthly_champion');
  const [simProjectedVolume, setSimProjectedVolume] = useState(120);

  // Users & Subscriptions Search / Filter / Pagination
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  const loadOverview = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/overview');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && (user.role === 'ADMIN' || user.role === 'STAFF')) {
      loadOverview();
    }
  }, [user?.id, user?.role]);

  const handleGenerateInvoices = async () => {
    setFeedback(null);
    const res = await authFetch('/api/billing/generate-invoices', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const json = await res.json();
    if (res.ok) {
      setFeedback({
        type: 'success',
        message: `Billing run completed for ${json.billingPeriodKey}: Generated ${json.generatedCount} new 18% GST invoices, skipped ${json.skippedDuplicateCount} existing period invoices.`,
      });
      await loadOverview();
    } else {
      setFeedback({ type: 'error', message: json.error || 'Billing generation failed.' });
    }
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const payload = {
      name: planName,
      tagline: planTagline,
      billingPeriod: planPeriod,
      price: Math.round( parseFloat(planPriceDollars || '0') * 100 ),
      costPrice: Math.round( parseFloat(planCostDollars || '0') * 100 ),
      perks: planPerksText.split('\n').map((s) => s.trim()).filter(Boolean),
      allowPause: planAllowPause,
      maxPauseDays: Number(planMaxPauseDays),
      autoClose: planAutoClose,
      isRecommended: false,
    };

    const url = editingPlanId ? `/api/admin/plans/${editingPlanId}` : '/api/admin/plans';
    const method = editingPlanId ? 'PUT' : 'POST';

    const res = await authFetch(url, { method, body: JSON.stringify(payload) });
    const json = await res.json();
    if (res.ok) {
      setFeedback({ type: 'success', message: json.message });
      setEditingPlanId(null);
      setPlanName('');
      setPlanTagline('');
      await loadOverview();
    } else {
      setFeedback({ type: 'error', message: json.error || 'Failed to save plan.' });
    }
  };

  const handleDeletePlan = async (id: string) => {
    const res = await authFetch(`/api/admin/plans/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (res.ok) {
      setFeedback({ type: 'success', message: json.message });
      await loadOverview();
    } else {
      setFeedback({ type: 'error', message: json.error });
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const variants = prodVariantsText
      .split('\n')
      .map((line) => {
        const [vName, adj] = line.split(':');
        return {
          name: (vName || 'Standard').trim(),
          priceAdjustment: Math.round(parseFloat(adj || '0') * 100),
        };
      })
      .filter((v) => v.name);

    const res = await authFetch('/api/admin/products', {
      method: 'POST',
      body: JSON.stringify({
        name: prodName,
        description: prodDesc,
        category: prodCategory,
        basePrice: Math.round(parseFloat(prodPriceDollars || '0') * 100),
        costPrice: Math.round(parseFloat(prodCostDollars || '0') * 100),
        isActive: true,
        variants,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      setFeedback({ type: 'success', message: json.message });
      setProdName('');
      setProdDesc('');
      await loadOverview();
    } else {
      setFeedback({ type: 'error', message: json.error });
    }
  };

  const handleDeleteProduct = async (id: string) => {
    const res = await authFetch(`/api/admin/products/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setFeedback({ type: 'success', message: 'Product deleted.' });
      await loadOverview();
    }
  };

  const handleSaveDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const now = new Date();
    const end = new Date(now.getTime() + 90 * 86400000);
    const res = await authFetch('/api/admin/discounts', {
      method: 'POST',
      body: JSON.stringify({
        code: discCode,
        description: discDesc,
        type: discType,
        value: discType === 'FIXED' ? Math.round(discValue * 100) : Number(discValue),
        minQuantity: 1,
        maxUses: Number(discMaxUses),
        startDate: now.toISOString(),
        endDate: end.toISOString(),
        isActive: true,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      setFeedback({ type: 'success', message: json.message });
      await loadOverview();
    } else {
      setFeedback({ type: 'error', message: json.error });
    }
  };

  const handleResetSeed = async () => {
    const res = await authFetch('/api/admin/reset-seed', { method: 'POST' });
    if (res.ok) {
      setFeedback({ type: 'success', message: 'Seed database restored to initial state.' });
      await loadOverview();
    }
  };

  if (user?.role === 'GAMER') {
    return embedded ? <div className="rounded-2xl bg-white p-8 text-sm text-[#8d897f]">Administrator access is required to manage products and plans.</div> : <AdminSubnav />;
  }

  const kpis = data?.kpis;
  const plans: any[] = data?.plans || [];
  const products: any[] = data?.products || [];
  const discounts: any[] = data?.discounts || [];
  const users: any[] = data?.users || [];

  // Discount Profitability Simulator Calculations
  const simPlan = plans.find((p) => p.id === simPlanId) || plans[1] || { price: 1499, costPrice: 420, name: 'Monthly Champion Tier' };
  const baseUnitRevCents = simPlan.price;
  const unitCostCents = simPlan.costPrice || Math.round(simPlan.price * 0.28);
  const unitDiscountCents =
    discType === 'PERCENT'
      ? Math.round((baseUnitRevCents * Number(discValue || 0)) / 100)
      : Math.min(baseUnitRevCents, Math.round(Number(discValue || 0) * 100));
  const discountedUnitRevCents = Math.max(0, baseUnitRevCents - unitDiscountCents);

  const baselineRevenueTotal = (baseUnitRevCents * simProjectedVolume) / 100;
  const baselineMarginTotal = ((baseUnitRevCents - unitCostCents) * simProjectedVolume) / 100;
  const baselineMarginPct = baseUnitRevCents > 0 ? ((baseUnitRevCents - unitCostCents) / baseUnitRevCents) * 100 : 0;

  const simulatedRevenueTotal = (discountedUnitRevCents * simProjectedVolume) / 100;
  const simulatedMarginTotal = ((discountedUnitRevCents - unitCostCents) * simProjectedVolume) / 100;
  const simulatedMarginPct =
    discountedUnitRevCents > 0 ? ((discountedUnitRevCents - unitCostCents) / discountedUnitRevCents) * 100 : -100;

  // Filtered Users
  const filteredUsers = users.filter((u) => {
    const matchSearch =
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase());
    const matchRole = roleFilter === 'ALL' || u.role === roleFilter;
    return matchSearch && matchRole;
  });
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="min-h-screen bg-[#FFFBF5] pb-20">
      {!embedded && <AdminSubnav onResetSeed={handleResetSeed} />}

      <div className="max-w-7xl mx-auto px-6 mt-8 space-y-8">
        {/* Top Header + Generate Due Invoices CTA */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-orange-600">
              Operations & Subscription Management · /admin
            </p>
            <h1 className="font-display text-3xl font-extrabold text-stone-900 tracking-tight">
              Brightloop Admin Control Center
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleGenerateInvoices}
              className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-display font-bold text-xs rounded-xl shadow-sm flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Receipt className="w-4 h-4" />
              <span>Run Billing Cycle (Generate 18% GST Invoices)</span>
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

        {/* 5 Primary Executive KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white rounded-2xl border border-orange-200/80 p-5">
            <p className="text-xs text-stone-500">Normalized MRR</p>
            <p className="font-mono text-2xl font-extrabold text-stone-900 mt-1 tabular-nums">
              ${((kpis?.mrrCents || 0) / 100).toFixed(2)}
            </p>
            <p className="text-xs text-emerald-700 mt-1">+14.2% vs prior month</p>
          </div>

          <div className="bg-white rounded-2xl border border-orange-200/80 p-5">
            <p className="text-xs text-stone-500">Active Subscriptions</p>
            <p className="font-mono text-2xl font-extrabold text-stone-900 mt-1 tabular-nums">
              {kpis?.activeSubscriptions ?? 0}
            </p>
            <p className="text-xs text-stone-500 mt-1">
              {kpis?.pausedSubscriptions ?? 0} currently paused
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-orange-200/80 p-5">
            <p className="text-xs text-stone-500">Monthly Churn Rate</p>
            <p className="font-mono text-2xl font-extrabold text-stone-900 mt-1 tabular-nums">
              {kpis?.churnRatePercent ?? 2.4}%
            </p>
            <p className="text-xs text-stone-500 mt-1">Target threshold &lt; 4.0%</p>
          </div>

          <div className="bg-white rounded-2xl border border-orange-200/80 p-5">
            <p className="text-xs text-stone-500">Pending Payments</p>
            <p className="font-mono text-2xl font-extrabold text-amber-700 mt-1 tabular-nums">
              ${((kpis?.pendingPaymentsCents || 0) / 100).toFixed(2)}
            </p>
            <p className="text-xs text-stone-500 mt-1">
              Across {kpis?.pendingInvoicesCount ?? 0} open invoices
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-red-200 p-5">
            <p className="text-xs text-red-700 font-semibold">Revenue at Risk</p>
            <p className="font-mono text-2xl font-extrabold text-red-600 mt-1 tabular-nums">
              ${((kpis?.revenueAtRiskCents || 0) / 100).toFixed(2)}
            </p>
            <p className="text-xs text-stone-500 mt-1">
              Leakage + High-Risk Churn
            </p>
          </div>
        </div>

        {/* Sub-Tabs for Admin Control Center */}
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-orange-100/80 rounded-2xl w-fit">
          {[
            { id: 'overview', label: 'Growth & Revenue Analytics' },
            { id: 'configurator', label: 'Product & Plan Configurator' },
            { id: 'discounts', label: 'Discounts & Profitability Simulator' },
            { id: 'users', label: `Users & Subscriptions (${users.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id as any)}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer whitespace-nowrap ${
                activeSection === tab.id
                  ? 'bg-white text-orange-600 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* SECTION 1: CHARTS */}
        {activeSection === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white rounded-3xl border border-orange-200/80 p-6 shadow-sm">
              <h2 className="font-display text-lg font-bold text-stone-900">
                MRR Trajectory (6-Month Trend)
              </h2>
              <p className="text-xs text-stone-500 mb-6">
                Normalized Monthly Recurring Revenue in USD across Daily, Monthly, and Annual Passes.
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data?.growthChart || []}>
                    <defs>
                      <linearGradient id="mrrColor" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#EA580C" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#EA580C" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F4" />
                    <XAxis dataKey="month" stroke="#78716C" fontSize={12} />
                    <YAxis stroke="#78716C" fontSize={12} />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="mrr"
                      name="MRR ($)"
                      stroke="#EA580C"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#mrrColor)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-orange-200/80 p-6 shadow-sm">
              <h2 className="font-display text-lg font-bold text-stone-900">
                Active Subscriptions vs Churn Rate (%)
              </h2>
              <p className="text-xs text-stone-500 mb-6">
                Cohort retention performance and active Battlepass seats.
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.growthChart || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F4" />
                    <XAxis dataKey="month" stroke="#78716C" fontSize={12} />
                    <YAxis stroke="#78716C" fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="activeSubscribers" name="Active Subscribers" fill="#F97316" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="churnRate" name="Churn Rate (%)" fill="#FBBF24" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 2: PRODUCT & PLAN CONFIGURATOR */}
        {activeSection === 'configurator' && (
          <div className="space-y-10">
            {/* Plans Configurator */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-5 bg-white rounded-3xl border border-orange-200/80 p-6 shadow-sm">
                <h2 className="font-display text-lg font-bold text-stone-900 mb-1">
                  {editingPlanId ? 'Edit Subscription Plan' : 'Add Subscription Plan'}
                </h2>
                <p className="text-xs text-stone-500 mb-4">
                  Configure billing cadence, pause permissions, max pause days, and auto-close rules.
                </p>

                <form onSubmit={handleSavePlan} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">Plan Name</label>
                    <input
                      type="text"
                      required
                      value={planName}
                      onChange={(e) => setPlanName(e.target.value)}
                      placeholder="Weekend Squad Pass"
                      className="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">Tagline</label>
                    <input
                      type="text"
                      required
                      value={planTagline}
                      onChange={(e) => setPlanTagline(e.target.value)}
                      placeholder="Full co-op access and weekly tournament entry"
                      className="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1">Billing Period</label>
                      <select
                        value={planPeriod}
                        onChange={(e) => setPlanPeriod(e.target.value as any)}
                        className="w-full px-3 py-2 text-xs border border-stone-200 rounded-xl bg-white"
                      >
                        <option value="DAILY">DAILY</option>
                        <option value="WEEKLY">WEEKLY</option>
                        <option value="MONTHLY">MONTHLY</option>
                        <option value="YEARLY">YEARLY</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1">Price ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={planPriceDollars}
                        onChange={(e) => setPlanPriceDollars(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono border border-stone-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1">Unit Cost ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={planCostDollars}
                        onChange={(e) => setPlanCostDollars(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono border border-stone-200 rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <label className="flex items-center gap-2 text-xs font-semibold text-stone-700">
                      <input
                        type="checkbox"
                        checked={planAllowPause}
                        onChange={(e) => setPlanAllowPause(e.target.checked)}
                        className="accent-orange-600"
                      />
                      <span>Allow Self-Service Pause</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-stone-700">
                      <input
                        type="checkbox"
                        checked={planAutoClose}
                        onChange={(e) => setPlanAutoClose(e.target.checked)}
                        className="accent-orange-600"
                      />
                      <span>Auto-Close at Period End</span>
                    </label>
                  </div>

                  {planAllowPause && (
                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1">
                        Maximum Pause Days
                      </label>
                      <input
                        type="number"
                        value={planMaxPauseDays}
                        onChange={(e) => setPlanMaxPauseDays(Number(e.target.value))}
                        className="w-full px-3.5 py-2 text-xs font-mono border border-stone-200 rounded-xl"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Perks (One per line)
                    </label>
                    <textarea
                      rows={3}
                      value={planPerksText}
                      onChange={(e) => setPlanPerksText(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs border border-stone-200 rounded-xl"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="submit"
                      className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-display font-bold text-xs rounded-xl cursor-pointer"
                    >
                      {editingPlanId ? 'Update Plan' : 'Create Plan'}
                    </button>
                    {editingPlanId && (
                      <button
                        type="button"
                        onClick={() => setEditingPlanId(null)}
                        className="px-4 py-2 text-xs text-stone-600 cursor-pointer"
                      >
                        Cancel Edit
                      </button>
                    )}
                  </div>
                </form>
              </div>

              <div className="lg:col-span-7 bg-white rounded-3xl border border-orange-200/80 p-6 shadow-sm space-y-4">
                <h2 className="font-display text-lg font-bold text-stone-900">
                  Configured Subscription Plans ({plans.length})
                </h2>
                <div className="space-y-3">
                  {plans.map((p) => (
                    <div
                      key={p.id}
                      className="p-4 rounded-2xl border border-stone-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-bold text-orange-600">{p.billingPeriod}</span>
                          <span>·</span>
                          <span className="font-bold text-stone-900 text-sm">{p.name}</span>
                          <span>·</span>
                          <span className="font-mono font-bold text-stone-900 tabular-nums">
                            ${(p.price / 100).toFixed(2)}
                          </span>
                        </div>
                        <p className="text-xs text-stone-600 mt-1">{p.tagline}</p>
                        <p className="text-[11px] text-stone-500 mt-1">
                          Pause: {p.allowPause ? `Allowed (Max ${p.maxPauseDays}d)` : 'Disabled'} · Auto-Close:{' '}
                          {p.autoClose ? 'Yes' : 'No'} · Cost: ${(p.costPrice / 100).toFixed(2)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPlanId(p.id);
                            setPlanName(p.name);
                            setPlanTagline(p.tagline);
                            setPlanPeriod(p.billingPeriod);
                            setPlanPriceDollars((p.price / 100).toFixed(2));
                            setPlanCostDollars((p.costPrice / 100).toFixed(2));
                            setPlanPerksText((p.perks || []).join('\n'));
                            setPlanAllowPause(p.allowPause);
                            setPlanMaxPauseDays(p.maxPauseDays);
                            setPlanAutoClose(p.autoClose);
                          }}
                          className="p-2 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-xl cursor-pointer"
                          title="Edit Plan"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePlan(p.id)}
                          className="p-2 bg-stone-100 hover:bg-red-50 text-stone-600 hover:text-red-600 rounded-xl cursor-pointer"
                          title="Delete Plan"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Products & Variants Configurator */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-5 bg-white rounded-3xl border border-orange-200/80 p-6 shadow-sm">
                <h2 className="font-display text-lg font-bold text-stone-900 mb-1">
                  Add Game Product & Variants
                </h2>
                <p className="text-xs text-stone-500 mb-4">
                  Add expansion packs, DLCs, and edition variants with price adjustments.
                </p>

                <form onSubmit={handleSaveProduct} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">Product Name</label>
                    <input
                      type="text"
                      required
                      value={prodName}
                      onChange={(e) => setProdName(e.target.value)}
                      placeholder="Starforge Builders: Colony Deluxe"
                      className="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">Description</label>
                    <input
                      type="text"
                      required
                      value={prodDesc}
                      onChange={(e) => setProdDesc(e.target.value)}
                      placeholder="Includes terracotta biodome schematics and solar rovers"
                      className="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1">Category</label>
                      <input
                        type="text"
                        value={prodCategory}
                        onChange={(e) => setProdCategory(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-stone-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1">Base ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={prodPriceDollars}
                        onChange={(e) => setProdPriceDollars(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono border border-stone-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1">Cost ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={prodCostDollars}
                        onChange={(e) => setProdCostDollars(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono border border-stone-200 rounded-xl"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Variants (Format: Name:PriceAdjustmentUSD per line)
                    </label>
                    <textarea
                      rows={2}
                      value={prodVariantsText}
                      onChange={(e) => setProdVariantsText(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs font-mono border border-stone-200 rounded-xl"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-display font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create Product & Variants</span>
                  </button>
                </form>
              </div>

              <div className="lg:col-span-7 bg-white rounded-3xl border border-orange-200/80 p-6 shadow-sm space-y-4">
                <h2 className="font-display text-lg font-bold text-stone-900">
                  Catalog Products & Variants ({products.length})
                </h2>
                <div className="space-y-3">
                  {products.map((prod) => (
                    <div
                      key={prod.id}
                      className="p-4 rounded-2xl border border-stone-200/80 flex items-start justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-semibold text-orange-600">{prod.category}</span>
                          <span>·</span>
                          <span className="font-bold text-stone-900 text-sm">{prod.name}</span>
                          <span>·</span>
                          <span className="font-mono font-bold text-stone-900 tabular-nums">
                            Base ${(prod.basePrice / 100).toFixed(2)} (Cost ${(prod.costPrice / 100).toFixed(2)})
                          </span>
                        </div>
                        <p className="text-xs text-stone-600 mt-1">{prod.description}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {prod.variants?.map((v: any) => (
                            <span
                              key={v.id}
                              className="text-[11px] font-mono text-stone-600 bg-amber-50 px-2.5 py-0.5 rounded-md border border-orange-100"
                            >
                              {v.name} (+${(v.priceAdjustment / 100).toFixed(2)})
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteProduct(prod.id)}
                        className="p-2 bg-stone-100 hover:bg-red-50 text-stone-600 hover:text-red-600 rounded-xl cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 3: DISCOUNT MANAGEMENT & PROFITABILITY SIMULATOR */}
        {activeSection === 'discounts' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-6 bg-white rounded-3xl border border-orange-200/80 p-6 shadow-sm space-y-5">
              <div className="flex items-center gap-2 text-orange-600 text-xs font-semibold">
                <Calculator className="w-4 h-4" />
                <span>Interactive Margin & Revenue Impact Analyzer</span>
              </div>
              <h2 className="font-display text-xl font-bold text-stone-900">
                Discount Profitability Simulator
              </h2>
              <p className="text-xs text-stone-600">
                Simulate net revenue and gross margin impact across target subscription tiers before saving a promotional code.
              </p>

              <form onSubmit={handleSaveDiscount} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">Promo Code</label>
                    <input
                      type="text"
                      required
                      value={discCode}
                      onChange={(e) => setDiscCode(e.target.value.toUpperCase())}
                      className="w-full px-3.5 py-2 text-sm font-mono border border-stone-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">Max Redemptions</label>
                    <input
                      type="number"
                      value={discMaxUses}
                      onChange={(e) => setDiscMaxUses(Number(e.target.value))}
                      className="w-full px-3.5 py-2 text-sm font-mono border border-stone-200 rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">Discount Type</label>
                    <select
                      value={discType}
                      onChange={(e) => setDiscType(e.target.value as any)}
                      className="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl bg-white"
                    >
                      <option value="PERCENT">Percentage (%)</option>
                      <option value="FIXED">Fixed Amount ($)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      {discType === 'PERCENT' ? 'Discount %' : 'Discount Amount ($)'}
                    </label>
                    <input
                      type="number"
                      value={discValue}
                      onChange={(e) => setDiscValue(Number(e.target.value))}
                      className="w-full px-3.5 py-2 text-sm font-mono border border-stone-200 rounded-xl"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Campaign Description</label>
                  <input
                    type="text"
                    required
                    value={discDesc}
                    onChange={(e) => setDiscDesc(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl"
                  />
                </div>

                {/* Simulation Target Controls */}
                <div className="p-4 rounded-2xl bg-amber-50/80 border border-orange-200 space-y-3">
                  <p className="text-xs font-bold text-stone-900">Simulation Parameters:</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                        Target Plan
                      </label>
                      <select
                        value={simPlanId}
                        onChange={(e) => setSimPlanId(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-stone-200 rounded-lg"
                      >
                        {plans.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} (${(p.price / 100).toFixed(2)})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                        Projected Redemptions
                      </label>
                      <input
                        type="number"
                        value={simProjectedVolume}
                        onChange={(e) => setSimProjectedVolume(Number(e.target.value))}
                        className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-stone-200 rounded-lg"
                      />
                    </div>
                  </div>

                  {/* Live Margin Comparison Table */}
                  <div className="pt-2 border-t border-orange-200/70 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-stone-500 block">Metric</span>
                      <span className="font-semibold text-stone-800 block mt-1">Gross Revenue</span>
                      <span className="font-semibold text-stone-800 block mt-1">Net Margin ($)</span>
                      <span className="font-semibold text-stone-800 block mt-1">Gross Margin (%)</span>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <span className="text-stone-500 block font-sans">Baseline</span>
                      <span className="block mt-1">${baselineRevenueTotal.toFixed(2)}</span>
                      <span className="block mt-1">${baselineMarginTotal.toFixed(2)}</span>
                      <span className="block mt-1">{baselineMarginPct.toFixed(1)}%</span>
                    </div>
                    <div className="text-right font-mono tabular-nums font-bold">
                      <span className="text-orange-700 block font-sans">With Promo</span>
                      <span className="block mt-1 text-stone-900">${simulatedRevenueTotal.toFixed(2)}</span>
                      <span
                        className={`block mt-1 ${
                          simulatedMarginTotal >= 0 ? 'text-emerald-700' : 'text-red-600'
                        }`}
                      >
                        ${simulatedMarginTotal.toFixed(2)}
                      </span>
                      <span
                        className={`block mt-1 ${
                          simulatedMarginPct >= 30 ? 'text-emerald-700' : 'text-red-600'
                        }`}
                      >
                        {simulatedMarginPct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white font-display font-bold text-xs rounded-xl shadow-xs cursor-pointer"
                >
                  Save & Activate Discount Code ({discCode})
                </button>
              </form>
            </div>

            {/* Active & Historical Discounts List */}
            <div className="lg:col-span-6 bg-white rounded-3xl border border-orange-200/80 p-6 shadow-sm space-y-4">
              <h2 className="font-display text-xl font-bold text-stone-900">
                Configured Discounts ({discounts.length})
              </h2>
              <div className="space-y-3">
                {discounts.map((d) => (
                  <div
                    key={d.id}
                    className="p-4 rounded-2xl border border-stone-200/80 flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-bold text-orange-700 text-sm">{d.code}</span>
                        <span>·</span>
                        <span className="font-bold text-stone-900">
                          {d.type === 'PERCENT' ? `${d.value}% OFF` : `$${(d.value / 100).toFixed(2)} OFF`}
                        </span>
                        <span>·</span>
                        <span className={d.isActive ? 'text-emerald-700 font-semibold' : 'text-red-600 font-semibold'}>
                          {d.isActive ? 'ACTIVE' : 'EXPIRED'}
                        </span>
                      </div>
                      <p className="text-xs text-stone-600 mt-1">{d.description}</p>
                      <p className="text-[11px] font-mono text-stone-500 mt-1">
                        Used: {d.usedCount}/{d.maxUses} · Valid until {new Date(d.endDate).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SECTION 4: USER & SUBSCRIPTION MANAGEMENT TABLE */}
        {activeSection === 'users' && (
          <div className="bg-white rounded-3xl border border-orange-200/80 p-6 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-xl font-bold text-stone-900">
                  User & Subscription Directory
                </h2>
                <p className="text-xs text-stone-600 mt-0.5">
                  Search, filter by role, and audit subscriber status and Parental Safety Gate configuration.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => {
                    setUserSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search name or email..."
                  className="px-3.5 py-2 text-xs border border-stone-200 rounded-xl"
                />
                <select
                  value={roleFilter}
                  onChange={(e) => {
                    setRoleFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-3 py-2 text-xs border border-stone-200 rounded-xl bg-white"
                >
                  <option value="ALL">All Roles</option>
                  <option value="GAMER">GAMER</option>
                  <option value="STAFF">STAFF</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 text-xs text-stone-500">
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Plan & Status</th>
                    <th className="py-3 px-4">Parental Gate</th>
                    <th className="py-3 px-4">Last IP / Geo</th>
                    <th className="py-3 px-4">Security State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-sm">
                  {paginatedUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-amber-50/40">
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-stone-900">{u.name}</p>
                        <p className="text-xs font-mono text-stone-500">{u.email}</p>
                      </td>
                      <td className="py-3.5 px-4 text-xs font-bold text-orange-700">{u.role}</td>
                      <td className="py-3.5 px-4 text-xs">
                        {u.planName ? (
                          <div>
                            <span className="font-semibold text-stone-900">{u.planName}</span>
                            <span className="block text-stone-500">
                              {u.subscriptionStatus} · Renews {new Date(u.currentPeriodEnd).toLocaleDateString()}
                            </span>
                          </div>
                        ) : (
                          <span className="text-stone-400">System Account</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        {u.parentalGateOn ? (
                          <span className="text-emerald-700 font-semibold">PIN Protected</span>
                        ) : (
                          <span className="text-stone-400">Off</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-stone-600">
                        {u.lastLoginIp || '—'} ({u.lastLoginCountry || 'US'})
                      </td>
                      <td className="py-3.5 px-4 text-xs font-semibold">
                        {u.isFrozen ? (
                          <span className="text-red-600">48h Trade Lock</span>
                        ) : (
                          <span className="text-emerald-700">Nominal</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-stone-100 text-xs text-stone-600">
              <span>
                Showing page {currentPage} of {totalPages} ({filteredUsers.length} total accounts)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 border border-stone-200 rounded-lg disabled:opacity-40 cursor-pointer"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 border border-stone-200 rounded-lg disabled:opacity-40 cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
