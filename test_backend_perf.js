const axios = require('axios');

const BASE_URL = 'https://backend2.errumbd.com/api';

async function login() {
    console.log('Logging in...');
    try {
        const res = await axios.post(`${BASE_URL}/login`, {
            email: 'mueedibnesami.anoy@gmail.com',
            password: '12345678'
        });
        if (res.data.access_token) {
            console.log('Login successful');
            return res.data.access_token;
        }
        throw new Error('Login failed: ' + JSON.stringify(res.data));
    } catch (err) {
        console.error('Login Error:', err.message);
        return null;
    }
}

async function testApi(name, params, type = 'GET', token) {
    console.log(`TEST: ${name}`);
    const start = Date.now();
    try {
        let res;
        if (type === 'GET') {
            res = await axios.get(`${BASE_URL}/products`, {
                params,
                headers: { Authorization: `Bearer ${token}` }
            });
        } else {
            res = await axios.post(`${BASE_URL}/products/advanced-search`, params, {
                headers: { Authorization: `Bearer ${token}` }
            });
        }
        const duration = Date.now() - start;
        console.log(`STATUS: ${res.status} | TIME: ${duration}ms | SUCCESS: ${res.data.success}`);
        
        let items = [];
        let total = 0;
        
        if (res.data.data) {
            const data = res.data.data;
            items = data.data || data.items || (Array.isArray(data) ? data : []);
            total = data.total !== undefined ? data.total : (data.pagination ? data.pagination.total : items.length);
        }
        
        if (res.data.success) {
            const data = res.data.data;
            if (data) {
                console.log(`DEBUG: data keys: [${Object.keys(data).join(', ')}]`);
                if (data.data) {
                    console.log(`DEBUG: data.data type: ${typeof data.data}, isArray: ${Array.isArray(data.data)}`);
                    if (Array.isArray(data.data)) console.log(`DEBUG: data.data length: ${data.data.length}`);
                }
            }
        }
        
        console.log(`ITEMS: ${items.length} | TOTAL: ${total}`);
        if (items.length > 0) {
            console.log(`SAMPLE: ${items[0].name} (SKU: ${items[0].sku})`);
            if (items[0].variants && items[0].variants.length > 0) {
                console.log(`VARIANTS: ${items[0].variants.length}`);
            }
        }
    } catch (err) {
        console.error(`FAILED: ${err.message}`);
        if (err.response) {
            console.error(`BODY: ${JSON.stringify(err.response.data)}`);
        }
    }
    console.log('-------------------');
}

async function runTests() {
    const token = await login();
    if (!token) return;

    // await testApi('Basic Product List', { per_page: 5 }, 'GET', token);
    // await testApi('Grouped by SKU', { per_page: 5, group_by_sku: 'true' }, 'GET', token);
    // await testApi('Search "Nike"', { search: 'Nike', per_page: 5 }, 'GET', token);
    await testApi('Advanced Search "Nike"', { query: 'Nike', per_page: 5 }, 'POST', token);
    // await testApi('Category Filter (ID 1)', { category_id: 1, per_page: 5 }, 'GET', token);
    // await testApi('Vendor Filter (ID 1)', { vendor_id: 1, per_page: 5 }, 'GET', token);
    // await testApi('Price Filter (1000-5000)', { min_price: 1000, max_price: 5000, per_page: 5 }, 'GET', token);
    // await testApi('In Stock Filter', { stock_status: 'in_stock', per_page: 5 }, 'GET', token);
    // await testApi('Out of Stock Filter', { stock_status: 'not_in_stock', per_page: 5 }, 'GET', token);
    // await testApi('Sort by Price DESC', { sort_by: 'price', sort_direction: 'desc', per_page: 5 }, 'GET', token);
}

runTests();
