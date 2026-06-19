'use client';

import { useState, useEffect } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { ArrowLeft, Save, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import storeService, { StoreFormData } from '@/services/storeService';

type AddStorePageProps = {
  /** Next.js App Router query params (e.g. /store/add-store?id=123) */
  searchParams?: {
    id?: string;
  };
};

export default function AddStorePage({ searchParams }: AddStorePageProps) {
  const editId = searchParams?.id ? String(searchParams.id) : null;
  const { darkMode, setDarkMode } = useTheme();
  const [isTypeOpen, setIsTypeOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

  const [formData, setFormData] = useState<StoreFormData>({
    name: '',
    address: '',
    pathao_key: '',
    type: 'store',
    is_online: false,
    phone: '',
    email: '',
    contact_person: '',
    store_code: '',
    description: '',
    latitude: '',
    longitude: '',
    capacity: '',
    pathao_contact_name: '',
    pathao_contact_number: '',
    pathao_secondary_contact: '',
    pathao_city_id: null,
    pathao_zone_id: null,
    pathao_area_id: null,
    pathao_registered: false,
  });

  // Load store data when editing
  useEffect(() => {
    if (editId) {
      loadStoreData(parseInt(editId));
    }
  }, [editId]);

  const loadStoreData = async (id: number) => {
    try {
      setLoading(true);
      const response = await storeService.getStore(id);
      const store = response.data;
      
      setFormData({
        id: store.id,
        name: store.name || '',
        address: store.address || '',
        pathao_key: store.pathao_key || store.pathao_store_id || '',
        type: store.is_warehouse ? 'warehouse' : 'store',
        is_online: Boolean(store.is_online),
        phone: store.phone || '',
        email: store.email || '',
        contact_person: store.contact_person || '',
        store_code: store.store_code || '',
        description: store.description || '',
        latitude: store.latitude ?? '',
        longitude: store.longitude ?? '',
        capacity: store.capacity ?? '',
        pathao_contact_name: store.pathao_contact_name || '',
        pathao_contact_number: store.pathao_contact_number || '',
        pathao_secondary_contact: store.pathao_secondary_contact || '',
        pathao_city_id: store.pathao_city_id ?? null,
        pathao_zone_id: store.pathao_zone_id ?? null,
        pathao_area_id: store.pathao_area_id ?? null,
        pathao_registered: Boolean(store.pathao_registered),
      });
    } catch (err: any) {
      console.error('Error loading store:', err);
      setError(err.response?.data?.message || 'Failed to load store');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      setError(null);

      if (editId) {
        await storeService.updateStore(parseInt(editId), formData);
      } else {
        await storeService.createStore(formData);
      }

      router.push('/store');
    } catch (err: any) {
      console.error('Error saving store:', err);
      setError(err.response?.data?.message || 'Failed to save store');
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const selectType = (type: string) => {
    setFormData(prev => ({ ...prev, type }));
    setIsTypeOpen(false);
  };

  if (loading && editId) {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <div className="flex h-screen bg-gray-50 dark:bg-gray-900 items-center justify-center">
          <p className="text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header darkMode={darkMode} setDarkMode={setDarkMode} />
          <main className="flex-1 overflow-auto p-6">
            <div className="max-w-3xl mx-auto">
              <div className="mb-4">
                <Link href="/store">
                  <button className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors mb-3">
                    <ArrowLeft className="w-4 h-4" />
                    <span className="text-sm">Back to Stores</span>
                  </button>
                </Link>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">
                  {editId ? 'Edit Store' : 'Add New Store'}
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {editId ? 'Update this store information' : 'Create a new store location'}
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
                </div>
              )}

              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Store Name */}
                  <div>
                    <label htmlFor="name" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Store Name
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="Enter store name"
                      required
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 transition-colors"
                    />
                  </div>

                  {/* Address */}
                  <div>
                    <label htmlFor="address" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Address
                    </label>
                    <textarea
                      id="address"
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      placeholder="Enter full address"
                      required
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 transition-colors resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="phone" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Store Phone / Memo Mobile
                      </label>
                      <input
                        type="text"
                        id="phone"
                        name="phone"
                        value={formData.phone || ''}
                        onChange={handleChange}
                        placeholder="Enter store phone number"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 transition-colors"
                      />
                    </div>

                    <div>
                      <label htmlFor="email" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Email
                      </label>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        value={formData.email || ''}
                        onChange={handleChange}
                        placeholder="Enter store email"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 transition-colors"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="contact_person" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Contact Person
                      </label>
                      <input
                        type="text"
                        id="contact_person"
                        name="contact_person"
                        value={formData.contact_person || ''}
                        onChange={handleChange}
                        placeholder="Enter contact person"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 transition-colors"
                      />
                    </div>

                    <div>
                      <label htmlFor="store_code" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Store Code
                      </label>
                      <input
                        type="text"
                        id="store_code"
                        name="store_code"
                        value={formData.store_code || ''}
                        onChange={handleChange}
                        placeholder="Example: MIRPUR-01"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="description" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Store Details / Internal Note
                    </label>
                    <textarea
                      id="description"
                      name="description"
                      value={formData.description || ''}
                      onChange={handleChange}
                      placeholder="Optional store details"
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 transition-colors resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label htmlFor="capacity" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Capacity
                      </label>
                      <input
                        type="number"
                        id="capacity"
                        name="capacity"
                        value={formData.capacity ?? ''}
                        onChange={handleChange}
                        placeholder="Optional"
                        min="0"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 transition-colors"
                      />
                    </div>
                    <div>
                      <label htmlFor="latitude" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Latitude
                      </label>
                      <input
                        type="number"
                        step="any"
                        id="latitude"
                        name="latitude"
                        value={formData.latitude ?? ''}
                        onChange={handleChange}
                        placeholder="Optional"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 transition-colors"
                      />
                    </div>
                    <div>
                      <label htmlFor="longitude" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Longitude
                      </label>
                      <input
                        type="number"
                        step="any"
                        id="longitude"
                        name="longitude"
                        value={formData.longitude ?? ''}
                        onChange={handleChange}
                        placeholder="Optional"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Pathao Key */}
                  <div>
                    <label htmlFor="pathao_key" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Pathao Store ID / Key
                    </label>
                    <input
                      type="text"
                      id="pathao_key"
                      name="pathao_key"
                      value={formData.pathao_key}
                      onChange={handleChange}
                      placeholder="Enter Pathao store ID/key (optional)"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 transition-colors"
                    />
                  </div>

                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Pathao Pickup Details</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Optional. Used when this branch sends Pathao orders.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="pathao_contact_name" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Pickup Contact Name</label>
                        <input type="text" id="pathao_contact_name" name="pathao_contact_name" value={formData.pathao_contact_name || ''} onChange={handleChange} placeholder="Pickup contact name" className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 transition-colors" />
                      </div>
                      <div>
                        <label htmlFor="pathao_contact_number" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Pickup Contact Number</label>
                        <input type="text" id="pathao_contact_number" name="pathao_contact_number" value={formData.pathao_contact_number || ''} onChange={handleChange} placeholder="Pickup contact number" className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 transition-colors" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div>
                        <label htmlFor="pathao_secondary_contact" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Secondary Contact</label>
                        <input type="text" id="pathao_secondary_contact" name="pathao_secondary_contact" value={formData.pathao_secondary_contact || ''} onChange={handleChange} placeholder="Optional" className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 transition-colors" />
                      </div>
                      <div>
                        <label htmlFor="pathao_city_id" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">City ID</label>
                        <input type="number" id="pathao_city_id" name="pathao_city_id" value={formData.pathao_city_id ?? ''} onChange={handleChange} placeholder="Optional" min="0" className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 transition-colors" />
                      </div>
                      <div>
                        <label htmlFor="pathao_zone_id" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Zone ID</label>
                        <input type="number" id="pathao_zone_id" name="pathao_zone_id" value={formData.pathao_zone_id ?? ''} onChange={handleChange} placeholder="Optional" min="0" className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 transition-colors" />
                      </div>
                      <div>
                        <label htmlFor="pathao_area_id" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Area ID</label>
                        <input type="number" id="pathao_area_id" name="pathao_area_id" value={formData.pathao_area_id ?? ''} onChange={handleChange} placeholder="Optional" min="0" className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 transition-colors" />
                      </div>
                    </div>

                    <label className="inline-flex items-center gap-2 text-sm text-gray-900 dark:text-white">
                      <input type="checkbox" name="pathao_registered" checked={Boolean(formData.pathao_registered)} onChange={handleChange} className="text-gray-900 focus:ring-gray-900 dark:focus:ring-gray-500" />
                      Store is registered in Pathao
                    </label>
                  </div>

                  {/* Type Selection */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Type
                    </label>
                    <div className="relative">
                      <button 
                        type="button" 
                        onClick={() => setIsTypeOpen(!isTypeOpen)} 
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 transition-colors flex items-center justify-between"
                      >
                        <span className="capitalize">{formData.type}</span>
                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isTypeOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {isTypeOpen && (
                        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg overflow-hidden">
                          <button 
                            type="button" 
                            onClick={() => selectType('store')} 
                            className="w-full px-3 py-2 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                          >
                            Store
                          </button>
                          <button 
                            type="button" 
                            onClick={() => selectType('warehouse')} 
                            className="w-full px-3 py-2 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                          >
                            Warehouse
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Online Status */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Online Status
                    </label>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-sm text-gray-900 dark:text-white">
                        <input
                          type="radio"
                          name="is_online"
                          checked={formData.is_online === true}
                          onChange={() => setFormData(prev => ({ ...prev, is_online: true }))}
                          className="text-gray-900 focus:ring-gray-900 dark:focus:ring-gray-500"
                        />
                        Online
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-900 dark:text-white">
                        <input
                          type="radio"
                          name="is_online"
                          checked={formData.is_online === false}
                          onChange={() => setFormData(prev => ({ ...prev, is_online: false }))}
                          className="text-gray-900 focus:ring-gray-900 dark:focus:ring-gray-500"
                        />
                        Offline
                      </label>
                    </div>
                  </div>

                  {/* Form Actions */}
                  <div className="flex items-center gap-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <Link href="/store" className="flex-1">
                      <button 
                        type="button" 
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        Cancel
                      </button>
                    </Link>
                    <button 
                      type="submit" 
                      disabled={loading}
                      className="flex-1 flex items-center justify-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Save className="w-4 h-4" />
                      {loading ? 'Saving...' : (editId ? 'Update Store' : 'Save Store')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}