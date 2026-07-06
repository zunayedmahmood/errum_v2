import axiosInstance from '@/lib/axios';

// Canonical cash-sheet API wrapper. The monthly grid must stay read-only and
// formula-free; the backend owns all cash/bank/sale/owner calculations.

// ── Sheet types ───────────────────────────────────────────────────────────────

export interface CashSheetStore {
  id: number;
  name: string;
  is_warehouse?: boolean;
}

export interface BranchDay {
  store_id: number;
  store_name: string;
  is_warehouse?: boolean;
  daily_sale: number;
  raw_cash: number;
  cash: number;
  bank: number;
  ex_on: number;
  salary: number;
  cash_to_bank: number;
  daily_cost: number;
}

export interface OnlineDay {
  daily_sales: number;
  advance: number;
  online_payment: number;
  cod: number;
  cod_due: number;
  cod_collected: number;
  refunds: number;
}

export interface DisbursementDay {
  sslzc_received: number;
  pathao_received: number;
}

export interface DayTotals {
  total_sale: number;
  cash: number;
  bank: number;
  final_bank: number;
}

export interface OwnerDay {
  cash_invest: number;
  bank_invest: number;
  total_cash: number;
  total_bank: number;
  cash_cost: number;
  bank_cost: number;
  cash_after_cost: number;
  bank_after_cost: number;
}

export interface CashSheetRow {
  date: string;
  branches: BranchDay[];
  online: OnlineDay;
  disbursements: DisbursementDay;
  totals: DayTotals;
  owner: OwnerDay;
}

export interface CashSheetSummary {
  branches: BranchDay[];
  online: OnlineDay;
  disbursements: DisbursementDay;
  totals: DayTotals;
  owner: OwnerDay;
}

export interface CashSheetResponse {
  success: boolean;
  month: string;
  timezone: string;
  utc_offset_hours: number;
  stores: CashSheetStore[];
  data: CashSheetRow[];
  summary: CashSheetSummary;
}

// ── Entry types ───────────────────────────────────────────────────────────────

export interface StoreLite {
  id: number;
  name: string;
  is_warehouse?: boolean;
}

export interface EmployeeLite {
  id: number;
  name: string;
}

export interface BranchCostEntry {
  id: number;
  entry_date: string;
  store_id: number;
  store?: StoreLite;
  amount: number;
  details: string | null;
  created_by?: EmployeeLite | null;
  createdBy?: EmployeeLite | null;
  created_at: string;
}

export interface AccountingExpenseEntry {
  id: number;
  expense_id: number;
  payment_number: string;
  expense_number: string;
  amount: number;
  completed_at: string | null;
  description: string | null;
  category_name: string | null;
  payment_method?: { name: string; type: string } | null;
  store?: StoreLite | null;
  created_by?: EmployeeLite | null;
}

export type AdminEntryType = 'salary_setaside' | 'cash_to_bank' | 'sslzc' | 'pathao';
export interface AdminEntry {
  id: number;
  entry_date: string;
  type: AdminEntryType;
  store_id: number | null;
  store?: StoreLite | null;
  amount: number;
  details: string | null;
  created_by?: EmployeeLite | null;
  createdBy?: EmployeeLite | null;
  created_at: string;
}

export type OwnerEntryType = 'cash_invest' | 'bank_invest' | 'cash_cost' | 'bank_cost';
export interface OwnerEntry {
  id: number;
  entry_date: string;
  type: OwnerEntryType;
  amount: number;
  details: string | null;
  created_by?: EmployeeLite | null;
  createdBy?: EmployeeLite | null;
  created_at: string;
}

export interface DayEntries {
  success: boolean;
  date: string;
  branch_costs: BranchCostEntry[];
  admin_entries: AdminEntry[];
  owner_entries: OwnerEntry[];
  accounting_expenses: AccountingExpenseEntry[];
}

// ── Normalizers ───────────────────────────────────────────────────────────────

const num = (value: unknown): number => Number(value ?? 0) || 0;

function normalizeStore(store: any): CashSheetStore {
  return {
    id: num(store?.id),
    name: String(store?.name ?? 'Unknown store'),
    is_warehouse: Boolean(store?.is_warehouse),
  };
}

function normalizeBranchDay(branch: any): BranchDay {
  return {
    store_id: num(branch?.store_id),
    store_name: String(branch?.store_name ?? ''),
    is_warehouse: Boolean(branch?.is_warehouse),
    daily_sale: num(branch?.daily_sale),
    raw_cash: num(branch?.raw_cash),
    cash: num(branch?.cash),
    bank: num(branch?.bank),
    ex_on: num(branch?.ex_on),
    salary: num(branch?.salary),
    cash_to_bank: num(branch?.cash_to_bank),
    daily_cost: num(branch?.daily_cost),
  };
}

function normalizeOnlineDay(online: any): OnlineDay {
  return {
    daily_sales: num(online?.daily_sales),
    advance: num(online?.advance),
    online_payment: num(online?.online_payment),
    cod: num(online?.cod),
    cod_due: num(online?.cod_due),
    cod_collected: num(online?.cod_collected),
    refunds: num(online?.refunds),
  };
}

function normalizeDisbursements(disbursements: any): DisbursementDay {
  return {
    sslzc_received: num(disbursements?.sslzc_received),
    pathao_received: num(disbursements?.pathao_received),
  };
}

