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
import { ShoppingCart, FastForward, Cpu, Sparkles, ShoppingBag, HardHat, PenTool, Shirt, HeartPulse, Home, BookOpen, Dumbbell, Gamepad2, Briefcase, Menu, X, Search } from 'lucide-react';
import { exportLoanAgreementPDF } from '../utils/pdfExport';
import { OFFICERS } from '../data/officers';

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
  const { user, isAuthenticated, isAdmin } = useAuth();
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [selectedCategory, setSelectedCategory] = useState('food');
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

  const handleCartCheckout = async () => {
    if (!cartBuyerName.trim() || !cartBuyerPhone.trim()) {
      toast.error('Please enter your name and phone number');
      return;
    }

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
      toast.success(`Orders sent to ${Object.keys(sellersMap).length} seller(s). They will contact you by phone.`);
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

  const recentProducts = products
    .sort((a, b) => new Date(b.createdAt || b.created_at) - new Date(a.createdAt || b.created_at))
    .slice(0, 20);

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
      
{/* Top Navigation Bar */}
        <nav className="sticky top-0 z-40 backdrop-blur border-b border-slate-200 mb-6">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {/* Mobile top bar - hamburger on left, cart on right */}
            <div className="flex md:hidden items-center justify-between py-2">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 text-[#172B12]"
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
              <Button
                onClick={() => setCartOpen(true)}
                className="bg-white text-[#172B12] border border-[#172B12] hover:bg-[#ECF8E9] relative"
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                Cart ({cart.length})
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
           
{/* Mobile: Search and category dropdown - scrollable */}
            {mobileMenuOpen && (
              <div className="md:hidden pb-4 space-y-4 overflow-y-auto max-h-96 w-full">
                <div className="flex items-center gap-2">
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search products, sellers, or descriptions"
                    className="flex-1 rounded-full border border-slate-300 bg-[#F7FAF3] px-4 py-2 text-sm focus:border-[#2B6F38] focus:ring-2 focus:ring-[#2B6F38]/20"
                  />
                  <Button
                    type="button"
                    onClick={() => { if (searchQuery.trim()) navigate(`/category/all?search=${encodeURIComponent(searchQuery.trim())}`); }}
                    className="bg-[#172B12] text-white hover:bg-[#0f2409] rounded-full px-4"
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
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
            <Button onClick={() => setQuickLoanOpen(true)} className="bg-[#172B12] text-white hover:bg-[#0f2409]">Request quick loan</Button>
          </CardFooter>
        </Card>
        
        <Card className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Browse by category</CardTitle>
            <CardDescription>Small product previews grouped by category. Scroll sideways to view more items.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-5">
               {categories
                 .map((category) => {
                  const categoryProducts = products.filter((product) => product.category === category.id);
                  const visibleProducts = categoryProducts.slice(0, 6);
                  const Icon = ICON_MAP[category.id] || Sparkles;

                  return (
                    <div key={category.id} className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <Icon className="h-4 w-4 shrink-0 text-[#2B6F38]" />
                          <p className="truncate text-sm font-semibold text-[#1B3A16]">{category.name}</p>
                        </div>
                        <Badge variant="secondary">{categoryProducts.length}</Badge>
                      </div>

                      {categoryProducts.length === 0 ? (
                        <div className="rounded-3xl border border-dashed border-slate-200 bg-[#F7FAF3] px-4 py-5 text-sm text-[#4B5A45]">
                          No products in this category yet.
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                const row = event.currentTarget.closest('[data-product-row]');
                                row?.scrollBy({ left: -360, behavior: 'smooth' });
                              }}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-lg font-semibold text-[#172B12] hover:bg-[#ECF8E9]"
                              aria-label={`Scroll ${category.name} products left`}
                            >
                              ‹
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                const row = event.currentTarget.closest('[data-product-row]');
                                row?.scrollBy({ left: 360, behavior: 'smooth' });
                              }}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-lg font-semibold text-[#172B12] hover:bg-[#ECF8E9]"
                              aria-label={`Scroll ${category.name} products right`}
                            >
                              ›
                            </button>
                          </div>

                          <div
                            data-product-row
                            className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-2"
                          >
                            {visibleProducts.map((product) => (
                              <button
                                key={product.id}
                                type="button"
                                onClick={() => handleOpenPurchase(product)}
                                className="snap-start shrink-0 rounded-3xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-[#2B6F38]/70"
                                style={{ width: '132px' }}
                              >
                                {product.image_url ? (
                                  <div className="overflow-hidden rounded-2xl bg-[#F4F8EF]">
                                    <img
                                      src={getImageUrl(product.image_url)}
                                      alt={product.title}
                                      className="h-20 w-full object-cover"
                                    />
                                  </div>
                                ) : (
                                  <div className="mb-3 flex h-20 items-center justify-center rounded-2xl bg-[#F4F8EF] text-xs font-medium text-[#4B5A45]">
                                    No image
                                  </div>
                                )}
                                <p className="mt-2 line-clamp-2 text-xs font-semibold leading-4 text-[#172B12]">{product.title}</p>
                                <p className="mt-1 text-xs font-semibold text-[#2B6F38]">UGX {Number(product.price).toLocaleString()}</p>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    addToCart(product);
                                  }}
                                  className="mt-1 text-xs text-[#172B12] hover:text-[#2B6F38]"
                                >
                                  Add to Cart
                                </button>
                              </button>
                            ))}

                            {categoryProducts.length > 6 && (
                              <button
                                type="button"
                                onClick={() => navigate(`/category/${category.id}`)}
                                className="snap-start flex h-full min-h-[124px] shrink-0 items-center justify-center rounded-3xl border border-[#2B6F38]/30 bg-[#ECF8E9] px-4 text-center text-sm font-semibold text-[#172B12] hover:bg-[#2B6F38] hover:text-white"
                                style={{ width: '132px' }}
                              >
                                See more
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
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

        <section className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-3xl font-semibold text-[#172B12]">New Products on Market</h2>
              <p className="text-sm text-[#4B5A45]">
                Latest products added by group members. Showing up to 20 most recent items.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {recentProducts.length === 0 ? (
              <Card className="border border-slate-200 bg-white shadow-sm">
                <CardContent>
                  <p className="text-sm text-[#4B5A45]">No products have been listed yet. Members can add products from their dashboard.</p>
                </CardContent>
              </Card>
            ) : recentProducts.map((product) => (
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
                  <Button size="sm" onClick={() => addToCart(product)} className="bg-[#172B12] text-white hover:bg-[#0f2409]">Add to Cart</Button>
                  <Button size="sm" onClick={() => handleOpenPurchase(product)} className="bg-white text-[#172B12] border border-[#172B12] hover:bg-[#ECF8E9]">Buy now</Button>
                  <Button size="sm" onClick={() => setCartOpen(true)} className="bg-[#172B12] text-white hover:bg-[#0f2409]">View cart</Button>
                </CardFooter>
              </Card>
            ))}
          </div>
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
                 {categories.map((category) => (
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
                  {orderSubmitting ? 'Sending requests...' : `Send orders to ${Object.keys(getCartItemsBySeller()).length} seller(s)`}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ShopPage;
