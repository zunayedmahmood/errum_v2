'use client';

import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { useStore } from '@/contexts/StoreContext';
import { useAuth } from '@/contexts/AuthContext';
import hrmService, { AttendanceRecord } from '@/services/hrmService';
import employeeService, { Employee } from '@/services/employeeService';
import AttendanceModal from '@/components/hrm/AttendanceModal';
import AccessControl from '@/components/AccessControl';
import {
  Users,
  UserPlus,
  TrendingUp,
  Calendar,
  CheckCircle2,
  Clock,
  MoreVertical,
  Search,
  Filter,
  Edit3,
  UserCheck,
  UserX,
  Play,
  UserMinus,
  LogOut,
  ChevronRight
} from 'lucide-react';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';

export default function BranchHRMPage() {
  const { selectedStoreId } = useStore();
  const { user: currentUser } = useAuth();
  const router = useRouter();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord[]>([]);
  const [performanceReport, setPerformanceReport] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Modal states
  const [attendanceModal, setAttendanceModal] = useState<{
    isOpen: boolean;
    employee: any;
    type: 'check_in' | 'check_out' | 'edit';
    record?: any;
  }>({
    isOpen: false,
    employee: null,
    type: 'check_in'
  });

  const [activeMenuId, setActiveMenuId] = useState<number | null>(null);

  useEffect(() => {
    if (selectedStoreId) {
      loadBranchData();
    }
  }, [selectedStoreId]);

  const loadBranchData = async () => {
    setIsLoading(true);
    try {
      const [empData, attToday, perfData] = await Promise.all([
        employeeService.getAll({ store_id: selectedStoreId!, is_active: true, per_page: 100 }),
        hrmService.getTodayAttendance(selectedStoreId!),
        hrmService.getPerformanceReport({ store_id: selectedStoreId!, month: format(new Date(), 'yyyy-MM') })
      ]);

      setEmployees(empData);
      setTodayAttendance(attToday);
      setPerformanceReport(perfData);
    } catch (error) {
      console.error('Failed to load branch HRM data:', error);
      toast.error('Failed to load all branch employees');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredEmployees = (Array.isArray(employees) ? employees : []).filter(emp =>
    emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.phone?.includes(searchQuery)
  );

  const getEmpAttendance = (empId: number | string) => {
    return (Array.isArray(todayAttendance) ? todayAttendance : []).find(a => a.employee_id === Number(empId));
  };

  const handleBulkMark = async (type: 'present' | 'absent') => {
    if (!selectedStoreId) return;
    const confirm = window.confirm(`Mark all ${filteredEmployees.length} employees as ${type === 'present' ? 'Clocked In' : 'Absent'} for today?`);
    if (!confirm) return;

    try {
      const nowTime = format(new Date(), 'HH:mm');
      const payload = {
        store_id: selectedStoreId,
        attendance_date: format(new Date(), 'yyyy-MM-dd'),
        entries: filteredEmployees.map(emp => ({
          employee_id: Number(emp.id),
          status: type === 'present' ? 'present' : 'absent',
          in_time: type === 'present' ? nowTime : undefined,
        }))
      };
      await hrmService.markAttendance(payload as any);
      toast.success('Bulk attendance updated!');
      loadBranchData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleQuickMark = async (emp: Employee, status: 'present' | 'leave' | 'leaving') => {
    setActiveMenuId(null);
    if (!selectedStoreId) return;

    if (status === 'present') {
      setAttendanceModal({ isOpen: true, employee: emp, type: 'check_in' });
      return;
    }
    if (status === 'leaving') {
      const record = getEmpAttendance(emp.id);
      setAttendanceModal({ isOpen: true, employee: emp, type: 'check_out', record });
      return;
    }

    try {
      const payload = {
        store_id: selectedStoreId,
        attendance_date: format(new Date(), 'yyyy-MM-dd'),
        entries: [
          {
            employee_id: Number(emp.id),
            status: status, // status is 'leave'
          }
        ]
      };
      await hrmService.markAttendance(payload as any);
      toast.success(`Marked as on ${status}`);
      loadBranchData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  if (!selectedStoreId) {
    return (
      <div className="flex flex-col items-center justify-center h-96 bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700">
        <Users className="w-16 h-16 text-gray-300 mb-4" />
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">No Store Selected</h3>
        <p className="text-gray-500 dark:text-gray-400">Please select a store from the dropdown above to manage its HRM.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-blue-600">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold tracking-wider">Total Staff</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{employees.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl text-green-600">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold tracking-wider">Present Today</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {(Array.isArray(todayAttendance) ? todayAttendance : []).filter(a => a.status === 'present' || a.status === 'late').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-red-600">
              <UserX className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold tracking-wider">Absent Today</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {(Array.isArray(todayAttendance) ? todayAttendance : []).filter(a => a.status === 'absent').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 md:col-span-2 lg:col-span-2">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-emerald-600">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-end mb-1">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold tracking-wider">Store Performance</p>
                <p className="text-sm font-bold text-emerald-600">{performanceReport?.branch_achievement || 0}%</p>
              </div>
              <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 mt-1">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-1000"
                  style={{ width: `${Math.min(performanceReport?.branch_achievement || 0, 100)}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Employee List & Attendance Control */}
        <div className="xl:col-span-2 space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Staff Attendance</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Manage daily arrivals and departures · Showing {filteredEmployees.length} of {employees.length} staff
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden md:flex flex-col items-end mr-4">
                  <p className="text-sm font-black text-gray-900 dark:text-white leading-none">{format(currentTime, 'hh:mm:ss a')}</p>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">{format(currentTime, 'EEEE, MMM do')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleBulkMark('present')}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-xs font-black shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
                  >
                    <UserCheck className="w-4 h-4" />
                    Clock In All
                  </button>
                  <button
                    onClick={() => handleBulkMark('absent')}
                    className="flex items-center gap-2 bg-red-100 hover:bg-red-200 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-700 dark:text-red-400 px-5 py-2.5 rounded-xl text-xs font-black active:scale-95 transition-all"
                  >
                    <UserX className="w-4 h-4" />
                    Mark All Absent
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search staff..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-2 text-sm border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 focus:ring-2 focus:ring-black outline-none w-full md:w-64 shadow-sm"
                  />
                </div>
                <button className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm transition-all">
                  <Filter className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">
                  <tr>
                    <th className="px-6 py-4">Employee</th>
                    <th className="px-6 py-4">Current Status</th>
                    <th className="px-6 py-4">Time Logs</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {filteredEmployees.map((emp) => {
                    const record = getEmpAttendance(emp.id);
                    return (
                      <tr key={emp.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center font-bold text-gray-600 dark:text-gray-300">
                              {emp.name.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-900 dark:text-white">{emp.name}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{emp.phone || 'No Phone'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {record ? (
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${record.status?.toLowerCase() === 'absent' ? 'bg-red-50 text-red-600 border border-red-100' :
                                record.status?.toLowerCase() === 'leave' ? 'bg-orange-50 text-orange-600 border border-orange-100' :
                                  record.status?.toLowerCase() === 'half_day' ? 'bg-yellow-50 text-yellow-600 border border-yellow-100' :
                                    record.status?.toLowerCase() === 'late' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                                      record.status?.toLowerCase() === 'holiday_auto' || record.status?.toLowerCase() === 'off_day_auto' ? 'bg-purple-50 text-purple-600 border border-purple-100' :
                                        'bg-green-50 text-green-600 border border-green-100'}`}>
                              {record.status?.toLowerCase() === 'present' ? 'present' :
                                record.status?.toLowerCase() === 'late' ? 'late' :
                                  record.status?.toLowerCase() === 'absent' ? 'absent' :
                                    record.status?.toLowerCase() === 'leave' ? 'leave' :
                                      record.status?.toLowerCase() === 'half_day' ? 'half day' :
                                        record.status?.toLowerCase() === 'holiday_auto' ? 'holiday' :
                                          record.status?.toLowerCase() === 'off_day_auto' ? 'off day' :
                                            record.status}
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500 uppercase tracking-wider">
                              Not Marked
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-gray-400 font-medium">IN:</span>
                              <span className="text-gray-900 dark:text-white font-bold">{record?.clock_in || '--:--'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-gray-400 font-medium">OUT:</span>
                              <span className="text-gray-900 dark:text-white font-bold">{record?.clock_out || '--:--'}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-3">
                            {(() => {
                              const isClockedIn = record && (record.clock_in || record.status?.toLowerCase() === 'present' || record.status?.toLowerCase() === 'late');
                              const isClockedOut = record && record.clock_out;

                              if (!isClockedIn) {
                                return (
                                  <AccessControl roles={['super-admin', 'admin', 'branch-manager']}>
                                    <button
                                      onClick={() => handleQuickMark(emp, 'present')}
                                      className="bg-black hover:bg-gray-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-xs font-black px-5 py-2 rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-2 whitespace-nowrap"
                                    >
                                      <Play className="w-3.5 h-3.5" />
                                      Present
                                    </button>
                                  </AccessControl>
                                );
                              }

                              if (!isClockedOut) {
                                return (
                                  <AccessControl roles={['super-admin', 'admin', 'branch-manager']}>
                                    <button
                                      onClick={() => handleQuickMark(emp, 'leaving')}
                                      className="bg-red-600 hover:bg-red-700 text-white text-xs font-black px-5 py-2 rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-2 whitespace-nowrap"
                                    >
                                      <LogOut className="w-3.5 h-3.5" />
                                      Leaving
                                    </button>
                                  </AccessControl>
                                );
                              }

                              return (
                                <div className="flex flex-col items-end px-3">
                                  <div className="flex items-center gap-1.5 text-green-600 font-black text-[10px] uppercase tracking-wider">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Left
                                  </div>
                                </div>
                              );
                            })()}

                            <div className="relative">
                              <AccessControl roles={['super-admin', 'admin', 'branch-manager']}>
                                <button
                                  onClick={() => setActiveMenuId(activeMenuId === Number(emp.id) ? null : Number(emp.id))}
                                  className={`p-2 rounded-lg transition-colors ${activeMenuId === Number(emp.id) ? 'bg-gray-100 text-black' : 'text-gray-400 hover:bg-gray-50'}`}
                                >
                                  <MoreVertical className="w-5 h-5" />
                                </button>
                              </AccessControl>

                              {activeMenuId === Number(emp.id) && (
                                <>
                                  <div className="fixed inset-0 z-40" onClick={() => setActiveMenuId(null)}></div>
                                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 py-2 z-50 animate-in fade-in zoom-in duration-200">
                                    <button
                                      onClick={() => handleQuickMark(emp, 'present')}
                                      className="w-full px-4 py-2.5 text-sm font-bold text-left hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3 text-gray-700 dark:text-gray-200"
                                    >
                                      <UserCheck className="w-4 h-4 text-green-500" />
                                      Mark Present
                                    </button>
                                    <button
                                      onClick={() => handleQuickMark(emp, 'leaving')}
                                      className="w-full px-4 py-2.5 text-sm font-bold text-left hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3 text-gray-700 dark:text-gray-200"
                                    >
                                      <LogOut className="w-4 h-4 text-red-500" />
                                      Mark Leaving
                                    </button>
                                    <div className="h-px bg-gray-100 dark:bg-gray-700 my-1 mx-2"></div>
                                    <button
                                      onClick={() => handleQuickMark(emp, 'leave')}
                                      className="w-full px-4 py-2.5 text-sm font-bold text-left hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3 text-orange-600"
                                    >
                                      <UserMinus className="w-4 h-4" />
                                      Give Leave
                                    </button>
                                    <div className="h-px bg-gray-100 dark:bg-gray-700 my-1 mx-2"></div>
                                    <button
                                      onClick={() => {
                                        setActiveMenuId(null);
                                        setAttendanceModal({ isOpen: true, employee: emp, type: 'edit', record });
                                      }}
                                      className="w-full px-4 py-2.5 text-sm font-bold text-left hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3 text-blue-600"
                                    >
                                      <Edit3 className="w-4 h-4" />
                                      Manual Edit
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Top Performers Sidebar */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-purple-500" />
              Leaderboard (Performance)
            </h3>

            <div className="space-y-5">
              {(Array.isArray(performanceReport?.items) ? performanceReport.items : []).slice(0, 5).map((rank: any, idx: number) => (
                <div key={rank.employee.id} className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${idx === 0 ? 'bg-yellow-100 text-yellow-700' :
                    idx === 1 ? 'bg-gray-100 text-gray-700' :
                      idx === 2 ? 'bg-orange-100 text-orange-700' :
                        'bg-gray-50 text-gray-500'
                    }`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{rank.employee.name}</p>
                    <div className="w-full bg-gray-100 dark:bg-gray-700 h-1.5 rounded-full mt-1">
                      <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min(rank.achievement_percentage, 100)}%` }}></div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-blue-600 dark:text-blue-400">
                      {rank.achievement_percentage}%
                    </p>
                  </div>
                </div>
              ))}
              {(!performanceReport?.items || performanceReport.items.length === 0) && (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500">No performance data yet for this month.</p>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions Card */}
          <div className="bg-black text-white rounded-2xl p-6 shadow-lg shadow-black/20">
            <h3 className="font-bold mb-4">Branch Quick Actions</h3>
            <div className="grid grid-cols-1 gap-3">
              <button onClick={() => router.push('/hrm/sales-targets')} className="flex items-center justify-between p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-sm font-medium">
                Set Sales Targets
                <ChevronRight className="w-4 h-4 text-white/50" />
              </button>
              <button onClick={() => router.push('/hrm/rewards-fines')} className="flex items-center justify-between p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-sm font-medium">
                Manage Rewards & Fines
                <ChevronRight className="w-4 h-4 text-white/50" />
              </button>
              <button onClick={() => router.push('/hrm/payroll')} className="flex items-center justify-between p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-sm font-medium">
                Process Payroll
                <ChevronRight className="w-4 h-4 text-white/50" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Attendance Modal Implementation */}
      {attendanceModal.isOpen && (
        <AttendanceModal
          isOpen={attendanceModal.isOpen}
          onClose={() => setAttendanceModal({ ...attendanceModal, isOpen: false })}
          employee={attendanceModal.employee}
          type={attendanceModal.type}
          record={attendanceModal.record}
          storeId={selectedStoreId!}
          onSuccess={loadBranchData}
        />
      )}
    </div>
  );
}
