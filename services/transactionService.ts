import api from '../lib/axios';

export interface BackendTransaction {
  id: number;
  transaction_number: string;
  transaction_date: string;
  amount: number;
  type: 'debit' | 'credit';
  account_id: number;
  description?: string;
  store_id?: number;
  reference_type?: string;
  reference_id?: number;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  display_id?: string;
  reference_label?: string;
  metadata?: {
    category?: string;
    comment?: string;
    receiptImage?: string;
    original_name?: string;
    order_number?: string;
    order_type?: string;
    payment_method?: string;
    group_id?: string;
    attachments?: Array<{
      url: string;
      name: string;
      uploaded_at: string;
    }>;
    additional_references?: Array<{
      label: string;
      url: string;
      added_at: string;
      transaction_id: number;
    }>;
    [key: string]: any;
  };
  createdAt: string;
  updatedAt: string;
  created_at?: string;
  updated_at?: string;
  account?: {
    id: number;
    name: string;
    account_code: string;
    type: string;
  };
  store?: {
    id: number;
    name: string;
  };
}

export interface Transaction {
  id: number;
  name: string;
  description?: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  source: string;
  createdAt: string;
  comment?: string;
  receiptImage?: string;
  referenceId?: string;
  referenceLabel?: string;
}

export interface Category {
  id: number;
  name: string;
  type: 'income' | 'expense';
}

export interface TransactionCreate {
  name: string;
  description?: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  date: string;
  comment?: string;
  receiptImage?: string;
}

export interface CategoryCreate {
  name: string;
  type: 'income' | 'expense';
}

// Helper function to convert backend transaction to frontend UI format
function mapTransactionToUI(transaction: BackendTransaction): Transaction {
  // Determine the actual type based on reference type
  // Order payments, sales, and order-related transactions should be INCOME (money coming in)
  // Even if backend incorrectly marks them as debit
  let actualType: 'income' | 'expense';
  
  const refType = transaction.reference_type?.toLowerCase() || '';
  const metadata = transaction.metadata || {};
  
  // If it's an order payment or sale, it's income (money received from customer)
  if (refType.includes('orderpayment') || refType.includes('order') || refType.includes('sale')) {
    actualType = 'income';
  } 
  // If it's a purchase order or vendor payment or expense, it's expense (money paid out)
  else if (refType.includes('purchaseorder') || refType.includes('vendor') || refType.includes('batch') || refType.includes('expense')) {
    actualType = 'expense';
  }
  // Otherwise use the backend type
  else {
    actualType = transaction.type === 'credit' ? 'income' : 'expense';
  }

  // Determine source label based on order_type from metadata
  let source = 'manual';
  
  if (refType.includes('orderpayment') || refType.includes('order')) {
    // Check order_type from metadata (best way)
    const orderType = metadata.order_type;
    
    if (orderType === 'counter') {
      source = 'sale'; // Counter/POS Sale
    } else if (orderType === 'social_commerce') {
      source = 'order'; // Social Commerce Order
    } else if (orderType === 'ecommerce') {
      source = 'order'; // E-commerce Order (can use different badge if needed)
    } else {
      // Fallback: try to determine from order number or other indicators
      const orderNumber = metadata.order_number || '';
      const hasShipping = metadata.shipping_amount || metadata.shipping_address;
      
      // Counter orders typically don't have shipping
      if (hasShipping) {
        source = 'order'; // Likely social commerce or ecommerce
      } else {
        source = 'sale'; // Likely counter sale
      }
    }
  } else if (refType.includes('sale')) {
    source = 'sale'; // Direct POS sale
  } else if (refType.includes('batch') || refType.includes('purchaseorder')) {
    source = 'batch'; // Inventory Purchase
  } else if (refType.includes('expense')) {
    source = 'expense'; // Company Expense / Payroll
  } else if (refType.includes('return')) {
    source = 'return'; // Return Refund
  } else if (refType.includes('exchange')) {
    source = 'exchange'; // Exchange Adjustment
  } else if (transaction.reference_type) {
    source = transaction.reference_type;
  }

  // Extract category from metadata or use default
  let category = metadata.category || 'Uncategorized';
  if (actualType === 'income' && category === 'Uncategorized') {
    category = 'Product Sales';
  }

  // Extract transaction name from metadata
  let name = metadata.original_name || transaction.description || 'Transaction';
  
  // For order payments, use a more descriptive name
  if (refType.includes('orderpayment')) {
    const orderNum = metadata.order_number || '';
    name = `Order Payment - ${orderNum}`;
  }

  return {
    id: transaction.id,
    name: name,
    description: transaction.description || undefined,
    type: actualType,
    amount: parseFloat(String(transaction.amount)) || 0, // Ensure it's a number
    category: category,
    source: source,
    createdAt: transaction.transaction_date || transaction.createdAt || transaction.created_at || new Date().toISOString(),
    comment: metadata.comment || metadata.note || undefined,
    receiptImage: metadata.receiptImage || (metadata.attachments && metadata.attachments[0]?.url) || undefined,
    referenceId: transaction.display_id || (transaction.reference_id ? `${transaction.reference_type}-${transaction.reference_id}` : transaction.transaction_number),
    referenceLabel: transaction.reference_label || source,
  };
}

