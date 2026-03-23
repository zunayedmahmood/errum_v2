'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Search, Trash2, ShieldAlert, RefreshCw } from 'lucide-react';

import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Toast from '@/components/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from "@/contexts/ThemeContext";
import productService, { Product, ForceDeleteResponse, ForceDeleteSummary } from '@/services/productService';

export default function ForceDeleteProductPage() {
  const router = useRouter();
  const { isLoading: authLoading, hasPermission } = useAuth();

  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [productIdInput, setProductIdInput] = useState('');
  const productId = useMemo(() => {
    const n = Number(productIdInput);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [productIdInput]);

  const [loadingProduct, setLoadingProduct] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);

  const [confirmChecked, setConfirmChecked] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [reason, setReason] = useState('');

  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<ForceDeleteResponse | null>(null);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' | 'info' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') => setToast({ message, type });

  const canUse = hasPermission('system.settings.edit');

  useEffect(() => {
    // When ID changes, reset previous states
    setProduct(null);
    setResult(null);
    setConfirmChecked(false);
    setConfirmText('');
    setReason('');
  }, [productIdInput]);

  const fetchProduct = async () => {
    if (!productId) {
      showToast('Please enter a valid product ID', 'warning');
      return;
    }

    setLoadingProduct(true);
    try {
      const p = await productService.getById(productId);
      setProduct(p);
      showToast('Product loaded', 'success');
    } catch (e: any) {
      console.error(e);
      setProduct(null);
      showToast(e?.message || 'Failed to load product', 'error');
    } finally {
      setLoadingProduct(false);
    }
  };

  const prettyLabel = (k: string) => k.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

  const renderSummary = (data: ForceDeleteSummary) => {
    const entries = Object.entries(data || {}).filter(([k]) => k !== 'product_id');

    return (
      <div className="mt-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Deletion Summary</h3>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-600 dark:text-gray-300">
              Product ID: <span className="font-semibold text-gray-900 dark:text-white">{data.product_id}</span>
              {data.product_name ? (
                <>
                  {' '}
                  • Name: <span className="font-semibold text-gray-900 dark:text-white">{data.product_name}</span>
                </>
              ) : null}
              {data.product_sku ? (
                <>
                  {' '}
                  • SKU: <span className="font-semibold text-gray-900 dark:text-white">{data.product_sku}</span>
                </>
              ) : null}
            </div>
            {data.deleted_at ? (
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Deleted at: {String(data.deleted_at)}</div>
            ) : null}
          </div>

          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {entries.length ? (
              entries.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between px-4 py-3">
                  <div className="text-sm text-gray-700 dark:text-gray-200">{prettyLabel(k)}</div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">{String(v ?? '')}</div>
                </div>
              ))
            ) : (
              <div className="px-4 py-6 text-sm text-gray-600 dark:text-gray-300">No counters returned.</div>
            )}
          </div>
        </div>

        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-gray-700 dark:text-gray-200 hover:underline">
            View raw response JSON
          </summary>
          <pre className="mt-2 text-xs bg-gray-900 text-gray-100 rounded-xl p-4 overflow-auto">{JSON.stringify(result, null, 2)}</pre>
        </details>
      </div>
    );
  };

  const doForceDelete = async () => {
    if (!productId) {
      showToast('Please enter a valid product ID', 'warning');
      return;
    }

    if (!confirmChecked) {
      showToast('Please confirm you understand this is destructive', 'warning');
      return;
    }

    if (confirmText.trim().toUpperCase() !== 'DELETE') {
      showToast("Type DELETE in the confirmation box to proceed", 'warning');
      return;
    }

    if (!confirm('Final confirmation: permanently delete this product and all related data?')) return;

    setDeleting(true);
    try {
      const res = await productService.forceDelete(productId);
      setResult(res);
      showToast(res?.message || 'Product force deleted', 'success');
      setProduct(null);
      setConfirmChecked(false);
      setConfirmText('');
      setReason('');
    } catch (e: any) {
      console.error(e);
      showToast(e?.message || 'Failed to force delete product', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="w-10 h-10 border-4 border-gray-200 dark:border-gray-700 border-t-gray-900 dark:border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  // Hard permission gate (still enforced by backend too)
  if (!canUse) {
    return (
      <div className={`${darkMode ? 'dark' : ''} flex h-screen`}>
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          />

          <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
            <div className="max-w-3xl mx-auto p-6">
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-8">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <ShieldAlert className="w-6 h-6 text-red-600" />
                  </div>
                  <div>
                    <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Access Denied</h1>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                      This page is restricted. You need the <span className="font-semibold">system.settings.edit</span> permission.
                    </p>
                    <button
                      onClick={() => router.push('/dashboard')}
                      className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-black"
                    >
                      Back to Dashboard
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>

        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </div>
    );
  }

  return (
    <div className={`${darkMode ? 'dark' : ''} flex h-screen`}>
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />

        <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
          <div className="max-w-5xl mx-auto p-6">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Product Force Delete</h1>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  Hidden utility page • Admin only • Permanent deletion
                </p>
              </div>
              <button
                onClick={() => {
                  setProductIdInput('');
                  setProduct(null);
                  setResult(null);
                  setConfirmChecked(false);
                  setConfirmText('');
                  setReason('');
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <RefreshCw className="w-4 h-4" />
                Reset
              </button>
            </div>

            <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-800 dark:text-red-200">Destructive operation</p>
                  <p className="text-sm text-red-700/90 dark:text-red-200/80 mt-1">
                    This will permanently delete the product and related data (batches, barcodes, images, movements, etc.).
                    It cannot be undone. Use only for cleaning up test/erroneous data.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              {/* Left: Input + Preview */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Target Product</h2>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">Enter the product ID you want to remove.</p>

                <div className="mt-4 flex gap-3">
                  <input
                    value={productIdInput}
                    onChange={(e) => setProductIdInput(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="Product ID (e.g. 123)"
                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-gray-900/20 dark:focus:ring-white/20"
                  />
                  <button
                    onClick={fetchProduct}
                    disabled={!productId || loadingProduct}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white hover:bg-black disabled:opacity-50"
                  >
                    <Search className="w-4 h-4" />
                    {loadingProduct ? 'Loading…' : 'Preview'}
                  </button>
                </div>

                <div className="mt-5">
                  {product ? (
                    <div className="border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
                      <div className="text-sm text-gray-500 dark:text-gray-400">Loaded product</div>
                      <div className="mt-1 text-base font-semibold text-gray-900 dark:text-white">{product.name}</div>
                      <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <div className="text-gray-500 dark:text-gray-400">ID</div>
                          <div className="font-semibold text-gray-900 dark:text-white">{product.id}</div>
                        </div>
                        <div>
                          <div className="text-gray-500 dark:text-gray-400">SKU</div>
                          <div className="font-semibold text-gray-900 dark:text-white">{product.sku}</div>
                        </div>
                        <div>
                          <div className="text-gray-500 dark:text-gray-400">Archived</div>
                          <div className="font-semibold text-gray-900 dark:text-white">{product.is_archived ? 'Yes' : 'No'}</div>
                        </div>
                        <div>
                          <div className="text-gray-500 dark:text-gray-400">Category</div>
                          <div className="font-semibold text-gray-900 dark:text-white">{product.category?.title || String(product.category_id || '')}</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-600 dark:text-gray-300">
                      {productId ? 'Click Preview to load details (recommended).' : 'Enter a product ID to continue.'}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Confirmation + Action */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Confirm & Delete</h2>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  For safety, you must confirm explicitly.
                </p>

                <div className="mt-4 space-y-4">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={confirmChecked}
                      onChange={(e) => setConfirmChecked(e.target.checked)}
                      className="mt-1 w-4 h-4"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-200">
                      I understand this permanently deletes the product and related data and cannot be undone.
                    </span>
                  </label>

                  <div>
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-100">Type <span className="font-bold">DELETE</span> to confirm</div>
                    <input
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder="DELETE"
                      className="mt-2 w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-600/20"
                    />
                  </div>

                  <div>
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-100">Reason (optional)</div>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. Test product created during training"
                      rows={3}
                      className="mt-2 w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-gray-900/10 dark:focus:ring-white/10"
                    />
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Reason is for your own record (not sent to API).</div>
                  </div>

                  <button
                    onClick={doForceDelete}
                    disabled={!productId || deleting}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    {deleting ? 'Deleting…' : 'Force Delete Product'}
                  </button>

                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Tip: Preview the product first to avoid deleting the wrong item.
                  </div>
                </div>
              </div>
            </div>

            {result?.success && result.data ? renderSummary(result.data) : null}
          </div>
        </main>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
