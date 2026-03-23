'use client';

import { useState, useEffect } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import { Plus, Search } from 'lucide-react';
import StoreCard from '@/components/StoreCard';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar'; 
import Header from '@/components/Header';
import storeService, { Store } from '@/services/storeService';

export default function StoresPage() {
  const { darkMode, setDarkMode } = useTheme();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [userRole, setUserRole] = useState<string>('');

  useEffect(() => {
    // Get user role from localStorage
    const role = localStorage.getItem('userRole') || '';
    setUserRole(role);
  }, []);

  useEffect(() => {
    fetchStores();
  }, [searchQuery]);

  const fetchStores = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await storeService.getStores({
        search: searchQuery || undefined,
        is_active: true,
      });
      
      // Laravel returns paginated data
      const storesData = response.data?.data || response.data || [];
      setStores(storesData);
    } catch (err: any) {
      console.error('Error fetching stores:', err);
      setError(err.response?.data?.message || 'Failed to fetch stores');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar />

        <div className="flex-1 flex flex-col">
          <Header darkMode={darkMode} setDarkMode={setDarkMode} />

          <main className="flex-1 overflow-auto p-6 relative">
            {/* Top Bar */}
            <div className="flex justify-between items-center mb-6">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search stores..."
                  value={searchQuery}
                  onChange={handleSearch}
                  className="pl-9 pr-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm w-80 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500"
                />
              </div>

              {/* Add Store Button */}
                <Link href="/store/add-store">
                  <button className="flex items-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors">
                    <Plus className="w-4 h-4" />
                    <span className="text-sm">Add Store</span>
                  </button>
                </Link>
            </div>

            {/* Header */}
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-1">
                Stores
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Manage and monitor all your store locations
              </p>
            </div>

            {/* Loading State */}
            {loading && (
              <div className="text-center py-12">
                <p className="text-gray-500 dark:text-gray-400">Loading stores...</p>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
                <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Store Cards */}
            {!loading && !error && (
              <div className="grid grid-cols-3 gap-6">
                {stores.length === 0 ? (
                  <div className="col-span-3 text-center py-12">
                    <p className="text-gray-500 dark:text-gray-400">
                      {searchQuery ? 'No stores found matching your search.' : 'No stores available.'}
                    </p>
                  </div>
                ) : (
                  stores.map((store) => (
                    <StoreCard 
                      key={store.id} 
                      store={store}
                      onUpdate={fetchStores}
                    />
                  ))
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}