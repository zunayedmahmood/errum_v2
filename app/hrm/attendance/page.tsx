'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday } from 'date-fns';
import { useStore } from '@/contexts/StoreContext';
import hrmService, { AttendancePolicy, EmployeeSchedule } from '@/services/hrmService';
import employeeService, { Employee } from '@/services/employeeService';
import {
  CalendarDays,
  Clock3,
  Settings2,
  Users,
  CheckCircle2,
  UserX,
  Save,
  RotateCcw,
  Search,
  ShieldCheck,
  TimerReset,
  LogIn,
  LogOut,
} from 'lucide-react';

type ReportEmployee = {
  employee: {
    id: number;
    name: string;
    employee_code?: string;
  };
  summary: Record<string, number | string>;
  daily: Array<{
    date: string;
    status: string;
    in_time?: string | null;
    out_time?: string | null;
    attendance_id?: number | null;
    source?: string;
    scheduled_start_time?: string | null;
    scheduled_end_time?: string | null;
    duty_minutes?: number;
    worked_minutes?: number;
    overtime_minutes?: number;
    undertime_minutes?: number;
    overtime_hhmm?: string;
    worked_hhmm?: string;
    duty_hhmm?: string;
  }>;
};

const WEEK_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

export default function AttendanceManagerPage() {
  const { selectedStoreId } = useStore();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [policy, setPolicy] = useState<AttendancePolicy | null>(null);
  const [schedules, setSchedules] = useState<EmployeeSchedule[]>([]);
  const [reportEmployees, setReportEmployees] = useState<ReportEmployee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);
  const [isSavingRoster, setIsSavingRoster] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [search, setSearch] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [manualClockTime, setManualClockTime] = useState(format(new Date(), 'HH:mm'));

  const [policyForm, setPolicyForm] = useState({
    mode: 'fixed_day_off',
    fixed_days_off: ['friday'] as string[],
    fixed_start_time: '10:00',
    fixed_end_time: '20:00',
    late_fee_per_minute: '0',
    overtime_rate_per_hour: '0',
    grace_period_minutes: '0',
    notes: '',
  });

  const [rosterForm, setRosterForm] = useState({
    start_time: '10:00',
    end_time: '20:00',
    duty_mode: 'selected_dates',
    notes: '',
    duty_dates: [] as string[],
  });

  useEffect(() => {
    if (!selectedStoreId) return;
    void loadAll();
  }, [selectedStoreId, selectedMonth, selectedDate]);

  const monthDates = useMemo(() => {
    const monthStart = startOfMonth(new Date(`${selectedMonth}-01T00:00:00`));
    const monthEnd = endOfMonth(monthStart);
    return eachDayOfInterval({ start: monthStart, end: monthEnd });
  }, [selectedMonth]);

  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        employee.name.toLowerCase().includes(q) ||
        employee.email?.toLowerCase().includes(q) ||
        employee.phone?.toLowerCase().includes(q)
      );
    });
  }, [employees, search]);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => Number(employee.id) === Number(selectedEmployeeId)) ?? null,
    [employees, selectedEmployeeId]
  );

  const selectedSchedule = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return schedules.find((row) => Number(row.employee_id) === Number(selectedEmployeeId)) ?? null;
  }, [schedules, selectedEmployeeId]);

  useEffect(() => {
    if (!selectedEmployeeId && employees.length > 0) {
      setSelectedEmployeeId(Number(employees[0].id));
    }
  }, [employees, selectedEmployeeId]);

  useEffect(() => {
    if (!policy) return;
    setPolicyForm({
      mode: policy.mode || 'fixed_day_off',
      fixed_days_off: policy.fixed_days_off || ['friday'],
      fixed_start_time: policy.fixed_start_time || '10:00',
      fixed_end_time: policy.fixed_end_time || '20:00',
      late_fee_per_minute: String(policy.late_fee_per_minute ?? 0),
      overtime_rate_per_hour: String(policy.overtime_rate_per_hour ?? 0),
      grace_period_minutes: String(policy.grace_period_minutes ?? 0),
      notes: policy.notes || '',
    });
  }, [policy]);

  useEffect(() => {
    if (!selectedSchedule) {
      setRosterForm((prev) => ({
        ...prev,
        duty_dates: [],
      }));
      return;
    }

    const monthStart = format(startOfMonth(new Date(`${selectedMonth}-01T00:00:00`)), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(new Date(`${selectedMonth}-01T00:00:00`)), 'yyyy-MM-dd');
    const dutyDates = (selectedSchedule.duty_dates || []).filter((date) => date >= monthStart && date <= monthEnd);

    setRosterForm({
      start_time: selectedSchedule.start_time?.slice(0, 5) || '10:00',
      end_time: selectedSchedule.end_time?.slice(0, 5) || '20:00',
      duty_mode: selectedSchedule.duty_mode || 'selected_dates',
      notes: selectedSchedule.notes || '',
      duty_dates,
    });
  }, [selectedSchedule, selectedMonth]);

  const loadAll = async (): Promise<void> => {
    if (!selectedStoreId) return;

    setIsLoading(true);
    try {
      const monthStart = format(startOfMonth(new Date(`${selectedMonth}-01T00:00:00`)), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(new Date(`${selectedMonth}-01T00:00:00`)), 'yyyy-MM-dd');

      const [employeeData, policyData, scheduleData, reportData] = await Promise.all([
        employeeService.getAll({ store_id: selectedStoreId, is_active: true }),
        hrmService.getStorePolicy(selectedStoreId),
        hrmService.getSchedules({ store_id: selectedStoreId, date: monthStart }),
        hrmService.getAttendanceReport({ store_id: selectedStoreId, from: monthStart, to: monthEnd }),
      ]);

      setEmployees(employeeData);
      setPolicy(policyData);
      setSchedules(scheduleData);
      setReportEmployees(Array.isArray(reportData?.employees) ? (reportData.employees as ReportEmployee[]) : []);
    } catch (error) {
      console.error(error);
      toast.error('Failed to load attendance manager');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleOffDay = (day: string): void => {
    setPolicyForm((prev) => ({
      ...prev,
      fixed_days_off: prev.fixed_days_off.includes(day)
        ? prev.fixed_days_off.filter((item) => item !== day)
        : [...prev.fixed_days_off, day],
    }));
  };

  const savePolicy = async (): Promise<void> => {
    if (!selectedStoreId) return;

    setIsSavingPolicy(true);
    try {
      await hrmService.upsertStorePolicy({
        store_id: selectedStoreId,
        mode: policyForm.mode,
        fixed_days_off: policyForm.mode === 'fixed_day_off' ? policyForm.fixed_days_off : [],
        fixed_start_time: policyForm.mode === 'fixed_day_off' ? policyForm.fixed_start_time : null,
        fixed_end_time: policyForm.mode === 'fixed_day_off' ? policyForm.fixed_end_time : null,
        late_fee_per_minute: Number(policyForm.late_fee_per_minute || 0),
        overtime_rate_per_hour: Number(policyForm.overtime_rate_per_hour || 0),
        grace_period_minutes: Number(policyForm.grace_period_minutes || 0),
        notes: policyForm.notes,
      });
      toast.success('Attendance mode saved');
      await loadAll();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Could not save attendance mode');
    } finally {
      setIsSavingPolicy(false);
    }
  };

  const toggleDutyDate = (date: string): void => {
    setRosterForm((prev) => ({
      ...prev,
      duty_dates: prev.duty_dates.includes(date)
        ? prev.duty_dates.filter((item) => item !== date)
        : [...prev.duty_dates, date].sort(),
    }));
  };

  const autoFillRoster = (): void => {
    if (policyForm.mode === 'fixed_day_off') {
      const dates = monthDates
        .filter((day) => !policyForm.fixed_days_off.includes(format(day, 'EEEE').toLowerCase()))
        .map((day) => format(day, 'yyyy-MM-dd'));
      setRosterForm((prev) => ({ ...prev, duty_dates: dates }));
      return;
    }

    const firstTwentySix = monthDates.slice(0, 26).map((day) => format(day, 'yyyy-MM-dd'));
    setRosterForm((prev) => ({ ...prev, duty_dates: firstTwentySix }));
  };

  const clearRoster = (): void => {
    setRosterForm((prev) => ({ ...prev, duty_dates: [] }));
  };

  const saveRoster = async (): Promise<void> => {
    if (!selectedStoreId || !selectedEmployeeId) {
      toast.error('Select an employee first');
      return;
    }

    setIsSavingRoster(true);
    try {
      const monthStart = format(startOfMonth(new Date(`${selectedMonth}-01T00:00:00`)), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(new Date(`${selectedMonth}-01T00:00:00`)), 'yyyy-MM-dd');

      await hrmService.assignSchedule({
        employee_id: selectedEmployeeId,
        store_id: selectedStoreId,
        start_time: rosterForm.start_time,
        end_time: rosterForm.end_time,
        effective_from: monthStart,
        effective_to: monthEnd,
        duty_mode: 'selected_dates',
        duty_dates: rosterForm.duty_dates,
        notes: rosterForm.notes,
      });
      toast.success('Duty roster saved');
      await loadAll();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Could not save roster');
    } finally {
      setIsSavingRoster(false);
    }
  };

  const getScheduleForEmployee = (employeeId: number): EmployeeSchedule | null => {
    return schedules.find((row) => Number(row.employee_id) === Number(employeeId)) ?? null;
  };

  const isScheduledForDate = (schedule: EmployeeSchedule | null, date: string): boolean => {
    if (!schedule) return policyForm.mode !== 'always_on_duty';
    const mode = schedule.duty_mode || 'all_days';
    if (mode === 'selected_dates') return (schedule.duty_dates || []).includes(date);
    if (mode === 'weekly_pattern') {
      const dayName = format(new Date(`${date}T00:00:00`), 'EEEE').toLowerCase();
      return (schedule.weekly_days || []).includes(dayName);
    }
    return true;
  };

  const markEmployee = async (
    employeeId: number,
    action: 'clock_in' | 'clock_out' | 'absent' | 'leave'
  ): Promise<void> => {
    if (!selectedStoreId) return;

    try {
      const payloadEntry: Record<string, unknown> = {
        employee_id: employeeId,
        status: action === 'absent' ? 'absent' : action === 'leave' ? 'leave' : 'present',
      };

      if (action === 'clock_in') payloadEntry.in_time = manualClockTime;
      if (action === 'clock_out') payloadEntry.out_time = manualClockTime;

      await hrmService.markAttendance({
        store_id: selectedStoreId,
        attendance_date: selectedDate,
        entries: [payloadEntry],
      });

      toast.success('Attendance updated');
      await loadAll();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Attendance update failed');
    }
  };


  const minutesToHhmm = (minutes?: number): string => {
    const safe = Math.max(0, Number(minutes || 0));
    const hh = String(Math.floor(safe / 60)).padStart(2, '0');
    const mm = String(safe % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const statusConfig: Record<string, { label: string; bg: string; color: string }> = {
    present: { label: 'P', bg: 'rgba(52,211,153,0.85)', color: '#fff' },
    late: { label: 'L', bg: 'rgba(245,158,11,0.85)', color: '#fff' },
    absent: { label: 'A', bg: 'rgba(239,68,68,0.85)', color: '#fff' },
    leave: { label: 'LV', bg: 'rgba(99,102,241,0.85)', color: '#fff' },
    half_day: { label: 'H', bg: 'rgba(249,115,22,0.85)', color: '#fff' },
    off_day_auto: { label: 'OFF', bg: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)' },
    holiday_auto: { label: 'HD', bg: 'rgba(139,92,246,0.75)', color: '#fff' },
    upcoming: { label: 'UP', bg: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.25)' },
  };

  const reportRows = useMemo(() => {
    return reportEmployees.filter((item) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        item.employee.name.toLowerCase().includes(q) ||
        item.employee.employee_code?.toLowerCase().includes(q)
      );
    });
  }, [reportEmployees, search]);


  const attendanceTotals = useMemo(() => {
    return reportRows.reduce(
      (acc, row) => {
        acc.dutyDays += Number((row.summary.present || 0) + (row.summary.late || 0) + (row.summary.absent || 0) + (row.summary.leave || 0) + (row.summary.half_day || 0));
        acc.overtimeMinutes += Number(row.summary.overtime_minutes || 0);
        acc.workedMinutes += Number(row.summary.worked_minutes || 0);
        acc.dutyMinutes += Number(row.summary.duty_minutes || 0);
        return acc;
      },
      { dutyDays: 0, overtimeMinutes: 0, workedMinutes: 0, dutyMinutes: 0 }
    );
  }, [reportRows]);

  const dayMap = useMemo(() => {
    const map = new Map<number, ReportEmployee['daily'][number]>();
    reportEmployees.forEach((row) => {
      const dayRow = row.daily.find((item) => item.date === selectedDate);
      if (dayRow) map.set(row.employee.id, dayRow);
    });
    return map;
  }, [reportEmployees, selectedDate]);

  if (!selectedStoreId) {
    return (
      <div className="flex h-96 flex-col items-center justify-center rounded-2xl" style={{ border: '1px dashed rgba(255,255,255,0.08)' }}>
        <CalendarDays className="mb-4 h-14 w-14" style={{ color: 'rgba(201,168,76,0.3)' }} />
        <h3 className="mb-1 text-lg font-700 text-white" style={{ fontFamily: 'Syne, sans-serif' }}>No store selected</h3>
        <p className="text-sm text-muted">Choose a branch to open attendance manager</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="hrm-card rounded-2xl p-5 xl:col-span-1">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-600 uppercase tracking-widest text-muted">Branch attendance mode</p>
              <h2 className="mt-1 text-lg font-700 text-white" style={{ fontFamily: 'Syne, sans-serif' }}>Policy setup</h2>
            </div>
            <div className="rounded-xl p-2" style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.15)' }}>
              <Settings2 className="h-4 w-4" style={{ color: '#f0d080' }} />
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPolicyForm((prev) => ({ ...prev, mode: 'fixed_day_off' }))}
                className="rounded-xl px-4 py-3 text-left transition-all"
                style={{
                  background: policyForm.mode === 'fixed_day_off' ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.03)',
                  border: policyForm.mode === 'fixed_day_off' ? '1px solid rgba(201,168,76,0.28)' : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <p className="text-sm font-700 text-white">Weekly holiday</p>
                <p className="mt-1 text-[11px] text-muted">Same weekly off-day rules for the branch.</p>
              </button>
              <button
                type="button"
                onClick={() => setPolicyForm((prev) => ({ ...prev, mode: 'always_on_duty' }))}
                className="rounded-xl px-4 py-3 text-left transition-all"
                style={{
                  background: policyForm.mode === 'always_on_duty' ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.03)',
                  border: policyForm.mode === 'always_on_duty' ? '1px solid rgba(99,102,241,0.28)' : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <p className="text-sm font-700 text-white">Roster duty</p>
                <p className="mt-1 text-[11px] text-muted">Choose duty dates employee by employee.</p>
              </button>
            </div>

            {policyForm.mode === 'fixed_day_off' && (
              <div>
                <label className="mb-2 block text-[10px] font-700 uppercase tracking-widest text-muted">Weekly holidays</label>
                <div className="grid grid-cols-2 gap-2">
                  {WEEK_DAYS.map((day) => {
                    const active = policyForm.fixed_days_off.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleOffDay(day)}
                        className="rounded-xl px-3 py-2.5 text-xs font-700 capitalize transition-all"
                        style={{
                          background: active ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.03)',
                          border: active ? '1px solid rgba(201,168,76,0.24)' : '1px solid rgba(255,255,255,0.06)',
                          color: active ? '#f0d080' : 'rgba(255,255,255,0.72)',
                        }}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-2 block text-[10px] font-700 uppercase tracking-widest text-muted">Default in</label>
                <input value={policyForm.fixed_start_time} onChange={(e) => setPolicyForm((prev) => ({ ...prev, fixed_start_time: e.target.value }))} type="time" className="input-dark w-full rounded-xl px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="mb-2 block text-[10px] font-700 uppercase tracking-widest text-muted">Default out</label>
                <input value={policyForm.fixed_end_time} onChange={(e) => setPolicyForm((prev) => ({ ...prev, fixed_end_time: e.target.value }))} type="time" className="input-dark w-full rounded-xl px-3 py-2.5 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-2 block text-[10px] font-700 uppercase tracking-widest text-muted">Late fee / min</label>
                <input value={policyForm.late_fee_per_minute} onChange={(e) => setPolicyForm((prev) => ({ ...prev, late_fee_per_minute: e.target.value }))} type="number" min="0" className="input-dark w-full rounded-xl px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="mb-2 block text-[10px] font-700 uppercase tracking-widest text-muted">OT / hour</label>
                <input value={policyForm.overtime_rate_per_hour} onChange={(e) => setPolicyForm((prev) => ({ ...prev, overtime_rate_per_hour: e.target.value }))} type="number" min="0" className="input-dark w-full rounded-xl px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="mb-2 block text-[10px] font-700 uppercase tracking-widest text-muted">Grace min</label>
                <input value={policyForm.grace_period_minutes} onChange={(e) => setPolicyForm((prev) => ({ ...prev, grace_period_minutes: e.target.value }))} type="number" min="0" className="input-dark w-full rounded-xl px-3 py-2.5 text-sm" />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-700 uppercase tracking-widest text-muted">Notes</label>
              <textarea value={policyForm.notes} onChange={(e) => setPolicyForm((prev) => ({ ...prev, notes: e.target.value }))} rows={3} className="input-dark w-full rounded-xl px-3 py-2.5 text-sm" placeholder="Optional branch attendance notes..." />
            </div>

            <button onClick={() => void savePolicy()} disabled={isSavingPolicy} className="btn-primary flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm">
              <Save className="h-4 w-4" />
              {isSavingPolicy ? 'Saving...' : 'Save attendance mode'}
            </button>
          </div>
        </div>

        <div className="hrm-card rounded-2xl p-5 xl:col-span-2">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-600 uppercase tracking-widest text-muted">Monthly duty planner</p>
              <h2 className="mt-1 text-lg font-700 text-white" style={{ fontFamily: 'Syne, sans-serif' }}>Roster builder</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="input-dark rounded-xl px-3 py-2 text-sm" />
              <select value={selectedEmployeeId ?? ''} onChange={(e) => setSelectedEmployeeId(Number(e.target.value))} className="select-dark rounded-xl px-3 py-2 text-sm min-w-[220px]">
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>{employee.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <label className="mb-2 block text-[10px] font-700 uppercase tracking-widest text-muted">Shift start</label>
              <input type="time" value={rosterForm.start_time} onChange={(e) => setRosterForm((prev) => ({ ...prev, start_time: e.target.value }))} className="input-dark w-full rounded-xl px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="mb-2 block text-[10px] font-700 uppercase tracking-widest text-muted">Shift end</label>
              <input type="time" value={rosterForm.end_time} onChange={(e) => setRosterForm((prev) => ({ ...prev, end_time: e.target.value }))} className="input-dark w-full rounded-xl px-3 py-2.5 text-sm" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-[10px] font-700 uppercase tracking-widest text-muted">Roster note</label>
              <input value={rosterForm.notes} onChange={(e) => setRosterForm((prev) => ({ ...prev, notes: e.target.value }))} className="input-dark w-full rounded-xl px-3 py-2.5 text-sm" placeholder="Optional notes for this month..." />
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button onClick={autoFillRoster} className="btn-ghost rounded-xl px-3 py-2 text-xs font-700">Auto fill</button>
            <button onClick={clearRoster} className="btn-ghost rounded-xl px-3 py-2 text-xs font-700 flex items-center gap-1.5"><RotateCcw className="h-3.5 w-3.5" />Clear</button>
            <div className="rounded-xl px-3 py-2 text-xs font-700" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: '#fff' }}>
              Selected duty days: {rosterForm.duty_dates.length}
            </div>
            {selectedEmployee && (
              <div className="rounded-xl px-3 py-2 text-xs" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.18)', color: '#c7d2fe' }}>
                {selectedEmployee.name}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-7">
            {monthDates.map((day) => {
              const date = format(day, 'yyyy-MM-dd');
              const active = rosterForm.duty_dates.includes(date);
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => toggleDutyDate(date)}
                  className="rounded-2xl px-2 py-3 text-center transition-all"
                  style={{
                    background: active ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.03)',
                    border: active ? '1px solid rgba(52,211,153,0.25)' : '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <p className="text-[10px] uppercase tracking-widest text-muted">{format(day, 'EEE')}</p>
                  <p className="mt-1 text-base font-800" style={{ color: active ? '#34d399' : '#fff' }}>{format(day, 'dd')}</p>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-sm text-sub">
              In roster branches, attendance can only be marked on selected duty dates. This is where you pick the employee’s 26 working days for the month.
            </p>
            <button onClick={() => void saveRoster()} disabled={isSavingRoster || !selectedEmployeeId} className="btn-primary flex items-center gap-2 rounded-xl px-4 py-3 text-sm">
              <Save className="h-4 w-4" />
              {isSavingRoster ? 'Saving...' : 'Save employee roster'}
            </button>
          </div>
        </div>
      </div>

      <div className="hrm-card rounded-2xl overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <p className="text-xs font-600 uppercase tracking-widest text-muted">Daily control</p>
            <h3 className="mt-1 text-lg font-700 text-white" style={{ fontFamily: 'Syne, sans-serif' }}>Clock in / out manager</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="input-dark rounded-xl px-3 py-2 text-sm" />
            <input type="time" value={manualClockTime} onChange={(e) => setManualClockTime(e.target.value)} className="input-dark rounded-xl px-3 py-2 text-sm" />
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee..." className="input-dark rounded-xl py-2 pl-9 pr-3 text-sm" />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto scroll-custom">
          <table className="w-full text-left">
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <th className="px-5 py-3 text-[10px] font-700 uppercase tracking-widest text-muted">Employee</th>
                <th className="px-5 py-3 text-[10px] font-700 uppercase tracking-widest text-muted">Duty</th>
                <th className="px-5 py-3 text-[10px] font-700 uppercase tracking-widest text-muted">Status</th>
                <th className="px-5 py-3 text-[10px] font-700 uppercase tracking-widest text-muted">In / Out</th>
                <th className="px-5 py-3 text-[10px] font-700 uppercase tracking-widest text-muted text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-16 text-center text-sm text-muted">Loading attendance manager...</td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-16 text-center text-sm text-muted">No employees found</td>
                </tr>
              ) : filteredEmployees.map((employee) => {
                const dayRow = dayMap.get(Number(employee.id));
                const schedule = getScheduleForEmployee(Number(employee.id));
                const dutyActive = isScheduledForDate(schedule, selectedDate);
                const status = dayRow?.status || (dutyActive ? 'not_marked' : 'off_day_auto');
                const clockedIn = Boolean(dayRow?.in_time);
                const clockedOut = Boolean(dayRow?.out_time);

                return (
                  <tr key={employee.id} className="table-row-hover" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="avatar-ring h-9 w-9 shrink-0">
                          <div className="flex h-full w-full items-center justify-center rounded-full bg-[#09090f] text-sm font-700 text-[#f0d080]">
                            {employee.name.charAt(0)}
                          </div>
                        </div>
                        <div>
                          <p className="text-sm font-700 text-white">{employee.name}</p>
                          <p className="text-[11px] text-muted">{employee.phone || employee.email || 'No contact'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {dutyActive ? (
                        <div>
                          <p className="text-xs font-700 text-emerald-400">Duty day</p>
                          <p className="text-[11px] text-muted">{schedule?.start_time?.slice(0, 5) || rosterForm.start_time} - {schedule?.end_time?.slice(0, 5) || rosterForm.end_time}</p>
                        </div>
                      ) : (
                        <span className="rounded-full px-2.5 py-1 text-[10px] font-700 uppercase tracking-wider" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.55)' }}>
                          Off day
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {status === 'not_marked' ? (
                        <span className="rounded-full px-2.5 py-1 text-[10px] font-700 uppercase tracking-wider" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)' }}>
                          Not marked
                        </span>
                      ) : (
                        <span className="rounded-full px-2.5 py-1 text-[10px] font-700 uppercase tracking-wider" style={{
                          background: statusConfig[status]?.bg || 'rgba(255,255,255,0.06)',
                          color: statusConfig[status]?.color || '#fff',
                        }}>
                          {status.replace(/_/g, ' ')}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-sm text-white">
                      <div className="space-y-1">
                        <p><span className="text-muted">IN:</span> {dayRow?.in_time || '--:--'}</p>
                        <p><span className="text-muted">OUT:</span> {dayRow?.out_time || '--:--'}</p>
                        <p className="text-[11px] text-muted">Duty: {dayRow?.scheduled_start_time && dayRow?.scheduled_end_time ? `${dayRow.scheduled_start_time} - ${dayRow.scheduled_end_time}` : '--:--'}</p>
                        <p className="text-[11px]"><span className="text-indigo-300">OT:</span> {dayRow?.overtime_hhmm || minutesToHhmm(dayRow?.overtime_minutes)} <span className="text-muted">• Worked {dayRow?.worked_hhmm || minutesToHhmm(dayRow?.worked_minutes)}</span></p>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          disabled={!dutyActive || clockedIn}
                          onClick={() => void markEmployee(Number(employee.id), 'clock_in')}
                          className="rounded-xl px-3 py-2 text-xs font-700 disabled:cursor-not-allowed disabled:opacity-40"
                          style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399' }}
                        >
                          <span className="inline-flex items-center gap-1.5"><LogIn className="h-3.5 w-3.5" />Clock in</span>
                        </button>
                        <button
                          disabled={!dutyActive || !clockedIn || clockedOut}
                          onClick={() => void markEmployee(Number(employee.id), 'clock_out')}
                          className="rounded-xl px-3 py-2 text-xs font-700 disabled:cursor-not-allowed disabled:opacity-40"
                          style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}
                        >
                          <span className="inline-flex items-center gap-1.5"><LogOut className="h-3.5 w-3.5" />Clock out</span>
                        </button>
                        <button
                          disabled={!dutyActive}
                          onClick={() => void markEmployee(Number(employee.id), 'leave')}
                          className="rounded-xl px-3 py-2 text-xs font-700 disabled:cursor-not-allowed disabled:opacity-40"
                          style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)', color: '#818cf8' }}
                        >
                          Leave
                        </button>
                        <button
                          disabled={!dutyActive}
                          onClick={() => void markEmployee(Number(employee.id), 'absent')}
                          className="rounded-xl px-3 py-2 text-xs font-700 disabled:cursor-not-allowed disabled:opacity-40"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.78)' }}
                        >
                          Absent
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-4">
        <div className="hrm-card rounded-2xl p-5">
          <div className="mb-3 flex items-center gap-3">
            <div className="rounded-xl p-2" style={{ background: 'rgba(52,211,153,0.12)' }}><CheckCircle2 className="h-4 w-4 text-emerald-400" /></div>
            <div>
              <p className="text-xs uppercase tracking-widest text-muted">Planned duty days</p>
              <p className="text-2xl font-800 text-white">{rosterForm.duty_dates.length}</p>
            </div>
          </div>
          <p className="text-xs text-sub">Useful for those branches where each employee has a monthly roster instead of a fixed weekly holiday.</p>
        </div>
        <div className="hrm-card rounded-2xl p-5">
          <div className="mb-3 flex items-center gap-3">
            <div className="rounded-xl p-2" style={{ background: 'rgba(99,102,241,0.12)' }}><Users className="h-4 w-4 text-indigo-300" /></div>
            <div>
              <p className="text-xs uppercase tracking-widest text-muted">Total staff</p>
              <p className="text-2xl font-800 text-white">{employees.length}</p>
            </div>
          </div>
          <p className="text-xs text-sub">The daily control table includes all active staff in the selected branch.</p>
        </div>
        <div className="hrm-card rounded-2xl p-5">
          <div className="mb-3 flex items-center gap-3">
            <div className="rounded-xl p-2" style={{ background: 'rgba(245,158,11,0.12)' }}><Clock3 className="h-4 w-4 text-amber-300" /></div>
            <div>
              <p className="text-xs uppercase tracking-widest text-muted">Monthly overtime</p>
              <p className="text-2xl font-800 text-white">{minutesToHhmm(attendanceTotals.overtimeMinutes)}</p>
            </div>
          </div>
          <p className="text-xs text-sub">Auto-calculated from actual clock in and clock out against the assigned duty time.</p>
        </div>
        <div className="hrm-card rounded-2xl p-5">
          <div className="mb-3 flex items-center gap-3">
            <div className="rounded-xl p-2" style={{ background: 'rgba(201,168,76,0.12)' }}><ShieldCheck className="h-4 w-4" style={{ color: '#f0d080' }} /></div>
            <div>
              <p className="text-xs uppercase tracking-widest text-muted">Manual clock time</p>
              <p className="text-lg font-800 text-white">{manualClockTime}</p>
            </div>
          </div>
          <p className="text-xs text-sub">This time is used when the manager presses clock in or clock out.</p>
        </div>
      </div>

      <div className="hrm-card rounded-2xl overflow-hidden">
        <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <p className="text-xs uppercase tracking-widest text-muted">Monthly report</p>
            <h3 className="mt-1 text-lg font-700 text-white" style={{ fontFamily: 'Syne, sans-serif' }}>Attendance matrix</h3>
          </div>
          <div className="rounded-xl px-3 py-2 text-xs font-700" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: '#fff' }}>
            {selectedMonth}
          </div>
        </div>
        <div className="overflow-x-auto scroll-custom">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <th className="min-w-[180px] px-5 py-3 text-[10px] font-700 uppercase tracking-widest text-muted" style={{ position: 'sticky', left: 0, zIndex: 10, background: '#0e0e18', borderRight: '1px solid rgba(255,255,255,0.06)' }}>Employee</th>
                <th className="min-w-[88px] px-4 py-3 text-center text-[10px] font-700 uppercase tracking-widest text-muted" style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>Duty days</th>
                <th className="min-w-[88px] px-4 py-3 text-center text-[10px] font-700 uppercase tracking-widest text-muted" style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>Month OT</th>
                {monthDates.map((day) => (
                  <th key={day.toISOString()} className="min-w-[28px] px-1 py-3 text-center" style={{ background: isToday(day) ? 'rgba(201,168,76,0.08)' : 'transparent' }}>
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-700" style={{ color: isToday(day) ? '#f0d080' : 'rgba(255,255,255,0.35)' }}>{format(day, 'dd')}</span>
                      <span className="text-[8px]" style={{ color: 'rgba(255,255,255,0.2)' }}>{format(day, 'EEE').charAt(0)}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reportRows.length === 0 ? (
                <tr>
                  <td colSpan={monthDates.length + 3} className="px-5 py-14 text-center text-sm text-muted">No monthly attendance data found.</td>
                </tr>
              ) : reportRows.map((row) => {
                const schedule = getScheduleForEmployee(row.employee.id);
                const dutyCount = schedule?.duty_dates?.filter((date) => date.startsWith(selectedMonth)).length ?? 0;

                return (
                  <tr key={row.employee.id} className="table-row-hover" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td className="px-5 py-3" style={{ position: 'sticky', left: 0, zIndex: 5, background: '#0d0d17', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                      <div>
                        <p className="text-sm font-700 text-white">{row.employee.name}</p>
                        <p className="text-[10px] text-muted">{row.employee.employee_code || 'No code'}</p>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center" style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                      <span className="rounded-lg px-2 py-1 text-[10px] font-700" style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399' }}>{dutyCount || row.summary.present + row.summary.late + row.summary.absent + row.summary.leave}</span>
                    </td>
                    <td className="px-3 py-3 text-center" style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                      <span className="rounded-lg px-2 py-1 text-[10px] font-700" style={{ background: 'rgba(99,102,241,0.12)', color: '#a5b4fc' }}>{row.summary.overtime_hhmm || minutesToHhmm(row.summary.overtime_minutes)}</span>
                    </td>
                    {row.daily.map((day) => {
                      const cfg = statusConfig[day.status] || { label: '·', bg: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.2)' };
                      return (
                        <td key={`${row.employee.id}-${day.date}`} className="px-0.5 py-3 text-center">
                          <div title={`${day.date} · ${day.status}${day.in_time ? ` · IN ${day.in_time}` : ''}${day.out_time ? ` · OUT ${day.out_time}` : ''}${day.overtime_hhmm ? ` · OT ${day.overtime_hhmm}` : ''}`}
                            className="mx-auto flex h-5 w-5 items-center justify-center rounded text-[8px] font-800"
                            style={{ background: cfg.bg, color: cfg.color }}>
                            {cfg.label}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-2xl p-4" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.12)' }}>
        <TimerReset className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" />
        <p className="text-[11px] text-sub">
          Workflow: first choose the branch mode, then build the monthly roster for each employee if the branch is roster-based, and finally use the daily manager panel to record actual clock-in and clock-out times.
        </p>
      </div>
    </div>
  );
}
