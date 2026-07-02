'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Calendar, CheckCircle2, CreditCard, FileText, Receipt, Search, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import hrmService from '@/services/hrmService';
import { useStore } from '@/contexts/StoreContext';

type PayrollRow = {
  employee: {
    id: number;
    name: string;
    employee_code?: string;
  };
  basic_salary: number;
  rewards: number;
  fines: number;
  late_fees: number;
  overtime_pay: number;
  net_payable: number;
  is_paid: boolean;
  paid_info?: {
    expense_id?: number;
    expense_number?: string;
    payment_id?: number;
    payment_number?: string;
    paid_at?: string | null;
    accounting_posted?: boolean;
    transaction_ids?: number[];
    transaction_numbers?: string[];
  } | null;
};

export default function PayrollPage() {
  const { selectedStoreId } = useStore();
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [sheetData, setSheetData] = useState<PayrollRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [payingEmployeeId, setPayingEmployeeId] = useState<number | null>(null);

  useEffect(() => {
    if (selectedStoreId) loadSalarySheet();
  }, [selectedStoreId, selectedMonth]);

  const loadSalarySheet = async () => {
    setIsLoading(true);
    try {
      const data = await hrmService.getMonthlySalarySheet({ store_id: selectedStoreId!, month: selectedMonth });
      setSheetData(Array.isArray(data?.sheet) ? data.sheet : []);
    } catch {
      toast.error('Failed to load payroll data.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaySalary = async (employeeId: number) => {
    if (!window.confirm('Mark this salary as paid? This will post the payment into expense, payment, and accounting transactions.')) return;

    setPayingEmployeeId(employeeId);
    try {
      const res = await hrmService.payMonthlySalary({
        employee_id: employeeId,
        store_id: selectedStoreId!,
        month: selectedMonth,
      });

      if (res.success) {
        const txns = Array.isArray(res.data?.transaction_numbers) ? res.data.transaction_numbers.join(', ') : '';
        toast.success(txns ? `Salary paid and posted. ${txns}` : (res.message || 'Salary marked as paid.'));
        await loadSalarySheet();
      } else {
        toast.error(res.message || 'Failed to mark salary as paid.');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Error executing salary payment.');
    } finally {
      setPayingEmployeeId(null);
    }
  };

  const filteredSheet = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sheetData;

    return sheetData.filter((item) =>
      item.employee.name.toLowerCase().includes(q) ||
      (item.employee.employee_code || '').toLowerCase().includes(q)
    );
  }, [sheetData, searchQuery]);

  const totalPayable = filteredSheet.reduce((sum, r) => sum + Number(r.net_payable || 0), 0);
  const paidCount = filteredSheet.filter((r) => r.is_paid).length;
  const pendingCount = filteredSheet.length - paidCount;
  const accountingPostedCount = filteredSheet.filter((r) => r.paid_info?.accounting_posted).length;

  if (!selectedStoreId) {
    return (
      <div className="flex flex-col items-center justify-center h-96 rounded-2xl" style={{ border: '1px dashed rgba(148,163,184,0.28)' }}>
        <CreditCard className="w-14 h-14 mb-4" style={{ color: 'rgba(59,130,246,0.35)' }} />
        <h3 className="text-lg font-700 text-white mb-1" style={{ fontFamily: 'Syne, sans-serif' }}>No Store Selected</h3>
        <p className="text-muted text-sm">Select a store to manage payroll</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-white text-xl font-700" style={{ fontFamily: 'Syne, sans-serif' }}>Payroll</h2>
          <p className="text-muted text-xs mt-0.5">{format(new Date(`${selectedMonth}-01`), 'MMMM yyyy')} salary sheet with accounting sync</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Calendar className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--hrm-accent)' }} />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="input-dark pl-9 pr-3 py-2 text-xs rounded-xl"
            />
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search employees..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-dark pl-9 pr-3 py-2 text-xs rounded-xl w-44"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total Payable', value: `৳${totalPayable.toLocaleString()}`, color: 'var(--hrm-accent)', bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.14)' },
          { label: 'Total Staff', value: filteredSheet.length, color: '#818cf8', bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.12)' },
          { label: 'Paid', value: paidCount, color: '#34d399', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.12)' },
          { label: 'Pending', value: pendingCount, color: '#f87171', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.12)' },
          { label: 'Posted to Accounting', value: accountingPostedCount, color: '#60a5fa', bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.12)' },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl p-4" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
            <p className="text-muted text-[10px] uppercase tracking-widest font-600 mb-2">{s.label}</p>
            <p className="text-2xl font-800" style={{ fontFamily: 'Syne, sans-serif', color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="hrm-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.22)' }}>
                {['Employee', 'Basic', 'Rewards', 'Overtime', 'Fines', 'Late Fees', 'Net Payable', 'Payroll Status', 'Accounting Status', 'Action'].map((h) => (
                  <th key={h} className="px-5 py-3.5 text-left text-[10px] uppercase tracking-widest text-muted font-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(148,163,184,0.14)' }}>
                    {[...Array(10)].map((__, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-4 rounded-lg animate-pulse" style={{ background: 'rgba(148,163,184,0.20)', width: j === 0 ? '120px' : '72px' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredSheet.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-5 py-12 text-center">
                    <FileText className="w-10 h-10 mx-auto mb-2 opacity-10 text-white" />
                    <p className="text-muted text-sm">No employees found for this month</p>
                  </td>
                </tr>
              ) : filteredSheet.map((row) => {
                const paidInfo = row.paid_info;
                const txnLabel = paidInfo?.transaction_numbers?.length ? paidInfo.transaction_numbers.join(', ') : 'No txn found';

                return (
                  <tr key={row.employee.id} className="table-row-hover" style={{ borderBottom: '1px solid rgba(148,163,184,0.14)' }}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="avatar-ring w-7 h-7 shrink-0">
                          <div className="w-full h-full rounded-full flex items-center justify-center text-[10px] font-700" style={{ background: 'var(--hrm-bg-soft)', color: 'var(--hrm-accent)' }}>
                            {row.employee.name.charAt(0)}
                          </div>
                        </div>
                        <div>
                          <p className="text-white text-xs font-600">{row.employee.name}</p>
                          <p className="text-muted text-[10px]">{row.employee.employee_code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs font-600 text-sub whitespace-nowrap">৳{Number(row.basic_salary).toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-xs font-600 whitespace-nowrap" style={{ color: '#34d399' }}>+৳{Number(row.rewards || 0).toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-xs font-600 whitespace-nowrap" style={{ color: '#34d399' }}>+৳{Number(row.overtime_pay || 0).toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-xs font-600 whitespace-nowrap" style={{ color: '#f87171' }}>-৳{Number(row.fines || 0).toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-xs font-600 whitespace-nowrap" style={{ color: '#f87171' }}>-৳{Number(row.late_fees || 0).toLocaleString()}</td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className="text-sm font-800 gold-shimmer" style={{ fontFamily: 'Syne, sans-serif' }}>
                        ৳{Number(row.net_payable).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      {row.is_paid ? (
                        <div className="space-y-1">
                          <span className="pill-green text-[10px] font-700 px-2.5 py-0.5 rounded-full flex items-center gap-1 w-fit">
                            <CheckCircle2 className="w-3 h-3" /> Paid
                          </span>
                          <p className="text-[10px] text-muted">
                            {paidInfo?.paid_at ? format(new Date(paidInfo.paid_at), 'dd MMM yyyy, hh:mm a') : 'Payment posted'}
                          </p>
                          {paidInfo?.payment_number ? <p className="text-[10px] text-sub">Payment: {paidInfo.payment_number}</p> : null}
                        </div>
                      ) : (
                        <span className="pill-amber text-[10px] font-700 px-2.5 py-0.5 rounded-full flex items-center gap-1 w-fit">
                          <AlertCircle className="w-3 h-3" /> Pending
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {paidInfo?.accounting_posted ? (
                        <div className="space-y-1">
                          <span className="pill-blue text-[10px] font-700 px-2.5 py-0.5 rounded-full flex items-center gap-1 w-fit">
                            <Wallet className="w-3 h-3" /> Posted
                          </span>
                          <p className="text-[10px] text-muted">{txnLabel}</p>
                          {paidInfo?.expense_number ? <p className="text-[10px] text-sub">Expense: {paidInfo.expense_number}</p> : null}
                        </div>
                      ) : row.is_paid ? (
                        <span className="pill-amber text-[10px] font-700 px-2.5 py-0.5 rounded-full flex items-center gap-1 w-fit">
                          <Receipt className="w-3 h-3" /> Not posted
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => handlePaySalary(row.employee.id)}
                        disabled={row.is_paid || payingEmployeeId === row.employee.id}
                        className={`px-3.5 py-1.5 rounded-xl text-[10px] font-700 transition-all whitespace-nowrap ${
                          row.is_paid ? 'cursor-not-allowed opacity-30 text-muted' : 'btn-primary'
                        }`}
                      >
                        {payingEmployeeId === row.employee.id ? (
                          <span className="flex items-center gap-1.5">
                            <span className="w-3 h-3 border border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--hrm-bg-soft)' }} />
                            Processing
                          </span>
                        ) : row.is_paid ? 'Settled' : 'Mark Paid'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
