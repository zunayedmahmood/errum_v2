import axiosInstance from '@/lib/axios';

// ============================================
// ACCOUNT CACHE (helps when backend doesn't eager-load account relation)
// ============================================
let accountCacheById: Record<number, Account> = {};

const makeAccountPlaceholder = (idLike: any): Account => {
  const id = Number(idLike) || 0;
  return {
    id,
    account_code: id ? String(id) : '-',
    name: id ? `Account #${id}` : 'Unknown Account',
    description: '',
    type: 'expense',
    sub_type: 'unknown',
    parent_id: undefined,
    is_active: true,
    level: 0,
    path: id ? String(id) : '',
    current_balance: undefined,
    parent: undefined,
    children: [],
    created_at: '',
    updated_at: '',
  };
};

const upsertAccountCache = (acc: any) => {
  const id = Number(acc?.id);
  if (!Number.isFinite(id) || id <= 0) return;
  // normalizeAccount is declared below; TS allows calling it here
  accountCacheById[id] = normalizeAccount(acc);
};

const resolveTransactionAccount = (txn: any): Account => {
  if (txn?.account) {
    upsertAccountCache(txn.account);
    return accountCacheById[Number(txn.account?.id)] || normalizeAccount(txn.account);
  }
  const id = Number(txn?.account_id);
  if (Number.isFinite(id) && id > 0 && accountCacheById[id]) return accountCacheById[id];
  return makeAccountPlaceholder(id);
};


// ============================================
// NORMALIZERS (Make frontend resilient to backend shape/type variations)
// ============================================

// Parse numbers that might contain commas, currency symbols (৳, BDT), or be '-' / ''
const toNumber = (value: any, fallback: number = 0): number => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '' || trimmed === '-') return fallback;
    // Remove commas and any non-numeric characters (keeps digits, dot, minus)
    const cleaned = trimmed.replace(/,/g, '').replace(/[^0-9.\-]/g, '');
    if (cleaned === '' || cleaned === '-' || cleaned === '.' || cleaned === '-.') return fallback;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toLower = (value: any): string => {
  if (value === null || value === undefined) return '';
  return String(value).toLowerCase();
};

const normalizeTransaction = (txn: any): Transaction => {
  // Backend examples vary: type can be "debit"/"credit" or "Debit"/"Credit".
  const type = (toLower(txn?.type) === 'debit' ? 'debit' : 'credit') as 'debit' | 'credit';
  const normalized: any = {
    ...txn,
    transaction_date: txn?.transaction_date ?? txn?.date ?? txn?.created_at ?? '',
    transaction_number: txn?.transaction_number ?? txn?.transaction_no ?? txn?.transactionNumber ?? txn?.reference ?? txn?.id ?? '',
    amount: toNumber(txn?.amount, 0),
    type,
    status: (txn?.status ?? 'completed') as any,
    account_id: toNumber(txn?.account_id, 0),
  };

  // Ensure account object exists for UI (journal requires it)
  normalized.account = resolveTransactionAccount(normalized);

  return normalized as Transaction;
};

const normalizeAccountType = (type: any): Account['type'] => {
  const t = toLower(type);
  // Some docs/examples use "revenue" or plural forms
  if (t === 'revenue') return 'income';
  if (t === 'assets') return 'asset';
  if (t === 'liabilities') return 'liability';
  if (t === 'expenses') return 'expense';
  if (t === 'equities') return 'equity';
  if (t === 'income') return 'income';
  if (t === 'asset') return 'asset';
  if (t === 'liability') return 'liability';
  if (t === 'equity') return 'equity';
  if (t === 'expense') return 'expense';
  // Default to expense to avoid TS issues; UI mainly uses label strings.
  return 'expense';
};

const normalizeAccount = (acc: any): Account => {
  const id = Number(acc?.id) || 0;
  const account_code = acc?.account_code ?? acc?.code ?? acc?.accountCode ?? (id ? String(id) : '-');
  const name = acc?.name ?? acc?.account_name ?? acc?.accountName ?? acc?.account ?? (id ? `Account #${id}` : 'Unknown Account');

  const normalized: Account = {
    ...acc,
    id,
    account_code,
    name,
    type: normalizeAccountType(acc?.type ?? acc?.account_type),
    sub_type: acc?.sub_type ?? acc?.subType ?? 'unknown',
    is_active: acc?.is_active ?? acc?.active ?? true,
    level: acc?.level ?? 0,
    path: acc?.path ?? (id ? String(id) : ''),
    created_at: acc?.created_at ?? '',
    updated_at: acc?.updated_at ?? '',
    current_balance: acc?.current_balance !== undefined ? toNumber(acc.current_balance, 0) : acc?.current_balance,
    parent: acc?.parent,
    children: acc?.children,
  };

  // Keep cache fresh
  if (normalized.id) accountCacheById[normalized.id] = normalized;

  return normalized;
};

