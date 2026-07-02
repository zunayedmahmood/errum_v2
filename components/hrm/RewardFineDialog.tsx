'use client';

import { useState, useEffect } from 'react';
import { X, Zap } from 'lucide-react';
import hrmService from '@/services/hrmService';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';

interface RewardFineDialogProps {
  isOpen: boolean;
  onClose: () => void;
  storeId: number;
  employee: { id: number; name: string } | null;
  onSuccess: () => void;
  editData?: any;
}

const rewardPresets = [
  'Festival Bonus',
  'Overtime Bonus',
  'Target Meet Bonus',
  'Performance Bonus',
  'Attendance Bonus',
  'Special Incentive',
];

const finePresets = [
  'Disciplinary Fine',
  'Cash Shortage',
  'Damage Recovery',
  'Absence Penalty',
  'Late Penalty',
  'Policy Violation',
];

export default function RewardFineDialog({ isOpen, onClose, storeId, employee, onSuccess, editData }: RewardFineDialogProps) {
  const [type, setType] = useState<'reward' | 'fine'>('reward');
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (editData) { setType(editData.entry_type); setAmount(editData.amount.toString()); setTitle(editData.title); setNotes(editData.notes || ''); setDate(editData.entry_date); }
    else { setType('reward'); setAmount(''); setTitle(''); setNotes(''); setDate(format(new Date(), 'yyyy-MM-dd')); }
  }, [editData, isOpen]);

  if (!isOpen || !employee) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) { toast.error('Please enter a valid amount'); return; }
    setIsLoading(true);
    try {
      let res;
      if (editData) {
        res = await hrmService.updateRewardFine(editData.id, { entry_date: date, entry_type: type, amount: Number(amount), title, notes, reason: 'Manual update from UI' });
      } else {
        res = await hrmService.createRewardFine({ store_id: storeId, employee_id: employee.id, entry_date: date, entry_type: type, amount: Number(amount), title, notes });
      }
      if (res.success) { toast.success(editData ? 'Entry updated!' : 'Entry created!'); onSuccess(); onClose(); }
      else toast.error(res.message || 'Failed');
    } catch (error: any) { toast.error(error.message || 'Error'); }
    finally { setIsLoading(false); }
  };

  const isReward = type === 'reward';
  const accentColor = isReward ? '#34d399' : '#f87171';
  const accentBg = isReward ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.1)';
  const accentBorder = isReward ? 'rgba(52,211,153,0.2)' : 'rgba(239,68,68,0.2)';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
        style={{ background: '#0e0e18', border: '1px solid rgba(148,163,184,0.28)', boxShadow: '0 40px 100px rgba(0,0,0,0.6)' }}>
        <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${accentColor}00, ${accentColor}, ${accentColor}00)` }} />

        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(148,163,184,0.22)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: accentBg, border: `1px solid ${accentBorder}` }}>
              <Zap className="w-4 h-4" style={{ color: accentColor }} />
            </div>
            <h3 className="text-white font-700 text-base" style={{ fontFamily: 'Syne, sans-serif' }}>
              {editData ? 'Edit Entry' : 'Add Reward / Fine'}
            </h3>
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
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(148,163,184,0.14)', border: '1px solid rgba(148,163,184,0.20)' }}>
            <div className="avatar-ring w-8 h-8 shrink-0">
              <div className="w-full h-full rounded-full flex items-center justify-center text-xs font-700"
                style={{ background: 'var(--hrm-bg-soft)', color: 'var(--hrm-accent)', fontFamily: 'Syne, sans-serif' }}>
                {employee.name.charAt(0)}
              </div>
            </div>
            <p className="text-white text-sm font-600">{employee.name}</p>
          </div>

          {/* Type Toggle */}
          <div className="grid grid-cols-2 gap-2">
            {(['reward', 'fine'] as const).map(t => (
              <button key={t} type="button" onClick={() => setType(t)}
                className="py-2.5 rounded-xl text-xs font-700 transition-all"
                style={{
                  background: type === t ? (t === 'reward' ? 'rgba(52,211,153,0.15)' : 'rgba(239,68,68,0.15)') : 'rgba(148,163,184,0.14)',
                  border: `1px solid ${type === t ? (t === 'reward' ? 'rgba(52,211,153,0.3)' : 'rgba(239,68,68,0.3)') : 'rgba(148,163,184,0.22)'}`,
                  color: type === t ? (t === 'reward' ? '#34d399' : '#f87171') : 'var(--hrm-text-muted)'
                }}>
                {t === 'reward' ? '+ Reward' : '− Fine'}
              </button>
            ))}
          </div>

          {/* Amount */}
          <div>
            <label className="block text-muted text-[10px] uppercase tracking-widest font-600 mb-1.5">Amount (৳)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-700 text-sm" style={{ color: accentColor }}>৳</span>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" required min="1"
                className="input-dark w-full pl-9 pr-4 py-3 rounded-xl text-2xl font-800" style={{ fontFamily: 'Syne, sans-serif', color: accentColor }} />
            </div>
          </div>

          {/* Title */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-muted text-[10px] uppercase tracking-widest font-600">Title</label>
              <span className="text-[10px] text-muted">Choose preset or write custom</span>
            </div>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Monthly Performance Bonus" required
              className="input-dark w-full px-4 py-2.5 rounded-xl text-sm" />
            <div className="flex flex-wrap gap-2 mt-2">
              {(isReward ? rewardPresets : finePresets).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTitle(preset)}
                  className="px-2.5 py-1 rounded-full text-[10px] font-700 transition-all"
                  style={{
                    background: title === preset ? accentBg : 'rgba(148,163,184,0.14)',
                    border: `1px solid ${title === preset ? accentBorder : 'rgba(148,163,184,0.22)'}`,
                    color: title === preset ? accentColor : 'var(--hrm-text-main)',
                  }}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-muted text-[10px] uppercase tracking-widest font-600 mb-1.5">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required
                className="input-dark w-full px-3 py-2 rounded-xl text-xs" />
            </div>
            <div>
              <label className="block text-muted text-[10px] uppercase tracking-widest font-600 mb-1.5">Notes</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional"
                className="input-dark w-full px-3 py-2 rounded-xl text-xs" />
            </div>
          </div>

          <button type="submit" disabled={isLoading}
            className="w-full py-3.5 rounded-2xl text-sm font-700 transition-all disabled:opacity-50"
            style={{ background: isReward ? 'linear-gradient(135deg, #059669, #34d399)' : 'linear-gradient(135deg, #dc2626, #f87171)', color: 'var(--hrm-text-main)', boxShadow: `0 8px 24px ${accentColor}30` }}>
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving...
              </span>
            ) : editData ? 'Update Entry' : `Add ${type.charAt(0).toUpperCase() + type.slice(1)}`}
          </button>
        </form>
      </div>
    </div>
  );
}