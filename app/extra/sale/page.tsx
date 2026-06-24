'use client';

import { useState, useEffect } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import defectIntegrationService from '@/services/defectIntegrationService';
import { Package, ArrowRight, DollarSign, ShoppingCart, Smartphone, AlertCircle } from 'lucide-react';

interface DefectItem {
  id: string;
  barcode: string;
  productId: number;
  productName: string;
  reason: string;
  sellingPrice?: number;
  store?: string;
  batchId?: number;
}

export default function SellDefectPage() {
  const router = useRouter();
  
  // ✅ Get parameters from URL
  const [defectId, setDefectId] = useState<string | null>(null);
  const [initialSellType, setInitialSellType] = useState('pos');
  const [initialPrice, setInitialPrice] = useState('');
  
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [defect, setDefect] = useState<DefectItem | null>(null);
  const [sellingPrice, setSellingPrice] = useState('');
  const [saleType, setSaleType] = useState<'pos' | 'social'>('pos');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Read URL parameters on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('id');
      const sellType = params.get('sellType') || 'pos';
      const price = params.get('price') || '';
      
      setDefectId(id);
      setInitialSellType(sellType);
      setInitialPrice(price);
      setSellingPrice(price);
      setSaleType(sellType as 'pos' | 'social');
    }
  }, []);

  useEffect(() => {
    if (defectId) {
      fetchDefect();
    } else if (defectId === null) {
      // Only set error if we've attempted to read the URL
      setError('No defect ID provided');
    }
  }, [defectId]);

  const fetchDefect = async () => {
    if (!defectId) return;
    
    setLoading(true);
    setError('');
    
    try {
      console.log('🔍 Fetching defective product for ID:', defectId);
      
      const fullDetails = await defectIntegrationService.getDefectiveById(defectId);
      
      console.log('📦 Defect details:', fullDetails);
      console.log('🔢 Batch ID:', fullDetails.product_batch_id);
      
      const defectItem: DefectItem = {
        id: fullDetails.id.toString(),
        barcode: fullDetails.barcode?.barcode || '',
        productId: fullDetails.product_id,
        productName: fullDetails.product?.name || 'Unknown Product',
        reason: fullDetails.defect_description || '',
        sellingPrice: parseFloat(fullDetails.suggested_selling_price?.toString() || '0'),
        store: fullDetails.store?.name,
        batchId: fullDetails.product_batch_id,
      };
      
      console.log('✅ Prepared defect item:', defectItem);
      
      setDefect(defectItem);
      
      // Use price from URL if available, otherwise use suggested price
      if (!sellingPrice && defectItem.sellingPrice) {
        setSellingPrice(defectItem.sellingPrice.toString());
      }
      
    } catch (error: any) {
      console.error('❌ Error fetching defect:', error);
      setError(error.message || 'Error loading product');
    } finally {
      setLoading(false);
    }
  };

  const handleSell = async () => {
    console.log('═══════════════════════════════════');
    console.log('🔥 SELL BUTTON CLICKED');
    console.log('Sale Type:', saleType);
    console.log('Defect ID:', defect?.id);
    console.log('Selling Price:', sellingPrice);
    console.log('═══════════════════════════════════');
    
    if (!defect) {
      alert('Defect data not loaded');
      return;
    }
    
    if (!sellingPrice || parseFloat(sellingPrice) <= 0) {
      alert('Please enter a valid selling price');
      return;
    }

    setLoading(true);
    
    try {
      // ✅ Prepare complete defect data
      const defectData = {
        id: defect.id,
        barcode: defect.barcode,
        productId: defect.productId,
        productName: defect.productName,
        sellingPrice: parseFloat(sellingPrice),
        store: defect.store,
        batchId: defect.batchId,
      };

      console.log('💾 Saving to sessionStorage:', JSON.stringify(defectData, null, 2));
      
      if (!defectData.batchId) {
        console.error('❌ ERROR: Missing batch_id!');
        throw new Error('Batch ID is missing');
      }
      
      // Save to sessionStorage
      sessionStorage.setItem('defectItem', JSON.stringify(defectData));
      
      // Verify
      const saved = sessionStorage.getItem('defectItem');
      console.log('✅ Verified in sessionStorage:', saved);

      // ✅ CRITICAL: Correct redirect based on sale type
      const url = saleType === 'pos'
        ? `/pos?defect=${defect.id}`
        : `/social-commerce?defect=${defect.id}`;
      
      console.log('═══════════════════════════════════');
      console.log('🚀 REDIRECTING TO:', url);
      console.log('Expected URL:', `/pos?defect=${defect.id}`);
      console.log('Match:', url === `/pos?defect=${defect.id}`);
      console.log('═══════════════════════════════════');
      
      setTimeout(() => {
        console.log('✈️ EXECUTING REDIRECT NOW');
        window.location.href = url;
      }, 100);
      
    } catch (error: any) {
      console.error('❌ Error:', error);
      setError(error.message || 'Error processing sale');
      setLoading(false);
    }
  };

  // Loading state
  if (loading && !defect) {
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
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Package className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-pulse" />
                <p className="text-gray-600 dark:text-gray-400">Loading...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !defect) {
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
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Error</h2>
                <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
                <button
                  onClick={() => router.back()}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                >
                  Go Back
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!defect) return null;

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
            <div className="max-w-2xl mx-auto">
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Sell Defective Item
                </h1>
                <p className="text-gray-600 dark:text-gray-400">
                  Configure sale details before proceeding
                </p>
              </div>

              {error && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  <p className="text-red-800 dark:text-red-300">{error}</p>
                </div>
              )}

              {/* Product Info */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-orange-200 dark:border-orange-700 shadow-sm mb-6">
                <div className="px-6 py-4 bg-orange-50 dark:bg-orange-900/20 border-b border-orange-200 dark:border-orange-700">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
                      <Package className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">Product Information</h3>
                      <p className="text-xs text-orange-600 dark:text-orange-400">
                        Defective Item • Batch ID: {defect.batchId || 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="p-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Product Name
                      </label>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {defect.productName}
                      </p>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Barcode
                      </label>
                      <p className="text-sm font-mono font-medium text-gray-900 dark:text-white">
                        {defect.barcode}
                      </p>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Product ID
                      </label>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        #{defect.productId}
                      </p>
                    </div>
                    
                    {defect.store && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Store
                        </label>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {defect.store}
                        </p>
                      </div>
                    )}
                    
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Reason
                      </label>
                      <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                        {defect.reason}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sale Configuration */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="font-semibold text-gray-900 dark:text-white">Sale Configuration</h3>
                </div>
                
                <div className="p-6 space-y-6">
                  {/* Sale Type */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      Sale Channel <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={() => setSaleType('pos')}
                        className={`p-4 border-2 rounded-xl text-center transition-all ${
                          saleType === 'pos'
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                        }`}
                      >
                        <ShoppingCart className={`w-8 h-8 mx-auto mb-2 ${
                          saleType === 'pos' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'
                        }`} />
                        <div className={`font-semibold ${
                          saleType === 'pos' ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'
                        }`}>
                          POS Sale
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          In-store counter
                        </div>
                      </button>
                      
                      <button
                        onClick={() => setSaleType('social')}
                        className={`p-4 border-2 rounded-xl text-center transition-all ${
                          saleType === 'social'
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                        }`}
                      >
                        <Smartphone className={`w-8 h-8 mx-auto mb-2 ${
                          saleType === 'social' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'
                        }`} />
                        <div className={`font-semibold ${
                          saleType === 'social' ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'
                        }`}>
                          Social Commerce
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Online/social media
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Selling Price */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Selling Price (৳) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="number"
                        value={sellingPrice}
                        onChange={(e) => setSellingPrice(e.target.value)}
                        placeholder="Enter price"
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    {defect.sellingPrice && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Suggested: ৳{defect.sellingPrice.toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4">
                <button
                  onClick={() => router.back()}
                  disabled={loading}
                  className="flex-1 px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSell}
                  disabled={loading || !sellingPrice || parseFloat(sellingPrice) <= 0}
                  className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? 'Processing...' : (
                    <>
                      Proceed to {saleType === 'pos' ? 'POS' : 'Social Commerce'}
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}