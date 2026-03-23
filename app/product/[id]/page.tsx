'use client';

import { useState, useEffect, Suspense } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Edit, Trash2, Archive, Package, Tag, Calendar, User, ChevronLeft, ChevronRight } from 'lucide-react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Toast from '@/components/Toast';
import { productService, Product } from '@/services/productService';

const ERROR_IMG_SRC =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODgiIGhlaWdodD0iODgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgc3Ryb2tlPSIjMDAwIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBvcGFjaXR5PSIuMyIgZmlsbD0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIzLjciPjxyZWN0IHg9IjE2IiB5PSIxNiIgd2lkdGg9IjU2IiBoZWlnaHQ9IjU2IiByeD0iNiIvPjxwYXRoIGQ9Im0xNiA1OCAxNi0xOCAzMiAzMiIvPjxjaXJjbGUgY3g9IjUzIiBjeT0iMzUiIHI9IjciLz48L3N2Zz4=';

interface ProductDetailPageProps {
  params: { id: string };
}

export default function ProductDetailPage(props: ProductDetailPageProps) {
  return (
    <Suspense fallback={
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900 items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-200 dark:border-gray-700 border-t-gray-900 dark:border-t-white rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading product view...</p>
        </div>
      </div>
    }>
      <ProductDetailPageContent {...props} />
    </Suspense>
  );
}

