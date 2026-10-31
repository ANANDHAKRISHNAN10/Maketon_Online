import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Navbar, RoleSwitcherBanner } from './components/Navbar';
import { PublicHome } from './pages/PublicHome';
import { AuthPage } from './pages/AuthPage';
import { GamerDashboard } from './pages/GamerDashboard';
import { AdminControlCenter } from './pages/AdminControlCenter';
import { AdminFinancePage } from './pages/AdminFinancePage';
import { AdminSecurityPage } from './pages/AdminSecurityPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen flex flex-col bg-[#FFFBF5] text-stone-900">
          <Navbar />
          <RoleSwitcherBanner />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<PublicHome />} />
              <Route path="/login" element={<AuthPage />} />
              <Route path="/register" element={<AuthPage />} />
              <Route path="/gamer" element={<GamerDashboard />} />
              <Route path="/admin" element={<AdminControlCenter />} />
              <Route path="/admin/finance" element={<AdminFinancePage />} />
              <Route path="/admin/security" element={<AdminSecurityPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
