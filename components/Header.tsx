'use client';

import { useState, useEffect } from 'react';
import { Moon, Sun, Menu, User, LogOut, History } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface HeaderProps {
  darkMode: boolean;
  setDarkMode: (value: boolean) => void;
  toggleSidebar?: () => void;
}

export default function Header({ darkMode, setDarkMode, toggleSidebar }: HeaderProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const inferredModule = (() => {
    const seg = (pathname || '').split('/').filter(Boolean)[0] || '';
    // normalize some common paths
    if (!seg) return '';
    return seg;
  })();

  const goToActivityLogs = () => {
    const q = inferredModule ? `?module=${encodeURIComponent(inferredModule)}` : '';
    router.push(`/activity-logs${q}`);
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 flex items-center justify-between h-16 relative">
      {/* Left section */}
      <div className="flex items-center gap-4">
        {toggleSidebar && (
          <button
            type="button"
            onClick={toggleSidebar}
            className="inline-flex items-center gap-2 rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            title="Toggle sidebar"
            aria-label="Toggle sidebar"
          >
            <Menu className="w-5 h-5" />
            <span className="hidden text-sm font-semibold lg:inline">Sidebar</span>
          </button>
        )}
      </div>

      {/* Right section */}
      <div className="flex items-center gap-3">
        {/* Activity Logs */}
        <button
          onClick={goToActivityLogs}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          title="Activity Logs"
        >
          <History className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>

        {/* Dark Mode Toggle */}
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          {darkMode ? (
            <Sun className="w-5 h-5 text-gray-300" />
          ) : (
            <Moon className="w-5 h-5 text-gray-600" />
          )}
        </button>

        {/* User Dropdown */}
        <div
          className="relative group"
          onMouseEnter={() => setShowDropdown(true)}
          onMouseLeave={() => setShowDropdown(false)}
        >
          <button className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <User className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>

          {/* Dropdown menu */}
          <div
            className={`absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden z-50 transition-all duration-200 ${
              showDropdown
                ? 'opacity-100 translate-y-0 visible'
                : 'opacity-0 -translate-y-2 invisible'
            }`}
          >
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                {user?.name || 'User'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                {user?.role_id || 'Guest'}
              </p>
            </div>

            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex items-center gap-2 w-full text-left px-4 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <LogOut className="w-4 h-4" />
              {isLoggingOut ? 'Logging out...' : 'Logout'}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}