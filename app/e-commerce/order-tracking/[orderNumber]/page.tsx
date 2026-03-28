'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Package, Truck, CheckCircle, Clock, MapPin, Phone, Mail, Home, Loader2, AlertCircle } from 'lucide-react';
import Navigation from '@/components/ecommerce/Navigation';
import checkoutService, { Order, OrderTracking } from '@/services/checkoutService';

export default function OrderTrackingPage() {
  const params = useParams();
  const router = useRouter();
  const orderNumber = params?.orderNumber as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [tracking, setTracking] = useState<OrderTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchOrderNumber, setSearchOrderNumber] = useState('');

  useEffect(() => {
    if (orderNumber) {
      fetchTracking(orderNumber);
    } else {
      setLoading(false);
    }
  }, [orderNumber]);

  const fetchTracking = async (orderNum: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await checkoutService.trackOrder(orderNum);
      setOrder(data.order);
      setTracking(data.tracking);
    } catch (err: any) {
      console.error('Failed to fetch tracking:', err);
      setError('Order not found. Please check your order number and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchOrderNumber.trim()) {
      router.push(`/e-commerce/order-tracking/${searchOrderNumber.trim()}`);
    }
  };

  const getStatusIcon = (status: string, completed: boolean) => {
    if (!completed) {
      return <Clock className="text-gray-400" size={24} />;
    }

    switch (status) {
      case 'pending':
        return <CheckCircle className="text-green-600" size={24} />;
      case 'processing':
        return <Package className="text-blue-600" size={24} />;
      case 'shipped':
        return <Truck className="text-orange-600" size={24} />;
      case 'delivered':
        return <CheckCircle className="text-green-600" size={24} />;
      default:
        return <Clock className="text-gray-400" size={24} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'text-yellow-600 bg-yellow-50';
      case 'processing':
        return 'text-blue-600 bg-blue-50';
      case 'shipped':
        return 'text-orange-600 bg-orange-50';
      case 'delivered':
        return 'text-green-600 bg-green-50';
      case 'cancelled':
        return 'text-rose-600 bg-rose-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  // Search Form (when no order number in URL)
  if (!orderNumber || (!loading && !order)) {
    return (
      <div className="ec-root min-h-screen">
        <Navigation />
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="bg-white rounded-lg shadow-md p-8">
            <div className="text-center mb-8">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center">
                  <Package className="text-neutral-900" size={32} />
                </div>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Track Your Order</h1>
              <p className="text-gray-600">Enter your order number to track your delivery</p>
            </div>

            {error && (
              <div className="mb-6 bg-rose-50 border border-rose-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="text-rose-600 flex-shrink-0 mt-0.5" size={20} />
                <p className="text-neutral-900">{error}</p>
              </div>
            )}

            <form onSubmit={handleSearch} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Order Number
                </label>
                <input
                  type="text"
                  value={searchOrderNumber}
                  onChange={(e) => setSearchOrderNumber(e.target.value)}
                  placeholder="e.g., ORD-241118-1234"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-neutral-200 focus:border-transparent"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full bg-neutral-900 text-white py-3 rounded-lg font-semibold hover:bg-neutral-800 transition-colors"
              >
                Track Order
              </button>
            </form>

            <div className="mt-8 text-center">
              <p className="text-sm text-gray-600 mb-4">
                You can find your order number in the confirmation email or SMS
              </p>
              <button
                onClick={() => router.push('/')}
                className="text-neutral-900 text-sm font-medium hover:underline"
              >
                Continue Shopping
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="ec-root min-h-screen">
        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center">
            <Loader2 className="animate-spin h-12 w-12 text-neutral-900 mx-auto mb-4" />
            <p className="text-gray-600">Loading tracking information...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!order || !tracking) {
    return null;
  }

  return (
    <div className="ec-root min-h-screen">
      <Navigation />
      
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Order Tracking</h1>
              <p className="text-gray-600">Order Number: <span className="font-semibold text-gray-900">{order.order_number}</span></p>
            </div>
            
            <div className="flex flex-col items-start md:items-end gap-2">
              <span className={`px-4 py-2 rounded-full text-sm font-semibold ${getStatusColor(order.status)}`}>
                {order.status.toUpperCase()}
              </span>
              {tracking.estimated_delivery && (
                <p className="text-sm text-gray-600">
                  Est. Delivery: <span className="font-semibold">{tracking.estimated_delivery}</span>
                </p>
              )}
            </div>
          </div>

          {tracking.tracking_number && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-gray-600">
                Tracking Number: <span className="font-semibold text-gray-900">{tracking.tracking_number}</span>
              </p>
            </div>
          )}
        </div>

        {/* Tracking Timeline */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Delivery Status</h2>
          
          <div className="relative">
            {/* Timeline Line */}
            <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-gray-200"></div>
            
            {/* Timeline Steps */}
            <div className="space-y-8">
              {(tracking.steps || []).map((step, index) => (
                <div key={index} className="relative flex gap-6">
                  {/* Icon */}
                  <div className={`relative z-10 flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
                    step.completed ? 'bg-green-100' : 'bg-gray-100'
                  }`}>
                    {getStatusIcon(step.status, step.completed)}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 pb-8">
                    <h3 className={`font-semibold mb-1 ${
                      step.completed ? 'text-gray-900' : 'text-gray-500'
                    }`}>
                      {step.label}
                    </h3>
                    {step.date && (
                      <p className="text-sm text-gray-600">
                        {new Date(step.date).toLocaleString('en-US', {
                          weekday: 'short',
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    )}
                    {!step.completed && index === (tracking.steps || []).findIndex(s => !s.completed) && (
                      <p className="text-sm text-gray-500 mt-1">In progress...</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Shipping Address */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <MapPin className="text-neutral-900" size={20} />
              Delivery Address
            </h3>
            <div className="text-gray-700 space-y-1">
              <p className="font-semibold">{order.shipping_address.name}</p>
              <p className="flex items-center gap-2">
                <Phone size={16} />
                {order.shipping_address.phone}
              </p>
              {order.shipping_address.email && (
                <p className="flex items-center gap-2">
                  <Mail size={16} />
                  {order.shipping_address.email}
                </p>
              )}
              <p className="pt-2">
                {order.shipping_address.address_line_1}
                {order.shipping_address.address_line_2 && `, ${order.shipping_address.address_line_2}`}
              </p>
              <p>
                {order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.postal_code}
              </p>
              {order.shipping_address.landmark && (
                <p className="text-sm text-gray-600 pt-1">
                  Landmark: {order.shipping_address.landmark}
                </p>
              )}
            </div>
          </div>

          {/* Order Summary */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Package className="text-neutral-900" size={20} />
              Order Summary
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Items ({(order.items || []).length})</span>
                <span className="font-medium">৳{order.subtotal.toLocaleString('en-BD', { minimumFractionDigits: 2 })}</span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Shipping</span>
                <span className="font-medium">৳{(order.shipping_amount || 0).toLocaleString('en-BD', { minimumFractionDigits: 2 })}</span>
              </div>
              
              {order.discount_amount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Discount</span>
                  <span className="font-medium">-৳{order.discount_amount.toLocaleString('en-BD', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              
              <div className="border-t pt-3 flex justify-between">
                <span className="font-bold text-gray-900">Total</span>
                <span className="font-bold text-neutral-900 text-lg">
                  ৳{order.total_amount.toLocaleString('en-BD', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="border-t pt-3">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600">Payment Method</span>
                  <span className="font-medium capitalize">{order.payment_method.replace('_', ' ')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Payment Status</span>
                  <span className={`font-medium capitalize ${
                    order.payment_status === 'paid' ? 'text-green-600' : 'text-orange-600'
                  }`}>
                    {order.payment_status}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Order Items */}
        <div className="bg-white rounded-lg shadow-md p-6 mt-8">
          <h3 className="font-bold text-gray-900 mb-4">Items in This Order</h3>
          <div className="space-y-4">
            {(order.items || []).map((item, index) => (
              <div key={index} className="flex gap-4 pb-4 border-b last:border-b-0">
                {item.product_image && (
                  <img
                    src={item.product_image}
                    alt={item.product_name}
                    className="w-20 h-20 object-cover rounded"
                    onError={(e) => {
                      if (!e.currentTarget.src.includes('/placeholder-product.png')) {
                        e.currentTarget.src = '/placeholder-product.png';
                      }
                    }}
                  />
                )}
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">{item.product_name}</h4>
                  {item.sku && <p className="text-sm text-gray-600">SKU: {item.sku}</p>}
                  {(item.color || item.size) && (
                    <p className="text-sm text-gray-600">
                      {item.color && `Color: ${item.color}`}
                      {item.color && item.size && ' | '}
                      {item.size && `Size: ${item.size}`}
                    </p>
                  )}
                  <p className="text-sm text-gray-600">Qty: {item.quantity}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">
                    ৳{(item.total || 0).toLocaleString('en-BD', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-4 mt-8">
          <button
            onClick={() => router.push('/')}
            className="flex-1 bg-neutral-900 text-white px-6 py-3 rounded-lg font-semibold hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2"
          >
            <Home size={20} />
            Continue Shopping
          </button>
          
          <button
            onClick={() => router.push(`/e-commerce/order-confirmation/${order.order_number}`)}
            className="flex-1 bg-white border-2 border-gray-300 text-gray-700 px-6 py-3 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
          >
            View Order Details
          </button>
        </div>

        {/* Help Section */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-2">Need Help?</h3>
          <p className="text-sm text-blue-800 mb-3">
            If you have any questions about your order, please contact our customer support team.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 text-sm">
            <div className="flex items-center gap-2 text-blue-900">
              <Phone size={16} />
              <span className="font-semibold">+880 1234-567890</span>
            </div>
            <div className="flex items-center gap-2 text-blue-900">
              <Mail size={16} />
              <span className="font-semibold">support@yourstore.com</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}