import axiosInstance from '@/lib/axios';

// ============================================
// TYPES & INTERFACES
// ============================================

export interface Employee {
  id: number;
  name: string;
  email: string;
  employee_code: string;
  phone?: string;
  address?: string;
  department?: string;
  salary?: number;
  hire_date?: string;
  is_active: boolean;
  is_in_service: boolean;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
  store_id: number;
  role_id: number;
  manager_id?: number;
  avatar?: string;
  metadata?: any;
  
  // Relationships
  store?: Store;
  role?: Role;
  manager?: Employee;
  subordinates?: Employee[];
  sessions?: EmployeeSession[];
}

export interface Store {
  id: number;
  name: string;
  code?: string;
}

export interface Role {
  id: number;
  title: string;
  slug?: string;
}

export interface EmployeeSession {
  id: number;
  token: string;
  ip_address: string;
  user_agent: string;
  device_info?: any;
  last_activity_at: string;
  expires_at: string;
  revoked_at?: string;
  created_at: string;
}

export interface EmployeeMFA {
  id: number;
  type: 'totp' | 'sms' | 'email' | 'backup_codes';
  is_enabled: boolean;
  verified_at?: string;
  last_used_at?: string;
  secret?: string;
  settings?: any;
  backup_codes?: MFABackupCode[];
}

export interface MFABackupCode {
  id: number;
  code: string;
  used_at?: string;
  expires_at: string;
}

export interface CreateEmployeeData {
  name: string;
  email: string;
  password: string;
  store_id: number;
  role_id: number;
  phone?: string;
  address?: string;
  employee_code?: string;
  hire_date?: string;
  department?: string;
  salary?: number;
  manager_id?: number;
  is_active?: boolean;
  avatar?: string;
}

export interface UpdateEmployeeData {
  name?: string;
  email?: string;
  store_id?: number;
  role_id?: number;
  phone?: string;
  address?: string;
  employee_code?: string;
  hire_date?: string;
  department?: string;
  salary?: number;
  manager_id?: number;
  avatar?: string;
}

export interface EmployeeFilters {
  store_id?: number;
  role_id?: number;
  department?: string;
  is_active?: boolean;
  is_in_service?: boolean;
  search?: string;
  sort_by?: string;
  sort_direction?: 'asc' | 'desc';
  per_page?: number;
  page?: number;
}

export interface EmployeeStats {
  total_employees: number;
  active_employees: number;
  inactive_employees: number;
  in_service: number;
  by_department: Array<{ department: string; count: number }>;
  by_role: Array<{ role: string; count: number }>;
  recent_hires: Array<{ name: string; hire_date: string; department: string }>;
}

export interface EmployeeHierarchy {
  employee: Employee;
  chain_of_command: Array<{
    id: number;
    name: string;
    employee_code: string;
    role_id: number;
    department?: string;
  }>;
  direct_reports: Employee[];
  all_subordinates: Array<{
    id: number;
    name: string;
    employee_code: string;
    department?: string;
    role_id: number;
  }>;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: {
    current_page: number;
    data: T[];
    total: number;
    per_page: number;
    last_page: number;
  };
}

// ============================================
// EMPLOYEE SERVICE
// ============================================

class EmployeeService {
  
  // ==================== CRUD Operations ====================
  
