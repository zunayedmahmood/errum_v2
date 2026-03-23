'use client';

import { useState, useEffect } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import { FileText, BookOpen, TrendingUp, Download, Search, RefreshCw } from 'lucide-react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import accountingService, {
  Account,
  Transaction,
  TrialBalanceData,
  LedgerData,
  JournalEntry,
  JournalEntryLine
} from '@/services/accountingService';

export default function AccountingSystem() {
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('journal');
  const [dateRange, setDateRange] = useState({ 
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  
  // State for accounting data
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [trialBalance, setTrialBalance] = useState<TrialBalanceData | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<number | null>(null);
  const [ledgerData, setLedgerData] = useState<LedgerData | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (activeTab === 'journal') {
      fetchJournalEntries();
    } else if (activeTab === 'trial-balance') {
      fetchTrialBalance();
    } else if (activeTab === 'transactions') {
      fetchTransactions();
    }
  }, [activeTab, dateRange]);

  useEffect(() => {
    if (selectedAccount && activeTab === 'ledger') {
      fetchLedger(selectedAccount);
    }
  }, [selectedAccount, dateRange]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      
      // Fetch accounts using service (support both {success,data} and direct arrays)
      const accountsRes: any = await accountingService.accounts.getAccounts();
      const accountsData = accountsRes?.success
        ? (Array.isArray(accountsRes.data) ? accountsRes.data : accountsRes.data?.data || [])
        : (Array.isArray(accountsRes) ? accountsRes : Array.isArray(accountsRes?.data) ? accountsRes.data : []);

      if (accountsData && accountsData.length >= 0) {
        setAccounts(accountsData);
        console.log('✅ Loaded accounts:', accountsData.length);
      }
      
      // Fetch journal entries by default
      await fetchJournalEntries();
      
    } catch (error: any) {
      console.error('Error fetching initial data:', error);
      alert(error.response?.data?.message || 'Failed to fetch accounting data');
    } finally {
      setLoading(false);
    }
  };

