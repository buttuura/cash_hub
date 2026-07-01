const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8000;
const API_URLS = ['http://localhost:3000'];

const categories = [
  { id: 'food', name: 'Food & Beverages' },
  { id: 'clothing', name: 'Clothing' },
  { id: 'electronics', name: 'Electronics' },
  { id: 'services', name: 'Services' },
  { id: 'home-garden', name: 'Home & Garden' },
  { id: 'health-beauty', name: 'Health & Beauty' },
];

const products = [
  { id: 1, title: 'Fresh Tomatoes', description: 'Organic tomatoes from local farms', price: 5000, category: 'food', image_url: '/api/placeholder/400/300', sellerName: 'John Doe', createdAt: new Date().toISOString(), sold_out: false },
  { id: 2, title: 'Maize Flour', description: 'Premium maize flour 2kg', price: 8000, category: 'food', image_url: '/api/placeholder/400/300', sellerName: 'Jane Smith', createdAt: new Date().toISOString(), sold_out: false },
  { id: 3, title: 'Secondhand Laptop', description: 'Dell Latitude, 8GB RAM', price: 450000, category: 'electronics', image_url: '/api/placeholder/400/300', sellerName: 'Tech Dealer', createdAt: new Date().toISOString(), sold_out: false },
  { id: 4, title: 'Casual Shirt', description: 'Cotton shirt size M', price: 25000, category: 'clothing', image_url: '/api/placeholder/400/300', sellerName: 'Fashion Hub', createdAt: new Date().toISOString(), sold_out: true },
  { id: 5, title: 'House Cleaning', description: 'Professional home cleaning service', price: 30000, category: 'services', image_url: '/api/placeholder/400/300', sellerName: 'CleanPro', createdAt: new Date().toISOString(), sold_out: false },
  { id: 6, title: 'Garden Tools Set', description: 'Basic gardening tools', price: 120000, category: 'home-garden', image_url: '/api/placeholder/400/300', sellerName: 'GreenThumb', createdAt: new Date().toISOString(), sold_out: false },
];

const orders = [];
let nextId = 7;

function getBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
    });
  });
}

function sendJSON(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    });
    res.end();
    return;
  }

  const pathname = url.pathname;

  if (pathname === '/api/categories' || pathname === '/api/categories/') {
    sendJSON(res, 200, categories);
    return;
  }

  if (pathname === '/api/products' || pathname === '/api/products/') {
    sendJSON(res, 200, products);
    return;
  }

  if (pathname === '/api/placeholder' || pathname.startsWith('/api/placeholder/')) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="#E8F0E3"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#4B5A45" font-family="sans-serif" font-size="14">No Image</text></svg>`;
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Access-Control-Allow-Origin': '*' });
    res.end(svg);
    return;
  }

  if (pathname === '/api/auth/me') {
    sendJSON(res, 200, { id: 'mock-user', name: 'Test User', email: 'test@example.com', role: 'member' });
    return;
  }

  if (pathname === '/api/orders' && req.method === 'GET') {
    sendJSON(res, 200, orders);
    return;
  }

  if (pathname === '/api/orders' && req.method === 'POST') {
    const body = await getBody(req);
    const order = { id: nextId++, ...body, status: 'pending', createdAt: new Date().toISOString() };
    orders.push(order);
    sendJSON(res, 200, order);
    return;
  }

  if (pathname === '/api/products/me' && req.method === 'GET') {
    sendJSON(res, 200, products);
    return;
  }

  if (pathname === '/api/stats/group') {
    sendJSON(res, 200, { balance: 1500000, members_count: 25 });
    return;
  }

  if (pathname === '/api/stats/rules') {
    sendJSON(res, 200, { contribution_amount: 50000, interest_rate: 5, max_loan_multiplier: 3 });
    return;
  }

  if (pathname === '/api/stats/financial') {
    sendJSON(res, 200, { total_deposits: 5000000, total_loans: 2000000, total_withdrawals: 500000 });
    return;
  }

  if (pathname === '/api/deposits') {
    sendJSON(res, 200, []);
    return;
  }

  if (pathname === '/api/loans') {
    sendJSON(res, 200, []);
    return;
  }

  if (pathname === '/api/withdrawals') {
    sendJSON(res, 200, []);
    return;
  }

  if (pathname === '/api/members') {
    sendJSON(res, 200, [{ id: 1, name: 'Test User', email: 'test@example.com', role: 'member' }]);
    return;
  }

  if (pathname === '/api/quick-loans' && req.method === 'GET') {
    sendJSON(res, 200, []);
    return;
  }

  if (pathname === '/api/quick-loans/valid-codes') {
    sendJSON(res, 200, { valid: true });
    return;
  }

  sendJSON(res, 404, { detail: 'Not Found' });
});

server.listen(PORT, () => {
  console.log(`Mock API server running at http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop');
});
