import React, { useEffect, useState } from 'react';
import {
  Globe,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Unlock,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AdminSubnav } from '../components/AdminSubnav';

export function AdminSecurityPage() {
  const { user, authFetch } = useAuth();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Rate Limit & Card Bot Simulator State
  const [simIp, setSimIp] = useState('198.51.100.215');
  const [simCardLast4, setSimCardLast4] = useState('8819');
  const [simOutcome, setSimOutcome] = useState<'FAILED' | 'SUCCESS'>('FAILED');
  const [simResult, setSimResult] = useState<any>(null);
  const [testingRateLimit, setTestingRateLimit] = useState(false);

  // Geo-IP Jump Simulator State
  const [geoTargetUser, setGeoTargetUser] = useState('usr_gamer_1');
  const [geoFrom, setGeoFrom] = useState('US');
  const [geoTo, setGeoTo] = useState('JP');

  const loadSecurity = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/security/dashboard');
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && (user.role === 'ADMIN' || user.role === 'STAFF')) {
      loadSecurity();
    }
  }, [user?.id, user?.role]);

  const handleTestCheckoutAttempt = async () => {
    setTestingRateLimit(true);
    setFeedback(null);
    try {
      const res = await authFetch('/api/security/checkout-rate-limit', {
        method: 'POST',
        body: JSON.stringify({
          simulatedIp: simIp,
          cardLast4: simCardLast4,
          simulateOutcome: simOutcome,
          amountCents: 1499,
        }),
      });
      const json = await res.json();
      setSimResult(json);
      if (json.blocked) {
        setFeedback({ type: 'error', message: json.message });
      } else {
        setFeedback({ type: 'success', message: json.message });
      }
      await loadSecurity();
    } finally {
      setTestingRateLimit(false);
    }
  };

  const handleTriggerGeoJump = async () => {
    setFeedback(null);
    const res = await authFetch('/api/security/simulate-geo-jump', {
      method: 'POST',
      body: JSON.stringify({
        userId: geoTargetUser,
        fromCountry: geoFrom,
        toCountry: geoTo,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      setFeedback({ type: 'success', message: json.message });
      await loadSecurity();
    } else {
      setFeedback({ type: 'error', message: json.error });
    }
  };

  const handleUnlockAccount = async (userId: string) => {
    const res = await authFetch('/api/security/unlock-account', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    const json = await res.json();
    if (res.ok) {
      setFeedback({ type: 'success', message: json.message });
      await loadSecurity();
    }
  };

  const handleUnblockIp = async (ipAddress: string) => {
    const res = await authFetch('/api/security/unblock-ip', {
      method: 'POST',
      body: JSON.stringify({ ipAddress }),
    });
    const json = await res.json();
    if (res.ok) {
      setFeedback({ type: 'success', message: json.message });
      await loadSecurity();
    }
  };

  const handleResetSeed = async () => {
    const res = await authFetch('/api/admin/reset-seed', { method: 'POST' });
    if (res.ok) {
      setFeedback({ type: 'success', message: 'Security logs and seed state reset.' });
      await loadSecurity();
    }
  };

  if (user?.role === 'GAMER') {
    return <AdminSubnav />;
  }

  const logs: any[] = data?.logs || [];
  const blocklist: any[] = data?.blocklist || [];
  const frozenUsers: any[] = data?.frozenUsers || [];

  return (
    <div className="min-h-screen bg-[#FFFBF5] pb-20">
      <AdminSubnav onResetSeed={handleResetSeed} />

      <div className="max-w-7xl mx-auto px-6 mt-8 space-y-8">
        <div>
          <p className="text-xs font-semibold text-orange-600">
            Bot Mitigation, Token-Bucket Rate Limiter & Geo-IP Trade Locks · /admin/security
          </p>
          <h1 className="font-display text-3xl font-extrabold text-stone-900 tracking-tight">
            Brightloop Security & Anti-Fraud Center
          </h1>
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

        {/* Interactive Simulators Row: Token-Bucket Card Bot Test + Geo-IP Jump Test */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Token Bucket & 3-Failed-Attempts Card Bot Tester */}
          <div className="lg:col-span-6 bg-white rounded-3xl border border-orange-200/80 p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-orange-600 text-xs font-semibold">
              <Zap className="w-4 h-4" />
              <span>POST /api/security/checkout-rate-limit</span>
            </div>
            <h2 className="font-display text-xl font-bold text-stone-900">
              Token-Bucket & Card-Testing Bot Simulator
            </h2>
            <p className="text-xs text-stone-600">
              Three consecutive failed card attempts from the same IP automatically block further checkouts for 24 hours and record a <code className="font-mono">CARD_BOT_ATTACK</code> security event.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Client IP</label>
                <input
                  type="text"
                  value={simIp}
                  onChange={(e) => setSimIp(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-stone-200 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Card Last 4</label>
                <input
                  type="text"
                  maxLength={4}
                  value={simCardLast4}
                  onChange={(e) => setSimCardLast4(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-stone-200 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Card Result</label>
                <select
                  value={simOutcome}
                  onChange={(e) => setSimOutcome(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs border border-stone-200 rounded-xl bg-white"
                >
                  <option value="FAILED">FAILED (Declined)</option>
                  <option value="SUCCESS">SUCCESS (Approved)</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handleTestCheckoutAttempt}
              disabled={testingRateLimit}
              className="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white font-display font-bold text-xs rounded-xl shadow-xs cursor-pointer"
            >
              {testingRateLimit ? 'Evaluating...' : 'Send Checkout Attempt to Rate Limiter'}
            </button>

            {simResult && (
              <div className="p-4 rounded-2xl bg-stone-900 text-orange-50 text-xs font-mono space-y-1">
                <p>
                  Status: <strong>{simResult.blocked ? 'BLOCKED (HTTP 429)' : 'ALLOWED (HTTP 200)'}</strong> · Policy:{' '}
                  {simResult.reason}
                </p>
                <p>
                  Failed Card Attempts: {simResult.failedAttempts}/3 · Bucket Tokens Remaining:{' '}
                  {simResult.tokensRemaining}
                </p>
              </div>
            )}
          </div>

          {/* Geo-IP Jump & 48-Hour Trade Lock Control */}
          <div className="lg:col-span-6 bg-white rounded-3xl border border-orange-200/80 p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-orange-600 text-xs font-semibold">
              <Globe className="w-4 h-4" />
              <span>Impossible Travel Velocity Detection</span>
            </div>
            <h2 className="font-display text-xl font-bold text-stone-900">
              Geo-IP Jump Detector & 48h Trade Lock
            </h2>
            <p className="text-xs text-stone-600">
              Detects logins from different countries within 1 hour and places a mandatory 48-hour trade & subscription modification lock on the account.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Target Gamer</label>
                <select
                  value={geoTargetUser}
                  onChange={(e) => setGeoTargetUser(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-stone-200 rounded-xl bg-white"
                >
                  <option value="usr_gamer_1">Alex Rivera</option>
                  <option value="usr_gamer_2">Maya Lin</option>
                  <option value="usr_gamer_5">Noah Takahashi</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Origin Country</label>
                <input
                  type="text"
                  value={geoFrom}
                  onChange={(e) => setGeoFrom(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 text-xs font-mono border border-stone-200 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Jump Country (&lt;1h)</label>
                <input
                  type="text"
                  value={geoTo}
                  onChange={(e) => setGeoTo(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 text-xs font-mono border border-stone-200 rounded-xl"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleTriggerGeoJump}
              className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white font-display font-bold text-xs rounded-xl shadow-xs cursor-pointer"
            >
              Simulate 1-Hour Geo-IP Jump & Trigger 48h Trade Lock
            </button>

            {/* Active Trade Locks List */}
            <div className="pt-2 space-y-2">
              <p className="text-xs font-bold text-stone-800">
                Accounts Currently Under 48-Hour Trade Lock ({frozenUsers.length}):
              </p>
              {frozenUsers.map((u) => (
                <div
                  key={u.id}
                  className="p-3 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-between text-xs"
                >
                  <div>
                    <p className="font-bold text-red-900">
                      {u.name} ({u.email})
                    </p>
                    <p className="font-mono text-red-700">
                      Locked until {new Date(u.tradeLockUntil).toLocaleString()} · Last IP: {u.lastLoginIp} ({u.lastLoginCountry})
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUnlockAccount(u.id)}
                    className="px-3 py-1.5 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 font-semibold rounded-lg inline-flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Lift Lock</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* IP Blocklist Table */}
        <div className="bg-white rounded-3xl border border-orange-200/80 p-6 shadow-sm space-y-4">
          <h2 className="font-display text-lg font-bold text-stone-900">
            Active IP Blocklist & Velocity Counters ({blocklist.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-stone-200 text-xs text-stone-500">
                  <th className="py-3 px-4">IP Address</th>
                  <th className="py-3 px-4 text-right">Failed Card Attempts</th>
                  <th className="py-3 px-4">Blocked Until</th>
                  <th className="py-3 px-4">Policy Reason</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-sm">
                {blocklist.map((b) => (
                  <tr key={b.ipAddress} className="hover:bg-amber-50/40">
                    <td className="py-3.5 px-4 font-mono font-bold text-stone-900">{b.ipAddress}</td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-red-600 tabular-nums">
                      {b.failedAttempts}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-stone-600">
                      {b.blockedUntil ? new Date(b.blockedUntil).toLocaleString() : 'Monitoring'}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-stone-600">{b.reason}</td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleUnblockIp(b.ipAddress)}
                        className="px-3 py-1 bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs font-semibold rounded-lg cursor-pointer"
                      >
                        Unblock IP
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* SecurityLog Audit Table */}
        <div className="bg-white rounded-3xl border border-orange-200/80 p-6 shadow-sm space-y-4">
          <h2 className="font-display text-lg font-bold text-stone-900">
            Security Event Log ({logs.length} Events)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-stone-200 text-xs text-stone-500">
                  <th className="py-3 px-4">Event Type</th>
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-4">IP / Account</th>
                  <th className="py-3 px-4">Telemetry Details</th>
                  <th className="py-3 px-4">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-sm">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-amber-50/40">
                    <td className="py-4 px-4 font-mono font-bold text-xs text-stone-900">
                      {log.eventType}
                    </td>
                    <td className="py-4 px-4 text-xs font-bold">
                      <span
                        className={
                          log.severity === 'CRITICAL' ? 'text-red-600' : 'text-amber-700'
                        }
                      >
                        {log.severity}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-xs">
                      <span className="font-mono font-semibold text-stone-900 block">
                        {log.ipAddress}
                      </span>
                      <span className="text-stone-500">
                        {log.userEmail || 'Anonymous Checkout Bot'}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-xs text-stone-600 max-w-md">
                      {log.detailsParsed?.description || log.details}
                    </td>
                    <td className="py-4 px-4 font-mono text-xs text-stone-500 tabular-nums">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
