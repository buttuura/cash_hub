import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { renderMatches, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { Toaster, toast } from 'sonner';
import { ShoppingCart, FastForward, Cpu, Sparkles, ShoppingBag, HardHat, PenTool, Shirt, HeartPulse, Home, BookOpen, Dumbbell, Gamepad2, Briefcase, Menu, X, Search } from 'lucide-react';
import ProductCard from '../components/ProductCard';
import { SellProductsCard } from '../components/AddProductDialog';
import { exportLoanAgreementPDF } from '../utils/pdfExport';
import { OFFICERS } from '../data/officers';
import { resolveImageUrl } from '../lib/utils';

const ICON_MAP = {
  'food': ShoppingBag,
  'construction-materials': HardHat,
  'graphic-material': PenTool,
  'electronics': Cpu,
  'clothing': Shirt,
  'health-beauty': HeartPulse,
  'home-garden': Home,
  'books': BookOpen,
  'sports': Dumbbell,
  'toys': Gamepad2,
  'services': Briefcase,
  'default': Sparkles,
};

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';

const DEFAULT_CATEGORIES = [
  {
    id: 'food',
    name: 'Food',
    description: 'Fresh meals, groceries and snacks sold by group members.',
  },
  {
    id: 'construction-materials',
    name: 'Construction Materials',
    description: 'Tools, cement, timber and supplies from trusted community sellers.',
  },
  {
    id: 'graphic-material',
    name: 'Graphic Material',
    description: 'Design assets, prints and creative services for businesses.',
  },
  {
    id: 'electronics',
    name: 'Electronics',
    description: 'Gadgets, accessories and tech items available from members.',
  },
  {
    id: 'clothing',
    name: 'Clothing',
    description: 'Apparel, shoes and fashion accessories from community sellers.',
  },
  {
    id: 'health-beauty',
    name: 'Health & Beauty',
    description: 'Personal care, cosmetics, and wellness products.',
  },
  {
    id: 'home-garden',
    name: 'Home & Garden',
    description: 'Furniture, decor, and gardening supplies.',
  },
  {
    id: 'books',
    name: 'Books',
    description: 'Educational materials, novels and study resources.',
  },
  {
    id: 'sports',
    name: 'Sports',
    description: 'Sports equipment, fitness gear and outdoor items.',
  },
  {
    id: 'toys',
    name: 'Toys',
    description: 'Games, toys and kids entertainment products.',
  },
  {
    id: 'services',
    name: 'Services',
    description: 'Professional services offered by group members.',
  },
];

const DEFAULT_PRODUCTS = [
  {
    id: 'prod-1',
    category: 'food',
    title: 'Fresh Farm Eggs',
    description: 'Pack of 30 farm-fresh eggs delivered locally.',
    price: 15000,
    sellerName: 'Jane Doe',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'prod-2',
    category: 'construction-materials',
    title: 'Quality Cement Bags',
    description: '50kg cement bags supplied by group members at wholesale rates.',
    price: 95000,
    sellerName: 'Samuel K.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'prod-3',
    category: 'graphic-material',
    title: 'Business Logo Design',
    description: 'Professional logo and branding package for startups.',
    price: 80000,
    sellerName: 'Amina A.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'prod-4',
    category: 'electronics',
    title: 'Wireless Earbuds',
    description: 'Bluetooth earbuds with charging case and warranty.',
    price: 120000,
    sellerName: 'David M.',
    createdAt: new Date().toISOString(),
  },
];

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const extractPersonName = (label) => {
  if (!label) return 'Member';
  const match = label.match(/^(?:Officer\s*-\s*)?(.+?)\s*\(/);
  return match ? match[1].trim() : label;
};

const ShopPage = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, isAdmin, isSeller } = useAuth();
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [selectedCategory, setSelectedCategory] = useState('food');
  const [products, setProducts] = useState(DEFAULT_PRODUCTS);
  const [orders, setOrders] = useState([]);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [quickLoanOpen, setQuickLoanOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loanName, setLoanName] = useState('');
  const [loanEmail, setLoanEmail] = useState('');
  const [loanPhone, setLoanPhone] = useState('');
  const [loanAddress, setLoanAddress] = useState('');
  const [loanCity, setLoanCity] = useState('');
  const [loanCurrency, setLoanCurrency] = useState('UGX');
  const [loanSecurity, setLoanSecurity] = useState('');
  const [loanGuarantorName, setLoanGuarantorName] = useState('');
  const [loanGuarantorAddress, setLoanGuarantorAddress] = useState('');
  const [loanJurisdiction, setLoanJurisdiction] = useState('Uganda');
  const [loanWitnessName, setLoanWitnessName] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [loanPurpose, setLoanPurpose] = useState('');
  const [collateral, setCollateral] = useState('');
  const [loanIsGuaranteed, setLoanIsGuaranteed] = useState(true);
  const [loanType, setLoanType] = useState('guaranteed'); 
  const [serialNumber, setSerialNumber] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [collateralImage, setCollateralImage] = useState(null);
  const [collateralImagePreview, setCollateralImagePreview] = useState('');
  const [officerCode, setOfficerCode] = useState('');
  const [nationalIdImages, setNationalIdImages] = useState([]);
  const [nationalIdPreviews, setNationalIdPreviews] = useState([]);
  const [repaymentPeriod, setRepaymentPeriod] = useState('2_weeks');
  const [validOfficerCodes, setValidOfficerCodes] = useState([]);
  const [loanRequestSubmitted, setLoanRequestSubmitted] = useState(false);
  useEffect(() => {
    setLoanIsGuaranteed(loanType === 'guaranteed');
  }, [loanType]);
  useEffect(() => {
    if (!quickLoanOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API_URL}/api/quick-loans/valid-codes`);
        if (!cancelled && Array.isArray(res.data?.all)) {
          setValidOfficerCodes(res.data.all);
        }
      } catch {
        if (!cancelled) setValidOfficerCodes([]);
      }
    })();
    return () => { cancelled = true; };
  }, [quickLoanOpen]);
  const [loanRequestData, setLoanRequestData] = useState(null);
  const [purchaseProduct, setPurchaseProduct] = useState(null);
  const [cart, setCart] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem('cash_hub_cart') || '[]');
    } catch {
      return [];
    }
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [purchaseName, setPurchaseName] = useState('');
  const [purchaseEmail, setPurchaseEmail] = useState('');
  const [purchasePhone, setPurchasePhone] = useState('');
  const [purchaseNote, setPurchaseNote] = useState('');
  const [cartBuyerName, setCartBuyerName] = useState('');
  const [cartBuyerEmail, setCartBuyerEmail] = useState('');
  const [cartBuyerPhone, setCartBuyerPhone] = useState('');
  const [cartBuyerNote, setCartBuyerNote] = useState('');
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const saveCart = (items) => {
    window.localStorage.setItem('cash_hub_cart', JSON.stringify(items));
  };

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      let newCart;
      if (existing) {
        newCart = prev.map(item =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      } else {
        newCart = [...prev, { productId: product.id, quantity: 1, product }];
      }
      saveCart(newCart);
      return newCart;
    });
    toast.success(`${product.title} added to cart`);
  };

  const removeFromCart = (productId) => {
    setCart(prev => {
      const newCart = prev.filter(item => item.productId !== productId);
      saveCart(newCart);
      return newCart;
    });
  };

  const updateCartQuantity = (productId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(prev => {
      const newCart = prev.map(item =>
        item.productId === productId ? { ...item, quantity } : item
      );
      saveCart(newCart);
      return newCart;
    });
  };

  const getCartTotal = () => {
    return cart.reduce((total, item) => total + item.product.price * item.quantity, 0);
  };

  const getCartItemsBySeller = () => {
    const sellers = {};
    cart.forEach(item => {
      const seller = item.product.sellerName || item.product.seller_name || 'Member';
      if (!sellers[seller]) {
        sellers[seller] = [];
      }
      sellers[seller].push(item);
    });
    return sellers;
  };

  const submitOrder = async (orderData) => {
    const headers = { Authorization: `Bearer ${localStorage.getItem('access_token')}` };
    const response = await axios.post(`${API_URL}/api/orders`, orderData, { headers });
    return response.data;
  };

  const fetchOrders = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/orders`, { headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` } });
      if (user?.name) {
        setOrders(res.data.filter(o => (o.sellerName || '').trim().toLowerCase() === (user.name || '').trim().toLowerCase()));
      } else {
        setOrders([]);
      }
    } catch (err) {
      console.warn('Unable to load orders:', err);
    }
  };

  const handleCartCheckout = async () => {
    if (!cartBuyerName.trim() || !cartBuyerPhone.trim()) {
      toast.error('Please enter your name and phone number');
      return;
    }

    setOrderSubmitting(true);

    try {
      await Promise.all(
        cart.map((item) => {
          const total = item.product.price * item.quantity;
          return submitOrder({
            products: [{ productId: item.productId, quantity: item.quantity, title: item.product.title, price: item.product.price }],
            productTitle: item.product.title,
            productPrice: item.product.price,
            sellerName: item.product.sellerName || item.product.seller_name || 'Member',
            buyerName: cartBuyerName.trim(),
            buyerEmail: cartBuyerEmail.trim(),
            buyerPhone: cartBuyerPhone.trim(),
            note: cartBuyerNote.trim(),
            total: total,
            status: 'pending',
          });
        })
      );

      setCart([]);
      saveCart([]);
      setCartBuyerName('');
      setCartBuyerEmail('');
      setCartBuyerPhone('');
      setCartBuyerNote('');
      setCartOpen(false);
      toast.success(`Sent ${cart.length} order(s). They will contact you by phone.`);
    } catch (error) {
      console.error('Failed to submit orders:', error);
      toast.error(error.response?.data?.detail || 'Failed to submit orders');
    } finally {
      setOrderSubmitting(false);
    }
  };

  const handleDownloadLoanAgreement = async () => {
    if (!loanRequestData) return;
    const officer = OFFICERS.find((o) => o.code === loanRequestData.officerCode)
      || (loanRequestData.officer_name ? { name: loanRequestData.officer_name, code: loanRequestData.officerCode } : null);
    await exportLoanAgreementPDF(loanRequestData, officer, {
      download: true,
      collateralImage: collateralImagePreview,
      nationalIdImages: nationalIdPreviews,
      borrowerAddress: loanAddress,
      borrowerCity: loanCity,
      currency: loanCurrency,
      security: loanSecurity,
      guarantorName: loanGuarantorName,
      guarantorAddress: loanGuarantorAddress,
      jurisdiction: loanJurisdiction,
      witnessName: loanWitnessName,
    });
  };

  const resetQuickLoanDialogState = () => {
    setLoanRequestSubmitted(false);
    setLoanRequestData(null);
    setLoanName('');
    setLoanEmail('');
    setLoanPhone('');
    setLoanAddress('');
    setLoanCity('');
    setLoanCurrency('UGX');
    setLoanSecurity('');
    setLoanGuarantorName('');
    setLoanGuarantorAddress('');
    setLoanJurisdiction('Uganda');
    setLoanWitnessName('');
    setLoanAmount('');
    setLoanPurpose('');
    setCollateral('');
    setSerialNumber('');
    setBuyerName('');
    setCollateralImage(null);
    setCollateralImagePreview('');
    setOfficerCode('');
    setNationalIdImages([]);
    setNationalIdPreviews([]);
    setRepaymentPeriod('2_weeks');
  };

  const handlePurchaseRequest = async (e) => {
    e.preventDefault();

    if (!purchaseName.trim() || !purchasePhone.trim()) {
      toast.error('Please enter your name and phone number so the seller can contact you.');
      return;
    }

    if (!purchaseProduct) {
      toast.error('No product selected for the request.');
      return;
    }

    try {
      setOrderSubmitting(true);
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
      setPurchaseOpen(false);
      setPurchaseName('');
      setPurchaseEmail('');
      setPurchasePhone('');
      setPurchaseNote('');
    } catch (error) {
      console.error('Failed to submit purchase request:', error);
      toast.error(error.response?.data?.detail || 'Failed to submit request');
    } finally {
      setOrderSubmitting(false);
    }
  };

  const getImageUrl = (imageUrl) => {
    return resolveImageUrl(imageUrl, API_URL);
  };

  useEffect(() => {
    const cachedCategories = window.localStorage.getItem('shopCategories');
    if (cachedCategories) {
      try {
        const parsed = JSON.parse(cachedCategories);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCategories(parsed);
          return;
        }
      } catch (error) {
        console.warn('Invalid shop categories in localStorage', error);
      }
    }
    setCategories(DEFAULT_CATEGORIES);
  }, []);

  useEffect(() => {
    window.localStorage.setItem('shopCategories', JSON.stringify(categories));
  }, [categories]);

  useEffect(() => {
    const cachedProducts = window.localStorage.getItem('shopProducts');
    if (cachedProducts) {
      try {
        const parsed = JSON.parse(cachedProducts);
        if (Array.isArray(parsed)) {
          setProducts(parsed);
          return;
        }
      } catch (error) {
        console.warn('Invalid shop products in localStorage', error);
      }
    }
    setProducts(DEFAULT_PRODUCTS);
  }, []);

  useEffect(() => {
    const fetchBackendProducts = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/products`);
        if (Array.isArray(response.data) && response.data.length > 0) {
          setProducts(response.data);
        }
      } catch (error) {
        console.warn('Failed to load backend shop products', error);
      }
    };

    fetchBackendProducts();
  }, []);

  useEffect(() => {
    window.localStorage.setItem('shopProducts', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    if (user?.name && String(user?.membership_type || '').toLowerCase() === 'seller') {
      fetchOrders();
    }
  }, [user?.name]);

  const categoryMap = categories.reduce((acc, category) => {
    acc[category.id] = category;
    return acc;
  }, {});

  const recentProducts = products
    .sort((a, b) => new Date(b.createdAt || b.created_at) - new Date(a.createdAt || a.created_at))
    .slice(0, 100);

  const visibleProducts = products
    .sort((a, b) => new Date(b.createdAt || b.created_at) - new Date(a.createdAt || a.created_at))
    .slice(0, 100)
    .filter((product) => {
      const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
      const normalizedSearch = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !normalizedSearch ||
        product.title.toLowerCase().includes(normalizedSearch) ||
        product.description?.toLowerCase().includes(normalizedSearch) ||
        (product.sellerName || product.seller_name || '').toLowerCase().includes(normalizedSearch);
      return matchesCategory && matchesSearch;
    });

  const applyCategoryFilter = (categoryId) => {
    setSelectedCategory(categoryId);
  };

  const handleAddCategory = (e) => {
    e.preventDefault();
    const trimmedName = newCategoryName.trim();
    if (!trimmedName) {
      toast.error('Enter a category name');
      return;
    }

    const slug = slugify(trimmedName);
    if (!slug) {
      toast.error('Category name must contain valid letters or numbers');
      return;
    }

    if (categories.some((category) => category.id === slug)) {
      toast.error('This category already exists');
      return;
    }

    setCategories([
      ...categories,
      {
        id: slug,
        name: trimmedName,
        description: newCategoryDescription || 'New product category added by admin.',
      },
    ]);
    setNewCategoryName('');
    setNewCategoryDescription('');
    toast.success('New category added');
    setAddCategoryOpen(false);
  };

  const handleRequestQuickLoan = async (e) => {
  e.preventDefault();
  if (!loanName.trim() || !loanEmail.trim() || !loanAmount.trim()) {
    toast.error('Please fill your name, email and loan amount');
    return;
  }

  if (Number(loanAmount) <= 0) {
    toast.error('Loan amount must be greater than 0');
    return;
  }

  const validEntry = validOfficerCodes.find(v => v.code === officerCode) || null;
  const staticOfficer = OFFICERS.find(o => o.code === officerCode) || null;
  const officer = validEntry
    ? { name: extractPersonName(validEntry.label), code: validEntry.code }
    : staticOfficer
      ? { name: staticOfficer.name, code: staticOfficer.code }
      : null;

  if (loanIsGuaranteed && !officer) {
    toast.error('Please enter a valid officer code for guaranteed loan');
    return;
  }

  if (loanIsGuaranteed) {
    if (!loanAddress.trim() || !loanCity.trim()) {
      toast.error('Please enter the borrower address and city');
      return;
    }
    if (!loanSecurity.trim()) {
      toast.error('Please describe the pledged security / property');
      return;
    }
    if (!loanGuarantorName.trim()) {
      toast.error('Please enter a guarantor name');
      return;
    }
  }

  if (!loanIsGuaranteed && !collateral.trim()) {
    toast.error('Please provide collateral details for collateral-backed loan');
    return;
  }

  try {
    const formData = new FormData();
    formData.append('loan_name', loanName.trim());
    formData.append('loan_email', loanEmail.trim());
    formData.append('loan_phone', loanPhone.trim());
    formData.append('amount', String(Number(loanAmount))); // FormData needs strings
    formData.append('purpose', loanPurpose.trim());
    formData.append('collateral', collateral.trim());
    formData.append('is_guaranteed', String(loanIsGuaranteed));
    formData.append('officer_code', officerCode || '');
    formData.append('officer_name', officer?.name || '');
    formData.append('serial_number', serialNumber || '');
    formData.append('buyer_name', buyerName.trim() || '');
    formData.append('repayment_period', repaymentPeriod);
    formData.append('currency', loanCurrency || 'UGX');
    formData.append('borrower_address', loanAddress.trim());
    formData.append('borrower_city', loanCity.trim());
    formData.append('security_description', loanSecurity.trim());
    formData.append('guarantor_name', loanGuarantorName.trim());
    formData.append('guarantor_address', loanGuarantorAddress.trim());
    formData.append('jurisdiction', loanJurisdiction.trim());
    formData.append('witness_name', loanWitnessName.trim());
    formData.append('agreement_interest_rate', String(Number(loanAmount) > 50000 ? 10 : (repaymentPeriod === '1_month' ? 20 : 10)));
    
    // Only send file for collateral-backed
    if (!loanIsGuaranteed && collateralImage) {
      formData.append('collateral_image', collateralImage);
    }
    if (loanIsGuaranteed) {
      nationalIdImages.forEach(img => formData.append('national_id_images', img));
    }

    const headers = isAuthenticated 
      ? { Authorization: `Bearer ${localStorage.getItem('access_token')}` } 
      : {};

    const response = await axios.post(`${API_URL}/api/quick-loans/request`, formData, {
      headers,
    });

    setLoanRequestSubmitted(true);
    setLoanRequestData(response.data);
    toast.success('Quick loan request submitted to the treasurer for approval!');
  } catch (error) {
    console.error('Failed to submit quick loan request:', error);
    const errorDetail = error.response?.data?.detail;
    const message = typeof errorDetail === 'string' 
      ? errorDetail 
      : Array.isArray(errorDetail) 
        ? errorDetail.map(e => e.msg).join(', ')
        : 'Failed to submit quick loan request. Please try again.';
    toast.error(message);
  }
};

const handleOpenPurchase = (product) => {
    setPurchaseProduct(product);
    setPurchaseOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#F7FAF3] px-4 py-8 sm:px-6 lg:px-8">
      <Toaster position="top-right" />
      
{/* Top Navigation Bar */}
        <nav className="sticky top-0 z-40 backdrop-blur border-b border-slate-200 mb-6">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {/* Mobile top bar - search + cart on right, hamburger on left */}
            <div className="flex md:hidden items-center gap-2 py-2">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 text-[#172B12]"
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search products..."
                className="flex-1 rounded-full border border-slate-300 bg-[#F7FAF3] px-4 py-2 text-sm focus:border-[#2B6F38] focus:ring-2 focus:ring-[#2B6F38]/20"
              />
              <Button
                type="button"
                onClick={() => { if (searchQuery.trim()) navigate(`/category/all?search=${encodeURIComponent(searchQuery.trim())}`); }}
                className="bg-[#172B12] text-white hover:bg-[#0f2409] rounded-full px-3"
              >
                <Search className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => setCartOpen(true)}
                className="bg-white text-[#172B12] border border-[#172B12] hover:bg-[#ECF8E9] relative"
              >
                <ShoppingCart className="h-4 w-4" />
                <span className="sr-only">Cart</span>
              </Button>
            </div>
           
           {/* Desktop/Tablet: Navigation */}
           <div className="hidden md:flex items-center justify-between h-16">
             {/* Left section - All Categories with side nav */}
             <div className="flex flex-col">
               <div className="flex items-center gap-2">
                 <div className="relative">
                   <button
                     type="button"
                     onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                     className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition ${selectedCategory === 'all' ? 'bg-[#172B12] text-white' : 'bg-white text-[#172B12] border border-slate-200 hover:bg-[#ECF8E9]'}`}
                   >
                     <Menu className="h-4 w-4" />
                     All Categories
                   </button>
                   
                   {/* Side navigation sheet for all categories */}
                   {mobileMenuOpen && (
                     <div className="absolute left-0 top-full mt-2 w-80 max-h-96 bg-white border border-slate-200 rounded-lg shadow-lg p-4 overflow-y-auto">
                         <div className="flex flex-col gap-2">
                           {categories.map((category) => {
                             const Icon = ICON_MAP[category.id] || Sparkles;
                             return (
                               <button
                                 key={category.id}
                                 type="button"
                                 onClick={() => { navigate(`/category/${category.id}`); setMobileMenuOpen(false); }}
                                 className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium text-left transition ${selectedCategory === category.id ? 'bg-[#172B12] text-white' : 'bg-white text-[#172B12] border border-slate-200 hover:bg-[#ECF8E9]'}`}
                               >
                                 <Icon className="h-4 w-4" />
                                 {category.name}
                               </button>
                             );
                           })}
                         </div>
                     </div>
                   )}
                 </div>
                 
                 {/* Show only first 5 popular categories inline */}
{categories.slice(0, 5).map((category) => {
                     const Icon = ICON_MAP[category.id] || Sparkles;
                    return (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => { navigate(`/category/${category.id}`); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition ${selectedCategory === category.id ? 'bg-[#172B12] text-white' : 'bg-white text-[#172B12] border border-slate-200 hover:bg-[#ECF8E9]'}`}
                      >
                        <Icon className="h-4 w-4" />
                        {category.name}
                      </button>
                    );
                  })}
               </div>
               
{/* Search bar below categories */}
                <div className="flex items-center gap-2 mt-3">
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search products, sellers, or descriptions"
                    className="w-64 rounded-full border border-slate-300 bg-[#F7FAF3] px-4 py-2 text-sm focus:border-[#2B6F38] focus:ring-2 focus:ring-[#2B6F38]/20"
                  />
                  <Button
                    type="button"
                    onClick={() => { if (searchQuery.trim()) navigate(`/category/all?search=${encodeURIComponent(searchQuery.trim())}`); }}
                    className="bg-[#172B12] text-white hover:bg-[#0f2409] rounded-full px-4"
                  >
                    <Search className="h-4 w-4" />
                 </Button>
               </div>
             </div>
             
             {/* Cart button - on the right for desktop */}
             <div className="flex items-center gap-2">
               <Button
                 onClick={() => setCartOpen(true)}
                 className="bg-white text-[#172B12] border border-[#172B12] hover:bg-[#ECF8E9] relative"
               >
                 <ShoppingCart className="h-4 w-4 mr-2" />
                 Cart ({cart.length})
               </Button>
             </div>
           </div>
           
            {/* Mobile: Category dropdown - scrollable */}
             {mobileMenuOpen && (
               <div className="md:hidden pb-4 space-y-4 overflow-y-auto max-h-96 w-full">
                 <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                              <button
                                type="button"
                                onClick={() => { navigate('/'); setMobileMenuOpen(false); }}
                                className={`px-3 py-2 rounded-full text-sm font-medium text-left transition bg-white text-[#172B12] border border-slate-200 hover:bg-[#ECF8E9]`}
                              >
                                All Categories
                              </button>
                    {categories.map((category) => {
                       const Icon = ICON_MAP[category.id] || Sparkles;
                      return (
                        <button
                         key={category.id}
                         type="button"
                         onClick={() => { navigate(`/category/${category.id}`); setMobileMenuOpen(false); }}
                         className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium text-left transition ${selectedCategory === category.id ? 'bg-[#172B12] text-white' : 'bg-white text-[#172B12] border border-slate-200 hover:bg-[#ECF8E9]'}`}
                       >
                         <Icon className="h-4 w-4" />
                         {category.name}
                       </button>
                     );
                   })}
                </div>
             </div>
           )}
         </div>
       </nav>

      <div className="mx-auto max-w-7xl space-y-10">
        <div className="relative z-10 overflow-hidden rounded-[32px] border border-[#D8E4D3] p-10 shadow-sm" style={{ backgroundImage: "url('/hero_bg_img.jpeg')", backgroundSize: "cover", backgroundPosition: "center", backgroundColor: "#F5FBF2" }}>
          <div className="absolute inset-0 bg-black/20 rounded-[32px]" />
          <div className="relative space-y-8">
            <div className="max-w-3xl space-y-6">
              <p className="text-sm uppercase tracking-[0.3em] text-[#D8E4D3] font-semibold">Group marketplace</p>
              <h1 className="text-5xl font-semibold tracking-tight text-white drop-shadow-lg">Buy, sell and access fast member loans in one place.</h1>
              <p className="text-base leading-8 text-white drop-shadow-md">
                Discover trusted seller listings from our community, place purchase requests, or request a quick loan when cash is needed fast.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Button
                onClick={() => navigate(isAuthenticated ? '/dashboard' : '/login')}
                className="min-w-[160px] bg-[#172B12] text-white hover:bg-[#0f2409]"
              >
                Go to dashboard
              </Button>
              <Button
                onClick={() => setQuickLoanOpen(true)}
                className="min-w-[160px] bg-white text-[#172B12] border border-[#172B12] hover:bg-[#ECF8E9] relative"
              >
                <FastForward className="h-4 w-4 mr-2" />
                Quick Loan
              </Button>
            </div>
          </div>
          <div className="pointer-events-none absolute right-6 top-6 hidden h-32 w-32 rounded-full bg-[#D8E4D3]/60 blur-2xl md:block" />
        </div>

        <Card className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Sparkles className="h-5 w-5 text-[#2B6F38]" /> Quick loan service
            </CardTitle>
            <CardDescription>
              Fast funding for urgent buyer needs, even before registration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[#4B5A45]">
              Request a quick loan to cover urgent purchases or keep your business moving while you wait for buyer payments.
            </p>
          </CardContent>
          <CardFooter>
            <Button onClick={() => setQuickLoanOpen(true)} className="bg-[#172B12] text-white hover:bg-[#0f2409] rounded-full">Request quick loan</Button>
          </CardFooter>
        </Card>
        
<Card className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Popular categories</CardTitle>
            <CardDescription>Categories with newest uploads. Scroll horizontally to see more.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-5">
              {categories
                .map((category) => {
                  const categoryProducts = products.filter((product) => product.category === category.id);
                  return { category, categoryProducts };
                })
                .sort((a, b) => b.categoryProducts.length - a.categoryProducts.length)
.slice(0, 5)
.map(({ category, categoryProducts }) => {
                    const visibleProducts = categoryProducts.slice(0, 6);
                    const Icon = ICON_MAP[category.id] || Sparkles;

                    return (
                      <div key={category.id} className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <Icon className="h-5 w-5 shrink-0 text-[#2B6F38]" />
                            <p className="truncate text-base font-semibold text-[#1B3A16]">{category.name}</p>
                          </div>
                          <Badge variant="secondary" className="bg-[#ECF8E9] text-[#172B12] font-medium">
                            {categoryProducts.length} {categoryProducts.length === 1 ? 'item' : 'items'}
                          </Badge>
                        </div>

                        {categoryProducts.length === 0 ? (
                          <div className="flex items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-[#F7FAF3] to-[#EBF5E8] px-6 py-8 text-center">
                            <div>
                              <svg className="w-10 h-10 mx-auto text-[#4B5A45] mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0h-2m-2 0h-6m-2 0H6m16 10H4a2 2 0 01-2-2v-5a2 2 0 012-2h2m8-4v4m4-4v4m4-4v4M8 7h.01M12 7h.01M16 7h.01" /></svg>
                              <p className="text-sm text-[#4B5A45]">No products in this category yet.</p>
                            </div>
                          </div>
                        ) : (
                          <div className="relative">
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  const row = document.querySelector(`[data-popular-row="${category.id}"]`);
                                  row?.scrollBy({ left: -360, behavior: 'smooth' });
                                }}
                                className="inline-flex md:hidden absolute left-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-lg font-semibold text-[#172B12] hover:bg-[#ECF8E9] shadow-md"
                                aria-label={`Scroll ${category.name} products left`}
                              >
                                ‹
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const row = document.querySelector(`[data-popular-row="${category.id}"]`);
                                  row?.scrollBy({ left: 360, behavior: 'smooth' });
                                }}
                                className="inline-flex md:hidden absolute right-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-lg font-semibold text-[#172B12] hover:bg-[#ECF8E9] shadow-md"
                                aria-label={`Scroll ${category.name} products right`}
                              >
                                ›
                              </button>
                            </>
                            <div
                              data-popular-row={category.id}
                              className="flex gap-4 overflow-x-auto scroll-smooth pb-2 px-10 hide-scrollbar"
                            >
{visibleProducts.map((product) => {
                                const displayImage = product.image_urls?.[0] || product.image_url;
                                return (
                                  <button
                                    key={product.id}
                                    type="button"
                                    onClick={() => navigate(`/product/${product.id}`)}
                                    className="snap-start shrink-0 rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition-all duration-200 hover:shadow-md hover:border-[#2B6F38]/50 w-44 group"
                                  >
                                    {displayImage ? (
                                      <div className="overflow-hidden rounded-t-2xl bg-[#F4F8EF] relative">
                                        <img
                                          src={getImageUrl(displayImage)}
                                          alt={product.title}
                                          className="h-28 w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                        />
                                      </div>
                                    ) : (
                                      <div className="flex h-28 items-center justify-center rounded-t-2xl bg-gradient-to-br from-[#F4F8EF] to-[#E8F0E3] border-b border-slate-200">
                                        <span className="text-xs text-[#4B5A45]">No image</span>
                                      </div>
                                    )}
                                    <div className="p-3">
                                      <p className="line-clamp-2 text-xs font-semibold leading-4 text-[#172B12] mb-1">{product.title}</p>
                                      <p className="text-xs font-bold text-[#2B6F38] mb-2">UGX {Number(product.price).toLocaleString()}</p>
                                      <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          addToCart(product);
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            addToCart(product);
                                          }
                                        }}
                                        className="inline-flex items-center gap-1 text-xs text-[#172B12] hover:text-[#2B6F38] font-medium cursor-pointer"
                                      >
                                        <ShoppingCart className="h-3 w-3" />
                                        Add to Cart
                                      </div>
                                    </div>
                                  </button>
                                );
                              })}

                              {categoryProducts.length > 6 && (
                                <button
                                  type="button"
                                  onClick={() => navigate(`/category/${category.id}`)}
                                  className="snap-start flex h-full min-h-[116px] shrink-0 items-center justify-center rounded-2xl border-2 border-dashed border-[#2B6F38] bg-[#ECF8E9] px-4 text-center text-sm font-semibold text-[#172B12] hover:bg-[#2B6F38] hover:text-white transition-colors duration-200 w-44"
                                >
                                  <div className="text-center">
                                    <svg className="w-6 h-6 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                    See more
                                  </div>
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </CardContent>
            </Card>

            {isAuthenticated && (
              <SellProductsCard
                user={user}
                onProductAdded={(newProduct) => setProducts([newProduct, ...products])}
              />
            )}

            <section className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-3xl font-semibold text-[#172B12]">New Products on Market</h2>
              <p className="text-sm text-[#4B5A45]">
                Latest products added by group members. Showing up to 100 most recent items.
              </p>
            </div>
          </div>

<div className="flex flex-wrap gap-4 justify-center">
            {recentProducts.length === 0 ? (
              <Card className="border border-slate-200 bg-white shadow-sm w-full max-w-3xl">
                <CardContent className="p-6">
                  <p className="text-sm text-[#4B5A45]">No products have been listed yet. Members can add products from their dashboard.</p>
                </CardContent>
              </Card>
            ) : recentProducts.map((product) => (
              <div key={product.id} className="flex-1 min-w-[160px] max-w-[220px]">
                <ProductCard
                  product={product}
                  getImageUrl={getImageUrl}
                  onAddToCart={addToCart}
                  onBuyNow={handleOpenPurchase}
                />
              </div>
            ))}
          </div>
        </section>
      </div>

      <Dialog open={quickLoanOpen} onOpenChange={(open) => {
          if (!open) {
            resetQuickLoanDialogState();
          }
          setQuickLoanOpen(open);
        }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Request a quick loan</DialogTitle>
            <DialogDescription>Fill in your contact details and we will follow up with loan terms.</DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 px-1">
          {loanRequestSubmitted ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-lg font-semibold text-[#172B12]">Loan request received</p>
                <p className="mt-2 text-sm text-slate-600">
                  Your quick loan request has been submitted to the treasurer for approval.
                  You can download the loan agreement manually below if you want a copy now.
                </p>
                <div className="mt-4 text-sm text-slate-700">
                  <p><span className="font-semibold">Name:</span> {loanRequestData?.loanName || loanRequestData?.loan_name}</p>
                  <p><span className="font-semibold">Email:</span> {loanRequestData?.loanEmail || loanRequestData?.loan_email}</p>
                  <p><span className="font-semibold">Phone:</span> {loanRequestData?.loanPhone || loanRequestData?.loan_phone || 'Not provided'}</p>
                  {loanIsGuaranteed && (loanRequestData?.borrower_address || loanRequestData?.borrower_city) && (
                    <p><span className="font-semibold">Address:</span> {[loanRequestData?.borrower_address, loanRequestData?.borrower_city].filter(Boolean).join(', ')}</p>
                  )}
                  {loanIsGuaranteed && loanRequestData?.security_description && (
                    <p><span className="font-semibold">Security:</span> {loanRequestData.security_description}</p>
                  )}
                  {loanIsGuaranteed && loanRequestData?.guarantor_name && (
                    <p><span className="font-semibold">Guarantor:</span> {loanRequestData.guarantor_name}</p>
                  )}
                  <p><span className="font-semibold">Amount:</span> {(loanRequestData?.currency || 'UGX')} {Number(loanRequestData?.loanAmount || loanRequestData?.amount || 0).toLocaleString()}</p>
                  <p><span className="font-semibold">Interest:</span> {(loanRequestData?.currency || 'UGX')} {Math.round((loanRequestData?.interest_amount || (Number(loanRequestData?.loanAmount || loanRequestData?.amount || 0) * (Number(loanRequestData?.loanAmount || loanRequestData?.amount || 0) > 50000 ? 0.1 : (loanRequestData?.repayment_period === '1_month' ? 0.2 : 0.1))))).toLocaleString()}</p>
                  <p><span className="font-semibold">Total Repayment:</span> {(loanRequestData?.currency || 'UGX')} {Math.round((loanRequestData?.total_due || (Number(loanRequestData?.loanAmount || loanRequestData?.amount || 0) * (Number(loanRequestData?.loanAmount || loanRequestData?.amount || 0) > 50000 ? 1.1 : (loanRequestData?.repayment_period === '1_month' ? 1.2 : 1.1))))).toLocaleString()}</p>
                </div>
              </div>
            </div>
          ) : (
            <form id="quick-loan-form" onSubmit={handleRequestQuickLoan} className="space-y-4">
              <div className="mb-4">
                <Label className="text-sm font-medium text-slate-700">Loan type</Label>
                <div className="flex items-center gap-4 mt-2">
                  <label className="inline-flex items-center">
                    <input 
                      type="radio" 
                      name="loan-type" 
                      checked={loanType === 'guaranteed'} 
                      onChange={() => setLoanType('guaranteed')} 
                      className="mr-2"
                    />
                    <span className="ml-2">Guaranteed (by loans officer)</span>
                  </label>
                  <label className="inline-flex items-center">
                    <input 
                      type="radio" 
                      name="loan-type" 
                      checked={loanType === 'collateral-backed'} 
                      onChange={() => setLoanType('collateral-backed')} 
                      className="mr-2"
                    />
                    <span className="ml-2">Collateral-Backed / Selling</span>
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="loan-name" className="text-sm font-medium text-slate-700">Full name</Label>
                <Input id="loan-name" value={loanName} onChange={(e) => setLoanName(e.target.value)} placeholder="Your name" required />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="loan-email" className="text-sm font-medium text-slate-700">Email</Label>
                <Input id="loan-email" type="email" value={loanEmail} onChange={(e) => setLoanEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
              
               <div className="space-y-2">
                 <Label htmlFor="loan-phone" className="text-sm font-medium text-slate-700">Phone number</Label>
                 <Input id="loan-phone" value={loanPhone} onChange={(e) => setLoanPhone(e.target.value)} placeholder="07XXXXXXXX" required />
               </div>
              
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700">Repayment Period</Label>
                  <div className="flex items-center gap-4 mt-2">
                    <label className="inline-flex items-center">
                      <input 
                        type="radio" 
                        name="repayment-period" 
                        checked={repaymentPeriod === '2_weeks'} 
                        onChange={() => setRepaymentPeriod('2_weeks')} 
                        className="mr-2"
                      />
                      <span className="ml-2">2 weeks</span>
                    </label>
                    <label className="inline-flex items-center">
                      <input 
                        type="radio" 
                        name="repayment-period" 
                        checked={repaymentPeriod === '1_month'} 
                        onChange={() => setRepaymentPeriod('1_month')} 
                        className="mr-2"
                      />
                      <span className="ml-2">1 month</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="loan-amount" className="text-sm font-medium text-slate-700">
                    {loanType === 'guaranteed' ? 'Loan amount' : 'Selling Price'}
                  </Label>
                  <div className="flex gap-2">
                    <Input id="loan-amount" type="number" value={loanAmount} onChange={(e) => setLoanAmount(e.target.value)} placeholder="e.g. 100000" required className="flex-1" />
                    <select
                      id="loan-currency"
                      value={loanCurrency}
                      onChange={(e) => setLoanCurrency(e.target.value)}
                      className="w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#2B6F38] focus:ring-2 focus:ring-[#2B6F38]/20"
                    >
                      <option value="UGX">UGX</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="KES">KES</option>
                      <option value="TZS">TZS</option>
                    </select>
                  </div>
                  {loanAmount && Number(loanAmount) > 0 && loanType === 'guaranteed' && (
                    <div className="bg-[#F5F7F5] rounded-lg p-3 text-xs text-[#5C665D] space-y-1">
                      <div className="flex justify-between"><span>Amount:</span><span className="font-numbers font-semibold">{loanCurrency} {Number(loanAmount).toLocaleString()}</span></div>
                      <div className="flex justify-between"><span>Interest ({Number(loanAmount) > 50000 ? '10%' : (repaymentPeriod === '1_month' ? '20%' : '10%')}):</span><span className="font-numbers font-semibold">{loanCurrency} {Math.round(Number(loanAmount) * (Number(loanAmount) > 50000 ? 0.1 : (repaymentPeriod === '1_month' ? 0.2 : 0.1))).toLocaleString()}</span></div>
                      <div className="flex justify-between border-t border-[#E8EBE8] pt-1 mt-1"><span>Total Repayment:</span><span className="font-numbers font-bold text-[#172B12]">{loanCurrency} {Math.round(Number(loanAmount) * (1 + (Number(loanAmount) > 50000 ? 0.1 : (repaymentPeriod === '1_month' ? 0.2 : 0.1)))).toLocaleString()}</span></div>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700">Security / Pledged Property image</Label>
                  <Input type="file" accept="image/*" multiple onChange={(e) => { const files = Array.from(e.target.files || []); setNationalIdImages(prev => [...prev, ...files]); const readers = files.map(f => new Promise(res => { const r = new FileReader(); r.onloadend = () => res(r.result); r.readAsDataURL(f); })); Promise.all(readers).then(results => setNationalIdPreviews(prev => [...prev, ...results])); }} />
                  {nationalIdPreviews.length > 0 && <div className="flex gap-2 mt-2">{nationalIdPreviews.map((src, i) => <img key={i} src={src} alt={`Security / Pledged Property Image ${i + 1}`} className="h-24 w-24 object-cover rounded" />)}</div>}
                </div>
                {loanType === 'guaranteed' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="loan-address" className="text-sm font-medium text-slate-700">Borrower Address</Label>
                      <Input id="loan-address" value={loanAddress} onChange={(e) => setLoanAddress(e.target.value)} placeholder="Street address" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="loan-city" className="text-sm font-medium text-slate-700">City, State, Zip Code</Label>
                      <Input id="loan-city" value={loanCity} onChange={(e) => setLoanCity(e.target.value)} placeholder="e.g. Kampala, Uganda" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="loan-security" className="text-sm font-medium text-slate-700">Security / Pledged Property</Label>
                      <Textarea id="loan-security" value={loanSecurity} onChange={(e) => setLoanSecurity(e.target.value)} placeholder="e.g. House Sofas - brand, model, condition" required rows={2} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="guarantor-name" className="text-sm font-medium text-slate-700">Guarantor Name</Label>
                      <Input id="guarantor-name" value={loanGuarantorName} onChange={(e) => setLoanGuarantorName(e.target.value)} placeholder="Full name of guarantor" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="guarantor-address" className="text-sm font-medium text-slate-700">Guarantor Address</Label>
                      <Input id="guarantor-address" value={loanGuarantorAddress} onChange={(e) => setLoanGuarantorAddress(e.target.value)} placeholder="Guarantor street address" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="loan-jurisdiction" className="text-sm font-medium text-slate-700">Governing Law / Jurisdiction</Label>
                      <Input id="loan-jurisdiction" value={loanJurisdiction} onChange={(e) => setLoanJurisdiction(e.target.value)} placeholder="e.g. Uganda" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="loan-witness" className="text-sm font-medium text-slate-700">Witness Name (optional)</Label>
                      <Input id="loan-witness" value={loanWitnessName} onChange={(e) => setLoanWitnessName(e.target.value)} placeholder="Full name of witness" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="loan-purpose" className="text-sm font-medium text-slate-700">Loan purpose</Label>
                      <Textarea id="loan-purpose" value={loanPurpose} onChange={(e) => setLoanPurpose(e.target.value)} placeholder="Tell us why you need this loan" required rows={2} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="officer-code" className="text-sm font-medium text-slate-700">Officer Code</Label>
                      <Input id="officer-code" value={officerCode} onChange={(e) => setOfficerCode(e.target.value)} placeholder="Enter officer code" required />
                    </div>
                  </>
                )}

              {loanType === 'collateral-backed' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="buyer-name" className="text-sm font-medium text-slate-700">Buyer Name</Label>
                    <Input id="buyer-name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Enter buyer's full name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="loan-collateral" className="text-sm font-medium text-slate-700">Item Name</Label>
                    <Textarea id="loan-collateral" value={collateral} onChange={(e) => setCollateral(e.target.value)} placeholder="e.g. iPhone 13, HP Laptop" required rows={2} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="serial-number" className="text-sm font-medium text-slate-700">Serial Number</Label>
                    <Input id="serial-number" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} placeholder="Serial/IMEI" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="collateral-image" className="text-sm font-medium text-slate-700">Item Photo</Label>
                    <Input 
                      id="collateral-image" 
                      type="file" 
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setCollateralImage(file);
                          const reader = new FileReader();
                          reader.onloadend = () => setCollateralImagePreview(reader.result);
                          reader.readAsDataURL(file);
                        }
                      }}
                      required
                    />
                    {collateralImagePreview && (
                      <img src={collateralImagePreview} alt="preview" className="mt-2 h-24 w-24 object-cover rounded" />
                    )}
                  </div>
                </>
              )}
            </form>
          )}
          </div>
          <div className="flex flex-col gap-3 pt-4 border-t border-[#E8EBE8]">
            {loanRequestSubmitted ? (
              <>
                <Button type="button" className="bg-[#172B12] text-white hover:bg-[#0f2409]" onClick={handleDownloadLoanAgreement}>
                  Download loan agreement
                </Button>
                <Button type="button" className="border border-slate-300 text-slate-700 hover:bg-slate-100" onClick={() => setQuickLoanOpen(false)}>
                  Close
                </Button>
              </>
            ) : (
              <Button type="submit" form="quick-loan-form" className="w-full bg-[#172B12] text-white hover:bg-[#0f2409]">Submit Request</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={purchaseOpen} onOpenChange={setPurchaseOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto flex flex-col">
          <DialogHeader>
            <DialogTitle>Purchase request</DialogTitle>
            <DialogDescription>Send your contact details so the seller can follow up.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePurchaseRequest} className="space-y-4 flex-1">
            <div className="text-sm text-[#4B5A45]">
              <p className="font-semibold text-[#172B12]">Product</p>
              {purchaseProduct?.image_url ? (
                <img
                  src={getImageUrl(purchaseProduct.image_url)}
                  alt={purchaseProduct.title}
                  className="h-40 w-full object-cover rounded-lg mb-2"
                />
              ) : null}
              <p>{purchaseProduct?.title}</p>
              <p className="text-xs text-[#6B7C61]">Seller: {purchaseProduct?.sellerName}</p>
              <p className="text-xs font-semibold text-[#2B6F38]">UGX {Number(purchaseProduct?.price || 0).toLocaleString()}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchase-name" className="text-sm font-medium text-slate-700">Your name</Label>
              <Input id="purchase-name" value={purchaseName} onChange={(event) => setPurchaseName(event.target.value)} placeholder="Your name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchase-email" className="text-sm font-medium text-slate-700">Email</Label>
              <Input id="purchase-email" value={purchaseEmail} onChange={(event) => setPurchaseEmail(event.target.value)} placeholder="you@example.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchase-phone" className="text-sm font-medium text-slate-700">Phone number</Label>
              <Input id="purchase-phone" value={purchasePhone} onChange={(event) => setPurchasePhone(event.target.value)} placeholder="e.g. 0771 234567" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchase-note" className="text-sm font-medium text-slate-700">Message</Label>
              <Textarea id="purchase-note" value={purchaseNote} onChange={(event) => setPurchaseNote(event.target.value)} placeholder="Write a short message to the seller" rows={4} />
            </div>
<Button type="submit" className="bg-[#172B12] text-white hover:bg-[#0f2409]">
               {orderSubmitting ? 'Sending request...' : 'Send purchase request'}
             </Button>
           </form>
         </DialogContent>
       </Dialog>

       <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto flex flex-col">
          <DialogHeader>
            <DialogTitle>Shopping Cart</DialogTitle>
            <DialogDescription>Review your cart and checkout. Orders will be sent to each seller separately.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 flex-1">
            {cart.length === 0 ? (
              <p className="text-sm text-[#4B5A45]">Your cart is empty. Add products to get started.</p>
            ) : (
              <>
                <div className="space-y-4">
                  {Object.entries(getCartItemsBySeller()).map(([seller, items]) => (
                    <div key={seller} className="rounded-lg border border-slate-200 p-3">
                      <p className="text-sm font-semibold text-[#172B12]">Seller: {seller}</p>
                      <p className="text-xs text-[#6B7C61] mb-2">Total: UGX {items.reduce((sum, item) => sum + item.product.price * item.quantity, 0).toLocaleString()}</p>
                      {items.map(item => (
                        <div key={item.productId} className="flex items-center justify-between py-2 border-t border-slate-100">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-[#172B12]">{item.product.title}</p>
                            <p className="text-xs text-[#4B5A45]">UGX {Number(item.product.price).toLocaleString()} x {item.quantity}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => updateCartQuantity(item.productId, item.quantity - 1)}
                              className="px-2 py-1 text-xs border border-slate-300 rounded"
                            >-</button>
                            <span className="text-xs px-2">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => updateCartQuantity(item.productId, item.quantity + 1)}
                              className="px-2 py-1 text-xs border border-slate-300 rounded"
                            >+</button>
                            <button
                              type="button"
                              onClick={() => removeFromCart(item.productId)}
                              className="ml-2 text-xs text-red-600 hover:text-red-800"
                            >Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="border-t border-slate-200 pt-4">
                  <p className="text-lg font-semibold text-[#172B12]">Grand Total: UGX {getCartTotal().toLocaleString()}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cart-name" className="text-sm font-medium text-slate-700">Your name</Label>
                  <Input id="cart-name" value={cartBuyerName} onChange={(event) => setCartBuyerName(event.target.value)} placeholder="Your name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cart-email" className="text-sm font-medium text-slate-700">Email</Label>
                  <Input id="cart-email" value={cartBuyerEmail} onChange={(event) => setCartBuyerEmail(event.target.value)} placeholder="you@example.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cart-phone" className="text-sm font-medium text-slate-700">Phone number</Label>
                  <Input id="cart-phone" value={cartBuyerPhone} onChange={(event) => setCartBuyerPhone(event.target.value)} placeholder="e.g. 0771 234567" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cart-note" className="text-sm font-medium text-slate-700">Message to sellers</Label>
                  <Textarea id="cart-note" value={cartBuyerNote} onChange={(event) => setCartBuyerNote(event.target.value)} placeholder="Write a message to all sellers" rows={3} />
                </div>
                <Button onClick={handleCartCheckout} className="bg-[#172B12] text-white hover:bg-[#0f2409]" disabled={cart.length === 0}>
                  {orderSubmitting ? 'Sending requests...' : `Send ${cart.length} order(s)`}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {isSeller && (
        <div className="max-w-7xl mx-auto mt-8 space-y-4">
          <Card className="bg-white border border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">My Incoming Orders</CardTitle>
              <CardDescription>Purchase requests for products you are selling.</CardDescription>
            </CardHeader>
            <CardContent>
              {orders.length === 0 ? (
                <p className="text-sm text-[#4B5A45] py-4">No incoming orders yet.</p>
              ) : (
                <div className="space-y-4">
                  {orders.map(order => (
                    <div key={order.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-[#172B12]">{order.buyerName || 'A buyer'}</p>
                          <p className="text-xs text-[#4B5A45]">{new Date(order.created_at).toLocaleString()}</p>
                        </div>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${order.status === 'approved' ? 'bg-[#DEF2DD] text-[#2C5530]' : order.status === 'rejected' ? 'bg-[#FBD7D4] text-[#D05A49]' : 'bg-[#FEF6E8] text-[#C57A17]'}`}>
                          {order.status === 'pending' ? 'Pending' : order.status === 'approved' ? 'Approved' : 'Rejected'}
                        </span>
                      </div>
                      <p className="text-sm text-[#4B5A45] mt-2">Total: UGX {Number(order.total || 0).toLocaleString()}</p>
                      {order.note && <p className="text-xs text-[#4B5A45] mt-1">Note: {order.note}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ShopPage;
