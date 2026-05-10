import axiosInstance from '@/lib/axios';

export interface AttendancePolicy {
  id: number;
  store_id: number;
  mode?: 'fixed_day_off' | 'always_on_duty' | string;
  fixed_days_off?: string[] | null;
  fixed_start_time?: string | null;
  fixed_end_time?: string | null;
  late_fee_per_minute?: number;
  overtime_rate_per_hour?: number;
  grace_period_minutes?: number;
  notes?: string | null;
  effective_from?: string;
  effective_to?: string | null;
  timezone?: string | null;
  declared_by?: number;
  // legacy compatibility
  shift_start?: string;
  shift_end?: string;
  late_grace_period?: number;
  early_exit_grace_period?: number;
  weekend_days?: string[];
}

export interface AttendanceRecord {
  id: number;
  employee_id: number;
  attendance_date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: 'present' | 'late' | 'absent' | 'leave' | 'half_day' | 'holiday_auto' | 'off_day_auto' | string;
  is_late: boolean;
  is_early_exit: boolean;
  overtime_minutes: number;
  undertime_minutes: number;
  employee?: {
    name: string;
  };
}

export interface SalesTarget {
  id: number;
  employee_id: number;
  target_amount: number;
  target_month: string;
  achieved_amount: number;
  achievement_percentage: number;
  remaining_amount?: number;
  order_count?: number;
  employee?: {
    name: string;
    employee_code?: string;
  };
}

export interface EmployeeSchedule {
  id: number;
  employee_id: number;
  store_id: number;
  start_time: string;
  end_time: string;
  effective_from: string;
  effective_to?: string | null;
  duty_mode?: 'all_days' | 'weekly_pattern' | 'selected_dates' | string;
  weekly_days?: string[] | null;
  duty_dates?: string[] | null;
  is_active?: boolean;
  notes?: string | null;
  employee?: {
    id: number;
    name: string;
    employee_code?: string;
    store_id?: number;
  };
}

