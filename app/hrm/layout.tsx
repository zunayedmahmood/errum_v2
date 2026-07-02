'use client';

import React, { useState } from 'react';
import { StoreProvider, useStore } from '@/contexts/StoreContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { usePathname, useRouter } from 'next/navigation';
import RouteGuard from '@/components/RouteGuard';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { PAGE_ACCESS } from '@/lib/accessMap';
import { LayoutDashboard, Users, BarChart3, Target, Zap, CreditCard, ChevronDown, Building2 } from 'lucide-react';

function HRMLayoutContent({ children }: { children: React.ReactNode }) {
  const { isGlobal, user } = useAuth();
  const { darkMode, setDarkMode } = useTheme();
  const { selectedStoreId, setSelectedStoreId, availableStores, isLoadingStores } = useStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  const tabs = [
    { label: 'My Dashboard', href: '/hrm/my', icon: LayoutDashboard, roles: ['employee', 'pos-salesman', 'branch-manager', 'admin', 'super-admin', 'online-moderator'] },
    { label: 'Staff', href: '/hrm/branch', icon: Users, roles: ['branch-manager', 'admin', 'super-admin', 'online-moderator'] },
    { label: 'Attendance Logs', href: '/hrm/attendance', icon: BarChart3, roles: ['branch-manager', 'admin', 'super-admin', 'online-moderator'] },
    { label: 'Sales Targets', href: '/hrm/sales-targets', icon: Target, roles: ['branch-manager', 'admin', 'super-admin', 'online-moderator'] },
    { label: 'Rewards & Fines', href: '/hrm/rewards-fines', icon: Zap, roles: ['branch-manager', 'admin', 'super-admin', 'online-moderator'] },
    { label: 'Payroll', href: '/hrm/payroll', icon: CreditCard, roles: ['branch-manager', 'admin', 'super-admin', 'online-moderator'] },
  ];

  const filteredTabs = tabs.filter((tab) => !!user?.role?.slug && tab.roles.includes(user.role.slug));

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          />

          <div className="border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">HRM Management</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Attendance, performance, rewards and payroll</p>
                  </div>
                </div>
              </div>

              {isGlobal && (
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                  <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    <Building2 className="h-4 w-4" />
                    Branch / Outlet
                  </label>
                  <div className="relative">
                    <select
                      value={selectedStoreId || ''}
                      onChange={(e) => setSelectedStoreId(e.target.value ? Number(e.target.value) : null)}
                      disabled={isLoadingStores}
                      className="w-full min-w-56 rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-9 text-sm text-gray-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    >
                      <option value="">Select branch/outlet</option>
                      {availableStores.map((store) => (
                        <option key={store.id} value={store.id}>{store.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 overflow-x-auto">
              <nav className="flex gap-2">
                {filteredTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = pathname === tab.href || (tab.href === '/hrm/branch' && pathname === '/hrm');
                  return (
                    <button
                      key={tab.href}
                      onClick={() => router.push(tab.href)}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition whitespace-nowrap ${isActive
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>

          <main className="hrm-root flex-1 overflow-y-auto bg-gray-50 p-6 dark:bg-gray-900">
            <style>{`
              .hrm-root { --hrm-text-main: rgb(17 24 39); --hrm-text-muted: rgb(107 114 128); --hrm-border-soft: rgb(229 231 235); --hrm-bg-soft: rgb(249 250 251); --hrm-accent: rgb(37 99 235); }
              .dark .hrm-root { --hrm-text-main: rgb(255 255 255); --hrm-text-muted: rgb(156 163 175); --hrm-border-soft: rgb(55 65 81); --hrm-bg-soft: rgb(31 41 55); --hrm-accent: rgb(96 165 250); }
              .hrm-root .hrm-card { background: #ffffff; border: 1px solid rgb(229 231 235); box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
              .dark .hrm-root .hrm-card { background: rgb(31 41 55); border-color: rgb(55 65 81); box-shadow: none; }
              .hrm-root .text-muted { color: rgb(107 114 128) !important; }
              .dark .hrm-root .text-muted { color: rgb(156 163 175) !important; }
              .hrm-root .text-sub { color: rgb(75 85 99) !important; }
              .dark .hrm-root .text-sub { color: rgb(209 213 219) !important; }
              .hrm-root .text-main, .hrm-root .text-white { color: rgb(17 24 39) !important; }
              .dark .hrm-root .text-main, .dark .hrm-root .text-white { color: rgb(255 255 255) !important; }
              .hrm-root .divider { border-color: rgb(229 231 235) !important; }
              .dark .hrm-root .divider { border-color: rgb(55 65 81) !important; }
              .hrm-root .input-dark, .hrm-root .select-dark { width: 100%; background: #ffffff; border: 1px solid rgb(209 213 219); color: rgb(17 24 39); box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
              .dark .hrm-root .input-dark, .dark .hrm-root .select-dark { background: rgb(55 65 81); border-color: rgb(75 85 99); color: #ffffff; }
              .hrm-root .input-dark:focus, .hrm-root .select-dark:focus { outline: none; border-color: rgb(59 130 246); box-shadow: 0 0 0 3px rgba(59,130,246,0.15); }
              .hrm-root .input-dark::placeholder { color: rgb(156 163 175); }
              .hrm-root .btn-primary { background: rgb(37 99 235); color: #ffffff; font-weight: 700; transition: all .2s ease; }
              .hrm-root .btn-primary:hover { background: rgb(29 78 216); }
              .hrm-root .btn-primary:disabled { opacity: .6; cursor: not-allowed; }
              .hrm-root .btn-ghost { background: #ffffff; border: 1px solid rgb(209 213 219); color: rgb(55 65 81); transition: all .2s ease; }
              .hrm-root .btn-ghost:hover { background: rgb(249 250 251); color: rgb(17 24 39); }
              .dark .hrm-root .btn-ghost { background: rgb(31 41 55); border-color: rgb(75 85 99); color: rgb(229 231 235); }
              .dark .hrm-root .btn-ghost:hover { background: rgb(55 65 81); color: #ffffff; }
              .hrm-root .table-row-hover:hover { background: rgb(249 250 251); }
              .dark .hrm-root .table-row-hover:hover { background: rgba(55,65,81,0.45); }
              .hrm-root .progress-track { background: rgb(229 231 235); border-radius: 999px; overflow: hidden; }
              .dark .hrm-root .progress-track { background: rgb(55 65 81); }
              .hrm-root .progress-gold, .hrm-root .progress-blue { background: rgb(37 99 235); border-radius: 999px; }
              .hrm-root .progress-green { background: rgb(22 163 74); border-radius: 999px; }
              .hrm-root .pill-gold { background: rgb(239 246 255); border: 1px solid rgb(191 219 254); color: rgb(29 78 216); }
              .dark .hrm-root .pill-gold { background: rgba(37,99,235,.15); border-color: rgba(59,130,246,.35); color: rgb(147 197 253); }
              .hrm-root .pill-green { background: rgb(240 253 244); border: 1px solid rgb(187 247 208); color: rgb(22 101 52); }
              .dark .hrm-root .pill-green { background: rgba(34,197,94,.12); border-color: rgba(34,197,94,.25); color: rgb(134 239 172); }
              .hrm-root .pill-red { background: rgb(254 242 242); border: 1px solid rgb(254 202 202); color: rgb(185 28 28); }
              .dark .hrm-root .pill-red { background: rgba(239,68,68,.12); border-color: rgba(239,68,68,.25); color: rgb(252 165 165); }
              .hrm-root .pill-blue { background: rgb(239 246 255); border: 1px solid rgb(191 219 254); color: rgb(29 78 216); }
              .dark .hrm-root .pill-blue { background: rgba(59,130,246,.12); border-color: rgba(59,130,246,.25); color: rgb(147 197 253); }
              .hrm-root .pill-amber { background: rgb(255 251 235); border: 1px solid rgb(253 230 138); color: rgb(146 64 14); }
              .dark .hrm-root .pill-amber { background: rgba(245,158,11,.12); border-color: rgba(245,158,11,.25); color: rgb(252 211 77); }
            `}</style>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

export default function HRMLayout({ children }: { children: React.ReactNode }) {
  return (
    <RouteGuard allowedRoles={PAGE_ACCESS['/hrm']}>
      <StoreProvider>
        <HRMLayoutContent children={children} />
      </StoreProvider>
    </RouteGuard>
  );
}
