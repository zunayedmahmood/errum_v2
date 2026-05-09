'use client';

import { useState, useEffect, useRef } from 'react';
import { Scan, Keyboard, Loader2 } from 'lucide-react';
import barcodeService from '@/services/barcodeService';

interface BarcodeScannerProps {
  isEnabled: boolean;
  selectedOutlet: string;
  onProductScanned: (product: ScannedProduct) => void;
  onError: (message: string) => void;
}

export interface ScannedProduct {
  productId: number;
  productName: string;
  batchId: number;
  batchNumber: string;
  price: number;
  availableQty: number;
  barcode: string;
  barcodeId?: number;
}

export default function BarcodeScanner({ 
  isEnabled, 
  selectedOutlet, 
  onProductScanned, 
  onError 
}: BarcodeScannerProps) {
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const scannerBufferRef = useRef<string>('');
  const scannerTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Physical barcode scanner detection
   * Listens for rapid keypresses followed by Enter
   */
  useEffect(() => {
    if (!isEnabled) return;

    const handleKeyPress = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      
      // Ignore keypresses in other input fields
      if (target.tagName === 'INPUT' && target !== barcodeInputRef.current) return;
      if (target.tagName === 'TEXTAREA') return;
      if (target.tagName === 'SELECT') return;

      // Clear existing timeout
      if (scannerTimeoutRef.current) {
        clearTimeout(scannerTimeoutRef.current);
      }

      // Enter key = end of scan
      if (e.key === 'Enter' && scannerBufferRef.current.length > 0) {
        e.preventDefault();
        const scannedBarcode = scannerBufferRef.current.trim();
        scannerBufferRef.current = '';
        
        if (scannedBarcode) {
          processBarcode(scannedBarcode);
        }
        return;
      }

      // Accumulate characters
      if (e.key.length === 1) {
        scannerBufferRef.current += e.key;
        
        // Auto-submit after 100ms of no input (scanner sends data in burst)
        scannerTimeoutRef.current = setTimeout(() => {
          if (scannerBufferRef.current.length > 3) {
            const scannedBarcode = scannerBufferRef.current.trim();
            scannerBufferRef.current = '';
            
            if (scannedBarcode) {
              processBarcode(scannedBarcode);
            }
          } else {
            scannerBufferRef.current = '';
          }
        }, 100);
      }
    };

    window.addEventListener('keypress', handleKeyPress);
    
    return () => {
      window.removeEventListener('keypress', handleKeyPress);
      if (scannerTimeoutRef.current) {
        clearTimeout(scannerTimeoutRef.current);
      }
    };
  }, [isEnabled, selectedOutlet]);

  /**
   * Manual barcode submission
   */
  const handleManualSubmit = () => {
    if (!barcodeInput.trim()) {
      onError('Please enter a barcode');
      return;
    }
    processBarcode(barcodeInput.trim());
    setBarcodeInput('');
  };

  /**
   * Process scanned/entered barcode
   */
  const processBarcode = async (barcode: string) => {
    if (!selectedOutlet) {
      onError('Please select an outlet first');
      return;
    }

    if (isScanning) return; // Prevent duplicate scans
    
    setIsScanning(true);
    
    try {
      console.log('🔍 Scanning barcode:', barcode);
      
      // Call barcode API
      const response = await barcodeService.scanBarcode(barcode);
      
      if (!response.success || !response.data) {
        onError(`Barcode not found: ${barcode}`);
        setIsScanning(false);
        return;
      }

      const scanResult = response.data;
      
      console.log('✅ Scan result:', scanResult);

      // Validate product availability
      if (!scanResult.is_available || scanResult.quantity_available <= 0) {
        onError(`Product "${scanResult.product.name}" is not available in stock`);
        setIsScanning(false);
        return;
      }

      // Validate location
      if (scanResult.current_location && scanResult.current_location.id !== parseInt(selectedOutlet)) {
        onError(`Product is at ${scanResult.current_location.name}, not at selected outlet`);
        setIsScanning(false);
        return;
      }

      // Validate batch
      if (!scanResult.current_batch) {
        onError('No batch information found for this barcode');
        setIsScanning(false);
        return;
      }

      // Extract price
      const price = parseFloat(
        String(scanResult.current_batch.sell_price || scanResult.product.selling_price || 0)
          .replace(/,/g, '')
      );

      // Create scanned product data
      const scannedProduct: ScannedProduct = {
        productId: scanResult.product.id,
        productName: scanResult.product.name,
        batchId: scanResult.current_batch.id,
        batchNumber: scanResult.current_batch.batch_number,
        price: price,
        availableQty: scanResult.quantity_available,
        barcode: barcode,
        barcodeId: scanResult.barcode_id,
      };

      // Play success beep
      playBeep();
      
      // Notify parent component
      onProductScanned(scannedProduct);
      
    } catch (error: any) {
      console.error('❌ Barcode scan error:', error);
      onError(error.message || 'Failed to scan barcode');
    } finally {
      setIsScanning(false);
    }
  };

  /**
   * Play audio feedback on successful scan
   */
  const playBeep = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800; // Hz
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (e) {
      // Silent fail if audio not supported
    }
  };

  if (!isEnabled) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center gap-4">
        {/* Input Field */}
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {isScanning ? (
              <span className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Scanning...
              </span>
            ) : (
              'Scan or Enter Barcode'
            )}
          </label>
          <div className="flex gap-2">
            <input
              ref={barcodeInputRef}
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleManualSubmit();
                }
              }}
              placeholder="Scan barcode or type manually..."
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-lg font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={!selectedOutlet || isScanning}
              autoFocus
            />
            <button
              onClick={handleManualSubmit}
              disabled={!barcodeInput.trim() || !selectedOutlet || isScanning}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
            >
              Add
            </button>
          </div>
        </div>

        {/* Scanner Icon */}
        <div className="text-center">
          <div className="w-24 h-24 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center border-2 border-dashed border-blue-300 dark:border-blue-700">
            {isScanning ? (
              <Loader2 className="w-12 h-12 text-blue-600 dark:text-blue-400 animate-spin" />
            ) : (
              <Scan className="w-12 h-12 text-blue-600 dark:text-blue-400" />
            )}
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
            {isScanning ? 'Processing...' : 'Ready to scan'}
          </p>
        </div>
      </div>

      {/* Warning if outlet not selected */}
      {!selectedOutlet && (
        <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-md">
          <p className="text-sm text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
            ⚠️ Please select an outlet before scanning barcodes
          </p>
        </div>
      )}
    </div>
  );
}