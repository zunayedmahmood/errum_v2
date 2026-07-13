import axios from '@/lib/axios';

export type BusinessHistoryCategory =
  | 'all'
  | 'product-dispatches'
  | 'orders'
  | 'purchase-orders'
  | 'store-assignments'
  | 'products'
  | 'returns-exchanges'
  | 'service-orders'
  | 'shipments'
  | 'other';

export interface BusinessHistoryWho {
  id: number;
  type: string;
  name: string;
  email?: string;
}

export interface BusinessHistoryWhen {
  timestamp: string;
  formatted: string;
  human?: string;
}

export type BusinessHistoryChanges = Record<string, { from: any; to: any }>;

export interface BusinessHistoryWhat {
  action: string;
  action_label?: string;
  description: string;
  fields_changed?: string[];
  changes?: BusinessHistoryChanges;
  new_data?: Record<string, any>;
  deleted_data?: Record<string, any>;
  request_data?: Record<string, any>;
  details?: Record<string, any>;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface BusinessHistorySubject {
  id: number;
  type: string;
  label?: string;
  identifier?: string;
  data?: any;
}

export interface ActivityLogEntry {
  id: number;
  category: Exclude<BusinessHistoryCategory, 'all'>;
  event?: string;
  who: BusinessHistoryWho;
  when: BusinessHistoryWhen;
  what: BusinessHistoryWhat;
  subject: BusinessHistorySubject;
}

export interface ActivityLogParams {
  category?: BusinessHistoryCategory;
  date_from?: string;
  date_to?: string;
  event?: string;
  per_page?: number;
  page?: number;
  search?: string;
  causer_id?: number | string;
  [key: string]: any;
}

export type BusinessHistoryEntry = ActivityLogEntry;

type Paginated<T> = {
  data: T[];
  links?: any;
  meta?: any;
};

type StatsResponse = {
  total_activities: number;
  date_range?: { from: string; to: string };
  by_model?: Record<string, number>;
  by_event?: Record<string, number>;
  most_active_users?: Array<{ id: number; type: string; name: string; email?: string; activity_count: number }>;
};

const specializedEndpoint: Partial<Record<Exclude<BusinessHistoryCategory, 'all'>, string>> = {
  'product-dispatches': '/business-history/product-dispatches',
  orders: '/business-history/orders',
  'purchase-orders': '/business-history/purchase-orders',
  'store-assignments': '/business-history/store-assignments',
  products: '/business-history/products',
};

function extractItemsAndMeta(payload: any): { items: any[]; meta?: any; links?: any } {
  if (payload?.data?.activities && Array.isArray(payload.data.activities)) {
    return { items: payload.data.activities, meta: payload.data.pagination, links: payload.links };
  }
  if (Array.isArray(payload?.data)) {
    return { items: payload.data, meta: payload.meta, links: payload.links };
  }
  if (Array.isArray(payload?.activities)) {
    return { items: payload.activities, meta: payload.pagination, links: payload.links };
  }
  return { items: [], meta: payload?.meta, links: payload?.links };
}

function deriveCategory(raw: any): Exclude<BusinessHistoryCategory, 'all'> {
  const explicit = String(raw?.category ?? raw?.properties?.category ?? '').toLowerCase();
  const valid: Array<Exclude<BusinessHistoryCategory, 'all'>> = [
    'product-dispatches',
    'orders',
    'purchase-orders',
    'store-assignments',
    'products',
    'returns-exchanges',
    'service-orders',
    'shipments',
    'other',
  ];
  if (valid.includes(explicit as any)) return explicit as Exclude<BusinessHistoryCategory, 'all'>;

  const hay = `${raw?.subject?.type ?? raw?.subject_type ?? ''} ${raw?.log_name ?? ''}`.toLowerCase();
  if (hay.includes('purchaseorder') || hay.includes('purchase_order') || hay.includes('vendorpayment')) return 'purchase-orders';
  if (hay.includes('productdispatch') || hay.includes('product_dispatch')) return 'product-dispatches';
  if (hay.includes('productreturn') || hay.includes('refund') || hay.includes('exchange')) return 'returns-exchanges';
  if (hay.includes('serviceorder') || hay.includes('service_order')) return 'service-orders';
  if (hay.includes('shipment')) return 'shipments';
  if (hay.includes('order')) return 'orders';
  if (hay.includes('product') || hay.includes('inventory') || hay.includes('barcode') || hay.includes('batch')) return 'products';
  return 'other';
}

function buildFieldChanges(oldData: any, newData: any): BusinessHistoryChanges {
  const oldObj = oldData && typeof oldData === 'object' && !Array.isArray(oldData) ? oldData : {};
  const newObj = newData && typeof newData === 'object' && !Array.isArray(newData) ? newData : {};
  const keys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)]));
  const result: BusinessHistoryChanges = {};

  keys.forEach((key) => {
    const from = oldObj[key];
    const to = newObj[key];
    let same = false;
    try {
      same = JSON.stringify(from) === JSON.stringify(to);
    } catch {
      same = from === to;
    }
    if (!same) result[key] = { from, to };
  });
  return result;
}

