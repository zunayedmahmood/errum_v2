'use client';

import { useState, useEffect, DragEvent, ChangeEvent } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import { useRouter } from 'next/navigation';
import { ArrowLeft, Upload, X } from 'lucide-react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Link from 'next/link';
import transactionService, { Category } from '@/services/transactionService';

export default function NewTransactionPage() {
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'expense' as 'income' | 'expense',
    amount: '',
    category: '',
    date: new Date().toISOString().split('T')[0],
    comment: '',
    receiptImage: ''
  });
  
  const [categories, setCategories] = useState<Category[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryType, setNewCategoryType] = useState<'income' | 'expense'>('expense');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    setIsLoadingCategories(true);
    try {
      const categoriesData = await transactionService.getCategories();
      setCategories(categoriesData);
    } catch (error: any) {
      console.error('Failed to load categories:', error);
      setError('Failed to load categories. Please try again.');
    } finally {
      setIsLoadingCategories(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleFileUpload = (file: File) => {
    if (!file) return;
    
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      setError('Please upload a valid image file (PNG, JPG, or WEBP)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      setError('File size must be less than 5MB');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setPreview(base64);
      setFormData(prev => ({ ...prev, receiptImage: base64 }));
    };
    reader.readAsDataURL(file);
  };

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      setError('Category name is required');
      return;
    }
    
    try {
      setIsLoadingCategories(true);
      const newCategory = await transactionService.createCategory({
        name: newCategoryName,
        type: newCategoryType
      });
      
      await loadCategories();
      setFormData(prev => ({ ...prev, category: newCategoryName }));
      setShowNewCategory(false);
      setNewCategoryName('');
      setError(null);
    } catch (error: any) {
      console.error('Error creating category:', error);
      setError(error.response?.data?.message || 'Failed to create category');
    } finally {
      setIsLoadingCategories(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.name || !formData.amount || !formData.category) {
      setError('Please fill in all required fields');
      return;
    }

    if (parseFloat(formData.amount) <= 0) {
      setError('Amount must be greater than 0');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    
    try {
      await transactionService.createTransaction({
        name: formData.name,
        description: formData.description,
        type: formData.type,
        amount: parseFloat(formData.amount),
        category: formData.category,
        date: formData.date,
        comment: formData.comment,
        receiptImage: formData.receiptImage || undefined,
      });
      
      router.push('/transaction');
    } catch (error: any) {
      console.error('Failed to save transaction:', error);
      setError(error.response?.data?.message || 'Failed to save transaction. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCategories = categories.filter(cat => cat.type === formData.type);

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />

        <div className="flex-1 flex flex-col overflow-hidden">
          <Header
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          />

          <main className="flex-1 overflow-y-auto p-6">
            {/* Header Section */}
            <div className="flex items-center gap-4 mb-6">
              <Link
                href="/transaction"
                className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  New Transaction
                </h1>
                <p className="text-gray-600 dark:text-gray-400">
                  Add a manual income or expense entry
                </p>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <div className="flex-shrink-0">
                    <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                  </div>
                  <button
                    onClick={() => setError(null)}
                    className="flex-shrink-0 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* Form */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* LEFT COLUMN - Form Fields */}
                  <div className="space-y-6">
                    {/* Transaction Type */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Transaction Type *
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, type: 'income', category: '' }))}
                          className={`px-4 py-3 rounded-lg border-2 font-medium transition-colors ${
                            formData.type === 'income'
                              ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                              : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400'
                          }`}
                        >
                          Income
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, type: 'expense', category: '' }))}
                          className={`px-4 py-3 rounded-lg border-2 font-medium transition-colors ${
                            formData.type === 'expense'
                              ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                              : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400'
                          }`}
                        >
                          Expense
                        </button>
                      </div>
                    </div>

                    {/* Transaction Name */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Transaction Name *
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        placeholder="e.g., Office Rent Payment"
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        required
                      />
                    </div>

                    {/* Description */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Description
                      </label>
                      <textarea
                        value={formData.description}
                        onChange={(e) => handleInputChange('description', e.target.value)}
                        placeholder="Brief description of the transaction"
                        rows={3}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>

                    {/* Amount */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Amount (৳) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.amount}
                        onChange={(e) => handleInputChange('amount', e.target.value)}
                        placeholder="0.00"
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        required
                      />
                    </div>

                    {/* Category with New Category button */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Category *
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowNewCategory(!showNewCategory)}
                          className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                        >
                          + New Category
                        </button>
                      </div>
                      
                      {showNewCategory && (
                        <div className="mb-3 p-3 bg-gray-50 dark:bg-gray-750 rounded-lg border border-gray-200 dark:border-gray-600">
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <input
                              type="text"
                              value={newCategoryName}
                              onChange={(e) => setNewCategoryName(e.target.value)}
                              placeholder="Category name"
                              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                            />
                            <select
                              value={newCategoryType}
                              onChange={(e) => setNewCategoryType(e.target.value as 'income' | 'expense')}
                              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                            >
                              <option value="expense">Expense</option>
                              <option value="income">Income</option>
                            </select>
                          </div>
                          <button
                            type="button"
                            onClick={handleCreateCategory}
                            disabled={isLoadingCategories || !newCategoryName.trim()}
                            className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isLoadingCategories ? 'Creating...' : 'Create Category'}
                          </button>
                        </div>
                      )}
                      
                      {isLoadingCategories ? (
                        <div className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700">
                          <span className="text-gray-500">Loading categories...</span>
                        </div>
                      ) : (
                        <select
                          value={formData.category}
                          onChange={(e) => handleInputChange('category', e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          required
                        >
                          <option value="">Select category</option>
                          {filteredCategories.map((category) => (
                            <option key={category.id} value={category.name}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Date */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Date *
                      </label>
                      <input
                        type="date"
                        value={formData.date}
                        onChange={(e) => handleInputChange('date', e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        required
                      />
                    </div>

                    {/* Comment */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Additional Notes
                      </label>
                      <textarea
                        value={formData.comment}
                        onChange={(e) => handleInputChange('comment', e.target.value)}
                        placeholder="Any additional notes or comments"
                        rows={3}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>

                  {/* RIGHT COLUMN - Receipt Image */}
                  <div className="flex flex-col">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                      Receipt or Proof
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                      Upload an image of the receipt or supporting document (Max 5MB)
                    </p>

                    <div
                      onDragEnter={handleDrag}
                      onDragLeave={handleDrag}
                      onDragOver={handleDrag}
                      onDrop={handleDrop}
                      className={`flex-1 flex items-center justify-center border-2 border-dashed rounded-lg p-6 text-center transition-all min-h-[300px] ${
                        dragActive
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-750'
                      }`}
                    >
                      {preview ? (
                        <div className="relative w-full h-full flex items-center justify-center">
                          <img
                            src={preview}
                            alt="Receipt Preview"
                            className="max-h-[400px] max-w-full rounded-lg object-contain"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setPreview(null);
                              setFormData(prev => ({ ...prev, receiptImage: '' }));
                            }}
                            className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-2 hover:bg-red-700 shadow-lg"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <label className="cursor-pointer flex flex-col items-center space-y-3">
                          <div className="p-4 bg-gray-200 dark:bg-gray-700 rounded-full">
                            <Upload className="w-8 h-8 text-gray-500 dark:text-gray-400" />
                          </div>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Click to upload or drag and drop
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            PNG, JPG, or WEBP (Max 5MB)
                          </span>
                          <input
                            type="file"
                            accept="image/png, image/jpeg, image/jpg, image/webp"
                            className="hidden"
                            onChange={handleFileChange}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Action Buttons */}
                <div className="flex gap-3 pt-6 mt-6 border-t border-gray-200 dark:border-gray-700">
                  <Link
                    href="/transaction"
                    className="flex-1 px-6 py-3 text-center text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
                  >
                    Cancel
                  </Link>
                  <button
                    type="submit"
                    disabled={
                      isSubmitting ||
                      !formData.name ||
                      !formData.amount ||
                      !formData.category ||
                      isLoadingCategories
                    }
                    className="flex-1 px-6 py-3 bg-black dark:bg-white text-white dark:text-black rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {isSubmitting ? 'Saving...' : 'Save Transaction'}
                  </button>
                </div>
              </form>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}