function ProductDetailPageContent({ params }: ProductDetailPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const productId = parseInt(params.id);

  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const goBackSafely = () => {
    const returnTo = searchParams.get('returnTo');
    if (returnTo && returnTo.startsWith('/')) {
      router.push(returnTo);
      return;
    }
    router.back();
  };

  useEffect(() => {
    fetchProduct();
  }, [productId]);

  const fetchProduct = async () => {
    try {
      setLoading(true);
      const data = await productService.getById(productId);
      setProduct(data);
    } catch (error) {
      console.error('Failed to fetch product:', error);
      setToast({ message: 'Failed to load product', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    // Use the same sessionStorage mechanism as Product List page
    // (product/add reads editProductId + productMode from sessionStorage)
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('editProductId');
      sessionStorage.removeItem('productMode');
      sessionStorage.removeItem('baseSku');
      sessionStorage.removeItem('baseName');
      sessionStorage.removeItem('categoryId');
      sessionStorage.removeItem('vendorId');

      sessionStorage.setItem('editProductId', String(productId));
      sessionStorage.setItem('productMode', 'edit');
    }

    router.push('/product/add');
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${product?.name}"? This action cannot be undone.`)) return;

    try {
      await productService.delete(productId);
      setToast({ message: 'Product deleted successfully', type: 'success' });
      setTimeout(() => {
        const returnTo = searchParams.get('returnTo');
        if (returnTo && returnTo.startsWith('/')) router.push(returnTo);
        else router.push('/product/list');
      }, 1500);
    } catch (error) {
      console.error('Failed to delete product:', error);
      setToast({ message: 'Failed to delete product', type: 'error' });
    }
  };

  const handleArchive = async () => {
    if (!confirm(`Archive "${product?.name}"? You can restore it later from archived products.`)) return;

    try {
      await productService.archive(productId);
      setToast({ message: 'Product archived successfully', type: 'success' });
      setTimeout(() => {
        const returnTo = searchParams.get('returnTo');
        if (returnTo && returnTo.startsWith('/')) router.push(returnTo);
        else router.push('/product/list');
      }, 1500);
    } catch (error) {
      console.error('Failed to archive product:', error);
      setToast({ message: 'Failed to archive product', type: 'error' });
    }
  };

  const getImageUrl = (imagePath: string) => {
    if (!imagePath) return ERROR_IMG_SRC;
    if (imagePath.startsWith('http')) return imagePath;
    return `${process.env.NEXT_PUBLIC_API_URL?.replace('/api', '')}/storage/${imagePath}`;
  };

  // ─── Image display ───────────────────────────────────────────────────────────
  // Backend's ProductController::show() populates `display_images` via
  // ProductImageFallback::mergedActiveImages().  That method now:
  //   • Returns only the variant's own images when it has them.
  //   • Falls back to the base-product images when the variant has none.
  //   • Trusts is_primary / sort_order verbatim from the DB.
  //   • Marks the first image as primary only when NO image has is_primary=true.
  //
  // We prefer display_images; fall back to product.images (already ordered
  // by the backend: is_primary DESC → sort_order → id).

  const rawDisplayImages: any[] =
    (product as any)?.display_images?.length > 0
      ? (product as any).display_images
      : (product?.images || [])
          .filter((img: any) => img.is_active !== false)
          .sort((a: any, b: any) => {
            if (a.is_primary && !b.is_primary) return -1;
            if (!a.is_primary && b.is_primary) return 1;
            return (a.sort_order ?? 0) - (b.sort_order ?? 0);
          });

  // Normalise URL field: display_images uses image_path; raw images also use
  // image_path. The getImageUrl helper below handles path → full URL.
  const normalizeImage = (img: any) => ({
    ...img,
    image_path:
      img.image_path ||
      (img.url ? img.url.replace(/^\/storage\//, '') : ''),
  });

  const displayImages = (rawDisplayImages.length > 0 ? rawDisplayImages : [{
    id: 0,
    image_path: '',
    is_primary: true,
    is_active: true,
    sort_order: 0,
  } as any]).map(normalizeImage);
  const selectedImage = displayImages[selectedImageIndex] || displayImages[0];

  const nextImage = () => {
    if (displayImages.length <= 1) return;
    setSelectedImageIndex((prev) => (prev + 1) % displayImages.length);
  };

  const prevImage = () => {
    if (displayImages.length <= 1) return;
    setSelectedImageIndex((prev) => (prev - 1 + displayImages.length) % displayImages.length);
  };

  if (loading) {
    return (
      <div className={`${darkMode ? 'dark' : ''} flex h-screen`}>
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        <div className="flex-1 flex flex-col">
          <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
          <main className="flex-1 bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-gray-200 dark:border-gray-700 border-t-gray-900 dark:border-t-white rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">Loading product...</p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className={`${darkMode ? 'dark' : ''} flex h-screen`}>
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        <div className="flex-1 flex flex-col">
          <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
          <main className="flex-1 bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Product Not Found</h2>
              <button
                onClick={goBackSafely}
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                Back to Products
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className={`${darkMode ? 'dark' : ''} flex h-screen`}>
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

        <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
          <div className="max-w-6xl mx-auto p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <button
                  onClick={goBackSafely}
                  className="p-2.5 hover:bg-white dark:hover:bg-gray-800 rounded-lg transition-colors border border-gray-200 dark:border-gray-700 shadow-sm"
                >
                  <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </button>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                    {product.name}
                  </h1>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Product Details
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleEdit}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors font-medium shadow-sm"
                >
                  <Edit className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={handleArchive}
                  className="flex items-center gap-2 px-4 py-2.5 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors font-medium shadow-sm"
                >
                  <Archive className="w-4 h-4" />
                  Archive
                </button>
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium shadow-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Image Gallery */}
              <div className="space-y-4">
                {/* Main Image */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                  <div className="relative aspect-square bg-gray-100 dark:bg-gray-900">
                    <img
                      src={selectedImage ? getImageUrl(selectedImage.image_path) : ERROR_IMG_SRC}
                      alt={product.name}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        e.currentTarget.src = ERROR_IMG_SRC;
                      }}
                    />

                    {/* Image Navigation */}
                    {displayImages.length > 1 && (
                      <>
                        <button
                          onClick={prevImage}
                          className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/90 dark:bg-gray-800/90 p-2 rounded-full shadow-lg hover:bg-white dark:hover:bg-gray-800 transition-colors"
                        >
                          <ChevronLeft className="w-5 h-5 text-gray-900 dark:text-white" />
                        </button>
                        <button
                          onClick={nextImage}
                          className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/90 dark:bg-gray-800/90 p-2 rounded-full shadow-lg hover:bg-white dark:hover:bg-gray-800 transition-colors"
                        >
                          <ChevronRight className="w-5 h-5 text-gray-900 dark:text-white" />
                        </button>

                        {/* Image Counter */}
                        <div className="absolute bottom-4 right-4 bg-black/70 text-white px-3 py-1 rounded-full text-sm font-medium">
                          {selectedImageIndex + 1} / {displayImages.length}
                        </div>
                      </>
                    )}

                    {/* Primary Badge */}
                    {selectedImage?.is_primary && (
                      <div className="absolute top-4 left-4 bg-yellow-400 text-yellow-900 px-3 py-1 rounded-lg text-xs font-bold shadow-lg">
                        Primary Image
                      </div>
                    )}
                  </div>
                </div>

                {/* Thumbnail Gallery */}
                {displayImages.length > 1 && (
                  <div className="grid grid-cols-5 gap-2">
                    {displayImages.map((img, index) => (
                      <button
                        key={img.id}
                        onClick={() => setSelectedImageIndex(index)}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${index === selectedImageIndex
                            ? 'border-gray-900 dark:border-white ring-2 ring-gray-900 dark:ring-white'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
                          }`}
                      >
                        <img
                          src={getImageUrl(img.image_path)}
                          alt={`Thumbnail ${index + 1}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = ERROR_IMG_SRC;
                          }}
                        />
                        {img.is_primary && (
                          <div className="absolute top-1 right-1 bg-yellow-400 rounded-full p-1">
                            <div className="w-1.5 h-1.5 bg-yellow-900 rounded-full"></div>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {displayImages.length === 0 && (
                  <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center">
                    <p className="text-gray-500 dark:text-gray-400 text-sm">No images available</p>
                  </div>
                )}
              </div>

              {/* Product Information */}
              <div className="space-y-6">
                {/* Basic Info Card */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Basic Information
                  </h2>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <Package className="w-5 h-5 text-gray-400 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm text-gray-500 dark:text-gray-400">Product Name</p>
                        <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                          {product.name}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Tag className="w-5 h-5 text-gray-400 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm text-gray-500 dark:text-gray-400">SKU</p>
                        <p className="text-base font-mono font-medium text-gray-900 dark:text-white mt-1">
                          {product.sku}
                        </p>
                      </div>
                    </div>

                    {product.description && (
                      <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Description</p>
                        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                          {product.description}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Category & Vendor */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Classification
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Category</p>
                      <p className="text-base font-medium text-gray-900 dark:text-white">
                        {product.category?.title || 'N/A'}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Vendor</p>
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-400" />
                        <p className="text-base font-medium text-gray-900 dark:text-white">
                          {product.vendor?.name || 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Custom Fields */}
                {product.custom_fields && product.custom_fields.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                      Additional Details
                    </h2>
                    <div className="space-y-3">
                      {product.custom_fields
                        .filter(cf => !['Primary Image', 'Additional Images'].includes(cf.field_title))
                        .map((field) => (
                          <div key={field.field_id} className="flex justify-between items-start">
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              {field.field_title}
                            </span>
                            <span className="text-sm font-medium text-gray-900 dark:text-white text-right ml-4">
                              {field.value || 'N/A'}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Metadata */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Metadata
                  </h2>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <div className="flex-1">
                        <p className="text-sm text-gray-500 dark:text-gray-400">Created</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {new Date(product.created_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <div className="flex-1">
                        <p className="text-sm text-gray-500 dark:text-gray-400">Last Updated</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {new Date(product.updated_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}