'use client';

import { useMemo, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import axios from '@/lib/axios';
import { fireToast } from '@/lib/globalToast';
import productService from '@/services/productService';
import {
  FileText,
  ScanText,
  ShoppingCart,
  Percent,
  Package,
  UserRound,
  Phone,
  MapPin,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

type ResolvedItem = {
  sku: string;
  quantity: number;
  productId: number;
  name: string;
  unitPrice: number;
  matchedSku: string;
};

type ParseResult = {
  name: string;
  phone: string;
  address: string;
  warning?: string;
};

type LineScores = {
  nameScore: number;
  addressScore: number;
};

const ADDRESS_KEYWORDS = [
  'road', 'rd', 'street', 'st', 'sector', 'sec', 'house', 'holding', 'flat', 'building', 'block',
  'lane', 'para', 'bari', 'gram', 'village', 'thana', 'upazila', 'district', 'city', 'house no',
  'uttara', 'uttora', 'dhaka', 'dhanmondi', 'mirpur', 'mohammadpur', 'gazipur', 'boardbazar',
  'chittagong', 'ctg', 'sylhet', 'rajshahi', 'raozan', 'raojan', 'barisal', 'khulna', 'narayanganj',
  'narsingdi', 'brahmanbaria', 'malibag', 'mouchak', 'shantinogor', 'raynogor', 'mitali', 'mitaly',
  'botgach', 'sisimpur', 'bangladesh', 'outer circular road', 'akhali', 'boshundhora', 'bashundhara'
];

function cleanLine(value: string) {
  return value.replace(/\s+/g, ' ').replace(/^[-,\s]+|[-,\s]+$/g, '').trim();
}

function stripWhatsappNoise(input: string) {
  return input
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line
      .replace(/^\[[^\]]+\]\s*[^:]+:\s*/i, '')
      .replace(/^[^:\n]{1,40}:\s*/i, (match) => {
        return /the positive one/i.test(match) ? '' : match;
      }))
    .join('\n')
    .trim();
}

function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('880') && digits.length >= 13) {
    return `0${digits.slice(3, 13)}`;
  }
  if (digits.length === 10 && digits.startsWith('1')) {
    return `0${digits}`;
  }
  if (digits.length >= 11 && digits.startsWith('0')) {
    return digits.slice(0, 11);
  }
  return digits;
}

function findBestPhone(input: string) {
  const matches = Array.from(input.matchAll(/\+?\d[\d\s-]{8,18}\d/g));
  if (!matches.length) return null;

  let best: { raw: string; index: number; score: number } | null = null;

  for (const match of matches) {
    const raw = match[0];
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 14) continue;

    let score = 0;
    if (/^(?:8801|01)/.test(digits)) score += 5;
    if (digits.length === 11 || digits.length === 13) score += 3;
    if (/1[3-9]/.test(digits.replace(/^880/, '').replace(/^0/, ''))) score += 2;
    if (!best || score > best.score) {
      best = { raw, index: match.index ?? 0, score };
    }
  }

  return best;
}

function tokenLooksAddressy(token: string) {
  const t = token.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!t) return false;
  if (/\d/.test(token)) return true;
  if (/[,/\-]/.test(token)) return true;
  return ADDRESS_KEYWORDS.some((keyword) => t.includes(keyword));
}

