'use client';

import React, { useState } from 'react';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import inventoryService from '@/services/inventoryService';

interface ExportInventoryButtonProps {
  categories: any[];
  allStores: { id: number; name: string }[];
  selectedCategoryId?: number | null;
}

export default function ExportInventoryButton({ categories, allStores, selectedCategoryId }: ExportInventoryButtonProps) {
  const [exporting, setExporting] = useState(false);

  const getCategoryPaths = (categoryId: any, cats: any[]) => {
    if (!categoryId) return { category: 'Uncategorized', subcategory: '-' };
    
    // Find category with loose equality to handle string/number mismatches
    const cat = cats.find(c => String(c.id) === String(categoryId));
    if (!cat) return { category: 'Uncategorized', subcategory: '-' };

    if (cat.parent_id) {
      const parent = cats.find(c => String(c.id) === String(cat.parent_id));
      return {
        category: parent ? parent.title : cat.title,
        subcategory: parent ? cat.title : '-',
      };
    }
    return { category: cat.title, subcategory: '-' };
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      
      // Fetch ALL data
      const response = await inventoryService.getGlobalInventory({ 
        skipStoreScope: true,
        category_id: selectedCategoryId || undefined
      });
      const items = response.data || [];

      // Group by SKU
      const skuMap = new Map<string, {
        sku: string;
        productName: string;
        variations: any[];
        totalStock: number;
      }>();

      items.forEach(item => {
        const sku = item.sku || `NO-SKU-${item.product_id}`;
        if (!skuMap.has(sku)) {
          skuMap.set(sku, {
            sku: item.sku || 'NO-SKU',
            productName: item.base_name || item.product_name,
            variations: [],
            totalStock: 0
          });
        }
        const group = skuMap.get(sku)!;
        group.variations.push(item);
        group.totalStock += item.total_quantity;
      });

      const groups = Array.from(skuMap.values());

      // Prepare data for XLSX
      // We'll build a flat representation but since it's Excel, 
      // the user wants merged cells. xlsx supports cell merging.
      
      const headerRow = [
        'SKU', 'Product Name', 'Category', 'Subcategory', 'Variation',
        ...allStores.map(s => s.name),
        'Available', 'Physical', 'Reserved', 'SKU Total'
      ];

      const dataRows: any[][] = [];
      const merges: { s: { r: number, c: number }, e: { r: number, c: number } }[] = [];

      let currentRow = 1; // 1-based for header

      groups.forEach(group => {
        const variationsCount = group.variations.length;
        
        group.variations.forEach((v, vIdx) => {
          const paths = getCategoryPaths(v.category_id, categories);
          const category = v.category_name || paths.category;
          const subcategory = v.subcategory_name || paths.subcategory;
          
          // Enhanced Variation Suffix Logic (Fallback to name diff)
          const suffix = v.variation_suffix || 
                        (v.product_name && v.base_name ? v.product_name.replace(v.base_name, '').trim() : '') || 
                        'Default';

          const rowData = [
            vIdx === 0 ? group.sku : '',
            vIdx === 0 ? group.productName : '',
            vIdx === 0 ? category : '',
            vIdx === 0 ? subcategory : '',
            suffix
          ];

          // Store values
          allStores.forEach(store => {
            const storeStock = v.stores.find((s: any) => s.store_id === store.id);
            rowData.push(storeStock ? storeStock.quantity : 0);
          });

          rowData.push(
            v.available_quantity || 0,
            v.total_quantity || 0,
            v.reserved_quantity || 0,
            vIdx === 0 ? group.totalStock : ''
          );

          dataRows.push(rowData);

          // Add merging for the first 4 columns and the last column
          if (vIdx === 0 && variationsCount > 1) {
            const startRow = currentRow;
            const endRow = currentRow + variationsCount - 1;
            
            // SKU, Name, Category, Subcategory
            for (let c = 0; c < 4; c++) {
              merges.push({ s: { r: startRow, c }, e: { r: endRow, c } });
            }
            // SKU Total (last column)
            const totalColIdx = headerRow.length - 1;
            merges.push({ s: { r: startRow, c: totalColIdx }, e: { r: endRow, c: totalColIdx } });
          }
          
          currentRow++;
        });
      });

      // Create workbook and worksheet
      const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
      
      // Apply merges
      ws['!merges'] = merges;

      // Set column widths (optional but helpful)
      ws['!cols'] = [
        { wch: 15 }, // SKU
        { wch: 35 }, // Name
        { wch: 20 }, // Category
        { wch: 20 }, // Subcategory
        { wch: 15 }, // Variation
        ...allStores.map(() => ({ wch: 10 })),
        { wch: 12 }, // Available
        { wch: 12 }, // Physical
        { wch: 12 }, // Reserved
        { wch: 12 }, // SKU Total
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Inventory Report');

      // Write and Download
      const xlsxBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([xlsxBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `Inventory_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export inventory data. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-lg transition-colors shadow-sm font-semibold"
    >
      {exporting ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <FileSpreadsheet className="w-5 h-5" />
      )}
      {exporting ? 'Processing All Data...' : 'Print / Export XLSX'}
    </button>
  );
}