function normalizeTotals(totals: any): DayTotals {
  return {
    total_sale: num(totals?.total_sale),
    cash: num(totals?.cash),
    bank: num(totals?.bank),
    final_bank: num(totals?.final_bank),
  };
}

function normalizeOwner(owner: any): OwnerDay {
  return {
    cash_invest: num(owner?.cash_invest),
    bank_invest: num(owner?.bank_invest),
    total_cash: num(owner?.total_cash),
    total_bank: num(owner?.total_bank),
    cash_cost: num(owner?.cash_cost),
    bank_cost: num(owner?.bank_cost),
    cash_after_cost: num(owner?.cash_after_cost),
    bank_after_cost: num(owner?.bank_after_cost),
  };
}

function normalizeRow(row: any): CashSheetRow {
  return {
    date: String(row?.date ?? ''),
    branches: (row?.branches || []).map(normalizeBranchDay),
    online: normalizeOnlineDay(row?.online),
    disbursements: normalizeDisbursements(row?.disbursements),
    totals: normalizeTotals(row?.totals),
    owner: normalizeOwner(row?.owner),
  };
}

function normalizeSummary(summary: any): CashSheetSummary {
  return {
    branches: (summary?.branches || []).map(normalizeBranchDay),
    online: normalizeOnlineDay(summary?.online),
    disbursements: normalizeDisbursements(summary?.disbursements),
    totals: normalizeTotals(summary?.totals),
    owner: normalizeOwner(summary?.owner),
  };
}

function normalizeSheetResponse(payload: any): CashSheetResponse {
  return {
    success: Boolean(payload?.success),
    month: String(payload?.month ?? ''),
    timezone: String(payload?.timezone ?? 'Asia/Dhaka'),
    utc_offset_hours: num(payload?.utc_offset_hours ?? 6),
    stores: (payload?.stores || []).map(normalizeStore),
    data: (payload?.data || []).map(normalizeRow),
    summary: normalizeSummary(payload?.summary),
  };
}

function normalizeBranchCostEntry(entry: any): BranchCostEntry {
  return {
    ...entry,
    store_id: entry?.store_id != null ? Number(entry.store_id) : 0,
    amount: num(entry?.amount),
    created_by: entry?.created_by ?? entry?.createdBy ?? null,
  };
}

function normalizeAdminEntry(entry: any): AdminEntry {
  return {
    ...entry,
    store_id: entry?.store_id != null ? Number(entry.store_id) : null,
    amount: num(entry?.amount),
    created_by: entry?.created_by ?? entry?.createdBy ?? null,
  };
}

function normalizeOwnerEntry(entry: any): OwnerEntry {
  return {
    ...entry,
    amount: num(entry?.amount),
    created_by: entry?.created_by ?? entry?.createdBy ?? null,
  };
}

function normalizeAccountingExpenseEntry(entry: any): AccountingExpenseEntry {
  return {
    ...entry,
    id: num(entry?.id),
    expense_id: num(entry?.expense_id),
    amount: num(entry?.amount),
    store: entry?.store ? { ...entry.store, id: num(entry.store.id) } : null,
    created_by: entry?.created_by ?? entry?.createdBy ?? null,
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

const cashSheetService = {
  async getSheet(month: string): Promise<CashSheetResponse> {
    const res = await axiosInstance.get('/cash-sheet', { params: { month, _ts: Date.now() } });
    return normalizeSheetResponse(res.data);
  },

  async getEntries(date: string): Promise<DayEntries> {
    const res = await axiosInstance.get('/cash-sheet/entries', { params: { date, _ts: Date.now() } });
    return {
      ...res.data,
      branch_costs: (res.data?.branch_costs || []).map(normalizeBranchCostEntry),
      admin_entries: (res.data?.admin_entries || []).map(normalizeAdminEntry),
      owner_entries: (res.data?.owner_entries || []).map(normalizeOwnerEntry),
      accounting_expenses: (res.data?.accounting_expenses || []).map(normalizeAccountingExpenseEntry),
    };
  },

  async addBranchCost(payload: { entry_date: string; store_id: number; amount: number; details?: string }): Promise<BranchCostEntry> {
    const res = await axiosInstance.post('/cash-sheet/branch-cost', payload);
    return normalizeBranchCostEntry(res.data.entry);
  },

  async deleteBranchCost(id: number): Promise<void> {
    await axiosInstance.delete(`/cash-sheet/branch-cost/${id}`);
  },

  async addAdminEntry(payload: { entry_date: string; type: AdminEntryType; store_id?: number | null; amount: number; details?: string }): Promise<AdminEntry> {
    const res = await axiosInstance.post('/cash-sheet/admin', payload);
    return normalizeAdminEntry(res.data.entry);
  },

  async deleteAdminEntry(id: number): Promise<void> {
    await axiosInstance.delete(`/cash-sheet/admin/${id}`);
  },

  async addOwnerEntry(payload: { entry_date: string; type: OwnerEntryType; amount: number; details?: string }): Promise<OwnerEntry> {
    const res = await axiosInstance.post('/cash-sheet/owner', payload);
    return normalizeOwnerEntry(res.data.entry);
  },

  async deleteOwnerEntry(id: number): Promise<void> {
    await axiosInstance.delete(`/cash-sheet/owner/${id}`);
  },
};

export default cashSheetService;
