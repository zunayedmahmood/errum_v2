'use client';

import { useState, useEffect } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import {
  Plus,
  Edit2,
  Trash2,
  Power,
  DollarSign,
  Tag,
  FileText,
} from 'lucide-react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import serviceManagementService, { Service } from '@/services/serviceManagementService';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

export default function ServiceManagementPage() {
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    basePrice: 0,
    category: 'other' as Service['category'],
    isActive: true,
    allowManualPrice: true,
  });

  useEffect(() => {
    loadServices();
    serviceManagementService.initializeDefaultServices();
  }, []);

  const loadServices = async () => {
    const data = await serviceManagementService.getAllServices();
    setServices(data);
    // Keep selection in sync with current list
    setSelectedIds((prev) => prev.filter((id) => data.some((s) => s.id === id)));
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  const handleOpenModal = (service?: Service) => {
    if (service) {
      setEditingService(service);
      setFormData({
        name: service.name,
        description: service.description,
        basePrice: service.basePrice,
        category: service.category,
        isActive: service.isActive,
        allowManualPrice: service.allowManualPrice,
      });
    } else {
      setEditingService(null);
      setFormData({
        name: '',
        description: '',
        basePrice: 0,
        category: 'other',
        isActive: true,
        allowManualPrice: true,
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingService(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingService) {
        await serviceManagementService.updateService(editingService.id, formData);
        showToast('Service updated successfully', 'success');
      } else {
        await serviceManagementService.createService(formData);
        showToast('Service created successfully', 'success');
      }
      
      await loadServices();
      handleCloseModal();
    } catch (error: any) {
      const msg = error?.message || 'Error saving service';
      showToast(msg, 'error');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this service?')) return;

    try {
      await serviceManagementService.deleteService(id);
      showToast('Service deleted successfully', 'success');
      await loadServices();
    } catch (error: any) {
      const msg = error?.message || 'Error deleting service';
      showToast(msg, 'error');
    }
  };

  const handleHardDelete = async (id: number) => {
    const ok = confirm(
      'Permanently delete this service? This cannot be undone.\n\nNote: Services with existing orders cannot be force deleted.'
    );
    if (!ok) return;

    try {
      await serviceManagementService.forceDeleteService(id);
      showToast('Service permanently deleted', 'success');
      await loadServices();
    } catch (error: any) {
      const msg = error?.message || 'Error permanently deleting service';
      showToast(msg, 'error');
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (services.length === 0) return [];
      if (prev.length === services.length) return [];
      return services.map((s) => s.id);
    });
  };

  const handleBulkDelete = async (force: boolean) => {
    if (selectedIds.length === 0) return;
    const label = force ? 'PERMANENTLY delete' : 'delete';
    const ok = confirm(
      `Are you sure you want to ${label} ${selectedIds.length} service(s)?` +
        (force ? '\n\nThis cannot be undone. Services with orders will be skipped.' : '')
    );
    if (!ok) return;

    try {
      const res = await serviceManagementService.bulkDeleteServices(selectedIds, force);
      const deletedCount = res?.summary?.deleted_count ?? res?.deleted?.length ?? 0;
      const failedCount = res?.summary?.failed_count ?? res?.failed?.length ?? 0;

      if (failedCount > 0) {
        const firstFew = (res.failed || []).slice(0, 3).map((f) => `${f.name || f.id}: ${f.reason || 'Failed'}`).join('; ');
        showToast(`Deleted ${deletedCount}, failed ${failedCount}. ${firstFew}`, failedCount ? 'error' : 'success');
      } else {
        showToast(`Deleted ${deletedCount} service(s)`, 'success');
      }

      setSelectedIds([]);
      await loadServices();
    } catch (error: any) {
      const msg = error?.message || 'Bulk delete failed';
      showToast(msg, 'error');
    }
  };

  const handleToggleStatus = async (id: number) => {
    try {
      await serviceManagementService.toggleServiceStatus(id);
      showToast('Service status updated', 'success');
      await loadServices();
    } catch (error: any) {
      const msg = error?.message || 'Error updating service status';
      showToast(msg, 'error');
    }
  };

  const getCategoryBadgeColor = (category: Service['category']) => {
    const colors = {
      wash: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      repair: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      alteration: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      custom: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      other: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    };
    return colors[category] || colors.other;
  };

  return (
    <div className={`flex h-screen ${darkMode ? 'dark' : ''}`}>
      <Sidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        darkMode={darkMode}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          setSidebarOpen={setSidebarOpen}
        />

        <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-6">
          {/* Header Section */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Service Management
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Manage add-on services for POS, Social Commerce, and E-commerce
              </p>
            </div>
            <div className="flex items-center gap-2">
              {selectedIds.length > 0 && (
                <>
                  <button
                    onClick={() => handleBulkDelete(false)}
                    className="flex items-center gap-2 bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg transition-colors"
                    title="Bulk delete (soft delete)"
                  >
                    <Trash2 size={18} />
                    Delete Selected ({selectedIds.length})
                  </button>
                  <button
                    onClick={() => handleBulkDelete(true)}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
                    title="Bulk hard delete (permanent)"
                  >
                    <Trash2 size={18} />
                    Hard Delete ({selectedIds.length})
                  </button>
                </>
              )}

              <button
                onClick={() => handleOpenModal()}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                <Plus size={20} />
                Add Service
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total Services</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {services.length}
                  </p>
                </div>
                <Tag className="text-blue-600" size={32} />
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Active Services</p>
                  <p className="text-2xl font-bold text-green-600">
                    {services.filter(s => s.isActive).length}
                  </p>
                </div>
                <Power className="text-green-600" size={32} />
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Manual Pricing</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {services.filter(s => s.allowManualPrice).length}
                  </p>
                </div>
                <DollarSign className="text-purple-600" size={32} />
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Avg. Price</p>
                  <p className="text-2xl font-bold text-orange-600">
                    ৳{services.length > 0 
                      ? Math.round(services.reduce((sum, s) => sum + s.basePrice, 0) / services.length)
                      : 0}
                  </p>
                </div>
                <DollarSign className="text-orange-600" size={32} />
              </div>
            </div>
          </div>

          {/* Services Table */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      <input
                        type="checkbox"
                        checked={services.length > 0 && selectedIds.length === services.length}
                        onChange={toggleSelectAll}
                        className="h-4 w-4"
                        aria-label="Select all"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Service Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Base Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Manual Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {services.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                        <FileText className="mx-auto mb-2" size={48} />
                        <p>No services found. Click "Add Service" to create one.</p>
                      </td>
                    </tr>
                  ) : (
                    services.map((service) => (
                      <tr key={service.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(service.id)}
                            onChange={() => toggleSelect(service.id)}
                            className="h-4 w-4"
                            aria-label={`Select ${service.name}`}
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {service.name}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            {service.description}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getCategoryBadgeColor(service.category)}`}>
                            {service.category.charAt(0).toUpperCase() + service.category.slice(1)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-semibold text-gray-900 dark:text-white">
                            ৳{service.basePrice}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            service.allowManualPrice
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                          }`}>
                            {service.allowManualPrice ? 'Allowed' : 'Fixed'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => handleToggleStatus(service.id)}
                            className={`px-3 py-1 text-xs font-medium rounded-full ${
                              service.isActive
                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                            }`}
                          >
                            {service.isActive ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleOpenModal(service)}
                              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                              title="Edit"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button
                              onClick={() => handleDelete(service.id)}
                              className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                              title="Delete"
                            >
                              <Trash2 size={18} />
                            </button>
                            <button
                              onClick={() => handleHardDelete(service.id)}
                              className="px-2 py-1 rounded border border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-900/20"
                              title="Hard delete (permanent)"
                            >
                              Hard
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                {editingService ? 'Edit Service' : 'Add New Service'}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Service Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description *
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    rows={3}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Base Price (৳) *
                  </label>
                  <input
                    type="number"
                    value={formData.basePrice}
                    onChange={(e) => setFormData({ ...formData, basePrice: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    min="0"
                    step="0.01"
                    required
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Fixed for e-commerce, default for POS/Social Commerce
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Category *
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as Service['category'] })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    required
                  >
                    <option value="wash">Wash</option>
                    <option value="repair">Repair</option>
                    <option value="alteration">Alteration</option>
                    <option value="custom">Custom</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="allowManualPrice"
                    checked={formData.allowManualPrice}
                    onChange={(e) => setFormData({ ...formData, allowManualPrice: e.target.checked })}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                  />
                  <label htmlFor="allowManualPrice" className="text-sm text-gray-700 dark:text-gray-300">
                    Allow manual price adjustment in POS/Social Commerce
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                  />
                  <label htmlFor="isActive" className="text-sm text-gray-700 dark:text-gray-300">
                    Active (visible to customers)
                  </label>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                  >
                    {editingService ? 'Update' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg shadow-lg ${
              toast.type === 'success'
                ? 'bg-green-500 text-white'
                : 'bg-red-500 text-white'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