const normalizeTrialBalance = (payload: any, params?: { start_date?: string; end_date?: string; store_id?: number | string }) => {
  // Shape A (transactions/trial-balance): { success, data: { summary, accounts, date_range } }
  // Shape B (accounting/trial-balance): { success, data: { accounts: [...], totals: {...}, as_of_date } }
  const data = payload?.data ?? payload;
  const buildSummaryFromAccounts = (rows: any[], fallbackSummary?: any) => {
    const totalDebits = rows.reduce((s, r) => s + toNumber(r.debit, 0), 0);
    const totalCredits = rows.reduce((s, r) => s + toNumber(r.credit, 0), 0);
    // Keep 2dp precision for display/compare
    const diff = Math.round((totalDebits - totalCredits) * 100) / 100;
    const balanced = Math.abs(diff) < 0.01;

    // If backend provided totals that *look* sane AND close to computed, keep them.
    const backendDebits = toNumber(fallbackSummary?.total_debits ?? fallbackSummary?.totalDebits, NaN as any);
    const backendCredits = toNumber(fallbackSummary?.total_credits ?? fallbackSummary?.totalCredits, NaN as any);
    const useBackendTotals = Number.isFinite(backendDebits) && Number.isFinite(backendCredits)
      && Math.abs(backendDebits - totalDebits) < 0.01
      && Math.abs(backendCredits - totalCredits) < 0.01;

    const finalDebits = useBackendTotals ? backendDebits : totalDebits;
    const finalCredits = useBackendTotals ? backendCredits : totalCredits;
    const finalDiff = Math.round((finalDebits - finalCredits) * 100) / 100;
    const finalBalanced = Math.abs(finalDiff) < 0.01;

    return {
      total_debits: finalDebits,
      total_credits: finalCredits,
      difference: finalDiff,
      balanced: finalBalanced,
    };
  };

  if (data?.summary && Array.isArray(data?.accounts)) {
    const rows = data.accounts.map((a: any) => {
      const debit = toNumber(a.debit ?? a.debit_balance ?? a.debitAmount, 0);
      const credit = toNumber(a.credit ?? a.credit_balance ?? a.creditAmount, 0);
      const id = Number(a?.id) || 0;
      const type = normalizeAccountType(a.type ?? a.account_type ?? a.accountType ?? a.accountTypeName);
      const code = a.account_code ?? a.code ?? a.accountCode ?? '';
      const name = a.name ?? a.account_name ?? a.accountName ?? a.account ?? '';
      return {
        ...a,
        id,
        account_code: code,
        account_name: name,
        name,
        type,
        debit,
        credit,
        balance: a.balance ?? a.raw_balance ?? a.rawBalance ?? undefined,
      };
    });

    return {
      ...data,
      accounts: rows,
      summary: buildSummaryFromAccounts(rows, data.summary),
      date_range: data.date_range ?? {
        start_date: params?.start_date || '',
        end_date: params?.end_date || params?.start_date || '',
      },
    } as TrialBalanceData;
  }

  // Financial reports doc format
  const accounts = Array.isArray(data?.accounts) ? data.accounts : [];
  const totals = data?.totals ?? {};
  const end = params?.end_date || data?.as_of_date || params?.start_date || '';

  const rows = accounts.map((a: any) => {
    const debit = toNumber(a.debit ?? a.debit_balance ?? a.debitAmount, 0);
    const credit = toNumber(a.credit ?? a.credit_balance ?? a.creditAmount, 0);
    const id = Number(a?.id) || 0;
    const type = normalizeAccountType(a.type ?? a.account_type ?? a.accountType);
    const code = a.account_code ?? a.code ?? a.accountCode ?? '';
    const name = a.name ?? a.account_name ?? a.accountName ?? '';
    return {
      ...a,
      id,
      account_code: code,
      account_name: name,
      name,
      type,
      debit,
      credit,
      balance: a.balance ?? a.raw_balance ?? a.rawBalance ?? undefined,
    };
  });

  return {
    summary: buildSummaryFromAccounts(rows, totals),
    accounts: rows,
    date_range: {
      start_date: params?.start_date || end,
      end_date: end,
    },
    store_id: params?.store_id,
  } as TrialBalanceData;
};

