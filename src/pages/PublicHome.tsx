import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Gamepad2, Lock, ShieldCheck, Sparkles, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { GameCoverArtwork, HeroControllerIllustration } from '../components/GameIllustrations';

interface Plan {
  id: string;
  name: string;
  tagline: string;
  billingPeriod: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  price: number;
  perks: string[];
  badge?: string | null;
  isRecommended: boolean;
  autoClose: boolean;
  allowPause: boolean;
  maxPauseDays: number;
}

interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  basePrice: number;
  variants: Array<{ id: string; name: string; priceAdjustment: number }>;
}

export function PublicHome() {
  const { user, authFetch } = useAuth();
  const navigate = useNavigate();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('plan_monthly_champion');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [promoCode, setPromoCode] = useState<string>('BRIGHT20');
  const [paymentMethod, setPaymentMethod] = useState<'CREDIT_CARD' | 'UPI' | 'WALLET'>('CREDIT_CARD');
  const [parentalPin, setParentalPin] = useState<string>('');
  const [needsPinModal, setNeedsPinModal] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [previewGame, setPreviewGame] = useState<Product | null>(null);

  useEffect(() => {
    fetch('/api/public/catalog')
      .then((r) => r.json())
      .then((data) => {
        if (data.plans) setPlans(data.plans);
        if (data.products) setProducts(data.products);
      })
      .catch(() => {});
  }, []);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || plans[1] || plans[0];

  const calculatePreviewTotal = (plan?: Plan) => {
    if (!plan) return { subtotal: 0, discount: 0, gst: 0, total: 0 };
    const subtotal = plan.price;
    const code = promoCode.trim().toUpperCase();
    let discount = 0;
    if (code === 'BRIGHT20') discount = Math.round(subtotal * 0.2);
    else if (code === 'RETENTION15') discount = Math.round(subtotal * 0.15);
    else if (code === 'SQUAD500') discount = Math.min(subtotal, 500);
    const taxable = Math.max(0, subtotal - discount);
    const gst = Math.round(taxable * 0.18);
    return { subtotal, discount, gst, total: taxable + gst };
  };

  const handleActivatePlan = async (planIdToActivate: string, pinOverride?: string) => {
    setFeedback(null);
    if (!user) {
      navigate('/login');
      return;
    }

    setSubmitting(true);
    try {
      const res = await authFetch('/api/gamer/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          planId: planIdToActivate,
          discountCode: promoCode.trim() || undefined,
          paymentMethod,
          parentalPin: pinOverride ?? (parentalPin || undefined),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'PARENTAL_PIN_REQUIRED' || data.error === 'INVALID_PARENTAL_PIN') {
          setNeedsPinModal(true);
        }
        setFeedback({ type: 'error', message: data.message || data.error || 'Could not activate subscription.' });
      } else {
        setNeedsPinModal(false);
        setFeedback({
          type: 'success',
          message: `${data.message} Invoice ${data.invoiceNumber} ($${(data.totalAmount / 100).toFixed(2)} incl. 18% GST) issued.`,
        });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Network error while processing subscription.' });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredProducts =
    selectedCategory === 'ALL'
      ? products
      : products.filter((p) => p.category.toUpperCase().includes(selectedCategory));

  const totals = calculatePreviewTotal(selectedPlan);

  return (
    <div className="min-h-screen bg-[#FFFBF5] text-stone-900">
      {/* 1. BRIGHT ORANGE & YELLOW GRADIENT HERO SECTION */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#FF6B00] via-[#FF881B] to-[#FFB800] text-white bg-dots-pattern">
        <div className="max-w-7xl mx-auto px-6 py-16 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 space-y-6">
              <p className="text-sm font-semibold tracking-wide text-amber-100">
                Brightloop Pass · Season 8 Battlepass & Cloud Vault
              </p>
              <h1
                className="font-display font-extrabold tracking-tight text-white leading-[1.08]"
                style={{ fontSize: 'clamp(2.5rem, 4.5vw, 4rem)', textWrap: 'balance' }}
              >
                Level Up Your Gaming Experience
              </h1>
              <p className="text-base sm:text-lg text-orange-50 max-w-2xl leading-relaxed">
                Unlock 180+ studio titles, monthly Battlepass rewards, and flexible self-service pause controls. Built with transparent 18% GST billing and Parental Safety Gate protection.
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <a
                  href="#subscription-plans"
                  className="px-6 py-3.5 bg-white text-orange-600 font-display font-bold text-sm rounded-2xl shadow-lg hover:bg-orange-50 transition-all whitespace-nowrap shrink-0 flex items-center gap-2"
                >
                  <span>Explore Plans</span>
                  <ArrowRight className="w-4 h-4" />
                </a>
                <a
                  href="#explore-games"
                  className="px-6 py-3.5 bg-orange-900/25 border border-white/40 text-white font-display font-semibold text-sm rounded-2xl hover:bg-orange-900/40 transition-all whitespace-nowrap shrink-0"
                >
                  Discover Games
                </a>
              </div>

              <div className="pt-4 flex flex-wrap items-center gap-6 text-xs text-orange-100">
                <span>Pause anytime up to 30 days</span>
                <span aria-hidden="true">·</span>
                <span>Instant PDF tax invoices</span>
                <span aria-hidden="true">·</span>
                <span>4-digit Parental PIN protection</span>
              </div>
            </div>

            <div className="lg:col-span-5">
              <HeroControllerIllustration />
            </div>
          </div>

          {/* Full-width 4-Column Platform Statistics Strip */}
          <div className="mt-14 pt-8 border-t border-white/25 grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="font-mono text-3xl font-extrabold text-white tabular-nums">180+</p>
              <p className="text-sm text-orange-100 mt-1">Flagship & Indie Games Included</p>
            </div>
            <div>
              <p className="font-mono text-3xl font-extrabold text-white tabular-nums">48,500+</p>
              <p className="text-sm text-orange-100 mt-1">Active Monthly Squad Gamers</p>
            </div>
            <div>
              <p className="font-mono text-3xl font-extrabold text-white tabular-nums">99.98%</p>
              <p className="text-sm text-orange-100 mt-1">Global Cloud Server Uptime</p>
            </div>
            <div>
              <p className="font-mono text-3xl font-extrabold text-white tabular-nums">24/7</p>
              <p className="text-sm text-orange-100 mt-1">Live Player & Billing Support</p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. FEATURED GAMES SECTION */}
      <section id="explore-games" className="max-w-7xl mx-auto px-6 py-20">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <p className="text-xs font-semibold text-orange-600 mb-2">Included in Champion & Legend Tiers</p>
            <h2 className="font-display text-3xl font-extrabold text-stone-900 tracking-tight">
              Featured Studio Releases & Add-Ons
            </h2>
          </div>

          {/* Interactive Filter Controls */}
          <div className="flex items-center gap-1.5 p-1.5 bg-orange-100/70 rounded-xl self-start">
            {[
              { id: 'ALL', label: 'All Titles' },
              { id: 'EXPANSION', label: 'Expansions' },
              { id: 'SEASON', label: 'Season Passes' },
              { id: 'TACTICAL', label: 'Tactical DLC' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedCategory(tab.id)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedCategory === tab.id
                    ? 'bg-white text-orange-600 shadow-sm'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {filteredProducts.map((game) => (
            <div
              key={game.id}
              className="bg-white rounded-3xl border border-orange-100 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col justify-between"
            >
              <div>
                <div className="h-44 w-full overflow-hidden bg-orange-50">
                  <GameCoverArtwork variant={game.name} />
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-2 text-xs text-stone-500 mb-2">
                    <span>{game.category}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums font-semibold text-orange-600">
                      ${(game.basePrice / 100).toFixed(2)}
                    </span>
                  </div>
                  <h3 className="font-display text-lg font-bold text-stone-900 mb-2">{game.name}</h3>
                  <p className="text-sm text-stone-600 leading-relaxed line-clamp-3">{game.description}</p>
                </div>
              </div>

              <div className="px-6 pb-6 pt-2">
                <div className="text-xs text-stone-500 mb-4">
                  {game.variants.length} editions available · Cloud & Local Play
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewGame(game)}
                  className="w-full py-2.5 px-4 bg-orange-50 hover:bg-orange-100 text-orange-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer whitespace-nowrap"
                >
                  Inspect Editions & Perks
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. INTERACTIVE SUBSCRIPTION PRICING SECTION */}
      <section id="subscription-plans" className="bg-warm-dots border-y border-orange-200/60 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-xs font-semibold text-orange-600 mb-2">Flexible Battlepass Memberships</p>
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-stone-900 tracking-tight">
              Choose Your Brightloop Pass
            </h2>
            <p className="text-sm sm:text-base text-stone-600 mt-3">
              Select a plan below to preview live 18% GST tax calculations, apply promotional codes, or activate immediately in your Gamer Portal.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
            {plans.map((plan) => {
              const isSelected = selectedPlan?.id === plan.id;
              return (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={`bg-white rounded-3xl p-8 transition-all cursor-pointer flex flex-col justify-between ${
                    plan.isRecommended
                      ? 'ring-2 ring-orange-500 shadow-xl relative'
                      : isSelected
                      ? 'ring-2 ring-amber-500 shadow-lg'
                      : 'border border-orange-100 shadow-sm hover:border-orange-300'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="text-xs font-semibold text-orange-600">
                        {plan.billingPeriod} PASS
                      </span>
                      {plan.badge && (
                        <span className="text-xs font-semibold text-amber-800">
                          {plan.badge}
                        </span>
                      )}
                    </div>

                    <h3 className="font-display text-2xl font-extrabold text-stone-900">{plan.name}</h3>
                    <p className="text-sm text-stone-600 mt-2 min-h-[40px]">{plan.tagline}</p>

                    <div className="my-6 pb-6 border-b border-stone-100 flex items-baseline gap-1.5">
                      <span className="font-mono text-4xl font-extrabold text-stone-900 tabular-nums">
                        ${(plan.price / 100).toFixed(2)}
                      </span>
                      <span className="text-sm text-stone-500">
                        / {plan.billingPeriod.toLowerCase()}
                      </span>
                    </div>

                    <ul className="space-y-3 mb-8">
                      {plan.perks.map((perk, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-stone-700">
                          <Check className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
                          <span>{perk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-3 pt-4 border-t border-stone-100">
                    <div className="text-xs text-stone-500 flex items-center justify-between">
                      <span>Pause Permission</span>
                      <span className="font-medium text-stone-800">
                        {plan.allowPause ? `Up to ${plan.maxPauseDays} days` : 'Auto-closes after 24h'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPlanId(plan.id);
                        handleActivatePlan(plan.id);
                      }}
                      disabled={submitting}
                      className={`w-full py-3.5 px-5 rounded-2xl font-display font-bold text-sm transition-all cursor-pointer whitespace-nowrap ${
                        plan.isRecommended || isSelected
                          ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-md hover:from-orange-700 hover:to-amber-600'
                          : 'bg-orange-50 text-orange-700 hover:bg-orange-100'
                      }`}
                    >
                      {submitting && isSelected ? 'Processing...' : `Select ${plan.name}`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Interactive Live Checkout & GST Calculator Bar */}
          {selectedPlan && (
            <div className="mt-12 bg-white rounded-3xl border border-orange-200 p-8 shadow-sm">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-7 space-y-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-orange-600">
                    <Sparkles className="w-4 h-4" />
                    <span>Interactive Checkout & 18% GST Calculator</span>
                  </div>
                  <h3 className="font-display text-xl font-bold text-stone-900">
                    Selected Plan: {selectedPlan.name} (${(selectedPlan.price / 100).toFixed(2)})
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1">
                        Promo Code (Try BRIGHT20)
                      </label>
                      <input
                        type="text"
                        value={promoCode}
                        onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                        placeholder="BRIGHT20"
                        className="w-full px-3.5 py-2 text-sm font-mono border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1">
                        Payment Method
                      </label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as any)}
                        className="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        <option value="CREDIT_CARD">Credit / Debit Card</option>
                        <option value="UPI">Instant UPI</option>
                        <option value="WALLET">Brightloop Wallet</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1">
                        Parental PIN (if enabled)
                      </label>
                      <input
                        type="password"
                        maxLength={4}
                        value={parentalPin}
                        onChange={(e) => setParentalPin(e.target.value)}
                        placeholder="4210 (Alex demo)"
                        className="w-full px-3.5 py-2 text-sm font-mono border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5 bg-amber-50/70 rounded-2xl p-6 border border-orange-100 space-y-2.5">
                  <div className="flex justify-between text-sm text-stone-600">
                    <span>Plan Subtotal</span>
                    <span className="font-mono tabular-nums">${(totals.subtotal / 100).toFixed(2)}</span>
                  </div>
                  {totals.discount > 0 && (
                    <div className="flex justify-between text-sm text-emerald-700 font-medium">
                      <span>Promo Discount ({promoCode})</span>
                      <span className="font-mono tabular-nums">-${(totals.discount / 100).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm text-stone-600">
                    <span>GST (18%)</span>
                    <span className="font-mono tabular-nums">${(totals.gst / 100).toFixed(2)}</span>
                  </div>
                  <div className="pt-2.5 border-t border-orange-200 flex justify-between items-baseline">
                    <span className="font-display font-bold text-stone-900">Total Due Today</span>
                    <span className="font-mono text-2xl font-extrabold text-orange-600 tabular-nums">
                      ${(totals.total / 100).toFixed(2)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleActivatePlan(selectedPlan.id)}
                    disabled={submitting}
                    className="w-full mt-3 py-3 px-5 bg-orange-600 hover:bg-orange-700 text-white font-display font-bold text-sm rounded-xl shadow-sm transition-colors cursor-pointer"
                  >
                    {submitting ? 'Activating...' : `Activate ${selectedPlan.name} Now`}
                  </button>
                </div>
              </div>

              {feedback && (
                <div
                  className={`mt-5 p-4 rounded-2xl text-sm font-medium flex items-center justify-between ${
                    feedback.type === 'success'
                      ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                      : 'bg-red-50 text-red-900 border border-red-200'
                  }`}
                >
                  <span>{feedback.message}</span>
                  {feedback.type === 'success' && (
                    <button
                      type="button"
                      onClick={() => navigate('/gamer')}
                      className="px-3.5 py-1.5 bg-emerald-700 text-white text-xs font-semibold rounded-lg hover:bg-emerald-800 cursor-pointer"
                    >
                      Open My Battlepass Portal →
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* PARENTAL SAFETY GATE PIN MODAL */}
      {needsPinModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 border border-orange-200 shadow-2xl">
            <div className="flex items-center gap-2 text-orange-600 font-semibold text-xs mb-2">
              <Lock className="w-4 h-4" />
              <span>Parental Safety Gate Verification</span>
            </div>
            <h3 className="font-display text-xl font-bold text-stone-900">
              Enter 4-Digit Parental PIN
            </h3>
            <p className="text-sm text-stone-600 mt-2">
              Your account has Parental Safety Gate enabled for renewals and plan upgrades. (Demo hint for Alex Rivera: <code className="font-mono font-bold text-orange-700">4210</code>)
            </p>
            <input
              type="password"
              maxLength={4}
              value={parentalPin}
              onChange={(e) => setParentalPin(e.target.value)}
              placeholder="4210"
              className="mt-4 w-full px-4 py-3 text-center text-2xl font-mono tracking-widest border border-orange-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setNeedsPinModal(false)}
                className="px-4 py-2 text-sm font-medium text-stone-600 hover:text-stone-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleActivatePlan(selectedPlanId, parentalPin)}
                className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-xl cursor-pointer"
              >
                Authorize Renewal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GAME EDITION PREVIEW MODAL */}
      {previewGame && (
        <div className="fixed inset-0 z-50 bg-stone-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden border border-orange-200 shadow-2xl">
            <div className="h-48 w-full">
              <GameCoverArtwork variant={previewGame.name} />
            </div>
            <div className="p-6">
              <p className="text-xs font-semibold text-orange-600">{previewGame.category}</p>
              <h3 className="font-display text-2xl font-bold text-stone-900 mt-1">{previewGame.name}</h3>
              <p className="text-sm text-stone-600 mt-2">{previewGame.description}</p>

              <div className="mt-5 space-y-2">
                <p className="text-xs font-semibold text-stone-700">Available Editions & Variants:</p>
                {previewGame.variants.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-amber-50/70 border border-orange-100 text-sm"
                  >
                    <span className="font-medium text-stone-900">{v.name}</span>
                    <span className="font-mono font-bold text-orange-700 tabular-nums">
                      ${((previewGame.basePrice + v.priceAdjustment) / 100).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPreviewGame(null)}
                  className="px-4 py-2 text-sm font-medium text-stone-600 hover:text-stone-900 cursor-pointer"
                >
                  Close
                </button>
                <a
                  href="#subscription-plans"
                  onClick={() => setPreviewGame(null)}
                  className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-xl"
                >
                  Included with Champion Pass
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QUIET FOOTER */}
      <footer className="border-t border-orange-200/70 bg-[#FFF8EE] py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6 text-sm text-stone-600">
          <div className="flex items-center gap-3">
            <Gamepad2 className="w-5 h-5 text-orange-600" />
            <span className="font-display font-bold text-stone-900">Brightloop Gaming</span>
            <span>·</span>
            <span>Subscription & Battlepass Platform</span>
          </div>
          <div className="flex items-center gap-6 text-xs">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-orange-600" />
              18% GST Compliant Billing
            </span>
            <span>Parental Safety Gate Enabled</span>
            <span>© 2026 Brightloop Studios</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
