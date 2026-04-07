'use client';

import { useState, useEffect } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import { Plus, Calendar, Tag, TrendingDown, TrendingUp, Receipt, Search, ShoppingBag, Store, Package, RefreshCw, ArrowUpDown, Image as ImageIcon } from 'lucide-react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Link from 'next/link';
import transactionService, { Transaction } from '@/services/transactionService';
import ManualEntryModal from '@/components/accounting/ManualEntryModal';
import { toast } from 'react-hot-toast';

export default function TransactionsPage() {
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    loadTransactions();
  }, []);

  const loadTransactions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch transactions sorted by date in descending order (most recent first)
      const data = await transactionService.getTransactions({
        sort_by: 'transaction_date',
        sort_order: 'desc',
        per_page: 1000 // Adjust this based on your needs
      });
      setTransactions(data.transactions || []);
    } catch (error: any) {
      console.error('Failed to load transactions:', error);
      setError(error.response?.data?.message || 'Failed to load transactions. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatCurrency = (amount: number) => {
    return `৳${Math.abs(amount).toLocaleString('en-BD', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };

  const getTransactionIcon = (transaction: Transaction) => {
    if (transaction.source === 'sale') return <Store className="w-4 h-4" />;
    if (transaction.source === 'order') return <ShoppingBag className="w-4 h-4" />;
    if (transaction.source === 'batch') return <Package className="w-4 h-4" />;
    if (transaction.source === 'return') return <RefreshCw className="w-4 h-4" />;
    if (transaction.source === 'exchange') return <ArrowUpDown className="w-4 h-4" />;
    if (transaction.type === 'income') return <TrendingUp className="w-4 h-4" />;
    return <TrendingDown className="w-4 h-4" />;
  };

  const getSourceBadge = (source: string) => {
    const badges: Record<string, { label: string; color: string }> = {
      manual: { label: 'Manual Entry', color: 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100' },
      sale: { label: 'POS Sale', color: 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white' },
      order: { label: 'Social Order', color: 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white' },
      batch: { label: 'Inventory Purchase', color: 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white' },
      return: { label: 'Return Refund', color: 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white' },
      exchange: { label: 'Exchange Adjustment', color: 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white' }
    };
    return badges[source] || badges.manual;
  };

  const filterTransactions = () => {
    let filtered = transactions;

    if (filterType !== 'all') {
      filtered = filtered.filter(t => t.type === filterType);
    }

    if (filterSource !== 'all') {
      filtered = filtered.filter(t => t.source === filterSource);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t =>
        t.name.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query) ||
        t.category.toLowerCase().includes(query) ||
        t.comment?.toLowerCase().includes(query)
      );
    }

    if (dateFilter !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      filtered = filtered.filter(t => {
        const transDate = new Date(t.createdAt);
        
        switch (dateFilter) {
          case 'today':
            return transDate >= today;
          case 'week':
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 7);
            return transDate >= weekAgo;
          case 'month':
            const monthAgo = new Date(today);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            return transDate >= monthAgo;
          default:
            return true;
        }
      });
    }

    return filtered;
  };

  const filteredTransactions = filterTransactions();

  const totalIncome = filteredTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  
  const totalExpense = filteredTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);
  
  const netBalance = totalIncome - totalExpense;

  const uniqueSources = ['all', ...new Set(transactions.map(t => t.source))];

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex h-screen bg-white dark:bg-black overflow-hidden">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header 
            darkMode={darkMode} 
            setDarkMode={setDarkMode}
            toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          />
          
          <main className="flex-1 overflow-y-auto">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
                <div>
                  <h1 className="text-xl font-semibold text-gray-900 dark:text-white tracking-tight mb-0.5">
                    Transactions
                  </h1>
                  <p className="text-gray-500 dark:text-gray-400 text-xs">
                    All financial activities from your ERP system
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={loadTransactions}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-200 border border-gray-200 dark:border-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    <span className="font-medium">Refresh</span>
                  </button>
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-black dark:bg-white text-white dark:text-black rounded-md hover:bg-gray-800 dark:hover:bg-gray-100 transition-all duration-200 font-medium text-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Manual Entry
                  </button>
                </div>
              </div>

              <ManualEntryModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={() => {
                  loadTransactions();
                  toast.success('List updated');
                }}
              />

              {error && (
                <div className="mb-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0 mt-0.5">
                      <div className="w-4 h-4 rounded-full bg-gray-900 dark:bg-white flex items-center justify-center">
                        <svg className="w-2.5 h-2.5 text-white dark:text-black" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-900 dark:text-white font-medium">{error}</p>
                    </div>
                    <button
                      onClick={() => setError(null)}
                      className="flex-shrink-0 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Total Income
                    </span>
                    <div className="p-1.5 bg-gray-100 dark:bg-gray-800 rounded-md">
                      <TrendingUp className="w-4 h-4 text-gray-900 dark:text-white" />
                    </div>
                  </div>
                  <div className="text-xl font-semibold text-gray-900 dark:text-white mb-1">
                    {formatCurrency(totalIncome)}
                  </div>
                  <p className="text-[10px] text-gray-500 dark:text-gray-500">
                    From sales, orders & other sources
                  </p>
                </div>

                <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Total Expense
                    </span>
                    <div className="p-1.5 bg-gray-100 dark:bg-gray-800 rounded-md">
                      <TrendingDown className="w-4 h-4 text-gray-900 dark:text-white" />
                    </div>
                  </div>
                  <div className="text-xl font-semibold text-gray-900 dark:text-white mb-1">
                    {formatCurrency(totalExpense)}
                  </div>
                  <p className="text-[10px] text-gray-500 dark:text-gray-500">
                    Inventory, returns & operating costs
                  </p>
                </div>

                <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Net Balance
                    </span>
                    <div className="p-1.5 bg-gray-100 dark:bg-gray-800 rounded-md">
                      <Receipt className="w-4 h-4 text-gray-900 dark:text-white" />
                    </div>
                  </div>
                  <div className="text-xl font-semibold text-gray-900 dark:text-white mb-1">
                    {netBalance >= 0 ? '+' : '-'}{formatCurrency(netBalance)}
                  </div>
                  <p className="text-[10px] text-gray-500 dark:text-gray-500">
                    {netBalance >= 0 ? 'Profit' : 'Loss'} for selected period
                  </p>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 mb-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search transactions..."
                      className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-800 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-transparent bg-white dark:bg-black text-gray-900 dark:text-white placeholder-gray-400 transition-all duration-200"
                    />
                  </div>

                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as any)}
                    className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-800 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-transparent bg-white dark:bg-black text-gray-900 dark:text-white transition-all duration-200"
                  >
                    <option value="all">All Types</option>
                    <option value="income">Income Only</option>
                    <option value="expense">Expenses Only</option>
                  </select>

                  <select
                    value={filterSource}
                    onChange={(e) => setFilterSource(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-800 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-transparent bg-white dark:bg-black text-gray-900 dark:text-white transition-all duration-200"
                  >
                    <option value="all">All Sources</option>
                    {uniqueSources.filter(s => s !== 'all').map(source => (
                      <option key={source} value={source}>
                        {getSourceBadge(source).label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value as any)}
                    className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-800 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-transparent bg-white dark:bg-black text-gray-900 dark:text-white transition-all duration-200"
                  >
                    <option value="all">All Time</option>
                    <option value="today">Today</option>
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                  </select>
                </div>

                {(filterType !== 'all' || filterSource !== 'all' || searchQuery || dateFilter !== 'all') && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-800">
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Active filters:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {filterType !== 'all' && (
                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white text-[10px] font-medium rounded-full">
                          {filterType === 'income' ? 'Income' : 'Expense'}
                        </span>
                      )}
                      {filterSource !== 'all' && (
                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white text-[10px] font-medium rounded-full">
                          {getSourceBadge(filterSource).label}
                        </span>
                      )}
                      {searchQuery && (
                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white text-[10px] font-medium rounded-full">
                          Search: "{searchQuery}"
                        </span>
                      )}
                      {dateFilter !== 'all' && (
                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white text-[10px] font-medium rounded-full">
                          {dateFilter.charAt(0).toUpperCase() + dateFilter.slice(1)}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setFilterType('all');
                        setFilterSource('all');
                        setSearchQuery('');
                        setDateFilter('all');
                      }}
                      className="ml-auto text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium transition-colors"
                    >
                      Clear all
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
                {isLoading ? (
                  <div className="text-center py-12">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-gray-200 dark:border-gray-800 border-t-gray-900 dark:border-t-white"></div>
                    <p className="text-gray-500 dark:text-gray-400 mt-3 text-sm font-medium">Loading transactions...</p>
                  </div>
                ) : filteredTransactions.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 mb-3">
                      <Receipt className="w-6 h-6 text-gray-400" />
                    </div>
                    <div className="text-gray-900 dark:text-white font-semibold text-base mb-1">No transactions found</div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 max-w-md mx-auto">
                      {filterType !== 'all' || filterSource !== 'all' || searchQuery || dateFilter !== 'all'
                        ? 'Try adjusting your filters to see more results'
                        : 'Transactions from sales, orders, and batches will appear here automatically'}
                    </p>
                    <Link
                      href="/transaction/new"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black dark:bg-white text-white dark:text-black rounded-md hover:bg-gray-800 dark:hover:bg-gray-100 transition-all duration-200 font-medium text-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Manual Entry
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {filteredTransactions.map((transaction) => {
                      const sourceBadge = getSourceBadge(transaction.source);
                      
                      return (
                        <div 
                          key={transaction.id} 
                          className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all duration-200"
                        >
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white flex-shrink-0">
                              {getTransactionIcon(transaction)}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-4 mb-2">
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1 text-sm flex items-center gap-2">
                                    {transaction.name}
                                    <span className="text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-mono border border-blue-100 dark:border-blue-800/50">
                                      {transaction.referenceId}
                                    </span>
                                  </h3>
                                  {transaction.description && (
                                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 leading-relaxed">
                                      {transaction.description}
                                    </p>
                                  )}
                                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                                    <div className="flex items-center gap-1">
                                      <Calendar className="w-3.5 h-3.5" />
                                      <span>{formatDate(transaction.createdAt)}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <Tag className="w-3.5 h-3.5" />
                                      <span>{transaction.category}</span>
                                    </div>
                                    <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${sourceBadge.color}`}>
                                      {transaction.referenceLabel || sourceBadge.label}
                                    </span>
                                    {transaction.receiptImage && (
                                      <div className="flex items-center gap-1 text-gray-900 dark:text-white">
                                        <ImageIcon className="w-3.5 h-3.5" />
                                        <span className="text-[10px] font-medium">Receipt</span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="text-right flex-shrink-0">
                                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                                    {transaction.type === 'income' ? '+' : '-'}{formatCurrency(transaction.amount)}
                                  </div>
                                </div>
                              </div>

                              {transaction.comment && (
                                <p className="text-xs text-gray-600 dark:text-gray-400 italic mt-2 pl-3 border-l-2 border-gray-200 dark:border-gray-700 leading-relaxed bg-gray-50/50 dark:bg-gray-800/30 p-2 rounded-r">
                                  {transaction.comment}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {!isLoading && filteredTransactions.length > 0 && (
                <div className="mt-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400 font-medium">
                      Showing {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}
                    </span>
                    <div className="flex items-center gap-4">
                      <span className="text-gray-900 dark:text-white font-semibold">
                        Income: {formatCurrency(totalIncome)}
                      </span>
                      <span className="text-gray-900 dark:text-white font-semibold">
                        Expense: {formatCurrency(totalExpense)}
                      </span>
                      <span className="text-gray-900 dark:text-white font-bold">
                        Net: {netBalance >= 0 ? '+' : '-'}{formatCurrency(netBalance)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}