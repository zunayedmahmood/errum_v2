import axios from '@/lib/axios';

export type DashboardPeriod = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

export interface DashboardQuery {
  period: DashboardPeriod;
  date_from?: string;
  date_to?: string;
  store_id?: number | 'all';
  fresh?: boolean;
}

const executiveDashboardService = {
  async getOverview(params: DashboardQuery, signal?: AbortSignal) {
    const response = await axios.get('/dashboard/overview', {
      params: {
        ...params,
        store_id: params.store_id === 'all' ? undefined : params.store_id,
        fresh: params.fresh ? 1 : undefined,
      },
      signal,
    });

    return response.data?.data ?? response.data;
  },
};

export default executiveDashboardService;
