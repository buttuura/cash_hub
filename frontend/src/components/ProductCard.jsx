import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShoppingCart } from 'lucide-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

function ProductCard({ product, onAddToCart, onBuyNow, getImageUrl }) {
  const [currentImgIndex, setCurrentImgIndex] = useState(0);

  const allImages = [];
  if (product.image_urls && product.image_urls.length > 0) {
    allImages.push(...product.image_urls);
  } else if (product.image_url) {
    allImages.push(product.image_url);
  } else if (product.imageUrl) {
    allImages.push(product.imageUrl);
  }

  const displayImage = allImages[0];
  const hasMultipleImages = allImages.length > 1;

  const goToPrev = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentImgIndex((prev) => (prev === 0 ? allImages.length - 1 : prev - 1));
  };

  const goToNext = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentImgIndex((prev) => (prev === allImages.length - 1 ? 0 : prev + 1));
  };

  return (
    <Link to={`/product/${product.id}`} className="block">
      <Card className="group border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden">
      {allImages.length > 0 ? (
        <div className="relative overflow-hidden rounded-t-xl bg-slate-50">
          <img
            src={getImageUrl(allImages[currentImgIndex])}
            alt={product.title}
            className="h-56 w-full object-cover transition-opacity duration-300"
          />
          {hasMultipleImages && (
            <>
              <button
                type="button"
                onClick={goToPrev}
                className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white/90 hover:bg-white text-slate-700 shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Previous image"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={goToNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white/90 hover:bg-white text-slate-700 shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Next image"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                {allImages.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCurrentImgIndex(idx);
                    }}
                    className={`h-2 rounded-full transition-all ${
                      idx === currentImgIndex ? 'w-4 bg-white' : 'w-2 bg-white/60'
                    }`}
                    aria-label={`Go to image ${idx + 1}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="h-56 flex items-center justify-center rounded-t-xl bg-gradient-to-br from-[#F4F8EF] to-[#E8F0E3] border-b border-slate-200">
          <div className="text-center">
            <svg className="w-12 h-12 mx-auto text-[#4B5A45] mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-12 4h16a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <p className="text-sm font-medium text-[#4B5A45]">No image available</p>
          </div>
        </div>
      )}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg group-hover:text-[#2B6F38] transition-colors">{product.title}</CardTitle>
            <CardDescription className="mt-1">{product.description}</CardDescription>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-[#4B5A45] uppercase tracking-wider">Price</p>
            <p className="text-xl font-bold text-[#172B12]">UGX {Number(product.price).toLocaleString()}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-[#ECF8E9] flex items-center justify-center">
              <svg className="w-3 h-3 text-[#2B6F38]" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 016 0zM2 17a3 3 0 116 0 3 3 0 01-6 0zm14-3a3 3 0 110-6 3 3 0 010 6z" clipRule="evenodd" /></svg>
            </div>
            <span className="text-[#4B5A45]">Seller:</span>
            <span className="font-medium text-[#172B12] truncate max-w-[120px]">{product.sellerName || product.seller_name || 'Member'}</span>
          </div>
          <span className="text-xs text-[#6B7C61] bg-slate-100 px-2 py-1 rounded-full">
            {new Date(product.createdAt || product.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row gap-2 pt-4 border-t border-slate-100">
        <Button
          size="sm"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAddToCart(product); }}
          className="w-full sm:flex-1 bg-[#172B12] text-white hover:bg-[#0f2409] shadow-sm"
        >
          <ShoppingCart className="h-4 w-4 mr-2" />
          Add to Cart
        </Button>
        <Button
          size="sm"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onBuyNow(product); }}
          className="w-full sm:flex-1 bg-white text-[#172B12] border border-[#172B12] hover:bg-[#ECF8E9]"
        >
          Buy now
        </Button>
      </CardFooter>
    </Card>
    </Link>
  );
}

export default ProductCard;
