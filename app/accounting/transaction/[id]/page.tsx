'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  FileText, 
  Paperclip, 
  Link as LinkIcon, 
  Plus, 
  ExternalLink, 
  Image as ImageIcon,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Download,
  Upload,
  Layers
} from 'lucide-react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from '@/contexts/AuthContext';
import transactionService, { BackendTransaction, Transaction } from '@/services/transactionService';

interface TransactionPageProps {
  params: Promise<{ id: string }>;
}

export default function TransactionDetailPage({ params }: TransactionPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { darkMode, setDarkMode } = useTheme();
  const { role, storeId: userStoreId, isLoading: authLoading } = useAuth() as any;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [transaction, setTransaction] = useState<any>(null);
  const [relatedTransactions, setRelatedTransactions] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [newReference, setNewReference] = useState({ label: '', url: '' });
  const [showRefForm, setShowRefForm] = useState(false);

  // Permissions check
  const isAuthorized = role === 'admin' || role === 'super-admin' || role === 'branch-manager';

  useEffect(() => {
    if (!authLoading && !isAuthorized) {
      router.push('/dashboard');
    }
  }, [authLoading, isAuthorized]);

  useEffect(() => {
    if (!authLoading && isAuthorized) {
      fetchTransaction();
    }
  }, [id, authLoading, isAuthorized]);

  const fetchTransaction = async () => {
    try {
      setLoading(true);
      const data = await transactionService.getTransaction(parseInt(id));
      setTransaction(data.transaction);
      setRelatedTransactions(data.related_transactions || []);
    } catch (error) {
      console.error('Error fetching transaction:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      await transactionService.addAttachment(parseInt(id), file);
      await fetchTransaction(); // Refresh
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload attachment');
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddReference = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReference.label || !newReference.url) return;

    try {
      await transactionService.addReference(parseInt(id), newReference.label, newReference.url);
      setNewReference({ label: '', url: '' });
      setShowRefForm(false);
      await fetchTransaction(); // Refresh
    } catch (error) {
      console.error('Failed to add reference:', error);
      alert('Failed to add reference');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
          <CheckCircle2 className="w-3.5 h-3.5" /> Completed
        </span>;
      case 'pending':
        return <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">
          <Clock className="w-3.5 h-3.5" /> Pending
        </span>;
      case 'failed':
        return <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
          <XCircle className="w-3.5 h-3.5" /> Failed
        </span>;
      default:
        return <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400">
          {status}
        </span>;
    }
  };

  if (authLoading || (isAuthorized && !role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!isAuthorized) {
    return null;
  }

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-white">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />

        <div className="flex-1 flex flex-col overflow-hidden">
          <Header 
            darkMode={darkMode} 
            setDarkMode={setDarkMode} 
            toggleSidebar={() => setSidebarOpen(!sidebarOpen)} 
          />

          <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
          {/* Top Bar / Back Button */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <button 
              onClick={() => router.back()}
              className="flex items-center gap-2 text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors group w-fit"
            >
              <div className="p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 group-hover:border-gray-300 dark:group-hover:border-gray-600">
                <ArrowLeft className="w-5 h-5" />
              </div>
              <span className="font-medium">Back to Accounting</span>
            </button>
            
            {!loading && transaction && (
              <div className="flex items-center gap-3">
                {getStatusBadge(transaction.status)}
                <div className="h-4 w-px bg-gray-300 dark:bg-gray-700 hidden md:block"></div>
                <div className="text-sm font-mono text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700">
                  #{transaction.id}
                </div>
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center p-20 space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
              <p className="text-gray-500 animate-pulse">Loading transaction details...</p>
            </div>
          ) : !transaction ? (
            <div className="bg-white dark:bg-gray-800 p-12 rounded-2xl border border-gray-200 dark:border-gray-700 text-center">
              <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">Transaction Not Found</h2>
              <p className="text-gray-500 mb-6">The transaction you're looking for doesn't exist or has been removed.</p>
              <button onClick={() => router.push('/accounting')} className="btn-primary">Return to Ledger</button>
            </div>
          ) : (
            <>
              {/* Main Card */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  {/* General Info */}
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-indigo-50/50 to-transparent dark:from-indigo-900/10 dark:to-transparent">
                      <div className="flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                          <FileText className="w-6 h-6" />
                        </div>
                        <div>
                          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{transaction.name}</h1>
                          <p className="text-sm text-gray-500">{transaction.source.toUpperCase()} • {new Date(transaction.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' })}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                      <div>
                        <p className="text-sm text-gray-400 mb-1">Amount</p>
                        <p className={`text-2xl font-black ${transaction.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                          {transaction.type === 'income' ? '+' : '-'} {new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT' }).format(transaction.amount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400 mb-1">Category</p>
                        <p className="text-lg font-semibold">{transaction.category}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400 mb-1">Reference ID</p>
                        <p className="text-lg font-mono">{transaction.referenceId || 'N/A'}</p>
                      </div>
                      <div className="md:col-span-2 lg:col-span-3">
                        <p className="text-sm text-gray-400 mb-1">Description</p>
                        <p className="text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg border border-gray-200 dark:border-gray-800 italic">
                          {transaction.description || "No additional description provided."}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Journal Bundle / Related Transactions */}
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Layers className="w-5 h-5 text-indigo-500" />
                        <h3 className="font-bold text-lg">Journal Bundle</h3>
                      </div>
                      {transaction.metadata?.group_id && (
                        <div className="text-[10px] sm:text-xs font-mono text-gray-400 bg-gray-50 dark:bg-gray-900 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 truncate max-w-[150px] sm:max-w-none">
                          GROUP: {transaction.metadata.group_id}
                        </div>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-gray-50 dark:bg-gray-900/50 text-xs font-bold text-gray-400 uppercase tracking-widest">
                          <tr>
                            <th className="px-6 py-4">Account</th>
                            <th className="px-6 py-4">Type</th>
                            <th className="px-6 py-4 text-right">Debit</th>
                            <th className="px-6 py-4 text-right">Credit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                          {relatedTransactions.length > 0 ? (
                            relatedTransactions.map((related: any) => (
                              <tr key={related.id} className={related.id === transaction.id ? "bg-indigo-50/30 dark:bg-indigo-900/10" : ""}>
                                <td className="px-6 py-4">
                                  <div className="text-sm font-semibold">{related.account?.name || 'Unknown Account'}</div>
                                  <div className="text-xs text-gray-400">Code: {related.account?.account_code || 'N/A'}</div>
                                </td>
                                <td className="px-6 py-4">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${related.type === 'debit' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                    {related.type}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-right font-mono text-sm">
                                  {related.type === 'debit' ? new Intl.NumberFormat('en-BD').format(related.amount) : '—'}
                                </td>
                                <td className="px-6 py-4 text-right font-mono text-sm">
                                  {related.type === 'credit' ? new Intl.NumberFormat('en-BD').format(related.amount) : '—'}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={4} className="px-6 py-8 text-center text-gray-400 italic">
                                This transaction belongs to a single-entry event or group identifiers are missing.
                              </td>
                            </tr>
                          )}
                        </tbody>
                        <tfoot className="bg-gray-50 dark:bg-gray-900/50 font-bold border-t-2 border-gray-200 dark:border-gray-700 text-sm">
                          <tr>
                            <td className="px-6 py-4 text-gray-400">ENTRY TOTALS</td>
                            <td></td>
                            <td className="px-6 py-4 text-right font-mono">
                              {new Intl.NumberFormat('en-BD').format(relatedTransactions.filter(r => r.type === 'debit').reduce((sum, r) => sum + parseFloat(r.amount), 0))}
                            </td>
                            <td className="px-6 py-4 text-right font-mono">
                              {new Intl.NumberFormat('en-BD').format(relatedTransactions.filter(r => r.type === 'credit').reduce((sum, r) => sum + parseFloat(r.amount), 0))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Evidence / Attachments */}
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Paperclip className="w-5 h-5 text-indigo-500" />
                        <h3 className="font-bold">Attachments</h3>
                      </div>
                      <label className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 cursor-pointer transition-colors shadow-sm border border-indigo-200 dark:border-indigo-800">
                        <Plus className="w-4 h-4" />
                        <input type="file" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
                      </label>
                    </div>
                    <div className="p-4 space-y-3">
                      {isUploading && (
                        <div className="flex items-center gap-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-dashed border-indigo-300 dark:border-indigo-700 animate-pulse">
                          <Upload className="w-4 h-4 text-indigo-500" />
                          <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">Uploading evidence...</span>
                        </div>
                      )}
                      
                      {transaction.metadata?.attachments?.length > 0 ? (
                        transaction.metadata.attachments.map((file: any, index: number) => (
                          <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 group transition-all">
                            <div className="flex items-center gap-3 overflow-hidden">
                              <div className="p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xs">
                                <ImageIcon className="w-4 h-4 text-gray-400 group-hover:text-indigo-500 transition-colors" />
                              </div>
                              <div className="overflow-hidden">
                                <p className="text-sm font-semibold truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{file.name}</p>
                                <p className="text-[10px] text-gray-400 uppercase tracking-tighter">{new Date(file.uploaded_at).toLocaleString()}</p>
                              </div>
                            </div>
                            <a 
                              href={file.url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-gray-800 rounded-lg transition-all"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          </div>
                        ))
                      ) : (
                        !isUploading && (
                          <div className="text-center py-8">
                            <ImageIcon className="w-10 h-10 text-gray-200 dark:text-gray-700 mx-auto mb-2" />
                            <p className="text-xs text-gray-400 italic">No attachments yet.</p>
                          </div>
                        )
                      )}
                    </div>
                  </div>

                  {/* External References */}
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <LinkIcon className="w-5 h-5 text-indigo-500" />
                        <h3 className="font-bold">References</h3>
                      </div>
                      <button 
                        onClick={() => setShowRefForm(!showRefForm)}
                        className={`p-1.5 rounded-lg transition-all border ${showRefForm ? 'bg-indigo-600 text-white border-indigo-600 shadow-indigo-500/30' : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100'}`}
                      >
                        <Plus className={`w-4 h-4 transition-transform ${showRefForm ? 'rotate-45' : ''}`} />
                      </button>
                    </div>
                    <div className="p-4 space-y-4">
                      {showRefForm && (
                        <form onSubmit={handleAddReference} className="p-4 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-xl border border-indigo-200 dark:border-indigo-800 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                          <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Label</label>
                            <input 
                              type="text" 
                              value={newReference.label}
                              onChange={e => setNewReference({...newReference, label: e.target.value})}
                              placeholder="e.g. Courier Invoice" 
                              className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">URL</label>
                            <input 
                              type="url" 
                              value={newReference.url}
                              onChange={e => setNewReference({...newReference, url: e.target.value})}
                              placeholder="https://..." 
                              className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            />
                          </div>
                          <button type="submit" className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold shadow-md shadow-indigo-500/20 transition-all active:scale-95">
                            Add Reference
                          </button>
                        </form>
                      )}

                      {transaction.metadata?.additional_references?.length > 0 ? (
                        transaction.metadata.additional_references.map((ref: any, index: number) => (
                          <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 group transition-all">
                            <div className="flex items-center gap-3 overflow-hidden">
                              <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800">
                                <LinkIcon className="w-3.5 h-3.5 text-indigo-500" />
                              </div>
                              <div className="overflow-hidden">
                                <p className="text-sm font-semibold truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{ref.label}</p>
                                <p className="text-[10px] text-gray-400 truncate">ID: {ref.transaction_id || transaction.id}</p>
                              </div>
                            </div>
                            <a 
                              href={ref.url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </div>
                        ))
                      ) : (
                        !showRefForm && (
                          <div className="text-center py-8">
                            <LinkIcon className="w-10 h-10 text-gray-200 dark:text-gray-700 mx-auto mb-2" />
                            <p className="text-xs text-gray-400 italic">No external references.</p>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
          </main>
        </div>
      </div>
    </div>
  );
}
