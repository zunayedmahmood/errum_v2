import axiosInstance from '@/lib/axios';

export interface DailyBranchRow {
  date: string;
  branch: string;
  pos_sales: number;
  online_sales: number;
  social_commerce_sales: number;
  total_sales: number;
  cash_in: number;
  card_in: number;
  mfs_in: number;
  bank_in: number;
  total_money_in: number;
  daily_expenses: number;
  net_cash_position: number;
}

export interface DailyBranchReportResponse {
  success: boolean;
  data: DailyBranchRow[];
  meta: {
    date_from: string;
    date_to: string;
    store_id: number | null;
    generated_at: string;
  };
}

export interface DailyReportParams {
  date?: string;
  from?: string;
  to?: string;
  store_id?: number | null;
}

const dailyBranchReportService = {
  async getReport(params: DailyReportParams): Promise<DailyBranchReportResponse> {
    const query: Record<string, string> = {};
    if (params.date)     query.date     = params.date;
    if (params.from)     query.from     = params.from;
    if (params.to)       query.to       = params.to;
    if (params.store_id) query.store_id = String(params.store_id);

    const response = await axiosInstance.get('/reports/daily-branch-json', { params: query });
    return response.data;
  },

  downloadUrl(params: DailyReportParams & { combined?: boolean }): string {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
    const query = new URLSearchParams();
    if (params.date)     query.set('date',     params.date);
    if (params.from)     query.set('from',     params.from);
    if (params.to)       query.set('to',       params.to);
    if (params.store_id) query.set('store_id', String(params.store_id));
    if (params.combined) query.set('combined', '1');
    return `${base}/reports/daily-branch?${query.toString()}`;
  },
};

export default dailyBranchReportService;
