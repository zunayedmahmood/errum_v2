import axiosInstance from '@/lib/axios';

export interface StoreLite {
  id: number;
  name: string;
  is_active?: boolean;
  is_online?: boolean;
  is_warehouse?: boolean;
}

export interface EmployeeLite {
  id: number;
  name: string;
}

export type CashSheetPresence = Record<string, boolean>;

export interface CashSheetBranchDay {
  store_id: number;
  store_name: string;
  daily_sale: number;
  cash: number;
  bank: number;
  ex_on: number;
  salary: number;
  daily_cost: number;
  cash_to_bank: number;
  raw_cash: number;
  raw_bank: number;
  cash_cost: number;
  bank_cost: number;
  cash_refunds: number;
  bank_refunds: number;
  has_data: CashSheetPresence;
}

export interface CashSheetOnlineDay {
  daily_sales: number;
  advance: number;
  online_payment: number;
  cod: number;
  cod_due: number;
  cod_collected: number;
  cod_refunds: number;
  refunds: number;
  has_data: CashSheetPresence;
}

export interface CashSheetDisbursementDay {
  sslzc_received: number;
  pathao_received: number;
  has_data: CashSheetPresence;
}

export interface CashSheetTotalsDay {
  sale: number;
  branch_sale: number;
  cash: number;
  bank: number;
  final_bank: number;
  daily_cost: number;
  ex_on: number;
  salary: number;
  cash_to_bank: number;
  has_data: CashSheetPresence;
}

export interface CashSheetOwnerDay {
  cash_invest: number;
  bank_invest: number;
  cash_cost: number;
  bank_cost: number;
  total_cash: number;
  total_bank: number;
  cash_after_cost: number;
  bank_after_cost: number;
  has_data: CashSheetPresence;
}

export interface CashSheetStoreSummary extends Omit<CashSheetBranchDay, 'cash_cost' | 'bank_cost' | 'cash_refunds' | 'bank_refunds'> {}

export interface CashSheetSummary {
  totals: CashSheetTotalsDay;
  online: CashSheetOnlineDay;
  disbursements: CashSheetDisbursementDay;
  owner: CashSheetOwnerDay;
  stores: CashSheetStoreSummary[];
}

export interface CashSheetDay {
  date: string;
  branches: CashSheetBranchDay[];
  online: CashSheetOnlineDay;
  disbursements: CashSheetDisbursementDay;
  totals: CashSheetTotalsDay;
  owner: CashSheetOwnerDay;
}

export interface CashSheetSummaryResponse {
  success: boolean;
  month: string;
  timezone: string;
  utc_offset_hours: number;
  date_from: string;
  date_to: string;
  stores: StoreLite[];
  days: CashSheetDay[];
  summary: CashSheetSummary;
  rules?: Record<string, unknown>;
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

const num = (value: unknown): number => Number(value ?? 0) || 0;

function normalizePresence(value: any): CashSheetPresence {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, present]) => [key, Boolean(present)])
  );
}

function normalizeStore(store: any): StoreLite | undefined {
  if (!store) return undefined;
  return {
    id: num(store.id),
    name: String(store.name ?? 'Unknown store'),
    is_active: store.is_active == null ? undefined : Boolean(store.is_active),
    is_online: store.is_online == null ? undefined : Boolean(store.is_online),
    is_warehouse: store.is_warehouse == null ? undefined : Boolean(store.is_warehouse),
  };
}

function normalizeEmployee(employee: any): EmployeeLite | null {
  if (!employee) return null;
  return {
    id: num(employee.id),
    name: String(employee.name ?? 'Unknown'),
  };
}

function normalizeBranchDay(row: any): CashSheetBranchDay {
  return {
    store_id: num(row?.store_id),
    store_name: String(row?.store_name ?? ''),
    daily_sale: num(row?.daily_sale),
    cash: num(row?.cash),
    bank: num(row?.bank),
    ex_on: num(row?.ex_on),
    salary: num(row?.salary),
    daily_cost: num(row?.daily_cost),
    cash_to_bank: num(row?.cash_to_bank),
    raw_cash: num(row?.raw_cash),
    raw_bank: num(row?.raw_bank),
    cash_cost: num(row?.cash_cost),
    bank_cost: num(row?.bank_cost),
    cash_refunds: num(row?.cash_refunds),
    bank_refunds: num(row?.bank_refunds),
    has_data: normalizePresence(row?.has_data),
  };
}

function normalizeOnline(row: any): CashSheetOnlineDay {
  return {
    daily_sales: num(row?.daily_sales),
    advance: num(row?.advance),
    online_payment: num(row?.online_payment),
    cod: num(row?.cod),
    cod_due: num(row?.cod_due),
    cod_collected: num(row?.cod_collected),
    cod_refunds: num(row?.cod_refunds),
    refunds: num(row?.refunds),
    has_data: normalizePresence(row?.has_data),
  };
}

function normalizeDisbursements(row: any): CashSheetDisbursementDay {
  return {
    sslzc_received: num(row?.sslzc_received),
    pathao_received: num(row?.pathao_received),
    has_data: normalizePresence(row?.has_data),
  };
}

function normalizeTotals(row: any): CashSheetTotalsDay {
  return {
    sale: num(row?.sale),
    branch_sale: num(row?.branch_sale),
    cash: num(row?.cash),
    bank: num(row?.bank),
    final_bank: num(row?.final_bank),
    daily_cost: num(row?.daily_cost),
    ex_on: num(row?.ex_on),
    salary: num(row?.salary),
    cash_to_bank: num(row?.cash_to_bank),
    has_data: normalizePresence(row?.has_data),
  };
}

