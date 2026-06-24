'use client';

import { useState, useEffect } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import { Search, Barcode, User, Package, Trash2, ShoppingCart, AlertCircle, StoreIcon, ChevronDown, ChevronUp, Calendar, MapPin, Image as ImageIcon, Truck } from 'lucide-react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import SellDefectModal from '@/components/SellDefectModal';
import ReturnToVendorModal from '@/components/ReturnToVendorModal';
import Toast from '@/components/Toast';
import defectIntegrationService from '@/services/defectIntegrationService';
import storeService from '@/services/storeService';
import defectiveProductService from '@/services/defectiveProductService';
import type { DefectiveProduct } from '@/services/defectiveProductService';
import type { Store } from '@/services/storeService';

interface DefectItem {
  id: string;
  barcode: string;
  productId: number;
  productName: string;
  status: 'pending' | 'approved' | 'sold' | 'returned_to_vendor';
  addedBy: string;
  addedAt: string;
  originalOrderId?: number;
  customerPhone?: string;
  sellingPrice?: number;
  originalSellingPrice?: number;
  costPrice?: number;
  returnReason?: string;
  store?: string;
  image?: string;
  batchId?: number;
}

const formatPrice = (price: number | undefined | null): string => {
  if (price === undefined || price === null) return '0.00';
  const numPrice = typeof price === 'string' ? parseFloat(price) : Number(price);
  if (isNaN(numPrice)) return '0.00';
  return numPrice.toFixed(2);
};