const hrmService = {
  // Attendance & Policy
  async getStorePolicy(storeId: number): Promise<AttendancePolicy | null> {
    const response = await axiosInstance.get(`/hrm/attendance/policy/${storeId}`);
    return response.data.success ? response.data.data : null;
  },

  async upsertStorePolicy(data: any): Promise<any> {
    const response = await axiosInstance.post('/hrm/attendance/policy', data);
    return response.data;
  },

  async markAttendance(data: any): Promise<any> {
    let payload;

    if (Array.isArray(data)) {
      // Legacy: array of entries passed directly
      payload = {
        store_id: data[0].store_id,
        attendance_date: data[0].attendance_date,
        entries: data
      };
    } else if (data.entries && Array.isArray(data.entries)) {
      // New format: already structured { store_id, attendance_date, entries[] }
      payload = {
        store_id: data.store_id,
        attendance_date: data.attendance_date || data.date,
        entries: data.entries
      };
    } else {
      // Legacy single-entry format from old modal calls
      payload = {
        store_id: data.store_id,
        attendance_date: data.attendance_date || data.date,
        entries: [
          {
            employee_id: data.employee_id,
            status: data.status ? data.status.toLowerCase() : 'present',
            in_time: data.type === 'check_in' ? data.time : (data.in_time || undefined),
            out_time: data.type === 'check_out' ? data.time : (data.out_time || undefined),
          }
        ]
      };
    }

    // Normalize status casing in all entries
    if (payload.entries && Array.isArray(payload.entries)) {
      payload.entries = payload.entries.map((e: any) => ({
        ...e,
        status: e.status ? e.status.toLowerCase() : 'present'
      }));
    }

    const response = await axiosInstance.post('/hrm/attendance/mark', payload);
    return response.data;
  },

  async updateAttendance(id: number, data: any): Promise<any> {
    const response = await axiosInstance.put(`/hrm/attendance/${id}`, data);
    return response.data;
  },

  async getTodayAttendance(storeId?: number): Promise<AttendanceRecord[]> {
    const response = await axiosInstance.get('/hrm/attendance/report/today', { params: { store_id: storeId } });
    if (response.data.success && Array.isArray(response.data.data?.rows)) {
      // Normalize backend "rows" structure to AttendanceRecord[]
      return response.data.data.rows.map((row: any) => {
        const att = row.attendance || {};
        // Ensure status is always lowercase for internal logic
        const status = (att.status || 'not_marked').toLowerCase();

        return {
          ...att,
          employee_id: row.employee.id,
          status: status,
          // Map backend in_time/out_time to frontend clock_in/clock_out
          clock_in: att.in_time || null,
          clock_out: att.out_time || null,
        };
      });
    }
    return [];
  },

  async getAttendanceHistory(employeeId: number): Promise<AttendanceRecord[]> {
    const response = await axiosInstance.get(`/hrm/attendance/history/${employeeId}`);
    return (response.data.success && Array.isArray(response.data.data)) ? response.data.data : [];
  },

  async getAttendanceReport(params: { store_id: number; from: string; to: string; employee_ids?: number[] }): Promise<any> {
    const response = await axiosInstance.get('/hrm/attendance/report/range', { params });
    return response.data.success ? (response.data.data || {}) : {};
  },

  async getSchedules(params: { store_id: number; employee_id?: number; date?: string }): Promise<EmployeeSchedule[]> {
    const response = await axiosInstance.get('/hrm/attendance/schedules', { params });
    return (response.data.success && Array.isArray(response.data.data)) ? response.data.data : [];
  },

  async assignSchedule(data: {
    employee_id: number;
    store_id: number;
    start_time: string;
    end_time: string;
    effective_from?: string;
    effective_to?: string | null;
    duty_mode?: 'all_days' | 'weekly_pattern' | 'selected_dates';
    weekly_days?: string[];
    duty_dates?: string[];
    notes?: string;
  }): Promise<any> {
    const response = await axiosInstance.post('/hrm/attendance/schedules', data);
    return response.data;
  },

  // Sales Targets
  async getSalesTargets(params?: any): Promise<SalesTarget[]> {
    const response = await axiosInstance.get('/hrm/sales-targets', { params });
    return (response.data.success && Array.isArray(response.data.data)) ? response.data.data : [];
  },

  async setSalesTarget(data: { store_id: number; employee_id: number; target_amount: number; target_month: string }): Promise<any> {
    const response = await axiosInstance.post('/hrm/sales-targets', data);
    return response.data;
  },

  async copyLastMonthTargets(data: { store_id: number; target_month: string }): Promise<any> {
    const response = await axiosInstance.post('/hrm/sales-targets/copy-last-month', data);
    return response.data;
  },

  async getPerformanceReport(params?: any): Promise<any> {
    const response = await axiosInstance.get('/hrm/sales-targets/report', { params });
    return response.data.success ? (response.data.data || {}) : {};
  },

  // Employee Self-Service
  async getMyPerformance(): Promise<any> {
    const response = await axiosInstance.get('/hrm/my/performance');
    return response.data.success ? (response.data.data || {}) : {};
  },

  async getMyAttendance(params?: any): Promise<AttendanceRecord[]> {
    const response = await axiosInstance.get('/hrm/my/attendance', { params });
    return (response.data.success && Array.isArray(response.data.data)) ? response.data.data : [];
  },

  async getMyOvertime(): Promise<any[]> {
    const response = await axiosInstance.get('/hrm/my/overtime');
    return (response.data.success && Array.isArray(response.data.data)) ? response.data.data : [];
  },

  async getMyRewardsFines(params?: any): Promise<any[]> {
    const response = await axiosInstance.get('/hrm/my/rewards-fines', { params });
    return (response.data.success && Array.isArray(response.data.data)) ? response.data.data : [];
  },

  // Rewards & Fines
  async createRewardFine(data: { store_id: number; employee_id: number; entry_date: string; entry_type: 'reward' | 'fine'; amount: number; title: string; notes?: string }): Promise<any> {
    const response = await axiosInstance.post('/hrm/attendance/rewards-fines', data);
    return response.data;
  },

  async updateRewardFine(id: number, data: any): Promise<any> {
    const response = await axiosInstance.put(`/hrm/attendance/rewards-fines/${id}`, data);
    return response.data;
  },

  async getRewardFineReport(params: any): Promise<any> {
    const response = await axiosInstance.get('/hrm/attendance/rewards-fines/report', { params });
    const data = response.data.success ? (response.data.data || { rows: [] }) : { rows: [] };
    if (!Array.isArray(data.rows)) data.rows = [];
    return data;
  },

  async getCumulatedRewardFine(params: any): Promise<any> {
    const response = await axiosInstance.get('/hrm/attendance/rewards-fines/cumulated', { params });
    const data = response.data.success ? (response.data.data || { rows: [] }) : { rows: [] };
    if (!Array.isArray(data.rows)) data.rows = [];
    return data;
  },
  // Payroll
  async getMonthlySalarySheet(params: { store_id: number; month: string }): Promise<any> {
    const response = await axiosInstance.get('/hrm/payroll/sheet', { params });
    const data = response.data.success ? (response.data.data || { sheet: [] }) : { sheet: [] };
    if (!Array.isArray(data.sheet)) data.sheet = [];
    return data;
  },

  async payMonthlySalary(data: { employee_id: number; store_id: number; month: string }): Promise<any> {
    const response = await axiosInstance.post('/hrm/payroll/pay', data);
    return response.data;
  },
};

export default hrmService;