  /**
   * Get all employees with filters
   */
  async getEmployees(filters?: EmployeeFilters): Promise<PaginatedResponse<Employee>> {
    const params = new URLSearchParams();
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, String(value));
        }
      });
    }
    
    const response = await axiosInstance.get<PaginatedResponse<Employee>>(
      `/employees?${params.toString()}`
    );
    return response.data;
  }

  /**
   * Get single employee by ID
   */
  async getEmployee(id: number): Promise<ApiResponse<Employee>> {
    const response = await axiosInstance.get<ApiResponse<Employee>>(`/employees/${id}`);
    return response.data;
  }

  /**
   * Create new employee
   */
  async createEmployee(data: CreateEmployeeData): Promise<ApiResponse<Employee>> {
    const response = await axiosInstance.post<ApiResponse<Employee>>('/employees', data);
    return response.data;
  }

  /**
   * Update employee
   */
  async updateEmployee(id: number, data: UpdateEmployeeData): Promise<ApiResponse<Employee>> {
    const response = await axiosInstance.put<ApiResponse<Employee>>(`/employees/${id}`, data);
    return response.data;
  }

  /**
   * Delete/Deactivate employee
   */
  async deleteEmployee(id: number): Promise<ApiResponse<null>> {
    const response = await axiosInstance.delete<ApiResponse<null>>(`/employees/${id}`);
    return response.data;
  }

  // ==================== Employee Management Actions ====================

  /**
   * Change employee role
   */
  async changeRole(id: number, roleId: number): Promise<ApiResponse<Employee>> {
    const response = await axiosInstance.patch<ApiResponse<Employee>>(
      `/employees/${id}/role`,
      { role_id: roleId }
    );
    return response.data;
  }

  /**
   * Transfer employee to another store
   */
  async transferEmployee(id: number, newStoreId: number): Promise<ApiResponse<Employee>> {
    const response = await axiosInstance.patch<ApiResponse<Employee>>(
      `/employees/${id}/transfer`,
      { new_store_id: newStoreId }
    );
    return response.data;
  }

  /**
   * Activate employee
   */
  async activateEmployee(id: number): Promise<ApiResponse<Employee>> {
    const response = await axiosInstance.patch<ApiResponse<Employee>>(
      `/employees/${id}/activate`
    );
    return response.data;
  }

  /**
   * Deactivate employee
   */
  async deactivateEmployee(id: number): Promise<ApiResponse<null>> {
    const response = await axiosInstance.patch<ApiResponse<null>>(
      `/employees/${id}/deactivate`
    );
    return response.data;
  }

  /**
   * Change password
   */
  async changePassword(
    id: number,
    currentPassword: string,
    newPassword: string,
    newPasswordConfirmation: string
  ): Promise<ApiResponse<null>> {
    const response = await axiosInstance.patch<ApiResponse<null>>(
      `/employees/${id}/password`,
      {
        current_password: currentPassword,
        new_password: newPassword,
        new_password_confirmation: newPasswordConfirmation,
      }
    );
    return response.data;
  }

  /**
   * Admin-only password reset by employee email
   */
  async resetPasswordByEmail(
    email: string,
    newPassword: string,
    newPasswordConfirmation: string
  ): Promise<ApiResponse<{ employee_id: number; name: string; email: string }>> {
    const response = await axiosInstance.patch<ApiResponse<{ employee_id: number; name: string; email: string }>>(
      '/employees/password/by-email',
      {
        email,
        new_password: newPassword,
        new_password_confirmation: newPasswordConfirmation,
      }
    );
    return response.data;
  }

  /**
   * Update salary
   */
  async updateSalary(
    id: number,
    salary: number,
    effectiveDate?: string,
    reason?: string
  ): Promise<ApiResponse<{ old_salary: number; new_salary: number; employee: Employee }>> {
    const response = await axiosInstance.patch(
      `/employees/${id}/salary`,
      {
        salary,
        effective_date: effectiveDate,
        reason,
      }
    );
    return response.data;
  }

  // ==================== Manager & Hierarchy ====================

  /**
   * Get employee subordinates
   */
  async getSubordinates(id: number): Promise<ApiResponse<Employee[]>> {
    const response = await axiosInstance.get<ApiResponse<Employee[]>>(
      `/employees/${id}/subordinates`
    );
    return response.data;
  }

  /**
   * Get employee hierarchy
   */
  async getHierarchy(id: number): Promise<ApiResponse<EmployeeHierarchy>> {
    const response = await axiosInstance.get<ApiResponse<EmployeeHierarchy>>(
      `/employees/${id}/hierarchy`
    );
    return response.data;
  }

  /**
   * Assign manager to employee
   */
  async assignManager(id: number, managerId: number): Promise<ApiResponse<Employee>> {
    const response = await axiosInstance.post<ApiResponse<Employee>>(
      `/employees/${id}/assign-manager`,
      { manager_id: managerId }
    );
    return response.data;
  }

  /**
   * Remove manager from employee
   */
  async removeManager(id: number): Promise<ApiResponse<Employee>> {
    const response = await axiosInstance.delete<ApiResponse<Employee>>(
      `/employees/${id}/remove-manager`
    );
    return response.data;
  }

  /**
   * Get employees by manager
   */
  async getEmployeesByManager(managerId: number): Promise<ApiResponse<Employee[]>> {
    const response = await axiosInstance.get<ApiResponse<Employee[]>>(
      `/employees/by-manager/${managerId}`
    );
    return response.data;
  }

  // ==================== Filtering & Stats ====================

  /**
   * Get employees by store
   */
  async getEmployeesByStore(storeId: number): Promise<ApiResponse<Employee[]>> {
    const response = await axiosInstance.get<ApiResponse<Employee[]>>(
      `/employees/by-store/${storeId}`
    );
    return response.data;
  }

  /**
   * Get employees by role
   */
  async getEmployeesByRole(roleId: number): Promise<ApiResponse<Employee[]>> {
    const response = await axiosInstance.get<ApiResponse<Employee[]>>(
      `/employees/by-role/${roleId}`
    );
    return response.data;
  }

  /**
   * Get employees by department
   */
  async getEmployeesByDepartment(department: string): Promise<ApiResponse<Employee[]>> {
    const response = await axiosInstance.get<ApiResponse<Employee[]>>(
      `/employees/by-department/${department}`
    );
    return response.data;
  }

  /**
   * Get employee statistics
   */
  async getEmployeeStats(params?: { store_id?: number }): Promise<ApiResponse<EmployeeStats>> {
    const response = await axiosInstance.get<ApiResponse<EmployeeStats>>('/employees/stats', { params });
    return response.data;
  }

  // ==================== Session Management ====================

  /**
   * Get employee sessions
   */
  async getSessions(id: number, perPage: number = 15): Promise<any> {
    const response = await axiosInstance.get(
      `/employees/${id}/sessions?per_page=${perPage}`
    );
    return response.data;
  }

  /**
   * Revoke specific session
   */
  async revokeSession(id: number, sessionId: number): Promise<ApiResponse<null>> {
    const response = await axiosInstance.delete<ApiResponse<null>>(
      `/employees/${id}/sessions/${sessionId}`
    );
    return response.data;
  }

  /**
   * Revoke all sessions
   */
  async revokeAllSessions(id: number): Promise<ApiResponse<null>> {
    const response = await axiosInstance.delete<ApiResponse<null>>(
      `/employees/${id}/sessions/revoke-all`
    );
    return response.data;
  }

  // ==================== MFA Management ====================

  /**
   * Get MFA settings
   */
  async getMFASettings(id: number): Promise<ApiResponse<EmployeeMFA[]>> {
    const response = await axiosInstance.get<ApiResponse<EmployeeMFA[]>>(
      `/employees/${id}/mfa`
    );
    return response.data;
  }

  /**
   * Enable MFA
   */
  async enableMFA(
    id: number,
    type: 'totp' | 'sms' | 'email' | 'backup_codes',
    secret?: string,
    settings?: any,
    generateBackupCodes: boolean = true
  ): Promise<ApiResponse<EmployeeMFA>> {
    const response = await axiosInstance.post<ApiResponse<EmployeeMFA>>(
      `/employees/${id}/mfa/enable`,
      {
        type,
        secret,
        settings,
        generate_backup_codes: generateBackupCodes,
      }
    );
    return response.data;
  }

  /**
   * Disable MFA
   */
  async disableMFA(id: number, mfaId: number): Promise<ApiResponse<null>> {
    const response = await axiosInstance.delete<ApiResponse<null>>(
      `/employees/${id}/mfa/${mfaId}/disable`
    );
    return response.data;
  }

  /**
   * Regenerate backup codes
   */
  async regenerateBackupCodes(id: number, mfaId: number): Promise<ApiResponse<MFABackupCode[]>> {
    const response = await axiosInstance.post<ApiResponse<MFABackupCode[]>>(
      `/employees/${id}/mfa/${mfaId}/backup-codes/regenerate`
    );
    return response.data;
  }

  // ==================== Activity & Logs ====================

  /**
   * Get activity log
   */
  async getActivityLog(id: number): Promise<any> {
    const response = await axiosInstance.get(`/employees/${id}/activity-log`);
    return response.data;
  }

  // ==================== Bulk Operations ====================



  /**
   * Bulk assign selected employees to one branch/outlet.
   * Used by Employee Management to fix branch ownership/data tracking without editing employees one by one.
   */
  async bulkAssignStore(employeeIds: number[], storeId: number): Promise<ApiResponse<{ updated_count: number }>> {
    const response = await axiosInstance.patch<ApiResponse<{ updated_count: number }>>(
      '/employees/bulk/store',
      {
        employee_ids: employeeIds,
        store_id: storeId,
      }
    );
    return response.data;
  }

  /**
   * Bulk update employee status
   */
  async bulkUpdateStatus(
    employeeIds: number[],
    isActive: boolean,
    isInService?: boolean
  ): Promise<ApiResponse<null>> {
    const response = await axiosInstance.patch<ApiResponse<null>>(
      '/employees/bulk/status',
      {
        employee_ids: employeeIds,
        is_active: isActive,
        is_in_service: isInService ?? isActive,
      }
    );
    return response.data;
  }
}

export default new EmployeeService();