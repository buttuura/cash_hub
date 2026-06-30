import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Toaster, toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { ShoppingCart, Search, Menu, X, Sparkles } from 'lucide-react';
import ProductCard from '../components/ProductCard';
import { exportLoanAgreementPDF } from '../utils/pdfExport';
import { OFFICERS } from '../data/officers';

const ICON_MAP = {
  'food': Sparkles,
  'construction-materials': Sparkles,
  'graphic-material': Sparkles,
  'electronics': Sparkles,
  'clothing': Sparkles,
  'health-beauty': Sparkles,
  'home-garden': Sparkles,
  'books': Sparkles,
  'sports': Sparkles,
  'toys': Sparkles,
  'services': Sparkles,
};

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const PRODUCTS_PER_PAGE = 100;

const DEFAULT_CATEGORIES = [
  { id: 'food', name: 'Food' },
  { id: 'construction-materials', name: 'Construction Materials' },
  { id: 'graphic-material', name: 'Graphic Material' },
  { id: 'electronics', name: 'Electronics' },
  { id: 'clothing', name: 'Clothing' },
  { id: 'health-beauty', name: 'Health & Beauty' },
  { id: 'home-garden', name: 'Home & Garden' },
  { id: 'books', name: 'Books' },
  { id: 'sports', name: 'Sports' },
  { id: 'toys', name: 'Toys' },
  { id: 'services', name: 'Services' },
];

