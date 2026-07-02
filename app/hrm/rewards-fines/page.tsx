'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useStore } from '@/contexts/StoreContext';
import hrmService from '@/services/hrmService';
import RewardFineDialog from '@/components/hrm/RewardFineDialog';
import AccessControl from '@/components/AccessControl';
import { Award, Search, Plus, Calendar, MinusCircle, PlusCircle, ChevronDown, ChevronUp, Edit3, Zap, Wallet, ReceiptText, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';

export default function RewardsFinesPage() {
  const { selectedStoreId } = useStore();
  const [employees, setEmployees] = useState<any[]>([]);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [entryTypeFilter, setEntryTypeFilter] = useState<'all' | 'reward' | 'fine'>('all');
  const [dialog, setDialog] = useState<{ isOpen: boolean; employee: any; editData: any }>({ isOpen: false, employee: null, editData: null });
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<number | null>(null);
  const [employeeDetails, setEmployeeDetails] = useState<any[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  useEffect(() => { if (selectedStoreId) loadData(); }, [selectedStoreId, selectedMonth]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await hrmService.getCumulatedRewardFine({ store_id: selectedStoreId!, month: selectedMonth, per_page: 200 });
      const rows = data.rows || [];
      setEmployees(rows);
      const totalReward = rows.reduce((a: number, r: any) => a + Number(r.total_reward || 0), 0);
      const totalFine = rows.reduce((a: number, r: any) => a + Number(r.total_fine || 0), 0);
      const totalProjectedSalary = rows.reduce((a: number, r: any) => a + Number(r.employee?.salary || 0) + Number(r.net_adjustment || 0), 0);
      setSummaryData({
        total_reward: totalReward,
        total_fine: totalFine,
        net: totalReward - totalFine,
        count: rows.length,
        total_entries: rows.reduce((a: number, r: any) => a + Number(r.total_entries || 0), 0),
        total_projected_salary: totalProjectedSalary,
      });
    } catch (error) { console.error(error); }
    finally { setIsLoading(false); }
  };

  const toggleRow = async (employeeId: number) => {
    if (expandedEmployeeId === employeeId) { setExpandedEmployeeId(null); return; }
    setExpandedEmployeeId(employeeId);
    setIsLoadingDetails(true);
    try {
      const data = await hrmService.getRewardFineReport({ store_id: selectedStoreId!, employee_id: employeeId, month: selectedMonth });
      setEmployeeDetails(data?.rows || []);
    } catch (error) { console.error(error); }
    finally { setIsLoadingDetails(false); }
  };

  const filteredEmployees = useMemo(() => employees.filter((row: any) => {
    const matchesText = row.employee.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      row.employee.employee_code?.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesText) return false;
    if (entryTypeFilter === 'reward') return Number(row.total_reward || 0) > 0;
    if (entryTypeFilter === 'fine') return Number(row.total_fine || 0) > 0;
    return true;
  }), [employees, searchQuery, entryTypeFilter]);

  const topPositive = [...filteredEmployees].sort((a, b) => Number(b.net_adjustment || 0) - Number(a.net_adjustment || 0))[0];
  const topFine = [...filteredEmployees].sort((a, b) => Number(b.total_fine || 0) - Number(a.total_fine || 0))[0];

  if (!selectedStoreId) return (
    <div className="flex flex-col items-center justify-center h-96 rounded-2xl" style={{ border: '1px dashed rgba(148,163,184,0.28)' }}>
      <Zap className="w-14 h-14 mb-4" style={{ color: 'rgba(59,130,246,0.35)' }} />
      <h3 className="text-lg font-700 text-white mb-1" style={{ fontFamily: 'Syne, sans-serif' }}>No Store Selected</h3>
      <p className="text-muted text-sm">Select a store to manage rewards and fines</p>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
        <div>
          <h2 className="text-white text-xl font-700" style={{ fontFamily: 'Syne, sans-serif' }}>Rewards & Fines</h2>
          <p className="text-muted text-xs mt-0.5">Stack monthly bonuses and penalties per employee and preview salary impact before payroll.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl" style={{ background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.18)' }}>
            <Calendar className="w-3.5 h-3.5" style={{ color: 'var(--hrm-accent)' }} />
            <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-white text-xs font-600 border-none outline-none" />
          </div>
          <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'rgba(148,163,184,0.14)', border: '1px solid rgba(148,163,184,0.22)' }}>
            {[
              { key: 'all', label: 'All Staff' },
              { key: 'reward', label: 'Reward Holders' },
              { key: 'fine', label: 'Fine Holders' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setEntryTypeFilter(tab.key as any)}
                className="px-3 py-1.5 rounded-lg text-[11px] font-700 transition-all"
                style={{
                  background: entryTypeFilter === tab.key ? 'rgba(59,130,246,0.18)' : 'transparent',
                  color: entryTypeFilter === tab.key ? 'var(--hrm-accent)' : 'var(--hrm-text-muted)',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Total Rewards', value: `৳${Number(summaryData?.total_reward || 0).toLocaleString()}`, icon: PlusCircle, color: '#34d399', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.14)' },
          { label: 'Total Fines', value: `৳${Number(summaryData?.total_fine || 0).toLocaleString()}`, icon: MinusCircle, color: '#f87171', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.14)' },
          { label: 'Net Adjustment', value: `${Number(summaryData?.net || 0) >= 0 ? '+' : ''}৳${Number(summaryData?.net || 0).toLocaleString()}`, icon: Award, color: Number(summaryData?.net || 0) >= 0 ? '#34d399' : '#f87171', bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.24)' },
          { label: 'Pending Entries', value: Number(summaryData?.total_entries || 0), icon: ReceiptText, color: '#818cf8', bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.14)' },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl p-5" style={{ background: card.bg, border: `1px solid ${card.border}` }}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-muted text-[10px] uppercase tracking-widest font-600 mb-2">{card.label}</p>
                <p className="text-2xl font-800" style={{ fontFamily: 'Syne, sans-serif', color: card.color }}>{card.value}</p>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(148,163,184,0.22)' }}>
                <card.icon className="w-5 h-5" style={{ color: card.color }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="rounded-2xl p-5 hrm-card xl:col-span-2">
          <div className="flex items-center gap-3 mb-2">
            <Wallet className="w-5 h-5" style={{ color: 'var(--hrm-accent)' }} />
            <div>
              <p className="text-white text-sm font-700" style={{ fontFamily: 'Syne, sans-serif' }}>Salary Effect Snapshot</p>
              <p className="text-muted text-xs">Base salary plus this month&apos;s pending reward/fine stack.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <div className="rounded-xl p-4" style={{ background: 'rgba(148,163,184,0.14)', border: '1px solid rgba(148,163,184,0.20)' }}>
              <p className="text-muted text-[10px] uppercase tracking-widest font-600 mb-2">Projected payout pool</p>
              <p className="text-white text-2xl font-800" style={{ fontFamily: 'Syne, sans-serif' }}>৳{Number(summaryData?.total_projected_salary || 0).toLocaleString()}</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: 'rgba(148,163,184,0.14)', border: '1px solid rgba(148,163,184,0.20)' }}>
              <p className="text-muted text-[10px] uppercase tracking-widest font-600 mb-2">Top positive impact</p>
              <p className="text-white text-sm font-700">{topPositive?.employee?.name || '—'}</p>
              <p className="text-[11px] mt-1" style={{ color: '#34d399' }}>{topPositive ? `+৳${Number(topPositive.net_adjustment || 0).toLocaleString()}` : 'No bonus yet'}</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: 'rgba(148,163,184,0.14)', border: '1px solid rgba(148,163,184,0.20)' }}>
              <p className="text-muted text-[10px] uppercase tracking-widest font-600 mb-2">Highest deduction</p>
              <p className="text-white text-sm font-700">{topFine?.employee?.name || '—'}</p>
              <p className="text-[11px] mt-1" style={{ color: '#f87171' }}>{topFine && Number(topFine.total_fine || 0) > 0 ? `-৳${Number(topFine.total_fine || 0).toLocaleString()}` : 'No fines yet'}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(180deg, rgba(148,163,184,0.18), rgba(148,163,184,0.10))', border: '1px solid rgba(148,163,184,0.22)' }}>
          <div className="flex items-center gap-3 mb-4">
            <ShieldAlert className="w-5 h-5" style={{ color: 'var(--hrm-accent)' }} />
            <div>
              <p className="text-white text-sm font-700" style={{ fontFamily: 'Syne, sans-serif' }}>How this stacks</p>
              <p className="text-muted text-xs">Everything in this month stays pending until payroll marks it applied.</p>
            </div>
          </div>
          <div className="space-y-3 text-xs">
            {[
              'Festival bonus, target meet bonus, attendance bonus and other incentives can all be added separately for the same employee.',
              'Disciplinary fine, cash shortage, damage recovery and other penalties keep stacking in the same month too.',
              'Payroll will pick the month’s pending reward/fine totals and add or deduct them from salary.',
            ].map((item) => (
              <div key={item} className="rounded-xl p-3" style={{ background: 'rgba(148,163,184,0.14)', border: '1px solid rgba(148,163,184,0.20)' }}>
                <p className="text-sub leading-5">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="hrm-card rounded-2xl overflow-hidden">
        <div className="px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4" style={{ borderBottom: '1px solid rgba(148,163,184,0.22)' }}>
          <div>
            <h3 className="text-white font-700 text-sm" style={{ fontFamily: 'Syne, sans-serif' }}>Employee Breakdown</h3>
            <p className="text-muted text-[11px] mt-1">See who is getting extra benefits, who is getting deductions, and what their salary would look like before payroll.</p>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input type="text" placeholder="Search staff..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="input-dark pl-9 pr-3 py-2 text-xs rounded-xl w-56" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.18)' }}>
                {['Employee', 'Base Salary', 'Rewards', 'Fines', 'Net Adj.', 'Projected Salary', 'Actions'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] uppercase tracking-widest text-muted font-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(148,163,184,0.14)' }}>
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-4 rounded-lg animate-pulse" style={{ background: 'rgba(148,163,184,0.20)', width: j === 0 ? '140px' : '85px' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredEmployees.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-muted text-sm">No data for this period</td></tr>
              ) : filteredEmployees.map((row) => {
                const salary = Number(row.employee?.salary || 0);
                const projectedSalary = salary + Number(row.net_adjustment || 0);
                return (
                  <React.Fragment key={row.employee.id}>
                    <tr className="table-row-hover cursor-pointer" style={{ borderBottom: expandedEmployeeId === row.employee.id ? 'none' : '1px solid rgba(148,163,184,0.14)' }}
                      onClick={() => toggleRow(row.employee.id)}>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="avatar-ring w-7 h-7 shrink-0">
                            <div className="w-full h-full rounded-full flex items-center justify-center text-[10px] font-700"
                              style={{ background: 'var(--hrm-bg-soft)', color: 'var(--hrm-accent)' }}>
                              {row.employee.name.charAt(0)}
                            </div>
                          </div>
                          <div>
                            <p className="text-white text-xs font-600">{row.employee.name}</p>
                            <p className="text-muted text-[10px]">{row.employee.employee_code || '—'} · {row.total_entries} entries</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs font-700 text-sub whitespace-nowrap">৳{salary.toLocaleString()}</td>
                      <td className="px-5 py-3.5"><span className="text-xs font-700 whitespace-nowrap" style={{ color: '#34d399' }}>+৳{Number(row.total_reward || 0).toLocaleString()}</span></td>
                      <td className="px-5 py-3.5"><span className="text-xs font-700 whitespace-nowrap" style={{ color: '#f87171' }}>-৳{Number(row.total_fine || 0).toLocaleString()}</span></td>
                      <td className="px-5 py-3.5">
                        <span className="text-sm font-800 whitespace-nowrap" style={{ fontFamily: 'Syne, sans-serif', color: Number(row.net_adjustment || 0) >= 0 ? '#34d399' : '#f87171' }}>
                          {Number(row.net_adjustment || 0) >= 0 ? '+' : ''}৳{Number(row.net_adjustment || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className="text-sm font-800 gold-shimmer" style={{ fontFamily: 'Syne, sans-serif' }}>৳{projectedSalary.toLocaleString()}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <AccessControl roles={['super-admin', 'admin', 'branch-manager']}>
                            <button onClick={() => setDialog({ isOpen: true, employee: row.employee, editData: null })}
                              className="btn-primary p-1.5 rounded-lg" title="Add entry">
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </AccessControl>
                          <button onClick={() => toggleRow(row.employee.id)} className="btn-ghost p-1.5 rounded-lg">
                            {expandedEmployeeId === row.employee.id
                              ? <ChevronUp className="w-3.5 h-3.5 text-muted" />
                              : <ChevronDown className="w-3.5 h-3.5 text-muted" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedEmployeeId === row.employee.id && (
                      <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.14)' }}>
                        <td colSpan={7} className="px-5 pb-4 pt-0">
                          <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(148,163,184,0.10)', border: '1px solid rgba(148,163,184,0.18)' }}>
                            <div className="px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3" style={{ borderBottom: '1px solid rgba(148,163,184,0.18)' }}>
                              <div>
                                <p className="text-muted text-[10px] uppercase tracking-widest font-600">Entries — {format(new Date(selectedMonth + '-01'), 'MMMM yyyy')}</p>
                                <p className="text-white text-xs font-700 mt-1">Projected salary after pending stack: ৳{projectedSalary.toLocaleString()}</p>
                              </div>
                              <AccessControl roles={['super-admin', 'admin', 'branch-manager']}>
                                <button onClick={() => setDialog({ isOpen: true, employee: row.employee, editData: null })} className="btn-primary px-3 py-1.5 rounded-xl text-[11px] font-700 w-fit">
                                  Add reward / fine
                                </button>
                              </AccessControl>
                            </div>
                            {isLoadingDetails ? (
                              <div className="px-4 py-6 text-center text-muted text-xs">Loading...</div>
                            ) : employeeDetails.length === 0 ? (
                              <div className="px-4 py-6 text-center text-muted text-xs">No entries this month</div>
                            ) : (
                              <table className="w-full">
                                <tbody>
                                  {employeeDetails.map((entry: any) => (
                                    <tr key={entry.id} className="table-row-hover" style={{ borderBottom: '1px solid rgba(148,163,184,0.14)' }}>
                                      <td className="px-4 py-2.5 text-muted text-[10px] whitespace-nowrap">{format(new Date(entry.entry_date), 'dd MMM yyyy')}</td>
                                      <td className="px-4 py-2.5">
                                        <span className={`text-[10px] font-700 px-2 py-0.5 rounded-full ${entry.entry_type === 'reward' ? 'pill-green' : 'pill-red'}`}>
                                          {entry.entry_type.toUpperCase()}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2.5">
                                        <p className="text-white text-xs font-600">{entry.title}</p>
                                        {entry.notes && <p className="text-muted text-[10px]">{entry.notes}</p>}
                                      </td>
                                      <td className="px-4 py-2.5 text-xs text-muted whitespace-nowrap">{entry.is_applied ? 'Applied' : 'Pending'}</td>
                                      <td className="px-4 py-2.5">
                                        <span className="text-xs font-700 whitespace-nowrap" style={{ color: entry.entry_type === 'reward' ? '#34d399' : '#f87171' }}>
                                          {entry.entry_type === 'reward' ? '+' : '-'}৳{Number(entry.amount || 0).toLocaleString()}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2.5 text-right">
                                        <AccessControl roles={['super-admin', 'admin', 'branch-manager']}>
                                          <button onClick={() => setDialog({ isOpen: true, employee: row.employee, editData: entry })}
                                            className="btn-ghost p-1.5 rounded-lg" title="Edit">
                                            <Edit3 className="w-3 h-3" style={{ color: '#818cf8' }} />
                                          </button>
                                        </AccessControl>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {dialog.isOpen && (
        <RewardFineDialog isOpen={dialog.isOpen} onClose={() => setDialog({ ...dialog, isOpen: false })}
          storeId={selectedStoreId} employee={dialog.employee} onSuccess={loadData} editData={dialog.editData} />
      )}
    </div>
  );
}
