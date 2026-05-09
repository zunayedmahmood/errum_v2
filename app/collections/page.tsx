"use client";

import { useState, useEffect } from "react";
import { Plus, Search, MoreVertical, Edit, Trash2, ExternalLink, Package } from "lucide-react";
import Link from "next/link";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import Toast from "@/components/Toast";
import AccessDenied from "@/components/AccessDenied";
import collectionService, { Collection } from "@/services/collectionService";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";

export default function CollectionsPage() {
  const { isRole, isLoading: authLoading } = useAuth();
  const isPowerUser = isRole(['super-admin', 'admin', 'online-moderator']);
  
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
  } | null>(null);

  useEffect(() => {
    loadCollections();
  }, []);

  const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
    setToast({ message, type });
  };

  const loadCollections = async () => {
    try {
      setLoading(true);
      const result = await collectionService.getAll();
      setCollections(Array.isArray(result.data) ? result.data : []);
    } catch (error: any) {
      console.error('Failed to load collections:', error);
      showToast(error.message || 'Failed to load collections', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this collection?')) return;
    
    try {
      await collectionService.delete(id);
      showToast('Collection deleted successfully!', 'success');
      loadCollections();
    } catch (error: any) {
      console.error('Failed to delete collection:', error);
      showToast(error.response?.data?.message || 'Failed to delete collection', 'error');
    }
  };

  if (authLoading) return null;
  if (!isPowerUser) return <AccessDenied />;

  const filteredCollections = collections.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        <div className="flex-1 flex flex-col">
          <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

          <main className="flex-1 overflow-auto p-6">
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-1">
                    Collections
                  </h1>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Manage curated groupings of products for merchandising
                  </p>
                </div>
                <Link
                  href="/collections/create"
                  className="flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Create Collection
                </Link>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search collections..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500"
                  />
                </div>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <p className="text-gray-500 dark:text-gray-400">Loading collections...</p>
              </div>
            ) : filteredCollections.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                <Package className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">
                  {searchQuery ? 'No collections found matching your search' : 'No collections found. Create your first collection!'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredCollections.map((collection) => (
                  <div 
                    key={collection.id} 
                    className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-shadow group"
                  >
                    <div className="relative h-40 bg-gray-100 dark:bg-gray-900">
                      {collection.thumbnail_url ? (
                        <img 
                          src={collection.thumbnail_url} 
                          alt={collection.name} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          <Package className="w-12 h-12 opacity-20" />
                        </div>
                      )}
                      <div className="absolute top-2 right-2 flex gap-2">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                          collection.status === 'active' ? 'bg-green-100 text-green-700' : 
                          collection.status === 'draft' ? 'bg-yellow-100 text-yellow-700' : 
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {collection.status}
                        </span>
                      </div>
                    </div>
                    
                    <div className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white truncate" title={collection.name}>
                          {collection.name}
                        </h3>
                        <div className="flex items-center gap-1">
                          <Link 
                            href={`/collections/${collection.id}`}
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 dark:text-gray-400 transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </Link>
                          <button 
                            onClick={() => handleDelete(collection.id)}
                            className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 line-clamp-2 min-h-[32px]">
                        {collection.description || 'No description provided.'}
                      </p>
                      
                      <div className="flex items-center justify-between mt-auto pt-4 border-t border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-2">
                          <Package className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                             Products
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>
        </div>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