function normalizeSystemEntry(e: any): ActivityLogEntry {
  const oldData = e?.changes?.old ?? {};
  const attributes = e?.changes?.attributes ?? {};
  const fieldChanges =
    e?.presentation?.field_changes && typeof e.presentation.field_changes === 'object'
      ? e.presentation.field_changes
      : e?.changes?.field_changes && typeof e.changes.field_changes === 'object'
        ? e.changes.field_changes
        : buildFieldChanges(oldData, attributes);

  const event = String(e?.event ?? '');
  const action = String(e?.presentation?.action ?? event ?? 'changed');
  const category = deriveCategory(e);

  return {
    id: Number(e?.id),
    event,
    category,
    who: {
      id: Number(e?.causer?.id ?? 0),
      type: String(e?.causer?.type ?? ''),
      name: String(e?.causer?.name ?? 'System'),
      email: e?.causer?.email ? String(e.causer.email) : undefined,
    },
    when: {
      timestamp: String(e?.created_at ?? ''),
      formatted: String(e?.created_at_formatted ?? e?.created_at ?? ''),
      human: e?.created_at_human ? String(e.created_at_human) : undefined,
    },
    what: {
      action,
      action_label: String(e?.presentation?.action_label ?? ''),
      description: String(e?.presentation?.summary ?? e?.description ?? ''),
      fields_changed: Array.isArray(e?.presentation?.fields_changed)
        ? e.presentation.fields_changed
        : Object.keys(fieldChanges),
      changes: fieldChanges,
      new_data: event === 'created' ? attributes : undefined,
      deleted_data: event === 'deleted' ? (Object.keys(attributes).length ? attributes : oldData) : undefined,
      request_data: e?.details?.request_data ?? undefined,
      details: e?.details ?? {},
      metadata: e?.metadata ?? {},
    },
    subject: {
      id: Number(e?.subject?.id ?? 0),
      type: String(e?.subject?.type ?? ''),
      label: e?.subject?.label ? String(e.subject.label) : undefined,
      identifier: e?.subject?.identifier ? String(e.subject.identifier) : undefined,
      data: e?.subject?.data ?? undefined,
    },
  };
}

