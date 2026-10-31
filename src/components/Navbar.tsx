import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Navbar() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleAnchorNav = (hash: string) => {
    if (location.pathname !== '/') {
      navigate('/' + hash);
    } else {
      const el = document.querySelector(hash);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-[#FFFBF5]/95 backdrop-blur-md border-b border-orange-200/70">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-8 px-6 py-4">
        {/* Zone 1: Single text element wordmark */}
        <Link
          to="/"
          className="font-display text-xl font-extrabold tracking-tight text-stone-900 whitespace-nowrap shrink-0 hover:text-orange-600 transition-colors"
        >
          Brightloop Gaming
        </Link>

        {/* Zone 2: 4–5 clean single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-stone-600">
          <Link
            to="/"
            className="hover:text-orange-600 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Home
          </Link>
          <button
            type="button"
            onClick={() => handleAnchorNav('#explore-games')}
            className="hover:text-orange-600 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Explore Games
          </button>
          <button
            type="button"
            onClick={() => handleAnchorNav('#subscription-plans')}
            className="hover:text-orange-600 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Subscription Plans
          </button>
          <Link
            to="/gamer"
            className={`hover:text-orange-600 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              location.pathname.startsWith('/gamer') ? 'text-orange-600 font-semibold' : ''
            }`}
          >
            My Account
          </Link>
          {(user?.role === 'ADMIN' || user?.role === 'STAFF') && (
            <Link
              to="/admin"
              className={`hover:text-orange-600 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
                location.pathname.startsWith('/admin') ? 'text-orange-600 font-semibold' : ''
              }`}
            >
              Admin Center
            </Link>
          )}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          {user ? (
            <Link
              to={user.role === 'ADMIN' || user.role === 'STAFF' ? '/admin' : '/gamer'}
              className="px-4 py-2 text-sm font-semibold text-white bg-orange-600 rounded-xl shadow-sm hover:bg-orange-700 transition-colors whitespace-nowrap shrink-0"
            >
              {user.role === 'GAMER' ? 'Gamer Portal' : 'Control Center'}
            </Link>
          ) : (
            <Link
              to="/login"
              className="px-4 py-2 text-sm font-semibold text-white bg-orange-600 rounded-xl shadow-sm hover:bg-orange-700 transition-colors whitespace-nowrap shrink-0"
            >
              Login / Sign Up
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

export function RoleSwitcherBanner() {
  const { user, demoAccounts, quickSwitchAccount, logout } = useAuth();
  const navigate = useNavigate();

  const handleSelectAccount = async (userId: string) => {
    const switched = await quickSwitchAccount(userId);
    if (switched) {
      if (switched.role === 'ADMIN' || switched.role === 'STAFF') {
        navigate('/admin');
      } else {
        navigate('/gamer');
      }
    }
  };

  return (
    <div className="bg-amber-50/90 border-b border-orange-200/60 px-6 py-2">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs text-stone-700">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-stone-900">Active Session:</span>
          {user ? (
            <span>
              {user.name} · <span className="font-mono">{user.email}</span> · Role: <strong>{user.role}</strong>
            </span>
          ) : (
            <span>Guest Visitor (Not signed in)</span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-stone-500">Quick Switch Demo Role:</span>
          <select
            aria-label="Quick Switch Demo Role"
            value={user?.id || ''}
            onChange={(e) => {
              if (e.target.value) handleSelectAccount(e.target.value);
            }}
            className="bg-white border border-orange-300 text-stone-800 rounded-lg px-2.5 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="" disabled>
              Select Seeded Account...
            </option>
            {demoAccounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                [{acc.role}] {acc.name} ({acc.email}){acc.isFrozen ? ' — Trade Locked' : ''}
              </option>
            ))}
          </select>

          <Link
            to="/gamer"
            className="px-2.5 py-1 bg-white border border-stone-200 rounded-lg font-medium text-stone-700 hover:border-orange-400 hover:text-orange-700 transition-colors whitespace-nowrap shrink-0"
          >
            /gamer
          </Link>
          <Link
            to="/admin"
            className="px-2.5 py-1 bg-white border border-stone-200 rounded-lg font-medium text-stone-700 hover:border-orange-400 hover:text-orange-700 transition-colors whitespace-nowrap shrink-0"
          >
            /admin
          </Link>
          <Link
            to="/admin/finance"
            className="px-2.5 py-1 bg-white border border-stone-200 rounded-lg font-medium text-stone-700 hover:border-orange-400 hover:text-orange-700 transition-colors whitespace-nowrap shrink-0"
          >
            /admin/finance
          </Link>
          <Link
            to="/admin/security"
            className="px-2.5 py-1 bg-white border border-stone-200 rounded-lg font-medium text-stone-700 hover:border-orange-400 hover:text-orange-700 transition-colors whitespace-nowrap shrink-0"
          >
            /admin/security
          </Link>
          {user ? (
            <button
              type="button"
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="px-2.5 py-1 text-stone-600 hover:text-red-600 font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sign Out
            </button>
          ) : (
            <Link
              to="/login"
              className="px-2.5 py-1 text-orange-700 font-semibold hover:underline whitespace-nowrap shrink-0"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
