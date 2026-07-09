import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Toaster, toast } from 'sonner';
import { ShoppingCart, Heart, Share2, ChevronLeft, ChevronRight, MapPin, Shield, ArrowLeft, X } from 'lucide-react';
import { resolveImageUrl } from '../lib/utils';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';

function getImageUrl(imageUrl) {
  return resolveImageUrl(imageUrl, process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000');
}

function ProductDetailPage() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentImgIndex, setCurrentImgIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [addingToCart, setAddingToCart] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [cartCount, setCartCount] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('cash_hub_cart') || '[]');
      return stored.reduce((sum, item) => sum + (item.quantity || 0), 0);
    } catch {
      return 0;
    }
  });
  const [cartItems, setCartItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cash_hub_cart') || '[]'); }
    catch { return []; }
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [buyNowOpen, setBuyNowOpen] = useState(false);
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerNote, setBuyerNote] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [expandedDesc, setExpandedDesc] = useState(false);

  useEffect(() => {
    const fetchProduct = async () => {
      setLoading(true);
      try {
        const response = await axios.get(`${API_URL}/api/products/${productId}`);
        const data = response.data;
        if (!data || !data.id) {
          console.warn('Product API returned empty or missing id for:', productId);
          setProduct(null);
        } else {
          setProduct(data);
        }
      } catch (error) {
        console.error('Error fetching product, falling back to list:', error);
        try {
          const listRes = await axios.get(`${API_URL}/api/products`);
          const found = (listRes.data || []).find(p => p.id === productId);
          setProduct(found || null);
        } catch (listError) {
          console.error('Error fetching product list:', listError);
          setProduct(null);
        }
      } finally {
        setLoading(false);
      }
    };

    const syncCart = () => {
      try {
        const stored = JSON.parse(localStorage.getItem('cash_hub_cart') || '[]');
        setCartItems(stored);
        setCartCount(stored.reduce((sum, item) => sum + (item.quantity || 0), 0));
      } catch {
        setCartItems([]);
        setCartCount(0);
      }
    };

    if (productId) {
      fetchProduct();
      syncCart();
    } else {
      setLoading(false);
      setProduct(null);
    }
  }, [productId]);

  const allImages = [];
  if (product?.image_urls && product.image_urls.length > 0) {
    allImages.push(...product.image_urls);
  } else if (product?.image_url) {
    allImages.push(product.image_url);
  } else if (product?.imageUrl) {
    allImages.push(product.imageUrl);
  }

  const productImageUrl = getImageUrl(allImages[0]) || null;

  useEffect(() => {
    if (!product) {
      document.title = 'Class One Savings Group';
      return;
    }

    const title = `${product.title} | Class One Savings Group`;
    const description = product.description || `Discover ${product.title} on Class One Savings Group.`;
    const imageUrl = productImageUrl || `${window.location.origin}/classOne-logo.png`;

    const setMetaTag = (selector, attrName, attrValue, content) => {
      let tag = document.querySelector(selector);
      if (!tag) {
        tag = document.createElement('meta');
        if (selector.startsWith('meta[')) {
          tag.setAttribute(attrName, attrValue);
        } else {
          tag.setAttribute('name', attrValue);
        }
        document.head.appendChild(tag);
      }
      tag.setAttribute('content', content);
    };

    document.title = title;
    setMetaTag('meta[name="description"]', 'name', 'description', description);
    setMetaTag('meta[property="og:title"]', 'property', 'og:title', title);
    setMetaTag('meta[property="og:description"]', 'property', 'og:description', description);
    setMetaTag('meta[property="og:image"]', 'property', 'og:image', imageUrl);
    setMetaTag('meta[property="og:image:secure_url"]', 'property', 'og:image:secure_url', imageUrl);
    setMetaTag('meta[property="og:image:alt"]', 'property', 'og:image:alt', `${product.title} on Class One Savings Group`);
    setMetaTag('meta[property="og:url"]', 'property', 'og:url', window.location.href);
    setMetaTag('meta[property="og:type"]', 'property', 'og:type', 'product');
    setMetaTag('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
    setMetaTag('meta[name="twitter:title"]', 'name', 'twitter:title', title);
    setMetaTag('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    setMetaTag('meta[name="twitter:image"]', 'name', 'twitter:image', imageUrl);
    setMetaTag('meta[name="twitter:image:alt"]', 'name', 'twitter:image:alt', `${product.title} on Class One Savings Group`);
  }, [product, productImageUrl]);

  const goToPrev = (e) => {
    e.preventDefault();
    setCurrentImgIndex((prev) => (prev === 0 ? allImages.length - 1 : prev - 1));
  };

  const goToNext = (e) => {
    e.preventDefault();
    setCurrentImgIndex((prev) => (prev === allImages.length - 1 ? 0 : prev + 1));
  };

  const handleAddToCart = async () => {
    if (!isAuthenticated) {
      toast.error('Please log in to add items to cart');
      navigate('/login');
      return;
    }
    setAddingToCart(true);
    try {
      const storedCart = JSON.parse(localStorage.getItem('cash_hub_cart') || '[]');
      const existingItem = storedCart.find(item => item.productId === product.id);
      if (existingItem) {
        existingItem.quantity += quantity;
      } else {
        storedCart.push({
          productId: product.id,
          quantity: quantity,
          product: {
            id: product.id,
            title: product.title,
            price: product.price,
            image: allImages[0],
            sellerName: product.sellerName || product.seller_name || 'Member',
          },
        });
      }
      localStorage.setItem('cash_hub_cart', JSON.stringify(storedCart));
      setCartItems(storedCart);
      const totalQty = storedCart.reduce((sum, item) => sum + (item.quantity || 0), 0);
      setCartCount(totalQty);
      toast.success(`${quantity} item(s) added to cart`);
      setAddedToCart(true);
      setQuantity(1);
      setTimeout(() => setAddedToCart(false), 1500);
    } catch (error) {
      toast.error('Failed to add to cart');
    } finally {
      setAddingToCart(false);
    }
  };

  const handleBuyNow = () => {
    if (!isAuthenticated) {
      toast.error('Please log in to purchase');
      navigate('/login');
      return;
    }
    setBuyerName(user?.name || '');
    setBuyerEmail(user?.email || '');
    setBuyerPhone('');
    setBuyerNote('');
    setBuyNowOpen(true);
  };

  const getCart = () => {
    try { return JSON.parse(localStorage.getItem('cash_hub_cart') || '[]'); }
    catch { return []; }
  };

  const updateCartItemQuantity = (productId, quantity) => {
    const storedCart = getCart();
    if (quantity <= 0) {
      const filtered = storedCart.filter(item => item.productId !== productId);
      localStorage.setItem('cash_hub_cart', JSON.stringify(filtered));
      setCartItems(filtered);
      const totalQty = filtered.reduce((sum, item) => sum + (item.quantity || 0), 0);
      setCartCount(totalQty);
    } else {
      const updated = storedCart.map(item => item.productId === productId ? { ...item, quantity } : item);
      localStorage.setItem('cash_hub_cart', JSON.stringify(updated));
      setCartItems(updated);
      const totalQty = updated.reduce((sum, item) => sum + (item.quantity || 0), 0);
      setCartCount(totalQty);
    }
  };

  const removeFromCart = (productId) => {
    const storedCart = getCart();
    const filtered = storedCart.filter(item => item.productId !== productId);
    localStorage.setItem('cash_hub_cart', JSON.stringify(filtered));
    setCartItems(filtered);
    const totalQty = filtered.reduce((sum, item) => sum + (item.quantity || 0), 0);
    setCartCount(totalQty);
  };

  const getCartTotal = () => {
    return cartItems.reduce((total, item) => total + (item.product?.price || 0) * (item.quantity || 0), 0);
  };

  const submitBuyNowOrder = async () => {
    if (!buyerName.trim() || !buyerPhone.trim()) {
      toast.error('Please enter your name and phone number');
      return;
    }
    setSubmittingOrder(true);
    try {
      const orderData = {
        productId: product.id,
        productTitle: product.title,
        productPrice: product.price,
        sellerName: product.sellerName || product.seller_name || 'Member',
        buyerName: buyerName,
        buyerEmail: buyerEmail,
        buyerPhone: buyerPhone,
        note: buyerNote,
        total: Number(product.price) * quantity,
        status: 'pending',
        quantity: quantity,
      };
      await axios.post(`${API_URL}/api/orders`, orderData);
      toast.success('Order placed successfully! The seller will contact you shortly.');
      setBuyNowOpen(false);
      setQuantity(1);
    } catch (error) {
      toast.error('Failed to place order. Please try again.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleWishlist = () => {
    const wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
    const exists = wishlist.some(item => item.id === product.id);
    if (exists) {
      toast.info('Already in wishlist');
      return;
    }
    wishlist.push({
      id: product.id,
      title: product.title,
      price: product.price,
      image: allImages[0],
      sellerName: product.sellerName || product.seller_name || 'Member',
    });
    localStorage.setItem('wishlist', JSON.stringify(wishlist));
    toast.success('Added to wishlist');
  };

  const handleShare = async () => {
    const previewUrl = `${window.location.origin}/product/${product?.id || productId}`;
    const shareData = {
      title: product.title,
      text: `Check out this amazing ${product.title} on Class One Savings Group — a great deal you won't want to miss!`,
      url: previewUrl,
    };

    const shareImageUrl = productImageUrl || `${window.location.origin}/classOne-logo.png`;

    if (typeof File !== 'undefined' && typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [new File(['test'], 'test.png', { type: 'image/png' })] })) {
      try {
        const response = await fetch(shareImageUrl, { mode: 'cors' });
        if (!response.ok) throw new Error('Failed to fetch product image');
        const blob = await response.blob();
        const file = new File([blob], `product-${product?.id || 'share'}.jpg`, { type: blob.type || 'image/jpeg' });
        if (navigator.canShare({ ...shareData, files: [file] })) {
          await navigator.share({ ...shareData, files: [file] });
          return;
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        if (err.name !== 'AbortError') {
          fallbackShare();
        }
      }
    } else {
      fallbackShare();
    }
  };

  const fallbackShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Product link copied to clipboard');
    } catch {
      toast.error('Unable to share this product');
    }
  };

  const handleVisitStore = () => {
    navigate(`/shop?seller=${encodeURIComponent(product.sellerName || product.seller_name || 'Member')}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[#2C5530] border-t-transparent rounded-full animate-spin" />
          <p className="text-[#5C665D] font-medium">Loading product...</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl font-semibold text-[#172B12] mb-4">Product not found</p>
          <Button onClick={() => navigate('/')} className="bg-[#172B12] text-white hover:bg-[#0f2409]">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Shop
          </Button>
        </div>
      </div>
    );
  }

  const price = Number(product.price);
  const originalPrice = Math.round(price * 1.2);
  const discountPercent = Math.round(((originalPrice - price) / originalPrice) * 100);

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-[#4B5A45] hover:text-[#2B6F38] mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-3 sticky top-4">
              <div className="relative overflow-hidden rounded-xl mb-3 bg-slate-50">
                <img
                  src={getImageUrl(allImages[currentImgIndex])}
                  alt={product.title}
                  className="w-full h-96 object-cover"
                />
                {allImages.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={goToPrev}
                      className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/90 hover:bg-white text-slate-700 shadow-lg flex items-center justify-center transition-all"
                      aria-label="Previous image"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={goToNext}
                      className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/90 hover:bg-white text-slate-700 shadow-lg flex items-center justify-center transition-all"
                      aria-label="Next image"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </>
                )}
              </div>
              {allImages.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {allImages.map((img, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setCurrentImgIndex(idx);
                      }}
                      className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                        idx === currentImgIndex
                          ? 'border-[#2B6F38] ring-2 ring-[#2B6F38]/20'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <img
                        src={getImageUrl(img)}
                        alt={`${product.title} ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
              {allImages.length <= 1 && (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {[allImages[0]].map((img, idx) => (
                    <div
                      key={idx}
                      className="shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 border-[#2B6F38] ring-2 ring-[#2B6F38]/20"
                    >
                      <img
                        src={getImageUrl(img)}
                        alt={`${product.title} ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-8 space-y-5">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-[#172B12] leading-tight mb-2">
                {product.title}
              </h1>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={handleVisitStore}
                  className="text-sm text-[#4B5A45] underline cursor-pointer hover:text-[#2B6F38] transition-colors"
                >
                  Visit the Store
                </button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCartOpen(true)}
                  className="border-slate-200 text-[#4B5A45] hover:bg-slate-50 relative"
                >
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  Cart ({cartCount})
                </Button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-baseline gap-3 mb-3">
                <span className="text-sm text-[#2B6F38] font-medium">{discountPercent}% off</span>
                <span className="text-xs text-[#6B7C61] line-through">UGX {originalPrice.toLocaleString()}</span>
              </div>
              <p className="text-3xl font-bold text-[#2B6F38] mb-4">UGX {price.toLocaleString()}</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-[#172B12]">Quantity</label>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
                    className="h-10 w-10 rounded-xl border border-slate-200 flex items-center justify-center text-[#172B12] hover:bg-slate-50 transition-colors text-lg font-medium"
                  >
                    -
                  </button>
                  <span className="flex-1 text-center font-semibold text-[#172B12]">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity((prev) => prev + 1)}
                    className="h-10 w-10 rounded-xl border border-slate-200 flex items-center justify-center text-[#172B12] hover:bg-slate-50 transition-colors text-lg font-medium"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="space-y-2 mt-4">
                <Button
                  onClick={handleAddToCart}
                  disabled={addingToCart}
                  className={`w-full h-12 text-base font-medium shadow-sm ${addedToCart ? 'bg-[#2B6F38] text-white hover:bg-[#1B5E20]' : 'bg-[#172B12] text-white hover:bg-[#0f2409]'}`}
                >
                  <ShoppingCart className="h-5 w-5 mr-2" />
                  {addedToCart ? 'Added ✓' : addingToCart ? 'Adding...' : 'Add to Cart'}
                </Button>
                <Button
                  onClick={handleBuyNow}
                  disabled={addingToCart}
                  className="w-full h-12 bg-white text-[#172B12] border border-[#172B12] hover:bg-[#ECF8E9] text-base font-medium shadow-sm"
                >
                  Buy Now
                </Button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold text-[#172B12] mb-3">About this item</h3>
              <ul className={`space-y-2 ${!expandedDesc && product.description && product.description.length > 200 ? 'line-clamp-5' : ''}`}>
                {(product.description || '').split('. ').filter(Boolean).map((text, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-[#4B5A45]">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#2B6F38]" />
                    <span>{text}{!text.endsWith('.') && '.'}</span>
                  </li>
                ))}
                {(!product.description || product.description.split('. ').filter(Boolean).length === 0) && (
                  <li className="flex items-start gap-2 text-sm text-[#4B5A45]">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#2B6F38]" />
                    <span>{product.description || 'No description available for this product.'}</span>
                  </li>
                )}
              </ul>
              {product.description && product.description.length > 200 && (
                <button
                  type="button"
                  onClick={() => setExpandedDesc(!expandedDesc)}
                  className="text-sm text-[#2B6F38] hover:underline mt-3 font-medium"
                >
                  {expandedDesc ? 'Show less' : 'Read more'}
                </button>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-[#4B5A45]" />
                  <span className="text-sm text-[#4B5A45]">Sold by: <span className="font-medium text-[#172B12]">{product.sellerName || product.seller_name || 'Member'}</span></span>
                </div>
                <Badge className="bg-[#ECF8E9] text-[#2B6F38] hover:bg-[#ECF8E9]">
                  <Shield className="h-3 w-3 mr-1" />
                  Secure
                </Badge>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleWishlist}
                className="border-slate-200 text-[#4B5A45] hover:bg-slate-50"
              >
                <Heart className="h-4 w-4 mr-2" />
                Wishlist
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleShare}
                className="border-slate-200 text-[#4B5A45] hover:bg-slate-50"
              >
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto flex flex-col">
          <DialogHeader>
            <DialogTitle>Shopping Cart</DialogTitle>
            <DialogDescription>Review your cart and checkout.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 flex-1">
            {cartItems.length === 0 ? (
              <p className="text-sm text-[#4B5A45]">Your cart is empty.</p>
            ) : (
              <>
                <div className="space-y-4">
                  {cartItems.map(item => (
                    <div key={item.productId} className="flex items-center justify-between py-2 border-t border-slate-100">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#172B12] truncate">{item.product?.title || 'Product'}</p>
                        <p className="text-xs text-[#4B5A45]">UGX {Number(item.product?.price || 0).toLocaleString()} x {item.quantity}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <button type="button" onClick={() => updateCartItemQuantity(item.productId, item.quantity - 1)} className="px-2 py-1 text-xs border border-slate-300 rounded">-</button>
                        <span className="text-xs px-2">{item.quantity}</span>
                        <button type="button" onClick={() => updateCartItemQuantity(item.productId, item.quantity + 1)} className="px-2 py-1 text-xs border border-slate-300 rounded">+</button>
                        <button type="button" onClick={() => removeFromCart(item.productId)} className="ml-2 text-xs text-red-600 hover:text-red-800">Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-slate-200 pt-4">
                  <p className="text-lg font-semibold text-[#172B12]">Grand Total: UGX {getCartTotal().toLocaleString()}</p>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={buyNowOpen} onOpenChange={setBuyNowOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Complete your purchase</DialogTitle>
            <DialogDescription>
              Enter your contact details so the seller can reach you.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-3 flex items-center gap-3">
              {allImages[0] && (
                <img src={getImageUrl(allImages[0])} alt={product.title} className="w-16 h-16 rounded-lg object-cover" />
              )}
              <div>
                <p className="text-sm font-semibold text-[#172B12]">{product.title}</p>
                <p className="text-xs text-[#4B5A45]">Qty: {quantity}</p>
                <p className="text-sm font-bold text-[#2B6F38]">UGX {(Number(product.price) * quantity).toLocaleString()}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="buyer-name">Full name</Label>
              <Input id="buyer-name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Your full name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="buyer-email">Email (optional)</Label>
              <Input id="buyer-email" type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="buyer-phone">Phone number</Label>
              <Input id="buyer-phone" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} placeholder="e.g. 0771 234567" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="buyer-note">Message to seller (optional)</Label>
              <Textarea id="buyer-note" value={buyerNote} onChange={(e) => setBuyerNote(e.target.value)} placeholder="Any special requests or questions" rows={3} />
            </div>
            <Button onClick={submitBuyNowOrder} disabled={submittingOrder} className="w-full bg-[#172B12] text-white hover:bg-[#0f2409]">
              {submittingOrder ? 'Placing order...' : `Place order — UGX ${(Number(product.price) * quantity).toLocaleString()}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ProductDetailPage;
