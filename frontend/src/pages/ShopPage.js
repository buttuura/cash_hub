import React, { useState, useEffect } from 'react';
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
import { ShoppingCart, FastForward, Cpu, Sparkles, Plus, ShoppingBag, HardHat, PenTool } from 'lucide-react';
import { exportLoanAgreementPDF } from '../utils/pdfExport';
import { OFFICERS } from '../data/officers';

const ICON_MAP = {
  'quick-loan': FastForward,
  'food': ShoppingBag,
  'construction-materials': HardHat,
  'graphic-material': PenTool,
  'electronics': Cpu,
  'default': Sparkles,
};

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';

const DEFAULT_CATEGORIES = [
  {
    id: 'quick-loan',
    name: 'Quick Loan',
    description: 'Fast loan service for people who are not yet registered with us.',
  },
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

const ShopPage = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, isAdmin } = useAuth();
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [selectedCategory, setSelectedCategory] = useState('quick-loan');
  const [products, setProducts] = useState(DEFAULT_PRODUCTS);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [quickLoanOpen, setQuickLoanOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  const [newProductTitle, setNewProductTitle] = useState('');
  const [newProductDescription, setNewProductDescription] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductCategory, setNewProductCategory] = useState('food');
  const [newProductImage, setNewProductImage] = useState(null);
  const [newProductImagePreview, setNewProductImagePreview] = useState('');
  const [uploadingProduct, setUploadingProduct] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loanName, setLoanName] = useState('');
  const [loanEmail, setLoanEmail] = useState('');
  const [loanPhone, setLoanPhone] = useState('');
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
  const [validOfficerCodes, setValidOfficerCodes] = useState([]);
  const [loadingValidCodes, setLoadingValidCodes] = useState(false);
  const [loanRequestSubmitted, setLoanRequestSubmitted] = useState(false);
  useEffect(() => {
  setLoanIsGuaranteed(loanType === 'guaranteed');
}, [loanType]);
  useEffect(() => {
    if (!quickLoanOpen) return;
    setLoadingValidCodes(true);
    let cancelled = false;
    axios.get(`${API_URL}/api/quick-loans/valid-codes`).then((res) => {
      if (cancelled) return;
      const codes = Array.isArray(res.data?.all) ? res.data.all : [];
      setValidOfficerCodes(codes);
    }).catch(() => {
      if (cancelled) return;
      setValidOfficerCodes([]);
    }).finally(() => {
      if (!cancelled) setLoadingValidCodes(false);
    });
    return () => { cancelled = true; };
  }, [quickLoanOpen]);
  const [loanRequestData, setLoanRequestData] = useState(null);
  const [purchaseProduct, setPurchaseProduct] = useState(null);
  const [purchaseName, setPurchaseName] = useState('');
  const [purchaseEmail, setPurchaseEmail] = useState('');
  const [purchasePhone, setPurchasePhone] = useState('');
  const [purchaseNote, setPurchaseNote] = useState('');
  const [orderSubmitting, setOrderSubmitting] = useState(false);

  const loadOrderRequests = () => {
    try {
      return JSON.parse(window.localStorage.getItem('cash_hub_orders') || '[]');
    } catch (error) {
      console.warn('Failed to load order requests', error);
      return [];
    }
   };

  const saveOrderRequests = (orders) => {
    window.localStorage.setItem('cash_hub_orders', JSON.stringify(orders));
  };

  const handleDownloadLoanAgreement = async () => {
    if (!loanRequestData) return;
    const officer = OFFICERS.find((o) => o.code === loanRequestData.officerCode) || null;
    await exportLoanAgreementPDF(loanRequestData, officer, {
      download: true,
      collateralImage: collateralImagePreview,
    });
  };

  const resetQuickLoanDialogState = () => {
    setLoanRequestSubmitted(false);
    setLoanRequestData(null);
    setLoanName('');
    setLoanEmail('');
    setLoanPhone('');
    setLoanAmount('');
    setLoanPurpose('');
    setCollateral('');
    setSerialNumber('');
    setBuyerName('');
    setCollateralImage(null);
    setCollateralImagePreview('');
    setOfficerCode('');
  };

  const handlePurchaseRequest = (e) => {
    e.preventDefault();

    if (!purchaseName.trim() || !purchasePhone.trim()) {
      toast.error('Please enter your name and phone number so the seller can contact you.');
      return;
    }

    if (!purchaseProduct) {
      toast.error('No product selected for the request.');
      return;
    }

    const order = {
      id: `order-${Date.now()}`,
      productId: purchaseProduct.id,
      productTitle: purchaseProduct.title,
      productPrice: purchaseProduct.price,
      sellerName: purchaseProduct.sellerName || purchaseProduct.seller_name || 'Member',
      buyerId: user?.id || null,
      buyerName: purchaseName.trim(),
      buyerEmail: purchaseEmail.trim(),
      buyerPhone: purchasePhone.trim(),
      note: purchaseNote.trim(),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    setOrderSubmitting(true);
    const existingOrders = loadOrderRequests();
    saveOrderRequests([order, ...existingOrders]);
    setOrderSubmitting(false);

    toast.success('Order request sent. The seller will contact you by phone.');
    setPurchaseOpen(false);
    setPurchaseName('');
    setPurchaseEmail('');
    setPurchasePhone('');
    setPurchaseNote('');
  };

  const getImageUrl = (imageUrl) => {
    if (!imageUrl) return null;
    return imageUrl.startsWith('http') ? imageUrl : `${API_URL}${imageUrl}`;
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

  const categoryMap = categories.reduce((acc, category) => {
    acc[category.id] = category;
    return acc;
  }, {});

  const visibleProducts = products.filter((product) => {
    const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !normalizedSearch ||
      product.title.toLowerCase().includes(normalizedSearch) ||
      product.description?.toLowerCase().includes(normalizedSearch) ||
      (product.sellerName || product.seller_name || '').toLowerCase().includes(normalizedSearch);
    return matchesCategory && matchesSearch;
  });

  const handleSelectCategory = (categoryId) => {
    setSelectedCategory(categoryId);
    if (categoryId === 'quick-loan') {
      setQuickLoanOpen(true);
    }
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

  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!newProductTitle.trim()) {
      toast.error('Enter a product title');
      return;
    }
    if (!newProductCategory || !categoryMap[newProductCategory]) {
      toast.error('Pick a valid category');
      return;
    }
    const price = Number(newProductPrice);
    if (!price || price <= 0) {
      toast.error('Enter a valid price');
      return;
    }
    if (!isAuthenticated) {
      toast.error('Please log in to sell products');
      navigate('/login');
      return;
    }

    setUploadingProduct(true);
    try {
      // Create FormData for multipart upload
      const formData = new FormData();
      formData.append('title', newProductTitle.trim());
      formData.append('description', newProductDescription.trim());
      formData.append('price', price);
      formData.append('category', newProductCategory);
      
      // Add image if selected
      if (newProductImage) {
        formData.append('image', newProductImage);
      }

      // Get authorization token from localStorage
      const authToken = localStorage.getItem('access_token');
      const headers = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      // Send to backend
      const response = await axios.post(`${API_URL}/api/products`, formData, {
        headers,
        withCredentials: true, // Include cookies if available
      });

      const newProduct = {
        id: response.data.id || `prod-${Date.now()}`,
        category: newProductCategory,
        title: response.data.title || newProductTitle.trim(),
        description: response.data.description || newProductDescription.trim(),
        price: response.data.price || price,
        sellerName: user?.name || 'Member',
        seller_name: user?.name || 'Member',
        image_url: response.data.image_url,
        createdAt: response.data.created_at || new Date().toISOString(),
      };

      setProducts([newProduct, ...products]);
      
      resetProductForm();
      toast.success('Product listed successfully');
      setAddProductOpen(false);
      setSelectedCategory(newProductCategory);
    } catch (error) {
      console.error('Failed to add product:', error);
      const errorMessage = error.response?.data?.detail || 'Failed to list product. Please try again.';
      toast.error(errorMessage);
    } finally {
      setUploadingProduct(false);
    }
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

  const validCode = validOfficerCodes.some((c) => c.code === officerCode.trim());
  const officer = validCode
    ? OFFICERS.find((o) => o.code === officerCode) || { name: officerCode, code: officerCode }
    : null;

  if (loanIsGuaranteed && !validCode) {
    toast.error('Please enter a valid officer code or member code');
    return;
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
    formData.append('buyer_name', buyerName.trim());
    
    // Only send file for collateral-backed
    if (!loanIsGuaranteed && collateralImage) {
      formData.append('collateral_image', collateralImage);
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

  const handleImageSelect = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error('Please select a valid image file');
        return;
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image size must be less than 5MB');
        return;
      }
      setNewProductImage(file);
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewProductImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const resetProductForm = () => {
    setNewProductTitle('');
    setNewProductDescription('');
    setNewProductPrice('');
    setNewProductCategory('food');
    setNewProductImage(null);
    setNewProductImagePreview('');
  };

  return (
    <div className="min-h-screen bg-[#F7FAF3] px-4 py-8 sm:px-6 lg:px-8">
      <Toaster position="top-right" />
      <div className="mx-auto max-w-7xl space-y-10">
        <section className="grid gap-8 lg:grid-cols-[1.45fr_0.95fr]">
          <div className="relative overflow-hidden rounded-[32px] border border-[#D8E4D3] bg-gradient-to-br from-[#F5FBF2] via-white to-[#EFF6ED] p-10 shadow-sm">
            <div className="space-y-8">
              <div className="max-w-3xl space-y-6">
                <p className="text-sm uppercase tracking-[0.3em] text-[#2B6F38] font-semibold">Group marketplace</p>
                <h1 className="text-5xl font-semibold tracking-tight text-[#172B12]">Buy, sell and access fast member loans in one place.</h1>
                <p className="text-base leading-8 text-[#4B5A45]">
                  Discover trusted seller listings from our community, place purchase requests, or request a quick loan when cash is needed fast.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-1">
                <Button
                  onClick={() => navigate(isAuthenticated ? '/dashboard' : '/login')}
                  className="min-w-[160px] bg-[#172B12] text-white hover:bg-[#0f2409]"
                >
                  Go to dashboard
                </Button>
              </div>

              <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#4B5A45]">Search the marketplace</p>
                    <h2 className="text-xl font-semibold text-[#172B12]">Find products from members</h2>
                  </div>
                  <Badge variant="secondary">{visibleProducts.length} matches</Badge>
                </div>
                <div className="mt-5">
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search products, sellers, or descriptions"
                    className="w-full rounded-3xl border border-slate-300 bg-[#F7FAF3] px-4 py-3 text-sm text-slate-700 shadow-sm focus:border-[#2B6F38] focus:ring-2 focus:ring-[#2B6F38]/20"
                  />
                </div>
              </div>
            </div>
            <div className="pointer-events-none absolute right-6 top-6 hidden h-32 w-32 rounded-full bg-[#D8E4D3]/60 blur-2xl md:block" />
          </div>

          <aside className="space-y-6">
            <Card className="border border-slate-200 bg-white">
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
                <Button onClick={() => setQuickLoanOpen(true)} className="bg-[#172B12] text-white hover:bg-[#0f2409]">Request quick loan</Button>
              </CardFooter>
            </Card>

            <Card className="border border-slate-200 bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <ShoppingCart className="h-5 w-5 text-[#2B6F38]" /> Sell products
                </CardTitle>
                <CardDescription>
                  List your products and reach buyers across the group marketplace.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[#4B5A45]">
                  Create a listing quickly and keep your inventory visible to the community.
                </p>
              </CardContent>
              <CardFooter>
                <Button
                  onClick={() => {
                    if (!isAuthenticated) {
                      navigate('/login');
                    } else {
                      setAddProductOpen(true);
                    }
                  }}
                  className="bg-[#172B12] text-white hover:bg-[#0f2409]"
                >
                  {isAuthenticated ? 'List a product' : 'Login to sell'}
                </Button>
              </CardFooter>
            </Card>

            <Card className="border border-slate-200 bg-white">
              <CardHeader>
                <CardTitle className="text-lg">Popular categories</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {categories.slice(0, 4).map((category) => {
                    const Icon = ICON_MAP[category.id] || ICON_MAP.default;
                    const count = products.filter((product) => product.category === category.id).length;
                    return (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => handleSelectCategory(category.id)}
                        className="flex w-full items-center justify-between rounded-3xl border border-slate-200 bg-[#F7FAF3] px-4 py-3 text-left text-sm font-medium text-[#1B3A16] hover:border-[#2B6F38]/70"
                      >
                        <span className="flex items-center gap-3">
                          <Icon className="h-4 w-4 text-[#2B6F38]" />
                          {category.name}
                        </span>
                        <Badge variant="secondary">{category.id === 'quick-loan' ? 'Service' : `${count}`}</Badge>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </aside>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.3fr_0.95fr]">
          <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-[#2B6F38] font-semibold">Explore by category</p>
                <h2 className="text-3xl font-semibold text-[#172B12]">Shop by collection</h2>
              </div>
              {isAdmin && (
                <Button onClick={() => setAddCategoryOpen(true)} className="bg-[#172B12] text-white hover:bg-[#0f2409]">
                  <Plus className="mr-2 h-4 w-4" /> Add category
                </Button>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <button
                type="button"
                onClick={() => handleSelectCategory('all')}
                className={`rounded-[28px] border px-6 py-5 text-left transition ${selectedCategory === 'all' ? 'border-[#2B6F38] bg-[#ECF8E9]' : 'border-slate-200 bg-white hover:border-[#2B6F38]/60'}`}
              >
                <p className="text-sm font-semibold text-[#1B3A16]">All categories</p>
                <p className="mt-2 text-xs text-[#4B5A45]">{products.length} listings available</p>
              </button>

              {categories.map((category) => {
                const Icon = ICON_MAP[category.id] || ICON_MAP.default;
                const count = products.filter((product) => product.category === category.id).length;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => handleSelectCategory(category.id)}
                    className={`rounded-[28px] border px-6 py-5 text-left transition ${selectedCategory === category.id ? 'border-[#2B6F38] bg-[#ECF8E9]' : 'border-slate-200 bg-white hover:border-[#2B6F38]/60'}`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-[#2B6F38]" />
                      <span className="font-semibold text-[#1B3A16]">{category.name}</span>
                    </div>
                    <p className="mt-2 text-xs text-[#4B5A45]">{category.id === 'quick-loan' ? 'Quick loan service' : `${count} products`}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <Card className="border border-slate-200 bg-white p-6 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">How it works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 text-sm text-[#4B5A45]">
              <div className="space-y-3 rounded-3xl border border-slate-200 bg-[#F7FAF3] p-4">
                <p className="font-semibold text-[#172B12]">Search and choose</p>
                <p>Use the search bar and category cards to find the products you need.</p>
              </div>
              <div className="space-y-3 rounded-3xl border border-slate-200 bg-[#F7FAF3] p-4">
                <p className="font-semibold text-[#172B12]">Contact the seller</p>
                <p>Submit a purchase request and the seller will contact you by phone.</p>
              </div>
              <div className="space-y-3 rounded-3xl border border-slate-200 bg-[#F7FAF3] p-4">
                <p className="font-semibold text-[#172B12]">Need money now?</p>
                <p>Request a quick loan and submit your request to the treasurer for approval. You can download the agreement manually after submitting.</p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-3xl font-semibold text-[#172B12]">{selectedCategory === 'all' ? 'Latest marketplace items' : categoryMap[selectedCategory]?.name || 'Category'}</h2>
              <p className="text-sm text-[#4B5A45]">
                {selectedCategory === 'all'
                  ? 'Browse the latest listings from group members across every category.'
                  : categoryMap[selectedCategory]?.description}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {isAuthenticated && selectedCategory !== 'quick-loan' && (
                <Button onClick={() => setAddProductOpen(true)} className="bg-[#172B12] text-white hover:bg-[#0f2409]">
                  Add product in {categoryMap[selectedCategory]?.name || 'category'}
                </Button>
              )}
              <Button onClick={() => handleSelectCategory('all')} className="bg-[#172B12] text-white hover:bg-[#0f2409]">Show all</Button>
            </div>
          </div>

          {selectedCategory === 'quick-loan' ? (
            <Card className="border border-slate-200 bg-white">
              <CardContent>
                <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                  <div>
                    <h3 className="text-xl font-semibold text-[#172B12]">Quick loans for everyone</h3>
                    <p className="mt-3 text-sm text-[#4B5A45]">
                      Non-members can request a quick loan, and group members can promote this service as part of the marketplace offering.
                    </p>
                    <ul className="mt-4 space-y-3 text-sm text-[#4B5A45]">
                      <li>• No registration required for initial loan requests.</li>
                      <li>• Simple application form and fast review.</li>
                      <li>• Loans are handled by the group as a service.</li>
                    </ul>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-[#ECF8E9] p-6">
                    <div className="flex items-center gap-3 text-[#2B6F38]">
                      <FastForward className="h-5 w-5" />
                      <span className="text-lg font-semibold">Start a loan request</span>
                    </div>
                    <p className="mt-3 text-sm text-[#4B5A45]">Submit your details and we will reach out with terms and next steps.</p>
                    <Button className="mt-5 w-full bg-[#172B12] text-white hover:bg-[#0f2409]" onClick={() => setQuickLoanOpen(true)}>
                      Request quick loan
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleProducts.length === 0 ? (
                <Card className="border border-slate-200 bg-white shadow-sm">
                  <CardContent>
                    <p className="text-sm text-[#4B5A45]">No items have been listed in this category yet. Members can add a new product from the button above.</p>
                  </CardContent>
                </Card>
              ) : visibleProducts.map((product) => (
                <Card key={product.id} className="border border-slate-200 bg-white shadow-sm">
                  {product.image_url && (
                    <div className="overflow-hidden rounded-t-[32px] bg-[#F4F8EF]">
                      <img
                        src={getImageUrl(product.image_url)}
                        alt={product.title}
                        className="h-56 w-full object-cover"
                      />
                    </div>
                  )}
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg">{product.title}</CardTitle>
                        <CardDescription>{product.description}</CardDescription>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-[#4B5A45]">Price</p>
                        <p className="text-xl font-semibold text-[#172B12]">UGX {Number(product.price).toLocaleString()}</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm text-[#4B5A45]">
                      <p>Seller: <span className="font-medium text-[#172B12]">{product.sellerName || product.seller_name || 'Member'}</span></p>
                      <p className="text-xs text-[#6B7C61]">{new Date(product.createdAt || product.created_at).toLocaleDateString()}</p>
                    </div>
                  </CardContent>
                  <CardFooter className="flex flex-wrap gap-3 border-t border-slate-200 pt-4">
                    <Button size="sm" onClick={() => handleOpenPurchase(product)} className="bg-[#172B12] text-white hover:bg-[#0f2409]">Buy now</Button>
                    {isAuthenticated ? (
                      <Badge variant="secondary">Member buyer</Badge>
                    ) : (
                      <Button size="sm" onClick={() => navigate('/login')} className="bg-[#172B12] text-white hover:bg-[#0f2409]">Login to buy</Button>
                    )}
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>

      <Dialog open={addProductOpen} onOpenChange={setAddProductOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto flex flex-col">
          <DialogHeader>
            <DialogTitle>List a new product</DialogTitle>
            <DialogDescription>Members can publish items for sale by selecting a category and entering product details.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddProduct} className="space-y-4 flex-1">
            <div>
              <Label htmlFor="product-title" className="text-sm font-medium text-slate-700">Product title</Label>
              <Input
                id="product-title"
                value={newProductTitle}
                onChange={(event) => setNewProductTitle(event.target.value)}
                placeholder="e.g. Handmade breakfast pack"
                disabled={uploadingProduct}
              />
            </div>
            <div>
              <Label htmlFor="product-description" className="text-sm font-medium text-slate-700">Description</Label>
              <Textarea
                id="product-description"
                value={newProductDescription}
                onChange={(event) => setNewProductDescription(event.target.value)}
                placeholder="Tell buyers about this item"
                rows={4}
                disabled={uploadingProduct}
              />
            </div>
            <div>
              <Label htmlFor="product-category" className="text-sm font-medium text-slate-700">Category</Label>
              <select
                id="product-category"
                value={newProductCategory}
                onChange={(event) => setNewProductCategory(event.target.value)}
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#2B6F38] focus:ring-2 focus:ring-[#2B6F38]/20 disabled:opacity-50"
                disabled={uploadingProduct}
              >
                {categories.filter((category) => category.id !== 'quick-loan').map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="product-price" className="text-sm font-medium text-slate-700">Price (UGX)</Label>
              <Input
                id="product-price"
                type="number"
                value={newProductPrice}
                onChange={(event) => setNewProductPrice(event.target.value)}
                placeholder="e.g. 50000"
                disabled={uploadingProduct}
              />
            </div>
            <div>
              <Label htmlFor="product-image" className="text-sm font-medium text-slate-700">Product image</Label>
              <div className="mt-2 space-y-3">
                <input
                  id="product-image"
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  disabled={uploadingProduct}
                  className="block w-full text-sm text-slate-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-lg file:border-0
                    file:text-sm file:font-semibold
                    file:bg-[#172B12] file:text-white
                    hover:file:bg-[#0f2409]
                    disabled:opacity-50"
                />
                <p className="text-xs text-[#4B5A45]">Max file size: 5MB. Supported formats: JPG, PNG, GIF, WebP</p>
                {newProductImagePreview && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <img
                      src={newProductImagePreview}
                      alt="Preview"
                      className="h-32 w-full rounded object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setNewProductImage(null);
                        setNewProductImagePreview('');
                      }}
                      disabled={uploadingProduct}
                      className="mt-2 text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      Remove image
                    </button>
                  </div>
                )}
              </div>
            </div>
            <Button 
              type="submit" 
              className="bg-[#172B12] text-white hover:bg-[#0f2409] disabled:opacity-50"
              disabled={uploadingProduct}
            >
              {uploadingProduct ? 'Publishing...' : 'Publish product'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

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
                  <p><span className="font-semibold">Amount:</span> UGX {Number(loanRequestData?.loanAmount || loanRequestData?.amount || 0).toLocaleString()}</p>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <Button type="button" className="bg-[#172B12] text-white hover:bg-[#0f2409]" onClick={handleDownloadLoanAgreement}>
                  Download loan agreement
                </Button>
                <Button type="button" className="border border-slate-300 text-slate-700 hover:bg-slate-100" onClick={() => setQuickLoanOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleRequestQuickLoan} className="space-y-4">
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
                <Label htmlFor="buyer-name" className="text-sm font-medium text-slate-700">Buyer Name</Label>
                <Input id="buyer-name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Enter buyer's full name" />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="loan-amount" className="text-sm font-medium text-slate-700">
                  {loanType === 'guaranteed' ? 'Loan amount (UGX)' : 'Selling Price (UGX)'}
                </Label>
                <Input id="loan-amount" type="number" value={loanAmount} onChange={(e) => setLoanAmount(e.target.value)} placeholder="e.g. 100000" required />
              </div>

              {loanType === 'guaranteed' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="loan-purpose" className="text-sm font-medium text-slate-700">Loan purpose</Label>
                    <Textarea id="loan-purpose" value={loanPurpose} onChange={(e) => setLoanPurpose(e.target.value)} placeholder="Tell us why you need this loan" required />
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

              <Button type="submit" className="w-full">Submit Request</Button>
            </form>
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
              <p>{purchaseProduct?.title}</p>
              <p className="text-xs text-[#6B7C61]">Seller: {purchaseProduct?.sellerName}</p>
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
    </div>
  );
};

export default ShopPage;