function scoreLine(line: string): LineScores {
  const normalized = cleanLine(line);
  const words = normalized.split(/\s+/).filter(Boolean);
  const lower = normalized.toLowerCase();

  let addressScore = 0;
  let nameScore = 0;

  if (/\d/.test(normalized)) addressScore += 3;
  if (/[,/\-]/.test(normalized)) addressScore += 2;
  if (ADDRESS_KEYWORDS.some((keyword) => lower.includes(keyword))) addressScore += 4;
  if (words.length >= 3) addressScore += 1;
  if (normalized.length > 20) addressScore += 1;

  if (!/\d/.test(normalized)) nameScore += 2;
  if (!/[,/]/.test(normalized)) nameScore += 1;
  if (words.length >= 1 && words.length <= 4) nameScore += 3;
  if (words.every((word) => /^[A-Za-z.']+$/.test(word))) nameScore += 2;
  if (!ADDRESS_KEYWORDS.some((keyword) => lower.includes(keyword))) nameScore += 1;

  return { nameScore, addressScore };
}

function splitMixedLine(line: string) {
  const cleaned = cleanLine(line);
  if (!cleaned) return null;

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return null;

  const forwardCueIndex = tokens.findIndex((token) => tokenLooksAddressy(token));
  if (forwardCueIndex > 0 && forwardCueIndex <= 4) {
    return {
      name: cleanLine(tokens.slice(0, forwardCueIndex).join(' ')),
      address: cleanLine(tokens.slice(forwardCueIndex).join(' ')),
    };
  }

  for (let tailCount = 1; tailCount <= Math.min(4, tokens.length - 1); tailCount += 1) {
    const tail = tokens.slice(-tailCount).join(' ');
    const head = tokens.slice(0, -tailCount).join(' ');
    if (!head || !tail) continue;

    const tailScores = scoreLine(tail);
    const headScores = scoreLine(head);

    if (tailScores.nameScore > tailScores.addressScore && headScores.addressScore >= headScores.nameScore) {
      return {
        name: cleanLine(tail),
        address: cleanLine(head),
      };
    }
  }

  return null;
}

function parseCustomerMessage(rawInput: string): ParseResult {
  const stripped = stripWhatsappNoise(rawInput);
  if (!stripped) {
    return { name: '', phone: '', address: '', warning: 'No message text found.' };
  }

  const bestPhone = findBestPhone(stripped);
  const phone = bestPhone ? normalizePhone(bestPhone.raw) : '';

  let withoutPhone = stripped;
  if (bestPhone) {
    withoutPhone = `${stripped.slice(0, bestPhone.index)} ${stripped.slice(bestPhone.index + bestPhone.raw.length)}`;
  }

  const rawLines = withoutPhone
    .split('\n')
    .map(cleanLine)
    .filter(Boolean);

  if (rawLines.length === 1) {
    const split = splitMixedLine(rawLines[0]);
    if (split) {
      return {
        name: split.name,
        phone,
        address: split.address,
        warning: phone ? undefined : 'Phone not detected automatically. Please fill it manually.',
      };
    }
  }

  let name = '';
  let address = '';

  if (rawLines.length) {
    const scored = rawLines.map((line) => ({ line, ...scoreLine(line) }));
    const rankedForName = [...scored].sort((a, b) => (b.nameScore - b.addressScore) - (a.nameScore - a.addressScore));
    const bestNameLine = rankedForName[0];

    if (bestNameLine && bestNameLine.nameScore >= bestNameLine.addressScore) {
      name = bestNameLine.line;
      address = rawLines.filter((line) => line !== bestNameLine.line).join(', ');
    } else {
      name = rawLines[0] || '';
      address = rawLines.slice(1).join(', ');
    }
  }

  if (!address && rawLines.length === 1) {
    const split = splitMixedLine(rawLines[0]);
    if (split) {
      name = split.name || name;
      address = split.address || address;
    }
  }

  if (!address && rawLines.length > 1) {
    address = rawLines.slice(1).join(', ');
  }

  return {
    name: cleanLine(name),
    phone,
    address: cleanLine(address),
    warning: phone ? undefined : 'Phone not detected automatically. Please fill it manually.',
  };
}

function parseSkuInput(input: string) {
  const tokens = (input.match(/\d+/g) || []).map((token) => token.trim()).filter(Boolean);
  const counts = new Map<string, number>();
  tokens.forEach((token) => counts.set(token, (counts.get(token) || 0) + 1));
  return Array.from(counts.entries()).map(([sku, quantity]) => ({ sku, quantity }));
}

function allocateDiscounts(items: ResolvedItem[], totalDiscount: number) {
  const safeDiscount = Math.max(0, Number(totalDiscount) || 0);
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  if (!safeDiscount || !subtotal) {
    return items.map(() => 0);
  }

  let remaining = Number(safeDiscount.toFixed(2));

  return items.map((item, index) => {
    if (index === items.length - 1) {
      return Number(Math.max(0, remaining).toFixed(2));
    }

    const lineTotal = item.unitPrice * item.quantity;
    const share = (lineTotal / subtotal) * safeDiscount;
    const rounded = Number(Math.min(lineTotal, share).toFixed(2));
    remaining = Number((remaining - rounded).toFixed(2));
    return rounded;
  });
}

export default function SocialTextImportPage() {
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [messageText, setMessageText] = useState('');
  const [parsedName, setParsedName] = useState('');
  const [parsedPhone, setParsedPhone] = useState('');
  const [parsedAddress, setParsedAddress] = useState('');
  const [parseWarning, setParseWarning] = useState('');

  const [skuText, setSkuText] = useState('');
  const [resolvedItems, setResolvedItems] = useState<ResolvedItem[]>([]);
  const [missingSkus, setMissingSkus] = useState<string[]>([]);

  const [deliveryCharge, setDeliveryCharge] = useState('0');
  const [manualDiscount, setManualDiscount] = useState('0');
  const [targetTotal, setTargetTotal] = useState('');
  const [socialId, setSocialId] = useState('');

  const [isResolvingSkus, setIsResolvingSkus] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);

  const skuCounts = useMemo(() => parseSkuInput(skuText), [skuText]);
  const deliveryChargeValue = Math.max(0, parseFloat(deliveryCharge) || 0);
  const manualDiscountValue = Math.max(0, parseFloat(manualDiscount) || 0);
  const targetTotalValue = Math.max(0, parseFloat(targetTotal) || 0);

  const subtotal = useMemo(
    () => resolvedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [resolvedItems]
  );

  const extraDiscount = useMemo(() => {
    if (!targetTotalValue) return 0;
    return Math.max(0, Number((subtotal + deliveryChargeValue - manualDiscountValue - targetTotalValue).toFixed(2)));
  }, [subtotal, deliveryChargeValue, manualDiscountValue, targetTotalValue]);

  const grandTotal = useMemo(() => {
    return Number(Math.max(0, subtotal + deliveryChargeValue - manualDiscountValue - extraDiscount).toFixed(2));
  }, [subtotal, deliveryChargeValue, manualDiscountValue, extraDiscount]);

  const targetGap = useMemo(() => {
    if (!targetTotalValue) return 0;
    return Number((targetTotalValue - grandTotal).toFixed(2));
  }, [targetTotalValue, grandTotal]);

  const handleParse = () => {
    const parsed = parseCustomerMessage(messageText);
    setParsedName(parsed.name);
    setParsedPhone(parsed.phone);
    setParsedAddress(parsed.address);
    setParseWarning(parsed.warning || '');

    if (!parsed.name && !parsed.address && !parsed.phone) {
      fireToast(parsed.warning || 'Could not understand the message.', 'error');
      return;
    }

    fireToast('Customer message parsed.', 'success');
  };

  const handleResolveSkus = async () => {
    const parsedSkus = parseSkuInput(skuText);
    if (!parsedSkus.length) {
      fireToast('Please enter at least one SKU.', 'error');
      return;
    }

    setIsResolvingSkus(true);
    try {
      const found: ResolvedItem[] = [];
      const missing: string[] = [];

      for (const entry of parsedSkus) {
        const response = await productService.getAll({ search: entry.sku, per_page: 50 });
        const products = Array.isArray(response?.data) ? response.data : [];
        const match = products.find((product) => String(product.sku || '').trim() === entry.sku)
          || products.find((product) => String(product.sku || '').trim().toLowerCase() === entry.sku.toLowerCase())
          || products[0];

        if (!match) {
          missing.push(entry.sku);
          continue;
        }

        found.push({
          sku: entry.sku,
          quantity: entry.quantity,
          productId: Number(match.id),
          name: String(match.name || 'Unknown product'),
          unitPrice: Number(match.selling_price || match.base_price || 0),
          matchedSku: String(match.sku || entry.sku),
        });
      }

      setResolvedItems(found);
      setMissingSkus(missing);

      if (missing.length) {
        fireToast(`Resolved ${found.length} SKU(s). Missing: ${missing.join(', ')}`, 'error');
        return;
      }

      fireToast(`Resolved ${found.length} SKU(s).`, 'success');
    } catch (error) {
      console.error('SKU resolve error:', error);
      fireToast('Failed to resolve SKUs.', 'error');
    } finally {
      setIsResolvingSkus(false);
    }
  };

  const handleCreateOrder = async () => {
    if (!parsedName.trim()) {
      fireToast('Please enter customer name.', 'error');
      return;
    }
    if (!parsedPhone.trim()) {
      fireToast('Please enter customer phone.', 'error');
      return;
    }
    if (!parsedAddress.trim()) {
      fireToast('Please enter customer address.', 'error');
      return;
    }
    if (!resolvedItems.length) {
      fireToast('Please resolve SKUs first.', 'error');
      return;
    }

    if (targetTotalValue && targetGap > 0) {
      fireToast('Target total is higher than the current order total. Increase delivery or reduce discount manually.', 'error');
      return;
    }

    const lineDiscounts = allocateDiscounts(resolvedItems, manualDiscountValue + extraDiscount);

    const orderData = {
      order_type: 'social_commerce',
      customer: {
        name: parsedName.trim(),
        phone: normalizePhone(parsedPhone),
      },
      shipping_address: {
        name: parsedName.trim(),
        phone: normalizePhone(parsedPhone),
        street: parsedAddress.trim(),
      },
      items: resolvedItems.map((item, index) => ({
        product_id: item.productId,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        discount_amount: lineDiscounts[index] || 0,
      })),
      shipping_amount: deliveryChargeValue,
      notes: [
        'Created from Social Text Import.',
        socialId.trim() ? `Social ID: ${socialId.trim()}.` : '',
        targetTotalValue ? `Target total: ${targetTotalValue}.` : '',
        manualDiscountValue ? `Manual discount: ${manualDiscountValue}.` : '',
        extraDiscount ? `Extra auto discount: ${extraDiscount}.` : '',
      ].filter(Boolean).join(' '),
    };

    setIsCreatingOrder(true);
    try {
      const response = await axios.post('/orders', orderData);
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Failed to create order');
      }

      const createdOrder = response.data?.data;
      fireToast(`Order ${createdOrder?.order_number || ''} created successfully.`, 'success');

      setMessageText('');
      setParsedName('');
      setParsedPhone('');
      setParsedAddress('');
      setParseWarning('');
      setSkuText('');
      setResolvedItems([]);
      setMissingSkus([]);
      setDeliveryCharge('0');
      setManualDiscount('0');
      setTargetTotal('');
      setSocialId('');
    } catch (error: any) {
      console.error('Create order error:', error);
      fireToast(error?.response?.data?.message || error?.message || 'Failed to create order.', 'error');
    } finally {
      setIsCreatingOrder(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white overflow-hidden">
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />

      <div className="flex-1 flex flex-col min-h-0 lg:ml-0">
        <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Social Text Import</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 max-w-3xl">
              Paste the customer message only in the first box. Then add SKUs separately, set delivery and discounts,
              and create the social commerce order after reviewing the parsed fields.
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <section className="xl:col-span-2 space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <FileText className="w-4 h-4 text-teal-500" />
                  Customer message
                </div>
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder={`Examples:\nTasfia 01711111111\nMitaly-1, Sylhet\n\nor\nMurgibari, Rajshahi\nNafis 01344444444\n\nor\nHalima Mim\nKedarapur, Barisal\n+8801712121212`}
                  className="w-full min-h-[220px] rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-3 outline-none focus:ring-2 focus:ring-teal-500"
                />
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleParse}
                    className="inline-flex items-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 text-sm font-medium"
                  >
                    <ScanText className="w-4 h-4" />
                    Parse message
                  </button>
                  <button
                    onClick={() => {
                      setMessageText('');
                      setParsedName('');
                      setParsedPhone('');
                      setParsedAddress('');
                      setParseWarning('');
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm font-medium"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Reset message
                  </button>
                </div>

                {parseWarning ? (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                    <AlertCircle className="w-4 h-4 mt-0.5" />
                    <span>{parseWarning}</span>
                  </div>
                ) : null}
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <UserRound className="w-4 h-4 text-blue-500" />
                  Parsed customer fields
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="space-y-2 text-sm">
                    <span className="text-gray-600 dark:text-gray-400 flex items-center gap-2"><UserRound className="w-4 h-4" /> Name</span>
                    <input value={parsedName} onChange={(e) => setParsedName(e.target.value)} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-3 outline-none focus:ring-2 focus:ring-teal-500" />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="text-gray-600 dark:text-gray-400 flex items-center gap-2"><Phone className="w-4 h-4" /> Phone</span>
                    <input value={parsedPhone} onChange={(e) => setParsedPhone(e.target.value)} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-3 outline-none focus:ring-2 focus:ring-teal-500" />
                  </label>
                </div>
                <label className="space-y-2 text-sm block">
                  <span className="text-gray-600 dark:text-gray-400 flex items-center gap-2"><MapPin className="w-4 h-4" /> Address</span>
                  <textarea value={parsedAddress} onChange={(e) => setParsedAddress(e.target.value)} className="w-full min-h-[110px] rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-3 outline-none focus:ring-2 focus:ring-teal-500" />
                </label>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Package className="w-4 h-4 text-violet-500" />
                  SKU input
                </div>
                <textarea
                  value={skuText}
                  onChange={(e) => setSkuText(e.target.value)}
                  placeholder={`Put only SKUs here. Example:\n754 901 303\n\nor\n754\n901\n303\n303`}
                  className="w-full min-h-[140px] rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-3 outline-none focus:ring-2 focus:ring-teal-500"
                />
                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                  <span>Detected SKU entries: <strong className="text-gray-900 dark:text-white">{skuCounts.length}</strong></span>
                  <span>Total quantity: <strong className="text-gray-900 dark:text-white">{skuCounts.reduce((sum, item) => sum + item.quantity, 0)}</strong></span>
                </div>
                <button
                  onClick={handleResolveSkus}
                  disabled={isResolvingSkus}
                  className="inline-flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white px-4 py-2.5 text-sm font-medium"
                >
                  {isResolvingSkus ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                  Resolve SKUs
                </button>

                {missingSkus.length ? (
                  <div className="rounded-xl border border-red-300/60 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                    Missing SKUs: {missingSkus.join(', ')}
                  </div>
                ) : null}
              </div>
            </section>

            <aside className="space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Percent className="w-4 h-4 text-emerald-500" />
                  Pricing controls
                </div>
                <label className="space-y-2 text-sm block">
                  <span className="text-gray-600 dark:text-gray-400">Social media ID / note</span>
                  <input value={socialId} onChange={(e) => setSocialId(e.target.value)} placeholder="Optional" className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-3 outline-none focus:ring-2 focus:ring-teal-500" />
                </label>
                <label className="space-y-2 text-sm block">
                  <span className="text-gray-600 dark:text-gray-400">Delivery charge</span>
                  <input type="number" value={deliveryCharge} onChange={(e) => setDeliveryCharge(e.target.value)} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-3 outline-none focus:ring-2 focus:ring-teal-500" />
                </label>
                <label className="space-y-2 text-sm block">
                  <span className="text-gray-600 dark:text-gray-400">Manual discount</span>
                  <input type="number" value={manualDiscount} onChange={(e) => setManualDiscount(e.target.value)} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-3 outline-none focus:ring-2 focus:ring-teal-500" />
                </label>
                <label className="space-y-2 text-sm block">
                  <span className="text-gray-600 dark:text-gray-400">Target total</span>
                  <input type="number" value={targetTotal} onChange={(e) => setTargetTotal(e.target.value)} placeholder="Optional" className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-3 outline-none focus:ring-2 focus:ring-teal-500" />
                </label>

                <div className="rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between"><span className="text-gray-600 dark:text-gray-400">Subtotal</span><span>{subtotal.toFixed(2)} ৳</span></div>
                  <div className="flex items-center justify-between"><span className="text-gray-600 dark:text-gray-400">Delivery</span><span>{deliveryChargeValue.toFixed(2)} ৳</span></div>
                  <div className="flex items-center justify-between"><span className="text-gray-600 dark:text-gray-400">Manual discount</span><span>- {manualDiscountValue.toFixed(2)} ৳</span></div>
                  <div className="flex items-center justify-between"><span className="text-gray-600 dark:text-gray-400">Extra auto discount</span><span>- {extraDiscount.toFixed(2)} ৳</span></div>
                  <div className="border-t border-dashed border-gray-300 dark:border-gray-700 pt-2 flex items-center justify-between font-semibold text-base"><span>Grand total</span><span>{grandTotal.toFixed(2)} ৳</span></div>
                </div>

                {targetTotalValue ? (
                  <div className={`rounded-xl px-3 py-2 text-sm ${targetGap > 0 ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'}`}>
                    {targetGap > 0
                      ? `Target is higher by ${targetGap.toFixed(2)} ৳. The system only auto-deducts downward, so adjust manually if needed.`
                      : 'Target matched through discount adjustment.'}
                  </div>
                ) : null}

                <button
                  onClick={handleCreateOrder}
                  disabled={isCreatingOrder}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-3 text-sm font-semibold"
                >
                  {isCreatingOrder ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
                  Create order
                </button>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Order preview
                </div>
                {!resolvedItems.length ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400">Resolve SKUs to see item preview.</p>
                ) : (
                  <div className="space-y-3">
                    {resolvedItems.map((item) => (
                      <div key={item.sku} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-900">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium text-sm">{item.name}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Requested SKU: {item.sku} · Matched SKU: {item.matchedSku}</div>
                          </div>
                          <div className="text-right text-sm">
                            <div>Qty: {item.quantity}</div>
                            <div>{item.unitPrice.toFixed(2)} ৳</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}
