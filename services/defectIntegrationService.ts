import axiosInstance from '@/lib/axios';
import defectiveProductService, { 
  DefectiveProduct, 
  MarkDefectiveRequest,
  Severity,
  AvailableForSaleFilters,
  DefectiveProductFilters 
} from './defectiveProductService';
import productReturnService, { ProductReturn, CreateReturnRequest, ProductReturnFilters } from './productReturnService';
import refundService, { Refund, CreateRefundRequest, RefundFilters } from './refundService';
import barcodeService, { ScanResult } from './barcodeService';
import storeService, { Store } from './storeService';
import orderService, { Order } from './orderService';
import barcodeOrderMapper from './barcodeOrderMapper';

// Extended types for frontend integration
export interface DefectFormData {
  barcode: string;
  defect_type: 'physical_damage' | 'malfunction' | 'cosmetic' | 'missing_parts' | 'packaging_damage' | 'expired' | 'counterfeit' | 'other';
  defect_description: string;
  severity: 'minor' | 'moderate' | 'major' | 'critical';
  store_id: number;
  product_batch_id?: number;
  defect_images?: File[];
  internal_notes?: string;
  is_used_item?: boolean;
}

export interface CustomerReturnFormData {
  order_id: number;
  selected_barcodes: string[];
  return_reason: string;
  return_type: 'defective' | 'damaged' | 'wrong_item' | 'unwanted' | 'other';
  store_id: number;
  customer_notes?: string;
  attachments?: string[];
}

export interface SellDefectiveData {
  defective_product_id: number;
  order_id: number;
  selling_price: number;
  sale_notes?: string;
}

export interface DefectStatsSummary {
  total_defective: number;
  pending: number;
  inspected: number;
  available_for_sale: number;
  sold: number;
  by_severity: {
    minor: number;
    moderate: number;
    major: number;
    critical: number;
  };
  financial_impact: {
    total_original_value: number;
    total_sold_value: number;
    total_loss: number;
  };
}

export interface ReturnRefundWorkflow {
  return: ProductReturn;
  refunds: Refund[];
  total_refunded: number;
  remaining_amount: number;
  can_create_refund: boolean;
}

/**
 * Integrated Defect Management Service
 * Combines defective products, returns, and refunds for frontend workflows
 */
class DefectIntegrationService {
  
  // ==================== DEFECT IDENTIFICATION ====================
  
  /**
   * Scan barcode and get product information
   */
  async scanBarcode(barcode: string): Promise<ScanResult> {
    try {
      const response = await barcodeService.scanBarcode(barcode);
      if (!response.success) {
        throw new Error(response.message || 'Barcode not found');
      }
      return response.data;
    } catch (error: any) {
      console.error('Barcode scan error:', error);
      throw new Error(error.response?.data?.message || error.message || 'Failed to scan barcode');
    }
  }

  /**
   * Mark a product as defective (Employee identifies defect)
   */
  async markAsDefective(formData: DefectFormData): Promise<DefectiveProduct> {
    try {
      console.log('1. Scanning barcode:', formData.barcode);
      
      // First, scan barcode to get product_barcode_id and product details
      const scanResult = await this.scanBarcode(formData.barcode);
      
      console.log('2. Scan result:', scanResult);
      
      if (!scanResult.is_available) {
        throw new Error('Product is not available for marking as defective');
      }

      // Get barcode ID - need to fetch the actual product_barcode record
      const barcodeId = await this.getProductBarcodeId(formData.barcode);
      
      if (!barcodeId) {
        throw new Error('Could not determine product barcode ID. Please ensure the barcode is registered in the system.');
      }

      console.log('3. Barcode ID:', barcodeId);

      // Get the original price from scan result
      let originalPrice = 0;
      if (scanResult.current_batch?.sell_price) {
        originalPrice = parseFloat(scanResult.current_batch.sell_price.toString());
      } else if (scanResult.product?.selling_price) {
        originalPrice = parseFloat(scanResult.product.selling_price.toString());
      } else if (scanResult.product?.price) {
        originalPrice = parseFloat(scanResult.product.price.toString());
      }

      if (originalPrice === 0) {
        throw new Error('Could not determine original price for the product');
      }

      // Get batch ID if available
      let batchId: number | undefined = formData.product_batch_id;
      if (!batchId && scanResult.current_batch?.id) {
        batchId = scanResult.current_batch.id;
      }

      console.log('4. Sending request to mark as defective');

      // Use the defectiveProductService which now properly handles FormData
      const result = await defectiveProductService.markAsDefective({
        product_barcode_id: barcodeId,
        store_id: formData.store_id,
        defect_type: formData.is_used_item ? 'other' : formData.defect_type,
        defect_description: formData.is_used_item 
          ? 'USED_ITEM - Product has been used' 
          : formData.defect_description,
        severity: formData.severity,
        original_price: originalPrice,
        product_batch_id: batchId,
        defect_images: formData.defect_images,
        internal_notes: formData.internal_notes,
      });
      
      console.log('5. Result:', result);
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to mark as defective');
      }

      return result.data;
    } catch (error: any) {
      console.error('Mark as defective error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        url: error.config?.url
      });
      
