import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  Shield,
  Activity,
  SlidersHorizontal,
  LogOut,
  ExternalLink,
  Menu,
  X,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { AdminTab } from '../../types';

type AdminLayoutProps = {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  onExitToUserApp: () => void;
  children: React.ReactNode;
};

export function AdminLayout({
  activeTab,
  onTabChange,
  onExitToUserApp,
  children,
}: AdminLayoutProps) {
  const { user, profile, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: { id: AdminTab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'user-management', label: 'Users', icon: Users },
    { id: 'sessions', label: 'Sessions', icon: Activity },
    { id: 'platform-settings', label: 'Platform Settings', icon: SlidersHorizontal },
    { id: 'security-logs', label: 'Audit Logs', icon: Shield },
  ];

  return (
    <div className="min-h-screen bg-[#0B0D0E] text-zinc-100 flex flex-col font-sans selection:bg-violet-500/30 selection:text-violet-200">
      {/* Top AMOLED Navigation Bar - Full Fluid Width */}
      <header className="sticky top-0 z-40 bg-[#0B0D0E]/90 backdrop-blur-md border-b border-zinc-800/80 px-6 lg:px-12 py-3.5 transition-all w-full">
        <div className="w-full flex items-center justify-between gap-4">
          {/* Left: Branding & Role Badge */}
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-2.5 cursor-pointer"
              onClick={() => onTabChange('overview')}
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-rose-500 p-0.5 shadow-lg shadow-violet-500/10">
                <div className="w-full h-full bg-[#0B0D0E] rounded-[10px] flex items-center justify-center">
                  <ShieldAlert className="w-5 h-5 text-violet-400" />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-sm sm:text-base tracking-tight text-white flex items-center gap-1.5">
                  HP Budgeting
                </span>
              </div>
            </div>

            {/* Violet Admin Workspace Pill Badge */}
            <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-950/40 text-violet-300 border border-violet-800 text-xs font-semibold tracking-wide shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              <span>ADMIN WORKSPACE</span>
            </div>
          </div>

          {/* Center: Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 bg-[#121417] p-1 rounded-xl border border-zinc-800/80">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`relative flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'text-white'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeAdminTabBadge"
                      className="absolute inset-0 bg-violet-950/50 border border-violet-700/60 rounded-lg shadow-inner"
                      transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                    />
                  )}
                  <Icon
                    className={`w-3.5 h-3.5 relative z-10 ${
                      isActive ? 'text-violet-400' : 'text-zinc-400'
                    }`}
                  />
                  <span className="relative z-10">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right: Actions (Exit to App & Clean Sign Out) */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={onExitToUserApp}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#181B1F] hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white text-xs font-medium transition-all cursor-pointer shadow-sm group"
              title="Return to User Budgeting Workspace"
            >
              <ExternalLink className="w-3.5 h-3.5 text-zinc-400 group-hover:text-violet-400 transition-colors" />
              <span>Exit to App</span>
            </button>

            <button
              onClick={() => signOut()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/20 hover:bg-rose-900/30 border border-rose-900/40 hover:border-rose-800/60 text-rose-400 hover:text-rose-300 text-xs font-medium transition-all cursor-pointer shadow-sm"
              title="Secure Sign-Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>

            {/* Mobile menu trigger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-1.5 rounded-lg bg-[#181B1F] border border-zinc-800 text-zinc-400 hover:text-white"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="md:hidden overflow-hidden border-t border-zinc-800/80 mt-3 pt-3 flex flex-col gap-1.5"
            >
              <div className="flex items-center gap-1.5 px-2 py-1 mb-1">
                <span className="w-2 h-2 rounded-full bg-violet-400" />
                <span className="text-xs text-violet-300 font-semibold uppercase tracking-wider">
                  ADMIN WORKSPACE
                </span>
              </div>
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onTabChange(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all text-left ${
                      isActive
                        ? 'bg-violet-950/40 border border-violet-800/50 text-violet-200'
                        : 'text-zinc-400 hover:bg-zinc-800/40 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 text-violet-400" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Main Content Viewport - Fluid full-width scaling */}
      <main className="flex-1 w-full px-6 lg:px-12 py-6">
        {children}
      </main>

      {/* AMOLED Console Status Footer */}
      <footer className="border-t border-zinc-900 bg-[#0B0D0E] px-6 lg:px-12 py-3 text-[11px] text-zinc-500 font-mono flex flex-col sm:flex-row items-center justify-between gap-2 w-full">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Security Layer: RLS Enforced • Cryptographic RBAC • Zero Finance Snooping</span>
        </div>
        <div>
          Connected as: <span className="text-zinc-400 font-medium">{profile?.email || user?.email}</span> (Admin)
        </div>
      </footer>
    </div>
  );
}