const normalizeLedger = (payload: any, accountId: number, params?: { date_from?: string; date_to?: string; store_id?: number | string }): LedgerData => {
  // Shape A (transactions/ledger/{id}): { success, data: { account, opening_balance, closing_balance, transactions, date_range } }
  // Shape B (accounting/t-account/{id}): { success, data: { account, opening_balance, debit_side, credit_side, totals, period } }
  const data = payload?.data ?? payload;
  if (data?.account && Array.isArray(data?.transactions)) {
    // Some implementations return debit/credit columns directly.
    // Others return { type, amount } per row. Normalize to debit/credit always.
    return {
      ...data,
      account: normalizeAccount(data.account),
      opening_balance: toNumber(data.opening_balance, 0),
      closing_balance: toNumber(data.closing_balance ?? data?.totals?.closing_balance, 0),
      date_range: data.date_range ?? data.period ?? {
        date_from: params?.date_from ?? '',
        date_to: params?.date_to ?? '',
      },
      transactions: data.transactions.map((t: any) => {
        const tType = toLower(t?.type);
        const amt = toNumber(t?.amount, 0);
        const debit = t?.debit !== undefined ? toNumber(t.debit, 0) : (tType === 'debit' ? amt : 0);
        const credit = t?.credit !== undefined ? toNumber(t.credit, 0) : (tType === 'credit' ? amt : 0);
        return {
          ...t,
          transaction_date: t?.transaction_date ?? t?.date ?? '',
          transaction_number: t?.transaction_number ?? t?.transaction_no ?? t?.reference ?? '',
          debit,
          credit,
          balance: toNumber(t?.balance, 0),
          status: t?.status ?? 'completed',
        };
      }),
    } as LedgerData;
  }

  // Convert T-Account format into ledger entries list
  const account = normalizeAccount(data?.account || makeAccountPlaceholder(accountId));
  const opening = toNumber(data?.opening_balance, 0);
  const debitSide = Array.isArray(data?.debit_side) ? data.debit_side : [];
  const creditSide = Array.isArray(data?.credit_side) ? data.credit_side : [];
  const merged: LedgerEntry[] = [...debitSide.map((e: any) => ({
    id: 0,
    transaction_number: e.reference ?? '',
    transaction_date: e.date ?? '',
    description: e.description ?? '',
    debit: toNumber(e.amount, 0),
    credit: 0,
    balance: toNumber(e.balance, 0),
    status: 'completed',
  })), ...creditSide.map((e: any) => ({
    id: 0,
    transaction_number: e.reference ?? '',
    transaction_date: e.date ?? '',
    description: e.description ?? '',
    debit: 0,
    credit: toNumber(e.amount, 0),
    balance: toNumber(e.balance, 0),
    status: 'completed',
  }))].sort((a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime());

  const closing = toNumber(data?.totals?.closing_balance ?? data?.closing_balance, opening);
  const period = data?.period || {};

  return {
    account,
    opening_balance: opening,
    closing_balance: closing,
    transactions: merged,
    date_range: {
      date_from: period.from ?? params?.date_from ?? '',
      date_to: period.to ?? params?.date_to ?? '',
    },
  } as LedgerData;
};

// ============================================
// TYPES & INTERFACES
// ============================================

export interface Account {
  id: number;
  account_code: string;
  name: string;
  description?: string;
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  sub_type: string;
  parent_id?: number;
  is_active: boolean;
  level: number;
  path: string;
  current_balance?: number;
  parent?: Account;
  children?: Account[];
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: number;
  transaction_number: string;
  transaction_date: string;
  amount: number;
  type: 'debit' | 'credit';
  account_id: number;
  reference_type?: string;
  reference_id?: number;
  description?: string;
  store_id?: number | string;
  created_by?: number;
  group_id?: string;
  metadata?: any;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  account?: Account;
  store?: any;
  created_at: string;
  updated_at: string;
}

export interface TrialBalanceSummary {
  total_debits: number;
  total_credits: number;
  difference: number;
  balanced: boolean;
}

export interface TrialBalanceAccount {
  id?: number;
  account_code: string;
  account_name: string;
  name?: string;
  type: string;
  debit: number;      // Total debits for this account
  credit: number;     // Total credits for this account
  balance?: number;   // Optional: Debit - Credit (for reference, not shown in trial balance)
}

export interface TrialBalanceData {
  summary: TrialBalanceSummary;
  accounts: TrialBalanceAccount[];
  date_range: {
    start_date: string;
    end_date: string;
  };
  store_id?: number | string;
}

export interface LedgerEntry {
  id: number;
  transaction_number: string;
  transaction_date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  status: string;
}

export interface LedgerData {
  account: Account;
  opening_balance: number;
  closing_balance: number;
  transactions: LedgerEntry[];
  date_range: {
    date_from: string;
    date_to: string;
  };
}

export interface AccountBalance {
  account_id: number;
  account_name: string;
  account_code: string;
  balance: number;
  children_balance: number;
  total_balance: number;
  store_id?: number | string;
  end_date?: string;
}

export interface AccountStatistics {
  total: number;
  active: number;
  inactive: number;
  by_type: {
    assets: number;
    liabilities: number;
    equity: number;
    income: number;
    expenses: number;
  };
  by_sub_type: Record<string, number>;
  by_level: Record<string, number>;
}

export interface TransactionStatistics {
  total: number;
  completed: number;
  pending: number;
  failed: number;
  total_debits: number;
  total_credits: number;
  completed_debits: number;
  completed_credits: number;
  net_balance: number;
  by_type: {
    debit: number;
    credit: number;
  };
  by_status: Record<string, number>;
}

export interface JournalEntryLine {
  id?: number;
  account: Account;
  debit: number;
  credit: number;
  transaction: Transaction;
}

export interface JournalEntry {
  id: string;
  group_id?: string;
  date: string;
  reference_type: string;
  reference_id: number;
  description: string;
  lines: JournalEntryLine[];
  total_debit: number;
  total_credit: number;
  balanced: boolean;
  created_at: string;
}

export interface CreateAccountData {
  account_code: string;
  name: string;
  description?: string;
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  sub_type: string;
  parent_id?: number;
  is_active?: boolean;
}

export interface UpdateAccountData {
  name?: string;
  description?: string;
  is_active?: boolean;
}

export interface CreateTransactionData {
  transaction_date: string;
  amount: number;
  type: 'debit' | 'credit';
  account_id: number;
  counter_account_id?: number | string;
  description?: string;
  store_id?: number | string;
  reference_type?: string;
  reference_id?: number;
  metadata?: any;
  status?: 'pending' | 'completed' | 'failed' | 'cancelled';
  note?: string;
  reference_note?: string;
  receipt_image?: string;
}

export interface UpdateTransactionData {
  amount?: number;
  description?: string;
  metadata?: any;
}

// ============================================
// CHART OF ACCOUNTS SERVICES
// ============================================

class ChartOfAccountsService {
  /**
   * Get all accounts with optional filtering
   */
  async getAccounts(params?: {
    type?: string;
    sub_type?: string;
    active?: boolean;
    level?: number;
    search?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
    per_page?: number;
    leaf_only?: boolean;
  }) {
    const response = await axiosInstance.get('/accounts', { params });
    const result = response.data;
    if (result?.success) {
      const data = result.data;
      if (Array.isArray(data)) {
        result.data = data.map((a: any) => normalizeAccount(a));
      } else if (Array.isArray(data?.data)) {
        data.data = data.data.map((a: any) => normalizeAccount(a));
      }
    }
    return result;
  }

  /**
   * Get account tree structure
   */
  async getAccountTree(type?: string) {
    const params = type ? { type } : {};
    const response = await axiosInstance.get('/accounts/tree', { params });
    const result = response.data;
    if (result?.success && Array.isArray(result.data)) {
      const normalizeTree = (nodes: any[]): any[] => nodes.map(n => ({
        ...normalizeAccount(n),
        children: Array.isArray(n.children) ? normalizeTree(n.children) : n.children,
      }));
      result.data = normalizeTree(result.data);
    }
    return result;
  }

  /**
   * Get account by ID
   */
  async getAccountById(id: number) {
    const response = await axiosInstance.get(`/accounts/${id}`);
    const result = response.data;
    if (result?.success && result?.data) {
      result.data = normalizeAccount(result.data);
    }
    return result;
  }

  /**
   * Create new account
   */
  async createAccount(data: CreateAccountData) {
    const response = await axiosInstance.post('/accounts', data);
    return response.data;
  }

  /**
   * Update account
   */
  async updateAccount(id: number, data: UpdateAccountData) {
    const response = await axiosInstance.put(`/accounts/${id}`, data);
    return response.data;
  }

  /**
   * Delete account
   */
  async deleteAccount(id: number) {
    const response = await axiosInstance.delete(`/accounts/${id}`);
    return response.data;
  }

  /**
   * Get account balance
   */
  async getAccountBalance(id: number, params?: {
    store_id?: number | string;
    end_date?: string;
  }): Promise<{ success: boolean; data: AccountBalance }> {
    const response = await axiosInstance.get(`/accounts/${id}/balance`, { params });
    return response.data;
  }

  /**
   * Activate account
   */
  async activateAccount(id: number) {
    const response = await axiosInstance.post(`/accounts/${id}/activate`);
    return response.data;
  }

  /**
   * Deactivate account
   */
  async deactivateAccount(id: number) {
    const response = await axiosInstance.post(`/accounts/${id}/deactivate`);
    return response.data;
  }

  /**
   * Get account statistics
   */
  async getStatistics(type?: string): Promise<{ success: boolean; data: AccountStatistics }> {
    const params = type ? { type } : {};
    const response = await axiosInstance.get('/accounts/statistics', { params });
    return response.data;
  }

  /**
   * Get chart of accounts with balances
   */
  async getChartOfAccounts(params?: {
    store_id?: number | string;
    end_date?: string;
  }) {
    const response = await axiosInstance.get('/accounts/chart-of-accounts', { params });
    return response.data;
  }

  /**
   * Initialize default chart of accounts
   */
  async initializeDefaults() {
    const response = await axiosInstance.post('/accounts/initialize-defaults');
    return response.data;
  }
}

// ============================================
// TRANSACTION SERVICES
// ============================================

class TransactionService {
  /**
   * Get all transactions with filtering
   */
  async getTransactions(params?: {
    account_id?: number;
    type?: 'debit' | 'credit';
    status?: 'pending' | 'completed' | 'failed' | 'cancelled';
    store_id?: number | string;
    date_from?: string;
    date_to?: string;
    reference_type?: string;
    reference_id?: number;
    search?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
    per_page?: number;
    page?: number;
  }) {
    const response = await axiosInstance.get('/transactions', { params });
    const result = response.data;

    // Normalize transaction amounts/types so UI math and grouping never breaks
    if (result?.success) {
      const data = result.data;
      // Paginated: { data: { data: [...] } }
      if (data?.data && Array.isArray(data.data)) {
        data.data = data.data.map((t: any) => normalizeTransaction(t));
      } else if (Array.isArray(data?.data?.data)) {
        data.data.data = data.data.data.map((t: any) => normalizeTransaction(t));
      } else if (Array.isArray(data)) {
        result.data = data.map((t: any) => normalizeTransaction(t));
      }
    }

    return result;
  }

  /**
   * Get transaction by ID
   */
  async getTransactionById(id: number) {
    const response = await axiosInstance.get(`/transactions/${id}`);
    const result = response.data;
    if (result?.success && result?.data) {
      result.data = normalizeTransaction(result.data);
    }
    return result;
  }

  /**
   * Create manual transaction
   */
  async createTransaction(data: CreateTransactionData) {
    const response = await axiosInstance.post('/transactions', data);
    return response.data;
  }

  /**
   * Update transaction (only pending)
   */
  async updateTransaction(id: number, data: UpdateTransactionData) {
    const response = await axiosInstance.put(`/transactions/${id}`, data);
    return response.data;
  }

  /**
   * Delete transaction (only pending/failed)
   */
  async deleteTransaction(id: number) {
    const response = await axiosInstance.delete(`/transactions/${id}`);
    return response.data;
  }

  /**
   * Complete transaction
   */
  async completeTransaction(id: number) {
    const response = await axiosInstance.post(`/transactions/${id}/complete`);
    return response.data;
  }

  /**
   * Mark transaction as failed
   */
  async failTransaction(id: number, reason?: string) {
    const response = await axiosInstance.post(`/transactions/${id}/fail`, { reason });
    return response.data;
  }

  /**
   * Cancel transaction
   */
  async cancelTransaction(id: number, reason?: string) {
    const response = await axiosInstance.post(`/transactions/${id}/cancel`, { reason });
    return response.data;
  }

  /**
   * Bulk complete transactions
   */
  async bulkComplete(transaction_ids: number[]) {
    const response = await axiosInstance.post('/transactions/bulk-complete', { transaction_ids });
    return response.data;
  }

  /**
   * Get transaction statistics
   */
  async getStatistics(params?: {
    date_from?: string;
    date_to?: string;
    store_id?: number | string;
  }): Promise<{ success: boolean; data: TransactionStatistics }> {
    const response = await axiosInstance.get('/transactions/statistics', { params });
    return response.data;
  }

  /**
   * Get transactions for specific account
   */
  async getAccountTransactions(accountId: number, params?: {
    date_from?: string;
    date_to?: string;
    store_id?: number | string;
    per_page?: number;
    page?: number;
  }) {
    const response = await axiosInstance.get(`/accounts/${accountId}/transactions`, { params });
    return response.data;
  }
}

// ============================================
// FINANCIAL REPORTS SERVICES
// ============================================

class FinancialReportsService {
  /**
   * Get trial balance
   */
  async getTrialBalance(params?: {
    store_id?: number | string;
    start_date?: string;
    end_date?: string;
  }): Promise<{ success: boolean; data: TrialBalanceData }> {
    // There are two documented variants:
    // - /transactions/trial-balance (range-based)
    // - /accounting/trial-balance (as-of-date / textbook style)
    try {
      const response = await axiosInstance.get('/transactions/trial-balance', { params });
      const result = response.data;
      if (result?.success) {
        result.data = normalizeTrialBalance(result.data, params);
      }
      return result;
    } catch (err: any) {
      // Fallback to textbook report endpoint
      const fallbackParams: any = {
        as_of_date: params?.end_date || params?.start_date,
        store_id: params?.store_id,
      };
      const response = await axiosInstance.get('/accounting/trial-balance', { params: fallbackParams });
      const result = response.data;
      if (result?.success) {
        result.data = normalizeTrialBalance(result.data, {
          start_date: params?.start_date,
          end_date: params?.end_date || fallbackParams.as_of_date,
          store_id: params?.store_id,
        });
      }
      return result;
    }
  }

  /**
   * Get account ledger
   */
  async getAccountLedger(accountId: number, params?: {
    date_from?: string;
    date_to?: string;
    store_id?: number | string;
  }): Promise<{ success: boolean; data: LedgerData }> {
    // Two documented variants:
    // - /transactions/ledger/{id}
    // - /accounting/t-account/{id}
    try {
      const response = await axiosInstance.get(`/transactions/ledger/${accountId}`, { params });
      const result = response.data;
      if (result?.success) {
        result.data = normalizeLedger(result.data, accountId, params);
      }
      return result;
    } catch (err: any) {
      const response = await axiosInstance.get(`/accounting/t-account/${accountId}`, { params });
      const result = response.data;
      if (result?.success) {
        result.data = normalizeLedger(result.data, accountId, params);
      }
      return result;
    }
  }

  /**
   * Get journal entries (grouped transactions showing double-entry format)
   */
  async getJournalEntries(params?: {
    date_from?: string;
    date_to?: string;
    store_id?: number | string;
    reference_type?: string;
    per_page?: number;
    page?: number;
  }) {
    // Journal needs *all* matching transactions, otherwise entries look "unbalanced" (one side is on another page).
    // The standard /api/transactions endpoint is paginated; we fetch multiple pages for journal completeness.
    const perPage = Math.max(100, Math.min(5000, Number(params?.per_page || 1000)));

    const fetchPage = async (page: number) => {
      const response = await axiosInstance.get('/transactions', {
        params: { ...params, per_page: perPage, page },
      });
      return response.data;
    };

    // Load first page
    const first = await fetchPage(1);

    if (!first?.success) {
      return first;
    }

    const firstData = first.data;
    const firstPageRows =
      Array.isArray(firstData?.data) ? firstData.data :
      Array.isArray(firstData) ? firstData :
      Array.isArray(firstData?.data?.data) ? firstData.data.data :
      [];

    const lastPage = Number(firstData?.last_page || firstData?.data?.last_page || 1) || 1;

    let allRows: any[] = [...firstPageRows];

    // Load remaining pages (cap to avoid runaway if backend misreports last_page)
    const maxPages = Math.min(lastPage, 20);
    for (let p = 2; p <= maxPages; p++) {
      const next = await fetchPage(p);
      if (!next?.success) break;

      const nextData = next.data;
      const rows =
        Array.isArray(nextData?.data) ? nextData.data :
        Array.isArray(nextData) ? nextData :
        Array.isArray(nextData?.data?.data) ? nextData.data.data :
        [];

      allRows.push(...rows);

      // If backend doesn't report last_page reliably, break on short page
      if (rows.length < perPage) break;
    }

    const transactions = allRows.map((t: any) => normalizeTransaction(t));

    // Group transactions by reference (same reference = one journal entry)
    const entriesMap = new Map<string, JournalEntry>();

    transactions.forEach((txn: Transaction) => {
      const refType = txn.reference_type || 'Manual';
      const refId = txn.reference_id || txn.id;
      const date = txn.transaction_date;
      const key = `${refType}-${refId}-${date}`;

      if (!entriesMap.has(key)) {
        entriesMap.set(key, {
          id: key,
          date,
          reference_type: refType,
          reference_id: txn.reference_id || 0,
          group_id: txn.group_id,
          description: txn.description || '',
          lines: [],
          total_debit: 0,
          total_credit: 0,
          balanced: true,
          created_at: txn.created_at,
        });
      }

      const entry = entriesMap.get(key)!;

      const debitAmt = txn.type === 'debit' ? toNumber(txn.amount, 0) : 0;
      const creditAmt = txn.type === 'credit' ? toNumber(txn.amount, 0) : 0;

      entry.lines.push({
        id: txn.id,
        account: txn.account || makeAccountPlaceholder(txn.account_id),
        debit: debitAmt,
        credit: creditAmt,
        transaction: txn,
      });

      entry.total_debit += debitAmt;
      entry.total_credit += creditAmt;
    });

    // Check if each entry is balanced
    entriesMap.forEach((entry) => {
      entry.balanced = Math.abs(entry.total_debit - entry.total_credit) < 0.01;
      // Keep lines stable: debits first then credits
      entry.lines = entry.lines.sort((a, b) => (b.debit - a.debit));
    });

    // Convert to array and sort by date descending
    const journalEntries = Array.from(entriesMap.values()).sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return {
      success: true,
      data: journalEntries,
    };
  }

  /**
   * Export trial balance to CSV
   */
  exportTrialBalanceCSV(data: TrialBalanceAccount[], filename: string = 'trial-balance') {
    const headers = ['Account Code', 'Account Name', 'Type', 'Debit', 'Credit', 'Balance'];
    const rows = data.map(account => [
      account.account_code,
      account.account_name,
      account.type,
      account.debit.toFixed(2),
      account.credit.toFixed(2),
      (account.balance ?? 0).toFixed(2)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    this.downloadCSV(csvContent, `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  }

  /**
   * Export ledger to CSV
   */
  exportLedgerCSV(data: LedgerEntry[], accountName: string, filename: string = 'ledger') {
    const headers = ['Date', 'Transaction Number', 'Description', 'Debit', 'Credit', 'Balance', 'Status'];
    const rows = data.map(entry => [
      entry.transaction_date,
      entry.transaction_number,
      `"${entry.description}"`,
      entry.debit.toFixed(2),
      entry.credit.toFixed(2),
      entry.balance.toFixed(2),
      entry.status
    ]);

    const csvContent = [
      `Account: ${accountName}`,
      '',
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    this.downloadCSV(csvContent, `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  }

  /**
   * Export transactions to CSV
   */
  exportTransactionsCSV(data: Transaction[], filename: string = 'transactions') {
    const headers = [
      'Transaction Number',
      'Date',
      'Account Code',
      'Account Name',
      'Type',
      'Amount',
      'Description',
      'Status'
    ];

    const rows = data.map(txn => [
      txn.transaction_number,
      txn.transaction_date,
      txn.account?.account_code || '',
      txn.account?.name || '',
      txn.type,
      txn.amount.toFixed(2),
      `"${txn.description || ''}"`,
      txn.status
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    this.downloadCSV(csvContent, `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  }

  /**
   * Helper method to download CSV
   */
  private downloadCSV(content: string, filename: string) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }
}

// ============================================
// EXPORT SERVICE INSTANCES
// ============================================

export const chartOfAccountsService = new ChartOfAccountsService();
export const transactionService = new TransactionService();
export const financialReportsService = new FinancialReportsService();

// Default export for convenience
const accountingService = {
  accounts: chartOfAccountsService,
  transactions: transactionService,
  reports: financialReportsService,
};

export default accountingService;