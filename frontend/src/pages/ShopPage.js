import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { Toaster, toast } from 'sonner';
import { ShoppingCart, FastForward, Cpu, Sparkles, Plus, ShoppingBag, HardHat, PenTool } from 'lucide-react';

const ICON_MAP = {
  'quick-loan': FastForward,
  'food': ShoppingBag,
  'construction-materials': HardHat,
  'graphic-material': PenTool,
  'electronics': Cpu,
  'default': Sparkles,
};

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

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
  const [purchaseProduct, setPurchaseProduct] = useState(null);
  const [purchaseName, setPurchaseName] = useState('');
  const [purchaseEmail, setPurchaseEmail] = useState('');
  const [purchasePhone, setPurchasePhone] = useState('');
  const [purchaseNote, setPurchaseNote] = useState('');

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

  const handleRequestQuickLoan = (e) => {
    e.preventDefault();
    if (!loanName.trim() || !loanEmail.trim() || !loanAmount.trim()) {
      toast.error('Please fill all required fields');
      return;
    }
    toast.success('Quick loan request submitted. We will contact you soon.');
    setLoanName('');
    setLoanEmail('');
    setLoanPhone('');
    setLoanAmount('');
    setLoanPurpose('');
    setQuickLoanOpen(false);
  };

  const handlePurchaseRequest = (e) => {
    e.preventDefault();
    if (!purchaseProduct || !purchaseName.trim() || !purchaseEmail.trim()) {
      toast.error('Please fill in your contact details');
      return;
    }
    toast.success(`Purchase request sent for ${purchaseProduct.title}`);
    setPurchaseProduct(null);
    setPurchaseName('');
    setPurchaseEmail('');
    setPurchasePhone('');
    setPurchaseNote('');
    setPurchaseOpen(false);
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
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.95fr] mb-10">
          <div className="space-y-6">
            <section className="rounded-[32px] border border-[#D8E4D3] bg-gradient-to-br from-[#F5FBF2] via-white to-[#EFF6ED] p-8 shadow-sm">
              <div className="grid gap-8 lg:grid-cols-[1.4fr_0.8fr]">
                <div className="space-y-6">
                  <div className="space-y-3">
                    <p className="text-sm uppercase tracking-[0.3em] text-[#2B6F38] font-semibold">Group marketplace</p>
                    <h1 className="text-4xl font-semibold text-[#172B12]">Shop trusted member listings</h1>
                    <p className="max-w-2xl text-base leading-8 text-[#4B5A45]">
                      Discover products, services, and fast loan offerings listed by group members. Browse, search, and buy with confidence from our community marketplace.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {isAuthenticated ? (
                      <Button onClick={() => navigate('/dashboard')} className="min-w-[160px] bg-[#172B12] text-white hover:bg-[#0f2409]">
                        Go to Dashboard
                      </Button>
                    ) : (
                      <>
                        <Button variant="secondary" onClick={() => navigate('/login')} className="bg-[#172B12] text-white hover:bg-[#0f2409]">
                          Member Login
                        </Button>
                        <Button onClick={() => navigate('/register')} className="bg-[#172B12] text-white hover:bg-[#0f2409]">
                          Register Now
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <div className="rounded-[32px] border border-[#D8E4D3] bg-white p-6 shadow-sm">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 text-[#2B6F38]">
                      <Sparkles className="h-5 w-5" />
                      <span className="font-semibold">Product categories</span>
                    </div>
                    <p className="text-sm text-[#4B5A45]">
                      Tap a category to browse products from members. All icons represent product categories added manually by the group.
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {categories.filter((category) => category.id !== 'quick-loan').map((category) => {
                        const Icon = ICON_MAP[category.id] || ICON_MAP.default;
                        const count = products.filter((product) => product.category === category.id).length;
                        return (
                          <button
                            key={category.id}
                            type="button"
                            onClick={() => handleSelectCategory(category.id)}
                            className="group overflow-hidden rounded-[28px] border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-[#2B6F38] hover:bg-[#F0F9F2]"
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-[#ECF8E9] text-[#2B6F38] shadow-[0_12px_30px_-22px_rgba(43,111,56,0.8)] transition group-hover:bg-[#DFF3DE]">
                                <Icon className="h-8 w-8" />
                              </div>
                              <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.16em]">{count} items</Badge>
                            </div>
                            <div className="mt-5 space-y-2">
                              <div className="text-lg font-semibold text-[#172B12]">{category.name}</div>
                              <p className="text-sm leading-6 text-[#4B5A45]">{category.description}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <div className="grid gap-4 sm:grid-cols-2">
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
                    Non-members can request a quick loan through the marketplace, and sellers can share this service with customers who need immediate support.
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
                    Create listings quickly and reach buyers on the public shop page.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-[#4B5A45]">
                    Choose a category and upload your product details. Your listing appears publicly once published.
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
            </div>
          </div>

          <aside className="space-y-4">
            <Card className="border border-slate-200 bg-white">
              <CardHeader>
                <CardTitle className="text-lg">Top categories</CardTitle>
                <CardDescription>Browse by category or add a new one if you are an admin.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  <button
                    className={`relative block rounded-3xl border px-4 py-4 text-left transition ${selectedCategory === 'all' ? 'border-[#2B6F38] bg-[#ECF8E9]' : 'border-slate-200 bg-white hover:border-[#2B6F38]/60'}`}
                    type="button"
                    onClick={() => handleSelectCategory('all')}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-[#1B3A16]">All categories</span>
                      <Badge variant="secondary">{products.length}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-[#4B5A45]">Browse every item and loan service available in the market.</p>
                  </button>
                  {categories.map((category) => {
                    const Icon = ICON_MAP[category.id] || ICON_MAP.default;
                    const count = products.filter((product) => product.category === category.id).length;
                    return (
                      <button
                        key={category.id}
                        className={`relative block w-full rounded-3xl border px-4 py-4 text-left transition ${selectedCategory === category.id ? 'border-[#2B6F38] bg-[#ECF8E9]' : 'border-slate-200 bg-white hover:border-[#2B6F38]/60'}`}
                        type="button"
                        onClick={() => handleSelectCategory(category.id)}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="h-5 w-5 text-[#2B6F38]" />
                          <div>
                            <div className="font-semibold text-[#1B3A16]">{category.name}</div>
                            <p className="text-sm text-[#4B5A45]">{category.description}</p>
                          </div>
                        </div>
                        <Badge className="mt-3" variant="secondary">{category.id === 'quick-loan' ? 'Service' : `${count} products`}</Badge>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
              {isAdmin && (
                <CardFooter>
                  <Dialog open={addCategoryOpen} onOpenChange={setAddCategoryOpen}>
                    <DialogTrigger asChild>
                      <Button className="w-full bg-[#172B12] text-white hover:bg-[#0f2409]">
                        <Plus className="mr-2 h-4 w-4" /> Add category
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Add a new category</DialogTitle>
                        <DialogDescription>New categories will appear on the shop landing page for everyone.</DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleAddCategory} className="space-y-4">
                        <div>
                          <Label htmlFor="category-name" className="text-sm font-medium text-slate-700">Category name</Label>
                          <Input
                            id="category-name"
                            value={newCategoryName}
                            onChange={(event) => setNewCategoryName(event.target.value)}
                            placeholder="e.g. Clothing"
                          />
                        </div>
                        <div>
                          <Label htmlFor="category-description" className="text-sm font-medium text-slate-700">Description</Label>
                          <Textarea
                            id="category-description"
                            value={newCategoryDescription}
                            onChange={(event) => setNewCategoryDescription(event.target.value)}
                            placeholder="Short description for this category"
                            rows={4}
                          />
                        </div>
                        <Button type="submit" className="bg-[#172B12] text-white hover:bg-[#0f2409]">Create category</Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </CardFooter>
              )}
            </Card>

            <Card className="border border-slate-200 bg-white">
              <CardHeader>
                <CardTitle className="text-lg">How it works</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-[#4B5A45]">
                <p>1. Choose a category to browse products or request a loan.</p>
                <p>2. Members can list products by category with a simple product form.</p>
                <p>3. Guests can view products and send purchase interest quickly.</p>
                <p>4. Admins can add new categories so the marketplace grows with demand.</p>
              </CardContent>
            </Card>
          </aside>
        </div>

        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-[#172B12]">{selectedCategory === 'all' ? 'All products and services' : categoryMap[selectedCategory]?.name || 'Category'}</h2>
              <p className="mt-2 text-sm text-[#4B5A45]">
                {selectedCategory === 'all'
                  ? 'Explore everything that members and the group marketplace have to offer.'
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

          <div className="mt-6 max-w-xl">
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search products, sellers, or descriptions"
              className="w-full rounded-3xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm focus:border-[#2B6F38] focus:ring-2 focus:ring-[#2B6F38]/20"
            />
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
        </div>
      </div>

      <Dialog open={addProductOpen} onOpenChange={setAddProductOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>List a new product</DialogTitle>
            <DialogDescription>Members can publish items for sale by selecting a category and entering product details.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddProduct} className="space-y-4">
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

      <Dialog open={quickLoanOpen} onOpenChange={setQuickLoanOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Request a quick loan</DialogTitle>
            <DialogDescription>Fill in your contact details and we will follow up with loan terms.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRequestQuickLoan} className="space-y-4">
            <div>
              <Label htmlFor="loan-name" className="text-sm font-medium text-slate-700">Full name</Label>
              <Input id="loan-name" value={loanName} onChange={(event) => setLoanName(event.target.value)} placeholder="Your name" />
            </div>
            <div>
              <Label htmlFor="loan-email" className="text-sm font-medium text-slate-700">Email</Label>
              <Input id="loan-email" value={loanEmail} onChange={(event) => setLoanEmail(event.target.value)} placeholder="you@example.com" />
            </div>
            <div>
              <Label htmlFor="loan-phone" className="text-sm font-medium text-slate-700">Phone number</Label>
              <Input id="loan-phone" value={loanPhone} onChange={(event) => setLoanPhone(event.target.value)} placeholder="Optional" />
            </div>
            <div>
              <Label htmlFor="loan-amount" className="text-sm font-medium text-slate-700">Loan amount (UGX)</Label>
              <Input id="loan-amount" type="number" value={loanAmount} onChange={(event) => setLoanAmount(event.target.value)} placeholder="e.g. 100000" />
            </div>
            <div>
              <Label htmlFor="loan-purpose" className="text-sm font-medium text-slate-700">Loan purpose</Label>
              <Textarea id="loan-purpose" value={loanPurpose} onChange={(event) => setLoanPurpose(event.target.value)} placeholder="Tell us why you need this loan" rows={4} />
            </div>
            <Button type="submit" className="bg-[#172B12] text-white hover:bg-[#0f2409]">Submit loan request</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={purchaseOpen} onOpenChange={setPurchaseOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Purchase request</DialogTitle>
            <DialogDescription>Send your contact details so the seller can follow up.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePurchaseRequest} className="space-y-4">
            <div className="text-sm text-[#4B5A45]">
              <p className="font-semibold text-[#172B12]">Product</p>
              <p>{purchaseProduct?.title}</p>
              <p className="text-xs text-[#6B7C61]">Seller: {purchaseProduct?.sellerName}</p>
            </div>
            <div>
              <Label htmlFor="purchase-name" className="text-sm font-medium text-slate-700">Your name</Label>
              <Input id="purchase-name" value={purchaseName} onChange={(event) => setPurchaseName(event.target.value)} placeholder="Your name" />
            </div>
            <div>
              <Label htmlFor="purchase-email" className="text-sm font-medium text-slate-700">Email</Label>
              <Input id="purchase-email" value={purchaseEmail} onChange={(event) => setPurchaseEmail(event.target.value)} placeholder="you@example.com" />
            </div>
            <div>
              <Label htmlFor="purchase-phone" className="text-sm font-medium text-slate-700">Phone</Label>
              <Input id="purchase-phone" value={purchasePhone} onChange={(event) => setPurchasePhone(event.target.value)} placeholder="Optional" />
            </div>
            <div>
              <Label htmlFor="purchase-note" className="text-sm font-medium text-slate-700">Message</Label>
              <Textarea id="purchase-note" value={purchaseNote} onChange={(event) => setPurchaseNote(event.target.value)} placeholder="Write a short message to the seller" rows={4} />
            </div>
            <Button type="submit" className="bg-[#172B12] text-white hover:bg-[#0f2409]">Send purchase request</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Label = ({ className, ...props }) => (
  <label className={`block text-sm font-medium text-slate-700 ${className || ''}`} {...props} />
);

export default ShopPage;
