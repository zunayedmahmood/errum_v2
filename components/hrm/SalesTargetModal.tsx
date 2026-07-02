'use client';

import { useState, useEffect } from 'react';
import { X, Target, AlertCircle } from 'lucide-react';
import hrmService from '@/services/hrmService';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';

interface SalesTargetModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: { id: number; name: string } | null;
  onSuccess: () => void;
  storeId: number;
  initialTarget?: number;
  initialMonth?: string;
}

export default function SalesTargetModal({ isOpen, onClose, employee, onSuccess, storeId, initialTarget, initialMonth }: SalesTargetModalProps) {
  const [targetAmount, setTargetAmount] = useState(initialTarget?.toString() || '');
  const [targetMonth, setTargetMonth] = useState(initialMonth || format(new Date(), 'yyyy-MM'));
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (initialTarget) setTargetAmount(initialTarget.toString());
    if (initialMonth) setTargetMonth(initialMonth);
  }, [initialTarget, initialMonth]);

  if (!isOpen || !employee) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetAmount || isNaN(Number(targetAmount)) || Number(targetAmount) <= 0) { toast.error('Enter a valid amount'); return; }
    setIsLoading(true);
    try {
      const res = await hrmService.setSalesTarget({ store_id: storeId, employee_id: employee.id, target_amount: Number(targetAmount), target_month: targetMonth });
      if (res.success) { toast.success(`Target set for ${employee.name}`); onSuccess(); onClose(); }
      else toast.error(res.message || 'Failed');
    } catch (error: any) { toast.error(error.message || 'Error'); }
    finally { setIsLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
        style={{ background: '#0e0e18', border: '1px solid rgba(148,163,184,0.28)', boxShadow: '0 40px 100px rgba(0,0,0,0.6)' }}>
        <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, rgba(59,130,246,0), var(--hrm-accent), rgba(59,130,246,0))' }} />

        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(148,163,184,0.22)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.14)', border: '1px solid rgba(59,130,246,0.25)' }}>
              <Target className="w-4 h-4" style={{ color: 'var(--hrm-accent)' }} />
            </div>
            <h3 className="text-white font-700 text-base" style={{ fontFamily: 'Syne, sans-serif' }}>Set Sales Target</h3>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(148,163,184,0.18)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(148,163,184,0.28)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(148,163,184,0.18)')}>
            <X className="w-3.5 h-3.5 text-muted" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Employee */}
          <div className="flex items-center gap-3 p-3.5 rounded-xl" style={{ background: 'rgba(148,163,184,0.14)', border: '1px solid rgba(148,163,184,0.20)' }}>
            <div className="avatar-ring w-9 h-9 shrink-0">
              <div className="w-full h-full rounded-full flex items-center justify-center text-sm font-700"
                style={{ background: 'var(--hrm-bg-soft)', color: 'var(--hrm-accent)', fontFamily: 'Syne, sans-serif' }}>
                {employee.name.charAt(0)}
              </div>
            </div>
            <div>
              <p className="text-white text-sm font-600">{employee.name}</p>
              <p className="text-muted text-[10px]">Sales target assignment</p>
            </div>
          </div>

          {/* Month */}
          <div>
            <label className="block text-muted text-[10px] uppercase tracking-widest font-600 mb-1.5">Target Month</label>
            <input type="month" value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} required
              className="input-dark w-full px-4 py-2.5 rounded-xl text-sm font-600" />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-muted text-[10px] uppercase tracking-widest font-600 mb-1.5">Target Amount (৳)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-700 text-sm gold-shimmer">৳</span>
              <input type="number" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)}
                placeholder="0" required min="1"
                className="input-dark w-full pl-9 pr-4 py-4 rounded-xl text-3xl font-800 text-center"
                style={{ fontFamily: 'Syne, sans-serif', color: 'var(--hrm-accent)' }} />
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-xl" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.14)' }}>
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--hrm-accent)' }} />
            <p className="text-[11px]" style={{ color: 'rgba(240,208,128,0.7)' }}>
              This will overwrite any existing target for the selected month.
            </p>
          </div>

          <button type="submit" disabled={isLoading}
            className="w-full py-3.5 rounded-2xl text-sm font-700 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, var(--hrm-accent) 0%, var(--hrm-accent) 50%, var(--hrm-accent) 100%)', color: 'var(--hrm-bg-soft)', boxShadow: '0 8px 24px rgba(59,130,246,0.35)' }}>
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(10,10,15,0.3)', borderTopColor: 'var(--hrm-bg-soft)' }} />
                Saving...
              </span>
            ) : 'Set Monthly Target'}
          </button>
        </form>
      </div>
    </div>
  );
}