import React from 'react';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Share2 } from 'lucide-react';
import { toast } from 'sonner';

const PUBLIC_APP_URL = process.env.REACT_APP_PUBLIC_APP_URL || 'https://c1group.site';

const ProductShareButton = ({ product, className = '' }) => {
  const handleShare = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const productUrl = `${PUBLIC_APP_URL}/product/${encodeURIComponent(product.id)}`;
    const shareData = {
      title: product.title,
      text: `Check out ${product.title} on Class One Savings Group.`,
      url: productUrl,
    };

    if (Capacitor.isNativePlatform()) {
      try {
        await Share.share({
          ...shareData,
          dialogTitle: 'Share product',
        });
        return;
      } catch (error) {
        if (error.name === 'AbortError') return;
      }
    } else if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        if (error.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(productUrl);
      toast.success('Product link copied to clipboard');
    } catch {
      toast.error('Unable to share this product. Please copy its link from the address bar.');
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label={`Share ${product.title}`}
      className={`inline-flex items-center justify-center gap-1 rounded-full border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs font-semibold text-[#172B12] shadow-md backdrop-blur-sm transition-colors hover:bg-[#ECF8E9] ${className}`}
    >
      <Share2 className="h-3.5 w-3.5" />
      <span>Share</span>
    </button>
  );
};

export default ProductShareButton;