const transactionService = {
  // Get all transactions with order details
  async getTransactions(params?: {
    account_id?: number;
    type?: string;
    status?: string;
    store_id?: number;
    date_from?: string;
    date_to?: string;
    search?: string;
    sort_by?: string;
    sort_order?: string;
    per_page?: number;
    page?: number;
  }) {
    const response = await api.get('/transactions', { params });
    
    // Map backend transactions to frontend UI format
    const responseData = response.data.data;
    const transactions = Array.isArray(responseData) ? responseData : (responseData?.data || []);
    
    // Extract unique order IDs from order payments
    const orderPaymentTransactions = transactions.filter((t: any) => 
      t.reference_type?.includes('OrderPayment') && t.metadata?.order_number
    );
    
    // Extract order numbers to fetch order details in bulk
    const orderNumbers = [...new Set(
      orderPaymentTransactions
        .map((t: any) => t.metadata?.order_number)
        .filter(Boolean)
    )];
    
    // Fetch all orders in one request if we have order numbers
    let ordersMap: Record<string, any> = {};
    if (orderNumbers.length > 0) {
      try {
        const ordersResponse = await api.get('/orders', {
          params: { per_page: 1000 } // Get all orders
        });
        const orders = ordersResponse.data.data?.data || ordersResponse.data.data || [];
        
        // Create a map of order_number -> order
        ordersMap = orders.reduce((acc: any, order: any) => {
          acc[order.order_number] = order;
          return acc;
        }, {});
      } catch (error) {
        console.warn('Could not fetch orders:', error);
      }
    }
    
    // Enrich transactions with order data
    const enrichedTransactions = transactions.map((transaction: any) => {
      if (transaction.metadata?.order_number && ordersMap[transaction.metadata.order_number]) {
        const order = ordersMap[transaction.metadata.order_number];
        if (!transaction.metadata) transaction.metadata = {};
        transaction.metadata.order_type = order.order_type;
      }
      return mapTransactionToUI(transaction);
    });
    
    return {
      transactions: enrichedTransactions,
      pagination: responseData?.meta || null,
    };
  },

  // Get single transaction
  async getTransaction(id: number) {
    const response = await api.get(`/transactions/${id}`);
    return {
      transaction: mapTransactionToUI(response.data.data.transaction || response.data.data),
      related_transactions: response.data.data.related_transactions || [],
      group_id: response.data.data.group_id,
      attachments: response.data.data.attachments || [],
      additional_references: response.data.data.additional_references || [],
    };
  },

  // Add attachment to transaction
  async addAttachment(id: number, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await api.post(`/transactions/${id}/attachments`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Add external reference to transaction
  async addReference(id: number, label: string, url: string) {
    const response = await api.post(`/transactions/${id}/references`, {
      reference_label: label,
      reference_url: url,
    });
    return response.data;
  },

  // Create transaction (manual entry)
  async createTransaction(data: TransactionCreate) {
    // Map the frontend data structure to backend structure
    const transactionData = {
      transaction_date: data.date,
      amount: data.amount,
      type: data.type === 'income' ? 'credit' : 'debit',
      account_id: 1, // Default cash account - adjust as needed
      description: `${data.name}${data.description ? ' - ' + data.description : ''}`,
      reference_type: 'manual',
      metadata: {
        category: data.category,
        comment: data.comment,
        receiptImage: data.receiptImage,
        original_name: data.name,
      },
      status: 'completed',
    };

    const response = await api.post('/transactions', transactionData);
    return {
      transaction: mapTransactionToUI(response.data.data),
    };
  },

  // Update transaction
  async updateTransaction(id: number, data: Partial<TransactionCreate>) {
    const transactionData: any = {};
    
    if (data.date) transactionData.transaction_date = data.date;
    if (data.amount) transactionData.amount = data.amount;
    if (data.type) transactionData.type = data.type === 'income' ? 'credit' : 'debit';
    
    // Build metadata
    const metadata: any = {};
    if (data.category) metadata.category = data.category;
    if (data.comment) metadata.comment = data.comment;
    if (data.receiptImage) metadata.receiptImage = data.receiptImage;
    if (data.name) metadata.original_name = data.name;
    
    if (Object.keys(metadata).length > 0) {
      transactionData.metadata = metadata;
    }
    
    if (data.name || data.description) {
      transactionData.description = `${data.name || ''}${data.description ? ' - ' + data.description : ''}`;
    }

    const response = await api.put(`/transactions/${id}`, transactionData);
    return {
      transaction: mapTransactionToUI(response.data.data),
    };
  },

  // Delete transaction
  async deleteTransaction(id: number) {
    const response = await api.delete(`/transactions/${id}`);
    return response.data;
  },

  // Complete transaction
  async completeTransaction(id: number) {
    const response = await api.post(`/transactions/${id}/complete`);
    return {
      transaction: mapTransactionToUI(response.data.data),
    };
  },

  // Get transaction statistics
  async getStatistics(params?: {
    date_from?: string;
    date_to?: string;
    store_id?: number;
  }) {
    const response = await api.get('/transactions/statistics', { params });
    return response.data;
  },

  // Get categories (for the dropdown)
  async getCategories() {
    // Return default categories
    // You can modify this once you have a categories endpoint
    return [
      // Expense categories
      { id: 1, name: 'Inventory Purchase', type: 'expense' },
      { id: 2, name: 'Rent', type: 'expense' },
      { id: 3, name: 'Utilities', type: 'expense' },
      { id: 4, name: 'Salaries', type: 'expense' },
      { id: 5, name: 'Marketing', type: 'expense' },
      { id: 6, name: 'Transportation', type: 'expense' },
      { id: 7, name: 'Office Supplies', type: 'expense' },
      { id: 8, name: 'Maintenance', type: 'expense' },
      { id: 9, name: 'Other Expenses', type: 'expense' },
      
      // Income categories
      { id: 10, name: 'Product Sales', type: 'income' },
      { id: 11, name: 'Service Revenue', type: 'income' },
      { id: 12, name: 'Other Income', type: 'income' },
    ] as Category[];
  },

  // Create category
  async createCategory(data: CategoryCreate) {
    // Mock implementation - returns the category with a generated ID
    return {
      id: Date.now(),
      ...data,
    } as Category;
  },
};

export default transactionService;