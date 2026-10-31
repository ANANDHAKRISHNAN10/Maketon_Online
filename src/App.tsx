import React from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Navbar, RoleSwitcherBanner } from './components/Navbar';
import { PublicHome } from './pages/PublicHome';
import { AuthPage } from './pages/AuthPage';
import { GamerDashboard } from './pages/GamerDashboard';
import { AdminControlCenter } from './pages/AdminControlCenter';
import { AdminFinancePage } from './pages/AdminFinancePage';
import { AdminSecurityPage } from './pages/AdminSecurityPage';
import { AppShell } from './components/layout/AppShell';
import { FoundationPage } from './pages/FoundationPage';

function AppRoutes() {
  const { pathname } = useLocation();
  const workspace = pathname.startsWith('/admin/') || pathname.startsWith('/customer/');
  return (
    <div className="min-h-screen flex flex-col bg-[#F5F4F0] text-stone-900">
      {!workspace && <><Navbar /><RoleSwitcherBanner /></>}
      <main className="flex-1">
            <Routes>
              <Route path="/" element={<PublicHome />} />
              <Route path="/login" element={<AuthPage />} />
              <Route path="/register" element={<AuthPage />} />
              <Route path="/gamer" element={<GamerDashboard />} />
              <Route path="/admin" element={<AdminControlCenter />} />
              <Route path="/admin/finance" element={<AdminFinancePage />} />
              <Route path="/admin/security" element={<AdminSecurityPage />} />
              <Route element={<AppShell />}>
                <Route path="/customer/dashboard" element={<FoundationPage />} />
                <Route path="/customer/subscriptions" element={<FoundationPage />} />
                <Route path="/customer/loyalty" element={<FoundationPage />} />
                <Route path="/customer/invoices" element={<FoundationPage />} />
                <Route path="/customer/security" element={<FoundationPage />} />
                <Route path="/admin/dashboard" element={<FoundationPage />} />
                <Route path="/admin/products" element={<FoundationPage />} />
                <Route path="/admin/subscriptions" element={<FoundationPage />} />
                <Route path="/admin/customers" element={<FoundationPage />} />
                <Route path="/admin/billing" element={<FoundationPage />} />
                <Route path="/admin/discounts" element={<FoundationPage />} />
                <Route path="/admin/fraud" element={<FoundationPage />} />
                <Route path="/admin/churn" element={<FoundationPage />} />
                <Route path="/admin/revenue-leakage" element={<FoundationPage />} />
                <Route path="/admin/forecasting" element={<FoundationPage />} />
                <Route path="/admin/reports" element={<FoundationPage />} />
                <Route path="/admin/settings" element={<FoundationPage />} />
              </Route>
              <Route path="/plans" element={<Navigate to="/#subscription-plans" replace />} />
              <Route path="/checkout" element={<Navigate to="/#subscription-plans" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return <AuthProvider><BrowserRouter><AppRoutes /></BrowserRouter></AuthProvider>;
}
