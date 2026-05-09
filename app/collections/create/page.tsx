"use client";

import { useState } from "react";
import { ArrowLeft, Save, Loader2, Image as ImageIcon, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import Toast from "@/components/Toast";
import collectionService from "@/services/collectionService";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";

export default function CreateCollectionPage() {
  const router = useRouter();
  const { isRole, isLoading: authLoading } = useAuth();
  const isPowerUser = isRole(['super-admin', 'admin', 'online-moderator']);
  
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
  } | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    type: "category",
    status: "draft",
    sort_order: 0,
  });

  const [images, setImages] = useState<{
    thumbnail: File | null;
    banner: File | null;
  }>({
    thumbnail: null,
    banner: null,
  });

  const [previews, setPreviews] = useState<{
    thumbnail: string | null;
    banner: string | null;
  }>({
    thumbnail: null,
    banner: null,
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const next = { ...prev, [name]: value };
      if (name === "name") {
        next.slug = value.trim().toLowerCase().split(/\s+/).join("-").replace(/[^a-z0-9-]/g, "");
      }
      return next;
    });
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'thumbnail' | 'banner') => {
    const file = e.target.files?.[0];
    if (file) {
      setImages(prev => ({ ...prev, [type]: file }));
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviews(prev => ({ ...prev, [type]: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = (type: 'thumbnail' | 'banner') => {
    setImages(prev => ({ ...prev, [type]: null }));
    setPreviews(prev => ({ ...prev, [type]: null }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    try {
      setSaving(true);
      const data = new FormData();
      Object.entries(formData).forEach(([key, value]) => {
        data.append(key, String(value));
      });
      
      if (images.thumbnail) data.append('thumbnail_image', images.thumbnail);
      if (images.banner) data.append('banner_image', images.banner);

      const result = await collectionService.create(data);
      if (result.success) {
        showToast('Collection created successfully!', 'success');
        setTimeout(() => {
          router.push(`/collections/${result.data.id}`);
        }, 1500);
      }
    } catch (error: any) {
      console.error('Failed to create collection:', error);
      showToast(error.response?.data?.message || 'Failed to create collection', 'error');
    } finally {
      setSaving(false);
    }
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
    setToast({ message, type });
  };

  if (authLoading) return null;
  if (!isPowerUser) return null;

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        <div className="flex-1 flex flex-col">
          <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

          <main className="flex-1 overflow-auto p-6">
            <div className="max-w-4xl mx-auto">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Link
                    href="/collections"
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-gray-500 dark:text-gray-400"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </Link>
                  <div>
                    <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-1">
                      Create Collection
                    </h1>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Add a new curated product grouping
                    </p>
                  </div>
                </div>
                
                <button
                  onClick={handleSubmit}
                  disabled={saving || !formData.name}
                  className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Collection
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Basic Info */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">
                      General Information
                    </h2>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Collection Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          name="name"
                          value={formData.name}
                          onChange={handleInputChange}
                          placeholder="e.g. Summer Essentials 2026"
                          className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Description
                        </label>
                        <textarea
                          name="description"
                          value={formData.description}
                          onChange={handleInputChange}
                          rows={4}
                          placeholder="Describe the theme and products in this collection..."
                          className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Banner Upload */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">
                      Banner Image
                    </h2>
                    
                    <div className="relative group">
                      {previews.banner ? (
                        <div className="relative aspect-[21/9] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                          <img src={previews.banner} className="w-full h-full object-cover" alt="Banner Preview" />
                          <button 
                            onClick={() => removeImage('banner')}
                            className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full transition-all opacity-0 group-hover:opacity-100"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center aspect-[21/9] w-full border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900 transition-all">
                          <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <Upload className="w-10 h-10 text-gray-400 mb-3" />
                            <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                              <span className="font-semibold">Click to upload</span> banner image
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">
                              Recommended: 1920x800px (Max 5MB)
                            </p>
                          </div>
                          <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageChange(e, 'banner')} />
                        </label>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Column: Settings & Thumbnail */}
                <div className="space-y-6">
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">
                      Configuration
                    </h2>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Publication Status
                        </label>
                        <select
                          name="status"
                          value={formData.status}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                        >
                          <option value="draft">Draft</option>
                          <option value="active">Active (Visible)</option>
                          <option value="archived">Archived</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">
                      Thumbnail Image
                    </h2>
                    
                    <div className="relative group">
                      {previews.thumbnail ? (
                        <div className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                          <img src={previews.thumbnail} className="w-full h-full object-cover" alt="Thumbnail Preview" />
                          <button 
                            onClick={() => removeImage('thumbnail')}
                            className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full transition-all opacity-0 group-hover:opacity-100"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center aspect-square w-full border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900 transition-all">
                          <div className="flex flex-col items-center justify-center p-4 text-center">
                            <ImageIcon className="w-8 h-8 text-gray-400 mb-2" />
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              <span className="font-semibold">Upload</span> thumbnail
                            </p>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                              Square ratio recommended (Max 2MB)
                            </p>
                          </div>
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageChange(e, 'thumbnail')} />
                    </label>
                  )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
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