function normalizeSpecializedEntry(
  category: Exclude<BusinessHistoryCategory, 'all'>,
  e: any
): ActivityLogEntry {
  const rootDescription = e?.description ? String(e.description) : '';
  const subjectId = Number(e?.subject?.id ?? e?.subject_id ?? e?.subjectId ?? 0);
  const subjectType = String(e?.subject?.type ?? e?.subject_type ?? e?.subjectType ?? '');
  const subjectData = e?.subject?.data ?? e?.subject ?? e?.subject_data ?? undefined;
  const whatObj = e?.what && typeof e.what === 'object' ? e.what : {};

  return {
    id: Number(e?.id),
    event: String(e?.event ?? whatObj?.action ?? ''),
    category,
    who: {
      id: Number(e?.who?.id ?? 0),
      type: String(e?.who?.type ?? ''),
      name: String(e?.who?.name ?? 'System'),
      email: e?.who?.email ? String(e.who.email) : undefined,
    },
    when: {
      timestamp: String(e?.when?.timestamp ?? ''),
      formatted: String(e?.when?.formatted ?? e?.when?.timestamp ?? ''),
      human: e?.when?.human ? String(e.when.human) : undefined,
    },
    what: {
      action: String(whatObj?.action ?? e?.event ?? ''),
      description: String(whatObj?.description ?? rootDescription ?? ''),
      fields_changed: Array.isArray(whatObj?.fields_changed) ? whatObj.fields_changed : [],
      changes: whatObj?.changes && typeof whatObj.changes === 'object' ? whatObj.changes : {},
      new_data: whatObj?.new_data && typeof whatObj.new_data === 'object' ? whatObj.new_data : undefined,
      deleted_data: whatObj?.deleted_data && typeof whatObj.deleted_data === 'object' ? whatObj.deleted_data : undefined,
      ...(typeof whatObj === 'object' ? whatObj : {}),
    },
    subject: {
      id: subjectId,
      type: subjectType,
      data: subjectData,
    },
  };
}

async function fetchSystemWide(params: ActivityLogParams): Promise<Paginated<ActivityLogEntry>> {
  const res = await axios.get('/activity-logs', {
    params: {
      ...params,
      category: params.category === 'all' ? undefined : params.category,
      per_page: params.per_page ?? 50,
      page: params.page ?? 1,
      sort_by: 'created_at',
      sort_direction: 'desc',
    },
  });

  const payload = res.data;
  const items = Array.isArray(payload?.data) ? payload.data : [];
  return {
    data: items.map(normalizeSystemEntry),
    links: payload?.links,
    meta: {
      current_page: payload?.current_page,
      last_page: payload?.last_page,
      per_page: payload?.per_page,
      total: payload?.total,
    },
  };
}

async function fetchSpecialized(
  category: Exclude<BusinessHistoryCategory, 'all'>,
  params: ActivityLogParams
): Promise<Paginated<ActivityLogEntry>> {
  const url = specializedEndpoint[category];
  if (!url) return fetchSystemWide({ ...params, category });

  const { category: _category, ...rest } = params;
  const res = await axios.get(url, {
    params: {
      ...rest,
      per_page: params.per_page ?? 50,
      page: params.page ?? 1,
      date_from: params.date_from,
      date_to: params.date_to,
      start_date: params.date_from,
      end_date: params.date_to,
    },
  });

  const { items, meta, links } = extractItemsAndMeta(res.data);
  return {
    data: items.map((entry: any) => normalizeSpecializedEntry(category, entry)),
    meta,
    links,
  };
}

const activityService = {
  async getLogs(params: ActivityLogParams): Promise<Paginated<ActivityLogEntry>> {
    // The main Activity Log page always uses the system-wide endpoint. This is
    // what guarantees that payments, shipments, returns, service orders and
    // semantic controller operations are not hidden by a specialized feed.
    return fetchSystemWide(params);
  },

  async getHistory(category: BusinessHistoryCategory, params: ActivityLogParams) {
    // Embedded entity panels retain the specialized endpoints because they can
    // follow related records such as an order's items and customer changes.
    if (category === 'all') return fetchSystemWide({ ...params, category });
    return fetchSpecialized(category, { ...params, category });
  },

  async getStatistics(date_from?: string, date_to?: string): Promise<StatsResponse> {
    const res = await axios.get('/business-history/statistics', {
      params: {
        date_from,
        date_to,
        start_date: date_from,
        end_date: date_to,
      },
    });
    return (res.data?.data ?? res.data) as StatsResponse;
  },
};

export default activityService;
