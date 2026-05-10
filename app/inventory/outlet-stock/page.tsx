'use client';

import { useState, useEffect } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import { Package, TruckIcon, CheckCircle2, AlertCircle, X } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import storeService, { Store } from '@/services/storeService';
import dispatchService, { ProductDispatch, DispatchStatistics } from '@/services/dispatchService';
import DispatchStatisticsCards from '@/components/dispatch/DispatchStatisticsCards';
import DispatchFilters from '@/components/dispatch/DispatchFilters';
import DispatchTable from '@/components/dispatch/DispatchTable';
import CreateDispatchModal from '@/components/dispatch/CreateDispatchModal';
import DispatchBarcodeScanModal from '@/components/dispatch/DispatchBarcodeScanModal';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

function parseAmount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? '').replace(/[^\d.-]/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

export default function DispatchManagementPage() {
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [store, setStore] = useState<Store | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [dispatches, setDispatches] = useState<ProductDispatch[]>([]);
  const [statistics, setStatistics] = useState<DispatchStatistics | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDispatch, setSelectedDispatch] = useState<ProductDispatch | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showBarcodeScanModal, setShowBarcodeScanModal] = useState(false);
  const [barcodeScanMode, setBarcodeScanMode] = useState<'send' | 'receive'>('receive');
  
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSourceStore, setFilterSourceStore] = useState('');
  const [filterDestStore, setFilterDestStore] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  const showToast = (message: string, type: 'success' | 'error') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, 5000);
  };

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  useEffect(() => {
    fetchStores();
    fetchDispatches();
    fetchStatistics();
  }, []);

  useEffect(() => {
    fetchDispatches();
  }, [filterStatus, filterSourceStore, filterDestStore]);

  const fetchStores = async () => {
    try {
      const response = await storeService.getStores({ is_active: true });
      const storesData = response.data.data || response.data || [];
      setStores(storesData);
    } catch (error) {
      console.error('Error fetching stores:', error);
      showToast('Failed to load stores', 'error');
    }
  };

  const fetchDispatches = async () => {
    try {
      setLoading(true);
      const filters: any = {};
      
      if (filterStatus) filters.status = filterStatus;
      if (filterSourceStore) filters.source_store_id = parseInt(filterSourceStore);
      if (filterDestStore) filters.destination_store_id = parseInt(filterDestStore);
      if (searchTerm) filters.search = searchTerm;
      
      const response = await dispatchService.getDispatches(filters);
      setDispatches(response.data.data || []);
    } catch (error) {
      console.error('Error fetching dispatches:', error);
      showToast('Failed to load dispatches', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchStatistics = async () => {
    try {
      const response = await dispatchService.getStatistics();
      setStatistics(response.data);
    } catch (error) {
      console.error('Error fetching statistics:', error);
      showToast('Failed to load statistics', 'error');
    }
  };

  const refreshSelectedDispatch = async (dispatchId?: number) => {
    const id = dispatchId ?? selectedDispatch?.id;
    if (!id) return;

    try {
      const response = await dispatchService.getDispatch(id);
      setSelectedDispatch(response.data);
    } catch (error) {
      console.error('Error refreshing dispatch details:', error);
    }
  };

  const handleCreateDispatch = async (data: any) => {
    try {
      setLoading(true);

      // Create dispatch with items and draft scans in ONE atomic call
      await dispatchService.createDispatch({
        source_store_id: typeof data.source_store_id === 'string' ? parseInt(data.source_store_id) : data.source_store_id,
        destination_store_id: typeof data.destination_store_id === 'string' ? parseInt(data.destination_store_id) : data.destination_store_id,
        expected_delivery_date: data.expected_delivery_date,
        carrier_name: data.carrier_name,
        tracking_number: data.tracking_number,
        notes: data.notes,
        items: data.items.map((item: any) => ({
          batch_id: typeof item.batch_id === 'string' ? parseInt(item.batch_id) : item.batch_id,
          quantity: typeof item.quantity === 'string' ? parseInt(item.quantity) : item.quantity,
        })),
        draft_scan_history: (data.draft_scan_history || []).map((s: any) => ({
          barcode: s.barcode,
          batch_id: typeof s.batch_id === 'string' ? parseInt(s.batch_id) : s.batch_id,
        })),
      });

      showToast('Dispatch created successfully', 'success');
      setShowCreateModal(false);
      fetchDispatches();
      fetchStatistics();
    } catch (error: any) {
      console.error('Error creating dispatch:', error);
      showToast(error.response?.data?.message || 'Failed to create dispatch', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: number) => {
    try {
      setLoading(true);
      await dispatchService.approveDispatch(id);
      showToast('Dispatch approved successfully', 'success');
      fetchDispatches();
      fetchStatistics();
    } catch (error: any) {
      console.error('Error approving dispatch:', error);
      showToast(error.response?.data?.message || 'Failed to approve dispatch', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkDispatched = async (id: number) => {
    try {
      setLoading(true);

      // Load full dispatch details (items + barcode scanning progress)
      const details = await dispatchService.getDispatch(id);
      const fullDispatch = details.data;
      const items = Array.isArray(fullDispatch?.items) ? fullDispatch.items : [];

      // Enforce mandatory barcode scanning BEFORE marking "in_transit"
      // (matches dispatch workflow documentation).
      let firstMissing: { name: string; remaining: number } | null = null;

      for (const it of items) {
        const required = Number(it?.barcode_scanning?.required_quantity ?? it?.quantity ?? 0);
        let scanned = it?.barcode_scanning?.scanned_count;

        // If backend didn't include barcode_scanning, fall back to scanned-barcodes endpoint
        if (scanned == null) {
          try {
            const r = await dispatchService.getScannedBarcodes(id, it.id);
            scanned = r?.data?.scanned_count ?? 0;
          } catch {
            scanned = 0;
          }
        }

        const remaining = Math.max(0, required - Number(scanned || 0));
        if (required > 0 && remaining > 0) {
          firstMissing = { name: it?.product?.name || 'this item', remaining };
          break;
        }
      }

      if (firstMissing) {
        showToast(
          `Cannot mark dispatched yet. Please scan ${firstMissing.remaining} more barcode(s) for ${firstMissing.name}.`,
          'error'
        );
        // Open scan modal directly in "send" mode to help staff complete scanning
        setSelectedDispatch(fullDispatch);
        setBarcodeScanMode('send');
        setShowBarcodeScanModal(true);
        return;
      }

      await dispatchService.markDispatched(id);
      showToast('Dispatch marked as in transit', 'success');
      fetchDispatches();
      fetchStatistics();
    } catch (error: any) {
      console.error('Error marking dispatch:', error);
      showToast(error.response?.data?.message || 'Failed to mark dispatch', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkDelivered = async (id: number) => {
    try {
      setLoading(true);
      // Per workflow, delivery should be completed after destination scans are done.
      // Backend should calculate received/missing/damaged based on received barcodes.
      await dispatchService.markDelivered(id);
      showToast('Dispatch marked as delivered successfully! 🎉', 'success');
      fetchDispatches();
      fetchStatistics();
    } catch (error: any) {
      console.error('Error marking delivered:', error);
      showToast(error.response?.data?.message || 'Failed to mark delivered', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (id: number) => {
    if (!confirm('Are you sure you want to cancel this dispatch?')) return;
    
    try {
      setLoading(true);
      await dispatchService.cancelDispatch(id);
      showToast('Dispatch cancelled successfully', 'success');
      fetchDispatches();
      fetchStatistics();
    } catch (error: any) {
      console.error('Error cancelling dispatch:', error);
      showToast(error.response?.data?.message || 'Failed to cancel dispatch', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (dispatch: ProductDispatch) => {
    try {
      // Fetch full dispatch details including barcode scanning progress
      const response = await dispatchService.getDispatch(dispatch.id);
      setSelectedDispatch(response.data);
      setShowDetailsModal(true);
    } catch (error) {
      console.error('Error fetching dispatch details:', error);
      showToast('Failed to load dispatch details', 'error');
    }
  };

  const handleScanBarcodes = async (dispatch: ProductDispatch, mode: 'send' | 'receive') => {
    try {
      // Fetch full dispatch details including items
      const response = await dispatchService.getDispatch(dispatch.id);
      setSelectedDispatch(response.data);
      setBarcodeScanMode(mode);
      setShowBarcodeScanModal(true);
    } catch (error) {
      console.error('Error fetching dispatch details:', error);
      showToast('Failed to load dispatch details', 'error');
    }
  };

  const handleBarcodeScanComplete = async () => {
    // Refresh table/statistics and also reload the currently open dispatch so
    // the scan modal item list and counters stay in sync in real time.
    await Promise.all([
      fetchDispatches(),
      fetchStatistics(),
      refreshSelectedDispatch(),
    ]);
  };

  const handleMarkDeliveredFromScan = async () => {
    if (!selectedDispatch) return;
    
    // Close the scan modal first
    setShowBarcodeScanModal(false);
    
    // Then mark as delivered
    await handleMarkDelivered(selectedDispatch.id);
    
    // Clear selected dispatch
    setSelectedDispatch(null);
  };

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        {/* Toast Notifications */}
        <div className="fixed top-4 right-4 z-[60] space-y-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border ${
                toast.type === 'success'
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              } animate-slideIn`}
            >
              {toast.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
              )}
              <p className={`text-sm font-medium ${
                toast.type === 'success'
                  ? 'text-green-900 dark:text-green-300'
                  : 'text-red-900 dark:text-red-300'
              }`}>
                {toast.message}
              </p>
              <button
                onClick={() => removeToast(toast.id)}
                className={`ml-2 ${
                  toast.type === 'success'
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />

        <div className="flex-1 flex flex-col overflow-hidden">
          <Header 
            darkMode={darkMode} 
            setDarkMode={setDarkMode}
            toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          />

          <main className="flex-1 overflow-auto p-6">
            {/* Statistics Cards */}
            <DispatchStatisticsCards statistics={statistics} loading={false} />

            {/* Actions */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                    Dispatch Management
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Manage inventory transfers between stores
                  </p>
                </div>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <TruckIcon className="w-4 h-4" />
                  Create Dispatch
                </button>
              </div>
            </div>

            {/* Filters */}
            <DispatchFilters
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              filterStatus={filterStatus}
              setFilterStatus={setFilterStatus}
              filterSourceStore={filterSourceStore}
              setFilterSourceStore={setFilterSourceStore}
              filterDestStore={filterDestStore}
              setFilterDestStore={setFilterDestStore}
              stores={stores}
            />

            {/* Dispatch Table */}
            <DispatchTable
              dispatches={dispatches}
              loading={loading}
              onViewDetails={handleViewDetails}
              onApprove={handleApprove}
              onMarkDispatched={handleMarkDispatched}
              onMarkDelivered={handleMarkDelivered}
              onCancel={handleCancel}
              onScanBarcodes={handleScanBarcodes}
              currentStoreId={store?.id}
            />
          </main>
        </div>
      </div>

      {/* Create Dispatch Modal */}
      <CreateDispatchModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateDispatch}
        stores={stores}
        loading={loading}
        defaultSourceStoreId={store?.id}
      />

      {/* Barcode Scan Modal */}
      {showBarcodeScanModal && selectedDispatch && (
        <DispatchBarcodeScanModal
          isOpen={showBarcodeScanModal}
          onClose={() => {
            setShowBarcodeScanModal(false);
            void refreshSelectedDispatch();
          }}
          dispatch={selectedDispatch}
          mode={barcodeScanMode}
          onComplete={handleBarcodeScanComplete}
          onMarkDelivered={handleMarkDeliveredFromScan}
        />
      )}

      {/* Details Modal */}
      {showDetailsModal && selectedDispatch && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Dispatch Details
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {selectedDispatch.dispatch_number}
                  </p>
                </div>
                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                >
                  <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Source Store
                  </h3>
                  <p className="text-gray-900 dark:text-white">
                    {selectedDispatch.source_store.name}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Destination Store
                  </h3>
                  <p className="text-gray-900 dark:text-white">
                    {selectedDispatch.destination_store.name}
                  </p>
                </div>
              </div>

              {selectedDispatch.items && selectedDispatch.items.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Items
                  </h3>
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">
                            Product
                          </th>
                          <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">
                            Batch
                          </th>
                          <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">
                            Quantity
                          </th>
                          <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">
                            Scanning Progress
                          </th>
                          <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">
                            Value
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDispatch.items.map((item, index) => (
                          <tr
                            key={index}
                            className="border-t border-gray-200 dark:border-gray-700"
                          >
                            <td className="px-4 py-2 text-gray-900 dark:text-white">
                              {item.product.name}
                            </td>
                            <td className="px-4 py-2 text-gray-600 dark:text-gray-400 font-mono text-xs">
                              {item.batch.batch_number}
                            </td>
                            <td className="px-4 py-2 text-gray-900 dark:text-white">
                              {item.quantity}
                            </td>
                            <td className="px-4 py-2">
                              {item.barcode_scanning && (
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 max-w-[100px] bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                    <div
                                      className={`h-2 rounded-full ${
                                        item.barcode_scanning.all_scanned
                                          ? 'bg-green-500'
                                          : 'bg-blue-500'
                                      }`}
                                      style={{
                                        width: `${item.barcode_scanning.progress_percentage}%`,
                                      }}
                                    />
                                  </div>
                                  <span className="text-xs text-gray-600 dark:text-gray-400">
                                    {item.barcode_scanning.scanned_count}/
                                    {item.barcode_scanning.required_quantity}
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2 text-gray-900 dark:text-white">
                              ৳{parseAmount(item.total_value).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slideIn {
          animation: slideIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}