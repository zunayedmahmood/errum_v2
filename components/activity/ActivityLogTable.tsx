import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Copy } from 'lucide-react';

import type { BusinessHistoryEntry } from '@/services/activityService';

interface ActivityLogTableProps {
  entries: BusinessHistoryEntry[];
  isLoading?: boolean;
  onCopy?: (text: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  orders: 'Orders',
  'purchase-orders': 'Purchase Orders',
  'product-dispatches': 'Dispatches',
  'store-assignments': 'Store Assignments',
  products: 'Products & Inventory',
  'returns-exchanges': 'Returns & Exchanges',
  'service-orders': 'Service Orders',
  shipments: 'Shipments',
  other: 'Other',
};

const FIELD_LABELS: Record<string, string> = {
  id: 'ID',
  order_id: 'Order',
  order_number: 'Order Number',
  order_type: 'Order Type',
  purchase_order_id: 'Purchase Order',
  po_number: 'PO Number',
  dispatch_id: 'Dispatch',
  dispatch_number: 'Dispatch Number',
  return_id: 'Return',
  return_number: 'Return Number',
  service_order_id: 'Service Order',
  service_order_number: 'Service Order Number',
  shipment_id: 'Shipment',
  shipment_number: 'Shipment Number',
  customer_id: 'Customer',
  customer_name: 'Customer Name',
  customer_phone: 'Customer Phone',
  customer_email: 'Customer Email',
  store_id: 'Store',
  source_store_id: 'Source Store',
  destination_store_id: 'Destination Store',
  vendor_id: 'Vendor',
  product_id: 'Product',
  product_variant_id: 'Product Variant',
  product_batch_id: 'Product Batch',
  barcode_id: 'Barcode',
  status: 'Status',
  payment_status: 'Payment Status',
  fulfillment_status: 'Fulfilment Status',
  approval_status: 'Approval Status',
  total_amount: 'Total Amount',
  subtotal: 'Subtotal',
  paid_amount: 'Paid Amount',
  outstanding_amount: 'Outstanding Amount',
  discount_amount: 'Discount',
  shipping_amount: 'Shipping Charge',
  tax_amount: 'Tax',
  quantity: 'Quantity',
  received_quantity: 'Received Quantity',
  dispatched_quantity: 'Dispatched Quantity',
  unit_price: 'Unit Price',
  created_by: 'Created By',
  approved_by: 'Approved By',
  received_by: 'Received By',
  processed_by: 'Processed By',
  cancelled_by: 'Cancelled By',
  created_at: 'Created At',
  updated_at: 'Updated At',
  deleted_at: 'Deleted At',
  approved_at: 'Approved At',
  received_at: 'Received At',
  dispatched_at: 'Dispatched At',
  delivered_at: 'Delivered At',
  cancelled_at: 'Cancelled At',
  shipping_address: 'Shipping Address',
  billing_address: 'Billing Address',
  delivery_address: 'Delivery Address',
  pickup_address: 'Pickup Address',
  notes: 'Notes',
  reason: 'Reason',
  return_reason: 'Return Reason',
  exchange_reason: 'Exchange Reason',
  request_data: 'Submitted Information',
};

const MONEY_FIELDS = new Set([
  'amount',
  'total',
  'total_amount',
  'subtotal',
  'paid_amount',
  'outstanding_amount',
  'discount_amount',
  'shipping_amount',
  'tax_amount',
  'unit_price',
  'price',
  'delivery_fee',
  'cod_amount',
  'amount_to_collect',
]);

const HIDDEN_SNAPSHOT_FIELDS = new Set([
  'metadata',
  'pathao_response',
  'status_history',
  'payment_history',
  'remember_token',
  'password',
]);

function humanize(value: string) {
  if (!value) return 'Not specified';
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fieldLabel(field: string) {
  return FIELD_LABELS[field] || humanize(field);
}

function isEmptyValue(value: any) {
  return value === null || value === undefined || value === '';
}

function isDateLike(field: string, value: any) {
  if (typeof value !== 'string') return false;
  return field.endsWith('_at') || field.endsWith('_date') || /^\d{4}-\d{2}-\d{2}[T\s]/.test(value);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPrimitive(field: string, value: any): string {
  if (isEmptyValue(value)) return 'Not set';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (isDateLike(field, value)) return formatDate(String(value));
  if (MONEY_FIELDS.has(field) || field.endsWith('_amount') || field.endsWith('_price')) {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return `৳${numeric.toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;
    }
  }
  if (field === 'status' || field.endsWith('_status') || field === 'order_type') {
    return humanize(String(value));
  }
  if ((field === 'id' || field.endsWith('_id') || field.endsWith('_by')) && (typeof value === 'number' || /^\d+$/.test(String(value)))) {
    return `#${value}`;
  }
  if (typeof value === 'number') return value.toLocaleString('en-BD');
  return String(value);
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-700 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
      {children}
    </span>
  );
}

function ValueView({ field, value, depth = 0 }: { field: string; value: any; depth?: number }) {
  if (Array.isArray(value)) {
    if (!value.length) return <span className="text-gray-500 dark:text-gray-400">None</span>;
    return (
      <div className="space-y-2">
        {value.slice(0, 20).map((item, index) => (
          <div key={index} className="rounded-md border border-gray-200 p-2 dark:border-gray-700">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Item {index + 1}
            </div>
            <ValueView field={`${field}_${index}`} value={item} depth={depth + 1} />
          </div>
        ))}
        {value.length > 20 && (
          <div className="text-xs text-gray-500 dark:text-gray-400">{value.length - 20} additional items omitted</div>
        )}
      </div>
    );
  }

  if (value && typeof value === 'object') {
    const rows = Object.entries(value).filter(([key]) => !HIDDEN_SNAPSHOT_FIELDS.has(key));
    if (!rows.length) return <span className="text-gray-500 dark:text-gray-400">No details</span>;
    return (
      <div className={depth > 0 ? 'space-y-1.5' : 'grid grid-cols-1 gap-2 md:grid-cols-2'}>
        {rows.map(([key, nestedValue]) => (
          <div
            key={key}
            className={depth > 0 ? 'grid grid-cols-[minmax(120px,0.4fr)_1fr] gap-3 text-sm' : 'rounded-md bg-gray-50 p-2.5 dark:bg-gray-950'}
          >
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">{fieldLabel(key)}</div>
            <div className="break-words text-sm text-gray-900 dark:text-gray-100">
              {nestedValue && typeof nestedValue === 'object' ? (
                <ValueView field={key} value={nestedValue} depth={depth + 1} />
              ) : (
                formatPrimitive(key, nestedValue)
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return <span>{formatPrimitive(field, value)}</span>;
}

function DataSection({
  title,
  data,
  emptyText,
}: {
  title: string;
  data?: Record<string, any>;
  emptyText?: string;
}) {
  const rows = data && typeof data === 'object'
    ? Object.fromEntries(Object.entries(data).filter(([key]) => !HIDDEN_SNAPSHOT_FIELDS.has(key)))
    : {};

  if (!Object.keys(rows).length) {
    return emptyText ? <div className="text-xs text-gray-500 dark:text-gray-400">{emptyText}</div> : null;
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{title}</div>
      <ValueView field={title} value={rows} />
    </div>
  );
}

function ChangeValue({ field, value }: { field: string; value: any }) {
  if (value && typeof value === 'object') {
    return (
      <div className="mt-1 rounded-md bg-gray-50 p-2 dark:bg-gray-950">
        <ValueView field={field} value={value} depth={1} />
      </div>
    );
  }
  return <span className="font-medium text-gray-900 dark:text-gray-100">{formatPrimitive(field, value)}</span>;
}

function ChangesSection({ changes }: { changes?: Record<string, { from: any; to: any }> }) {
  const rows = Object.entries(changes || {}).filter(([field]) => !['updated_at', 'created_at'].includes(field));
  if (!rows.length) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">What changed</div>
      <div className="space-y-3">
        {rows.map(([field, change]) => (
          <div key={field} className="rounded-md bg-gray-50 p-3 dark:bg-gray-950">
            <div className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">{fieldLabel(field)}</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr] md:items-start">
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Before</div>
                <ChangeValue field={field} value={change?.from} />
              </div>
              <div className="hidden pt-6 text-gray-400 md:block">→</div>
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">After</div>
                <ChangeValue field={field} value={change?.to} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function meaningfulDetails(entry: BusinessHistoryEntry) {
  const details = entry.what?.details || {};
  return Object.fromEntries(
    Object.entries(details).filter(([key, value]) =>
      !['request_data', 'route_parameters'].includes(key) &&
      value !== null &&
      value !== undefined &&
      value !== '' &&
      !(typeof value === 'object' && !Object.keys(value as object).length)
    )
  );
}

export default function ActivityLogTable({ entries, isLoading, onCopy }: ActivityLogTableProps) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const sorted = useMemo(() => {
    return [...entries].sort((a, b) => {
      const ta = new Date(a.when?.timestamp || 0).getTime();
      const tb = new Date(b.when?.timestamp || 0).getTime();
      return tb - ta;
    });
  }, [entries]);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
        Loading history...
      </div>
    );
  }

  if (!sorted.length) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
        No activity found for the selected filters.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="w-10 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-300" />
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-300">Time</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-300">Who</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-300">Activity</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-300">Record</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-300">Summary</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {sorted.map((entry) => {
              const isOpen = !!expanded[entry.id];
              const whoName = entry.who?.name || 'System';
              const whoEmail = entry.who?.email;
              const whenText = entry.when?.formatted || entry.when?.timestamp || '';
              const action = humanize(entry.what?.action || entry.event || 'changed');
              const description = entry.what?.description || `${action} ${entry.subject?.label || entry.subject?.type || 'record'}`;
              const subjectType = entry.subject?.label || humanize(entry.subject?.type || entry.category);
              const subjectIdentifier = entry.subject?.identifier;
              const subjectId = entry.subject?.id;
              const changedCount = Object.keys(entry.what?.changes || {}).filter((field) => !['updated_at', 'created_at'].includes(field)).length;
              const requestCount = Object.keys(entry.what?.request_data || {}).length;
              const categoryLabel = CATEGORY_LABELS[entry.category] || humanize(entry.category);

              return (
                <React.Fragment key={`${entry.category}-${entry.id}`}>
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setExpanded((previous) => ({ ...previous, [entry.id]: !previous[entry.id] }))}
                        className="inline-flex items-center justify-center rounded-md p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                        title={isOpen ? 'Collapse' : 'Expand'}
                      >
                        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-top">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{whenText ? formatDate(whenText) : 'Time unavailable'}</div>
                      {entry.when?.human && <div className="text-xs text-gray-500 dark:text-gray-400">{entry.when.human}</div>}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">{whoName}</div>
                      {whoEmail && <div className="text-xs text-gray-500 dark:text-gray-400">{whoEmail}</div>}
                      {entry.who?.type && <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{humanize(entry.who.type)}</div>}
                    </td>
                    <td className="min-w-[280px] px-4 py-3 align-top">
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip>{categoryLabel}</Chip>
                        <Chip>{action}</Chip>
                      </div>
                      <div className="mt-2 text-sm leading-5 text-gray-800 dark:text-gray-100">{description}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{subjectType}</div>
                      {subjectIdentifier ? (
                        <div className="text-xs text-gray-500 dark:text-gray-400">{subjectIdentifier}</div>
                      ) : subjectId ? (
                        <div className="text-xs text-gray-500 dark:text-gray-400">Record #{subjectId}</div>
                      ) : (
                        <div className="text-xs text-gray-500 dark:text-gray-400">Operation level</div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="text-xs text-gray-600 dark:text-gray-300">
                        {changedCount > 0
                          ? `${changedCount} field${changedCount === 1 ? '' : 's'} changed`
                          : entry.what?.new_data && Object.keys(entry.what.new_data).length
                            ? 'New record created'
                            : entry.what?.deleted_data && Object.keys(entry.what.deleted_data).length
                              ? 'Record removed'
                              : requestCount > 0
                                ? 'Business action recorded'
                                : 'Activity recorded'}
                      </div>
                    </td>
                  </tr>

                  {isOpen && (
                    <tr className="bg-gray-50 dark:bg-gray-800/40">
                      <td colSpan={6} className="px-6 py-4">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Chip>{action}</Chip>
                            <Chip>{subjectType}</Chip>
                            {description && (
                              <button
                                type="button"
                                onClick={() => onCopy?.(description)}
                                className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                              >
                                <Copy size={14} />
                                Copy summary
                              </button>
                            )}
                          </div>

                          <ChangesSection changes={entry.what?.changes} />
                          <DataSection title="New record details" data={entry.what?.new_data} />
                          <DataSection title="Deleted record details" data={entry.what?.deleted_data} />
                          <DataSection title="Submitted information" data={entry.what?.request_data} />
                          <DataSection title="Operation details" data={meaningfulDetails(entry)} />
                          <DataSection title="Current record snapshot" data={entry.subject?.data} />

                          {entry.what?.metadata && Object.values(entry.what.metadata).some((value) => value !== null && value !== undefined && value !== '') && (
                            <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Technical trace</div>
                              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                {Object.entries(entry.what.metadata)
                                  .filter(([, value]) => value !== null && value !== undefined && value !== '')
                                  .map(([field, value]) => (
                                    <div key={field} className="rounded-md bg-gray-50 p-2 dark:bg-gray-950">
                                      <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">{fieldLabel(field)}</div>
                                      <div className="mt-1 break-all text-xs text-gray-800 dark:text-gray-200">{formatPrimitive(field, value)}</div>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
