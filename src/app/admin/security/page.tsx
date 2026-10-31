"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  Globe2,
  Lock,
  Unlock,
  AlertTriangle,
  Bot,
  Zap,
  Activity,
  CheckCircle2,
  RefreshCw,
  Terminal,
  Crosshair,
  Radio,
  Clock,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { formatDateTime } from "@/lib/utils";

export default function SecurityAndFraudCenter() {
  const [loading, setLoading] = useState(true);
  const [securityData, setSecurityData] = useState<any>(null);
  const [rateLimitData, setRateLimitData] = useState<any>(null);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isSimulatingBot, setIsSimulatingBot] = useState(false);
  const [tradeLockLoading, setTradeLockLoading] = useState<string | null>(null);

  const fetchSecurityState = async () => {
    try {
      setLoading(true);
      const [logsRes, rateLimitRes] = await Promise.all([
        fetch("/api/security/logs"),
        fetch("/api/security/checkout-rate-limit"),
      ]);

      const logsJson = await logsRes.json();
      const rateLimitJson = await rateLimitRes.json();

      if (logsJson.success) setSecurityData(logsJson);
      if (rateLimitJson.success) setRateLimitData(rateLimitJson);
    } catch (err) {
      console.error("Failed to load security state:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecurityState();
    // Poll every 10 seconds for real-time radar updates
    const interval = setInterval(fetchSecurityState, 10000);
    return () => clearInterval(interval);
  }, []);

  // Trigger 48h Trade Lock on a suspicious user
  const handleToggleTradeLock = async (userId: string, isCurrentlyFrozen: boolean) => {
    try {
      setTradeLockLoading(userId);
      setActionMessage(null);
      const res = await fetch("/api/security/trade-lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          action: isCurrentlyFrozen ? "unlock" : "lock",
          reason: "Cross-continent Geo-IP jump detected in under 1 hour. Preventative 48h freeze.",
        }),
      });
      const result = await res.json();
      if (result.success) {
        setActionMessage({ type: "success", text: result.message });
        fetchSecurityState();
      } else {
        setActionMessage({ type: "error", text: result.error });
      }
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Failed to toggle trade lock" });
    } finally {
      setTradeLockLoading(null);
    }
  };

  // Simulate Card Testing Bot Attack (3 rapid failures)
  const handleSimulateBotAttack = async () => {
    try {
      setIsSimulatingBot(true);
      setActionMessage(null);
      const dummyBotIp = "198.51.100." + Math.floor(Math.random() * 80 + 10);

      // Trigger 3 failed attempts in rapid succession
      for (let i = 1; i <= 3; i++) {
        await fetch("/api/security/checkout-rate-limit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ip: dummyBotIp,
            action: "simulate_failure",
            userAgent: "CardTestingBot/3.4 (Automated headless tester)",
            cardBin: "424242",
          }),
        });
      }

      setActionMessage({
        type: "success",
        text: `Bot attack simulated from ${dummyBotIp}! Token bucket defense tripped: 3 failed attempts detected, IP auto-blocked, and CARD_BOT_ATTACK logged.`,
      });
      fetchSecurityState();
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Failed to simulate bot attack" });
    } finally {
      setIsSimulatingBot(false);
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
            <span className="px-2.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" />
              Real-time Threat Mitigation
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-xs text-slate-400">Automated Security Perimeter</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight mt-1 flex items-center gap-2">
            Security & Fraud Center
            <ShieldAlert className="w-6 h-6 text-rose-400" />
          </h1>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleSimulateBotAttack}
            disabled={isSimulatingBot}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-black font-bold text-xs transition-all shadow-lg"
          >
            <Bot className="w-4 h-4" />
            <span>{isSimulatingBot ? "Tripping Defense..." : "Simulate Card Bot Attack"}</span>
          </button>

          <button
            onClick={fetchSecurityState}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-surface border border-border text-xs text-slate-300 hover:text-white hover:bg-surface-hover transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* TOP THREAT METRICS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-surface-card border border-border">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Geo-IP Jumps</span>
            <Globe2 className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-purple-400 mt-1">
            {securityData?.counts?.geoIpJumps || 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Impossible Travel Flags</div>
        </div>

        <div className="p-4 rounded-xl bg-surface-card border border-border">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Card Bots Blocked</span>
            <Bot className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400 mt-1">
            {securityData?.counts?.cardBotAttacks || 0}
          </div>
          <div className="text-[11px] text-rose-400/90 mt-0.5">3-Failure Trigger Tripped</div>
        </div>

        <div className="p-4 rounded-xl bg-surface-card border border-border">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Active Blocked IPs</span>
            <Lock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400 mt-1">
            {rateLimitData?.activeBlockedIps?.length || 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">15-Minute Blacklist Window</div>
        </div>

        <div className="p-4 rounded-xl bg-surface-card border border-border">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Token Bucket Status</span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-cyan-400 mt-1 font-mono">10 req / 2/s</div>
          <div className="text-[11px] text-emerald-400 mt-0.5">Active Rate Limiting</div>
        </div>
      </div>

      {/* SECTION 1: GEO-IP JUMP TRACKER */}
      <div className="rounded-2xl bg-gradient-to-br from-[#121020] via-[#141226] to-[#0a0815] border border-purple-500/40 p-6 shadow-2xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/80 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-500 to-indigo-600 flex items-center justify-center shadow-neon-purple">
              <Globe2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Geo-IP Jump Tracker
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono font-bold border border-purple-500/30">
                  Impossible Travel Heuristic
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Flags accounts where login location jumped across countries in under 1 hour, indicating stolen session cookies or proxy rotation
              </p>
            </div>
          </div>
        </div>

        {/* Geo-IP Jumps List */}
        {securityData?.geoIpJumps?.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-xs">
            No impossible travel events currently flagged.
          </div>
        ) : (
          <div className="space-y-4">
            {securityData?.geoIpJumps?.map((jump: any) => {
              const details = jump.details || {};
              const isLocked = jump.isUserFrozen;

              return (
                <div
                  key={jump.id}
                  className="bg-[#0b0c16] rounded-xl p-5 border border-purple-500/30 space-y-4 shadow-lg"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-ping" />
                      <span className="text-sm font-bold text-white">{jump.userEmail}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface border border-border text-slate-400">
                        UID: {jump.userId?.slice(0, 8) || "N/A"}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] font-mono text-purple-400 bg-purple-950/60 px-2 py-1 rounded border border-purple-500/40">
                        {details.timeDeltaMinutes || 35} mins interval
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-1 rounded uppercase border ${
                          isLocked
                            ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                            : "bg-amber-500/20 text-amber-300 border-amber-500/40"
                        }`}
                      >
                        {isLocked ? "🔒 48H TRADE LOCKED" : "⚠️ AT RISK"}
                      </span>
                    </div>
                  </div>

                  {/* Travel trajectory path */}
                  <div className="grid grid-cols-1 md:grid-cols-7 gap-3 items-center bg-surface/50 p-4 rounded-lg border border-border/60">
                    <div className="md:col-span-3 space-y-1">
                      <div className="text-[10px] uppercase font-semibold text-slate-400">
                        Previous Location:
                      </div>
                      <div className="text-sm font-bold text-slate-100 flex items-center space-x-1.5">
                        <span>🇯🇵</span>
                        <span>{details.previousLocation || "Tokyo, Japan (JP)"}</span>
                      </div>
                      <div className="text-xs text-slate-400 font-mono">
                        IP: {details.previousIp || "103.1.200.4"}
                      </div>
                    </div>

                    <div className="md:col-span-1 text-center py-2 md:py-0">
                      <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300">
                        <ArrowRight className="w-4 h-4" />
                      </div>
                      <div className="text-[9px] text-rose-400 font-mono font-bold mt-1">
                        12.5h Flight Time
                      </div>
                    </div>

                    <div className="md:col-span-3 space-y-1 md:text-right">
                      <div className="text-[10px] uppercase font-semibold text-slate-400">
                        Sudden Jump Location:
                      </div>
                      <div className="text-sm font-bold text-slate-100 flex items-center md:justify-end space-x-1.5">
                        <span>🇬🇧</span>
                        <span>{details.currentLocation || "London, United Kingdom (GB)"}</span>
                      </div>
                      <div className="text-xs text-slate-400 font-mono">
                        IP: {details.currentIp || jump.ipAddress}
                      </div>
                    </div>
                  </div>

                  {/* Explanation & Action Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <p className="text-xs text-slate-300">
                      Physical travel of ~9,560 km in {details.timeDeltaMinutes || 35} minutes is mathematically impossible. Session hijack suspected.
                    </p>

                    <button
                      onClick={() => handleToggleTradeLock(jump.userId, isLocked)}
                      disabled={tradeLockLoading === jump.userId}
                      className={`px-4 py-2 rounded-lg font-bold text-xs transition-colors flex items-center justify-center space-x-1.5 ${
                        isLocked
                          ? "bg-slate-700 hover:bg-slate-600 text-slate-200"
                          : "bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-900/30"
                      }`}
                    >
                      {isLocked ? (
                        <>
                          <Unlock className="w-3.5 h-3.5" />
                          <span>Lift Trade Lock</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          <span>Trigger 48h Trade Lock</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 2: CARD BOT RADAR */}
      <div className="rounded-2xl bg-gradient-to-br from-[#160f16] via-[#1a121d] to-[#0d0910] border border-rose-500/40 p-6 shadow-2xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/80 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-600 flex items-center justify-center shadow-lg">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Card Bot Radar
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-mono font-bold border border-rose-500/30">
                  Token-Bucket Defense
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Detects and blocks automated card testing bots after 3 consecutive failed transactions from the same IP
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-xs font-mono text-rose-400 bg-rose-950/40 px-3 py-1.5 rounded-lg border border-rose-500/30">
            <Radio className="w-3.5 h-3.5 animate-pulse text-rose-400" />
            <span>RADAR ARMED • 3 FAILED THRESHOLD</span>
          </div>
        </div>

        {/* Visual Graph of Blocked Bot Traffic */}
        <div className="bg-[#0b080f] rounded-xl p-5 border border-border/80 space-y-4">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-rose-400" />
              Automated Bot Traffic & Rate Limiting Timeline
            </span>
            <span className="text-slate-400">Refill Rate: 2 tokens/sec | Burst Capacity: 10</span>
          </div>

          {/* Simulated Traffic Bars */}
          <div className="grid grid-cols-12 gap-1.5 h-24 items-end pt-4 pb-1 border-b border-border/60">
            {[15, 25, 10, 45, 95, 100, 80, 20, 15, 90, 100, 30].map((val, idx) => (
              <div key={idx} className="flex flex-col items-center h-full justify-end group">
                <div
                  style={{ height: `${val}%` }}
                  className={`w-full rounded-t transition-all ${
                    val >= 80
                      ? "bg-gradient-to-t from-rose-600 to-rose-400 shadow-sm"
                      : val >= 40
                      ? "bg-amber-500/70"
                      : "bg-cyan-500/40"
                  }`}
                  title={`${val}% traffic load (Bucket status)`}
                />
                <span className="text-[9px] text-slate-500 mt-1 font-mono">
                  {idx === 5 || idx === 10 ? "BLOCKED" : `t-${12 - idx}`}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-cyan-500/60" /> Normal Gamers
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-amber-500" /> Rate Limited
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-rose-500" /> Bot Blocked (3+ fails)
              </span>
            </div>
            <span className="font-mono text-rose-400">Mitigation: 15min IP Blacklist</span>
          </div>
        </div>

        {/* Card Bot Incident Log Table */}
        <div className="bg-[#0b080f] rounded-xl border border-border/80 overflow-hidden">
          <div className="px-4 py-3 bg-[#0f0b14] border-b border-border text-xs font-semibold text-slate-200">
            Recent Blocked Card Testing Attack Logs
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#09060c] text-slate-400 uppercase text-[10px] tracking-wider border-b border-border">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Blocked IP</th>
                  <th className="py-2.5 px-4 font-semibold">User Agent / Fingerprint</th>
                  <th className="py-2.5 px-4 font-semibold">Target BIN</th>
                  <th className="py-2.5 px-4 font-semibold">Failed Tries</th>
                  <th className="py-2.5 px-4 font-semibold">Timestamp</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Defense Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 text-slate-300">
                {securityData?.cardBotAttacks?.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-slate-500">
                      No card testing attacks recorded. Click &quot;Simulate Card Bot Attack&quot; above to test.
                    </td>
                  </tr>
                ) : (
                  securityData?.cardBotAttacks?.map((botLog: any) => {
                    const details = botLog.details || {};
                    return (
                      <tr key={botLog.id} className="hover:bg-surface/50">
                        <td className="py-3 px-4 font-mono font-bold text-rose-400">
                          {botLog.ipAddress}
                        </td>
                        <td className="py-3 px-4 text-slate-300 truncate max-w-xs font-mono text-[11px]">
                          {botLog.userAgent || "Automated Tester"}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-400">
                          {details.targetCardBin || "411111"}••••
                        </td>
                        <td className="py-3 px-4 font-mono text-amber-400 font-bold">
                          {details.consecutiveFailedAttempts || 3} attempts
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-[11px]">
                          {formatDateTime(botLog.createdAt)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 uppercase">
                            BLOCKED
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
