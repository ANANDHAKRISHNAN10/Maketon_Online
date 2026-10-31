"use client";

import React, { useState, useEffect } from "react";
import {
  Sliders,
  PlusCircle,
  Calculator,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Sparkles,
  DollarSign,
  TrendingUp,
  Percent,
  RefreshCw,
  Box,
  Tag,
  ShieldAlert,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function AdminControlCenter() {
  const [plans, setPlans] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [discounts, setDiscounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // New Plan Form State
  const [planForm, setPlanForm] = useState({
    name: "",
    billingPeriod: "MONTHLY",
    price: "",
    autoClose: false,
    allowPause: true,
    maxPauseDays: 14,
  });
  const [isSubmittingPlan, setIsSubmittingPlan] = useState(false);

  // New Product with Variants Form State
  const [productForm, setProductForm] = useState({
    name: "",
    description: "",
    basePrice: "",
    costPrice: "",
    variants: [
      { name: "Standard", priceAdjustment: "0" },
      { name: "Pro Gamer Edition", priceAdjustment: "10" },
      { name: "Odoo Pass", priceAdjustment: "15" },
    ],
  });
  const [isSubmittingProduct, setIsSubmittingProduct] = useState(false);

  // Discount Profitability Simulator State
  const [simListPrice, setSimListPrice] = useState<number>(19.99);
  const [simCostPrice, setSimCostPrice] = useState<number>(4.5);
  const [simPlatformFeePercent, setSimPlatformFeePercent] = useState<number>(2.9);
  const [simPlatformFeeFixed, setSimPlatformFeeFixed] = useState<number>(0.3);
  const [simDiscountType, setSimDiscountType] = useState<"PERCENT" | "FIXED">("PERCENT");
  const [simDiscountValue, setSimDiscountValue] = useState<number>(20);
  const [simDiscountCode, setSimDiscountCode] = useState<string>("SUMMER20");
  const [isSavingDiscount, setIsSavingDiscount] = useState<boolean>(false);

  const fetchCatalogData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/plans");
      const json = await res.json();
      if (json.success) {
        setPlans(json.plans || []);
        setProducts(json.products || []);
        setDiscounts(json.discounts || []);
      }
    } catch (err) {
      console.error("Failed to fetch catalog data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalogData();
  }, []);

  // Handle Plan Submission
  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planForm.name || !planForm.price) return;
    try {
      setIsSubmittingPlan(true);
      setActionMessage(null);
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(planForm),
      });
      const result = await res.json();
      if (result.success) {
        setActionMessage({ type: "success", text: result.message });
        setPlanForm({
          name: "",
          billingPeriod: "MONTHLY",
          price: "",
          autoClose: false,
          allowPause: true,
          maxPauseDays: 14,
        });
        fetchCatalogData();
      } else {
        setActionMessage({ type: "error", text: result.error });
      }
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Failed to create plan" });
    } finally {
      setIsSubmittingPlan(false);
    }
  };

  // Handle Product with Variants Submission
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productForm.name || !productForm.basePrice || !productForm.costPrice) return;
    try {
      setIsSubmittingProduct(true);
      setActionMessage(null);
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(productForm),
      });
      const result = await res.json();
      if (result.success) {
        setActionMessage({ type: "success", text: result.message });
        setProductForm({
          name: "",
          description: "",
          basePrice: "",
          costPrice: "",
          variants: [
            { name: "Standard", priceAdjustment: "0" },
            { name: "Pro Gamer Edition", priceAdjustment: "10" },
            { name: "Odoo Pass", priceAdjustment: "15" },
          ],
        });
        fetchCatalogData();
      } else {
        setActionMessage({ type: "error", text: result.error });
      }
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Failed to create product" });
    } finally {
      setIsSubmittingProduct(false);
    }
  };

  // Discount Simulator Calculations
  const calculatedDiscountDeduction =
    simDiscountType === "PERCENT"
      ? (simListPrice * simDiscountValue) / 100
      : Math.min(simListPrice, simDiscountValue);

  const postDiscountRevenue = Math.max(0, simListPrice - calculatedDiscountDeduction);
  const paymentFee = (postDiscountRevenue * simPlatformFeePercent) / 100 + simPlatformFeeFixed;
  const netProfit = postDiscountRevenue - simCostPrice - paymentFee;
  const netMarginPercent =
    postDiscountRevenue > 0 ? (netProfit / postDiscountRevenue) * 100 : 0;

  // Save Discount from Simulator
  const handleSaveSimulatedDiscount = async () => {
    if (!simDiscountCode) return;
    try {
      setIsSavingDiscount(true);
      const res = await fetch("/api/retention-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discountPercent: simDiscountValue,
          code: simDiscountCode,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setActionMessage({
          type: "success",
          text: `Discount code '${result.discountCode}' successfully saved to database!`,
        });
        fetchCatalogData();
      }
    } catch (err: any) {
      setActionMessage({ type: "error", text: "Failed to save discount" });
    } finally {
      setIsSavingDiscount(false);
    }
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
            <span className="px-2.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              Admin Control Center
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-xs text-slate-400">Plan & Pricing Master</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight mt-1 flex items-center gap-2">
            Product & Plan Configurator
            <Sliders className="w-6 h-6 text-cyan-400" />
          </h1>
        </div>

        <button
          onClick={fetchCatalogData}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-surface border border-border text-xs text-slate-300 hover:text-white hover:bg-surface-hover transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reload Catalog</span>
        </button>
      </div>

      {/* TOP STATS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-surface-card border border-border">
          <div className="text-xs text-slate-400">Total Plans</div>
          <div className="text-2xl font-bold text-white mt-1">{plans.length}</div>
          <div className="text-[11px] text-cyan-400 mt-0.5">Active Catalog</div>
        </div>
        <div className="p-4 rounded-xl bg-surface-card border border-border">
          <div className="text-xs text-slate-400">Active Subscriptions</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">
            {plans.reduce((acc, p) => acc + (p.activeSubscribers || 0), 0)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Gaming Base</div>
        </div>
        <div className="p-4 rounded-xl bg-surface-card border border-border">
          <div className="text-xs text-slate-400">Products & Add-ons</div>
          <div className="text-2xl font-bold text-purple-400 mt-1">{products.length}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">With Dynamic Variants</div>
        </div>
        <div className="p-4 rounded-xl bg-surface-card border border-border">
          <div className="text-xs text-slate-400">Configured Discounts</div>
          <div className="text-2xl font-bold text-amber-400 mt-1">{discounts.length}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Active Rules</div>
        </div>
      </div>

      {/* SECTION 1: DISCOUNT PROFITABILITY SIMULATOR */}
      <div className="rounded-2xl bg-gradient-to-br from-[#101726] to-[#0d1320] border border-cyan-500/40 p-6 shadow-2xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/80 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-neon-cyan">
              <Calculator className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Discount Profitability Simulator
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono font-bold border border-cyan-500/30">
                  Real-time Margins
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Live financial simulator calculating net margin, gateway fees, and unit economics before saving promotions
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold font-mono border ${
                netMarginPercent >= 50
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                  : netMarginPercent >= 25
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                  : "bg-rose-500/20 text-rose-300 border-rose-500/40"
              }`}
            >
              {netMarginPercent >= 50
                ? "🟢 High Profitability"
                : netMarginPercent >= 25
                ? "🟡 Sustainable Margin"
                : "🔴 Low Margin / Loss Warning"}
            </span>
          </div>
        </div>

        {/* Simulator Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Controls Column (7 Cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Product / Plan List Price ($):
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={simListPrice}
                  onChange={(e) => setSimListPrice(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-white text-sm focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Cost of Goods / Server Infra ($):
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={simCostPrice}
                  onChange={(e) => setSimCostPrice(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-white text-sm focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Discount Type:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSimDiscountType("PERCENT")}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors ${
                      simDiscountType === "PERCENT"
                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-500"
                        : "bg-surface border-border text-slate-400"
                    }`}
                  >
                    Percent (%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimDiscountType("FIXED")}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors ${
                      simDiscountType === "FIXED"
                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-500"
                        : "bg-surface border-border text-slate-400"
                    }`}
                  >
                    Fixed ($)
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Discount Value ({simDiscountType === "PERCENT" ? "%" : "$"}):
                </label>
                <input
                  type="number"
                  step="1"
                  value={simDiscountValue}
                  onChange={(e) => setSimDiscountValue(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-white text-sm focus:border-cyan-500 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Payment Gateway Fee (%):</label>
                <input
                  type="number"
                  step="0.1"
                  value={simPlatformFeePercent}
                  onChange={(e) => setSimPlatformFeePercent(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-border text-slate-300 text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Fixed Gateway Fee ($):</label>
                <input
                  type="number"
                  step="0.05"
                  value={simPlatformFeeFixed}
                  onChange={(e) => setSimPlatformFeeFixed(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-border text-slate-300 text-xs font-mono"
                />
              </div>
            </div>
          </div>

          {/* Results Summary Box (5 Cols) */}
          <div className="lg:col-span-5 bg-[#090d15] rounded-xl p-5 border border-border/80 flex flex-col justify-between space-y-4">
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                Simulated Unit Economics
              </div>

              <div className="space-y-2 mt-3 text-xs">
                <div className="flex justify-between text-slate-300">
                  <span>List Price:</span>
                  <span className="font-mono">{formatCurrency(simListPrice)}</span>
                </div>
                <div className="flex justify-between text-rose-400">
                  <span>Discount Deduction:</span>
                  <span className="font-mono">-{formatCurrency(calculatedDiscountDeduction)}</span>
                </div>
                <div className="flex justify-between text-slate-300 font-semibold pt-1 border-t border-border/60">
                  <span>Post-Discount Price:</span>
                  <span className="font-mono">{formatCurrency(postDiscountRevenue)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Infrastructure Cost:</span>
                  <span className="font-mono">-{formatCurrency(simCostPrice)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Gateway Fees (2.9% + $0.30):</span>
                  <span className="font-mono">-{formatCurrency(paymentFee)}</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-cyan-500/30 flex items-baseline justify-between">
                <div>
                  <div className="text-[11px] text-slate-400 uppercase font-semibold">Net Profit:</div>
                  <div
                    className={`text-2xl font-black font-mono ${
                      netProfit >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {formatCurrency(netProfit)}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[11px] text-slate-400 uppercase font-semibold">Net Margin:</div>
                  <div
                    className={`text-2xl font-black font-mono ${
                      netMarginPercent >= 25 ? "text-cyan-400" : "text-amber-400"
                    }`}
                  >
                    {netMarginPercent.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Save Action */}
            <div className="pt-2 border-t border-border flex space-x-2">
              <input
                type="text"
                placeholder="PROMO_CODE"
                value={simDiscountCode}
                onChange={(e) => setSimDiscountCode(e.target.value.toUpperCase())}
                className="w-1/2 px-3 py-1.5 rounded-lg bg-surface border border-border text-white text-xs font-mono uppercase"
              />
              <button
                type="button"
                disabled={isSavingDiscount}
                onClick={handleSaveSimulatedDiscount}
                className="flex-1 py-1.5 px-3 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-600 hover:to-indigo-700 text-black font-bold text-xs transition-colors flex items-center justify-center space-x-1"
              >
                <Tag className="w-3.5 h-3.5" />
                <span>{isSavingDiscount ? "Saving..." : "Save Code"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: CREATE PLAN & CREATE PRODUCT FORMS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Plan Configurator Form */}
        <div className="rounded-xl bg-surface-card border border-border p-6 shadow-card-glow">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
              <Layers className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Create Gaming Subscription Plan</h3>
              <p className="text-xs text-slate-400">Configure intervals, pause policies, and auto-close</p>
            </div>
          </div>

          <form onSubmit={handleCreatePlan} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Plan Name:</label>
              <input
                type="text"
                required
                value={planForm.name}
                onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                placeholder="e.g. Master Diamond Tier"
                className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-slate-100 focus:border-cyan-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Billing Interval:</label>
                <select
                  value={planForm.billingPeriod}
                  onChange={(e) => setPlanForm({ ...planForm, billingPeriod: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-slate-100 focus:border-cyan-500"
                >
                  <option value="DAILY">DAILY</option>
                  <option value="WEEKLY">WEEKLY</option>
                  <option value="MONTHLY">MONTHLY</option>
                  <option value="YEARLY">YEARLY</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Price ($):</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={planForm.price}
                  onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })}
                  placeholder="29.99"
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-slate-100 font-mono focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <label className="flex items-center space-x-2 bg-surface p-2.5 rounded-lg border border-border cursor-pointer">
                <input
                  type="checkbox"
                  checked={planForm.allowPause}
                  onChange={(e) => setPlanForm({ ...planForm, allowPause: e.target.checked })}
                  className="w-4 h-4 text-cyan-500 rounded bg-slate-900 border-border"
                />
                <div>
                  <div className="font-semibold text-slate-200">Allow Pause</div>
                  <div className="text-[10px] text-slate-400">Gamer can freeze billing</div>
                </div>
              </label>

              <label className="flex items-center space-x-2 bg-surface p-2.5 rounded-lg border border-border cursor-pointer">
                <input
                  type="checkbox"
                  checked={planForm.autoClose}
                  onChange={(e) => setPlanForm({ ...planForm, autoClose: e.target.checked })}
                  className="w-4 h-4 text-cyan-500 rounded bg-slate-900 border-border"
                />
                <div>
                  <div className="font-semibold text-slate-200">Auto-Close</div>
                  <div className="text-[10px] text-slate-400">Expire without renewal</div>
                </div>
              </label>
            </div>

            {planForm.allowPause && (
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Max Pause Days:</label>
                <input
                  type="number"
                  value={planForm.maxPauseDays}
                  onChange={(e) =>
                    setPlanForm({ ...planForm, maxPauseDays: parseInt(e.target.value) || 14 })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-slate-100 font-mono"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmittingPlan}
              className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors flex items-center justify-center space-x-1.5"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{isSubmittingPlan ? "Saving Plan..." : "Publish Subscription Plan"}</span>
            </button>
          </form>
        </div>

        {/* Product & Variants Configurator Form */}
        <div className="rounded-xl bg-surface-card border border-border p-6 shadow-card-glow">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <Box className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Product & Variant Configurator</h3>
              <p className="text-xs text-slate-400">Add battlepasses, Odoo pass edition, & tiered variants</p>
            </div>
          </div>

          <form onSubmit={handleCreateProduct} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Product Title:</label>
              <input
                type="text"
                required
                value={productForm.name}
                onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                placeholder="e.g. Brightloop Battlepass Season 6"
                className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-slate-100 focus:border-cyan-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Base Price ($):</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={productForm.basePrice}
                  onChange={(e) => setProductForm({ ...productForm, basePrice: e.target.value })}
                  placeholder="19.99"
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Cost Price ($):</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={productForm.costPrice}
                  onChange={(e) => setProductForm({ ...productForm, costPrice: e.target.value })}
                  placeholder="4.00"
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-slate-100 font-mono"
                />
              </div>
            </div>

            {/* Predefined Variants Preview */}
            <div className="bg-surface/60 p-3 rounded-lg border border-border space-y-2">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Configured Product Variants:
              </div>
              {productForm.variants.map((v, i) => (
                <div key={i} className="flex justify-between items-center text-xs">
                  <span className="text-slate-200">{v.name}</span>
                  <span className="font-mono text-cyan-400">
                    +{formatCurrency(parseFloat(v.priceAdjustment) || 0)}
                  </span>
                </div>
              ))}
            </div>

            <button
              type="submit"
              disabled={isSubmittingProduct}
              className="w-full py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-black font-bold text-xs transition-colors flex items-center justify-center space-x-1.5"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{isSubmittingProduct ? "Saving Product..." : "Create Product with Variants"}</span>
            </button>
          </form>
        </div>
      </div>

      {/* SECTION 3: EXISTING PLANS & PRODUCTS CATALOG TABLE */}
      <div className="rounded-xl bg-surface-card border border-border p-6 shadow-card-glow">
        <h3 className="text-base font-bold text-white mb-4">Live Subscription Plans Catalog</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0b101c] text-slate-400 uppercase text-[10px] tracking-wider border-b border-border">
              <tr>
                <th className="py-3 px-4 font-semibold">Plan Name</th>
                <th className="py-3 px-4 font-semibold">Billing Period</th>
                <th className="py-3 px-4 font-semibold">Price</th>
                <th className="py-3 px-4 font-semibold">Pause Allowed</th>
                <th className="py-3 px-4 font-semibold">Max Pause</th>
                <th className="py-3 px-4 font-semibold">Auto-Close</th>
                <th className="py-3 px-4 font-semibold">Active Gamers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 text-slate-300">
              {plans.map((p) => (
                <tr key={p.id} className="hover:bg-surface/50">
                  <td className="py-3 px-4 font-bold text-white">{p.name}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded bg-surface border border-border font-mono text-[10px]">
                      {p.billingPeriod}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-cyan-400">
                    {formatCurrency(p.price)}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        p.allowPause
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-slate-700/40 text-slate-400"
                      }`}
                    >
                      {p.allowPause ? "YES" : "NO"}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono">{p.maxPauseDays}d</td>
                  <td className="py-3 px-4 text-slate-400">{p.autoClose ? "Enabled" : "Disabled"}</td>
                  <td className="py-3 px-4 font-mono font-semibold text-slate-200">
                    {p.activeSubscribers} active
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
