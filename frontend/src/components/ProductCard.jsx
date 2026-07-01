import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
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
              className="h-28 w-full object-cover transition-opacity duration-300"
            />
            {hasMultipleImages && (
              <>
                <button
                  type="button"
                  onClick={goToPrev}
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-white/90 hover:bg-white text-slate-700 shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={goToNext}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-white/90 hover:bg-white text-slate-700 shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Next image"
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
                <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1">
                  {allImages.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCurrentImgIndex(idx);
                      }}
                      className={`h-1.5 rounded-full transition-all ${
                        idx === currentImgIndex ? 'w-3 bg-white' : 'w-1.5 bg-white/60'
                      }`}
                      aria-label={`Go to image ${idx + 1}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="h-28 flex items-center justify-center rounded-t-xl bg-gradient-to-br from-[#F4F8EF] to-[#E8F0E3] border-b border-slate-200">
            <div className="text-center">
              <svg className="w-8 h-8 mx-auto text-[#4B5A45] mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-12 4h16a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <p className="text-xs font-medium text-[#4B5A45]">No image</p>
            </div>
          </div>
        )}
        <div className="p-3">
          <p className="line-clamp-2 text-xs font-semibold leading-4 text-[#172B12] mb-1">{product.title}</p>
          {product.description && (
            <p className="line-clamp-2 text-xs text-[#4B5A45] mb-2">{product.description}</p>
          )}
          <p className="text-xs font-bold text-[#2B6F38] mb-2">UGX {Number(product.price).toLocaleString()}</p>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAddToCart(product); }}
              className="flex-1 h-6 px-1 text-[10px] bg-[#172B12] text-white hover:bg-[#0f2409] shadow-sm"
            >
              <ShoppingCart className="h-3 w-3 mr-1" />
              Add
            </Button>
            <Button
              size="sm"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onBuyNow(product); }}
              className="flex-1 h-6 px-1 text-[10px] bg-white text-[#172B12] border border-[#172B12] hover:bg-[#ECF8E9]"
            >
              Buy
            </Button>
          </div>
        </div>
      </Card>
    </Link>
  );
}

export default ProductCard;