      // Provide more detailed error message
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      } else if (error.response?.data?.errors) {
        const errors = Object.values(error.response.data.errors).flat();
        throw new Error(errors.join(', '));
      }
      
      throw new Error(error.message || 'Failed to mark product as defective');
    }
  }

  async inspectDefect(
    id: string | number, 
    data: {
      severity?: 'minor' | 'moderate' | 'major' | 'critical';
      internal_notes?: string;
    }
  ): Promise<DefectiveProduct> {
    try {
      console.log(`🔍 Inspecting defect ${id}...`);
      console.log('Inspection data:', data);
      
      const response = await axiosInstance.post(`/defective-products/${id}/inspect`, data);
      
      console.log('Inspect response:', response.data);
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to inspect defect');
      }
      
      console.log('✅ Defect inspected successfully');
      return response.data.data;
      
    } catch (error: any) {
      console.error('❌ Inspect defect error:', error);
      console.error('Response:', error.response?.data);
      
      throw new Error(
        error.response?.data?.message || 
        error.message || 
        'Failed to inspect defect'
      );
    }
  }

  /**
   * Make defective product available for sale
   * This activates the barcode so it can be sold
   */
  async makeAvailableForSale(id: string | number): Promise<DefectiveProduct> {
    try {
      console.log(`📦 Making defect ${id} available for sale...`);
      
      const response = await axiosInstance.post(`/defective-products/${id}/make-available`);
      
      console.log('Make available response:', response.data);
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to make available');
      }
      
      console.log('✅ Defect made available for sale');
      return response.data.data;
      
    } catch (error: any) {
      console.error('❌ Make available error:', error);
      console.error('Response data:', error.response?.data);
      
      const errorMessage = error.response?.data?.message || 
                          error.message || 
                          'Failed to make product available for sale';
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Get product barcode ID from barcode string
   * This method queries the backend to get the actual product_barcode record ID
   */
  private async getProductBarcodeId(barcode: string): Promise<number | null> {
    try {
      // Query the barcodes endpoint to find the barcode record
      const response = await axiosInstance.get('/barcodes', {
        params: {
          search: barcode,
          per_page: 1
        }
      });

      if (response.data.success && response.data.data?.data) {
        const barcodes = response.data.data.data;
        if (barcodes.length > 0) {
          return barcodes[0].id;
        }
      }

      // Alternative: Try to get from product barcodes if we have product_id
      const scanResult = await barcodeService.scanBarcode(barcode);
      if (scanResult.success && scanResult.data.product?.id) {
        const productBarcodesResponse = await barcodeService.getProductBarcodes(scanResult.data.product.id);
        if (productBarcodesResponse.success) {
          const matchingBarcode = productBarcodesResponse.data.barcodes.find(
            (b) => b.barcode === barcode
          );
          if (matchingBarcode) {
            return matchingBarcode.id;
          }
        }
      }

      return null;
    } catch (error: any) {
      console.error('Error getting product barcode ID:', error);
      return null;
    }
  }

  /**
 * Sell a defective product
 * This is the CORRECT method that matches your backend
 */
async sellDefectiveProduct(data: {
  defective_product_id: number;
  order_id: number;
  selling_price: number;
  sale_notes?: string;
}) {
  try {
    console.log('💰 Selling defective product:', data);
    
    // ✅ The API expects these exact fields
    const payload = {
      order_id: data.order_id,
      selling_price: data.selling_price,
      sale_notes: data.sale_notes,
    };

    console.log('📤 Sending to API:', payload);
    
    const response = await axiosInstance.post(
      `/defective-products/${data.defective_product_id}/sell`,
      payload
    );

    console.log('📥 API Response:', response.data);

    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to sell defective product');
    }

    console.log('✅ Defective product sold successfully');
    return response.data.data;
    
  } catch (error: any) {
    console.error('❌ Sell defective product error:', error);
    console.error('Response:', error.response?.data);
    
    throw new Error(
      error.response?.data?.message || 
      error.message || 
      'Failed to sell defective product'
    );
  }
}

  /**
   * Get all defective products with filtering
   */
  async getDefectiveProducts(filters?: DefectiveProductFilters) {
    try {
      const result = await defectiveProductService.getAll(filters);
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch defective products');
      }

      return result.data;
    } catch (error: any) {
      console.error('Get defective products error:', error);
      throw new Error(error.message || 'Failed to fetch defective products');
    }
  }

  /**
   * Get a single defective product by ID
   * Used to fetch complete details including batch_id before selling
   */
  async getDefectiveById(id: string | number): Promise<DefectiveProduct> {
    try {
      console.log(`📋 Fetching defective product details for ID: ${id}`);
      
      const result = await defectiveProductService.getById(Number(id));
      
      if (!result.success) {
        throw new Error(result.message || 'Defective product not found');
      }

      console.log('✅ Defective product details:', result.data);
      return result.data;
    } catch (error: any) {
      console.error('Get defective product error:', error);
      throw new Error(error.response?.data?.message || error.message || 'Failed to fetch defective product');
    }
  }

  /**
   * Get defective product statistics
   */
  async getDefectiveStats(filters?: {
    from_date?: string;
    to_date?: string;
    store_id?: number;
  }): Promise<DefectStatsSummary> {
    try {
      const result = await defectiveProductService.getStatistics(filters);
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch statistics');
      }

      return result.data;
    } catch (error: any) {
      console.error('Get defective stats error:', error);
      throw new Error(error.message || 'Failed to fetch defective statistics');
    }
  }

  /**
   * Mark defective item as sold (called after order completion)
   * This is used when selling defective items through POS or Social Commerce
   */
  async markDefectiveAsSold(
    defectId: string | number, 
    saleDetails: {
      order_id: number;
      selling_price: number;
      sale_notes?: string;
      sold_at?: string;
    }
  ) {
    try {
      console.log(`📋 Marking defective product ${defectId} as sold...`, saleDetails);
      
      const result = await defectiveProductService.sell(Number(defectId), {
        order_id: saleDetails.order_id,
        selling_price: saleDetails.selling_price,
        sale_notes: `Sold via POS/Commerce at ${saleDetails.sold_at || new Date().toISOString()}`,
      });

      if (!result.success) {
        throw new Error(result.message || 'Failed to mark defective item as sold');
      }

      console.log(`✅ Defective product ${defectId} marked as sold successfully`);
      return result.data;
    } catch (error: any) {
      console.error(`❌ Error marking defective ${defectId} as sold:`, error);
      throw new Error(error.response?.data?.message || error.message || 'Failed to mark defective item as sold');
    }
  }

  // ==================== CUSTOMER RETURNS ====================

  /**
   * Search customer orders by phone or order ID
   */
  async searchCustomerOrders(searchType: 'phone' | 'orderId', searchValue: string): Promise<Order[]> {
    try {
      if (searchType === 'phone') {
        const result = await orderService.getAll({
          search: searchValue,
          per_page: 50,
        });
        return result.data;
      } else {
        const order = await orderService.getById(parseInt(searchValue));
        return [order];
      }
    } catch (error: any) {
      console.error('Search orders error:', error);
      throw new Error(error.message || 'Failed to search orders');
    }
  }

  /**
   * Create customer return (multiple items with barcodes)
   */
  async createCustomerReturn(formData: CustomerReturnFormData): Promise<ProductReturn> {
    try {
      const validation = await barcodeOrderMapper.validateBarcodesForReturn(
        formData.order_id,
        formData.selected_barcodes
      );

      if (!validation.valid) {
        throw new Error('Validation errors: ' + validation.errors.join(', '));
      }

      if (validation.warnings.length > 0) {
        console.warn('Barcode validation warnings:', validation.warnings);
      }

      const returnItems = barcodeOrderMapper.convertToReturnItems(
        validation.mapped_items,
        formData.return_reason
      );

      if (returnItems.length === 0) {
        throw new Error('No valid items found for return');
      }

      const returnRequest: CreateReturnRequest = {
        order_id: formData.order_id,
        return_reason: formData.return_reason,
        return_type: formData.return_type,
        items: returnItems,
        customer_notes: formData.customer_notes,
        attachments: formData.attachments,
      };

      console.log('Creating return with items:', returnItems);

      const result = await productReturnService.create(returnRequest);

      if (!result.success) {
        throw new Error(result.message || 'Failed to create return');
      }

      // After creating the return, mark each barcode as defective
      for (const barcode of formData.selected_barcodes) {
        try {
          await this.markAsDefective({
            barcode: barcode,
            store_id: formData.store_id,
            defect_type: formData.return_type === 'defective' ? 'physical_damage' : 'other',
            defect_description: formData.return_reason,
            severity: 'moderate',
            is_used_item: formData.return_type === 'unwanted',
            internal_notes: `Customer return - Return #${result.data.return_number}`,
          });
        } catch (error) {
          console.error(`Failed to mark barcode ${barcode} as defective:`, error);
        }
      }

      return result.data;
    } catch (error: any) {
      console.error('Create customer return error:', error);
      throw new Error(error.message || 'Failed to create customer return');
    }
  }

  /**
   * Get all returns with filtering
   */
  async getReturns(filters?: ProductReturnFilters) {
    try {
      const result = await productReturnService.getAll(filters);

      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch returns');
      }

      return result.data;
    } catch (error: any) {
      console.error('Get returns error:', error);
      throw new Error(error.message || 'Failed to fetch returns');
    }
  }

  /**
   * Get complete return and refund workflow info
   */
  async getReturnWorkflow(returnId: number): Promise<ReturnRefundWorkflow> {
    try {
      const returnResult = await productReturnService.getById(returnId);
      
      if (!returnResult.success) {
        throw new Error('Return not found');
      }

      const returnData = returnResult.data;

      const refundsResult = await refundService.getAll({
        search: returnData.return_number,
      });

      const refunds: Refund[] = refundsResult.success ? (refundsResult.data.data || []) : [];

      const totalRefunded = refunds
        .filter((r: Refund) => r.status === 'completed')
        .reduce((sum: number, r: Refund) => sum + parseFloat(r.refund_amount.toString()), 0);

      const remainingAmount = parseFloat(returnData.total_refund_amount.toString()) - totalRefunded;

      return {
        return: returnData,
        refunds,
        total_refunded: totalRefunded,
        remaining_amount: remainingAmount,
        can_create_refund: returnData.status === 'completed' && remainingAmount > 0,
      };
    } catch (error: any) {
      console.error('Get return workflow error:', error);
      throw new Error(error.message || 'Failed to fetch return workflow');
    }
  }

  /**
   * Complete return workflow: Quality Check → Approve → Process → Complete
   */
  async processReturnWorkflow(returnId: number, options: {
    quality_check_passed: boolean;
    quality_check_notes?: string;
    total_refund_amount?: number;
    processing_fee?: number;
    internal_notes?: string;
    restore_inventory?: boolean;
  }) {
    try {
      await productReturnService.update(returnId, {
        quality_check_passed: options.quality_check_passed,
        quality_check_notes: options.quality_check_notes,
        internal_notes: options.internal_notes,
      });

      if (!options.quality_check_passed) {
        throw new Error('Quality check failed. Cannot proceed with return.');
      }

      await productReturnService.approve(returnId, {
        total_refund_amount: options.total_refund_amount,
        processing_fee: options.processing_fee,
        internal_notes: options.internal_notes,
      });

      await productReturnService.process(returnId, {
        restore_inventory: options.restore_inventory ?? true,
      });

      const result = await productReturnService.complete(returnId);

      if (!result.success) {
        throw new Error(result.message || 'Failed to complete return');
      }

      return result.data;
    } catch (error: any) {
      console.error('Process return workflow error:', error);
      throw new Error(error.message || 'Failed to process return workflow');
    }
  }

  // ==================== REFUNDS ====================

  /**
   * Create refund from completed return
   */
  async createRefund(data: CreateRefundRequest) {
    try {
      const result = await refundService.create(data);

      if (!result.success) {
        throw new Error(result.message || 'Failed to create refund');
      }

      return result.data;
    } catch (error: any) {
      console.error('Create refund error:', error);
      throw new Error(error.message || 'Failed to create refund');
    }
  }

  /**
   * Process and complete refund (money transfer)
   */
  async processAndCompleteRefund(refundId: number, transactionDetails?: {
    transaction_reference?: string;
    bank_reference?: string;
    gateway_reference?: string;
  }) {
    try {
      await refundService.process(refundId);

      const result = await refundService.complete(refundId, transactionDetails);

      if (!result.success) {
        throw new Error(result.message || 'Failed to complete refund');
      }

      return result.data;
    } catch (error: any) {
      console.error('Process and complete refund error:', error);
      throw new Error(error.message || 'Failed to process refund');
    }
  }

  /**
   * Get all refunds with filtering
   */
  async getRefunds(filters?: RefundFilters) {
    try {
      const result = await refundService.getAll(filters);

      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch refunds');
      }

      return result.data;
    } catch (error: any) {
      console.error('Get refunds error:', error);
      throw new Error(error.message || 'Failed to fetch refunds');
    }
  }

  // ==================== EXCHANGE WORKFLOW ====================

  /**
   * Process product exchange (Return old + Create new order)
   */
  async processExchange(exchangeData: {
    return_data: CustomerReturnFormData;
    new_order_items: Array<{
      product_id: number;
      batch_id: number;
      quantity: number;
      unit_price: number;
    }>;
    store_id: number;
    customer_id: number;
    payment_method_id: number;
  }) {
    try {
      const returnResult = await this.createCustomerReturn(exchangeData.return_data);

      await this.processReturnWorkflow(returnResult.id, {
        quality_check_passed: true,
        quality_check_notes: 'Exchange - Quality approved',
        restore_inventory: true,
      });

      const refund = await this.createRefund({
        return_id: returnResult.id,
        refund_type: 'full',
        refund_method: 'cash',
        internal_notes: 'Exchange refund',
      });

      await this.processAndCompleteRefund(refund.id, {
        transaction_reference: `EXCHANGE-${returnResult.return_number}`,
      });

      const newOrder = await orderService.create({
        order_type: 'counter',
        store_id: exchangeData.store_id,
        customer_id: exchangeData.customer_id,
        items: exchangeData.new_order_items,
        payment: {
          payment_method_id: exchangeData.payment_method_id,
          amount: exchangeData.new_order_items.reduce(
            (sum, item) => sum + item.quantity * item.unit_price,
            0
          ),
          payment_type: 'full',
        },
        notes: `Exchange - Original return: ${returnResult.return_number}`,
      });

      await orderService.complete(newOrder.id);

      return {
        return: returnResult,
        refund,
        new_order: newOrder,
        net_amount: parseFloat(refund.refund_amount.toString()) - parseFloat(newOrder.total_amount),
      };
    } catch (error: any) {
      console.error('Process exchange error:', error);
      throw new Error(error.message || 'Failed to process exchange');
    }
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Get all stores
   */
  async getStores() {
    try {
      const response = await storeService.getStores({ is_active: true });
      return response.success ? response.data : [];
    } catch (error: any) {
      console.error('Get stores error:', error);
      throw new Error(error.message || 'Failed to fetch stores');
    }
  }

  /**
   * Get defective products available for sale
   */
  async getAvailableForSale(filters?: AvailableForSaleFilters) {
    try {
      const result = await defectiveProductService.getAvailableForSale(filters);

      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch available products');
      }

      return result.data;
    } catch (error: any) {
      console.error('Get available for sale error:', error);
      throw new Error(error.message || 'Failed to fetch available products');
    }
  }
}

// Export singleton instance
export const defectIntegrationService = new DefectIntegrationService();

export default defectIntegrationService;