function normalizeOwner(row: any): CashSheetOwnerDay {
  return {
    cash_invest: num(row?.cash_invest),
    bank_invest: num(row?.bank_invest),
    cash_cost: num(row?.cash_cost),
    bank_cost: num(row?.bank_cost),
    total_cash: num(row?.total_cash),
    total_bank: num(row?.total_bank),
    cash_after_cost: num(row?.cash_after_cost),
    bank_after_cost: num(row?.bank_after_cost),
    has_data: normalizePresence(row?.has_data),
  };
}

function normalizeSummary(raw: any): CashSheetSummaryResponse {
  const stores = (raw?.stores || []).map(normalizeStore).filter(Boolean) as StoreLite[];

  return {
    success: Boolean(raw?.success),
    month: String(raw?.month ?? ''),
    timezone: String(raw?.timezone ?? 'Asia/Dhaka'),
    utc_offset_hours: num(raw?.utc_offset_hours),
    date_from: String(raw?.date_from ?? ''),
    date_to: String(raw?.date_to ?? ''),
    stores,
    days: (raw?.days || []).map((day: any) => ({
      date: String(day?.date ?? ''),
      branches: (day?.branches || []).map(normalizeBranchDay),
      online: normalizeOnline(day?.online),
      disbursements: normalizeDisbursements(day?.disbursements),
      totals: normalizeTotals(day?.totals),
      owner: normalizeOwner(day?.owner),
    })),
    summary: {
      totals: normalizeTotals(raw?.summary?.totals),
      online: normalizeOnline(raw?.summary?.online),
      disbursements: normalizeDisbursements(raw?.summary?.disbursements),
      owner: normalizeOwner(raw?.summary?.owner),
      stores: (raw?.summary?.stores || []).map(normalizeBranchDay),
    },
    rules: raw?.rules ?? undefined,
  };
}

function normalizeBranchCostEntry(entry: any): BranchCostEntry {
  return {
    id: num(entry?.id),
    entry_date: String(entry?.entry_date ?? ''),
    store_id: num(entry?.store_id),
    store: normalizeStore(entry?.store),
    amount: num(entry?.amount),
    details: entry?.details ?? null,
    created_by: normalizeEmployee(entry?.created_by ?? entry?.createdBy),
    createdBy: normalizeEmployee(entry?.createdBy ?? entry?.created_by),
    created_at: String(entry?.created_at ?? ''),
  };
}

function normalizeAdminEntry(entry: any): AdminEntry {
  return {
    id: num(entry?.id),
    entry_date: String(entry?.entry_date ?? ''),
    type: entry?.type as AdminEntryType,
    store_id: entry?.store_id == null ? null : num(entry.store_id),
    store: normalizeStore(entry?.store) ?? null,
    amount: num(entry?.amount),
    details: entry?.details ?? null,
    created_by: normalizeEmployee(entry?.created_by ?? entry?.createdBy),
    createdBy: normalizeEmployee(entry?.createdBy ?? entry?.created_by),
    created_at: String(entry?.created_at ?? ''),
  };
}

function normalizeOwnerEntry(entry: any): OwnerEntry {
  return {
    id: num(entry?.id),
    entry_date: String(entry?.entry_date ?? ''),
    type: entry?.type as OwnerEntryType,
    amount: num(entry?.amount),
    details: entry?.details ?? null,
    created_by: normalizeEmployee(entry?.created_by ?? entry?.createdBy),
    createdBy: normalizeEmployee(entry?.createdBy ?? entry?.created_by),
    created_at: String(entry?.created_at ?? ''),
  };
}

function normalizeAccountingExpense(entry: any): AccountingExpenseEntry {
  return {
    id: num(entry?.id),
    expense_id: num(entry?.expense_id),
    payment_number: String(entry?.payment_number ?? ''),
    expense_number: String(entry?.expense_number ?? ''),
    amount: num(entry?.amount),
    completed_at: entry?.completed_at ?? null,
    description: entry?.description ?? null,
    category_name: entry?.category_name ?? null,
    payment_method: entry?.payment_method
      ? {
          name: String(entry.payment_method.name ?? ''),
          type: String(entry.payment_method.type ?? ''),
        }
      : null,
    store: normalizeStore(entry?.store) ?? null,
    created_by: normalizeEmployee(entry?.created_by),
  };
}

const cashSheetService = {
  async getSummary(month: string, storeId?: number | null): Promise<CashSheetSummaryResponse> {
    const params: Record<string, unknown> = { month, _ts: Date.now() };
    if (storeId) params.store_id = storeId;
    const res = await axiosInstance.get('/cash-sheet/summary', { params });
    return normalizeSummary(res.data);
  },

  async getEntries(date: string): Promise<DayEntries> {
    const res = await axiosInstance.get('/cash-sheet/entries', { params: { date, _ts: Date.now() } });
    return {
      success: Boolean(res.data?.success),
      date: String(res.data?.date ?? date),
      branch_costs: (res.data?.branch_costs || []).map(normalizeBranchCostEntry),
      admin_entries: (res.data?.admin_entries || []).map(normalizeAdminEntry),
      owner_entries: (res.data?.owner_entries || []).map(normalizeOwnerEntry),
      accounting_expenses: (res.data?.accounting_expenses || []).map(normalizeAccountingExpense),
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
