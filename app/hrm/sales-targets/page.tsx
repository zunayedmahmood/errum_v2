'use client';

import { useState, useEffect, useMemo } from 'react';
import { useStore } from '@/contexts/StoreContext';
import hrmService from '@/services/hrmService';
import employeeService, { Employee } from '@/services/employeeService';
import SalesTargetModal from '@/components/hrm/SalesTargetModal';
import AccessControl from '@/components/AccessControl';
import { toast } from 'react-hot-toast';
import { Target, TrendingUp, Calendar, Search, Plus, Copy, Wallet, ShoppingBag } from 'lucide-react';
import { format } from 'date-fns';

export default function SalesTargetsPage() {
  const { selectedStoreId } = useStore();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [report, setReport] = useState<any>(null);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [isLoading, setIsLoading] = useState(true);
  const [isCopying, setIsCopying] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [targetModal, setTargetModal] = useState<{ isOpen: boolean; employee: any; initialTarget?: number }>({ isOpen: false, employee: null });

  useEffect(() => {
    if (selectedStoreId) loadData();
  }, [selectedStoreId, selectedMonth]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [empData, reportData] = await Promise.all([
        employeeService.getAll({ store_id: selectedStoreId!, is_active: true }),
        hrmService.getPerformanceReport({ store_id: selectedStoreId!, month: selectedMonth })
      ]);
      setEmployees(empData);
      setReport(reportData);
    } catch (error) {
      console.error(error);
      toast.error('Failed to load sales target data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLastMonth = async () => {
    if (!selectedStoreId) return;
    setIsCopying(true);
    try {
      const res = await hrmService.copyLastMonthTargets({ store_id: selectedStoreId, target_month: selectedMonth });
      if (res.success) {
        toast.success(res.message || 'Copied!');
        loadData();
      } else {
        toast.error(res.message || 'Failed');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Error');
    } finally {
      setIsCopying(false);
    }
  };

  const filteredItems = useMemo(() => {
    const items = report?.items || [];
    return items.filter((item: any) => {
      const q = searchQuery.toLowerCase();
      return (
        item.employee.name.toLowerCase().includes(q) ||
        item.employee.employee_code?.toLowerCase().includes(q)
      );
    });
  }, [report, searchQuery]);

  const employeesWithNoTarget = useMemo(() => {
    const items = report?.items || [];
    return items.filter((item: any) => !item.target_amount || item.target_amount <= 0).length;
  }, [report]);

  if (!selectedStoreId) {
    return (
      <div className="flex flex-col items-center justify-center h-96 rounded-2xl" style={{ border: '1px dashed rgba(148,163,184,0.28)' }}>
        <Target className="w-14 h-14 mb-4" style={{ color: 'rgba(59,130,246,0.35)' }} />
        <h3 className="text-lg font-700 text-white mb-1" style={{ fontFamily: 'Syne, sans-serif' }}>No Store Selected</h3>
        <p className="text-muted text-sm">Select a store to manage sales targets</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-white text-xl font-700" style={{ fontFamily: 'Syne, sans-serif' }}>Sales Targets</h2>
          <p className="text-muted text-xs mt-0.5">Branch managers set employee-wise monthly targets. Progress is pulled from POS counter sales.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <AccessControl roles={['super-admin', 'admin', 'branch-manager']}>
            <button
              onClick={handleCopyLastMonth}
              disabled={isCopying}
              className="btn-ghost flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs disabled:opacity-50"
            >
              <Copy className="w-3.5 h-3.5" /> {isCopying ? 'Copying...' : 'Copy Last Month'}
            </button>
          </AccessControl>
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl" style={{ background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.18)' }}>
            <Calendar className="w-3.5 h-3.5" style={{ color: 'var(--hrm-accent)' }} />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-white text-xs font-600 border-none outline-none"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="hrm-card rounded-2xl p-5">
          <p className="text-muted text-[10px] uppercase tracking-widest font-600 mb-2">Branch Target</p>
          <p className="gold-shimmer text-3xl font-800" style={{ fontFamily: 'Syne, sans-serif' }}>৳{(report?.branch_target || 0).toLocaleString()}</p>
          <p className="text-muted text-[10px] mt-2">{employees.length} active employees</p>
        </div>
        <div className="hrm-card rounded-2xl p-5">
          <p className="text-muted text-[10px] uppercase tracking-widest font-600 mb-2">POS Sales Achieved</p>
          <p className="text-3xl font-800 text-white" style={{ fontFamily: 'Syne, sans-serif' }}>৳{(report?.total_sales || 0).toLocaleString()}</p>
          <p className="text-muted text-[10px] mt-2 flex items-center gap-1"><ShoppingBag className="w-3 h-3" /> {report?.branch_order_count || 0} billed orders</p>
        </div>
        <div className="hrm-card rounded-2xl p-5">
          <p className="text-muted text-[10px] uppercase tracking-widest font-600 mb-2">Remaining Target</p>
          <p className="text-3xl font-800 text-white" style={{ fontFamily: 'Syne, sans-serif' }}>৳{(report?.remaining_target || 0).toLocaleString()}</p>
          <p className="text-muted text-[10px] mt-2 flex items-center gap-1"><Wallet className="w-3 h-3" /> {employeesWithNoTarget} without target</p>
        </div>
        <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.14), rgba(59,130,246,0.05))', border: '1px solid rgba(59,130,246,0.25)' }}>
          <div className="flex justify-between items-end mb-3">
            <p className="text-muted text-[10px] uppercase tracking-widest font-600">Progress</p>
            <p className="gold-shimmer text-lg font-800" style={{ fontFamily: 'Syne, sans-serif' }}>{report?.branch_achievement || 0}%</p>
          </div>
          <div className="progress-track h-2">
            <div className="progress-gold h-2 transition-all duration-1000" style={{ width: `${Math.min(report?.branch_achievement || 0, 100)}%` }} />
          </div>
          <p className="text-muted text-[10px] mt-3 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Live from POS-tagged employee sales</p>
        </div>
      </div>

      <div className="hrm-card rounded-2xl overflow-hidden">
        <div className="px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4" style={{ borderBottom: '1px solid rgba(148,163,184,0.22)' }}>
          <div>
            <h3 className="text-white font-700 text-sm" style={{ fontFamily: 'Syne, sans-serif' }}>Employee-wise Progress</h3>
            <p className="text-muted text-[11px] mt-1">Each employee gets credit from the POS employee selected during billing.</p>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search employee..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-dark pl-9 pr-3 py-2 text-xs rounded-xl w-52"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.18)' }}>
                {['Employee', 'Target', 'Achieved', 'Remaining', 'Orders', 'Progress', ''].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] uppercase tracking-widest text-muted font-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(148,163,184,0.14)' }}>
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-4 rounded-lg animate-pulse" style={{ background: 'rgba(148,163,184,0.20)', width: j === 0 ? '140px' : '90px' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-muted text-sm">No employee sales target data found</td>
                </tr>
              ) : filteredItems.map((item: any) => {
                const pct = item.achievement_percentage || 0;
                const barColor = pct >= 100 ? 'progress-gold' : pct >= 50 ? 'progress-green' : 'progress-blue';
                return (
                  <tr key={item.employee.id} className="table-row-hover" style={{ borderBottom: '1px solid rgba(148,163,184,0.14)' }}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="avatar-ring w-8 h-8 shrink-0">
                          <div className="w-full h-full rounded-full flex items-center justify-center text-[10px] font-700" style={{ background: 'var(--hrm-bg-soft)', color: 'var(--hrm-accent)' }}>
                            {item.employee.name.charAt(0)}
                          </div>
                        </div>
                        <div>
                          <p className="text-white text-xs font-600">{item.employee.name}</p>
                          <p className="text-muted text-[10px]">{item.employee.employee_code || 'No code'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {item.target_amount > 0 ? (
                        <span className="text-xs font-700 text-sub">৳{Number(item.target_amount || 0).toLocaleString()}</span>
                      ) : (
                        <span className="text-muted text-xs italic">Not set</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-700 text-white">৳{Number(item.achieved_amount || 0).toLocaleString()}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-600" style={{ color: 'var(--hrm-accent)' }}>৳{Number(item.remaining_amount || 0).toLocaleString()}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-600 text-white">{item.order_count || 0}</span>
                    </td>
                    <td className="px-5 py-3.5 min-w-[180px]">
                      <div className="flex items-center gap-3">
                        <div className="progress-track flex-1 h-1.5">
                          <div className={`h-1.5 ${barColor} transition-all duration-700`} style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <span className="text-[10px] font-700 w-10 text-right" style={{ color: pct >= 100 ? 'var(--hrm-accent)' : pct >= 50 ? '#34d399' : '#818cf8' }}>{pct}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <AccessControl roles={['super-admin', 'admin', 'branch-manager']}>
                        <button
                          onClick={() => setTargetModal({ isOpen: true, employee: item.employee, initialTarget: item.target_amount })}
                          className="btn-ghost p-2 rounded-xl"
                          title="Set target"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </AccessControl>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {targetModal.isOpen && (
        <SalesTargetModal
          isOpen={targetModal.isOpen}
          onClose={() => setTargetModal({ ...targetModal, isOpen: false })}
          employee={targetModal.employee}
          onSuccess={loadData}
          storeId={selectedStoreId}
          initialTarget={targetModal.initialTarget}
          initialMonth={selectedMonth}
        />
      )}
    </div>
  );
}
