import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Toaster, toast } from 'sonner';
import { ShoppingCart, Heart, Share2, ChevronLeft, ChevronRight, Star, MapPin, Truck, Shield, ArrowLeft } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';

function getImageUrl(imageUrl) {
  if (!imageUrl) return null;
  return imageUrl.startsWith('http') ? imageUrl : `${API_URL}${imageUrl}`;
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
    if (productId) {
      fetchProduct();
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
      const storedCart = JSON.parse(localStorage.getItem('cart') || '[]');
      const existingItemIndex = storedCart.findIndex(
        item => item.id === product.id
      );
      if (existingItemIndex > -1) {
        storedCart[existingItemIndex].quantity += quantity;
      } else {
        storedCart.push({
          id: product.id,
          title: product.title,
          price: product.price,
          image: allImages[0],
          sellerName: product.sellerName || product.seller_name || 'Member',
          quantity: quantity,
        });
      }
      localStorage.setItem('cart', JSON.stringify(storedCart));
      toast.success('Added to cart');
      setQuantity(1);
    } catch (error) {
      toast.error('Failed to add to cart');
    } finally {
      setAddingToCart(false);
    }
  };

  const handleBuyNow = async () => {
    if (!isAuthenticated) {
      toast.error('Please log in to purchase');
      navigate('/login');
      return;
    }
    await handleAddToCart();
    navigate('/dashboard');
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: product.title,
          text: product.description,
          url: window.location.href,
        });
      } catch (err) {
        // User cancelled
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success('Link copied to clipboard');
    }
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

          <div className="lg:col-span-5 space-y-5">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-[#172B12] leading-tight mb-2">
                {product.title}
              </h1>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-[#4B5A45] underline cursor-pointer hover:text-[#2B6F38] transition-colors">
                  Visit the Store
                </span>
                <span className="text-[#EA580C] text-sm font-medium">
                  Amazon's Choice
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-orange-400 text-orange-400" />
                <Star className="h-4 w-4 fill-orange-400 text-orange-400" />
                <Star className="h-4 w-4 fill-orange-400 text-orange-400" />
                <Star className="h-4 w-4 fill-orange-400 text-orange-400" />
                <Star className="h-4 w-4 text-slate-300" />
              </div>
              <span className="text-sm text-[#EA580C] font-medium">4.3 out of 5</span>
              <span className="text-sm text-[#4B5A45]">(1,149 ratings)</span>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-baseline gap-3 mb-1">
                <span className="text-sm text-[#EA580C] font-medium">{discountPercent}% off</span>
                <span className="text-xs text-[#6B7C61] line-through">UGX {originalPrice.toLocaleString()}</span>
              </div>
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold text-[#EA580C]">UGX {price.toLocaleString()}</span>
                <span className="text-xs text-[#6B7C61]">per item</span>
              </div>
            </div>

            <div className="bg-gradient-to-br from-[#FFF7ED] to-[#FFF1F2] rounded-xl border border-orange-100 p-4">
              <div className="flex items-start gap-3">
                <Truck className="h-5 w-5 text-[#EA580C] mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-[#172B12]">FREE delivery <span className="text-[#EA580C]">Thursday, 2 July</span></p>
                  <p className="text-xs text-[#6B7C61] mt-1">Or fastest delivery <span className="text-[#EA580C] font-medium">Tomorrow, 1 July</span></p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold text-[#172B12] mb-3">About this item</h3>
              <ul className="space-y-2">
                {(product.description || '').split('. ').filter(Boolean).slice(0, 5).map((text, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-[#4B5A45]">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#2B6F38]" />
                    <span>{text}{!text.endsWith('.') && '.'}</span>
                  </li>
                ))}
                {(!product.description || product.description.split('. ').filter(Boolean).length < 3) && (
                  <li className="flex items-start gap-2 text-sm text-[#4B5A45]">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#2B6F38]" />
                    <span>{product.description || 'No description available for this product.'}</span>
                  </li>
                )}
              </ul>
              {product.description && product.description.length > 200 && (
                <button
                  type="button"
                  onClick={() => toast.info('Full description: ' + product.description)}
                  className="text-sm text-[#2B6F38] hover:underline mt-3 font-medium"
                >
                  Read more
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
                onClick={() => toast.success('Added to wishlist')}
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

          <div className="lg:col-span-3">
            <div className="lg:sticky lg:top-4 space-y-4">
              <Card className="rounded-2xl border border-slate-200 shadow-sm">
                <CardContent className="p-5 space-y-4">
                  <div>
                    <p className="text-sm text-[#4B5A45] font-medium mb-1">Deal Price</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-[#EA580C]">UGX {price.toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-[#6B7C61] line-through mt-1">UGX {originalPrice.toLocaleString()}</p>
                  </div>

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

                  <div className="space-y-2">
                    <Button
                      onClick={handleAddToCart}
                      disabled={addingToCart}
                      className="w-full h-12 bg-[#172B12] text-white hover:bg-[#0f2409] text-base font-medium shadow-sm"
                    >
                      <ShoppingCart className="h-5 w-5 mr-2" />
                      {addingToCart ? 'Adding...' : 'Add to Cart'}
                    </Button>
                    <Button
                      onClick={handleBuyNow}
                      disabled={addingToCart}
                      className="w-full h-12 bg-[#EA580C] text-white hover:bg-[#C2410C] text-base font-medium shadow-sm"
                    >
                      Buy Now
                    </Button>
                  </div>

                  <div className="border-t border-slate-100 pt-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-[#4B5A45]">
                      <Truck className="h-4 w-4" />
                      <span>FREE delivery Thursday, 2 July</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-[#4B5A45]">
                      <Shield className="h-4 w-4" />
                      <span>FREE Returns</span>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-3 text-xs text-[#6B7C61]">
                    <p className="font-medium text-[#172B12] mb-1">Seller Information</p>
                    <p>Sold by: <span className="font-medium text-[#172B12]">{product.sellerName || product.seller_name || 'Member'}</span></p>
                    <p>Secure transaction</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductDetailPage;
