'use client';

import { useState, useEffect } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  Building2,
  Calendar,
  DollarSign,
  Shield,
  Users,
  Activity,
  Lock,
  Edit,
  Trash2,
  UserCheck,
  UserX,
} from 'lucide-react';
import employeeService, { Employee, EmployeeHierarchy } from '@/services/employeeService2';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';

export default function EmployeeDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const employeeId = Number(id);

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [hierarchy, setHierarchy] = useState<EmployeeHierarchy | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'hierarchy' | 'sessions' | 'activity'>('overview');

  // Layout states
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { darkMode, setDarkMode } = useTheme();

  useEffect(() => {
    if (employeeId) {
      fetchEmployeeDetails();
    }
  }, [employeeId]);

  const fetchEmployeeDetails = async () => {
    setLoading(true);
    try {
      const [empResponse, hierResponse, sessResponse] = await Promise.all([
        employeeService.getEmployee(employeeId),
        employeeService.getHierarchy(employeeId),
        employeeService.getSessions(employeeId, 10),
      ]);

      if (empResponse.success) {
        setEmployee(empResponse.data);
      }

      if (hierResponse.success) {
        setHierarchy(hierResponse.data);
      }

      if (sessResponse.success) {
        setSessions(sessResponse.data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch employee details:', error);
      alert('Failed to load employee details');
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async () => {
    if (!employee) return;
    try {
      await employeeService.activateEmployee(employee.id);
      fetchEmployeeDetails();
    } catch (error) {
      console.error('Failed to activate employee:', error);
      alert('Failed to activate employee');
    }
  };

  const handleDeactivate = async () => {
    if (!employee || !confirm('Are you sure you want to deactivate this employee?')) return;
    try {
      await employeeService.deactivateEmployee(employee.id);
      fetchEmployeeDetails();
    } catch (error) {
      console.error('Failed to deactivate employee:', error);
      alert('Failed to deactivate employee');
    }
  };

  const handleDelete = async () => {
    if (!employee || !confirm('Are you sure you want to delete this employee? This action cannot be undone.')) return;
    try {
      await employeeService.deleteEmployee(employee.id);
      router.push('/employees');
    } catch (error) {
      console.error('Failed to delete employee:', error);
      alert('Failed to delete employee');
    }
  };

  if (loading) {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
          <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
          <div className="flex-1 flex flex-col overflow-hidden">
            <Header
              darkMode={darkMode}
              setDarkMode={setDarkMode}
              toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            />
            <main className="flex-1 overflow-y-auto p-6">
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500 dark:text-gray-400">Loading employee details...</p>
              </div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
          <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
          <div className="flex-1 flex flex-col overflow-hidden">
            <Header
              darkMode={darkMode}
              setDarkMode={setDarkMode}
              toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            />
            <main className="flex-1 overflow-y-auto p-6">
              <div className="text-center">
                <p className="text-gray-500 dark:text-gray-400">Employee not found</p>
                <button
                  onClick={() => router.push('/employees')}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Back to Employees
                </button>
              </div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          />
          
          <main className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => router.push('/employees')}
                  className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                >
                  <ArrowLeft className="w-5 h-5" />
                  Back to Employees
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={() => router.push(`/employees/${employee.id}/edit`)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <Edit className="w-4 h-4" />
                    Edit
                  </button>
                  {employee.is_active ? (
                    <button
                      onClick={handleDeactivate}
                      className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
                    >
                      <UserX className="w-4 h-4" />
                      Deactivate
                    </button>
                  ) : (
                    <button
                      onClick={handleActivate}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      <UserCheck className="w-4 h-4" />
                      Activate
                    </button>
                  )}
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </div>

              {/* Employee Header Card */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-start gap-6">
                  <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-3xl font-bold">
                    {employee.name.charAt(0).toUpperCase()}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        {employee.name}
                      </h1>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        employee.is_active
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {employee.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                        <Mail className="w-4 h-4" />
                        <span className="text-sm">{employee.email}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                        <Phone className="w-4 h-4" />
                        <span className="text-sm">{employee.phone || 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                        <Building2 className="w-4 h-4" />
                        <span className="text-sm">{employee.store?.name || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="flex gap-4">
                  {['overview', 'hierarchy', 'sessions', 'activity'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab as any)}
                      className={`px-4 py-2 border-b-2 font-medium text-sm capitalize ${
                        activeTab === tab
                          ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                          : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </nav>
              </div>

              {/* Tab Content */}
              {activeTab === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Basic Info */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                      Basic Information
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm text-gray-500 dark:text-gray-400">Employee Code</label>
                        <p className="text-gray-900 dark:text-white font-medium">{employee.employee_code}</p>
                      </div>
                      <div>
                        <label className="text-sm text-gray-500 dark:text-gray-400">Department</label>
                        <p className="text-gray-900 dark:text-white font-medium">{employee.department || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-sm text-gray-500 dark:text-gray-400">Role</label>
                        <p className="text-gray-900 dark:text-white font-medium">{employee.role?.title || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-sm text-gray-500 dark:text-gray-400">Hire Date</label>
                        <p className="text-gray-900 dark:text-white font-medium">
                          {employee.hire_date ? new Date(employee.hire_date).toLocaleDateString() : 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Employment Details */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                      Employment Details
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm text-gray-500 dark:text-gray-400">Salary</label>
                        <p className="text-gray-900 dark:text-white font-medium">
                          ${employee.salary?.toLocaleString() || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm text-gray-500 dark:text-gray-400">Manager</label>
                        <p className="text-gray-900 dark:text-white font-medium">
                          {employee.manager?.name || 'No Manager'}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm text-gray-500 dark:text-gray-400">Last Login</label>
                        <p className="text-gray-900 dark:text-white font-medium">
                          {employee.last_login_at
                            ? new Date(employee.last_login_at).toLocaleString()
                            : 'Never'}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm text-gray-500 dark:text-gray-400">Address</label>
                        <p className="text-gray-900 dark:text-white font-medium">{employee.address || 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'hierarchy' && hierarchy && (
                <div className="space-y-6">
                  {/* Chain of Command */}
                  {hierarchy.chain_of_command && hierarchy.chain_of_command.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        Chain of Command
                      </h3>
                      <div className="space-y-2">
                        {hierarchy.chain_of_command.map((manager, index) => (
                          <div
                            key={manager.id}
                            className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                          >
                            <span className="text-sm text-gray-500">Level {index + 1}</span>
                            <span className="font-medium text-gray-900 dark:text-white">
                              {manager.name} ({manager.employee_code})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Direct Reports */}
                  {hierarchy.direct_reports && hierarchy.direct_reports.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        Direct Reports ({hierarchy.direct_reports.length})
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {hierarchy.direct_reports.map((emp) => (
                          <div
                            key={emp.id}
                            className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                            onClick={() => router.push(`/employees/${emp.id}`)}
                          >
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
                              {emp.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">{emp.name}</p>
                              <p className="text-sm text-gray-500">{emp.employee_code}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'sessions' && (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Recent Sessions
                  </h3>
                  {sessions.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400">No sessions found</p>
                  ) : (
                    <div className="space-y-3">
                      {sessions.map((session) => (
                        <div
                          key={session.id}
                          className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                        >
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{session.ip_address}</p>
                            <p className="text-sm text-gray-500">{session.user_agent}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-gray-500">
                              {new Date(session.last_activity_at).toLocaleString()}
                            </p>
                            {session.revoked_at ? (
                              <span className="text-xs text-red-600">Revoked</span>
                            ) : (
                              <span className="text-xs text-green-600">Active</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'activity' && (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Activity Log
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400">Activity log coming soon...</p>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}