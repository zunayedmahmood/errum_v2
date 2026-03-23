'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import productReturnService, {
  ProductReturn,
  ReturnStatus,
  ProductReturnFilters,
} from '@/services/productReturnService';
import refundService, { CreateRefundRequest, RefundMethod } from '@/services/refundService';
import storeService, { Store } from '@/services/storeService';
import {
  RotateCcw,
  Check,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  RefreshCcw,
  Search,
  Filter,
  DollarSign,
  Package,
  Clock,
  CheckCircle,
  XCircle,
  ArrowRightLeft,
  Eye,
  Building2,
} from 'lucide-react';

// ─── helpers ────────────────────────────────────────────────
const fmt = (v: any) => {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? '৳0' : `৳${n.toLocaleString('en-BD')}`;
};

const fmtDate = (d?: string | null) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const STATUS_CONFIG: Record<ReturnStatus, { label: string; bg: string; text: string; icon: any }> = {
  pending:    { label: 'Pending',    bg: 'bg-amber-100 dark:bg-amber-900/20',  text: 'text-amber-700 dark:text-amber-400',  icon: Clock },
  approved:   { label: 'Approved',   bg: 'bg-blue-100 dark:bg-blue-900/20',    text: 'text-blue-700 dark:text-blue-400',    icon: CheckCircle },
  rejected:   { label: 'Rejected',   bg: 'bg-red-100 dark:bg-red-900/20',      text: 'text-red-700 dark:text-red-400',      icon: XCircle },
  processing: { label: 'Processing', bg: 'bg-purple-100 dark:bg-purple-900/20',text: 'text-purple-700 dark:text-purple-400',icon: RefreshCcw },
  completed:  { label: 'Completed',  bg: 'bg-green-100 dark:bg-green-900/20',  text: 'text-green-700 dark:text-green-400',  icon: CheckCircle },
  refunded:   { label: 'Refunded',   bg: 'bg-teal-100 dark:bg-teal-900/20',    text: 'text-teal-700 dark:text-teal-400',    icon: DollarSign },
};

