import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, UserCheck, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function AuthPage() {
  const { loginWithToken, demoAccounts, quickSwitchAccount } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('alex@gamer.gg');
  const [password, setPassword] = useState('GamerPass!123');
  const [parentEmail, setParentEmail] = useState('');
  const [parentalPin, setParentalPin] = useState('');
  const [simulatedCountry, setSimulatedCountry] = useState('US');
  const [error, setError] = useState<string | null>(null);
  const [geoWarning, setGeoWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setGeoWarning(null);
    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload =
        mode === 'login'
          ? { email, password, simulatedCountry }
          : { name, email, password, parentEmail, parentalPin };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Authentication failed.');
      } else {
        loginWithToken(data.token, data.user);
        if (data.geoJumpDetected) {
          setGeoWarning(
            'Geo-IP Jump Detected (Country changed within 1 hour)! A 48-hour Trade Lock has been placed on your account and logged in Security Center.'
          );
          setTimeout(() => {
            navigate(data.user.role === 'GAMER' ? '/gamer' : '/admin');
          }, 2200);
        } else {
          navigate(data.user.role === 'GAMER' ? '/gamer' : '/admin');
        }
      }
    } catch {
      setError('Network error during authentication.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFBF5] py-16 px-6">
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left column: Form */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-orange-200/80 p-8 shadow-sm">
          <div className="flex items-center gap-2 p-1 bg-orange-100/70 rounded-xl w-fit mb-6">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                mode === 'login' ? 'bg-white text-orange-600 shadow-xs' : 'text-stone-600'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                mode === 'register' ? 'bg-white text-orange-600 shadow-xs' : 'text-stone-600'
              }`}
            >
              Create Gamer Account
            </button>
          </div>

          <h1 className="font-display text-2xl font-extrabold text-stone-900">
            {mode === 'login' ? 'Welcome Back to Brightloop' : 'Create Your Brightloop Pass Account'}
          </h1>
          <p className="text-sm text-stone-600 mt-1 mb-6">
            {mode === 'login'
              ? 'Access your Battlepass, download GST invoices, or manage platform operations.'
              : 'Includes instant Monthly Champion Tier provisioning and optional Parental Safety Gate PIN.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Gamer Display Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jordan Vance"
                  className="w-full px-4 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            {mode === 'login' && (
              <div className="p-3.5 bg-amber-50/70 border border-orange-200/80 rounded-2xl">
                <label className="block text-xs font-semibold text-stone-800 mb-1">
                  Login Country (Geo-IP Jump Security Test)
                </label>
                <select
                  value={simulatedCountry}
                  onChange={(e) => setSimulatedCountry(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-stone-200 rounded-lg"
                >
                  <option value="US">United States (US — Normal Session)</option>
                  <option value="JP">Japan (JP — Triggers 1-Hour Geo-IP Jump & 48h Trade Lock)</option>
                  <option value="DE">Germany (DE — Triggers 1-Hour Geo-IP Jump & 48h Trade Lock)</option>
                </select>
              </div>
            )}

            {mode === 'register' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Parent Email (Optional)
                  </label>
                  <input
                    type="email"
                    value={parentEmail}
                    onChange={(e) => setParentEmail(e.target.value)}
                    placeholder="parent@family.org"
                    className="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    4-Digit Parental PIN (Optional)
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    value={parentalPin}
                    onChange={(e) => setParentalPin(e.target.value)}
                    placeholder="4210"
                    className="w-full px-3.5 py-2 text-sm font-mono border border-stone-200 rounded-xl"
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 text-xs font-medium rounded-xl">
                {error}
              </div>
            )}

            {geoWarning && (
              <div className="p-4 bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold rounded-xl flex items-start gap-2.5">
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
                <span>{geoWarning}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-6 bg-orange-600 hover:bg-orange-700 text-white font-display font-bold text-sm rounded-2xl shadow-sm transition-colors cursor-pointer"
            >
              {loading ? 'Authenticating...' : mode === 'login' ? 'Sign In to Brightloop' : 'Create Account & Start Pass'}
            </button>
          </form>
        </div>

        {/* Right column: Seeded Role Accounts for Instant Evaluation */}
        <div className="lg:col-span-5 bg-white rounded-3xl border border-orange-200/80 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-orange-600 text-xs font-semibold">
            <UserCheck className="w-4 h-4" />
            <span>Seeded Accounts (1 Admin, 1 Staff, 5 Gamers)</span>
          </div>
          <h2 className="font-display text-lg font-bold text-stone-900">
            One-Click Role & Scenario Login
          </h2>
          <p className="text-xs text-stone-600">
            Click any seeded user below to populate credentials or switch straight into their session.
          </p>

          <div className="space-y-2.5">
            {demoAccounts.map((acc) => (
              <div
                key={acc.id}
                className="p-3.5 rounded-2xl border border-stone-200/80 hover:border-orange-300 transition-all flex items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-bold text-orange-700">{acc.role}</span>
                    <span className="text-stone-400">·</span>
                    <span className="font-semibold text-stone-900">{acc.name}</span>
                  </div>
                  <p className="text-xs font-mono text-stone-500 mt-0.5">{acc.email}</p>
                  {acc.planName && (
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      {acc.planName} ({acc.subStatus})
                      {acc.parentalGateOn ? ' · PIN: 4210' : ''}
                      {acc.isFrozen ? ' · 48h Trade Lock' : ''}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    const user = await quickSwitchAccount(acc.id);
                    if (user) {
                      navigate(user.role === 'GAMER' ? '/gamer' : '/admin');
                    }
                  }}
                  className="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 font-semibold text-xs rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Login As {acc.role}
                </button>
              </div>
            ))}
          </div>

          <div className="p-3.5 bg-stone-50 rounded-2xl text-xs text-stone-600 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-stone-800">
              <Lock className="w-3.5 h-3.5 text-orange-600" />
              <span>Standard Seed Passwords:</span>
            </div>
            <p className="font-mono">Admin: BrightloopAdmin!2026</p>
            <p className="font-mono">Staff: BrightloopStaff!2026</p>
            <p className="font-mono">Gamers: GamerPass!123</p>
          </div>
        </div>
      </div>
    </div>
  );
}