const fetchJournalEntries = async () => {
  try {
    setLoading(true);
    
    const response = await accountingService.reports.getJournalEntries({
      date_from: dateRange.start,
      date_to: dateRange.end,
    });
    
    if (response.success) {
      console.log('🔍 RAW TRANSACTIONS FROM BACKEND:', response);
      
      // Sort by date descending (most recent first)
      const sortedEntries = response.data.sort((a: JournalEntry, b: JournalEntry) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      
      console.log('📝 GROUPED JOURNAL ENTRIES:', sortedEntries);
      
      setJournalEntries(sortedEntries);
      console.log('✅ Loaded journal entries:', sortedEntries.length);
    }
  } catch (error: any) {
    console.error('Error fetching journal entries:', error);
    alert(error.response?.data?.message || 'Failed to fetch journal entries');
  } finally {
    setLoading(false);
  }
};

  const fetchTrialBalance = async () => {
    try {
      setLoading(true);
      
      console.log('🔄 Fetching trial balance with date range:', dateRange);
      
      const response = await accountingService.reports.getTrialBalance({
        start_date: dateRange.start,
        end_date: dateRange.end,
      });
      
      console.log('📊 Trial balance response:', response);
      
      if (response.success) {
        setTrialBalance(response.data);
        console.log('✅ Trial balance loaded:', {
          accounts: response.data.accounts.length,
          total_debits: response.data.summary.total_debits,
          total_credits: response.data.summary.total_credits,
          balanced: response.data.summary.balanced
        });
      } else {
        console.error('❌ Trial balance fetch failed:', response);
        alert('Failed to fetch trial balance');
      }
    } catch (error: any) {
      console.error('❌ Error fetching trial balance:', error);
      alert(error.response?.data?.message || error.message || 'Failed to fetch trial balance');
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      
      const response = await accountingService.transactions.getTransactions({
        date_from: dateRange.start,
        date_to: dateRange.end,
        search: searchTerm || undefined,
        sort_by: 'transaction_date',
        sort_order: 'desc',
        per_page: 1000,
      });
      
      if (response.success) {
        const txnData = response.data.data || response.data;
        const txnArray = Array.isArray(txnData) ? txnData : (txnData?.data || []);
        
        // Sort by date descending (most recent first)
        const sortedTransactions = txnArray.sort(
          (a: Transaction, b: Transaction) => 
            new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
        );
        setTransactions(sortedTransactions);
        console.log('✅ Loaded transactions:', sortedTransactions.length);
      }
    } catch (error: any) {
      console.error('Error fetching transactions:', error);
      alert(error.response?.data?.message || 'Failed to fetch transactions');
    } finally {
      setLoading(false);
    }
  };

  const fetchLedger = async (accountId: number) => {
    try {
      setLoading(true);
      
      const response = await accountingService.reports.getAccountLedger(accountId, {
        date_from: dateRange.start,
        date_to: dateRange.end,
      });
      
      if (response.success) {
        setLedgerData(response.data);
        console.log('✅ Loaded ledger:', {
          account: response.data.account.name,
          transactions: response.data.transactions.length
        });
      }
    } catch (error: any) {
      console.error('Error fetching ledger:', error);
      alert(error.response?.data?.message || 'Failed to fetch ledger');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (activeTab === 'journal') {
      await fetchJournalEntries();
    } else if (activeTab === 'trial-balance') {
      await fetchTrialBalance();
    } else if (activeTab === 'transactions') {
      await fetchTransactions();
    } else if (activeTab === 'ledger' && selectedAccount) {
      await fetchLedger(selectedAccount);
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-BD', { 
      style: 'currency', 
      currency: 'BDT',
      minimumFractionDigits: 2 
    }).format(amount);
  };

  const formatDate = (date: string | Date): string => {
    const d = new Date(date as any);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleExport = (type: 'journal' | 'trial-balance' | 'transactions' | 'ledger') => {
    try {
      if (type === 'journal') {
        // Convert journal entries to flat format for CSV
        const flatData = journalEntries.flatMap(entry => 
          entry.lines.map(line => ({
            date: entry.date,
            reference: `${entry.reference_type}-${entry.reference_id}`,
            description: entry.description,
            account_code: line.account.account_code,
            account_name: line.account.name,
            debit: line.debit,
            credit: line.credit
          }))
        );
        accountingService.reports.exportTransactionsCSV(flatData as any, 'journal-entries');
      } else if (type === 'trial-balance' && trialBalance) {
        accountingService.reports.exportTrialBalanceCSV(
          trialBalance.accounts,
          'trial-balance'
        );
      } else if (type === 'transactions') {
        accountingService.reports.exportTransactionsCSV(
          transactions,
          'transactions'
        );
      } else if (type === 'ledger' && ledgerData) {
        accountingService.reports.exportLedgerCSV(
          ledgerData.transactions,
          ledgerData.account.name,
          `ledger-${ledgerData.account.account_code}`
        );
      }
    } catch (error) {
      console.error('Error exporting:', error);
      alert('Failed to export data');
    }
  };

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header 
            darkMode={darkMode} 
            setDarkMode={setDarkMode} 
            toggleSidebar={() => setSidebarOpen(!sidebarOpen)} 
          />
          
          <main className="flex-1 overflow-auto p-6">
            <div className="max-w-7xl mx-auto">
              {/* Header */}
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Accounting System
                </h1>
                <p className="text-gray-600 dark:text-gray-400">
                  Double-entry bookkeeping with real-time financial reports
                </p>
              </div>

              {/* Tabs */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mb-6">
                <div className="flex border-b border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => setActiveTab('journal')}
                    className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors ${
                      activeTab === 'journal'
                        ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                  >
                    <FileText className="w-5 h-5" />
                    Journal Entries
                  </button>
                  <button
                    onClick={() => setActiveTab('trial-balance')}
                    className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors ${
                      activeTab === 'trial-balance'
                        ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                  >
                    <TrendingUp className="w-5 h-5" />
                    Trial Balance
                  </button>
                  <button
                    onClick={() => setActiveTab('transactions')}
                    className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors ${
                      activeTab === 'transactions'
                        ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                  >
                    <FileText className="w-5 h-5" />
                    Transactions
                  </button>
                  <button
                    onClick={() => setActiveTab('ledger')}
                    className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors ${
                      activeTab === 'ledger'
                        ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                  >
                    <BookOpen className="w-5 h-5" />
                    Account Ledger
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Filters</h3>
                  <button 
                    onClick={handleRefresh}
                    disabled={loading}
                    className="flex items-center gap-2 px-3 py-1.5 bg-black hover:bg-gray-900 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {activeTab === 'transactions' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Search
                      </label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && fetchTransactions()}
                          placeholder="Search transactions..."
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                    </div>
                  )}
                  {activeTab === 'ledger' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Select Account
                      </label>
                      <select
                        value={selectedAccount || ''}
                        onChange={(e) => setSelectedAccount(Number(e.target.value))}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">Choose an account</option>
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.account_code} - {account.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={dateRange.start}
                      onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={dateRange.end}
                      onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Content */}
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
                </div>
              )}

              {!loading && activeTab === 'journal' && (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Journal Entries ({journalEntries.length})
                    </h2>
                    <button 
                      onClick={() => handleExport('journal')}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      <Download className="w-4 h-4" />
                      Export
                    </button>
                  </div>
                  <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {journalEntries.length === 0 ? (
                      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                        No journal entries found for the selected period
                      </div>
                    ) : (
                      journalEntries.map((entry) => (
                        <div key={entry.id} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-750">
                          {/* Entry Header */}
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-4">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                                    {formatDate(entry.date)}
                                  </span>
                                  <span className="px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                                    {entry.reference_type}
                                  </span>
                                  {!entry.balanced && (
                                    <span className="px-2 py-1 text-xs font-medium bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded">
                                      ⚠️ Unbalanced
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                  {entry.description}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Entry Lines */}
                          <div className="bg-gray-50 dark:bg-gray-750 rounded-lg overflow-hidden">
                            <table className="w-full">
                              <thead className="bg-gray-100 dark:bg-gray-700">
                                <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                  <th className="px-4 py-2">Account</th>
                                  <th className="px-4 py-2 text-right">Debit</th>
                                  <th className="px-4 py-2 text-right">Credit</th>
                                </tr>
                              </thead>
                              <tbody>
                                {entry.lines.map((line: JournalEntryLine, idx: number) => (
                                  <tr key={idx} className="border-t border-gray-200 dark:border-gray-600">
                                    <td className="px-4 py-2 text-sm">
                                      <div>
                                        <span className="font-medium text-gray-900 dark:text-white">
                                          {line.account.account_code}
                                        </span>
                                        <span className="text-gray-600 dark:text-gray-400 ml-2">
                                          {line.account.name}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-2 text-sm text-right font-medium text-gray-900 dark:text-white">
                                      {line.debit > 0 ? formatCurrency(line.debit) : '—'}
                                    </td>
                                    <td className="px-4 py-2 text-sm text-right font-medium text-gray-900 dark:text-white">
                                      {line.credit > 0 ? formatCurrency(line.credit) : '—'}
                                    </td>
                                  </tr>
                                ))}
                                {/* Totals Row */}
                                <tr className="border-t-2 border-gray-300 dark:border-gray-500 bg-gray-100 dark:bg-gray-700 font-semibold">
                                  <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">
                                    TOTAL
                                  </td>
                                  <td className="px-4 py-2 text-sm text-right text-gray-900 dark:text-white">
                                    {formatCurrency(entry.total_debit)}
                                  </td>
                                  <td className="px-4 py-2 text-sm text-right text-gray-900 dark:text-white">
                                    {formatCurrency(entry.total_credit)}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {/* Balance Check */}
                          {entry.balanced ? (
                            <div className="mt-2 text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                              <span>✓</span>
                              <span>Balanced Entry</span>
                            </div>
                          ) : (
                            <div className="mt-2 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                              <span>⚠️</span>
                              <span>
                                Difference: {formatCurrency(Math.abs(entry.total_debit - entry.total_credit))}
                              </span>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {!loading && activeTab === 'trial-balance' && trialBalance && (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Trial Balance</h2>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          As of {formatDate(trialBalance.date_range.end_date)}
                        </p>
                      </div>
                      <button 
                        onClick={() => handleExport('trial-balance')}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                      >
                        <Download className="w-4 h-4" />
                        Export
                      </button>
                    </div>
                  </div>

                  {/* Summary Card */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-750">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">Total Debits</p>
                        <p className="text-xl font-bold text-gray-900 dark:text-white">
                          {formatCurrency(trialBalance.summary.total_debits)}
                        </p>
                      </div>
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">Total Credits</p>
                        <p className="text-xl font-bold text-gray-900 dark:text-white">
                          {formatCurrency(trialBalance.summary.total_credits)}
                        </p>
                      </div>
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">Difference</p>
                        <p className={`text-xl font-bold ${trialBalance.summary.difference === 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {formatCurrency(Math.abs(trialBalance.summary.difference))}
                        </p>
                      </div>
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">Status</p>
                        <p className={`text-xl font-bold ${trialBalance.summary.balanced ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {trialBalance.summary.balanced ? '✓ Balanced' : '✗ Not Balanced'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-750">
                        <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                          <th className="px-4 py-3">Account Code</th>
                          <th className="px-4 py-3">Account Name</th>
                          <th className="px-4 py-3">Type</th>
                          <th className="px-4 py-3 text-right">Debit</th>
                          <th className="px-4 py-3 text-right">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trialBalance.accounts.map((account, idx) => (
                          <tr key={account.id || idx} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750">
                            <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                              {account.account_code}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                              {account.name || account.account_name}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 text-xs font-medium rounded ${
                                account.type === 'asset' ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' :
                                account.type === 'liability' ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300' :
                                account.type === 'equity' ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' :
                                account.type === 'income' || account.type === 'revenue' ? 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300' :
                                'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'
                              }`}>
                                {account.type}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">
                              {account.debit && account.debit > 0 ? formatCurrency(account.debit) : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">
                              {account.credit && account.credit > 0 ? formatCurrency(account.credit) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 dark:bg-gray-750 border-t-2 border-gray-300 dark:border-gray-600">
                        <tr>
                          <td colSpan={3} className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-white">
                            TOTAL
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-bold text-gray-900 dark:text-white">
                            {formatCurrency(trialBalance.summary.total_debits)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-bold text-gray-900 dark:text-white">
                            {formatCurrency(trialBalance.summary.total_credits)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {!loading && activeTab === 'transactions' && (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Transactions ({transactions.length})
                    </h2>
                    <button 
                      onClick={() => handleExport('transactions')}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      <Download className="w-4 h-4" />
                      Export
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    {transactions.length === 0 ? (
                      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                        No transactions found for the selected period
                      </div>
                    ) : (
                      <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-750">
                          <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                            <th className="px-4 py-3">Transaction #</th>
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3">Account</th>
                            <th className="px-4 py-3">Description</th>
                            <th className="px-4 py-3">Type</th>
                            <th className="px-4 py-3 text-right">Amount</th>
                            <th className="px-4 py-3">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {transactions.map((txn) => (
                            <tr key={txn.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750">
                              <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                                {txn.transaction_number}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                {formatDate(txn.transaction_date)}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                {txn.account?.account_code} - {txn.account?.name}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                {txn.description}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 text-xs font-medium rounded ${
                                  txn.type === 'debit' 
                                    ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' 
                                    : 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'
                                }`}>
                                  {txn.type === 'debit' ? '+ Debit' : '- Credit'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-white">
                                {formatCurrency(txn.amount)}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 text-xs font-medium rounded ${
                                  txn.status === 'completed' ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' :
                                  txn.status === 'pending' ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300' :
                                  txn.status === 'failed' ? 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300' :
                                  'bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300'
                                }`}>
                                  {txn.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {!loading && activeTab === 'ledger' && (
                <div className="space-y-4">
                  {!selectedAccount ? (
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
                      <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600 dark:text-gray-400">
                        Please select an account from the dropdown above to view its ledger
                      </p>
                    </div>
                  ) : ledgerData ? (
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <div className="p-4 bg-gray-50 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                              {ledgerData.account.account_code} - {ledgerData.account.name}
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {formatDate(ledgerData.date_range.date_from)} - {formatDate(ledgerData.date_range.date_to)}
                            </p>
                          </div>
                          <button 
                            onClick={() => handleExport('ledger')}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                          >
                            <Download className="w-4 h-4" />
                            Export
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">Opening Balance</p>
                            <p className="text-lg font-bold text-gray-900 dark:text-white">
                              {formatCurrency(ledgerData.opening_balance)}
                            </p>
                          </div>
                          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">Closing Balance</p>
                            <p className="text-lg font-bold text-gray-900 dark:text-white">
                              {formatCurrency(ledgerData.closing_balance)}
                            </p>
                          </div>
                          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">Net Change</p>
                            <p className={`text-lg font-bold ${
                              (ledgerData.closing_balance - ledgerData.opening_balance) >= 0 
                                ? 'text-green-600 dark:text-green-400' 
                                : 'text-red-600 dark:text-red-400'
                            }`}>
                              {formatCurrency(Math.abs(ledgerData.closing_balance - ledgerData.opening_balance))}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        {ledgerData.transactions.length === 0 ? (
                          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                            No transactions found for this account in the selected period
                          </div>
                        ) : (
                          <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-750">
                              <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                <th className="px-4 py-3">Date</th>
                                <th className="px-4 py-3">Transaction #</th>
                                <th className="px-4 py-3">Description</th>
                                <th className="px-4 py-3 text-right">Debit</th>
                                <th className="px-4 py-3 text-right">Credit</th>
                                <th className="px-4 py-3 text-right">Balance</th>
                                <th className="px-4 py-3">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {ledgerData.transactions.map((entry) => (
                                <tr key={entry.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750">
                                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                    {formatDate(entry.transaction_date)}
                                  </td>
                                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                                    {entry.transaction_number}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                    {entry.description}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">
                                    {entry.debit > 0 ? formatCurrency(entry.debit) : '-'}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">
                                    {entry.credit > 0 ? formatCurrency(entry.credit) : '-'}
                                  </td>
                                  <td className={`px-4 py-3 text-sm text-right font-medium ${
                                    entry.balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                                  }`}>
                                    {formatCurrency(Math.abs(entry.balance))}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className={`px-2 py-1 text-xs font-medium rounded ${
                                      entry.status === 'completed' ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' :
                                      entry.status === 'pending' ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300' :
                                      'bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300'
                                    }`}>
                                      {entry.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}