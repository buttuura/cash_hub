import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function resolveImageUrl(imageUrl, baseUrl = process.env.REACT_APP_BACKEND_URL) {
  if (!imageUrl) return null;

  const value = String(imageUrl).trim();
  if (!value) return null;

  if (value.startsWith('data:image/')) return value;
  if (/^https?:\/\//i.test(value) || value.startsWith('//')) {
    return value.startsWith('//') ? `https:${value}` : value;
  }

  const normalizedBase = (baseUrl || '').replace(/\/$/, '');
  const normalizedPath = value.replace(/^\/+/, '');

  if (normalizedBase) {
    return `${normalizedBase}/${normalizedPath}`;
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/${normalizedPath}`;
  }

  return `/${normalizedPath}`;
}
