'use client';

import { useState } from 'react';
import { X, Clock, Edit3, AlertCircle } from 'lucide-react';
import hrmService from '@/services/hrmService';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';

interface AttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: { id: number; name: string };
  type: 'check_in' | 'check_out' | 'edit';
  record?: any;
  storeId: number;
  onSuccess: () => void;
}

export default function AttendanceModal({ isOpen, onClose, employee, type, record, storeId, onSuccess }: AttendanceModalProps) {
  const now = new Date();
  const stripSecs = (t?: string | null) => t ? t.slice(0, 5) : '';
  const [time, setTime] = useState(format(now, 'HH:mm'));
  const [inTime, setInTime] = useState(stripSecs(record?.clock_in || record?.in_time));
  const [outTime, setOutTime] = useState(stripSecs(record?.clock_out || record?.out_time));
  const [status, setStatus] = useState(record?.status?.toLowerCase() || 'present');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState(record?.notes || '');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      let res;
      if (type === 'edit') {
        if (!reason.trim()) { toast.error('Reason is required for manual edits.'); setIsLoading(false); return; }
        if (!record?.id) { toast.error('No record found to edit.'); setIsLoading(false); return; }
        res = await hrmService.updateAttendance(record.id, {
          status, in_time: inTime ? inTime.slice(0, 5) : null, out_time: outTime ? outTime.slice(0, 5) : null, reason, notes
        });
      } else {
        res = await hrmService.markAttendance({
          store_id: storeId,
          attendance_date: format(now, 'yyyy-MM-dd'),
          entries: [{
            employee_id: Number(employee.id),
            status: 'present',
            in_time: type === 'check_in' ? time.slice(0, 5) : stripSecs(record?.clock_in || record?.in_time) || undefined,
            out_time: type === 'check_out' ? time.slice(0, 5) : undefined,
          }]
        });
      }
      if (res?.success) { toast.success(`${employee.name}'s attendance updated!`); onSuccess(); onClose(); }
      else toast.error(res?.message || 'Failed to update attendance');
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || 'An error occurred');
    } finally { setIsLoading(false); }
  };

  const isCheckIn = type === 'check_in';
  const isCheckOut = type === 'check_out';
  const isEdit = type === 'edit';

  const accentColor = isCheckIn ? '#34d399' : isCheckOut ? '#f87171' : '#818cf8';
  const accentBg = isCheckIn ? 'rgba(52,211,153,0.1)' : isCheckOut ? 'rgba(239,68,68,0.1)' : 'rgba(99,102,241,0.1)';
  const accentBorder = isCheckIn ? 'rgba(52,211,153,0.2)' : isCheckOut ? 'rgba(239,68,68,0.2)' : 'rgba(99,102,241,0.2)';
  const btnBg = isCheckIn ? 'linear-gradient(135deg, #059669, #34d399)' : isCheckOut ? 'linear-gradient(135deg, #dc2626, #f87171)' : 'linear-gradient(135deg, #4f46e5, #818cf8)';
  const typeLabel = isCheckIn ? 'Clock In' : isCheckOut ? 'Clock Out' : 'Edit Attendance';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-sm overflow-hidden rounded-3xl shadow-2xl"
        style={{ background: '#0e0e18', border: '1px solid rgba(148,163,184,0.28)', boxShadow: '0 40px 100px rgba(0,0,0,0.6)' }}>

        {/* Top accent bar */}
        <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${accentColor}00, ${accentColor}, ${accentColor}00)` }} />

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(148,163,184,0.22)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: accentBg, border: `1px solid ${accentBorder}` }}>
              {isEdit ? <Edit3 className="w-4 h-4" style={{ color: accentColor }} /> : <Clock className="w-4 h-4" style={{ color: accentColor }} />}
            </div>
            <h3 className="text-white font-700 text-base" style={{ fontFamily: 'Syne, sans-serif' }}>{typeLabel}</h3>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
            style={{ background: 'rgba(148,163,184,0.18)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(148,163,184,0.28)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(148,163,184,0.18)')}>
            <X className="w-3.5 h-3.5 text-muted" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Employee chip */}
          <div className="flex items-center gap-3 p-3.5 rounded-2xl" style={{ background: 'rgba(148,163,184,0.14)', border: '1px solid rgba(148,163,184,0.20)' }}>
            <div className="avatar-ring w-9 h-9 shrink-0">
              <div className="w-full h-full rounded-full flex items-center justify-center text-sm font-700"
                style={{ background: 'var(--hrm-bg-soft)', color: 'var(--hrm-accent)', fontFamily: 'Syne, sans-serif' }}>
                {employee.name.charAt(0).toUpperCase()}
              </div>
            </div>
            <div>
              <p className="text-white text-sm font-700">{employee.name}</p>
              <p className="text-muted text-[10px]">{format(now, 'EEEE, MMM d, yyyy')}</p>
            </div>
          </div>

          {/* Time input for check_in / check_out */}
          {!isEdit && (
            <div>
              <label className="block text-muted text-[10px] uppercase tracking-widest font-600 mb-2">
                {isCheckIn ? 'Clock In Time' : 'Clock Out Time'}
              </label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required
                className="w-full text-center text-4xl font-800 py-4 rounded-2xl border-none outline-none focus:ring-2"
                style={{ background: 'rgba(148,163,184,0.18)', color: accentColor, fontFamily: 'Syne, sans-serif', focusRingColor: accentColor }}
                onFocus={e => (e.currentTarget.style.boxShadow = `0 0 0 2px ${accentBorder}`)}
                onBlur={e => (e.currentTarget.style.boxShadow = 'none')} />
              <p className="text-muted text-[10px] text-center mt-1.5">Now: {format(now, 'hh:mm a')}</p>
            </div>
          )}

          {/* Edit fields */}
          {isEdit && (
            <div className="space-y-3.5">
              <div>
                <label className="block text-muted text-[10px] uppercase tracking-widest font-600 mb-1.5">Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)}
                  className="select-dark w-full px-4 py-2.5 rounded-xl text-sm">
                  {['present', 'late', 'absent', 'leave', 'half_day'].map(s => (
                    <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'In Time', value: inTime, setter: setInTime },
                  { label: 'Out Time', value: outTime, setter: setOutTime },
                ].map(f => (
                  <div key={f.label}>
                    <label className="block text-muted text-[10px] uppercase tracking-widest font-600 mb-1.5">{f.label}</label>
                    <input type="time" value={f.value} onChange={(e) => f.setter(e.target.value)}
                      className="input-dark w-full px-3 py-2 rounded-xl text-sm" />
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-muted text-[10px] uppercase tracking-widest font-600 mb-1.5">
                  Reason <span style={{ color: '#f87171' }}>*</span>
                </label>
                <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Forgot to clock in" required
                  className="input-dark w-full px-3 py-2.5 rounded-xl text-sm" />
              </div>
              <div>
                <label className="block text-muted text-[10px] uppercase tracking-widest font-600 mb-1.5">Notes</label>
                <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional details..." className="input-dark w-full px-3 py-2.5 rounded-xl text-sm" />
              </div>
            </div>
          )}

          {/* Info hint */}
          {!isEdit && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl" style={{ background: accentBg, border: `1px solid ${accentBorder}` }}>
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: accentColor }} />
              <p className="text-[11px]" style={{ color: accentColor }}>
                {isCheckIn ? 'Late arrivals after shift start will be auto-flagged.' : 'Early exits before shift end will be noted.'}
              </p>
            </div>
          )}

          {/* Submit */}
          <button type="submit" disabled={isLoading}
            className="w-full py-3.5 rounded-2xl text-sm font-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: btnBg, color: 'var(--hrm-text-main)', boxShadow: `0 8px 24px ${accentColor}30` }}
            onMouseEnter={e => !isLoading && ((e.currentTarget as HTMLElement).style.opacity = '0.9')}
            onMouseLeave={e => !isLoading && ((e.currentTarget as HTMLElement).style.opacity = '1')}>
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing...
              </span>
            ) : `Confirm ${typeLabel}`}
          </button>
        </form>
      </div>
    </div>
  );
}