'use client';

import { useState, useEffect } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import { useRouter } from 'next/navigation';
import { 
  Users, 
  Plus, 
  Search, 
  Filter, 
  Download,
  Upload,
  MoreVertical,
  Edit,
  Trash2,
  UserCheck,
  UserX,
  Building2,
  ShieldCheck,
  TrendingUp,
  Eye
} from 'lucide-react';
import employeeService, { Employee, EmployeeFilters } from '@/services/employeeService2';
import CreateEmployeeModal from '@/components/employees/CreateEmployeeModal';
import EditEmployeeModal from '@/components/employees/EditEmployeeModal';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';

export default function EmployeeManagement() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmployees, setSelectedEmployees] = useState<number[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  
  // Layout states
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { darkMode, setDarkMode } = useTheme();
  
  // Filters
  const [filters, setFilters] = useState<EmployeeFilters>({
    per_page: 15,
    page: 1,
    sort_by: 'created_at',
    sort_direction: 'desc',
  });

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
  });

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  useEffect(() => {
    fetchEmployees();
    fetchStats();
  }, [filters]);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const response = await employeeService.getEmployees(filters);
      
      if (response.success) {
        setEmployees(response.data.data);
        setCurrentPage(response.data.current_page);
        setTotalPages(response.data.last_page);
        setTotalEmployees(response.data.total);
      }
    } catch (error) {
      console.error('Failed to fetch employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await employeeService.getEmployeeStats();
      if (response.success) {
        setStats({
          total: response.data.total_employees,
          active: response.data.active_employees,
          inactive: response.data.inactive_employees,
        });
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setFilters(prev => ({ ...prev, search: query, page: 1 }));
  };

  const handleFilterChange = (key: keyof EmployeeFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
  };

  const handleSelectEmployee = (id: number) => {
    setSelectedEmployees(prev => 
      prev.includes(id) 
        ? prev.filter(empId => empId !== id)
        : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedEmployees.length === employees.length) {
      setSelectedEmployees([]);
    } else {
      setSelectedEmployees(employees.map(emp => emp.id));
    }
  };

  const handleDeleteEmployee = async (id: number) => {
    if (!confirm('Are you sure you want to deactivate this employee?')) return;
    
    try {
      await employeeService.deleteEmployee(id);
      fetchEmployees();
      fetchStats();
    } catch (error) {
      console.error('Failed to delete employee:', error);
      alert('Failed to delete employee');
    }
  };

  const handleActivateEmployee = async (id: number) => {
    try {
      await employeeService.activateEmployee(id);
      fetchEmployees();
      fetchStats();
    } catch (error) {
      console.error('Failed to activate employee:', error);
      alert('Failed to activate employee');
    }
  };

  const handleDeactivateEmployee = async (id: number) => {
    if (!confirm('Are you sure you want to deactivate this employee?')) return;
    
    try {
      await employeeService.deactivateEmployee(id);
      fetchEmployees();
      fetchStats();
    } catch (error) {
      console.error('Failed to deactivate employee:', error);
      alert('Failed to deactivate employee');
    }
  };

  const handleBulkStatusUpdate = async (isActive: boolean) => {
    if (selectedEmployees.length === 0) {
      alert('Please select employees first');
      return;
    }

    const action = isActive ? 'activate' : 'deactivate';
    if (!confirm(`Are you sure you want to ${action} ${selectedEmployees.length} employee(s)?`)) {
      return;
    }

    try {
      await employeeService.bulkUpdateStatus(selectedEmployees, isActive);
      setSelectedEmployees([]);
      fetchEmployees();
      fetchStats();
    } catch (error) {
      console.error('Failed to update employee status:', error);
      alert('Failed to update employee status');
    }
  };

  const handleViewEmployee = (employee: Employee) => {
    // Navigate to employee detail page
    router.push(`/employees/${employee.id}`);
  };

  const handleEditEmployee = (employee: Employee) => {
    setSelectedEmployee(employee);
    setShowEditModal(true);
  };

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        {/* Sidebar */}
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <Header
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          />

          {/* Page Content */}
          <main className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Employee Management
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage your team members and their information
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Employee
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Employees</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {stats.total}
              </p>
            </div>
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Active</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                {stats.active}
              </p>
            </div>
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <UserCheck className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Inactive</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                {stats.inactive}
              </p>
            </div>
            <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <UserX className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, email, code, or phone..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            />
          </div>

          {/* Filter Button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <Filter className="w-5 h-5" />
            Filters
          </button>

          {/* Export/Import Buttons */}
          <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <Download className="w-5 h-5" />
            Export
          </button>
        </div>

        {/* Extended Filters */}
        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <select
              value={filters.is_active !== undefined ? String(filters.is_active) : ''}
              onChange={(e) => handleFilterChange('is_active', e.target.value === '' ? undefined : e.target.value === 'true')}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
            >
              <option value="">All Status</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>

            <input
              type="text"
              placeholder="Department"
              value={filters.department || ''}
              onChange={(e) => handleFilterChange('department', e.target.value || undefined)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
            />

            <select
              value={filters.sort_by || 'created_at'}
              onChange={(e) => handleFilterChange('sort_by', e.target.value)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
            >
              <option value="created_at">Newest First</option>
              <option value="name">Name</option>
              <option value="email">Email</option>
              <option value="hire_date">Hire Date</option>
              <option value="salary">Salary</option>
            </select>

            <select
              value={filters.sort_direction || 'desc'}
              onChange={(e) => handleFilterChange('sort_direction', e.target.value as 'asc' | 'desc')}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </div>
        )}
      </div>

      {/* Bulk Actions */}
      {selectedEmployees.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-blue-900 dark:text-blue-100">
              {selectedEmployees.length} employee(s) selected
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleBulkStatusUpdate(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
              >
                Activate Selected
              </button>
              <button
                onClick={() => handleBulkStatusUpdate(false)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
              >
                Deactivate Selected
              </button>
              <button
                onClick={() => setSelectedEmployees([])}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm"
              >
                Clear Selection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Employee Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedEmployees.length === employees.length && employees.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Employee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Code
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Department
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Store
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    Loading employees...
                  </td>
                </tr>
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    No employees found
                  </td>
                </tr>
              ) : (
                employees.map((employee) => (
                  <tr 
                    key={employee.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedEmployees.includes(employee.id)}
                        onChange={() => handleSelectEmployee(employee.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
                          {employee.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {employee.name}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {employee.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                      {employee.employee_code}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                      {employee.department || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                      {employee.role?.title || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                      {employee.store?.name || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        employee.is_active 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {employee.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleViewEmployee(employee)}
                          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                        </button>
                        <button
                          onClick={() => handleEditEmployee(employee)}
                          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        </button>
                        {employee.is_active ? (
                          <button
                            onClick={() => handleDeactivateEmployee(employee.id)}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                            title="Deactivate"
                          >
                            <UserX className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleActivateEmployee(employee.id)}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                            title="Activate"
                          >
                            <UserCheck className="w-4 h-4 text-green-600 dark:text-green-400" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteEmployee(employee.id)}
                          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && employees.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Showing {((currentPage - 1) * (filters.per_page || 15)) + 1} to{' '}
              {Math.min(currentPage * (filters.per_page || 15), totalEmployees)} of{' '}
              {totalEmployees} employees
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setFilters(prev => ({ ...prev, page: currentPage - 1 }))}
                disabled={currentPage === 1}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Previous
              </button>
              <button
                onClick={() => setFilters(prev => ({ ...prev, page: currentPage + 1 }))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
            </div>
          </main>
        </div>
      </div>

      {/* Create Employee Modal */}
      <CreateEmployeeModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          fetchEmployees();
          fetchStats();
        }}
      />

      {/* Edit Employee Modal */}
      <EditEmployeeModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setSelectedEmployee(null);
        }}
        onSuccess={() => {
          fetchEmployees();
          fetchStats();
        }}
        employee={selectedEmployee}
      />
    </div>
  );
}