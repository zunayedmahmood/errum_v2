import axios from '@/lib/axios';

export type StockAuditStatus = 'active' | 'paused' | 'completed';
export type StockAuditRowStatus = 'matched' | 'short' | 'extra' | 'unexpected';
export type StockAuditScanStatus = 'matched' | 'unexpected_store' | 'unknown_barcode' | 'duplicate' | 'non_sellable';

export interface StockAuditStoreRef {
  id: number;
  name: string;
  store_code?: string | null;
  address?: string | null;
}

export interface StockAuditSummary {
  total_system_units: number;
  total_scanned_units: number;
  total_difference: number;
  matched_products: number;
  short_products: number;
  extra_products: number;
  unexpected_products: number;
  unknown_barcodes: number;
  duplicate_scans: number;
  unexpected_store_scans: number;
  non_sellable_scans: number;
  scan_attempts: number;
}

export interface StockAuditRow {
  product_id: number;
  product_name: string;
  sku?: string | null;
  category_name?: string | null;
  system_count: number;
  scanned_count: number;
  difference: number;
  status: StockAuditRowStatus;
  system_source?: string | null;
  matched_scans: number;
  unexpected_store_scans: number;
  non_sellable_scans: number;
  sample_barcodes: string[];
}

export interface StockAuditScan {
  id: number;
  barcode_text: string;
  product_id?: number | null;
  product_name?: string | null;
  sku?: string | null;
  scan_status: StockAuditScanStatus;
  is_duplicate: boolean;
  system_store_id?: number | null;
  system_store_name?: string | null;
  system_status?: string | null;
  notes?: string | null;
  scanned_at?: string | null;
}

export interface StockAuditSession {
  id: number;
  session_number: string;
  status: StockAuditStatus;
  store_id: number;
  store?: StockAuditStoreRef | null;
  notes?: string | null;
  started_at?: string | null;
  paused_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  summary: StockAuditSummary;
  rows: StockAuditRow[];
  recent_scans: StockAuditScan[];
}

export interface StockAuditListItem {
  id: number;
  session_number: string;
  status: StockAuditStatus;
  store_id: number;
  store?: StockAuditStoreRef | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  scan_attempts_count?: number;
  scanned_units_count?: number;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

const stockAuditService = {
  async list(params?: { store_id?: number | string; status?: StockAuditStatus | ''; per_page?: number }) {
    const response = await axios.get<ApiResponse<any>>('/stock-audits', { params, skipStoreScope: true });
    return response.data;
  },

  async create(payload: { store_id: number; notes?: string }) {
    const response = await axios.post<ApiResponse<StockAuditSession>>('/stock-audits', payload, { skipStoreScope: true });
    return response.data;
  },

  async get(id: number) {
    const response = await axios.get<ApiResponse<StockAuditSession>>(`/stock-audits/${id}`, { skipStoreScope: true });
    return response.data;
  },

  async scan(id: number, barcode: string) {
    const response = await axios.post<ApiResponse<{ scan: StockAuditScan; product_summary: StockAuditRow | null; session: StockAuditSession }>>(
      `/stock-audits/${id}/scan`,
      { barcode },
      { skipStoreScope: true }
    );
    return response.data;
  },

  async updateStatus(id: number, status: StockAuditStatus) {
    const response = await axios.patch<ApiResponse<StockAuditSession>>(
      `/stock-audits/${id}/status`,
      { status },
      { skipStoreScope: true }
    );
    return response.data;
  },
};

export default stockAuditService;
