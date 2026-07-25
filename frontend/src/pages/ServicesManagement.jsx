import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  ShoppingCart,
  Store,
  Clock,
  CheckCircle,
  XCircle,
  FileDown,
  Trash2,
  ArrowDownRight,
  CreditCard,
  Phone,
  Mail,
  MessageCircle,
  Home,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { exportLoanAgreementPDF, exportSellerReceiptPDF, exportOrderReceiptPDF } from '../utils/pdfExport';
import { OFFICERS } from '../data/officers';
import { resolveImageUrl } from '../lib/utils';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';

const formatCurrency = (amount) => {
  return `UGX ${Number(amount || 0).toLocaleString()}`;
};

const buildWhatsAppUrl = (phone, message) => {
  if (!phone) return null;
  let digits = String(phone).replace(/[^\d]/g, '');
  if (digits.startsWith('0')) digits = '256' + digits.slice(1);
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
};

const SERVICES_TABS = [
  { id: 'orders', label: 'Orders', icon: ShoppingCart },
  { id: 'sellers', label: 'Sellers & Products', icon: Store },
  { id: 'quick-loans', label: 'Quick Loans', icon: CreditCard },
  { id: 'deleted', label: 'Deleted Orders', icon: Trash2 },
];

const ServicesManagement = () => {
  const navigate = useNavigate();
  const { user, logout, getAuthHeaders, isAdmin, isTreasurer } = useAuth();
  const [activeTab, setActiveTab] = useState('orders');
  const [dataLoading, setDataLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const [orders, setOrders] = useState([]);
  const [deletedOrders, setDeletedOrders] = useState([]);
  const [quickLoans, setQuickLoans] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [showQuickLoanPurpose, setShowQuickLoanPurpose] = useState(false);
  const [showQuickLoanOfficer, setShowQuickLoanOfficer] = useState(true);
  const [selectedOrders, setSelectedOrders] = useState(new Set());
  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [selectedQuickLoans, setSelectedQuickLoans] = useState(new Set());
  const [selectedDeletedOrders, setSelectedDeletedOrders] = useState(new Set());

  const fetchOrders = useCallback(async () => {
    setDataLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/orders`, { headers: getAuthHeaders() });
      setOrders(res.data);
    } catch (err) {
      console.error('Failed to load orders:', err);
      toast.error('Failed to load orders');
    } finally {
      setDataLoading(false);
    }
  }, [getAuthHeaders]);

  const fetchDeletedOrders = useCallback(async () => {
    setDataLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/orders/deleted`, { headers: getAuthHeaders() });
      setDeletedOrders(res.data);
    } catch (err) {
      console.error('Failed to load deleted orders:', err);
      toast.error('Failed to load deleted orders');
    } finally {
      setDataLoading(false);
    }
  }, [getAuthHeaders]);

  const fetchQuickLoans = useCallback(async () => {
    setDataLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/quick-loans`, { headers: getAuthHeaders() });
      setQuickLoans(res.data);
    } catch (err) {
      console.error('Failed to load quick loans:', err);
      toast.error('Failed to load quick loans');
    } finally {
      setDataLoading(false);
    }
  }, [getAuthHeaders]);

  const fetchAllProducts = useCallback(async () => {
    setDataLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/products`, { headers: getAuthHeaders() });
      setAllProducts(res.data);
    } catch (err) {
      console.error('Failed to load products:', err);
      toast.error('Failed to load products');
      setAllProducts([]);
    } finally {
      setDataLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (activeTab === 'orders') fetchOrders();
    if (activeTab === 'deleted') fetchDeletedOrders();
    if (activeTab === 'quick-loans') fetchQuickLoans();
    if (activeTab === 'sellers') fetchAllProducts();
  }, [activeTab, fetchOrders, fetchDeletedOrders, fetchQuickLoans, fetchAllProducts]);

  const handleOrderStatusChange = async (orderId, status) => {
    try {
      await axios.patch(`${API_URL}/api/orders/${orderId}/status`, {
        status,
        notes: '',
      }, { headers: getAuthHeaders() });
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
      toast.success(`Order ${status} successfully.`);
    } catch (err) {
      console.error('Failed to update order:', err);
      toast.error(err.response?.data?.detail || 'Failed to update order');
    }
  };

  const handleDownloadOrderReceipt = (order) => {
    exportOrderReceiptPDF(order, order.buyerName, order.buyerPhone, order.buyerEmail);
  };

  const handleApproveQuickLoan = async (id, approved) => {
    try {
      await axios.post(
        `${API_URL}/api/quick-loans/approve`,
        { transaction_id: id, approved },
        { headers: getAuthHeaders() }
      );
      toast.success(`Quick loan ${approved ? 'approved' : 'rejected'}`);
      setQuickLoans((prev) => prev.map((q) => (q.id === id ? { ...q, status: approved ? 'approved' : 'rejected' } : q)));
    } catch (err) {
      console.error('Failed to update quick loan:', err);
      toast.error(err.response?.data?.detail || 'Action failed');
    }
  };

  const handleDeleteQuickLoan = async (id) => {
    if (!window.confirm('Delete this quick loan request?')) return;
    try {
      await axios.delete(`${API_URL}/api/quick-loans/${id}`, { headers: getAuthHeaders() });
      setQuickLoans((prev) => prev.filter((q) => q.id !== id));
      toast.success('Quick loan deleted');
    } catch (err) {
      console.error('Failed to delete quick loan:', err);
      toast.error(err.response?.data?.detail || 'Failed to delete quick loan');
    }
  };

  const handleDownloadQuickLoanPDF = async (loan) => {
    const officer = OFFICERS.find((o) => o.code === loan.officer_code)
      || (loan.officer_name ? { name: loan.officer_name, code: loan.officer_code } : null);
    await exportLoanAgreementPDF(loan, officer, {
      download: true,
      collateralImage: loan.collateral_image,
    });
  };

  const handlePermanentDeleteOrder = async (orderId) => {
    if (!window.confirm('Permanently delete this order? This action cannot be undone and will remove it from all records.')) return;
    try {
      await axios.delete(`${API_URL}/api/orders/${orderId}/permanent`, { headers: getAuthHeaders() });
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      setDeletedOrders((prev) => prev.filter((o) => o.id !== orderId));
      setSelectedOrders((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
      toast.success('Order permanently deleted.');
    } catch (err) {
      console.error('Failed to permanently delete order:', err);
      toast.error(err.response?.data?.detail || 'Failed to permanently delete order');
      fetchOrders();
      fetchDeletedOrders();
    }
  };

  const handlePermanentDeleteSelected = async () => {
    const ids = Array.from(selectedOrders);
    if (ids.length === 0) return;
    if (!window.confirm(`Permanently delete ${ids.length} selected order(s)? This action cannot be undone.`)) return;
    try {
      await axios.post(`${API_URL}/api/orders/batch-permanent`,
        { order_ids: ids },
        { headers: getAuthHeaders() });
      setOrders((prev) => prev.filter((o) => !selectedOrders.has(o.id)));
      setDeletedOrders((prev) => prev.filter((o) => !selectedOrders.has(o.id)));
      setSelectedOrders(new Set());
      toast.success(`${ids.length} order(s) permanently deleted.`);
    } catch (err) {
      console.error('Failed to permanently delete selected orders:', err);
      toast.error(err.response?.data?.detail || 'Failed to permanently delete selected orders');
      fetchOrders();
      fetchDeletedOrders();
    }
  };

  const handleToggleSoldOut = async (product) => {
    const newSoldOut = !product.sold_out;
    try {
      const res = await axios.patch(`${API_URL}/api/products/${product.id}`, {
        sold_out: newSoldOut,
      }, { headers: getAuthHeaders() });
      setAllProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, ...res.data } : p)));
      toast.success(newSoldOut ? 'Marked as sold out.' : 'Marked as available.');
    } catch (err) {
      console.error('Failed to update product:', err);
      toast.error(err.response?.data?.detail || 'Failed to update product');
    }
  };

  const handleDeleteProduct = async (productId) => {
    if (!window.confirm('Delete this product? This action cannot be undone.')) return;
    try {
      await axios.delete(`${API_URL}/api/products/${productId}`, { headers: getAuthHeaders() });
      setAllProducts((prev) => prev.filter((p) => p.id !== productId));
      toast.success('Product deleted.');
    } catch (err) {
      console.error('Failed to delete product:', err);
      toast.error(err.response?.data?.detail || 'Failed to delete product');
    }
  };

  const handleDeleteAllProducts = async () => {
    if (!window.confirm('Delete ALL products? This action cannot be undone.')) return;
    try {
      await axios.delete(`${API_URL}/api/products`, { headers: getAuthHeaders() });
      setAllProducts([]);
      toast.success('All products deleted.');
    } catch (err) {
      console.error('Failed to delete all products:', err);
      toast.error(err.response?.data?.detail || 'Failed to delete all products');
    }
  };

  const handleDeleteAllSellers = async () => {
    if (!window.confirm('Delete ALL sellers? This action cannot be undone and will remove all seller accounts.')) return;
    try {
      await axios.delete(`${API_URL}/api/sellers`, { headers: getAuthHeaders() });
      setAllProducts([]);
      setSelectedProducts(new Set());
      toast.success('All sellers deleted.');
    } catch (err) {
      console.error('Failed to delete all sellers:', err);
      toast.error(err.response?.data?.detail || 'Failed to delete all sellers');
    }
  };

  const handleToggleProduct = (productId) => {
    setSelectedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const handleSelectAllProducts = (checked) => {
    if (checked) {
      setSelectedProducts(new Set(allProducts.map((p) => p.id)));
    } else {
      setSelectedProducts(new Set());
    }
  };

  const handleDeleteSelectedProducts = async () => {
    const ids = Array.from(selectedProducts);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} selected product(s)? This action cannot be undone.`)) return;
    try {
      await axios.post(
        `${API_URL}/api/products/batch-delete`,
        { order_ids: ids },
        { headers: getAuthHeaders() }
      );
      setAllProducts((prev) => prev.filter((p) => !selectedProducts.has(p.id)));
      setSelectedProducts(new Set());
      toast.success(`${ids.length} product(s) deleted.`);
    } catch (err) {
      console.error('Failed to delete selected products:', err);
      toast.error(err.response?.data?.detail || 'Failed to delete selected products');
    }
  };

  const handleToggleQuickLoan = (loanId) => {
    setSelectedQuickLoans((prev) => {
      const next = new Set(prev);
      if (next.has(loanId)) {
        next.delete(loanId);
      } else {
        next.add(loanId);
      }
      return next;
    });
  };

  const handleSelectAllQuickLoans = (checked) => {
    if (checked) {
      setSelectedQuickLoans(new Set(quickLoans.map((q) => q.id)));
    } else {
      setSelectedQuickLoans(new Set());
    }
  };

  const handleDeleteSelectedQuickLoans = async () => {
    const ids = Array.from(selectedQuickLoans);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} selected quick loan(s)? This action cannot be undone.`)) return;
    try {
      await axios.post(
        `${API_URL}/api/quick-loans/batch-delete`,
        { order_ids: ids },
        { headers: getAuthHeaders() }
      );
      setQuickLoans((prev) => prev.filter((q) => !selectedQuickLoans.has(q.id)));
      setSelectedQuickLoans(new Set());
      toast.success(`${ids.length} quick loan(s) deleted.`);
    } catch (err) {
      console.error('Failed to delete selected quick loans:', err);
      toast.error(err.response?.data?.detail || 'Failed to delete selected quick loans');
    }
  };

  const handleToggleDeletedOrder = (orderId) => {
    setSelectedDeletedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const handleSelectAllDeletedOrders = (checked) => {
    if (checked) {
      setSelectedDeletedOrders(new Set(deletedOrders.map((o) => o.id)));
    } else {
      setSelectedDeletedOrders(new Set());
    }
  };

  const handleDeleteSelectedDeletedOrders = async () => {
    const ids = Array.from(selectedDeletedOrders);
    if (ids.length === 0) return;
    if (!window.confirm(`Permanently delete ${ids.length} selected deleted order(s)? This action cannot be undone.`)) return;
    try {
      await axios.post(
        `${API_URL}/api/orders/batch-permanent`,
        { order_ids: ids },
        { headers: getAuthHeaders() }
      );
      setDeletedOrders((prev) => prev.filter((o) => !selectedDeletedOrders.has(o.id)));
      setSelectedDeletedOrders(new Set());
      toast.success(`${ids.length} deleted order(s) permanently deleted.`);
    } catch (err) {
      console.error('Failed to permanently delete selected orders:', err);
      toast.error(err.response?.data?.detail || 'Failed to permanently delete selected orders');
    }
  };

  const getImageUrl = (imageUrl) => {
    return resolveImageUrl(imageUrl, API_URL);
  };

  const exportOrdersPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.setTextColor(44, 85, 48);
    doc.text('Class One Savings - Orders Report', 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 24);
    doc.text(`Total orders: ${orders.length}`, 14, 30);

    const tableColumn = ['Order ID', 'Date', 'Seller', 'Buyer', 'Products', 'Total', 'Status'];
    const tableRows = orders.map((o) => {
      const productSummary = o.products && Array.isArray(o.products)
        ? o.products.map((p) => `${p.title || 'Item'} x${p.quantity || 1}`).join(', ')
        : o.productTitle || '-';
      return [
        o.id || '-',
        new Date(o.createdAt || o.created_at).toLocaleDateString(),
        o.sellerName || '-',
        o.buyerName || '-',
        productSummary,
        formatCurrency(o.total || 0),
        o.status || '-',
      ];
    });

    autoTable(doc, {
      startY: 36,
      head: [tableColumn],
      body: tableRows,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [44, 85, 48] },
    });

    doc.save(`orders-report-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportQuickLoansPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.setTextColor(44, 85, 48);
    doc.text('Class One Savings - Quick Loans Report', 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 24);
    doc.text(`Total records: ${quickLoans.length}`, 14, 30);

    const tableColumn = ['ID', 'Date', 'Borrower', 'Amount', 'Purpose', 'Officer', 'Status'];
    const tableRows = quickLoans.map((q) => [
      q.id || '-',
      new Date(q.created_at).toLocaleDateString(),
      q.loan_name || '-',
      formatCurrency(q.amount || 0),
      q.purpose || '-',
      q.officer_name || '-',
      q.status || '-',
    ]);

    autoTable(doc, {
      startY: 36,
      head: [tableColumn],
      body: tableRows,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [212, 140, 112] },
    });

    doc.save(`quick-loans-report-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportDeletedOrdersPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.setTextColor(44, 85, 48);
    doc.text('Class One Savings - Deleted Orders Report', 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 24);
    doc.text(`Total deleted: ${deletedOrders.length}`, 14, 30);

    const tableColumn = ['Order ID', 'Date', 'Seller', 'Buyer', 'Total', 'Status', 'Deleted By'];
    const tableRows = deletedOrders.map((o) => [
      o.id || '-',
      new Date(o.createdAt || o.created_at).toLocaleDateString(),
      o.sellerName || '-',
      o.buyerName || '-',
      formatCurrency(o.total || 0),
      o.status || '-',
      o.deleted_by || '-',
    ]);

    autoTable(doc, {
      startY: 36,
      head: [tableColumn],
      body: tableRows,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [208, 90, 73] },
    });

    doc.save(`deleted-orders-report-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const uniqueSellers = React.useMemo(() => {
    const map = new Map();
    orders.forEach((o) => {
      if (o.sellerName) {
        const key = o.sellerName.toLowerCase();
        if (!map.has(key)) {
          map.set(key, {
            name: o.sellerName,
            orders: [],
          });
        }
        map.get(key).orders.push(o);
      }
    });
    return Array.from(map.values());
  }, [orders]);

  if (!isAdmin && !isTreasurer) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center">
        <Card className="p-8 text-center">
          <CardTitle className="text-[#D05A49] mb-2">Access Denied</CardTitle>
          <p className="text-[#5C665D]">Only treasurer and admin users can access this page.</p>
          <Button className="mt-4 bg-[#2C5530] text-white rounded-full" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <Toaster position="top-right" richColors />

      {dataLoading && (
        <div className="fixed top-16 left-0 right-0 bg-[#E8B25C]/20 text-[#E8B25C] p-2 text-center text-sm z-40">
          Loading data...
        </div>
      )}

      {/* Top Navigation */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-white/90 border-b border-[#E8EBE8]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img
                src="/logo.png"
                alt="Class One Logo"
                className="w-10 h-10 rounded-full object-cover"
              />
              <span className="text-lg font-bold font-['Manrope'] text-[#1E231F]">Services Management</span>
            </div>

            <div className="hidden md:flex items-center gap-1 flex-wrap">
              {SERVICES_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-2 rounded-full text-xs font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-[#2C5530] text-white'
                      : 'text-[#5C665D] hover:bg-[#E8EBE8]'
                  }`}
                >
                  <tab.icon className="w-4 h-4 inline mr-1" />
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/dashboard')}
                className="text-[#5C665D] hover:text-[#2C5530]"
                title="Back to Dashboard"
              >
                <Home className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={logout}
                className="text-[#5C665D] hover:text-[#D05A49]"
              >
                LogOut
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden border-t border-[#E8EBE8] bg-white px-4 py-2 flex gap-2 overflow-x-auto">
          {SERVICES_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap px-3 py-2 rounded-full text-xs font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-[#2C5530] text-white'
                  : 'text-[#5C665D] hover:bg-[#E8EBE8]'
              }`}
            >
              <tab.icon className="w-4 h-4 inline mr-1" />
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Orders Tab */}
        {activeTab === 'orders' && (
          <div className="space-y-6 animate-fade-in">
<div className="flex items-center justify-between flex-wrap gap-2">
               <div>
                 <h2 className="text-2xl font-bold font-['Manrope'] text-[#1E231F]">All Orders</h2>
                 <p className="text-sm text-[#5C665D]">Track buyers, sellers, and order statuses.</p>
               </div>
               <div className="flex items-center gap-2">
                 {selectedOrders.size > 0 && (
                   <Button
                     variant="outline"
                     className="border-[#D05A49] text-[#D05A49] rounded-full"
                     onClick={handlePermanentDeleteSelected}
                   >
                     <Trash2 className="w-4 h-4 mr-2" />
                     Delete Selected ({selectedOrders.size})
                   </Button>
                 )}
                 {orders.length > 0 && (
                   <Button
                     variant="outline"
                     onClick={exportOrdersPDF}
                     className="border-[#E8EBE8] rounded-full"
                   >
                     <FileDown className="w-4 h-4 mr-2" />
                     Export PDF
                   </Button>
                 )}
               </div>
             </div>

            <Card className="bg-white border border-[#E8EBE8] shadow-sm overflow-x-auto">
              <CardContent className="p-0">
                <div className="w-full">
<table className="w-full">
                     <thead>
                       <tr className="border-b border-[#E8EBE8] bg-[#FAFAF8]">
                         <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap w-10">
                           <Checkbox
                             checked={orders.length > 0 && orders.every((o) => selectedOrders.has(o.id))}
                             onCheckedChange={(checked) => {
                               if (checked) {
                                 setSelectedOrders(new Set(orders.map((o) => o.id)));
                               } else {
                                 setSelectedOrders(new Set());
                               }
                             }}
                           />
                         </th>
                         <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">Date</th>
                         <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">Seller</th>
                         <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">Customer</th>
                         <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">Products</th>
                         <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">Total</th>
                         <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">Status</th>
                         <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">Contact</th>
                         <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">Actions</th>
                       </tr>
                     </thead>
                     <tbody>
                       {orders.map((order) => {
                         const productSummary = order.products && Array.isArray(order.products)
                           ? order.products.map((p) => `${p.title || 'Item'} x${p.quantity || 1}`).join(', ')
                           : order.productTitle || '-';
                         const waUrl = order.buyerPhone
                           ? buildWhatsAppUrl(order.buyerPhone, `Hello ${order.buyerName}, your order is being reviewed.`)
                           : null;
                         return (
                           <tr key={order.id} className="border-b border-[#E8EBE8] hover:bg-[#F5F7F5]">
                             <td className="py-3 px-3 text-xs text-[#1E231F] whitespace-nowrap">
                               <Checkbox
                                 checked={selectedOrders.has(order.id)}
                                 onCheckedChange={(checked) => {
                                   setSelectedOrders((prev) => {
                                     const next = new Set(prev);
                                     if (checked) {
                                       next.add(order.id);
                                     } else {
                                       next.delete(order.id);
                                     }
                                     return next;
                                   });
                                 }}
                               />
</td>
                             <td className="py-3 px-3 text-xs text-[#1E231F] whitespace-nowrap">
                               {new Date(order.createdAt || order.created_at).toLocaleDateString()}
                             </td>
                            <td className="py-3 px-3 text-xs font-medium text-[#2C5530] whitespace-nowrap">{order.sellerName || '-'}</td>
                            <td className="py-3 px-3 text-xs text-[#1E231F] whitespace-nowrap">
                              {order.buyerName || '-'}{order.buyerPhone && <span className="text-[#5C665D]"> ({order.buyerPhone})</span>}
                            </td>
                            <td className="py-3 px-3 text-xs text-[#5C665D]">
                              <div className="max-w-[220px] truncate" title={productSummary}>{productSummary}</div>
                            </td>
                            <td className="py-3 px-3 text-xs font-semibold text-[#1E231F] font-numbers whitespace-nowrap">
                              {formatCurrency(order.total || 0)}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <Badge
                                className={
                                  order.status === 'approved'
                                    ? 'bg-[#347242]/20 text-[#347242] border-[#347242]/30'
                                    : order.status === 'rejected'
                                    ? 'bg-[#D05A49]/20 text-[#D05A49] border-[#D05A49]/30'
                                    : 'bg-[#E8B25C]/20 text-[#E8B25C] border-[#E8B25C]/30'
                                }
                              >
                                <span className="text-[10px]">{order.status === 'pending' && <Clock className="w-2.5 h-2.5 inline mr-0.5" />}{order.status === 'approved' && <CheckCircle className="w-2.5 h-2.5 inline mr-0.5" />}{order.status === 'rejected' && <XCircle className="w-2.5 h-2.5 inline mr-0.5" />}{order.status || 'pending'}</span>
                              </Badge>
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex gap-1">
                                {order.buyerPhone && (
                                  <a href={`tel:${order.buyerPhone}`} className="text-[#2C5530] hover:text-[#214024]" title="Call">
                                    <Phone className="w-3.5 h-3.5" />
                                  </a>
                                )}
                                {order.buyerEmail && (
                                  <a href={`mailto:${order.buyerEmail}`} className="text-[#D48C70] hover:text-[#BD7B60]" title="Email">
                                    <Mail className="w-3.5 h-3.5" />
                                  </a>
                                )}
                                {waUrl && (
                                  <a href={waUrl} target="_blank" rel="noopener noreferrer" className="text-[#25D366] hover:text-[#1EA852]" title="WhatsApp">
                                    <MessageCircle className="w-3.5 h-3.5" />
                                  </a>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex gap-1 flex-wrap">
                                {order.status === 'pending' ? (
                                  <>
                                    <Button
                                      size="sm"
                                      className="bg-[#2C5530] text-white hover:bg-[#214024] rounded-full text-[10px] h-7 px-2"
                                      onClick={() => handleOrderStatusChange(order.id, 'approved')}
                                    >
                                      Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-[#D05A49] text-[#D05A49] rounded-full text-[10px] h-7 px-2"
                                      onClick={() => handleOrderStatusChange(order.id, 'rejected')}
                                    >
                                      Reject
                                    </Button>
                                  </>
                                ) : (
                                  <span className="text-[10px] text-[#5C665D]">—</span>
                                )}
<Button
      size="sm"
      variant="outline"
      className="border-[#2C5530] text-[#2C5530] rounded-full text-[10px] h-7 px-2"
      onClick={() => handleDownloadOrderReceipt(order)}
      title="Download receipt"
    >
      <FileDown className="w-3.5 h-3.5 mr-1" />
      Receipt
    </Button>
    {isTreasurer && (
      <Button
        size="sm"
        variant="outline"
        className="border-[#D05A49] text-[#D05A49] rounded-full text-[10px] h-7 px-2"
        onClick={() => handlePermanentDeleteOrder(order.id)}
        title="Permanently delete order"
      >
        <Trash2 className="w-3.5 h-3.5 mr-1" />
        Delete
      </Button>
    )}
  </div>
</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {orders.length === 0 && (
                    <p className="text-center text-[#5C665D] py-8">No orders found</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Sellers & Products Tab */}
        {activeTab === 'sellers' && (
          <div className="space-y-6 animate-fade-in">
<div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h2 className="text-2xl font-bold font-['Manrope'] text-[#1E231F]">Sellers & Products</h2>
                    <p className="text-sm text-[#5C665D]">All products listed by sellers in the marketplace.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedProducts.size > 0 && (
                      <Button
                        variant="outline"
                        className="border-[#D05A49] text-[#D05A49] rounded-full"
                        onClick={handleDeleteSelectedProducts}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Delete Selected ({selectedProducts.size})
                      </Button>
                    )}
                    {uniqueSellers.length > 0 && (
                      <Button
                        variant="outline"
                        className="border-[#D05A49] text-[#D05A49] rounded-full text-xs"
                        onClick={handleDeleteAllSellers}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Delete All Sellers
                      </Button>
                    )}
                    {uniqueSellers.length > 0 && (
                      <Button
                        variant="outline"
                        onClick={() => exportSellerReceiptPDF(uniqueSellers)}
                        className="border-[#2C5530] text-[#2C5530] rounded-full text-xs"
                      >
                        <FileDown className="w-4 h-4 mr-1" />
                        Download Seller Receipt
                      </Button>
                    )}
                  </div>
                </div>

              <Card className="bg-white border border-[#E8EBE8] shadow-sm overflow-x-auto">
                <CardContent className="p-0">
                  <div className="w-full">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[#E8EBE8] bg-[#FAFAF8]">
                          <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap w-10">
                            <Checkbox
                              checked={allProducts.length > 0 && allProducts.every((p) => selectedProducts.has(p.id))}
                              onCheckedChange={(checked) => handleSelectAllProducts(checked)}
                            />
                          </th>
                          <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">Product</th>
                          <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">Category</th>
                          <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">Price</th>
                          <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">Seller</th>
                          <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">Status</th>
                          <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">Listed</th>
                          <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allProducts.map((product) => (
                          <tr key={product.id} className="border-b border-[#E8EBE8] hover:bg-[#F5F7F5]">
                            <td className="py-3 px-3 text-xs text-[#1E231F] whitespace-nowrap">
                              <Checkbox
                                checked={selectedProducts.has(product.id)}
                                onCheckedChange={(checked) => handleToggleProduct(product.id)}
                              />
                            </td>
                            <td className="py-3 px-3 text-xs font-medium text-[#1E231F] whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                {product.image_url && (
                                  <img
                                    src={getImageUrl(product.image_url)}
                                    alt={product.title}
                                    className="h-8 w-8 rounded object-cover"
                                  />
                                )}
                                <span className="truncate max-w-[200px]">{product.title}</span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-xs text-[#5C665D] whitespace-nowrap">
                              <Badge variant="secondary" className="bg-[#E8F0E3] text-[#2C5530]">{product.category || '-'}</Badge>
                            </td>
                            <td className="py-3 px-3 text-xs font-semibold text-[#1E231F] font-numbers whitespace-nowrap">
                              UGX {Number(product.price || 0).toLocaleString()}
                            </td>
                            <td className="py-3 px-3 text-xs font-medium text-[#2C5530] whitespace-nowrap">
                              {product.seller_name || product.sellerName || 'Unknown'}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <Badge
                                className={
                                  product.sold_out
                                    ? 'bg-[#D05A49]/20 text-[#D05A49] border-[#D05A49]/30'
                                    : 'bg-[#347242]/20 text-[#347242] border-[#347242]/30'
                                }
                              >
                                <span className="text-[10px]">{product.sold_out ? 'Sold Out' : 'Available'}</span>
                              </Badge>
                            </td>
                            <td className="py-3 px-3 text-xs text-[#5C665D] whitespace-nowrap">
                              {new Date(product.created_at || product.createdAt).toLocaleDateString()}
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex gap-1 flex-wrap">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className={product.sold_out
                                    ? 'border-[#2C5530] text-[#2C5530] text-[10px] h-7 px-2'
                                    : 'border-[#C57A17] text-[#C57A17] text-[10px] h-7 px-2'}
                                  onClick={() => handleToggleSoldOut(product)}
                                >
                                  {product.sold_out ? 'Mark Available' : 'Mark Sold Out'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-[#D05A49] text-[#D05A49] text-[10px] h-7 px-2"
                                  onClick={() => handleDeleteProduct(product.id)}
                                >
                                  Delete
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {allProducts.length === 0 && (
                      <p className="text-center text-[#5C665D] py-8">No products found. Products will appear here once sellers list items.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
          </div>
        )}

        {/* Quick Loans Tab */}
        {activeTab === 'quick-loans' && (
          <div className="space-y-6 animate-fade-in">
<div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-2xl font-bold font-['Manrope'] text-[#1E231F]">Quick Loans</h2>
                    <p className="text-sm text-[#5C665D]">All quick loan requests — review and approve or reject.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedQuickLoans.size > 0 && (
                      <Button
                        variant="outline"
                        className="border-[#D05A49] text-[#D05A49] rounded-full"
                        onClick={handleDeleteSelectedQuickLoans}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Delete Selected ({selectedQuickLoans.size})
                      </Button>
                    )}
                    {quickLoans.length > 0 && (
                      <Button
                        variant="outline"
                        onClick={exportQuickLoansPDF}
                        className="border-[#E8EBE8] rounded-full whitespace-nowrap"
                      >
                        <FileDown className="w-4 h-4 mr-2" />
                        Export PDF
                      </Button>
                    )}
                  </div>
                </div>

            <Card className="bg-white border border-[#E8EBE8] shadow-sm overflow-x-auto">
              <CardContent className="p-0">
                <div className="w-full">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#E8EBE8] bg-[#FAFAF8]">
                        <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap w-10">
                          <Checkbox
                            checked={quickLoans.length > 0 && quickLoans.every((q) => selectedQuickLoans.has(q.id))}
                            onCheckedChange={(checked) => handleSelectAllQuickLoans(checked)}
                          />
                        </th>
                        <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">Date</th>
                        <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">Borrower</th>
                        <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">Amount</th>
                        <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <span>Purpose</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowQuickLoanPurpose((prev) => !prev)}
                              className="text-[10px] h-5 px-1.5"
                            >
                              {showQuickLoanPurpose ? 'Hide' : 'Show'}
                            </Button>
                          </div>
                        </th>
                        <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <span>Officer</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowQuickLoanOfficer((prev) => !prev)}
                              className="text-[10px] h-5 px-1.5"
                            >
                              {showQuickLoanOfficer ? 'Hide' : 'Show'}
                            </Button>
                          </div>
                        </th>
                        <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">Collateral</th>
                        <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">Status</th>
                        <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quickLoans.map((q) => (
                        <tr key={q.id} className="border-b border-[#E8EBE8] hover:bg-[#F5F7F5]">
                          <td className="py-3 px-3 text-xs text-[#1E231F] whitespace-nowrap">
                            <Checkbox
                              checked={selectedQuickLoans.has(q.id)}
                              onCheckedChange={(checked) => handleToggleQuickLoan(q.id)}
                            />
                          </td>
                          <td className="py-3 px-3 text-xs text-[#1E231F] whitespace-nowrap">
                            {new Date(q.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-3 text-xs font-medium text-[#1E231F] whitespace-nowrap">{q.loan_name || '-'}</td>
                          <td className="py-3 px-3 text-xs font-semibold text-[#D48C70] font-numbers whitespace-nowrap">
                            {formatCurrency(q.amount || 0)}
                          </td>
                          {showQuickLoanPurpose && (
                            <td className="py-3 px-3 text-xs text-[#5C665D]">{q.purpose || '-'}</td>
                          )}
                          {showQuickLoanOfficer && (
                            <td className="py-3 px-3 text-xs text-[#5C665D] whitespace-nowrap">{q.officer_name || '-'}</td>
                          )}
                          <td className="py-3 px-3 text-xs text-[#5C665D] whitespace-nowrap">
                            {q.is_guaranteed ? (
                              <Badge className="bg-[#2C5530]/10 text-[#2C5530] text-[10px]">Guaranteed</Badge>
                            ) : (
                              <span className="text-[10px]">{q.collateral || '-'}</span>
                            )}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <Badge
                              className={
                                q.status === 'approved'
                                  ? 'bg-[#347242]/20 text-[#347242] border-[#347242]/30'
                                  : q.status === 'rejected'
                                  ? 'bg-[#D05A49]/20 text-[#D05A49] border-[#D05A49]/30'
                                  : 'bg-[#E8B25C]/20 text-[#E8B25C] border-[#E8B25C]/30'
                              }
                            >
                              <span className="text-[10px]">{q.status === 'pending_treasurer' && <Clock className="w-2.5 h-2.5 inline mr-0.5" />}{q.status === 'approved' && <CheckCircle className="w-2.5 h-2.5 inline mr-0.5" />}{q.status === 'rejected' && <XCircle className="w-2.5 h-2.5 inline mr-0.5" />}{q.status || 'pending'}</span>
                            </Badge>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex flex-wrap gap-1">
                              {q.status === 'pending_treasurer' ? (
                                <>
                                  <Button
                                    size="sm"
                                    className="bg-[#2C5530] text-white hover:bg-[#214024] rounded-full text-[10px] h-7 px-2"
                                    onClick={() => handleApproveQuickLoan(q.id, true)}
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-[#D05A49] text-[#D05A49] rounded-full text-[10px] h-7 px-2"
                                    onClick={() => handleApproveQuickLoan(q.id, false)}
                                  >
                                    Reject
                                  </Button>
                                </>
                              ) : (
                                <span className="text-[10px] text-[#5C665D]">—</span>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-[#D05A49] text-[#D05A49] rounded-full text-[10px] h-7 px-2"
                                onClick={() => handleDeleteQuickLoan(q.id)}
                                title="Delete quick loan"
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-1" />
                                Delete
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-[#5C665D] hover:text-[#2C5530] h-7 w-7 p-0"
                                onClick={() => handleDownloadQuickLoanPDF(q)}
                                title="Download loan agreement"
                              >
                                <FileDown className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {quickLoans.length === 0 && (
                    <p className="text-center text-[#5C665D] py-8">No quick loan requests found</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Deleted Orders Tab */}
        {activeTab === 'deleted' && (
          <div className="space-y-6 animate-fade-in">
<div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h2 className="text-2xl font-bold font-['Manrope'] text-[#1E231F]">Deleted Orders</h2>
                    <p className="text-sm text-[#5C665D]">Archived order records that were removed from the active list.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedDeletedOrders.size > 0 && (
                      <Button
                        variant="outline"
                        className="border-[#D05A49] text-[#D05A49] rounded-full"
                        onClick={handleDeleteSelectedDeletedOrders}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Delete Selected ({selectedDeletedOrders.size})
                      </Button>
                    )}
                    {deletedOrders.length > 0 && (
                      <Button
                        variant="outline"
                        onClick={exportDeletedOrdersPDF}
                        className="border-[#E8EBE8] rounded-full"
                      >
                        <FileDown className="w-4 h-4 mr-2" />
                        Export PDF
                      </Button>
                    )}
                  </div>
                </div>

            <Card className="bg-white border border-[#E8EBE8] shadow-sm overflow-x-auto">
              <CardContent className="p-0">
                <div className="w-full">
                  <table className="w-full">
<thead>
                       <tr className="border-b border-[#E8EBE8] bg-[#FAFAF8]">
                         <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap w-10">
                           <Checkbox
                             checked={deletedOrders.length > 0 && deletedOrders.every((o) => selectedDeletedOrders.has(o.id))}
                             onCheckedChange={(checked) => handleSelectAllDeletedOrders(checked)}
                           />
                         </th>
                         <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">Date</th>
                         <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">Seller</th>
                         <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">Buyer</th>
                         <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">Products</th>
                         <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">Total</th>
                         <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">Status</th>
                         <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">Deleted By</th>
                         {isTreasurer && (
                           <th className="text-left py-3 px-3 text-xs font-semibold text-[#5C665D] whitespace-nowrap">Actions</th>
                         )}
                       </tr>
                     </thead>
                    <tbody>
{deletedOrders.map((order) => {
                         const productSummary = order.products && Array.isArray(order.products)
                           ? order.products.map((p) => `${p.title || 'Item'} x${p.quantity || 1}`).join(', ')
                           : order.productTitle || '-';
                         return (
                           <tr key={order.id} className="border-b border-[#E8EBE8] hover:bg-[#F5F7F5]">
                             <td className="py-3 px-3 text-xs text-[#1E231F] whitespace-nowrap">
                               <Checkbox
                                 checked={selectedDeletedOrders.has(order.id)}
                                 onCheckedChange={(checked) => handleToggleDeletedOrder(order.id)}
                               />
                             </td>
                             <td className="py-3 px-3 text-xs text-[#1E231F] whitespace-nowrap">
                               {new Date(order.createdAt || order.created_at).toLocaleDateString()}
                             </td>
                            <td className="py-3 px-3 text-xs font-medium text-[#2C5530] whitespace-nowrap">{order.sellerName || '-'}</td>
                            <td className="py-3 px-3 text-xs text-[#1E231F] whitespace-nowrap">{order.buyerName || '-'}</td>
                            <td className="py-3 px-3 text-xs text-[#5C665D]">
                              <div className="max-w-[200px] truncate" title={productSummary}>{productSummary}</div>
                            </td>
                            <td className="py-3 px-3 text-xs font-semibold text-[#1E231F] font-numbers whitespace-nowrap">
                              {formatCurrency(order.total || 0)}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <Badge className="bg-[#D05A49]/20 text-[#D05A49] border-[#D05A49]/30">
                                <span className="text-[10px]">{order.status || 'deleted'}</span>
                              </Badge>
                            </td>
                            <td className="py-3 px-3 text-xs text-[#5C665D] whitespace-nowrap">{order.deleted_by || '-'}</td>
                            {isTreasurer && (
                              <td className="py-3 px-3">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-[#D05A49] text-[#D05A49] hover:bg-[#FDE8E7] rounded-full text-[10px] h-7 px-2"
                                  onClick={() => handlePermanentDeleteOrder(order.id)}
                                >
                                  <Trash2 className="w-3 h-3 mr-1" />
                                  Delete
                                </Button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {deletedOrders.length === 0 && (
                    <p className="text-center text-[#5C665D] py-8">No deleted orders found</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};

export default ServicesManagement;
