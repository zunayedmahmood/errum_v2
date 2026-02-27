// services/cartService.ts

import axiosInstance from '@/lib/axios';
import catalogService from '@/services/catalogService';
import { toAbsoluteAssetUrl } from '@/lib/assetUrl';

export const GUEST_CART_STORAGE_KEY = 'guest_cart_v1' as const;

type GuestCartStorageItem = {
  id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  total_price: number;
  variant_options?: VariantOptions | null;
  notes?: string;
  product_snapshot: CartProduct;
  added_at: string;
  updated_at: string;
};

type GuestCartStorage = {
  items: GuestCartStorageItem[];
  updated_at: string;
};

function hasCustomerToken(): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem('auth_token');
}

function nowIso(): string {
  return new Date().toISOString();
}

function safeParseGuestCart(): GuestCartStorage {
  if (typeof window === 'undefined') {
    return { items: [], updated_at: nowIso() };
  }

  try {
    const raw = localStorage.getItem(GUEST_CART_STORAGE_KEY);
    if (!raw) return { items: [], updated_at: nowIso() };
    const parsed = JSON.parse(raw) as GuestCartStorage;
    if (!parsed || !Array.isArray(parsed.items)) return { items: [], updated_at: nowIso() };
    return { items: parsed.items, updated_at: parsed.updated_at || nowIso() };
  } catch {
    return { items: [], updated_at: nowIso() };
  }
}

function saveGuestCart(cart: GuestCartStorage) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify(cart));
  // Let UI refresh cart badge etc.
  window.dispatchEvent(new Event('cart-updated'));
}

function emitCartUpdated() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('cart-updated'));
}


function normalizeCartProduct(product: any): CartProduct {
  const rawImages =
    (Array.isArray(product?.images) && product.images) ||
    (Array.isArray(product?.images?.data) && product.images.data) ||
    (Array.isArray(product?.product_images) && product.product_images) ||
    [];

  const images = (rawImages || [])
    .map((img: any, idx: number) => {
      const rawUrl =
        img?.image_url ||
        img?.url ||
        img?.thumbnail_url ||
        img?.image ||
        img?.path ||
        img?.src ||
        '';

      const image_url = toAbsoluteAssetUrl(String(rawUrl || ''));

      return {
        id: Number(img?.id || idx + 1),
        image_url,
        is_primary: Boolean(img?.is_primary || img?.isPrimary || img?.primary || img?.is_main),
      };
    })
    .filter((i: any) => Boolean(i.image_url));

  if (images.length > 0 && !images.some((i: any) => i.is_primary)) {
    images[0].is_primary = true
  }

  return {
    id: Number(product?.id || 0),
    name: String(product?.name || ''),
    selling_price: product?.selling_price ?? product?.price ?? 0,
    images,
    category: product?.category?.name || product?.category || undefined,
    stock_quantity: Number(product?.stock_quantity ?? 0),
    in_stock: Boolean(product?.in_stock ?? true),
    sku: product?.sku || undefined,
  };
}

function normalizeCartProductFromCatalog(product: any): CartProduct {
  // catalogService returns images with `url` (not `image_url`).
  return normalizeCartProduct(product);
}

