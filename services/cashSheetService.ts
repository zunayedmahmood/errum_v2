import axiosInstance from '@/lib/axios';

// ── Sheet types ───────────────────────────────────────────────────────────────

export interface BranchDay {
  store_id: number;
  store_name: string;
  daily_sale: number;
  raw_cash: number;
  cash: number;
  bank: number;
  ex_on: number;
  salary: number;
  cash_to_bank: number;
  daily_cost: number;
}

export interface CashSheetRow {
  date: string;
  branches: BranchDay[];
  online: { daily_sales: number; advance: number; online_payment: number; cod: number };
  disbursements: { sslzc_received: number; pathao_received: number };
  totals: { total_sale: number; cash: number; bank: number; final_bank: number };
  owner: {
    cash_invest: number; bank_invest: number;
    total_cash: number; total_bank: number;
    cash_cost: number; bank_cost: number;
    cash_after_cost: number; bank_after_cost: number;
  };
}

export interface CashSheetSummary {
  branches: BranchDay[];
  online: { daily_sales: number; advance: number; online_payment: number; cod: number };
  disbursements: { sslzc_received: number; pathao_received: number };
  totals: { total_sale: number; cash: number; bank: number; final_bank: number };
  owner: {
    cash_invest: number; bank_invest: number;
    total_cash: number; total_bank: number;
    cash_cost: number; bank_cost: number;
    cash_after_cost: number; bank_after_cost: number;
  };
}

export interface CashSheetResponse {
  success: boolean;
  month: string;
  stores: { id: number; name: string; is_warehouse?: boolean }[];
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
}

// ── Normalizers ───────────────────────────────────────────────────────────────

function normalizeBranchCostEntry(entry: any): BranchCostEntry {
  return {
    ...entry,
    store_id: entry?.store_id != null ? Number(entry.store_id) : 0,
    amount: Number(entry?.amount ?? 0),
    created_by: entry?.created_by ?? entry?.createdBy ?? null,
  };
}

function normalizeAdminEntry(entry: any): AdminEntry {
  return {
    ...entry,
    store_id: entry?.store_id != null ? Number(entry.store_id) : null,
    amount: Number(entry?.amount ?? 0),
    created_by: entry?.created_by ?? entry?.createdBy ?? null,
  };
}

function normalizeOwnerEntry(entry: any): OwnerEntry {
  return {
    ...entry,
    amount: Number(entry?.amount ?? 0),
    created_by: entry?.created_by ?? entry?.createdBy ?? null,
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

const cashSheetService = {
  async getSheet(month: string): Promise<CashSheetResponse> {
    const res = await axiosInstance.get('/cash-sheet', { params: { month, _ts: Date.now() } });
    return res.data;
  },

  async getEntries(date: string): Promise<DayEntries> {
    const res = await axiosInstance.get('/cash-sheet/entries', { params: { date, _ts: Date.now() } });
    return {
      ...res.data,
      branch_costs: (res.data?.branch_costs || []).map(normalizeBranchCostEntry),
      admin_entries: (res.data?.admin_entries || []).map(normalizeAdminEntry),
      owner_entries: (res.data?.owner_entries || []).map(normalizeOwnerEntry),
    };
  },

  // Branch cost
  async addBranchCost(payload: { entry_date: string; store_id: number; amount: number; details?: string }): Promise<BranchCostEntry> {
    const res = await axiosInstance.post('/cash-sheet/branch-cost', payload);
    return normalizeBranchCostEntry(res.data.entry);
  },
  async deleteBranchCost(id: number): Promise<void> {
    await axiosInstance.delete(`/cash-sheet/branch-cost/${id}`);
  },

  // Admin entry
  async addAdminEntry(payload: { entry_date: string; type: AdminEntryType; store_id?: number | null; amount: number; details?: string }): Promise<AdminEntry> {
    const res = await axiosInstance.post('/cash-sheet/admin', payload);
    return normalizeAdminEntry(res.data.entry);
  },
  async deleteAdminEntry(id: number): Promise<void> {
    await axiosInstance.delete(`/cash-sheet/admin/${id}`);
  },

  // Owner entry
  async addOwnerEntry(payload: { entry_date: string; type: OwnerEntryType; amount: number; details?: string }): Promise<OwnerEntry> {
    const res = await axiosInstance.post('/cash-sheet/owner', payload);
    return normalizeOwnerEntry(res.data.entry);
  },
  async deleteOwnerEntry(id: number): Promise<void> {
    await axiosInstance.delete(`/cash-sheet/owner/${id}`);
  },
};

export default cashSheetService;
