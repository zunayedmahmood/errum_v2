'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw } from 'lucide-react';

import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Toast from '@/components/Toast';
import ProductCard from '@/components/ProductCard';
import { productService, Product } from '@/services/productService';
import categoryService, { Category } from '@/services/categoryService';


const ERROR_IMG_SRC =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODgiIGhlaWdodD0iODgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgc3Ryb2tlPSIjMDAwIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBvcGFjaXR5PSIuMyIgZmlsbD0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIzLjciPjxyZWN0IHg9IjE2IiB5PSIxNiIgd2lkdGg9IjU2IiBoZWlnaHQ9IjU2IiByeD0iNiIvPjxwYXRoIGQ9Im0xNiA1OCAxNi0xOCAzMiAzMiIvPjxjaXJjbGUgY3g9IjUzIiBjeT0iMzUiIHI9IjciLz48L3N2Zz4=';

export default function ArchivedProductsPage() {
  const router = useRouter();

  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        productService.getAll({ is_archived: true, per_page: 100 }),
        categoryService.getAll({ per_page: 500 }),
      ]);

      setProducts(productsRes.data || []);

      // categoryService.getAll can return either a paginated object or a tree array
      const cats = Array.isArray(categoriesRes) ? categoriesRes : categoriesRes.data;
      setCategories(cats || []);
    } catch (e) {
      console.error(e);
      showToast('Failed to load archived products', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categoryMap = useMemo(() => {
    const map = new Map<number, Category>();
    categories.forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);

  const getCategoryPath = (categoryId: number | null | undefined) => {
    if (!categoryId) return 'Uncategorized';
    const parts: string[] = [];
    let current = categoryMap.get(categoryId);
    while (current) {
      parts.unshift(current.title);
      const parentId = (current as any).parent_id as number | null | undefined;
      if (!parentId) break;
      current = categoryMap.get(parentId);
    }
    return parts.join(' → ') || 'Uncategorized';
  };

  const getProductImage = (product: Product) => {
    const imgs = product.images || [];
    const active = imgs.filter((i) => i.is_active);
    const list = active.length ? active : imgs;
    const primary = list.find((i) => i.is_primary) || list[0];
    if (!primary?.image_path) return ERROR_IMG_SRC;
    if (primary.image_path.startsWith('http')) return primary.image_path;
    const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '';
    return `${baseUrl}/storage/${primary.image_path}`;
  };

  const handleRestore = async (id: number) => {
    if (!confirm('Restore this product? It will appear again in the product list.')) return;
    try {
      await productService.restore(id);
      showToast('Product restored successfully', 'success');
      // remove from archived view immediately
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      console.error(e);
      showToast('Failed to restore product', 'error');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this product permanently? This action cannot be undone.')) return;
    try {
      await productService.delete(id);
      showToast('Product deleted successfully', 'success');
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      console.error(e);
      showToast('Failed to delete product', 'error');
    }
  };

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
          <div className="max-w-7xl mx-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push('/product/list')}
                  className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Product List
                </button>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Archived Products</h1>
              </div>

              <button
                onClick={loadData}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-10 h-10 border-4 border-gray-200 dark:border-gray-700 border-t-gray-900 dark:border-t-white rounded-full animate-spin" />
              </div>
            ) : products.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-10 text-center">
                <p className="text-gray-600 dark:text-gray-300">No archived products found.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    image={getProductImage(product)}
                    categoryPath={getCategoryPath(product.category_id)}
                    onDelete={handleDelete}
                    onEdit={(p) => {
                      sessionStorage.setItem('editProduct', JSON.stringify(p));
                      router.push(`/product/add?id=${p.id}`);
                    }}
                    onView={(p) => router.push(`/product/${p.id}`)}
                    onRestore={handleRestore}
                  />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
