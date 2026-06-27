import axiosInstance from '@/lib/axios';

export interface Employee {
  id: string | number;
  name: string;
  email: string;
  phone: string;
  role: string;
  store_id?: number;
  is_active: boolean;
  join_date?: string;
  department?: string;
}

export interface CreateEmployeePayload {
  name: string;
  email: string;
  phone: string;
  role: string;
  store_id?: number;
  department?: string;
  salary?: number;
  join_date?: string;
}

type EmployeeListParams = {
  store_id?: number;
  role?: string;
  role_id?: number;
  is_active?: boolean;
  is_in_service?: boolean;
  department?: string;
  search?: string;
  page?: number;
  per_page?: number;
  sort_by?: string;
  sort_direction?: 'asc' | 'desc' | string;
};

const normalizeEmployeeList = (payload: any): Employee[] => {
  if (Array.isArray(payload)) return payload;
  if (payload?.data?.data && Array.isArray(payload.data.data)) return payload.data.data;
  if (payload?.data && Array.isArray(payload.data)) return payload.data;
  return [];
};

const getPaginatorMeta = (payload: any) => {
  const paginator = payload?.data?.data && Array.isArray(payload.data.data)
    ? payload.data
    : payload;

  const currentPage = Number(paginator?.current_page || 1);
  const lastPage = Number(paginator?.last_page || 1);

  return {
    currentPage: Number.isFinite(currentPage) && currentPage > 0 ? currentPage : 1,
    lastPage: Number.isFinite(lastPage) && lastPage > 0 ? lastPage : 1,
  };
};

const employeeService = {
  /**
   * Get employees.
   *
   * The backend /employees endpoint is paginated with a default per_page=15.
   * HRM branch/attendance screens need every employee in the selected branch,
   * so this method now follows all paginator pages instead of silently returning
   * only the first 15 rows.
   */
  async getAll(params?: EmployeeListParams): Promise<Employee[]> {
    try {
      const requestParams: EmployeeListParams = {
        per_page: params?.per_page || 100,
        ...params,
      };

      const firstResponse = await axiosInstance.get('/employees', { params: requestParams });
      const firstResult = firstResponse.data;
      const employees = normalizeEmployeeList(firstResult);
      const { currentPage, lastPage } = getPaginatorMeta(firstResult);

      if (lastPage <= currentPage) {
        return employees;
      }

      const remainingRequests = [];
      for (let page = currentPage + 1; page <= lastPage; page += 1) {
        remainingRequests.push(
          axiosInstance.get('/employees', {
            params: {
              ...requestParams,
              page,
            },
          })
        );
      }

      const remainingResponses = await Promise.all(remainingRequests);
      remainingResponses.forEach((response) => {
        employees.push(...normalizeEmployeeList(response.data));
      });

      // Defensive de-duplication in case a backend page changes while loading.
      const seen = new Set<string | number>();
      return employees.filter((employee) => {
        if (seen.has(employee.id)) return false;
        seen.add(employee.id);
        return true;
      });
    } catch (error: any) {
      console.error('Get employees error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch employees');
    }
  },

  /** Get single employee by ID */
  async getById(id: string | number): Promise<Employee> {
    try {
      const response = await axiosInstance.get(`/employees/${id}`);
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch employee');
      }
      
      return result.data;
    } catch (error: any) {
      console.error('Get employee error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch employee');
    }
  },

  /** Create new employee */
  async create(payload: CreateEmployeePayload): Promise<Employee> {
    try {
      const response = await axiosInstance.post('/employees', payload);
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to create employee');
      }
      
      return result.data;
    } catch (error: any) {
      console.error('Create employee error:', error);
      throw new Error(error.response?.data?.message || 'Failed to create employee');
    }
  },

  /** Update employee */
  async update(id: string | number, payload: Partial<CreateEmployeePayload>): Promise<Employee> {
    try {
      const response = await axiosInstance.put(`/employees/${id}`, payload);
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to update employee');
      }
      
      return result.data;
    } catch (error: any) {
      console.error('Update employee error:', error);
      throw new Error(error.response?.data?.message || 'Failed to update employee');
    }
  },

  /** Delete employee */
  async delete(id: string | number): Promise<void> {
    try {
      const response = await axiosInstance.delete(`/employees/${id}`);
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to delete employee');
      }
    } catch (error: any) {
      console.error('Delete employee error:', error);
      throw new Error(error.response?.data?.message || 'Failed to delete employee');
    }
  },

  /** Activate employee */
  async activate(id: string | number): Promise<Employee> {
    try {
      const response = await axiosInstance.patch(`/employees/${id}/activate`);
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to activate employee');
      }
      
      return result.data;
    } catch (error: any) {
      console.error('Activate employee error:', error);
      throw new Error(error.response?.data?.message || 'Failed to activate employee');
    }
  },

  /** Deactivate employee */
  async deactivate(id: string | number): Promise<Employee> {
    try {
      const response = await axiosInstance.patch(`/employees/${id}/deactivate`);
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to deactivate employee');
      }
      
      return result.data;
    } catch (error: any) {
      console.error('Deactivate employee error:', error);
      throw new Error(error.response?.data?.message || 'Failed to deactivate employee');
    }
  },
};

export default employeeService;