function StatusBadge({ status }: { status: ReturnStatus }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

// ─── Modal components ────────────────────────────────────────

interface ApproveModalProps {
  ret: ProductReturn;
  onClose: () => void;
  onDone: () => void;
}
function ApproveModal({ ret, onClose, onDone }: ApproveModalProps) {
  const [refundAmount, setRefundAmount] = useState(String(ret.total_return_value ?? 0));
  const [fee, setFee] = useState('0');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const handle = async () => {
    setLoading(true); setErr('');
    try {
      await productReturnService.approve(ret.id, {
        total_refund_amount: parseFloat(refundAmount),
        processing_fee: parseFloat(fee) || 0,
        internal_notes: notes || undefined,
      });
      onDone();
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || 'Failed to approve');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
              <Check className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Approve Return</h3>
              <p className="text-xs text-gray-500">{ret.return_number}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          {err && <div className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">{err}</div>}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Refund Amount (৳)</label>
            <input type="number" value={refundAmount} onChange={e => setRefundAmount(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
            <p className="text-[10px] text-gray-500 mt-1">Original return value: {fmt(ret.total_return_value)}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Processing Fee (৳)</label>
            <input type="number" value={fee} onChange={e => setFee(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Internal Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              placeholder="Quality check notes..." />
          </div>
          <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Net refund to customer:</span>
              <span className="font-bold text-green-700 dark:text-green-400">
                {fmt(Math.max(0, (parseFloat(refundAmount) || 0) - (parseFloat(fee) || 0)))}
              </span>
            </div>
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button onClick={handle} disabled={loading}
            className="flex-1 px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 font-medium">
            {loading ? 'Approving...' : 'Approve Return'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface RejectModalProps { ret: ProductReturn; onClose: () => void; onDone: () => void; }
function RejectModal({ ret, onClose, onDone }: RejectModalProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const handle = async () => {
    if (!reason.trim()) { setErr('Rejection reason is required'); return; }
    setLoading(true); setErr('');
    try {
      await productReturnService.reject(ret.id, { rejection_reason: reason });
      onDone();
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || 'Failed to reject');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-red-100 dark:bg-red-900/20 rounded-lg flex items-center justify-center">
              <XCircle className="w-4 h-4 text-red-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Reject Return</h3>
              <p className="text-xs text-gray-500">{ret.return_number}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          {err && <div className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">{err}</div>}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Rejection Reason *</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              placeholder="Explain why this return is being rejected..." />
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button onClick={handle} disabled={loading}
            className="flex-1 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 font-medium">
            {loading ? 'Rejecting...' : 'Reject Return'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ProcessModalProps { ret: ProductReturn; onClose: () => void; onDone: () => void; }
function ProcessModal({ ret, onClose, onDone }: ProcessModalProps) {
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const handle = async () => {
    setLoading(true); setErr('');
    try {
      await productReturnService.process(ret.id, {});
      onDone();
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || 'Failed to process');
    } finally { setLoading(false); }
  };

  const isCrossStore = ret.received_at_store_id && ret.store_id && ret.received_at_store_id !== ret.store_id;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/20 rounded-lg flex items-center justify-center">
              <RefreshCcw className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Process Return</h3>
              <p className="text-xs text-gray-500">{ret.return_number}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          {err && <div className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">{err}</div>}
          {isCrossStore && (
            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">Cross-Store Return</p>
                  <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5">
                    Item purchased at Store #{ret.store_id} will be added to Store #{ret.received_at_store_id} inventory. Batch tracking will be maintained.
                  </p>
                </div>
              </div>
            </div>
          )}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-2 text-xs">
            <p className="font-medium text-gray-900 dark:text-white">Processing will:</p>
            <ul className="space-y-1 text-gray-600 dark:text-gray-400">
              <li className="flex items-center gap-2"><Check className="w-3 h-3 text-green-500" /> Update batch quantities</li>
              <li className="flex items-center gap-2"><Check className="w-3 h-3 text-green-500" /> Reassign barcodes to store</li>
              <li className="flex items-center gap-2"><Check className="w-3 h-3 text-green-500" /> Log product movements</li>
              {isCrossStore && <li className="flex items-center gap-2"><Check className="w-3 h-3 text-green-500" /> Create cross-store batch (same batch number)</li>}
            </ul>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Internal Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              placeholder="Any notes about the processing..." />
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button onClick={handle} disabled={loading}
            className="flex-1 px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50 font-medium">
            {loading ? 'Processing...' : 'Process & Update Inventory'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface CreateRefundModalProps { ret: ProductReturn; onClose: () => void; onDone: () => void; }
function CreateRefundModal({ ret, onClose, onDone }: CreateRefundModalProps) {
  const [method, setMethod] = useState<RefundMethod>('cash');
  const [amount, setAmount] = useState(String(ret.total_refund_amount ?? ret.total_return_value ?? 0));
  const [txRef, setTxRef] = useState('');
  const [bkashNumber, setBkashNumber] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const METHODS: { value: RefundMethod; label: string }[] = [
    { value: 'cash', label: 'Cash' },
    { value: 'mobile_banking', label: 'Mobile Banking (bKash/Nagad)' },
    { value: 'bank_transfer', label: 'Bank Transfer' },
    { value: 'store_credit', label: 'Store Credit' },
    { value: 'original_payment_method', label: 'Original Payment Method' },
  ];

  const handle = async () => {
    setLoading(true); setErr('');
    try {
      const data: CreateRefundRequest = {
        return_id: ret.id,
        order_id: ret.order_id,
        customer_id: ret.customer_id,
        refund_type: 'full',
        refund_amount: parseFloat(amount),
        refund_method: method,
        internal_notes: notes || undefined,
        refund_method_details: method === 'mobile_banking' ? { provider: 'bKash', account_number: bkashNumber }
          : method === 'bank_transfer' ? { account_number: bankAccount }
          : undefined,
      };
      const refundRes = await refundService.create(data);
      const refundId = refundRes?.data?.id;
      if (refundId && txRef) {
        await refundService.process(refundId);
        await refundService.complete(refundId, { transaction_reference: txRef });
      } else if (refundId) {
        await refundService.process(refundId);
      }
      onDone();
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || 'Failed to create refund');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-teal-100 dark:bg-teal-900/20 rounded-lg flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-teal-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Issue Refund</h3>
              <p className="text-xs text-gray-500">{ret.return_number}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          {err && <div className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">{err}</div>}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Refund Method</label>
            <select value={method} onChange={e => setMethod(e.target.value as RefundMethod)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500">
              {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Refund Amount (৳)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
            <p className="text-[10px] text-gray-500 mt-1">Approved refund amount: {fmt(ret.total_refund_amount)}</p>
          </div>
          {method === 'mobile_banking' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">bKash/Nagad Number</label>
              <input type="text" value={bkashNumber} onChange={e => setBkashNumber(e.target.value)} placeholder="+8801..."
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
          )}
          {method === 'bank_transfer' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Bank Account Number</label>
              <input type="text" value={bankAccount} onChange={e => setBankAccount(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Transaction Reference (optional)</label>
            <input type="text" value={txRef} onChange={e => setTxRef(e.target.value)} placeholder="TXN ID, receipt number..."
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
            <p className="text-[10px] text-gray-500 mt-1">If provided, refund will be marked as completed immediately</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
          </div>
          {method === 'store_credit' && (
            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-400">
              A store credit code will be generated automatically and can be used on the next purchase.
            </div>
          )}
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button onClick={handle} disabled={loading}
            className="flex-1 px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg disabled:opacity-50 font-medium">
            {loading ? 'Processing...' : 'Issue Refund'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail modal ─────────────────────────────────────────────
interface DetailModalProps { ret: ProductReturn; onClose: () => void; onAction: () => void; }
function DetailModal({ ret, onClose, onAction }: DetailModalProps) {
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [processOpen, setProcessOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);

  const done = () => { onAction(); onClose(); };
  const isCrossStore = ret.received_at_store_id && ret.store_id && ret.received_at_store_id !== ret.store_id;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700">
          <div className="sticky top-0 bg-white dark:bg-gray-900 flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
                <RotateCcw className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-gray-900 dark:text-white">{ret.return_number}</h2>
                  <StatusBadge status={ret.status} />
                  {isCrossStore && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400">
                      <Building2 className="w-3 h-3" />Cross-Store
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500">Order #{ret.order_id} • {fmtDate(ret.return_date)}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><X className="w-5 h-5" /></button>
          </div>

          <div className="p-6 space-y-5">
            {/* Customer & Store */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                <p className="text-[10px] text-gray-500 uppercase font-medium mb-2">Customer</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{ret.customer?.name || `#${ret.customer_id}`}</p>
                {ret.customer?.phone && <p className="text-xs text-gray-500">{ret.customer.phone}</p>}
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                <p className="text-[10px] text-gray-500 uppercase font-medium mb-2">Store</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{ret.store?.name || `#${ret.store_id}`}</p>
                {isCrossStore && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    Received at Store #{ret.received_at_store_id}
                  </p>
                )}
              </div>
            </div>

            {/* Reason & Type */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] text-gray-500 uppercase font-medium mb-1">Return Reason</p>
                <p className="text-sm text-gray-900 dark:text-white capitalize">{(ret.return_reason || '').replace(/_/g, ' ')}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase font-medium mb-1">Return Type</p>
                <p className="text-sm text-gray-900 dark:text-white capitalize">{(ret.return_type || 'customer_return').replace(/_/g, ' ')}</p>
              </div>
            </div>

            {/* Financials */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
              <p className="text-[10px] text-gray-500 uppercase font-medium mb-3">Financials</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[10px] text-gray-500">Return Value</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{fmt(ret.total_return_value)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500">Processing Fee</p>
                  <p className="text-sm font-bold text-red-600 dark:text-red-400">{fmt(ret.processing_fee)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500">Refund Amount</p>
                  <p className="text-sm font-bold text-green-600 dark:text-green-400">{fmt(ret.total_refund_amount)}</p>
                </div>
              </div>
            </div>

            {/* Return Items */}
            <div>
              <p className="text-[10px] text-gray-500 uppercase font-medium mb-2">Return Items</p>
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase">Product</th>
                      <th className="text-right px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase">Qty</th>
                      <th className="text-right px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase">Unit Price</th>
                      <th className="text-right px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {(ret.return_items || []).map((item, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">
                          {item.product_name}
                          {item.reason && <p className="text-[9px] text-gray-500 mt-0.5">{item.reason}</p>}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{item.quantity}</td>
                        <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{fmt(item.unit_price)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-white">{fmt(item.total_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Notes */}
            {(ret.customer_notes || ret.internal_notes || ret.quality_check_notes || ret.rejection_reason) && (
              <div className="space-y-2">
                {ret.customer_notes && (
                  <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-[9px] text-blue-500 uppercase font-medium mb-1">Customer Notes</p>
                    <p className="text-xs text-blue-800 dark:text-blue-300">{ret.customer_notes}</p>
                  </div>
                )}
                {ret.internal_notes && (
                  <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                    <p className="text-[9px] text-gray-500 uppercase font-medium mb-1">Internal Notes</p>
                    <p className="text-xs text-gray-700 dark:text-gray-300">{ret.internal_notes}</p>
                  </div>
                )}
                {ret.quality_check_notes && (
                  <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-3">
                    <p className="text-[9px] text-green-500 uppercase font-medium mb-1">Quality Check Notes</p>
                    <p className="text-xs text-green-800 dark:text-green-300">{ret.quality_check_notes}</p>
                  </div>
                )}
                {ret.rejection_reason && (
                  <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-3">
                    <p className="text-[9px] text-red-500 uppercase font-medium mb-1">Rejection Reason</p>
                    <p className="text-xs text-red-800 dark:text-red-300">{ret.rejection_reason}</p>
                  </div>
                )}
              </div>
            )}

            {/* Refunds */}
            {ret.refunds && ret.refunds.length > 0 && (
              <div>
                <p className="text-[10px] text-gray-500 uppercase font-medium mb-2">Refunds</p>
                <div className="space-y-2">
                  {ret.refunds.map((refund: any) => (
                    <div key={refund.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                      <div>
                        <p className="text-xs font-semibold text-gray-900 dark:text-white">{refund.refund_number}</p>
                        <p className="text-[10px] text-gray-500 capitalize">{(refund.refund_method || '').replace(/_/g, ' ')}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-gray-900 dark:text-white">{fmt(refund.refund_amount)}</p>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${refund.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                          {refund.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              {ret.status === 'pending' && (
                <>
                  <button onClick={() => setApproveOpen(true)}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium">
                    <Check className="w-4 h-4" /> Approve
                  </button>
                  <button onClick={() => setRejectOpen(true)}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">
                    <X className="w-4 h-4" /> Reject
                  </button>
                </>
              )}
              {ret.status === 'approved' && (
                <button onClick={() => setProcessOpen(true)}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium">
                  <RefreshCcw className="w-4 h-4" /> Process Return
                </button>
              )}
              {ret.status === 'completed' && (
                <button onClick={() => setRefundOpen(true)}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium">
                  <DollarSign className="w-4 h-4" /> Issue Refund
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {approveOpen && <ApproveModal ret={ret} onClose={() => setApproveOpen(false)} onDone={done} />}
      {rejectOpen && <RejectModal ret={ret} onClose={() => setRejectOpen(false)} onDone={done} />}
      {processOpen && <ProcessModal ret={ret} onClose={() => setProcessOpen(false)} onDone={done} />}
      {refundOpen && <CreateRefundModal ret={ret} onClose={() => setRefundOpen(false)} onDone={done} />}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────
export default function ReturnsPage() {
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [returns, setReturns] = useState<ProductReturn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<any>(null);
  const [stores, setStores] = useState<Store[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ReturnStatus | ''>('');
  const [storeFilter, setStoreFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PER_PAGE = 20;

  // Selected
  const [selectedReturn, setSelectedReturn] = useState<ProductReturn | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const filters: ProductReturnFilters = {
        page, per_page: PER_PAGE,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(storeFilter ? { store_id: parseInt(storeFilter) } : {}),
        ...(search ? { search } : {}),
        ...(fromDate ? { from_date: fromDate } : {}),
        ...(toDate ? { to_date: toDate } : {}),
      };
      const res = await productReturnService.getAll(filters);
      const data = res?.data?.data || res?.data || [];
      setReturns(Array.isArray(data) ? data : []);
      setTotal(res?.data?.total || data.length);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load returns');
    } finally { setLoading(false); }
  }, [page, statusFilter, storeFilter, search, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    productReturnService.getStatistics().then(r => setStats(r?.data || null)).catch(() => {});
    storeService.getStores({ per_page: 100, is_active: true }).then((r: any) => {
      const list = Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : Array.isArray(r?.data?.data) ? r.data.data : [];
      setStores(list);
    }).catch(() => {});
  }, []);

  const statusCounts = {
    pending: stats?.pending_returns ?? 0,
    approved: stats?.approved_returns ?? 0,
    completed: stats?.completed_returns ?? 0,
    refunded: (stats?.total_returns ?? 0) - (stats?.pending_returns ?? 0) - (stats?.approved_returns ?? 0) - (stats?.completed_returns ?? 0) - (stats?.rejected_returns ?? 0),
  };

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex h-screen bg-white dark:bg-black">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

          <main className="flex-1 overflow-auto bg-white dark:bg-black">
            {/* Page header */}
            <div className="border-b border-gray-200 dark:border-gray-800 px-4 py-3">
              <div className="max-w-7xl mx-auto flex items-center justify-between">
                <div>
                  <h1 className="text-base font-semibold text-black dark:text-white">Returns & Exchanges</h1>
                  <p className="text-xs text-gray-500 mt-0.5">Manage product returns, quality checks and refunds</p>
                </div>
                <button onClick={load} disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700">
                  <RefreshCcw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
              {/* Stats */}
              {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Total Returns', value: stats.total_returns ?? 0, icon: Package, color: 'text-gray-700 dark:text-gray-300', bg: 'bg-gray-100 dark:bg-gray-800' },
                    { label: 'Pending', value: stats.pending_returns ?? 0, icon: Clock, color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' },
                    { label: 'Return Value', value: fmt(stats.total_return_value), icon: DollarSign, color: 'text-red-700 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
                    { label: 'Total Refunded', value: fmt(stats.total_refunded_amount), icon: CheckCircle, color: 'text-green-700 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20' },
                  ].map(s => (
                    <div key={s.label} className={`${s.bg} rounded-xl p-3 border border-gray-200 dark:border-gray-700`}>
                      <div className="flex items-center gap-2 mb-1">
                        <s.icon className={`w-4 h-4 ${s.color}`} />
                        <p className="text-[10px] text-gray-500 uppercase font-medium">{s.label}</p>
                      </div>
                      <p className={`text-lg font-bold ${s.color}`}>{String(s.value)}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Filters */}
              <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <div className="md:col-span-2 relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                      placeholder="Search return# or order#..."
                      className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white" />
                  </div>
                  <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value as any); setPage(1); }}
                    className="px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white">
                    <option value="">All Status</option>
                    {(Object.keys(STATUS_CONFIG) as ReturnStatus[]).map(s => (
                      <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                    ))}
                  </select>
                  <select value={storeFilter} onChange={e => { setStoreFilter(e.target.value); setPage(1); }}
                    className="px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white">
                    <option value="">All Stores</option>
                    {stores.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <div className="flex gap-1">
                    <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1); }}
                      className="flex-1 px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none" />
                    <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(1); }}
                      className="flex-1 px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none" />
                  </div>
                </div>
              </div>

              {/* Error */}
              {error && <div className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">{error}</div>}

              {/* Table */}
              <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                <div className="bg-gray-50 dark:bg-gray-900 px-4 py-2 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wide">Returns</h2>
                  <span className="text-[9px] px-2 py-0.5 bg-black dark:bg-white text-white dark:text-black rounded font-medium">{total}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-white dark:bg-black border-b border-gray-200 dark:border-gray-800">
                      <tr>
                        {['Return #', 'Order', 'Customer', 'Store', 'Reason', 'Return Value', 'Refund Amount', 'Status', 'Date', 'Actions'].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-[9px] font-semibold text-gray-500 uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {loading ? (
                        <tr><td colSpan={10} className="px-4 py-12 text-center text-xs text-gray-500">
                          <div className="w-5 h-5 border-2 border-gray-300 border-t-black dark:border-t-white rounded-full animate-spin mx-auto mb-2" />
                          Loading...
                        </td></tr>
                      ) : returns.length === 0 ? (
                        <tr><td colSpan={10} className="px-4 py-12 text-center text-xs text-gray-500">No returns found.</td></tr>
                      ) : returns.map(ret => {
                        const isCrossStore = ret.received_at_store_id && ret.store_id && ret.received_at_store_id !== ret.store_id;
                        return (
                          <tr key={ret.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/40 transition-colors">
                            <td className="px-3 py-2 font-semibold text-black dark:text-white">
                              {ret.return_number}
                              {isCrossStore && (
                                <span className="ml-1 text-[8px] px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">X-Store</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-700 dark:text-gray-300">#{ret.order_id}</td>
                            <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                              <p className="font-medium">{ret.customer?.name || `#${ret.customer_id}`}</p>
                              {ret.customer?.phone && <p className="text-[9px] text-gray-500">{ret.customer.phone}</p>}
                            </td>
                            <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{ret.store?.name || `#${ret.store_id}`}</td>
                            <td className="px-3 py-2 text-gray-700 dark:text-gray-300 capitalize">{(ret.return_reason || '').replace(/_/g, ' ')}</td>
                            <td className="px-3 py-2 font-semibold text-gray-900 dark:text-white">{fmt(ret.total_return_value)}</td>
                            <td className="px-3 py-2 font-semibold text-green-700 dark:text-green-400">{fmt(ret.total_refund_amount)}</td>
                            <td className="px-3 py-2"><StatusBadge status={ret.status} /></td>
                            <td className="px-3 py-2 text-gray-500 text-[10px]">{fmtDate(ret.return_date)}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1">
                                <button onClick={() => setSelectedReturn(ret)}
                                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg" title="View details">
                                  <Eye className="w-3.5 h-3.5 text-gray-500" />
                                </button>
                                {ret.status === 'pending' && (
                                  <>
                                    <button onClick={() => setSelectedReturn(ret)}
                                      className="p-1 text-[9px] px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400 rounded-full hover:bg-green-200">
                                      Approve
                                    </button>
                                  </>
                                )}
                                {ret.status === 'approved' && (
                                  <button onClick={() => setSelectedReturn(ret)}
                                    className="p-1 text-[9px] px-2 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400 rounded-full hover:bg-purple-200">
                                    Process
                                  </button>
                                )}
                                {ret.status === 'completed' && (
                                  <button onClick={() => setSelectedReturn(ret)}
                                    className="p-1 text-[9px] px-2 py-0.5 bg-teal-100 text-teal-700 dark:bg-teal-900/20 dark:text-teal-400 rounded-full hover:bg-teal-200">
                                    Refund
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {total > PER_PAGE && (
                  <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
                    <p className="text-[10px] text-gray-500">Showing {((page - 1) * PER_PAGE) + 1}–{Math.min(page * PER_PAGE, total)} of {total}</p>
                    <div className="flex gap-1">
                      <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                        className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-700 rounded disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800">
                        Prev
                      </button>
                      <button onClick={() => setPage(p => p + 1)} disabled={page * PER_PAGE >= total}
                        className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-700 rounded disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800">
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>

      {selectedReturn && (
        <DetailModal
          ret={selectedReturn}
          onClose={() => setSelectedReturn(null)}
          onAction={() => { load(); setSelectedReturn(null); }}
        />
      )}
    </div>
  );
}
