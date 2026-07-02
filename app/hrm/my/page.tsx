'use client';

import { useState, useEffect } from 'react';
import hrmService, { AttendanceRecord } from '@/services/hrmService';
import { useAuth } from '@/contexts/AuthContext';
import { Clock, TrendingUp, Award, AlertCircle, CheckCircle2, XCircle, ChevronRight, Users, Zap } from 'lucide-react';
import { format } from 'date-fns';

export default function MyHRMPage() {
  const { user } = useAuth();
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [performance, setPerformance] = useState<any>(null);
  const [rewardsFines, setRewardsFines] = useState<any[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [attData, perfData, rfData] = await Promise.all([
        hrmService.getMyAttendance(),
        hrmService.getMyPerformance(),
        hrmService.getMyRewardsFines()
      ]);
      setAttendance(attData);
      setPerformance(perfData);
      setRewardsFines(rfData);
    } catch (error) { console.error(error); }
    finally { setIsLoading(false); }
  };

  const todayRecord = attendance.find(r => r.attendance_date === format(new Date(), 'yyyy-MM-dd'));
  const todayStatus = todayRecord?.status?.toLowerCase() ?? '';

  const lateCount = attendance.filter(r => r.is_late).length;
  const presentCount = attendance.filter(r => ['present', 'late'].includes(r.status?.toLowerCase())).length;
  const percent = performance?.percent || 0;

  const getStatusPill = (status: string) => {
    const s = status?.toLowerCase();
    if (s === 'present') return <span className="pill-green text-[10px] font-700 px-2.5 py-0.5 rounded-full uppercase tracking-wider">Present</span>;
    if (s === 'late') return <span className="pill-amber text-[10px] font-700 px-2.5 py-0.5 rounded-full uppercase tracking-wider">Late</span>;
    if (s === 'absent') return <span className="pill-red text-[10px] font-700 px-2.5 py-0.5 rounded-full uppercase tracking-wider">Absent</span>;
    if (s === 'leave') return <span className="pill-blue text-[10px] font-700 px-2.5 py-0.5 rounded-full uppercase tracking-wider">Leave</span>;
    return <span className="text-[10px] font-700 px-2.5 py-0.5 rounded-full uppercase tracking-wider" style={{ background: 'rgba(148,163,184,0.22)', color: 'var(--hrm-text-muted)' }}>Not Marked</span>;
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'rgba(59,130,246,0.35)', borderTopColor: 'var(--hrm-accent)' }} />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Welcome Banner */}
      <div className="relative rounded-2xl overflow-hidden p-6"
        style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.14) 0%, rgba(99,102,241,0.08) 100%)', border: '1px solid rgba(59,130,246,0.18)' }}>
        <div className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, var(--hrm-accent), transparent)', transform: 'translate(30%,-30%)' }} />
        <div className="flex items-center gap-4">
          <div className="avatar-ring w-14 h-14 shrink-0">
            <div className="w-full h-full rounded-full flex items-center justify-center text-xl font-800"
              style={{ background: 'var(--hrm-bg-soft)', color: 'var(--hrm-accent)', fontFamily: 'Syne, sans-serif' }}>
              {user?.name?.charAt(0)?.toUpperCase()}
            </div>
          </div>
          <div>
            <p className="text-muted text-xs uppercase tracking-widest font-600 mb-0.5">Welcome back</p>
            <h2 className="text-white text-xl font-700 leading-tight" style={{ fontFamily: 'Syne, sans-serif' }}>{user?.name}</h2>
            <p className="text-muted text-xs mt-0.5">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
          </div>
          <div className="ml-auto text-right hidden md:block">
            {todayRecord ? getStatusPill(todayRecord.status) : getStatusPill('')}
            <p className="text-muted text-[10px] mt-1">{format(new Date(), 'hh:mm a')}</p>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Days Present', value: presentCount, color: '#34d399', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.12)' },
          { label: 'Late Arrivals', value: lateCount, color: '#fbbf24', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.12)' },
          { label: 'Sales Achieved', value: `৳${(performance?.achieved || 0).toLocaleString()}`, color: 'var(--hrm-accent)', bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.14)' },
          { label: 'Target %', value: `${percent}%`, color: '#818cf8', bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.12)' },
        ].map(s => (
          <div key={s.label} className="hrm-card rounded-2xl p-4" style={{ background: s.bg, borderColor: s.border }}>
            <p className="text-muted text-[10px] uppercase tracking-widest font-600 mb-2">{s.label}</p>
            <p className="text-2xl font-800" style={{ fontFamily: 'Syne, sans-serif', color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Today Clock Card */}
        <div className="hrm-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-700 text-sm flex items-center gap-2" style={{ fontFamily: 'Syne, sans-serif' }}>
              <Clock className="w-4 h-4" style={{ color: '#818cf8' }} /> Today
            </h3>
          </div>
          <div className="space-y-2.5">
            {[
              { label: 'Clock In', value: todayRecord?.clock_in, color: '#34d399' },
              { label: 'Clock Out', value: todayRecord?.clock_out, color: '#f87171' },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between px-3.5 py-2.5 rounded-xl"
                style={{ background: 'rgba(148,163,184,0.14)', border: '1px solid rgba(148,163,184,0.20)' }}>
                <span className="text-muted text-xs font-500">{item.label}</span>
                <span className="text-sm font-700" style={{ color: item.value ? item.color : 'rgba(148,163,184,0.40)', fontFamily: 'Syne, sans-serif' }}>
                  {item.value || '--:--'}
                </span>
              </div>
            ))}
            {todayRecord?.is_late && (
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)' }}>
                <AlertCircle className="w-3.5 h-3.5 shrink-0" style={{ color: '#fbbf24' }} />
                <span className="text-[10px] font-600" style={{ color: '#fbbf24' }}>Late entry recorded</span>
              </div>
            )}
          </div>
        </div>

        {/* Sales Target Card */}
        <div className="hrm-card rounded-2xl p-5 md:col-span-1 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-700 text-sm flex items-center gap-2" style={{ fontFamily: 'Syne, sans-serif' }}>
              <TrendingUp className="w-4 h-4" style={{ color: '#34d399' }} /> Sales Target
            </h3>
            <span className="text-muted text-[10px] font-500">{format(new Date(), 'MMMM yyyy')}</span>
          </div>

          {!performance?.target ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted">
              <TrendingUp className="w-8 h-8 mb-2 opacity-20" />
              <p className="text-xs">No target set for this month</p>
            </div>
          ) : (
            <>
              <div className="flex items-end justify-between mb-3">
                <div>
                  <p className="text-muted text-[10px] uppercase tracking-widest font-600 mb-1">Progress</p>
                  <p className="text-4xl font-800 gold-shimmer" style={{ fontFamily: 'Syne, sans-serif' }}>{percent}%</p>
                </div>
                <div className="text-right">
                  <p className="text-muted text-[10px] mb-1">Target</p>
                  <p className="text-white text-lg font-700">৳{(performance?.target || 0).toLocaleString()}</p>
                </div>
              </div>
              <div className="progress-track h-2 mb-3">
                <div className={`h-2 transition-all duration-1000 ${percent >= 100 ? 'progress-gold' : percent >= 50 ? 'progress-green' : 'progress-blue'}`}
                  style={{ width: `${Math.min(percent, 100)}%` }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted text-xs">Achieved: <span className="text-white font-600">৳{(performance?.achieved || 0).toLocaleString()}</span></span>
                <span className="text-muted text-xs">Gap: <span className="font-600" style={{ color: '#f87171' }}>৳{Math.max(0, (performance?.target || 0) - (performance?.achieved || 0)).toLocaleString()}</span></span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Attendance History */}
        <div className="hrm-card rounded-2xl overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(148,163,184,0.22)' }}>
            <h3 className="text-white font-700 text-sm" style={{ fontFamily: 'Syne, sans-serif' }}>Attendance History</h3>
            <span className="text-muted text-[10px]">{attendance.length} records</span>
          </div>
          {attendance.length === 0 ? (
            <div className="p-8 text-center text-muted text-xs">No attendance records found</div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'rgba(148,163,184,0.14)' }}>
              {attendance.slice(0, 7).map((record) => {
                const s = record.status?.toLowerCase();
                const isGood = s === 'present';
                const isBad = s === 'absent';
                return (
                  <div key={record.id} className="px-5 py-3 flex items-center justify-between table-row-hover">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: isGood ? 'rgba(52,211,153,0.1)' : isBad ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)' }}>
                        {isGood ? <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#34d399' }} />
                          : isBad ? <XCircle className="w-3.5 h-3.5" style={{ color: '#f87171' }} />
                          : <Clock className="w-3.5 h-3.5" style={{ color: '#fbbf24' }} />}
                      </div>
                      <div>
                        <p className="text-white text-xs font-600">{format(new Date(record.attendance_date), 'EEE, MMM d')}</p>
                        <p className="text-muted text-[10px]">{record.status?.replace(/_/g,' ') || 'Unknown'}{record.is_late ? ' · Late' : ''}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-600" style={{ color: '#34d399' }}>{record.clock_in || '--:--'}</p>
                      <p className="text-[10px] text-muted">{record.clock_out || '--:--'}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Insights */}
        <div className="hrm-card rounded-2xl p-5">
          <h3 className="text-white font-700 text-sm mb-4" style={{ fontFamily: 'Syne, sans-serif' }}>Performance Insights</h3>
          <div className="space-y-3">
            {lateCount > 0 && (
              <div className="flex items-start gap-3 p-3.5 rounded-xl" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.12)' }}>
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#fbbf24' }} />
                <div>
                  <p className="text-xs font-700 mb-0.5" style={{ color: '#fbbf24' }}>Late Arrivals</p>
                  <p className="text-[11px] text-muted">Late {lateCount} time{lateCount > 1 ? 's' : ''} this month. Punctuality affects your score.</p>
                </div>
              </div>
            )}
            {percent >= 100 && (
              <div className="flex items-start gap-3 p-3.5 rounded-xl" style={{ background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.18)' }}>
                <Zap className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--hrm-accent)' }} />
                <div>
                  <p className="text-xs font-700 mb-0.5 gold-shimmer">Target Reached! 🎉</p>
                  <p className="text-[11px] text-muted">You've hit 100%+ this month. Outstanding work!</p>
                </div>
              </div>
            )}
            {rewardsFines.length > 0 && (
              <div className="flex items-start gap-3 p-3.5 rounded-xl" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.12)' }}>
                <Award className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#a78bfa' }} />
                <div>
                  <p className="text-xs font-700 mb-0.5" style={{ color: '#a78bfa' }}>Rewards & Fines</p>
                  <p className="text-[11px] text-muted">{rewardsFines.length} entr{rewardsFines.length > 1 ? 'ies' : 'y'}. Net: <span style={{ color: rewardsFines.reduce((a,r) => a + (r.entry_type==='reward'?+r.amount:-+r.amount),0) >= 0 ? '#34d399' : '#f87171' }}>
                    ৳{rewardsFines.reduce((a,r) => a + (r.entry_type==='reward'?+r.amount:-+r.amount),0).toLocaleString()}
                  </span></p>
                </div>
              </div>
            )}
            {lateCount === 0 && percent < 100 && rewardsFines.length === 0 && (
              <div className="text-center py-6 text-muted text-xs">All good! No alerts this month.</div>
            )}
          </div>

          <button onClick={() => setIsHistoryOpen(!isHistoryOpen)}
            className="w-full mt-4 flex items-center justify-between p-3.5 rounded-xl transition-all"
            style={{ background: 'rgba(148,163,184,0.14)', border: '1px solid rgba(148,163,184,0.20)' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(59,130,246,0.25)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(148,163,184,0.20)')}>
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4" style={{ color: '#a78bfa' }} />
              <span className="text-xs font-600 text-white">Reward / Fine History</span>
            </div>
            <ChevronRight className={`w-4 h-4 text-muted transition-transform ${isHistoryOpen ? 'rotate-90' : ''}`} />
          </button>

          {isHistoryOpen && (
            <div className="mt-3 space-y-2 pl-4 border-l-2" style={{ borderColor: 'rgba(139,92,246,0.3)' }}>
              {rewardsFines.length === 0 ? (
                <p className="text-muted text-xs py-2">No entries this month</p>
              ) : rewardsFines.map(entry => (
                <div key={entry.id} className="flex justify-between items-center p-2.5 rounded-lg"
                  style={{ background: 'rgba(148,163,184,0.10)', border: '1px solid rgba(148,163,184,0.18)' }}>
                  <div>
                    <p className="text-white text-xs font-600">{entry.title}</p>
                    <p className="text-muted text-[10px]">{format(new Date(entry.entry_date), 'MMM dd, yyyy')}</p>
                  </div>
                  <span className="text-xs font-700" style={{ color: entry.entry_type === 'reward' ? '#34d399' : '#f87171' }}>
                    {entry.entry_type === 'reward' ? '+' : '-'}৳{Number(entry.amount).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
