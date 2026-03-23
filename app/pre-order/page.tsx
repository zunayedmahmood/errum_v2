'use client';

import { useState, useEffect } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import Link from 'next/link';
import { Search, X, Globe, Package, AlertCircle, CheckCircle, Eye } from 'lucide-react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import storeService from '@/services/storeService';
import axios from '@/lib/axios';

interface CartProduct {
  id: number | string;
  product_id: number;
  productName: string;
  sku: string;
  quantity: number;
  imageUrl: string;
}

export default function PreOrderPage() {
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  
  const [date, setDate] = useState(getTodayDate());
  const [salesBy, setSalesBy] = useState('');
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPhone, setUserPhone] = useState('');
  
  const [isInternational, setIsInternational] = useState(false);
  
  const [division, setDivision] = useState('');
  const [district, setDistrict] = useState('');
  const [city, setCity] = useState('');
  const [zone, setZone] = useState('');
  const [area, setArea] = useState('');
  const [postalCode, setPostalCode] = useState('');
  
  const [country, setCountry] = useState('');
  const [state, setState] = useState('');
  const [internationalCity, setInternationalCity] = useState('');
  const [internationalPostalCode, setInternationalPostalCode] = useState('');
  
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [preorderNotes, setPreorderNotes] = useState('');

  const [divisions, setDivisions] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [upazillas, setUpazillas] = useState<any[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [cart, setCart] = useState<CartProduct[]>([]);
  
  const [quantity, setQuantity] = useState('');
  const [selectedStore, setSelectedStore] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  function getTodayDate() {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = monthNames[today.getMonth()];
    const year = today.getFullYear();
    return `${day}-${month}-${year}`;
  }

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    if (type === 'error') {
      console.error('Error:', message);
      alert('Error: ' + message);
    } else {
      console.log('Success:', message);
      alert(message);
    }
  };

  const fetchStores = async () => {
    try {
      const response = await storeService.getStores({ is_active: true, per_page: 1000 });
      let storesData = [];
      
      if (response?.success && response?.data) {
        storesData = Array.isArray(response.data) ? response.data : 
                     Array.isArray(response.data.data) ? response.data.data : [];
      } else if (Array.isArray(response.data)) {
        storesData = response.data;
      }
      
      setStores(storesData);
      if (storesData.length > 0) {
        setSelectedStore(String(storesData[0].id));
      }
    } catch (error) {
      console.error('Error fetching stores:', error);
      setStores([]);
    }
  };

  const fetchProducts = async () => {
    try {
      console.log('🔍 Fetching OUT-OF-STOCK products for pre-order...');
      
      // FIXED: Use in_stock=false to get only out-of-stock products as per documentation
      const response = await axios.get('/catalog/products', { 
        params: { 
          in_stock: false,  // Get only out-of-stock products
          per_page: 1000 
        } 
      });
      
      console.log('📦 API response:', response.data);
      
      let productsData: any[] = [];
      
      // Handle different response structures
      if (response.data?.data) {
        if (response.data.data.products && Array.isArray(response.data.data.products)) {
          productsData = response.data.data.products;
        } else if (Array.isArray(response.data.data.data)) {
          productsData = response.data.data.data;
        } else if (Array.isArray(response.data.data)) {
          productsData = response.data.data;
        } else if (response.data.data.items && Array.isArray(response.data.data.items)) {
          productsData = response.data.data.items;
        }
      } else if (Array.isArray(response.data)) {
        productsData = response.data;
      }
      
      console.log('📊 Loaded', productsData.length, 'out-of-stock products');
      
      if (productsData.length > 0) {
        console.log('🔍 Sample product:', productsData[0]);
      }
      
      setAllProducts(productsData);
    } catch (error: any) {
      console.error('❌ Error fetching products:', error);
      console.error('❌ Error response:', error.response?.data);
      setAllProducts([]);
    }
  };

  const performProductSearch = async (query: string): Promise<any[]> => {
    const results: any[] = [];
    const queryLower = query.toLowerCase().trim();
    
    console.log('🔍 Searching for:', queryLower);

    if (allProducts.length === 0) {
      return [];
    }

    for (const prod of allProducts) {
      const productName = (prod.name || '').toLowerCase();
      const productSku = (prod.sku || '').toLowerCase();
      
      let matches = false;
      let relevanceScore = 0;
      
      if (productName === queryLower || productSku === queryLower) {
        relevanceScore = 100;
        matches = true;
      } else if (productName.startsWith(queryLower) || productSku.startsWith(queryLower)) {
        relevanceScore = 80;
        matches = true;
      } else if (productName.includes(queryLower) || productSku.includes(queryLower)) {
        relevanceScore = 60;
        matches = true;
      }
      
      if (matches) {
        let imageUrl = '/placeholder-image.jpg';
        if (prod.images && Array.isArray(prod.images) && prod.images.length > 0) {
          imageUrl = prod.images[0].url || prod.images[0].image_url || prod.images[0].image_path || '/placeholder-image.jpg';
        } else if (prod.image_url) {
          imageUrl = prod.image_url;
        } else if (prod.image) {
          imageUrl = prod.image;
        }
        
        results.push({
          id: prod.id,
          name: prod.name,
          sku: prod.sku,
          imageUrl: imageUrl,
          price_display: prod.price_display || 'TBA',
          in_stock: prod.in_stock || false,
          relevance_score: relevanceScore
        });
      }
    }
    
    results.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
    
    return results;
  };

  useEffect(() => {
    const userName = localStorage.getItem('userName') || '';
    setSalesBy(userName);
    
    const loadInitialData = async () => {
      await Promise.all([fetchProducts(), fetchStores()]);
    };
    loadInitialData();
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      try {
        const localResults = await performProductSearch(searchQuery);
        
        if (localResults.length > 0) {
          setSearchResults(localResults);
          return;
        }
        
        // Try API search if no local results
        const response = await axios.get('/catalog/products', {
          params: {
            search: searchQuery,
            in_stock: false,
            per_page: 20
          }
        });
        
        let products: any[] = [];
        
        if (response.data?.data) {
          if (response.data.data.products && Array.isArray(response.data.data.products)) {
            products = response.data.data.products;
          } else if (Array.isArray(response.data.data.data)) {
            products = response.data.data.data;
          } else if (Array.isArray(response.data.data)) {
            products = response.data.data;
          } else if (response.data.data.items && Array.isArray(response.data.data.items)) {
            products = response.data.data.items;
          }
        } else if (Array.isArray(response.data)) {
          products = response.data;
        }
        
        const apiResults = products.map(prod => {
          let imageUrl = '/placeholder-image.jpg';
          if (prod.images && Array.isArray(prod.images) && prod.images.length > 0) {
            imageUrl = prod.images[0].url || prod.images[0].image_url || prod.images[0].image_path || '/placeholder-image.jpg';
          } else if (prod.image_url) {
            imageUrl = prod.image_url;
          } else if (prod.image) {
            imageUrl = prod.image;
          }
          
          return {
            id: prod.id,
            name: prod.name,
            sku: prod.sku,
            imageUrl: imageUrl,
            price_display: prod.price_display || 'TBA',
            in_stock: prod.in_stock || false,
            relevance_score: 50
          };
        });
        
        setSearchResults(apiResults);
      } catch (error: any) {
        console.error('❌ Search error:', error);
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, allProducts]);

  useEffect(() => {
    if (!isInternational) {
      fetch('https://bdapi.vercel.app/api/v.1/division')
        .then(res => res.json())
        .then(data => setDivisions(data.data || []))
        .catch(() => setDivisions([]));
    }
  }, [isInternational]);

  useEffect(() => {
    if (!division || isInternational) return;
    const selectedDiv = divisions.find(d => d.name === division);
    if (selectedDiv) {
      fetch(`https://bdapi.vercel.app/api/v.1/district/${selectedDiv.id}`)
        .then(res => res.json())
        .then(data => setDistricts(data.data || []))
        .catch(() => setDistricts([]));
    }
  }, [division, divisions, isInternational]);

  useEffect(() => {
    if (!district || isInternational) return;
    const selectedDist = districts.find(d => d.name === district);
    if (selectedDist) {
      fetch(`https://bdapi.vercel.app/api/v.1/upazilla/${selectedDist.id}`)
        .then(res => res.json())
        .then(data => setUpazillas(data.data || []))
        .catch(() => setUpazillas([]));
    }
  }, [district, districts, isInternational]);

  const handleProductSelect = (product: any) => {
    setSelectedProduct(product);
    setSearchQuery('');
    setSearchResults([]);
    setQuantity('1');
  };

  const addToCart = () => {
    if (!selectedProduct || !quantity || parseInt(quantity) <= 0) {
      alert('Please select a product and enter quantity');
      return;
    }

    const qty = parseInt(quantity);

    const newItem: CartProduct = {
      id: Date.now(),
      product_id: selectedProduct.id,
      productName: selectedProduct.name,
      sku: selectedProduct.sku,
      quantity: qty,
      imageUrl: selectedProduct.imageUrl
    };
    
    setCart([...cart, newItem]);
    setSelectedProduct(null);
    setQuantity('');
  };

  const removeFromCart = (id: number | string) => {
    setCart(cart.filter(item => item.id !== id));
  };

  const handleConfirmPreOrder = async () => {
    if (!userName || !userPhone) {
      alert('Please fill in customer name and phone number');
      return;
    }
    if (cart.length === 0) {
      alert('Please add products to cart');
      return;
    }
    if (!selectedStore) {
      alert('Please select a store');
      return;
    }
    
    // Address validation
    if (isInternational) {
      const missingFields = [];
      if (!country) missingFields.push('Country');
      if (!internationalCity) missingFields.push('City');
      if (!deliveryAddress) missingFields.push('Street Address');
      
      if (missingFields.length > 0) {
        alert(`Please fill in the following international address fields:\n• ${missingFields.join('\n• ')}`);
        return;
      }
    } else {
      const missingFields = [];
      if (!division) missingFields.push('Division');
      if (!district) missingFields.push('District');
      if (!city) missingFields.push('Upazilla');
      if (!zone) missingFields.push('Zone');
      
      if (missingFields.length > 0) {
        alert(`Please fill in the following delivery address fields:\n• ${missingFields.join('\n• ')}`);
        return;
      }
    }
    
    try {
      setIsLoading(true);
      console.log('📦 CREATING PRE-ORDER (System will auto-detect out-of-stock items)');

      // Build complete address string
      const fullAddress = isInternational 
        ? `${deliveryAddress ? deliveryAddress + ', ' : ''}${internationalCity}, ${state ? state + ', ' : ''}${country}${internationalPostalCode ? ' - ' + internationalPostalCode : ''}`
        : `${deliveryAddress ? deliveryAddress + ', ' : ''}${area ? area + ', ' : ''}${zone ? zone + ', ' : ''}${city}, ${district}, ${division}${postalCode ? ' - ' + postalCode : ''}`;

      const orderData = {
        order_type: 'counter',
        store_id: parseInt(selectedStore),
        customer: {
          name: userName,
          email: userEmail || undefined,
          phone: userPhone,
          address: fullAddress
        },
        items: cart.map(item => ({
          product_id: item.product_id,
          batch_id: null,
          quantity: item.quantity,
          unit_price: 0,  // TBA - No price for pre-orders
          discount_amount: 0
        })),
        shipping_amount: 0,
        payment_method: 'cod',
        notes: `Pre-order request. ${preorderNotes ? preorderNotes + '. ' : ''}Expected delivery: ${expectedDeliveryDate || 'TBD'}. ${isInternational ? 'International' : 'Domestic'} delivery.`
      };

      console.log('📦 Pre-order data:', orderData);

      const response = await axios.post('/orders', orderData);

      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to create pre-order');
      }

      const createdOrder = response.data.data;
      console.log('✅ Order created:', createdOrder.order_number);
      console.log('🎯 Is Pre-order?:', createdOrder.is_preorder);

      if (createdOrder.is_preorder) {
        showToast(`Pre-order ${createdOrder.order_number} created successfully! System detected out-of-stock items. We'll contact you when stock arrives.`, 'success');
      } else {
        showToast(`Order ${createdOrder.order_number} created successfully!`, 'success');
      }
      
      // Clear form
      setCart([]);
      setUserName('');
      setUserEmail('');
      setUserPhone('');
      setDeliveryAddress('');
      setExpectedDeliveryDate('');
      setPreorderNotes('');
      setDivision('');
      setDistrict('');
      setCity('');
      setZone('');
      setArea('');
      setPostalCode('');
      setCountry('');
      setState('');
      setInternationalCity('');
      setInternationalPostalCode('');
      
      setTimeout(() => {
        window.location.href = '/orders';
      }, 2000);

    } catch (error: any) {
      console.error('❌ Pre-order creation failed:', error);
      console.error('❌ Error response:', error.response?.data);
      
      let errorMessage = 'Error creating pre-order. Please try again.';
      
      if (error.response?.data?.errors) {
        const validationErrors = error.response.data.errors;
        const errorMessages = Object.entries(validationErrors)
          .map(([field, messages]: [string, any]) => {
            return `${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`;
          })
          .join('\n');
        errorMessage = `Validation failed:\n${errorMessages}`;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      showToast(errorMessage, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
          
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <div className="max-w-7xl mx-auto">
              {/* Header Section */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Pre-Order Management</h1>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Order out-of-stock products for future delivery • System auto-detects pre-orders
                  </p>
                </div>
                
                <div className="flex items-center gap-3">

                
                  <Link href="/preorders" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm">

                
                    <Eye className="w-4 h-4" />

                
                    View preorders

                
                  </Link>

                
                  <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-900 dark:text-blue-300">No Payment Required</p>
                    <p className="text-xs text-blue-700 dark:text-blue-400">Price: TBA</p>
                  </div>
                </div>
                </div>
              </div>

              {/* Info Banner */}
              <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-3">
                <Package className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 text-sm">
                  <p className="font-medium text-amber-900 dark:text-amber-300 mb-1">
                    Showing {allProducts.length} out-of-stock products
                  </p>
                  <p className="text-amber-700 dark:text-amber-400">
                    System automatically detects out-of-stock items and marks orders as pre-orders. No manual flagging needed!
                  </p>
                </div>
              </div>
              
              {/* Order Details Row */}
              <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Created By</label>
                  <input
                    type="text"
                    value={salesBy}
                    readOnly
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Date <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Store <span className="text-red-500">*</span></label>
                  <select
                    value={selectedStore}
                    onChange={(e) => setSelectedStore(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    <option value="">Select Store</option>
                    {stores.map((store) => (
                      <option key={store.id} value={store.id}>{store.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Expected Delivery</label>
                  <input
                    type="date"
                    value={expectedDeliveryDate}
                    onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column - Customer Info & Address */}
                <div className="space-y-6">
                  {/* Customer Information */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Customer Information</h3>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Customer Name <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          placeholder="Full Name"
                          value={userName}
                          onChange={(e) => setUserName(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
                        <input
                          type="email"
                          placeholder="sample@email.com (optional)"
                          value={userEmail}
                          onChange={(e) => setUserEmail(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Phone Number <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          placeholder="01XXXXXXXXX"
                          value={userPhone}
                          onChange={(e) => setUserPhone(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Delivery Address */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Delivery Address</h3>
                      <button
                        onClick={() => {
                          setIsInternational(!isInternational);
                          setDivision(''); setDistrict(''); setCity(''); setZone(''); setArea(''); setPostalCode('');
                          setCountry(''); setState(''); setInternationalCity(''); setInternationalPostalCode('');
                          setDeliveryAddress('');
                        }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          isInternational
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-700'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        <Globe className="w-4 h-4" />
                        {isInternational ? 'International' : 'Domestic'}
                      </button>
                    </div>
                    
                    {isInternational ? (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Country <span className="text-red-500">*</span></label>
                          <input type="text" placeholder="Enter Country" value={country} onChange={(e) => setCountry(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">State/Province</label>
                          <input type="text" placeholder="Enter State" value={state} onChange={(e) => setState(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">City <span className="text-red-500">*</span></label>
                          <input type="text" placeholder="Enter City" value={internationalCity} onChange={(e) => setInternationalCity(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Postal Code</label>
                          <input type="text" placeholder="Enter Postal Code" value={internationalPostalCode} onChange={(e) => setInternationalPostalCode(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Street Address <span className="text-red-500">*</span></label>
                          <textarea placeholder="Full Address" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} rows={3} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none" />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Division <span className="text-red-500">*</span></label>
                            <select value={division} onChange={(e) => setDivision(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                              <option value="">Select Division</option>
                              {divisions.map((d) => (<option key={d.id} value={d.name}>{d.name}</option>))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">District <span className="text-red-500">*</span></label>
                            <select value={district} onChange={(e) => setDistrict(e.target.value)} disabled={!division} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                              <option value="">Select District</option>
                              {districts.map((d) => (<option key={d.id} value={d.name}>{d.name}</option>))}
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Upazilla <span className="text-red-500">*</span></label>
                            <select value={city} onChange={(e) => setCity(e.target.value)} disabled={!district} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                              <option value="">Select Upazilla</option>
                              {upazillas.map((u) => (<option key={u.id} value={u.name}>{u.name}</option>))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Zone <span className="text-red-500">*</span></label>
                            <input type="text" placeholder="Search Zone..." value={zone} onChange={(e) => setZone(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Area</label>
                          <input type="text" placeholder="Search Area..." value={area} onChange={(e) => setArea(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Delivery Address</label>
                          <textarea placeholder="House/Road details..." value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} rows={2} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Postal Code</label>
                          <input type="text" placeholder="e.g., 1212" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Pre-order Notes */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Pre-order Notes</h3>
                    <textarea
                      placeholder="Add any special instructions or notes for this pre-order..."
                      value={preorderNotes}
                      onChange={(e) => setPreorderNotes(e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    />
                  </div>
                </div>

                {/* Right Column - Product Search & Cart */}
                <div className="space-y-6">
                  {/* Product Search */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Search Out-of-Stock Products</h3>
                      {allProducts.length > 0 && (
                        <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full font-medium">
                          {allProducts.length} available
                        </span>
                      )}
                    </div>
                    
                    <div className="flex gap-2 mb-4">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search product name or SKU..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    </div>

                    {allProducts.length === 0 && !searchQuery && (
                      <div className="text-center py-12">
                        <Package className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                        <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Loading products...</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Fetching out-of-stock items</p>
                      </div>
                    )}

                    {searchQuery && searchResults.length === 0 && (
                      <div className="text-center py-12">
                        <Search className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                        <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">No products found</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Try searching with different keywords</p>
                      </div>
                    )}

                    {searchResults.length > 0 && (
                      <div className="grid grid-cols-2 gap-3 max-h-80 overflow-y-auto p-1">
                        {searchResults.map((product) => (
                          <div
                            key={product.id}
                            onClick={() => handleProductSelect(product)}
                            className="group border border-gray-200 dark:border-gray-700 rounded-lg p-3 cursor-pointer hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-md transition-all"
                          >
                            <div className="relative mb-2">
                              <img 
                                src={product.imageUrl} 
                                alt={product.name} 
                                className="w-full h-32 object-cover rounded" 
                              />
                              <span className="absolute top-1 right-1 text-[9px] px-2 py-0.5 bg-amber-500 text-white rounded-full font-bold uppercase tracking-wide">
                                Pre-Order
                              </span>
                            </div>
                            <p className="text-xs text-gray-900 dark:text-white font-medium truncate mb-1">{product.name}</p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">SKU: {product.sku}</p>
                            <div className="flex items-center justify-between">
                              <p className="text-sm text-blue-600 dark:text-blue-400 font-bold">{product.price_display}</p>
                              <CheckCircle className="w-4 h-4 text-gray-300 group-hover:text-blue-500 transition-colors" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {selectedProduct && (
                      <div className="mt-4 p-3 border-2 border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-blue-900 dark:text-blue-300">Selected Product</span>
                          <button 
                            onClick={() => {
                              setSelectedProduct(null);
                              setQuantity('');
                            }} 
                            className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          >
                            <X size={16} />
                          </button>
                        </div>
                        <div className="flex gap-3">
                          <img src={selectedProduct.imageUrl} alt={selectedProduct.name} className="w-16 h-16 object-cover rounded" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedProduct.name}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">SKU: {selectedProduct.sku}</p>
                            <p className="text-sm text-blue-600 dark:text-blue-400 font-bold mt-1">{selectedProduct.price_display}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-3 mt-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Quantity <span className="text-red-500">*</span></label>
                        <input
                          type="number"
                          placeholder="0"
                          value={quantity}
                          onChange={(e) => setQuantity(e.target.value)}
                          disabled={!selectedProduct}
                          min="1"
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>

                      <button
                        onClick={addToCart}
                        disabled={!selectedProduct}
                        className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
                      >
                        Add to Pre-order
                      </button>
                    </div>
                  </div>

                  {/* Cart */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Pre-order Cart</h3>
                        <span className="px-2.5 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold rounded-full">
                          {cart.length} items
                        </span>
                      </div>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Product</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300">Qty</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cart.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="px-4 py-12 text-center">
                                <Package className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">No products in cart</p>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Search and add products above</p>
                              </td>
                            </tr>
                          ) : (
                            cart.map((item) => (
                              <tr key={item.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <img src={item.imageUrl} alt={item.productName} className="w-12 h-12 object-cover rounded" />
                                    <div>
                                      <p className="font-medium text-gray-900 dark:text-white">{item.productName}</p>
                                      <p className="text-xs text-gray-500 dark:text-gray-400">SKU: {item.sku}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className="inline-block px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-full font-medium">
                                    {item.quantity}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <button 
                                    onClick={() => removeFromCart(item.id)} 
                                    className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-xs font-semibold px-3 py-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    
                    {cart.length > 0 && (
                      <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
                        <div className="space-y-3 mb-4">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">Total Items:</span>
                            <span className="text-gray-900 dark:text-white font-semibold">{cart.length}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">Total Quantity:</span>
                            <span className="text-gray-900 dark:text-white font-semibold">{cart.reduce((sum, item) => sum + item.quantity, 0)}</span>
                          </div>
                          <div className="flex justify-between text-sm pb-3 border-b border-gray-300 dark:border-gray-600">
                            <span className="text-gray-600 dark:text-gray-400">Total Amount:</span>
                            <span className="text-blue-600 dark:text-blue-400 font-bold">TBA</span>
                          </div>
                        </div>
                        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-start gap-2 text-xs text-blue-700 dark:text-blue-400">
                          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <span>No payment required. System will automatically detect out-of-stock items and create pre-order.</span>
                        </div>
                        <button
                          onClick={handleConfirmPreOrder}
                          disabled={isLoading}
                          className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {isLoading ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              Processing...
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-4 h-4" />
                              Confirm Pre-order
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}