function normalizeCart(cart: any): Cart {
  const cart_items: CartItem[] = Array.isArray(cart?.cart_items)
    ? cart.cart_items.map((ci: any) => ({
        ...ci,
        product: normalizeCartProduct(ci?.product),
      }))
    : [];

  // Preserve summary if present; otherwise compute.
  const total_items = cart_items.reduce((s, i) => s + Number(i.quantity || 0), 0);
  const total_amount = cart_items.reduce((s, i) => {
    const n = typeof i.total_price === 'string' ? parseFloat(i.total_price) : Number(i.total_price || 0);
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);

  const summary = cart?.summary || {
    total_items,
    total_amount,
    currency: 'BDT',
    has_items: total_items > 0,
  };

  return {
    cart_items,
    summary,
  };
}

function variantKey(variant_options?: VariantOptions | null): string {
  if (!variant_options) return '';
  const color = variant_options.color || '';
  const size = variant_options.size || '';
  return `${color}::${size}`;
}

export interface CartProduct {
  id: number;
  name: string;
  selling_price: string | number;
  images: Array<{
    id: number;
    image_url: string;
    is_primary: boolean;
  }>;
  category?: string;
  stock_quantity: number;
  in_stock: boolean;
  sku?: string;
}

export interface VariantOptions {
  color?: string;
  size?: string;
}

export interface CartItem {
  id: number; // cart_item_id from backend
  product_id: number;
  product: CartProduct;
  variant_options?: VariantOptions | null;
  quantity: number;
  unit_price: string | number;
  total_price: string | number;
  notes?: string;
  added_at: string;
  updated_at: string;
}

export interface CartSummary {
  total_items: number;
  total_amount: string | number;
  currency: string;
  has_items?: boolean;
}

export interface Cart {
  cart_items: CartItem[];
  summary: CartSummary;
}

export interface SavedItem {
  id: number;
  product_id: number;
  product: CartProduct & {
    price_changed: boolean;
  };
  quantity: number;
  original_price: string | number;
  current_price: string | number;
  notes?: string;
  saved_at: string;
}

export interface CartValidationIssue {
  item_id: number;
  product_name: string;
  issue: string;
  available_quantity?: number;
  old_price?: string | number;
  new_price?: string | number;
}

export interface CartValidation {
  is_valid: boolean;
  valid_items_count: number;
  total_items_count: number;
  issues: CartValidationIssue[];
  total_amount: string | number;
}

export interface AddToCartRequest {
  product_id: number;
  quantity: number;
  notes?: string;
  variant_options?: VariantOptions;
}

export interface UpdateQuantityRequest {
  quantity: number;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
  errors?: any;
}

class CartService {
  private buildGuestCart(storage: GuestCartStorage): Cart {
    const cart_items: CartItem[] = storage.items.map((it) => ({
      id: it.id,
      product_id: it.product_id,
      product: normalizeCartProduct(it.product_snapshot),
      variant_options: it.variant_options || null,
      quantity: it.quantity,
      unit_price: it.unit_price,
      total_price: it.total_price,
      notes: it.notes,
      added_at: it.added_at,
      updated_at: it.updated_at,
    }));

    const total_items = cart_items.reduce((s, i) => s + i.quantity, 0);
    const total_amount = cart_items.reduce((s, i) => {
      const n = typeof i.total_price === 'string' ? parseFloat(i.total_price) : (i.total_price as number);
      return s + (Number.isFinite(n) ? n : 0);
    }, 0);

    return {
      cart_items,
      summary: {
        total_items,
        total_amount,
        currency: 'BDT',
        has_items: total_items > 0,
      },
    };
  }

  /**
   * Get customer's cart
   */
  async getCart(): Promise<Cart> {
    try {
      // Guest cart (localStorage)
      if (!hasCustomerToken()) {
        return normalizeCart(this.buildGuestCart(safeParseGuestCart()));
      }

      const response = await axiosInstance.get<ApiResponse<Cart>>('/cart');
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to get cart');
      }
      
      return response.data.data;
    } catch (error: any) {
      console.error('Get cart error:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to get cart';
      throw new Error(errorMessage);
    }
  }

  /**
   * Add product to cart
   * Now supports variant_options (color, size)
   */
  async addToCart(payload: AddToCartRequest): Promise<{
    cart_item: CartItem;
  }> {
    try {
      console.log('🛒 Adding to cart:', payload);

      // Guest cart (localStorage)
      if (!hasCustomerToken()) {
        const storage = safeParseGuestCart();
        const productDetail = await catalogService.getProduct(payload.product_id);
        const productSnapshot = normalizeCartProductFromCatalog(productDetail.product);

        const vKey = variantKey(payload.variant_options || null);
        const existingIndex = storage.items.findIndex(
          (it) => it.product_id === payload.product_id && variantKey(it.variant_options) === vKey
        );

        const unitPriceNum = Number(productSnapshot.selling_price) || 0;
        const ts = nowIso();

        if (existingIndex >= 0) {
          const existing = storage.items[existingIndex];
          const newQty = existing.quantity + Math.max(1, payload.quantity);
          const updated: GuestCartStorageItem = {
            ...existing,
            quantity: newQty,
            unit_price: unitPriceNum,
            total_price: unitPriceNum * newQty,
            notes: payload.notes ?? existing.notes,
            product_snapshot: productSnapshot,
            updated_at: ts,
          };
          storage.items[existingIndex] = updated;
          storage.updated_at = ts;
          saveGuestCart(storage);
          return {
            cart_item: {
              id: updated.id,
              product_id: updated.product_id,
              product: updated.product_snapshot,
              variant_options: updated.variant_options || null,
              quantity: updated.quantity,
              unit_price: updated.unit_price,
              total_price: updated.total_price,
              notes: updated.notes,
              added_at: updated.added_at,
              updated_at: updated.updated_at,
            },
          };
        }

        const newId = Date.now() + Math.floor(Math.random() * 1000);
        const qty = Math.max(1, payload.quantity);
        const item: GuestCartStorageItem = {
          id: newId,
          product_id: payload.product_id,
          quantity: qty,
          unit_price: unitPriceNum,
          total_price: unitPriceNum * qty,
          variant_options: payload.variant_options || null,
          notes: payload.notes,
          product_snapshot: productSnapshot,
          added_at: ts,
          updated_at: ts,
        };

        storage.items.unshift(item);
        storage.updated_at = ts;
        saveGuestCart(storage);

        return {
          cart_item: {
            id: item.id,
            product_id: item.product_id,
            product: item.product_snapshot,
            variant_options: item.variant_options || null,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: item.total_price,
            notes: item.notes,
            added_at: item.added_at,
            updated_at: item.updated_at,
          },
        };
      }
      
      const response = await axiosInstance.post<ApiResponse<{ cart_item: CartItem }>>(
        '/cart/add',
        payload
      );
      
      console.log('✅ Add to cart response:', response.data);
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to add to cart');
      }
      
      emitCartUpdated();
      return response.data.data;
    } catch (error: any) {
      console.error('❌ Add to cart error:', error);
      console.error('Error details:', error.response?.data);
      
      // Handle validation errors
      if (error.response?.data?.errors) {
        const errors = error.response.data.errors;
        const firstError = Object.values(errors)[0];
        throw new Error(Array.isArray(firstError) ? firstError[0] : String(firstError));
      }
      
      const errorMessage = error.response?.data?.message || 
                          error.message || 
                          'Failed to add to cart';
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Update cart item quantity
   * @param cartItemId - The cart item ID (NOT product ID)
   * @param payload - Object containing the new quantity
   */
  async updateQuantity(
    cartItemId: number,
    payload: UpdateQuantityRequest
  ): Promise<{
    cart_item: {
      id: number;
      quantity: number;
      unit_price: string | number;
      total_price: string | number;
    };
  }> {
    try {
      console.log(`🔄 Updating cart item ${cartItemId}:`, payload);

      // Guest cart (localStorage)
      if (!hasCustomerToken()) {
        const storage = safeParseGuestCart();
        const idx = storage.items.findIndex((it) => it.id === cartItemId);
        if (idx === -1) throw new Error('Cart item not found');

        const qty = Math.max(0, Number(payload.quantity || 0));
        const ts = nowIso();

        if (qty === 0) {
          storage.items.splice(idx, 1);
          storage.updated_at = ts;
          saveGuestCart(storage);
          return {
            cart_item: {
              id: cartItemId,
              quantity: 0,
              unit_price: 0,
              total_price: 0,
            },
          };
        }

        const existing = storage.items[idx];
        const unit = Number(existing.unit_price) || 0;
        const updated: GuestCartStorageItem = {
          ...existing,
          quantity: qty,
          total_price: unit * qty,
          updated_at: ts,
        };
        storage.items[idx] = updated;
        storage.updated_at = ts;
        saveGuestCart(storage);

        return {
          cart_item: {
            id: updated.id,
            quantity: updated.quantity,
            unit_price: updated.unit_price,
            total_price: updated.total_price,
          },
        };
      }
      
      const response = await axiosInstance.put<ApiResponse<{
        cart_item: {
          id: number;
          quantity: number;
          unit_price: string | number;
          total_price: string | number;
        };
      }>>(
        `/cart/update/${cartItemId}`,
        payload
      );
      
      console.log('✅ Update response:', response.data);
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to update cart');
      }
      
      emitCartUpdated();
      return response.data.data;
    } catch (error: any) {
      console.error('❌ Update cart error:', error);
      console.error('Error details:', error.response?.data);
      
      // Handle validation errors
      if (error.response?.data?.errors) {
        const errors = error.response.data.errors;
        const firstError = Object.values(errors)[0];
        throw new Error(Array.isArray(firstError) ? firstError[0] : String(firstError));
      }
      
      const errorMessage = error.response?.data?.message || 
                          error.message || 
                          'Failed to update cart';
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Remove item from cart
   * @param cartItemId - The cart item ID (NOT product ID)
   */
  async removeFromCart(cartItemId: number): Promise<void> {
    try {
      console.log(`🗑️ Removing cart item ${cartItemId}`);

      // Guest cart (localStorage)
      if (!hasCustomerToken()) {
        const storage = safeParseGuestCart();
        const next = storage.items.filter((it) => it.id !== cartItemId);
        storage.items = next;
        storage.updated_at = nowIso();
        saveGuestCart(storage);
        return;
      }
      
      const response = await axiosInstance.delete<ApiResponse<any>>(
        `/cart/remove/${cartItemId}`
      );
      
      console.log('✅ Remove response:', response.data);
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to remove from cart');
      }
    emitCartUpdated();
    } catch (error: any) {
      console.error('❌ Remove from cart error:', error);
      console.error('Error details:', error.response?.data);
      
      const errorMessage = error.response?.data?.message || 
                          error.message || 
                          'Failed to remove from cart';
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Clear entire cart
   */
  async clearCart(): Promise<void> {
    try {
      // Guest cart (localStorage)
      if (!hasCustomerToken()) {
        saveGuestCart({ items: [], updated_at: nowIso() });
        return;
      }

      const response = await axiosInstance.delete<ApiResponse<any>>('/cart/clear');
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to clear cart');
      }
    emitCartUpdated();
    } catch (error: any) {
      console.error('Clear cart error:', error);
      
      const errorMessage = error.response?.data?.message || 
                          error.message || 
                          'Failed to clear cart';
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Save item for later
   * @param cartItemId - The cart item ID (NOT product ID)
   */
  async saveForLater(cartItemId: number): Promise<void> {
    try {
      const response = await axiosInstance.post<ApiResponse<any>>(
        `/cart/save-for-later/${cartItemId}`
      );
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to save item');
      }
    } catch (error: any) {
      console.error('Save for later error:', error);
      
      const errorMessage = error.response?.data?.message || 
                          error.message || 
                          'Failed to save item';
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Move saved item back to cart
   * @param cartItemId - The cart item ID (NOT product ID)
   */
  async moveToCart(cartItemId: number): Promise<void> {
    try {
      const response = await axiosInstance.post<ApiResponse<any>>(
        `/cart/move-to-cart/${cartItemId}`
      );
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to move item to cart');
      }
    } catch (error: any) {
      console.error('Move to cart error:', error);
      
      const errorMessage = error.response?.data?.message || 
                          error.message || 
                          'Failed to move item to cart';
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Get saved items
   */
  async getSavedItems(): Promise<{
    saved_items: SavedItem[];
    total_saved_items: number;
  }> {
    try {
      const response = await axiosInstance.get<ApiResponse<{
        saved_items: SavedItem[];
        total_saved_items: number;
      }>>('/cart/saved-items');
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to get saved items');
      }
      
      return response.data.data;
    } catch (error: any) {
      console.error('Get saved items error:', error);
      
      const errorMessage = error.response?.data?.message || 
                          error.message || 
                          'Failed to get saved items';
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Get cart summary
   */
  async getCartSummary(): Promise<CartSummary> {
    try {
      // Guest cart (localStorage)
      if (!hasCustomerToken()) {
        return this.buildGuestCart(safeParseGuestCart()).summary;
      }

      const response = await axiosInstance.get<ApiResponse<CartSummary>>('/cart/summary');
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to get cart summary');
      }
      
      return response.data.data;
    } catch (error: any) {
      console.error('Get cart summary error:', error);
      
      const errorMessage = error.response?.data?.message || 
                          error.message || 
                          'Failed to get cart summary';
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Validate cart before checkout
   */
  async validateCart(): Promise<CartValidation> {
    try {
      // Guest cart (localStorage)
      if (!hasCustomerToken()) {
        const cart = this.buildGuestCart(safeParseGuestCart());
        const issues: CartValidationIssue[] = [];

        for (const item of cart.cart_items) {
          const available = Number(item.product.stock_quantity ?? 0);
          if (item.product.in_stock === false) {
            issues.push({
              item_id: item.id,
              product_name: item.product.name,
              issue: 'Out of stock',
              available_quantity: 0,
            });
          } else if (available > 0 && item.quantity > available) {
            issues.push({
              item_id: item.id,
              product_name: item.product.name,
              issue: 'Insufficient stock',
              available_quantity: available,
            });
          }
        }

        const total_amount = typeof cart.summary.total_amount === 'string'
          ? parseFloat(cart.summary.total_amount)
          : (cart.summary.total_amount as number);

        return {
          is_valid: issues.length === 0 && cart.summary.total_items > 0,
          valid_items_count: Math.max(0, cart.cart_items.length - issues.length),
          total_items_count: cart.cart_items.length,
          issues,
          total_amount,
        };
      }

      const response = await axiosInstance.post<ApiResponse<CartValidation>>('/cart/validate');
      
      // Note: Backend may return success: false when there are issues
      // but we still want to return the validation data
      return response.data.data;
    } catch (error: any) {
      console.error('Validate cart error:', error);
      
      // If it's a 400 with validation data, return that
      if (error.response?.status === 400 && error.response?.data?.data) {
        return error.response.data.data;
      }
      
      const errorMessage = error.response?.data?.message || 
                          error.message || 
                          'Failed to validate cart';
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Calculate cart totals for local display
   */
  calculateTotals(cartItems: CartItem[]): {
    subtotal: number;
    total_items: number;
  } {
    const subtotal = cartItems.reduce((sum, item) => {
      const total = typeof item.total_price === 'string' 
        ? parseFloat(item.total_price) 
        : item.total_price;
      return sum + total;
    }, 0);

    const total_items = cartItems.reduce((sum, item) => {
      return sum + item.quantity;
    }, 0);

    return {
      subtotal,
      total_items,
    };
  }

  /**
   * Format price for display
   */
  formatPrice(price: string | number): string {
    const numPrice = typeof price === 'string' ? parseFloat(price) : price;
    return numPrice.toLocaleString('en-BD', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  /**
   * Check if cart has items
   */
  hasItems(cart: Cart): boolean {
    return cart.cart_items.length > 0;
  }

  /**
   * Get total quantity in cart
   */
  getTotalQuantity(cart: Cart): number {
    return cart.cart_items.reduce((sum, item) => sum + item.quantity, 0);
  }

  /**
   * Get total amount in cart
   */
  getTotalAmount(cart: Cart): number {
    const amount = cart.summary.total_amount;
    return typeof amount === 'string' ? parseFloat(amount) : amount;
  }

  /**
   * Find cart item by product ID and variant options
   */
  findItemByProductId(
    cart: Cart, 
    productId: number, 
    variantOptions?: VariantOptions
  ): CartItem | undefined {
    return cart.cart_items.find(item => {
      if (item.product_id !== productId) return false;
      
      // If no variant options specified, match items without variants
      if (!variantOptions) {
        return !item.variant_options || Object.keys(item.variant_options).length === 0;
      }
      
      // Match variant options
      if (!item.variant_options) return false;
      
      return item.variant_options.color === variantOptions.color &&
             item.variant_options.size === variantOptions.size;
    });
  }

  /**
   * Check if product is in cart (considering variants)
   */
  isProductInCart(
    cart: Cart, 
    productId: number, 
    variantOptions?: VariantOptions
  ): boolean {
    return !!this.findItemByProductId(cart, productId, variantOptions);
  }

  /**
   * Get product quantity in cart (considering variants)
   */
  getProductQuantityInCart(
    cart: Cart, 
    productId: number, 
    variantOptions?: VariantOptions
  ): number {
    const item = this.findItemByProductId(cart, productId, variantOptions);
    return item ? item.quantity : 0;
  }

  /**
   * Get all cart items for a specific product (all variants)
   */
  getProductItems(cart: Cart, productId: number): CartItem[] {
    return cart.cart_items.filter(item => item.product_id === productId);
  }

  /**
   * Get total quantity for a product across all variants
   */
  getTotalProductQuantity(cart: Cart, productId: number): number {
    const items = this.getProductItems(cart, productId);
    return items.reduce((sum, item) => sum + item.quantity, 0);
  }
}

const cartService = new CartService();
export default cartService;