'use client';

import { useState, useEffect, DragEvent, ChangeEvent } from 'react';
import { X, Upload, Calendar, DollarSign, Tag, FileText, Image as ImageIcon, Loader2, Store } from 'lucide-react';
import transactionService, { Category } from '@/services/transactionService';
import storeService, { Store as StoreType } from '@/services/storeService';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'react-hot-toast';

interface ManualEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ManualEntryModal({ isOpen, onClose, onSuccess }: ManualEntryModalProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super-admin';
  const userStoreId = user?.store_id;

  const [formData, setFormData] = useState({
    transaction_date: new Date().toISOString().split('T')[0],
    amount: '',
    type: 'debit' as 'debit' | 'credit', // Backend expects debit/credit
    account_id: '1', // Default cash account
    description: '',
    store_id: isAdmin ? 'errum' : (userStoreId?.toString() || ''),
    note: '',
    reference_note: '',
    receipt_image: ''
  });

  const [categories, setCategories] = useState<Category[]>([]);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
      // Reset form if opening
      setFormData({
        transaction_date: new Date().toISOString().split('T')[0],
        amount: '',
        type: 'debit',
        account_id: '1',
        description: '',
        store_id: isAdmin ? 'errum' : (userStoreId?.toString() || ''),
        note: '',
        reference_note: '',
        receipt_image: ''
      });
      setPreview(null);
    }
  }, [isOpen]);

  const loadData = async () => {
    setIsLoadingData(true);
    try {
      const [cats, storesList] = await Promise.all([
        transactionService.getCategories(),
        isAdmin ? storeService.getAllStores() : Promise.resolve([])
      ]);
      setCategories(cats);
      setStores(storesList);
    } catch (error) {
      console.error('Failed to load modal data:', error);
      toast.error('Failed to load necessary data');
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileUpload = (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setPreview(base64);
      setFormData(prev => ({ ...prev, receipt_image: base64 }));
    };
    reader.readAsDataURL(file);
  };

  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description || !formData.amount || !formData.transaction_date) {
      toast.error('Please fill in required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        amount: parseFloat(formData.amount),
        // If store_id is 'errum', send null to backend for global scoping
        store_id: formData.store_id === 'errum' ? null : formData.store_id
      };
      
      await transactionService.createTransaction(payload as any);
      toast.success('Transaction created successfully');
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Failed to create transaction:', error);
      toast.error(error.response?.data?.message || 'Failed to create transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-gray-200 dark:border-gray-800 flex flex-col animate-in fade-in zoom-in duration-200">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-gray-900/50">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-blue-500" />
              Manual Transaction Entry
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Record a financial movement manually</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <form id="manual-transaction-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Left Column: Transaction Details */}
              <div className="space-y-5">
                {/* Date and Amount Row */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Transaction Date *
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="date"
                        value={formData.transaction_date}
                        onChange={(e) => handleInputChange('transaction_date', e.target.value)}
                        className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm text-gray-900 dark:text-white"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Amount (৳) *
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formData.amount}
                        onChange={(e) => handleInputChange('amount', e.target.value)}
                        className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm text-gray-900 dark:text-white"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Type Selection */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Flow Type
                  </label>
                  <div className="flex p-1 bg-gray-100 dark:bg-black border border-gray-200 dark:border-gray-800 rounded-xl">
                    <button
                      type="button"
                      onClick={() => handleInputChange('type', 'credit')}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                        formData.type === 'credit'
                          ? 'bg-white dark:bg-gray-800 text-green-600 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                      }`}
                    >
                      Credit (Income)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInputChange('type', 'debit')}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                        formData.type === 'debit'
                          ? 'bg-white dark:bg-gray-800 text-red-600 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                      }`}
                    >
                      Debit (Expense)
                    </button>
                  </div>
                </div>

                {/* Store Scope (Admin only) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Store Assignment
                  </label>
                  <div className="relative">
                    <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <select
                      value={formData.store_id}
                      onChange={(e) => handleInputChange('store_id', e.target.value)}
                      disabled={!isAdmin}
                      className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm text-gray-900 dark:text-white disabled:opacity-60 appearance-none"
                    >
                      {isAdmin && <option value="errum">Errum (Global HQ)</option>}
                      {stores.map(store => (
                        <option key={store.id} value={store.id}>{store.name}</option>
                      ))}
                      {!isAdmin && userStoreId && <option value={userStoreId}>{user?.store?.name || 'Assigned Store'}</option>}
                    </select>
                  </div>
                </div>

                {/* Main Description */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Transaction Name/Title *
                  </label>
                  <div className="relative">
                    <Tag className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <textarea
                      placeholder="e.g. Office Rent - June 2026"
                      value={formData.description}
                      onChange={(e) => handleInputChange('description', e.target.value)}
                      rows={2}
                      className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm text-gray-900 dark:text-white resize-none"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Right Column: Metadata & Image */}
              <div className="space-y-5">
                {/* Internal Note */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Internal Notes
                  </label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <textarea
                      placeholder="Private notes for accounting team..."
                      value={formData.note}
                      onChange={(e) => handleInputChange('note', e.target.value)}
                      rows={2}
                      className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm text-gray-900 dark:text-white resize-none"
                    />
                  </div>
                </div>

                {/* Receipt Upload */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Receipt Attachment
                  </label>
                  <div
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    className={`relative border-2 border-dashed rounded-2xl transition-all flex flex-col items-center justify-center p-6 min-h-[160px] ${
                      preview 
                        ? 'border-blue-500/50 bg-blue-50/5 dark:bg-blue-900/5' 
                        : dragActive 
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-inner' 
                          : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-gray-50/50 dark:bg-black/50'
                    }`}
                  >
                    {preview ? (
                      <div className="relative group w-full aspect-video">
                        <img 
                          src={preview} 
                          alt="Receipt preview" 
                          className="w-full h-full object-contain rounded-lg" 
                        />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                          <button
                            type="button"
                            onClick={() => { setPreview(null); handleInputChange('receipt_image', ''); }}
                            className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-transform hover:scale-110"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="cursor-pointer flex flex-col items-center space-y-2 group">
                        <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30 transition-colors">
                          <Upload className="w-6 h-6 text-gray-400 group-hover:text-blue-500" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-blue-500 transition-colors">
                            Click or drag to upload receipt
                          </p>
                          <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-tight">PNG, JPG up to 5MB</p>
                        </div>
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(file);
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* Reference Note */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Reference Note (Voucher #)
                  </label>
                  <div className="relative">
                    <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="e.g. VCH-00123"
                      value={formData.reference_note}
                      onChange={(e) => handleInputChange('reference_note', e.target.value)}
                      className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex items-center justify-between gap-4">
          <p className="text-[10px] text-gray-500 dark:text-gray-400 max-w-[40%] leading-tight">
            Transactions recorded manually will appear in reports as "Manual Entry" and will be grouped by store or HQ.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              form="manual-transaction-form"
              type="submit"
              disabled={isSubmitting || isLoadingData}
              className="px-8 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Transaction'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
