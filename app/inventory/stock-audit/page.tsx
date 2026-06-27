'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import {
  AlertTriangle,
  Barcode,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Package,
  Pause,
  Play,
  RefreshCw,
  ScanLine,
  Store as StoreIcon,
  XCircle,
} from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { useTheme } from '@/contexts/ThemeContext';
import storeService, { Store } from '@/services/storeService';
import stockAuditService, {
  StockAuditListItem,
  StockAuditRow,
  StockAuditSession,
  StockAuditStatus,
} from '@/services/stockAuditService';

type Toast = { id: number; message: string; type: 'success' | 'error' | 'info' };

type LastProductSummary = {
  product_id: number;
  product_name: string;
  sku?: string | null;
  system_count: number;
  scanned_count: number;
  difference: number;
  status: string;
};

const statusLabel: Record<string, string> = {
  matched: 'Matched',
  short: 'Short',
  extra: 'Extra',
  unexpected: 'Unexpected',
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  unexpected_store: 'Wrong Store',
  unknown_barcode: 'Unknown',
  duplicate: 'Duplicate',
  non_sellable: 'Non-sellable',
};

const rowStatusClass: Record<string, string> = {
  matched: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  short: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  extra: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  unexpected: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};

const scanStatusClass: Record<string, string> = {
  matched: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  unexpected_store: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  unknown_barcode: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  duplicate: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  non_sellable: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

function normalizeStores(response: any): Store[] {
  if (Array.isArray(response?.data?.data)) return response.data.data;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response)) return response;
  return [];
}

