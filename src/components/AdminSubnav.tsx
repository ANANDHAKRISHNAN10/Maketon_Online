import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BarChart3,
  FileText,
  Layers,
  ShieldAlert,
  TrendingUp,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function AdminSubnav({
  onResetSeed,
  resetting,
}: {
  onResetSeed?: () => void;
  resetting?: boolean;
}) {
  const location = useLocation();
  const { user, quickSwitchAccount } = useAuth();

  if (user && user.role === 'GAMER') {
    return (
      <div className="bg-amber-50 border-b border-orange-200 px-6 py-8">
        <div className="max-w-4xl mx-auto bg-white rounded-3xl border border-orange-200 p-8 shadow-sm text-center space-y-4">
          <p className="text-xs font-bold text-red-600">Role-Based Access Control (RBAC) Enforcement</p>
          <h2 className="font-display text-2xl font-extrabold text-stone-900">
            Admin or Staff Role Required
          </h2>
          <p className="text-sm text-stone-600 max-w-lg mx-auto">
            You are currently signed in as <strong>{user.name}</strong> (<code className="font-mono">{user.role}</code>). Gamers cannot access administrative billing intelligence or security consoles.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => quickSwitchAccount('usr_admin_1')}
              className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl cursor-pointer"
            >
              Switch to Elena Vance (ADMIN)
            </button>
            <button
              type="button"
              onClick={() => quickSwitchAccount('usr_staff_1')}
              className="px-5 py-2.5 bg-orange-100 hover:bg-orange-200 text-orange-800 text-xs font-bold rounded-xl cursor-pointer"
            >
              Switch to Marcus Chen (STAFF)
            </button>
          </div>
        </div>
      </div>
    );
  }

  const navItems = [
    { to: '/admin', label: 'Control Center & Catalog', icon: Layers },
    { to: '/admin/finance', label: 'Revenue Intelligence & Churn', icon: TrendingUp },
    { to: '/admin/security', label: 'Security & Bot Defense', icon: ShieldAlert },
  ];

  return (
    <div className="bg-white border-b border-orange-200/80 px-6 py-4">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'bg-orange-50/70 text-stone-700 hover:bg-orange-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        {onResetSeed && (
          <button
            type="button"
            onClick={onResetSeed}
            disabled={resetting}
            className="px-3.5 py-2 bg-stone-100 hover:bg-orange-100 text-stone-700 hover:text-orange-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer self-start md:self-auto whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
            <span>{resetting ? 'Resetting Seed...' : 'Reset Demo Seed Data'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
