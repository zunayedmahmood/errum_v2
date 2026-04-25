'use client';
import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, ArrowLeft, AlertCircle, CheckCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCustomerAuth } from '@/contexts/CustomerAuthContext';
import cartService from '@/services/cartService';
import Link from 'next/link';
import Navigation from '@/components/ecommerce/Navigation';

export default function LoginRegisterPage() {
  const router = useRouter();
  const { login, register, isAuthenticated } = useCustomerAuth();

  const [activeTab, setActiveTab] = useState('login');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loginEmail,    setLoginEmail]    = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [registerName,            setRegisterName]            = useState('');
  const [registerEmail,           setRegisterEmail]           = useState('');
  const [registerPhone,           setRegisterPhone]           = useState('');
  const [registerPassword,        setRegisterPassword]        = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');

  const [alert,     setAlert]     = useState({ show: false, type: '', message: '' });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => { if (isAuthenticated) router.replace('/e-commerce/my-account'); }, [isAuthenticated, router]);

  const showAlert = (type: string, message: string) => {
    setAlert({ show: true, type, message });
    setTimeout(() => setAlert({ show: false, type: '', message: '' }), 5000);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) return showAlert('error', 'Please fill in all fields.');
    setIsLoading(true);
    try {
      await login(loginEmail, loginPassword);
      try {
        const guestCart = await cartService.getCart();
        if (guestCart?.items?.length) await cartService.mergeGuestCart();
      } catch {}
      showAlert('success', 'Welcome back!');
      setTimeout(() => router.push('/e-commerce'), 800);
    } catch (err: any) {
      showAlert('error', err?.message || 'Login failed. Please check your credentials.');
    } finally { setIsLoading(false); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerName || !registerEmail || !registerPhone || !registerPassword) return showAlert('error', 'Please fill in all fields.');
    if (registerPassword !== registerConfirmPassword) return showAlert('error', 'Passwords do not match.');
    if (registerPassword.length < 8) return showAlert('error', 'Password must be at least 8 characters.');
    setIsLoading(true);
    try {
      await register(registerName, registerEmail, registerPhone, registerPassword, registerConfirmPassword);
      showAlert('success', 'Account created! Welcome to Errum.');
      setTimeout(() => router.push('/e-commerce'), 800);
    } catch (err: any) {
      showAlert('error', err?.message || 'Registration failed. Please try again.');
    } finally { setIsLoading(false); }
  };

  const inputClass = "ec-dark-input";

  return (
    <div className="ec-root min-h-screen">
      <Navigation />

      <div className="ec-container flex min-h-[calc(100vh-68px)] items-center justify-center py-12">
        <div className="w-full max-w-md">

          {/* Header */}
          <div className="mb-8 text-center">
            <h1 style={{ fontFamily: "'Poppins', sans-serif", fontSize: '48px', fontWeight: 500, color: 'white', letterSpacing: '-0.02em', lineHeight: 1 }}>
              {activeTab === 'login' ? 'Welcome Back' : 'Join Errum'}
            </h1>
            <p className="mt-2 text-[14px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {activeTab === 'login' ? 'Sign in to your account' : 'Create your account today'}
            </p>
          </div>

          {/* Alert */}
          {alert.show && (
            <div className="mb-5 flex items-start gap-3 rounded-2xl p-4" style={{ background: alert.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', border: `1px solid ${alert.type === 'error' ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)'}` }}>
              {alert.type === 'error' ? <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" /> : <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />}
              <p className="text-[13px]" style={{ color: alert.type === 'error' ? '#f87171' : '#4ade80' }}>{alert.message}</p>
            </div>
          )}

          {/* Tab switcher */}
          <div className="flex mb-6 rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}>
            {['login', 'register'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="flex-1 rounded-lg py-2.5 text-[12px] font-semibold transition-all capitalize"
                style={{
                  background:    activeTab === tab ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color:         activeTab === tab ? 'white' : 'rgba(255,255,255,0.4)',
                  letterSpacing: '0.06em',
                  fontFamily:    "'Poppins', sans-serif",
                }}
              >
                {tab === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          {/* Forms */}
          <div className="ec-dark-card p-6 sm:p-8">
            {activeTab === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.45)', letterSpacing: '0.1em', fontFamily: "'Poppins', sans-serif" }}>EMAIL</label>
                  <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="you@example.com" className={inputClass} />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.45)', letterSpacing: '0.1em', fontFamily: "'Poppins', sans-serif" }}>PASSWORD</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} value={loginPassword} onChange={e => setLoginPassword(e.target.value)} placeholder="••••••••" className={inputClass + ' pr-11'} />
                    <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={isLoading} className="ec-btn ec-btn-gold w-full justify-center mt-2">
                  {isLoading ? 'Signing in…' : 'Sign In'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                {[
                  { label: 'FULL NAME',    val: registerName,    set: setRegisterName,    type: 'text',     ph: 'Your full name' },
                  { label: 'EMAIL',        val: registerEmail,   set: setRegisterEmail,   type: 'email',    ph: 'you@example.com' },
                  { label: 'PHONE',        val: registerPhone,   set: setRegisterPhone,   type: 'tel',      ph: '01XXXXXXXXX' },
                ].map(({ label, val, set, type, ph }) => (
                  <div key={label}>
                    <label className="mb-1.5 block text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.45)', letterSpacing: '0.1em', fontFamily: "'Poppins', sans-serif" }}>{label}</label>
                    <input type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph} className={inputClass} />
                  </div>
                ))}
                {[
                  { label: 'PASSWORD',         val: registerPassword,        set: setRegisterPassword,        show: showPassword,        toggle: () => setShowPassword(v=>!v) },
                  { label: 'CONFIRM PASSWORD', val: registerConfirmPassword, set: setRegisterConfirmPassword, show: showConfirmPassword, toggle: () => setShowConfirmPassword(v=>!v) },
                ].map(({ label, val, set, show, toggle }) => (
                  <div key={label}>
                    <label className="mb-1.5 block text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.45)', letterSpacing: '0.1em', fontFamily: "'Poppins', sans-serif" }}>{label}</label>
                    <div className="relative">
                      <input type={show ? 'text' : 'password'} value={val} onChange={e => set(e.target.value)} placeholder="••••••••" className={inputClass + ' pr-11'} />
                      <button type="button" onClick={toggle} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                ))}
                <button type="submit" disabled={isLoading} className="ec-btn ec-btn-gold w-full justify-center mt-2">
                  {isLoading ? 'Creating account…' : 'Create Account'}
                </button>
              </form>
            )}
          </div>

          <div className="mt-5 text-center">
            <Link href="/e-commerce" className="inline-flex items-center gap-1.5 text-[12px] transition-colors" style={{ color: 'rgba(255,255,255,0.35)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back to store
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