const extractPersonName = (label) => {
  if (!label) return 'Member';
  const match = label.match(/^(?:Officer\s*-\s*)?(.+?)\s*\(/);
  return match ? match[1].trim() : label;
};

const CategoryPage = () => {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const initialSearch = searchParams.get('search') || '';
  const { user, isAuthenticated } = useAuth();
  const [categories] = useState(DEFAULT_CATEGORIES);
  const [products, setProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [displayCount, setDisplayCount] = useState(PRODUCTS_PER_PAGE);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(categoryId || 'all');
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem('cash_hub_cart') || '[]'); }
    catch { return []; }
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [quickLoanOpen, setQuickLoanOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseProduct, setPurchaseProduct] = useState(null);

  const [loanName, setLoanName] = useState('');
  const [loanEmail, setLoanEmail] = useState('');
  const [loanPhone, setLoanPhone] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [loanPurpose, setLoanPurpose] = useState('');
  const [collateral, setCollateral] = useState('');
  const [loanType, setLoanType] = useState('guaranteed');
  const [loanIsGuaranteed, setLoanIsGuaranteed] = useState(true);
  const [serialNumber, setSerialNumber] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [collateralImage, setCollateralImage] = useState(null);
  const [collateralImagePreview, setCollateralImagePreview] = useState('');
  const [officerCode, setOfficerCode] = useState('');
  const [validOfficerCodes, setValidOfficerCodes] = useState([]);
  const [loanRequestSubmitted, setLoanRequestSubmitted] = useState(false);
  const [loanRequestData, setLoanRequestData] = useState(null);
  const [orderSubmitting, setOrderSubmitting] = useState(false);

  const [purchaseName, setPurchaseName] = useState('');
  const [purchaseEmail, setPurchaseEmail] = useState('');
  const [purchasePhone, setPurchasePhone] = useState('');
  const [purchaseNote, setPurchaseNote] = useState('');

  useEffect(() => { setLoanIsGuaranteed(loanType === 'guaranteed'); }, [loanType]);
  useEffect(() => { if (!quickLoanOpen) return; let cancelled = false; (async () => { try { const res = await axios.get(`${API_URL}/api/quick-loans/valid-codes`); if (!cancelled && Array.isArray(res.data?.all)) setValidOfficerCodes(res.data.all); } catch { if (!cancelled) setValidOfficerCodes([]); } })(); return () => { cancelled = true; }; }, [quickLoanOpen]);

  useEffect(() => { window.localStorage.setItem('cash_hub_cart', JSON.stringify(cart)); }, [cart]);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/products`);
        if (Array.isArray(response.data)) setProducts(response.data);
      } catch (error) {
        console.warn('Failed to load products', error);
      }
    };
    fetchProducts();
  }, []);

  useEffect(() => {
    const urlSearch = searchParams.get('search') || '';
    setDisplayCount(PRODUCTS_PER_PAGE);
    setSearchQuery(urlSearch);
    setSelectedCategory(categoryId || 'all');
  }, [categoryId, location.search]);

  const saveCart = (items) => { window.localStorage.setItem('cash_hub_cart', JSON.stringify(items)); };

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      const newCart = existing ? prev.map(item => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item) : [...prev, { productId: product.id, quantity: 1, product }];
      saveCart(newCart);
      return newCart;
    });
    toast.success(`${product.title} added to cart`);
  };

  const removeFromCart = (productId) => {
    setCart(prev => { const newCart = prev.filter(item => item.productId !== productId); saveCart(newCart); return newCart; });
  };

  const updateCartQuantity = (productId, quantity) => {
    if (quantity <= 0) { removeFromCart(productId); return; }
    setCart(prev => { const newCart = prev.map(item => item.productId === productId ? { ...item, quantity } : item); saveCart(newCart); return newCart; });
  };

  const getCartTotal = () => cart.reduce((total, item) => total + item.product.price * item.quantity, 0);
  const getCartItemsBySeller = () => { const sellers = {}; cart.forEach(item => { const seller = item.product.sellerName || item.product.seller_name || 'Member'; if (!sellers[seller]) sellers[seller] = []; sellers[seller].push(item); }); return sellers; };

  const submitOrder = async (orderData) => {
    const headers = { Authorization: `Bearer ${localStorage.getItem('access_token')}` };
    const response = await axios.post(`${API_URL}/api/orders`, orderData, { headers });
    return response.data;
  };

  const handleCartCheckout = async () => {
    if (!cartBuyerName.trim() || !cartBuyerPhone.trim()) { toast.error('Please enter your name and phone number'); return; }
    setOrderSubmitting(true);
    const sellersMap = getCartItemsBySeller();
    try {
      await Promise.all(
        Object.entries(sellersMap).map(([seller, items]) => {
          const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
          return submitOrder({
            products: items.map(i => ({ productId: i.productId, quantity: i.quantity, title: i.product.title, price: i.product.price })),
            sellerName: seller,
            buyerName: cartBuyerName.trim(),
            buyerEmail: cartBuyerEmail.trim(),
            buyerPhone: cartBuyerPhone.trim(),
            note: cartBuyerNote.trim(),
            total,
            status: 'pending',
          });
        })
      );
      setCart([]); saveCart([]); setCartOpen(false); setCartBuyerName(''); setCartBuyerEmail(''); setCartBuyerPhone(''); setCartBuyerNote('');
      toast.success(`Orders sent to ${Object.keys(sellersMap).length} seller(s).`);
    } catch (error) {
      console.error('Failed to submit orders:', error);
      toast.error(error.response?.data?.detail || 'Failed to submit orders');
    } finally {
      setOrderSubmitting(false);
    }
  };

  const [cartBuyerName, setCartBuyerName] = useState('');
  const [cartBuyerEmail, setCartBuyerEmail] = useState('');
  const [cartBuyerPhone, setCartBuyerPhone] = useState('');
  const [cartBuyerNote, setCartBuyerNote] = useState('');

  const handleRequestQuickLoan = async (e) => {
    e.preventDefault();
    if (!loanName.trim() || !loanEmail.trim() || !loanAmount.trim()) { toast.error('Please fill your name, email and loan amount'); return; }
    if (Number(loanAmount) <= 0) { toast.error('Loan amount must be greater than 0'); return; }
    const validEntry = validOfficerCodes.find(v => v.code === officerCode) || null;
    const staticOfficer = OFFICERS.find(o => o.code === officerCode) || null;
    const officer = validEntry ? { name: extractPersonName(validEntry.label), code: validEntry.code } : staticOfficer ? { name: staticOfficer.name, code: staticOfficer.code } : null;
    if (loanIsGuaranteed && !officer) { toast.error('Please enter a valid officer code'); return; }
    if (!loanIsGuaranteed && !collateral.trim()) { toast.error('Please provide collateral details'); return; }
    try {
      const formData = new FormData();
      formData.append('loan_name', loanName.trim());
      formData.append('loan_email', loanEmail.trim());
      formData.append('loan_phone', loanPhone.trim());
      formData.append('amount', String(Number(loanAmount)));
      formData.append('purpose', loanPurpose.trim());
      formData.append('collateral', collateral.trim());
      formData.append('is_guaranteed', String(loanIsGuaranteed));
      formData.append('officer_code', officerCode || '');
      formData.append('officer_name', officer?.name || '');
      formData.append('serial_number', serialNumber || '');
      formData.append('buyer_name', buyerName.trim() || '');
      if (!loanIsGuaranteed && collateralImage) formData.append('collateral_image', collateralImage);
      const headers = isAuthenticated ? { Authorization: `Bearer ${localStorage.getItem('access_token')}` } : {};
      const response = await axios.post(`${API_URL}/api/quick-loans/request`, formData, { headers });
      setLoanRequestSubmitted(true);
      setLoanRequestData(response.data);
      toast.success('Quick loan request submitted!');
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.detail || 'Failed to submit request');
    }
  };

  const handleDownloadLoanAgreement = async () => {
    if (!loanRequestData) return;
    const officer = OFFICERS.find((o) => o.code === loanRequestData.officerCode) || (loanRequestData.officer_name ? { name: loanRequestData.officer_name, code: loanRequestData.officerCode } : null);
    await exportLoanAgreementPDF(loanRequestData, officer, { download: true, collateralImage: collateralImagePreview });
  };

  const resetQuickLoanDialogState = () => {
    setLoanRequestSubmitted(false); setLoanRequestData(null); setLoanName(''); setLoanEmail(''); setLoanPhone(''); setLoanAmount(''); setLoanPurpose(''); setCollateral(''); setSerialNumber(''); setBuyerName(''); setCollateralImage(null); setCollateralImagePreview(''); setOfficerCode('');
  };

  const handlePurchaseRequest = async (e) => {
    e.preventDefault();
    if (!purchaseName.trim() || !purchasePhone.trim()) { toast.error('Please enter your name and phone number'); return; }
    if (!purchaseProduct) { toast.error('No product selected'); return; }
    try {
      await submitOrder({
        productId: purchaseProduct.id,
        productTitle: purchaseProduct.title,
        productPrice: purchaseProduct.price,
        sellerName: purchaseProduct.sellerName || purchaseProduct.seller_name || 'Member',
        buyerName: purchaseName.trim(),
        buyerEmail: purchaseEmail.trim(),
        buyerPhone: purchasePhone.trim(),
        note: purchaseNote.trim(),
        status: 'pending',
      });
      toast.success('Order request sent. The seller will contact you by phone.');
      setPurchaseOpen(false); setPurchaseName(''); setPurchaseEmail(''); setPurchasePhone(''); setPurchaseNote('');
    } catch (error) {
      console.error('Failed to submit purchase request:', error);
      toast.error(error.response?.data?.detail || 'Failed to submit request');
    }
  };

  const handleOpenPurchase = (product) => { setPurchaseProduct(product); setPurchaseOpen(true); };
  const getImageUrl = (imageUrl) => { if (!imageUrl) return null; return imageUrl.startsWith('http') ? imageUrl : `${API_URL}${imageUrl}`; };

  const category = categories.find(c => c.id === categoryId);
  const categoryProducts = products.filter(p => p.category === categoryId || (categoryId === 'all'));
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredProducts = categoryProducts.filter((product) => {
    const matchesSearch = !normalizedSearch || product.title.toLowerCase().includes(normalizedSearch) || product.description?.toLowerCase().includes(normalizedSearch) || (product.sellerName || product.seller_name || '').toLowerCase().includes(normalizedSearch);
    return matchesSearch;
  }).sort((a, b) => new Date(b.createdAt || b.created_at) - new Date(a.createdAt || a.created_at));
  const visibleProducts = filteredProducts.slice(0, displayCount);
  const hasMore = displayCount < filteredProducts.length;

  const handleSearch = () => {
    if (searchQuery.trim()) {
      navigate(`/category/all?search=${encodeURIComponent(searchQuery.trim())}`, { replace: true });
    }
  };

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'Enter' && searchQuery.trim()) {
        handleSearch();
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [searchQuery, navigate]);

return (
    <div className="min-h-screen bg-[#F7FAF3] px-4 py-8 sm:px-6 lg:px-8">
      <Toaster position="top-right" />

      <nav className="sticky top-0 z-40 backdrop-blur border-b border-slate-200 mb-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="hidden md:flex items-center justify-between h-16">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <Button onClick={() => navigate('/')} className="bg-white text-[#172B12] border border-slate-200 hover:bg-[#ECF8E9]">Shop</Button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition ${selectedCategory === 'all' ? 'bg-[#172B12] text-white' : 'bg-white text-[#172B12] border border-slate-200 hover:bg-[#ECF8E9]'}`}
                  >
                    <Menu className="h-4 w-4" />
                    All Categories
                  </button>
                  
                  {mobileMenuOpen && (
                    <div className="absolute left-0 top-full mt-2 w-80 max-h-96 bg-white border border-slate-200 rounded-lg shadow-lg p-4 overflow-y-auto">
                      <div className="flex flex-col gap-2">
                        {categories.map((cat) => {
                          const Icon = ICON_MAP[cat.id] || Sparkles;
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => { navigate(`/category/${cat.id}`); setMobileMenuOpen(false); }}
                              className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium text-left transition ${categoryId === cat.id ? 'bg-[#172B12] text-white' : 'bg-white text-[#172B12] border border-slate-200 hover:bg-[#ECF8E9]'}`}
                            >
                              <Icon className="h-4 w-4" />
                              {cat.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                
                {categories.slice(0, 5).map((cat) => {
                  const Icon = ICON_MAP[cat.id] || Sparkles;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => { navigate(`/category/${cat.id}`); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition ${categoryId === cat.id ? 'bg-[#172B12] text-white' : 'bg-white text-[#172B12] border border-slate-200 hover:bg-[#ECF8E9]'}`}
                    >
                      <Icon className="h-4 w-4" />
                      {cat.name}
                    </button>
                  );
                })}
              </div>
              
              <div className="flex items-center gap-2 mt-3">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search products..."
                  className="w-64 rounded-full border border-slate-300 bg-[#F7FAF3] px-4 py-2 text-sm focus:border-[#2B6F38] focus:ring-2 focus:ring-[#2B6F38]/20"
                />
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button onClick={() => setCartOpen(true)} className="bg-white text-[#172B12] border border-[#172B12] hover:bg-[#ECF8E9] relative">
                <ShoppingCart className="h-4 w-4 mr-2" />
                Cart ({cart.length})
              </Button>
            </div>
          </div>
          
          <div className="flex md:hidden items-center justify-between py-2">
            <button type="button" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-[#172B12]">
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
            <Button onClick={() => navigate('/')} className="bg-white text-[#172B12] border border-slate-200 hover:bg-[#ECF8E9]">Shop</Button>
            <Button onClick={() => setCartOpen(true)} className="bg-white text-[#172B12] border border-[#172B12] hover:bg-[#ECF8E9] relative">
              <ShoppingCart className="h-4 w-4 mr-2" />
              Cart ({cart.length})
            </Button>
          </div>
          
          {mobileMenuOpen && (
            <div className="md:hidden pb-4 space-y-4 overflow-y-auto max-h-96 w-full">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                className="rounded-full border border-slate-300 bg-[#F7FAF3] px-4 py-2 text-sm"
              />
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                <button type="button" onClick={() => { navigate('/'); setMobileMenuOpen(false); }} className="px-3 py-2 rounded-full text-sm font-medium text-left bg-white text-[#172B12] border border-slate-200 hover:bg-[#ECF8E9]">Shop</button>
                {categories.map(cat => {
                  const Icon = ICON_MAP[cat.id] || Sparkles;
                  return (
                    <button key={cat.id} type="button" onClick={() => { navigate(`/category/${cat.id}`); setMobileMenuOpen(false); }} className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium text-left ${cat.id === categoryId ? 'bg-[#172B12] text-white' : 'bg-white text-[#172B12] border border-slate-200 hover:bg-[#ECF8E9]'}`}>
                      <Icon className="h-4 w-4" />
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </nav>

      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-[#172B12]">
            {categoryId === 'all' && searchQuery.trim()
              ? `Search results for "${searchQuery.trim()}"`
              : category?.name || 'All Products'}
          </h1>
        </div>

{filteredProducts.length === 0 ? (
            <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm text-center py-12">
              <CardContent>
                <div className="flex flex-col items-center">
                  <svg className="w-16 h-16 text-[#4B5A45] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h14l-1.35 6.75a2 2 0 01-2 1.25H7a2 2 0 01-2-2V5a2 2 0 012-2h14m-5 14a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" /></svg>
                  <p className="text-base text-[#4B5A45]">
                    {categoryId === 'all' && searchQuery.trim()
                      ? 'No products match your search. Try different keywords.'
                      : 'No products found in this category yet.'}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
{visibleProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    getImageUrl={getImageUrl}
                    onAddToCart={addToCart}
                    onBuyNow={handleOpenPurchase}
                  />
                ))}
              </div>

              {hasMore && (
                <div className="flex justify-center pt-6">
                  <Button onClick={() => setDisplayCount(prev => prev + PRODUCTS_PER_PAGE)} className="bg-[#172B12] text-white hover:bg-[#0f2409] px-8 shadow-sm">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                    See more ({filteredProducts.length - displayCount} remaining)
                  </Button>
                </div>
              )}
            </>
          )}
      </div>

      <Dialog open={quickLoanOpen} onOpenChange={(open) => { if (!open) resetQuickLoanDialogState(); setQuickLoanOpen(open); }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
          <DialogHeader><DialogTitle>Request a quick loan</DialogTitle><DialogDescription>Fill in your contact details and we will follow up with loan terms.</DialogDescription></DialogHeader>
          <div className="overflow-y-auto flex-1 px-1">
            {loanRequestSubmitted ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-lg font-semibold text-[#172B12]">Loan request received</p>
                  <p className="mt-2 text-sm text-slate-600">Your quick loan request has been submitted to the treasurer for approval.</p>
                  <div className="mt-4 text-sm text-slate-700">
                    <p><span className="font-semibold">Name:</span> {loanRequestData?.loanName || loanRequestData?.loan_name}</p>
                    <p><span className="font-semibold">Email:</span> {loanRequestData?.loanEmail || loanRequestData?.loan_email}</p>
                    <p><span className="font-semibold">Phone:</span> {loanRequestData?.loanPhone || loanRequestData?.loan_phone || 'Not provided'}</p>
                    <p><span className="font-semibold">Amount:</span> UGX {Number(loanRequestData?.loanAmount || loanRequestData?.amount || 0).toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <Button type="button" className="bg-[#172B12] text-white hover:bg-[#0f2409]" onClick={handleDownloadLoanAgreement}>Download loan agreement</Button>
                  <Button type="button" className="border border-slate-300 text-slate-700 hover:bg-slate-100" onClick={() => setQuickLoanOpen(false)}>Close</Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleRequestQuickLoan} className="space-y-4">
                <div className="mb-4">
                  <Label className="text-sm font-medium text-slate-700">Loan type</Label>
                  <div className="flex items-center gap-4 mt-2">
                    <label className="inline-flex items-center"><input type="radio" name="loan-type" checked={loanType === 'guaranteed'} onChange={() => setLoanType('guaranteed')} className="mr-2" /><span className="ml-2">Guaranteed</span></label>
                    <label className="inline-flex items-center"><input type="radio" name="loan-type" checked={loanType === 'collateral-backed'} onChange={() => setLoanType('collateral-backed')} className="mr-2" /><span className="ml-2">Collateral-Backed</span></label>
                  </div>
                </div>
                <div className="space-y-2"><Label htmlFor="loan-name" className="text-sm font-medium text-slate-700">Full name</Label><Input id="loan-name" value={loanName} onChange={(e) => setLoanName(e.target.value)} placeholder="Your name" required /></div>
                <div className="space-y-2"><Label htmlFor="loan-email" className="text-sm font-medium text-slate-700">Email</Label><Input id="loan-email" type="email" value={loanEmail} onChange={(e) => setLoanEmail(e.target.value)} placeholder="you@example.com" required /></div>
                <div className="space-y-2"><Label htmlFor="loan-phone" className="text-sm font-medium text-slate-700">Phone number</Label><Input id="loan-phone" value={loanPhone} onChange={(e) => setLoanPhone(e.target.value)} placeholder="07XXXXXXXX" required /></div>
                <div className="space-y-2"><Label htmlFor="buyer-name" className="text-sm font-medium text-slate-700">Buyer Name</Label><Input id="buyer-name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Enter buyer's full name" /></div>
                <div className="space-y-2"><Label htmlFor="loan-amount" className="text-sm font-medium text-slate-700">{loanType === 'guaranteed' ? 'Loan amount (UGX)' : 'Selling Price (UGX)'}</Label><Input id="loan-amount" type="number" value={loanAmount} onChange={(e) => setLoanAmount(e.target.value)} placeholder="e.g. 100000" required /></div>
                {loanType === 'guaranteed' && (
                  <>
                    <div className="space-y-2"><Label htmlFor="loan-purpose" className="text-sm font-medium text-slate-700">Loan purpose</Label><Textarea id="loan-purpose" value={loanPurpose} onChange={(e) => setLoanPurpose(e.target.value)} placeholder="Tell us why you need this loan" required /></div>
                    <div className="space-y-2"><Label htmlFor="officer-code" className="text-sm font-medium text-slate-700">Officer Code</Label><Input id="officer-code" value={officerCode} onChange={(e) => setOfficerCode(e.target.value)} placeholder="Enter officer code" required /></div>
                  </>
                )}
                {loanType === 'collateral-backed' && (
                  <>
                    <div className="space-y-2"><Label htmlFor="loan-collateral" className="text-sm font-medium text-slate-700">Item Name</Label><Textarea id="loan-collateral" value={collateral} onChange={(e) => setCollateral(e.target.value)} placeholder="e.g. iPhone 13, HP Laptop" required rows={2} /></div>
                    <div className="space-y-2"><Label htmlFor="serial-number" className="text-sm font-medium text-slate-700">Serial Number</Label><Input id="serial-number" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} placeholder="Serial/IMEI" /></div>
                    <div className="space-y-2"><Label htmlFor="collateral-image" className="text-sm font-medium text-slate-700">Item Photo</Label><Input id="collateral-image" type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) { setCollateralImage(file); const reader = new FileReader(); reader.onloadend = () => setCollateralImagePreview(reader.result); reader.readAsDataURL(file); } }} required />{collateralImagePreview && <img src={collateralImagePreview} alt="preview" className="mt-2 h-24 w-24 object-cover rounded" />}</div>
                  </>
                )}
                <Button type="submit" className="w-full">Submit Request</Button>
              </form>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={purchaseOpen} onOpenChange={setPurchaseOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto flex flex-col">
          <DialogHeader><DialogTitle>Purchase request</DialogTitle><DialogDescription>Send your contact details so the seller can follow up.</DialogDescription></DialogHeader>
          <form onSubmit={handlePurchaseRequest} className="space-y-4 flex-1">
            <div className="text-sm text-[#4B5A45]"><p className="font-semibold text-[#172B12]">Product</p><p>{purchaseProduct?.title}</p><p className="text-xs text-[#6B7C61]">Seller: {purchaseProduct?.sellerName}</p></div>
            <div className="space-y-2"><Label htmlFor="purchase-name" className="text-sm font-medium text-slate-700">Your name</Label><Input id="purchase-name" value={purchaseName} onChange={(e) => setPurchaseName(e.target.value)} placeholder="Your name" /></div>
            <div className="space-y-2"><Label htmlFor="purchase-email" className="text-sm font-medium text-slate-700">Email</Label><Input id="purchase-email" value={purchaseEmail} onChange={(e) => setPurchaseEmail(e.target.value)} placeholder="you@example.com" /></div>
            <div className="space-y-2"><Label htmlFor="purchase-phone" className="text-sm font-medium text-slate-700">Phone number</Label><Input id="purchase-phone" value={purchasePhone} onChange={(e) => setPurchasePhone(e.target.value)} placeholder="e.g. 0771 234567" required /></div>
            <div className="space-y-2"><Label htmlFor="purchase-note" className="text-sm font-medium text-slate-700">Message</Label><Textarea id="purchase-note" value={purchaseNote} onChange={(e) => setPurchaseNote(e.target.value)} placeholder="Write a short message to the seller" rows={4} /></div>
            <Button type="submit" className="bg-[#172B12] text-white hover:bg-[#0f2409]">{orderSubmitting ? 'Sending request...' : 'Send purchase request'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto flex flex-col">
          <DialogHeader><DialogTitle>Shopping Cart</DialogTitle><DialogDescription>Review your cart and checkout.</DialogDescription></DialogHeader>
          <div className="space-y-4 flex-1">
            {cart.length === 0 ? <p className="text-sm text-[#4B5A45]">Your cart is empty.</p> : (
              <>
                <div className="space-y-4">
                  {Object.entries(getCartItemsBySeller()).map(([seller, items]) => (
                    <div key={seller} className="rounded-lg border border-slate-200 p-3">
                      <p className="text-sm font-semibold text-[#172B12]">Seller: {seller}</p>
                      <p className="text-xs text-[#6B7C61] mb-2">Total: UGX {items.reduce((sum, item) => sum + item.product.price * item.quantity, 0).toLocaleString()}</p>
                      {items.map(item => (
                        <div key={item.productId} className="flex items-center justify-between py-2 border-t border-slate-100">
                          <div className="flex-1"><p className="text-sm font-medium text-[#172B12]">{item.product.title}</p><p className="text-xs text-[#4B5A45]">UGX {Number(item.product.price).toLocaleString()} x {item.quantity}</p></div>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => updateCartQuantity(item.productId, item.quantity - 1)} className="px-2 py-1 text-xs border border-slate-300 rounded">-</button>
                            <span className="text-xs px-2">{item.quantity}</span>
                            <button type="button" onClick={() => updateCartQuantity(item.productId, item.quantity + 1)} className="px-2 py-1 text-xs border border-slate-300 rounded">+</button>
                            <button type="button" onClick={() => removeFromCart(item.productId)} className="ml-2 text-xs text-red-600 hover:text-red-800">Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="border-t border-slate-200 pt-4"><p className="text-lg font-semibold text-[#172B12]">Grand Total: UGX {getCartTotal().toLocaleString()}</p></div>
                <div className="space-y-2"><Label htmlFor="cart-name" className="text-sm font-medium text-slate-700">Your name</Label><Input id="cart-name" value={cartBuyerName} onChange={(e) => setCartBuyerName(e.target.value)} placeholder="Your name" /></div>
                <div className="space-y-2"><Label htmlFor="cart-email" className="text-sm font-medium text-slate-700">Email</Label><Input id="cart-email" value={cartBuyerEmail} onChange={(e) => setCartBuyerEmail(e.target.value)} placeholder="you@example.com" /></div>
                <div className="space-y-2"><Label htmlFor="cart-phone" className="text-sm font-medium text-slate-700">Phone number</Label><Input id="cart-phone" value={cartBuyerPhone} onChange={(e) => setCartBuyerPhone(e.target.value)} placeholder="e.g. 0771 234567" required /></div>
                <div className="space-y-2"><Label htmlFor="cart-note" className="text-sm font-medium text-slate-700">Message to sellers</Label><Textarea id="cart-note" value={cartBuyerNote} onChange={(e) => setCartBuyerNote(e.target.value)} placeholder="Write a message to all sellers" rows={3} /></div>
                <Button onClick={handleCartCheckout} className="bg-[#172B12] text-white hover:bg-[#0f2409]" disabled={cart.length === 0}>{orderSubmitting ? 'Sending requests...' : `Send orders to ${Object.keys(getCartItemsBySeller()).length} seller(s)`}</Button>
              </>
            )}
</div>
          </DialogContent>
        </Dialog>
      </div>
   );
};

export default CategoryPage;
