'use client';

import { FormEvent, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { useTheme } from '@/contexts/ThemeContext';
import employeeService from '@/services/employeeService2';

export default function EmployeePasswordAdminPage() {
  const router = useRouter();
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const passwordMismatch = newPassword.length > 0 && confirmPassword.length > 0 && newPassword !== confirmPassword;
  const isPasswordShort = newPassword.length > 0 && newPassword.length < 8;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccess(null);
    setError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Employee Gmail/email is required.');
      return;
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    try {
      setSubmitting(true);
      const response = await employeeService.resetPasswordByEmail(cleanEmail, newPassword, confirmPassword);
      const employeeName = response.data?.name || cleanEmail;
      setSuccess(`Password changed successfully for ${employeeName}. The employee needs to login again with the new password.`);
      setEmail('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to change employee password.');
    } finally {
      setSubmitting(false);
    }
  };

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

          <main className="flex-1 overflow-y-auto p-6">
            <div className="mx-auto max-w-3xl space-y-6">
              <button
                type="button"
                onClick={() => router.push('/employees')}
                className="inline-flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Employee Management
              </button>

              <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl bg-blue-50 p-3 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
                    <ShieldCheck className="h-7 w-7" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-black text-gray-900 dark:text-white">Employee Password Admin</h1>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Admin-only reset. Enter the employee Gmail/email and the new password. Old active sessions will be revoked after reset.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                  <div>
                    <label className="mb-2 block text-xs font-black uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Employee Gmail / Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="employee@gmail.com"
                      className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                      autoComplete="off"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-xs font-black uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        New Password
                      </label>
                      <div className="relative">
                        <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Minimum 8 characters"
                          className="w-full rounded-xl border border-gray-300 bg-white py-3 pl-10 pr-11 text-sm font-semibold text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {isPasswordShort && <p className="mt-2 text-xs font-semibold text-red-600">Password must be at least 8 characters.</p>}
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-black uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Confirm Password
                      </label>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Retype password"
                        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                        autoComplete="new-password"
                      />
                      {passwordMismatch && <p className="mt-2 text-xs font-semibold text-red-600">Passwords do not match.</p>}
                    </div>
                  </div>

                  {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
                      {error}
                    </div>
                  )}

                  {success && (
                    <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200">
                      {success}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || passwordMismatch || isPasswordShort}
                    className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? 'Changing Password...' : 'Change Employee Password'}
                  </button>
                </form>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
