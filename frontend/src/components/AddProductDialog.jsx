import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/card';
import { ShoppingCart } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';

const DEFAULT_CATEGORIES = [
  { id: 'food', name: 'Food', description: 'Fresh meals, groceries and snacks sold by group members.' },
  { id: 'construction-materials', name: 'Construction Materials', description: 'Tools, cement, timber and supplies from trusted community sellers.' },
  { id: 'graphic-material', name: 'Graphic Material', description: 'Design assets, prints and creative services for businesses.' },
  { id: 'electronics', name: 'Electronics', description: 'Gadgets, accessories and tech items available from members.' },
  { id: 'clothing', name: 'Clothing', description: 'Apparel, shoes and fashion accessories from community sellers.' },
  { id: 'health-beauty', name: 'Health & Beauty', description: 'Personal care, cosmetics, and wellness products.' },
  { id: 'home-garden', name: 'Home & Garden', description: 'Furniture, decor, and gardening supplies.' },
  { id: 'books', name: 'Books', description: 'Educational materials, novels and study resources.' },
  { id: 'sports', name: 'Sports', description: 'Sports equipment, fitness gear and outdoor items.' },
  { id: 'toys', name: 'Toys', description: 'Games, toys and kids entertainment products.' },
  { id: 'services', name: 'Services', description: 'Professional services offered by group members.' },
];

const AddProductDialog = ({
  open,
  onOpenChange,
  user,
  onProductAdded,
}) => {
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [newProductTitle, setNewProductTitle] = useState('');
  const [newProductDescription, setNewProductDescription] = useState('');
  const [newProductCategory, setNewProductCategory] = useState('food');
  const [newProductImages, setNewProductImages] = useState([]);
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductContactPhone, setNewProductContactPhone] = useState('');
  const [uploadingProduct, setUploadingProduct] = useState(false);

  const categoryMap = categories.reduce((acc, category) => {
    acc[category.id] = category;
    return acc;
  }, {});

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

  const handleImagesSelect = (event) => {
    const files = Array.from(event.target.files || []);
    const validFiles = files.filter((file) => {
      if (!file.type.startsWith('image/')) {
        toast.error('Please select only image files');
        return false;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Each image must be less than 5MB');
        return false;
      }
      return true;
    });
    if (validFiles.length > 0) {
      setNewProductImages((prev) => [...prev, ...validFiles]);
    }
  };

  const removeProductImage = (index) => {
    setNewProductImages((prev) => prev.filter((_, i) => i !== index));
  };

  const resetProductForm = () => {
    setNewProductTitle('');
    setNewProductDescription('');
    setNewProductPrice('');
    setNewProductContactPhone('');
    setNewProductCategory('food');
    setNewProductImages([]);
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
    const price = newProductPrice.trim() === '' ? null : Number(newProductPrice);
    const contactPhone = newProductContactPhone.trim();
    if (price === null && !contactPhone) {
      toast.error('Enter either a price or a contact phone number');
      return;
    }
    if (price !== null && price < 0) {
      toast.error('Price cannot be negative');
      return;
    }
    if (!user) {
      toast.error('Please log in to sell products');
      return;
    }

    setUploadingProduct(true);
    try {
      const formData = new FormData();
      formData.append('title', newProductTitle.trim());
      formData.append('description', newProductDescription.trim());
      if (price !== null) {
        formData.append('price', String(price));
      }
      formData.append('category', newProductCategory);
      if (contactPhone) {
        formData.append('contact_phone', contactPhone);
      }

      newProductImages.forEach((img) => {
        formData.append('images', img);
      });

      const authToken = localStorage.getItem('access_token');
      const headers = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response = await axios.post(`${API_URL}/api/products`, formData, {
        headers,
        withCredentials: true,
      });

      const responseData = response.data || {};
      const newProduct = {
        id: responseData.id || `prod-${Date.now()}`,
        category: newProductCategory,
        title: responseData.title || newProductTitle.trim(),
        description: responseData.description || newProductDescription.trim(),
        price: responseData.price ?? price,
        sellerName: user?.name || 'Member',
        seller_name: user?.name || 'Member',
        image_url: responseData.image_url,
        image_urls: responseData.image_urls || [],
        createdAt: responseData.created_at || new Date().toISOString(),
      };

      if (onProductAdded) {
        onProductAdded(newProduct);
      }
      toast.success('Product listed successfully');
      resetProductForm();
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to add product:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to list product. Please try again.';
      toast.error(errorMessage);
    } finally {
      setUploadingProduct(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            <Label htmlFor="product-price" className="text-sm font-medium text-slate-700">Price (UGX) <span className="text-slate-400">optional</span></Label>
            <Input
              id="product-price"
              type="number"
              value={newProductPrice}
              onChange={(event) => setNewProductPrice(event.target.value)}
              placeholder="e.g. 50000"
              disabled={uploadingProduct}
            />
            <p className="text-xs text-slate-400 mt-1">Leave empty if buyers should contact you directly</p>
          </div>
          <div>
            <Label htmlFor="product-contact-phone" className="text-sm font-medium text-slate-700">WhatsApp / Contact phone <span className="text-slate-400">optional if price is set</span></Label>
            <Input
              id="product-contact-phone"
              type="tel"
              value={newProductContactPhone}
              onChange={(event) => setNewProductContactPhone(event.target.value)}
              placeholder="e.g. +256 700 000 000"
              disabled={uploadingProduct}
            />
            <p className="text-xs text-slate-400 mt-1">Required when no price is provided</p>
          </div>
          <div>
            <Label htmlFor="product-images" className="text-sm font-medium text-slate-700">Product images</Label>
            <div className="mt-2 space-y-3">
              <input
                id="product-images"
                type="file"
                accept="image/*"
                multiple
                onChange={handleImagesSelect}
                disabled={uploadingProduct}
                className="block w-full text-sm text-slate-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-lg file:border-0
                  file:text-sm file:font-semibold
                  file:bg-[#172B12] file:text-white
                  hover:file:bg-[#0f2409]
                  disabled:opacity-50"
              />
              <p className="text-xs text-[#4B5A45]">Max file size: 5MB each. Supported formats: JPG, PNG, GIF, WebP. Select multiple images by holding Ctrl/Cmd.</p>
              <div className="flex flex-wrap gap-2">
                {newProductImages.map((_, index) => (
                  <div key={index} className="relative">
                    <img
                      src={URL.createObjectURL(newProductImages[index])}
                      alt={`Preview ${index + 1}`}
                      className="h-16 w-16 rounded object-cover border border-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => removeProductImage(index)}
                      disabled={uploadingProduct}
                      className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs hover:bg-red-600 disabled:opacity-50"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
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
  );
};

const SellProductsCard = ({ user, onProductAdded }) => {
  const [addProductOpen, setAddProductOpen] = useState(false);

  return (
    <>
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
            onClick={() => setAddProductOpen(true)}
            className="bg-[#172B12] text-white hover:bg-[#0f2409]"
          >
            List a product
          </Button>
        </CardFooter>
      </Card>

      <AddProductDialog
        open={addProductOpen}
        onOpenChange={setAddProductOpen}
        user={user}
        onProductAdded={onProductAdded}
      />
    </>
  );
};

export { AddProductDialog, SellProductsCard, DEFAULT_CATEGORIES };
