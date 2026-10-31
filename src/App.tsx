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
import { CheckoutPage } from './pages/CheckoutPage';
import { LandingPlansPage } from './pages/PublicHome';
import { CustomerLoyaltyPage } from './pages/CustomerLoyaltyPage';
import { CustomerInvoicesPage } from './pages/CustomerInvoicesPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AdminSubscriptionsPage } from './pages/AdminSubscriptionsPage';
import { AdminCustomersPage } from './pages/AdminCustomersPage';
import { AdminBillingPage } from './pages/AdminBillingPage';
import { AdminDiscountsPage } from './pages/AdminDiscountsPage';

function AppRoutes() {
  const { pathname } = useLocation();
  const workspace = pathname.startsWith('/admin/') || pathname.startsWith('/customer/');
  const landing = pathname === '/';
  const authPage = pathname === '/login' || pathname === '/register';
  return (
    <div className="min-h-screen flex flex-col bg-[#F5F4F0] text-stone-900">
      {!workspace && !landing && !authPage && <><Navbar /><RoleSwitcherBanner /></>}
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
                <Route path="/customer/loyalty" element={<CustomerLoyaltyPage />} />
                <Route path="/customer/invoices" element={<CustomerInvoicesPage />} />
                <Route path="/customer/payments" element={<FoundationPage />} />
                <Route path="/customer/security" element={<FoundationPage />} />
                <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
                <Route path="/admin/products" element={<FoundationPage />} />
                <Route path="/admin/subscriptions" element={<AdminSubscriptionsPage />} />
                <Route path="/admin/customers" element={<AdminCustomersPage />} />
                <Route path="/admin/billing" element={<AdminBillingPage />} />
                <Route path="/admin/discounts" element={<AdminDiscountsPage />} />
                <Route path="/admin/pause-cancellation" element={<FoundationPage />} />
                <Route path="/admin/loyalty" element={<FoundationPage />} />
                <Route path="/admin/invoices" element={<FoundationPage />} />
                <Route path="/admin/payments" element={<FoundationPage />} />
                <Route path="/admin/fraud" element={<AdminSecurityPage />} />
                <Route path="/admin/churn" element={<FoundationPage />} />
                <Route path="/admin/revenue-intelligence" element={<FoundationPage />} />
                <Route path="/admin/revenue-leakage" element={<FoundationPage />} />
                <Route path="/admin/forecasting" element={<FoundationPage />} />
                <Route path="/admin/reports" element={<FoundationPage />} />
                <Route path="/admin/settings" element={<FoundationPage />} />
              </Route>
              <Route path="/plans" element={<LandingPlansPage />} />
              <Route path="/checkout" element={<CheckoutPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return <AuthProvider><BrowserRouter><AppRoutes /></BrowserRouter></AuthProvider>;
}