export default function DefectsPage() {
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [defects, setDefects] = useState<DefectItem[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>('all');
  const [expandedDefect, setExpandedDefect] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'defects' | 'used'>('all');
  
  // Defect Identification
  const [barcodeInput, setBarcodeInput] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [isUsedItem, setIsUsedItem] = useState(false);
  const [isDefect, setIsDefect] = useState(false);
  const [storeForDefect, setStoreForDefect] = useState('');
  const [scannedProduct, setScannedProduct] = useState<any>(null);
  const [defectImage, setDefectImage] = useState<File | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  
  // Toast state
  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
  }>({
    show: false,
    message: '',
    type: 'success',
  });
  
  // Sell modal
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [selectedDefect, setSelectedDefect] = useState<DefectItem | null>(null);
  const [sellPrice, setSellPrice] = useState('');
  const [sellType, setSellType] = useState<'pos' | 'social'>('pos');
  
  // Vendor return
  const [returnToVendorModalOpen, setReturnToVendorModalOpen] = useState(false);
  const [selectedDefectsForVendor, setSelectedDefectsForVendor] = useState<string[]>([]);

  useEffect(() => {
    fetchStores();
    fetchDefects();
  }, []);

  useEffect(() => {
    fetchDefects();
  }, [selectedStore]);

  const fetchStores = async () => {
    try {
      const result = await storeService.getStores({ is_active: true });
      if (result.success) {
        const storesData = Array.isArray(result.data) 
          ? result.data 
          : (result.data?.data || []);
        setStores(storesData);
      }
    } catch (error) {
      console.error('Error fetching stores:', error);
    }
  };

  const fetchDefects = async () => {
    try {
      const filters: any = {};
      if (selectedStore !== 'all') {
        filters.store_id = parseInt(selectedStore);
      }
      
      const result = await defectIntegrationService.getDefectiveProducts(filters);
      
      const defectiveData = result.data?.data || result.data || [];
      
      const transformedDefects: DefectItem[] = defectiveData.map((d: DefectiveProduct) => {
        let imageUrl: string | undefined = undefined;
        
        if (d.defect_images && Array.isArray(d.defect_images) && d.defect_images.length > 0) {
          const imagePath = d.defect_images[0];
          
          if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
            imageUrl = imagePath;
          } else {
            const cleanPath = imagePath.replace(/^\/+/, '');
            let apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
            apiUrl = apiUrl.replace(/\/api\/?$/, '');
            
            if (apiUrl) {
              imageUrl = `${apiUrl}/storage/${cleanPath}`;
            } else {
              imageUrl = `/storage/${cleanPath}`;
            }
          }
        }

        const parsePrice = (value: any): number | undefined => {
          if (value === null || value === undefined) return undefined;
          const parsed = typeof value === 'string' ? parseFloat(value) : Number(value);
          return isNaN(parsed) ? undefined : parsed;
        };

        let mappedStatus: 'pending' | 'approved' | 'sold' | 'returned_to_vendor';
        if (d.status === 'available_for_sale') {
          mappedStatus = 'approved';
        } else if (d.status === 'sold') {
          mappedStatus = 'sold';
        } else if (d.status === 'returned_to_vendor') {
          mappedStatus = 'returned_to_vendor';
        } else if (d.status === 'identified' || d.status === 'inspected') {
          mappedStatus = 'pending';
        } else {
          mappedStatus = 'pending';
        }

        return {
          id: d.id.toString(),
          barcode: d.barcode?.barcode || '',
          productId: d.product_id,
          productName: d.product?.name || 'Unknown Product',
          status: mappedStatus,
          addedBy: d.identifiedBy?.name || 'System',
          addedAt: d.identified_at,
          originalSellingPrice: parsePrice(d.original_price),
          costPrice: parsePrice(d.product?.cost_price),
          returnReason: d.defect_description,
          store: d.store?.name,
          image: imageUrl,
          sellingPrice: parsePrice(d.suggested_selling_price),
          batchId: d.product_batch_id,
        };
      });
      
      setDefects(transformedDefects);
    } catch (error: any) {
      console.error('Error fetching defects:', error);
      setErrorMessage(error.message || 'Failed to fetch defects');
      setTimeout(() => setErrorMessage(''), 5000);
    }
  };

  const handleBarcodeCheck = async (value: string) => {
    setBarcodeInput(value);
    if (value.trim().length > 3) {
      try {
        const scanResult = await defectIntegrationService.scanBarcode(value);
        setScannedProduct(scanResult);
      } catch (error) {
        setScannedProduct(null);
      }
    } else {
      setScannedProduct(null);
    }
  };

  const handleDefectImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setDefectImage(e.target.files[0]);
    }
  };

  const handleMarkAsDefective = async () => {
    if (!barcodeInput.trim()) {
      alert('Please enter barcode');
      return;
    }

    if (!isDefect && !isUsedItem) {
      alert('Please select at least one: Defect or Used Item');
      return;
    }

    if (isDefect && !returnReason) {
      alert('Please enter defect reason');
      return;
    }

    if (!storeForDefect) {
      alert('Please select the store location');
      return;
    }

    setLoading(true);
    try {
      // Build description based on selections
      let description = '';
      if (isDefect && isUsedItem) {
        description = `DEFECT + USED_ITEM - ${returnReason}`;
      } else if (isUsedItem) {
        description = 'USED_ITEM - Product has been used';
      } else if (isDefect) {
        description = `DEFECT - ${returnReason}`;
      } else {
        description = returnReason;
      }

      await defectIntegrationService.markAsDefective({
        barcode: barcodeInput,
        store_id: parseInt(storeForDefect),
        defect_type: isDefect ? 'physical_damage' : 'other',
        defect_description: description,
        severity: isDefect ? 'moderate' : 'minor',
        is_used_item: isUsedItem,
        defect_images: defectImage ? [defectImage] : undefined,
        internal_notes: `Identified by employee at store ${storeForDefect}`,
      });

      const statusText = isDefect && isUsedItem ? 'defective and used' : 
                        isDefect ? 'defective' : 'used';
      setSuccessMessage(`Item marked as ${statusText} successfully!`);
      
      setBarcodeInput('');
      setReturnReason('');
      setIsUsedItem(false);
      setIsDefect(false);
      setStoreForDefect('');
      setScannedProduct(null);
      setDefectImage(null);
      fetchDefects();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error: any) {
      console.error('Error:', error);
      alert(error.message || 'Error processing item');
    } finally {
      setLoading(false);
    }
  };

  const handleSellClick = async (defect: DefectItem) => {
    setLoading(true);
    
    try {
      const fullDetails = await defectIntegrationService.getDefectiveById(defect.id);
      
      if (!fullDetails.product_batch_id) {
        throw new Error('Missing batch_id - cannot proceed with sale');
      }
      
      let currentStatus = fullDetails.status;
      
      if (currentStatus === 'identified') {
        await defectIntegrationService.inspectDefect(defect.id, {
          severity: fullDetails.severity || 'moderate',
          internal_notes: 'Auto-inspected for sale preparation',
        });
        
        setSuccessMessage('Product inspected');
        currentStatus = 'inspected';
      }
      
      if (currentStatus === 'inspected') {
        await defectIntegrationService.makeAvailableForSale(defect.id);
        setSuccessMessage('Product ready for sale');
        currentStatus = 'available_for_sale';
      } else if (currentStatus === 'sold') {
        throw new Error('This product has already been sold');
      } else if (currentStatus !== 'available_for_sale') {
        throw new Error(`Cannot sell product with status: ${currentStatus}`);
      }
      
      setSelectedDefect({
        ...defect,
        batchId: fullDetails.product_batch_id,
      });
      
      const suggestedPrice = fullDetails.suggested_selling_price?.toString() || 
                            defect.sellingPrice?.toString() || 
                            '0';
      
      setSellPrice(suggestedPrice);
      setSellType('pos');
      setSellModalOpen(true);
      
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 
                          error.message || 
                          'Unknown error occurred';
      
      setErrorMessage(`Failed: ${errorMessage}`);
      
    } finally {
      setLoading(false);
    }
  };

  const handleSell = async () => {
    if (!selectedDefect || !sellPrice) {
      alert('Please enter selling price');
      return;
    }

    setLoading(true);
    try {
      const defectData = {
        id: selectedDefect.id,
        barcode: selectedDefect.barcode,
        productId: selectedDefect.productId,
        productName: selectedDefect.productName,
        sellingPrice: parseFloat(sellPrice),
        store: selectedDefect.store,
        batchId: selectedDefect.batchId,
      };

      if (!defectData.batchId) {
        alert('Error: Missing batch information. Please try again.');
        setLoading(false);
        return;
      }
      
      sessionStorage.setItem('defectItem', JSON.stringify(defectData));

      const url = sellType === 'pos'
        ? `/pos?defect=${selectedDefect.id}`
        : `/social-commerce?defect=${selectedDefect.id}`;
      
      setSellModalOpen(false);
      
      setTimeout(() => {
        window.location.href = url;
      }, 100);
      
    } catch (error: any) {
      console.error('Error:', error);
      alert(error.message || 'Error processing sale');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (defectId: string) => {
    if (!confirm('Are you sure you want to remove this item?')) return;

    try {
      await defectiveProductService.dispose(parseInt(defectId), {
        disposal_notes: 'Removed by employee',
      });
      
      fetchDefects();
      setSuccessMessage('Item removed successfully');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error: any) {
      console.error('Error removing item:', error);
      alert(error.message || 'Error removing item');
    }
  };

  const toggleDefectSelection = (defectId: string) => {
    setSelectedDefectsForVendor(prev =>
      prev.includes(defectId)
        ? prev.filter(id => id !== defectId)
        : [...prev, defectId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedDefectsForVendor.length === pendingDefects.length) {
      setSelectedDefectsForVendor([]);
    } else {
      setSelectedDefectsForVendor(pendingDefects.map(d => d.id));
    }
  };

  const handleReturnToVendor = async (vendorId: number, notes: string) => {
    if (selectedDefectsForVendor.length === 0) {
      alert('Please select items to return');
      return;
    }

    setLoading(true);
    try {
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const defectId of selectedDefectsForVendor) {
        try {
          await defectiveProductService.returnToVendor(parseInt(defectId), {
            vendor_id: vendorId,
            vendor_notes: notes,
          });
          successCount++;
        } catch (error: any) {
          errorCount++;
          const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
          errors.push(`Item ${defectId}: ${errorMsg}`);
        }
      }

      if (successCount > 0) {
        const successMsg = errorCount === 0
          ? `Successfully returned ${successCount} item${successCount > 1 ? 's' : ''} to vendor!`
          : `Returned ${successCount} item${successCount > 1 ? 's' : ''} to vendor. ${errorCount} failed.`;
        
        setToast({
          show: true,
          message: successMsg,
          type: errorCount === 0 ? 'success' : 'warning',
        });
        
        await fetchDefects();
        setSelectedDefectsForVendor([]);
        setReturnToVendorModalOpen(false);
      }

      if (errorCount > 0 && successCount === 0) {
        const errorMessage = errors.join('\n');
        setToast({
          show: true,
          message: `Failed to return ${errorCount} item${errorCount > 1 ? 's' : ''}`,
          type: 'error',
        });
        setErrorMessage(errorMessage);
        setTimeout(() => setErrorMessage(''), 8000);
      }

    } catch (error: any) {
      console.error('Bulk return error:', error);
      setToast({
        show: true,
        message: error.message || 'Failed to process returns',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleDefectDetails = (defectId: string) => {
    setExpandedDefect(expandedDefect === defectId ? null : defectId);
  };

  const pendingDefects = defects.filter(d => {
    const isPending = d.status === 'pending' || d.status === 'approved';
    if (!isPending) return false;
    
    if (filterType === 'all') return true;
    
    const hasUsedTag = d.returnReason?.includes('USED_ITEM');
    // An item is a defect if:
    // 1. It has "DEFECT" tag in description, OR
    // 2. It has a description that's not just "USED_ITEM", OR  
    // 3. It doesn't have USED_ITEM tag and has some description
    const hasDefectTag = d.returnReason?.includes('DEFECT') || 
                         (d.returnReason && !d.returnReason.startsWith('USED_ITEM') && d.returnReason.trim().length > 0);
    
    if (filterType === 'used') return hasUsedTag;
    if (filterType === 'defects') return hasDefectTag;
    
    return true;
  });
  
  const soldDefects = defects.filter(d => d.status === 'sold');
  const returnedDefects = defects.filter(d => d.status === 'returned_to_vendor');

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

          <main className="flex-1 overflow-auto p-6">
            <div className="max-w-7xl mx-auto">
              {/* Header */}
              <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                  Extra Items Management
                </h1>
                <p className="text-gray-600 dark:text-gray-400">
                  Manage defective and used items
                </p>
              </div>

              {/* Success Message */}
              {successMessage && (
                <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <p className="text-green-800 dark:text-green-300">{successMessage}</p>
                </div>
              )}

              {/* Error Message */}
              {errorMessage && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  <p className="text-red-800 dark:text-red-300 whitespace-pre-line">{errorMessage}</p>
                </div>
              )}

              {/* Store Selection */}
              <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <StoreIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">Store Selection</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Select store to view items • Barcode scanning auto-detects store
                      </p>
                    </div>
                  </div>
                  <select
                    value={selectedStore}
                    onChange={(e) => setSelectedStore(e.target.value)}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="all">View all stores</option>
                    {stores.map(store => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Panel - Form */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Barcode className="w-5 h-5" />
                    Scan Barcode
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Barcode Scanner / Manual Entry
                      </label>
                      <input
                        type="text"
                        value={barcodeInput}
                        onChange={(e) => handleBarcodeCheck(e.target.value)}
                        placeholder="Scan or enter barcode..."
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                      {scannedProduct && (
                        <div className="mt-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded">
                          <p className="text-sm font-medium text-green-800 dark:text-green-300">
                            {scannedProduct.product?.name}
                          </p>
                          <p className="text-xs text-green-700 dark:text-green-400">
                            Available: {scannedProduct.is_available ? 'Yes' : 'No'} • 
                            Location: {scannedProduct.current_location?.name || 'N/A'}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Checkboxes */}
                    <div className="space-y-3">
                      <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
                        <input
                          type="checkbox"
                          id="isDefect"
                          checked={isDefect}
                          onChange={(e) => setIsDefect(e.target.checked)}
                          className="mt-0.5 w-4 h-4"
                        />
                        <label htmlFor="isDefect" className="flex-1 cursor-pointer">
                          <div className="text-sm font-medium text-red-900 dark:text-red-300">
                            Mark as Defective
                          </div>
                          <div className="text-xs text-red-700 dark:text-red-400 mt-0.5">
                            Check this if the item is defective or damaged
                          </div>
                        </label>
                      </div>

                      <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                        <input
                          type="checkbox"
                          id="isUsed"
                          checked={isUsedItem}
                          onChange={(e) => setIsUsedItem(e.target.checked)}
                          className="mt-0.5 w-4 h-4"
                        />
                        <label htmlFor="isUsed" className="flex-1 cursor-pointer">
                          <div className="text-sm font-medium text-blue-900 dark:text-blue-300">
                            Mark as Used Item
                          </div>
                          <div className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                            Check this if the item has been used
                          </div>
                        </label>
                      </div>
                    </div>

                    {isDefect && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Defect Reason <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          value={returnReason}
                          onChange={(e) => setReturnReason(e.target.value)}
                          placeholder="Enter defect reason..."
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Item Image {isDefect && <span className="text-xs text-gray-500">(Optional)</span>}
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleDefectImageChange}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-gray-50 file:text-gray-700 hover:file:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Store Location <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={storeForDefect}
                        onChange={(e) => setStoreForDefect(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">Select store...</option>
                        {stores.map(store => (
                          <option key={store.id} value={store.id}>
                            {store.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      onClick={handleMarkAsDefective}
                      disabled={loading}
                      className="w-full py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white rounded-md transition-colors"
                    >
                      {loading ? 'Processing...' : 'Submit'}
                    </button>
                  </div>
                </div>

                {/* Right Panel - Items List */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Pending Items */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          Extra Items ({pendingDefects.length})
                        </h3>
                        <div className="flex items-center gap-2">
                          {selectedDefectsForVendor.length > 0 && (
                            <button
                              onClick={() => setReturnToVendorModalOpen(true)}
                              className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-md text-sm font-medium flex items-center gap-2 transition-colors"
                            >
                              <Truck className="w-4 h-4" />
                              Return to Vendor ({selectedDefectsForVendor.length})
                            </button>
                          )}
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {selectedStore === 'all' ? 'All stores' : stores.find(s => s.id.toString() === selectedStore)?.name}
                          </span>
                        </div>
                      </div>
                      
                      {/* Filter Buttons */}
                      <div className="flex items-center justify-between">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setFilterType('all')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                              filterType === 'all'
                                ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                                : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                          >
                            All
                          </button>
                          <button
                            onClick={() => setFilterType('defects')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                              filterType === 'defects'
                                ? 'bg-red-600 text-white'
                                : 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/30'
                            }`}
                          >
                            Defects
                          </button>
                          <button
                            onClick={() => setFilterType('used')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                              filterType === 'used'
                                ? 'bg-blue-600 text-white'
                                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/30'
                            }`}
                          >
                            Used
                          </button>
                        </div>
                        
                        {pendingDefects.length > 0 && (
                          <button
                            onClick={toggleSelectAll}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                          >
                            {selectedDefectsForVendor.length === pendingDefects.length ? 'Deselect All' : 'Select All'}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                      {pendingDefects.length === 0 ? (
                        <div className="p-8 text-center">
                          <Package className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                          <p className="text-gray-500 dark:text-gray-400">No extra items found</p>
                        </div>
                      ) : (
                        pendingDefects.map((defect) => {
                          const hasUsedTag = defect.returnReason?.includes('USED_ITEM');
                          const hasDefectTag = defect.returnReason?.includes('DEFECT') || 
                                              (defect.returnReason && !defect.returnReason.startsWith('USED_ITEM') && defect.returnReason.trim().length > 0);
                          const isBoth = hasDefectTag && hasUsedTag;

                          return (
                            <div key={defect.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                              <div className="px-4 py-3">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex items-start gap-3 flex-1 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={selectedDefectsForVendor.includes(defect.id)}
                                      onChange={() => toggleDefectSelection(defect.id)}
                                      className="mt-1 w-4 h-4 text-orange-600 rounded focus:ring-orange-500"
                                    />
                                    
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        <h4 className="font-medium text-gray-900 dark:text-white text-sm truncate">
                                          {defect.productName}
                                        </h4>
                                        {isBoth ? (
                                          <>
                                            <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs rounded font-medium">
                                              Defect
                                            </span>
                                            <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs rounded font-medium">
                                              Used
                                            </span>
                                          </>
                                        ) : hasUsedTag ? (
                                          <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs rounded font-medium">
                                            Used
                                          </span>
                                        ) : hasDefectTag ? (
                                          <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs rounded">
                                            Defect
                                          </span>
                                        ) : null}
                                      </div>
                                      
                                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
                                        <span className="flex items-center gap-1">
                                          <Barcode className="w-3 h-3" />
                                          {defect.barcode}
                                        </span>
                                        <span className="flex items-center gap-1">
                                          <MapPin className="w-3 h-3" />
                                          {defect.store || 'N/A'}
                                        </span>
                                        <span className="flex items-center gap-1">
                                          <Calendar className="w-3 h-3" />
                                          {new Date(defect.addedAt).toLocaleDateString()}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => toggleDefectDetails(defect.id)}
                                      className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors"
                                    >
                                      {expandedDefect === defect.id ? (
                                        <ChevronUp className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                                      ) : (
                                        <ChevronDown className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                                      )}
                                    </button>
                                    <button
                                      onClick={() => {
                                        setSelectedDefectsForVendor([defect.id]);
                                        setReturnToVendorModalOpen(true);
                                      }}
                                      className="p-1.5 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded transition-colors"
                                      title="Return to Vendor"
                                    >
                                      <Truck className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => handleSellClick(defect)}
                                      className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
                                      title="Sell"
                                    >
                                      <ShoppingCart className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => handleRemove(defect.id)}
                                      className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                      title="Remove"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {expandedDefect === defect.id && (
                                <div className="px-4 pb-4 pt-2 bg-gray-50 dark:bg-gray-900/50">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {defect.image ? (
                                      <div className="space-y-2">
                                        <h5 className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
                                          <ImageIcon className="w-3 h-3" />
                                          Item Image
                                        </h5>
                                        <div className="relative aspect-video bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden">
                                          <img
                                            src={defect.image}
                                            alt="Item"
                                            className="w-full h-full object-cover"
                                          />
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex items-center justify-center aspect-video bg-gray-200 dark:bg-gray-700 rounded-lg">
                                        <div className="text-center">
                                          <ImageIcon className="w-8 h-8 mx-auto mb-1 text-gray-400" />
                                          <p className="text-xs text-gray-500">No image</p>
                                        </div>
                                      </div>
                                    )}

                                    <div className="space-y-3">
                                      <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div>
                                          <p className="text-gray-500 dark:text-gray-400 mb-0.5">Product ID</p>
                                          <p className="text-gray-900 dark:text-white font-medium">#{defect.productId}</p>
                                        </div>
                                        <div>
                                          <p className="text-gray-500 dark:text-gray-400 mb-0.5">Added By</p>
                                          <p className="text-gray-900 dark:text-white font-medium">{defect.addedBy}</p>
                                        </div>
                                      </div>

                                      {defect.returnReason && (
                                        <div>
                                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
                                            Reason
                                          </p>
                                          <p className="text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-600">
                                            {defect.returnReason}
                                          </p>
                                        </div>
                                      )}

                                      {(defect.costPrice || defect.originalSellingPrice) && (
                                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                                          {defect.costPrice && (
                                            <div>
                                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Cost Price</p>
                                              <p className="text-sm text-gray-900 dark:text-white font-medium">
                                                ৳{formatPrice(defect.costPrice)}
                                              </p>
                                            </div>
                                          )}
                                          {defect.originalSellingPrice && (
                                            <div>
                                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Original Price</p>
                                              <p className="text-sm text-gray-900 dark:text-white font-medium">
                                                ৳{formatPrice(defect.originalSellingPrice)}
                                              </p>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Sold Items */}
                  {soldDefects.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          Sold Items ({soldDefects.length})
                        </h3>
                      </div>

                      <div className="divide-y divide-gray-200 dark:divide-gray-700">
                        {soldDefects.map((defect) => (
                          <div key={defect.id} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-medium text-gray-900 dark:text-white text-sm">
                                {defect.productName}
                              </h4>
                              <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs rounded">
                                Sold
                              </span>
                            </div>
                            <div className="flex items-center gap-x-4 text-xs text-gray-600 dark:text-gray-400">
                              <span>{defect.barcode}</span>
                              <span>৳{formatPrice(defect.sellingPrice)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Returned to Vendor Items */}
                  {returnedDefects.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                          <Truck className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                          Returned to Vendor ({returnedDefects.length})
                        </h3>
                      </div>

                      <div className="divide-y divide-gray-200 dark:divide-gray-700">
                        {returnedDefects.map((defect) => (
                          <div key={defect.id} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-medium text-gray-900 dark:text-white text-sm">
                                    {defect.productName}
                                  </h4>
                                  <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-xs rounded flex items-center gap-1">
                                    <Truck className="w-3 h-3" />
                                    Returned
                                  </span>
                                </div>
                                <div className="flex items-center gap-x-4 text-xs text-gray-600 dark:text-gray-400">
                                  <span className="flex items-center gap-1">
                                    <Barcode className="w-3 h-3" />
                                    {defect.barcode}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {defect.store || 'N/A'}
                                  </span>
                                  {defect.costPrice && (
                                    <span>Cost: ৳{formatPrice(defect.costPrice)}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Sell Modal */}
      {selectedDefect && (
        <SellDefectModal
          isOpen={sellModalOpen}
          onClose={() => setSellModalOpen(false)}
          defect={selectedDefect}
          sellPrice={sellPrice}
          setSellPrice={setSellPrice}
          sellType={sellType}
          setSellType={setSellType}
          onSell={handleSell}
          loading={loading}
        />
      )}

      {/* Return to Vendor Modal */}
      <ReturnToVendorModal
        isOpen={returnToVendorModalOpen}
        onClose={() => setReturnToVendorModalOpen(false)}
        selectedDefects={selectedDefectsForVendor}
        allDefects={defects}
        onReturn={handleReturnToVendor}
        loading={loading}
      />

      {/* Toast Notification */}
      {toast.show && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ ...toast, show: false })}
          duration={5000}
        />
      )}
    </div>
  );
}