function normalizeSessions(response: any): StockAuditListItem[] {
  if (Array.isArray(response?.data?.data)) return response.data.data;
  if (Array.isArray(response?.data)) return response.data;
  return [];
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value: unknown) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export default function StockAuditPage() {
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [notes, setNotes] = useState('');
  const [sessions, setSessions] = useState<StockAuditListItem[]>([]);
  const [activeSession, setActiveSession] = useState<StockAuditSession | null>(null);
  const [barcode, setBarcode] = useState('');
  const [loading, setLoading] = useState(true);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [lastProductSummary, setLastProductSummary] = useState<LastProductSummary | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);

  const selectedStore = useMemo(
    () => stores.find((store) => String(store.id) === selectedStoreId),
    [stores, selectedStoreId]
  );

  const showToast = (message: string, type: Toast['type'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), 4500);
  };

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [storesResponse, sessionsResponse] = await Promise.all([
        storeService.getStores({ is_active: true, per_page: 1000 }, { skipStoreScope: true }),
        stockAuditService.list({ per_page: 10 }),
      ]);
      const storeList = normalizeStores(storesResponse);
      setStores(storeList);
      setSessions(normalizeSessions(sessionsResponse));

      const localStoreId = typeof window !== 'undefined' ? localStorage.getItem('storeId') : '';
      if (localStoreId && storeList.some((store) => String(store.id) === String(localStoreId))) {
        setSelectedStoreId(String(localStoreId));
      }
    } catch (error: any) {
      console.error('Stock audit initial load failed:', error);
      showToast(error?.response?.data?.message || 'Failed to load stock audit panel.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (activeSession?.status === 'active') {
      setTimeout(() => barcodeInputRef.current?.focus(), 80);
    }
  }, [activeSession?.id, activeSession?.status]);

  const refreshSessions = async () => {
    const response = await stockAuditService.list({ per_page: 10 });
    setSessions(normalizeSessions(response));
  };

  const startSession = async () => {
    if (!selectedStoreId) {
      showToast('Select a store before starting stock audit.', 'error');
      return;
    }

    try {
      setSessionLoading(true);
      const response = await stockAuditService.create({ store_id: Number(selectedStoreId), notes });
      setActiveSession(response.data);
      setLastProductSummary(null);
      setNotes('');
      showToast('Stock audit session started. You can now scan products.', 'success');
      await refreshSessions();
    } catch (error: any) {
      console.error('Failed to start audit session:', error);
      showToast(error?.response?.data?.message || 'Failed to start stock audit session.', 'error');
    } finally {
      setSessionLoading(false);
    }
  };

  const openSession = async (sessionId: number, shouldResume = false) => {
    try {
      setSessionLoading(true);
      let response = await stockAuditService.get(sessionId);
      if (shouldResume && response.data.status === 'paused') {
        response = await stockAuditService.updateStatus(sessionId, 'active');
      }
      setActiveSession(response.data);
      setLastProductSummary(null);
      setSelectedStoreId(String(response.data.store_id));
      showToast(shouldResume ? 'Audit session resumed.' : 'Audit session opened.', 'success');
      await refreshSessions();
    } catch (error: any) {
      console.error('Failed to open session:', error);
      showToast(error?.response?.data?.message || 'Failed to open audit session.', 'error');
    } finally {
      setSessionLoading(false);
    }
  };

  const updateSessionStatus = async (status: StockAuditStatus) => {
    if (!activeSession) return;

    try {
      setSessionLoading(true);
      const response = await stockAuditService.updateStatus(activeSession.id, status);
      setActiveSession(response.data);
      showToast(`Audit session ${status}.`, 'success');
      await refreshSessions();
    } catch (error: any) {
      console.error('Failed to update audit status:', error);
      showToast(error?.response?.data?.message || 'Failed to update session status.', 'error');
    } finally {
      setSessionLoading(false);
    }
  };

  const scanBarcode = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeSession) {
      showToast('Start or open an audit session first.', 'error');
      return;
    }
    if (activeSession.status !== 'active') {
      showToast('Resume the audit session before scanning more products.', 'error');
      return;
    }
    const cleanBarcode = barcode.trim();
    if (!cleanBarcode) return;

    try {
      setScanLoading(true);
      const response = await stockAuditService.scan(activeSession.id, cleanBarcode);
      setActiveSession(response.data.session);
      setLastProductSummary(response.data.product_summary as LastProductSummary | null);
      setBarcode('');
      const scanStatus = response.data.scan.scan_status;
      showToast(response.message || statusLabel[scanStatus] || 'Barcode scanned.', scanStatus === 'matched' ? 'success' : 'info');
    } catch (error: any) {
      console.error('Failed to scan barcode:', error);
      showToast(error?.response?.data?.message || 'Failed to scan barcode.', 'error');
    } finally {
      setScanLoading(false);
      setTimeout(() => barcodeInputRef.current?.focus(), 50);
    }
  };

  const exportCsv = () => {
    if (!activeSession) return;
    const headers = [
      'Session Number',
      'Store',
      'Status',
      'Product ID',
      'Product Name',
      'SKU',
      'System Count',
      'Scanned Count',
      'Difference',
      'Result',
      'Wrong Store Scans',
      'Non Sellable Scans',
      'Sample Barcodes',
    ];

    const rows = activeSession.rows.map((row) => [
      activeSession.session_number,
      activeSession.store?.name || '',
      activeSession.status,
      row.product_id,
      row.product_name,
      row.sku || '',
      row.system_count,
      row.scanned_count,
      row.difference,
      statusLabel[row.status] || row.status,
      row.unexpected_store_scans,
      row.non_sellable_scans,
      (row.sample_barcodes || []).join(' | '),
    ]);

    const scanHeaders = ['Recent Scan Barcode', 'Product', 'SKU', 'Scan Status', 'System Store', 'System Status', 'Scanned At', 'Note'];
    const scanRows = activeSession.recent_scans.map((scan) => [
      scan.barcode_text,
      scan.product_name || '',
      scan.sku || '',
      statusLabel[scan.scan_status] || scan.scan_status,
      scan.system_store_name || '',
      scan.system_status || '',
      scan.scanned_at || '',
      scan.notes || '',
    ]);

    const csv = [
      headers.map(csvEscape).join(','),
      ...rows.map((row) => row.map(csvEscape).join(',')),
      '',
      scanHeaders.map(csvEscape).join(','),
      ...scanRows.map((row) => row.map(csvEscape).join(',')),
    ].join('\n');

    downloadBlob(csv, `${activeSession.session_number}_stock_audit.csv`, 'text/csv;charset=utf-8;');
  };

  const exportPdf = () => {
    if (!activeSession) return;
    const doc = new jsPDF({ orientation: 'landscape' });
    const margin = 12;
    let y = margin;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.setFontSize(16);
    doc.text('Store Stock Audit Report', margin, y);
    y += 8;
    doc.setFontSize(10);
    doc.text(`Session: ${activeSession.session_number}`, margin, y);
    doc.text(`Store: ${activeSession.store?.name || '-'}`, pageWidth / 2, y);
    y += 6;
    doc.text(`Status: ${statusLabel[activeSession.status] || activeSession.status}`, margin, y);
    doc.text(`Exported: ${new Date().toLocaleString()}`, pageWidth / 2, y);
    y += 8;

    const summary = activeSession.summary;
    const summaryText = [
      `System Units: ${summary.total_system_units}`,
      `Scanned Units: ${summary.total_scanned_units}`,
      `Difference: ${summary.total_difference}`,
      `Matched: ${summary.matched_products}`,
      `Short: ${summary.short_products}`,
      `Extra: ${summary.extra_products}`,
      `Unexpected: ${summary.unexpected_products}`,
      `Unknown: ${summary.unknown_barcodes}`,
      `Duplicate: ${summary.duplicate_scans}`,
    ];
    doc.text(summaryText.join('   |   '), margin, y);
    y += 8;

    const columns = [
      { label: 'Product', width: 84 },
      { label: 'SKU', width: 30 },
      { label: 'System', width: 18 },
      { label: 'Scanned', width: 20 },
      { label: 'Diff', width: 16 },
      { label: 'Result', width: 26 },
      { label: 'Wrong Store', width: 24 },
      { label: 'Non-sellable', width: 26 },
      { label: 'Sample Barcodes', width: 70 },
    ];

    const drawHeader = () => {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      let x = margin;
      columns.forEach((col) => {
        doc.text(col.label, x, y);
        x += col.width;
      });
      doc.setFont('helvetica', 'normal');
      y += 5;
      doc.line(margin, y - 3, pageWidth - margin, y - 3);
    };

    drawHeader();
    activeSession.rows.forEach((row) => {
      if (y > pageHeight - 14) {
        doc.addPage();
        y = margin;
        drawHeader();
      }

      const values = [
        row.product_name,
        row.sku || '',
        String(row.system_count),
        String(row.scanned_count),
        String(row.difference),
        statusLabel[row.status] || row.status,
        String(row.unexpected_store_scans || 0),
        String(row.non_sellable_scans || 0),
        (row.sample_barcodes || []).slice(0, 4).join(', '),
      ];

      let x = margin;
      values.forEach((value, index) => {
        const width = columns[index].width;
        const text = doc.splitTextToSize(String(value), width - 2)[0] || '';
        doc.text(text, x, y);
        x += width;
      });
      y += 5;
    });

    doc.save(`${activeSession.session_number}_stock_audit.pdf`);
  };

  const sortedRows = useMemo(() => {
    if (!activeSession) return [];
    const weight: Record<string, number> = { short: 0, extra: 1, unexpected: 2, matched: 3 };
    return [...activeSession.rows].sort((a, b) => (weight[a.status] ?? 9) - (weight[b.status] ?? 9));
  }, [activeSession]);

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
                  <ScanLine className="h-4 w-4" /> Inventory / Store Stock Audit
                </div>
                <h1 className="mt-1 text-2xl font-black text-gray-900 dark:text-white">Store Stock Verification Panel</h1>
                <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
                  Scan every physical barcode in a store, pause/resume the session, compare scanned quantity with system stock, then download PDF and CSV reports.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={loadInitialData}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
                </button>
                <button
                  onClick={exportCsv}
                  disabled={!activeSession}
                  className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-900"
                >
                  <FileSpreadsheet className="h-4 w-4" /> CSV
                </button>
                <button
                  onClick={exportPdf}
                  disabled={!activeSession}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FileText className="h-4 w-4" /> PDF
                </button>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-black text-gray-900 dark:text-white">Start / control session</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Choose the store once, then scan all items physically present there.</p>
                  </div>
                  {activeSession && (
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${activeSession.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : activeSession.status === 'paused' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'}`}>
                      {statusLabel[activeSession.status]}
                    </span>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <select
                    value={selectedStoreId}
                    onChange={(e) => setSelectedStoreId(e.target.value)}
                    disabled={!!activeSession && activeSession.status !== 'completed'}
                    className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 outline-none focus:border-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  >
                    <option value="">Select store</option>
                    {stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}{store.store_code ? ` (${store.store_code})` : ''}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={startSession}
                    disabled={sessionLoading || !selectedStoreId || (!!activeSession && activeSession.status !== 'completed')}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-900"
                  >
                    {sessionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    Start New Audit
                  </button>
                </div>

                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional note, e.g. Eid stock check / monthly stock audit"
                  className="mt-3 min-h-[76px] w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                />

                {activeSession && (
                  <div className="mt-4 rounded-2xl bg-gray-50 p-4 dark:bg-gray-900/60">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Current session</p>
                        <p className="text-base font-black text-gray-900 dark:text-white">{activeSession.session_number}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          <StoreIcon className="mr-1 inline h-4 w-4" /> {activeSession.store?.name || selectedStore?.name || '-'} · Started {formatDate(activeSession.started_at)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {activeSession.status === 'active' && (
                          <button
                            onClick={() => updateSessionStatus('paused')}
                            disabled={sessionLoading}
                            className="inline-flex items-center gap-2 rounded-xl bg-yellow-500 px-4 py-2 text-sm font-black text-white hover:bg-yellow-600 disabled:opacity-50"
                          >
                            <Pause className="h-4 w-4" /> Pause
                          </button>
                        )}
                        {activeSession.status === 'paused' && (
                          <button
                            onClick={() => updateSessionStatus('active')}
                            disabled={sessionLoading}
                            className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-black text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            <Play className="h-4 w-4" /> Resume
                          </button>
                        )}
                        {activeSession.status !== 'completed' && (
                          <button
                            onClick={() => updateSessionStatus('completed')}
                            disabled={sessionLoading}
                            className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-black text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-gray-900"
                          >
                            <CheckCircle2 className="h-4 w-4" /> Complete
                          </button>
                        )}
                      </div>
                    </div>

                    <form onSubmit={scanBarcode} className="mt-4 flex flex-col gap-2 md:flex-row">
                      <div className="relative flex-1">
                        <Barcode className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                        <input
                          ref={barcodeInputRef}
                          value={barcode}
                          onChange={(e) => setBarcode(e.target.value)}
                          disabled={activeSession.status !== 'active' || scanLoading}
                          placeholder={activeSession.status === 'paused' ? 'Session paused. Resume to scan more.' : 'Scan or type barcode, then press Enter'}
                          className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-4 text-sm font-bold text-gray-900 outline-none focus:border-gray-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={activeSession.status !== 'active' || scanLoading || !barcode.trim()}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-3 text-sm font-black text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {scanLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                        Scan
                      </button>
                    </form>

                    {lastProductSummary && (
                      <div className="mt-4 grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 md:grid-cols-[1fr_auto_auto_auto]">
                        <div>
                          <p className="text-xs font-black uppercase tracking-wide text-gray-500 dark:text-gray-400">Last scanned product</p>
                          <p className="font-black text-gray-900 dark:text-white">{lastProductSummary.product_name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">SKU: {lastProductSummary.sku || '-'}</p>
                        </div>
                        <InlineCount label="System stock" value={lastProductSummary.system_count} />
                        <InlineCount label="Scanned now" value={lastProductSummary.scanned_count} />
                        <InlineCount label="Difference" value={lastProductSummary.difference > 0 ? `+${lastProductSummary.difference}` : lastProductSummary.difference} warning={lastProductSummary.difference !== 0} />
                      </div>
                    )}
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-black text-gray-900 dark:text-white">Recent sessions</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Open old sessions or resume paused checking.</p>
                  </div>
                  <Clock className="h-5 w-5 text-gray-400" />
                </div>
                <div className="space-y-3">
                  {loading ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading sessions...</div>
                  ) : sessions.length === 0 ? (
                    <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500 dark:bg-gray-900/60 dark:text-gray-400">No stock audit sessions yet.</p>
                  ) : (
                    sessions.map((session) => (
                      <div key={session.id} className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-black text-gray-900 dark:text-white">{session.session_number}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{session.store?.name || `Store #${session.store_id}`} · {formatDate(session.started_at || session.created_at)}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Scanned units: {session.scanned_units_count ?? 0} · Attempts: {session.scan_attempts_count ?? 0}</p>
                          </div>
                          <span className={`rounded-full px-2 py-1 text-xs font-black ${session.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : session.status === 'paused' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'}`}>
                            {statusLabel[session.status]}
                          </span>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => openSession(session.id, false)}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-black text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
                          >
                            Open
                          </button>
                          {session.status === 'paused' && (
                            <button
                              onClick={() => openSession(session.id, true)}
                              className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-black text-white hover:bg-green-700"
                            >
                              Resume
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>

            {activeSession && (
              <>
                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard icon={<Package className="h-5 w-5" />} label="System units" value={activeSession.summary.total_system_units} />
                  <MetricCard icon={<ScanLine className="h-5 w-5" />} label="Scanned units" value={activeSession.summary.total_scanned_units} />
                  <MetricCard icon={<AlertTriangle className="h-5 w-5" />} label="Difference" value={activeSession.summary.total_difference} highlight={activeSession.summary.total_difference !== 0} />
                  <MetricCard icon={<Download className="h-5 w-5" />} label="Scan attempts" value={activeSession.summary.scan_attempts} />
                </section>

                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <SmallStat label="Matched products" value={activeSession.summary.matched_products} tone="green" />
                  <SmallStat label="Short products" value={activeSession.summary.short_products} tone="red" />
                  <SmallStat label="Extra products" value={activeSession.summary.extra_products} tone="yellow" />
                  <SmallStat label="Wrong-store scans" value={activeSession.summary.unexpected_store_scans} tone="purple" />
                  <SmallStat label="Unknown / duplicate" value={`${activeSession.summary.unknown_barcodes} / ${activeSession.summary.duplicate_scans}`} tone="gray" />
                </section>

                <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
                  <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                    <div className="border-b border-gray-200 p-5 dark:border-gray-700">
                      <h2 className="text-lg font-black text-gray-900 dark:text-white">Product-wise verification</h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400">System count vs scanned count for the selected store.</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-900/70">
                          <tr>
                            <Th>Product</Th>
                            <Th>SKU</Th>
                            <Th align="right">System</Th>
                            <Th align="right">Scanned</Th>
                            <Th align="right">Diff</Th>
                            <Th>Result</Th>
                            <Th>Flags</Th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                          {sortedRows.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No rows yet. Start scanning to build the audit sheet.</td>
                            </tr>
                          ) : (
                            sortedRows.map((row) => <AuditRow key={row.product_id} row={row} />)
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                    <div className="border-b border-gray-200 p-5 dark:border-gray-700">
                      <h2 className="text-lg font-black text-gray-900 dark:text-white">Recent scans</h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Last 30 scan attempts in this session.</p>
                    </div>
                    <div className="max-h-[620px] overflow-y-auto p-4">
                      {activeSession.recent_scans.length === 0 ? (
                        <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500 dark:bg-gray-900/60 dark:text-gray-400">No scan yet.</p>
                      ) : (
                        <div className="space-y-3">
                          {activeSession.recent_scans.map((scan) => (
                            <div key={scan.id} className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="font-black text-gray-900 dark:text-white">{scan.barcode_text}</p>
                                  <p className="text-sm text-gray-600 dark:text-gray-300">{scan.product_name || 'Unknown product'}</p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">{scan.sku || '-'} · {formatDate(scan.scanned_at)}</p>
                                </div>
                                <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-black ${scanStatusClass[scan.scan_status] || scanStatusClass.unknown_barcode}`}>
                                  {statusLabel[scan.scan_status] || scan.scan_status}
                                </span>
                              </div>
                              {scan.notes && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{scan.notes}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              </>
            )}
          </div>
        </main>
      </div>

      <div className="fixed right-4 top-20 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex min-w-[280px] items-start gap-3 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ${toast.type === 'success' ? 'bg-green-600 text-white' : toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'}`}
          >
            {toast.type === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4" /> : toast.type === 'error' ? <XCircle className="mt-0.5 h-4 w-4" /> : <AlertTriangle className="mt-0.5 h-4 w-4" />}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InlineCount({ label, value, warning = false }: { label: string; value: number | string; warning?: boolean }) {
  return (
    <div className="rounded-xl bg-gray-50 px-4 py-3 text-right dark:bg-gray-900/70">
      <p className="text-xs font-bold text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-xl font-black ${warning ? 'text-yellow-700 dark:text-yellow-300' : 'text-gray-900 dark:text-white'}`}>{value}</p>
    </div>
  );
}

function MetricCard({ icon, label, value, highlight = false }: { icon: React.ReactNode; label: string; value: number; highlight?: boolean }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <div className="rounded-xl bg-gray-100 p-2 text-gray-700 dark:bg-gray-900 dark:text-gray-200">{icon}</div>
        {highlight && <AlertTriangle className="h-5 w-5 text-yellow-500" />}
      </div>
      <p className="mt-4 text-sm font-semibold text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-3xl font-black text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function SmallStat({ label, value, tone }: { label: string; value: number | string; tone: 'green' | 'red' | 'yellow' | 'purple' | 'gray' }) {
  const classes = {
    green: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300',
    red: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300',
    yellow: 'bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
    purple: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300',
    gray: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200',
  }[tone];

  return (
    <div className={`rounded-2xl p-4 ${classes}`}>
      <p className="text-xs font-black uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  const alignClass = align === 'right' ? 'text-right' : 'text-left';
  return <th className={`px-4 py-3 ${alignClass} text-xs font-black uppercase tracking-wide text-gray-500 dark:text-gray-400`}>{children}</th>;
}

function AuditRow({ row }: { row: StockAuditRow }) {
  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-900/40">
      <td className="px-4 py-3">
        <p className="font-black text-gray-900 dark:text-white">{row.product_name}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">ID: {row.product_id}{row.system_source ? ` · source: ${row.system_source}` : ''}</p>
      </td>
      <td className="px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-300">{row.sku || '-'}</td>
      <td className="px-4 py-3 text-right text-sm font-black text-gray-900 dark:text-white">{row.system_count}</td>
      <td className="px-4 py-3 text-right text-sm font-black text-gray-900 dark:text-white">{row.scanned_count}</td>
      <td className={`px-4 py-3 text-right text-sm font-black ${row.difference === 0 ? 'text-green-600 dark:text-green-300' : row.difference < 0 ? 'text-red-600 dark:text-red-300' : 'text-yellow-700 dark:text-yellow-300'}`}>
        {row.difference > 0 ? `+${row.difference}` : row.difference}
      </td>
      <td className="px-4 py-3">
        <span className={`rounded-full px-2.5 py-1 text-xs font-black ${rowStatusClass[row.status] || rowStatusClass.matched}`}>
          {statusLabel[row.status] || row.status}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
        {row.unexpected_store_scans > 0 && <span className="mr-2 rounded-full bg-yellow-100 px-2 py-1 font-bold text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">Wrong store: {row.unexpected_store_scans}</span>}
        {row.non_sellable_scans > 0 && <span className="mr-2 rounded-full bg-red-100 px-2 py-1 font-bold text-red-700 dark:bg-red-900/30 dark:text-red-300">Non-sellable: {row.non_sellable_scans}</span>}
        {row.unexpected_store_scans === 0 && row.non_sellable_scans === 0 && <span className="text-gray-400">-</span>}
      </td>
    </tr>
  );
}
